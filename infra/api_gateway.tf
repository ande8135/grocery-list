resource "aws_apigatewayv2_api" "api" {
  name          = "${var.project_name}-api"
  protocol_type = "HTTP"
  # No CORS config: the browser only ever talks to the CloudFront domain (same origin).
}

resource "aws_apigatewayv2_integration" "api" {
  api_id                 = aws_apigatewayv2_api.api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
}

# A request is authorized only if it carries CloudFront's secret header AND a valid
# Cognito ID token. If either header is absent, API Gateway rejects the call (401)
# without invoking any Lambda.
resource "aws_apigatewayv2_authorizer" "origin_verify" {
  api_id                            = aws_apigatewayv2_api.api.id
  name                              = "cloudfront-and-signin"
  authorizer_type                   = "REQUEST"
  authorizer_uri                    = aws_lambda_function.authorizer.invoke_arn
  authorizer_payload_format_version = "2.0"
  enable_simple_responses           = true
  identity_sources                  = ["$request.header.x-origin-verify", "$request.header.Authorization"]
  authorizer_result_ttl_in_seconds  = 60
}

locals {
  # Keep in sync with backend/src/handler.ts (a unit test fails if they drift).
  routes = [
    "GET /api/me",
    "POST /api/households",
    "GET /api/households/{hid}",
    "POST /api/households/{hid}/invites",
    "DELETE /api/households/{hid}/members/{uid}",
    "POST /api/households/{hid}/lists",
    "PATCH /api/households/{hid}/lists/{lid}",
    "DELETE /api/households/{hid}/lists/{lid}",
    "GET /api/households/{hid}/lists/{lid}/items",
    "POST /api/households/{hid}/lists/{lid}/items",
    "POST /api/households/{hid}/lists/{lid}/items/clear-checked",
    "PATCH /api/households/{hid}/lists/{lid}/items/{id}",
    "DELETE /api/households/{hid}/lists/{lid}/items/{id}",
    "GET /api/invites/{token}",
    "POST /api/invites/{token}/accept",
  ]
}

resource "aws_apigatewayv2_route" "routes" {
  for_each           = toset(local.routes)
  api_id             = aws_apigatewayv2_api.api.id
  route_key          = each.value
  target             = "integrations/${aws_apigatewayv2_integration.api.id}"
  authorization_type = "CUSTOM"
  authorizer_id      = aws_apigatewayv2_authorizer.origin_verify.id
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true

  default_route_settings {
    throttling_rate_limit  = var.api_throttle_rate_limit
    throttling_burst_limit = var.api_throttle_burst_limit
  }
}

resource "aws_lambda_permission" "api_invoke" {
  statement_id  = "AllowApiGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}

resource "aws_lambda_permission" "authorizer_invoke" {
  statement_id  = "AllowApiGatewayInvokeAuthorizer"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.authorizer.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/authorizers/${aws_apigatewayv2_authorizer.origin_verify.id}"
}
