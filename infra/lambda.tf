# Both functions ship from the same esbuild output (backend/dist).
# Run `npm run build -w backend` before `terraform plan/apply` (scripts/deploy.sh does this).
data "archive_file" "backend" {
  type        = "zip"
  source_dir  = "${path.module}/../backend/dist"
  output_path = "${path.module}/.build/backend.zip"
}

# Shared secret that CloudFront attaches to every request it sends to the API.
# It lives in Terraform state, so keep the state private. Rotate with:
#   terraform apply -replace=random_password.origin_verify
resource "random_password" "origin_verify" {
  length  = 48
  special = false
}

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

# ---------- API function ----------

resource "aws_iam_role" "api" {
  name               = "${var.project_name}-api"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

data "aws_iam_policy_document" "api" {
  statement {
    actions = [
      "dynamodb:GetItem",
      "dynamodb:Query",
      "dynamodb:PutItem",
      "dynamodb:UpdateItem",
      "dynamodb:DeleteItem",
      "dynamodb:BatchWriteItem",
      "dynamodb:ConditionCheckItem", # transactions are authorized by the underlying item actions
    ]
    resources = [aws_dynamodb_table.items.arn]
  }
}

resource "aws_iam_role_policy" "api" {
  name   = "dynamodb-access"
  role   = aws_iam_role.api.id
  policy = data.aws_iam_policy_document.api.json
}

# Calling Claude on Bedrock. Anthropic's Bedrock docs name this action but don't publish a resource ARN
# format, so the resource is "*" for now. The action only allows invoking models, nothing else in Bedrock.
# Once you know the ARN of the model in your account (it shows in the Bedrock console), narrow this.
data "aws_iam_policy_document" "bedrock" {
  statement {
    actions   = ["bedrock-mantle:CreateInference"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "api_bedrock" {
  count  = var.enable_categorization ? 1 : 0
  name   = "bedrock-invoke"
  role   = aws_iam_role.api.id
  policy = data.aws_iam_policy_document.bedrock.json
}

resource "aws_iam_role_policy_attachment" "api_logs" {
  role       = aws_iam_role.api.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${var.project_name}-api"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "api" {
  function_name    = "${var.project_name}-api"
  role             = aws_iam_role.api.arn
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  handler          = "index.handler"
  filename         = data.archive_file.backend.output_path
  source_code_hash = data.archive_file.backend.output_base64sha256
  memory_size      = 256
  timeout          = 10

  environment {
    variables = merge(
      { TABLE_NAME = aws_dynamodb_table.items.name },
      # With these unset the API skips the model and every new item lands in "Other".
      var.enable_categorization ? {
        BEDROCK_MODEL_ID = var.bedrock_model_id
        BEDROCK_REGION   = var.bedrock_region != "" ? var.bedrock_region : var.aws_region
      } : {},
    )
  }

  depends_on = [aws_cloudwatch_log_group.api, aws_iam_role_policy_attachment.api_logs]
}

# ---------- Authorizer function (CloudFront secret header + Cognito sign-in token) ----------

resource "aws_iam_role" "authorizer" {
  name               = "${var.project_name}-authorizer"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "authorizer_logs" {
  role       = aws_iam_role.authorizer.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_cloudwatch_log_group" "authorizer" {
  name              = "/aws/lambda/${var.project_name}-authorizer"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "authorizer" {
  function_name    = "${var.project_name}-authorizer"
  role             = aws_iam_role.authorizer.arn
  runtime          = "nodejs22.x"
  architectures    = ["arm64"]
  handler          = "authorizer.handler"
  filename         = data.archive_file.backend.output_path
  source_code_hash = data.archive_file.backend.output_base64sha256
  memory_size      = 128
  timeout          = 5 # first call per container downloads Cognito's signing keys

  environment {
    variables = {
      ORIGIN_VERIFY_SECRET = random_password.origin_verify.result
      USER_POOL_ID         = aws_cognito_user_pool.main.id
      USER_POOL_CLIENT_ID  = aws_cognito_user_pool_client.web.id
    }
  }

  depends_on = [aws_cloudwatch_log_group.authorizer, aws_iam_role_policy_attachment.authorizer_logs]
}
