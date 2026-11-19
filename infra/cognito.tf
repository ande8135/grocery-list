# Sign-in: a Cognito user pool that only federates to external identity providers
# (Google, Apple, any OIDC provider). Nobody creates a password here; Cognito
# just brokers the sign-in and issues the tokens the API checks.

resource "aws_cognito_user_pool" "main" {
  name = var.project_name

  # No local sign-up: accounts only come from the federated providers.
  admin_create_user_config {
    allow_admin_create_user_only = true
  }
}

resource "random_id" "cognito_domain" {
  byte_length = 4
}

# Hosted sign-in domain: https://<prefix>.auth.<region>.amazoncognito.com
resource "aws_cognito_user_pool_domain" "main" {
  domain       = "${var.project_name}-${random_id.cognito_domain.hex}"
  user_pool_id = aws_cognito_user_pool.main.id
}

locals {
  sign_in_providers = concat(
    var.google_client_id != "" ? [{ id = "Google", label = "Google" }] : [],
    var.apple_services_id != "" ? [{ id = "SignInWithApple", label = "Apple" }] : [],
    [for name, p in var.oidc_providers : { id = name, label = coalesce(p.label, name) }],
  )

  callback_urls = concat(
    ["https://${aws_cloudfront_distribution.site.domain_name}/"],
    var.allow_localhost_signin ? ["http://localhost:5173/"] : [],
  )
}

resource "aws_cognito_identity_provider" "google" {
  count         = var.google_client_id != "" ? 1 : 0
  user_pool_id  = aws_cognito_user_pool.main.id
  provider_name = "Google"
  provider_type = "Google"

  provider_details = {
    client_id        = var.google_client_id
    client_secret    = var.google_client_secret
    authorize_scopes = "openid email profile"
  }

  attribute_mapping = {
    email    = "email"
    name     = "name"
    username = "sub"
  }
}

resource "aws_cognito_identity_provider" "apple" {
  count         = var.apple_services_id != "" ? 1 : 0
  user_pool_id  = aws_cognito_user_pool.main.id
  provider_name = "SignInWithApple"
  provider_type = "SignInWithApple"

  provider_details = {
    client_id        = var.apple_services_id
    team_id          = var.apple_team_id
    key_id           = var.apple_key_id
    private_key      = var.apple_private_key
    authorize_scopes = "email name"
  }

  attribute_mapping = {
    email    = "email"
    name     = "name"
    username = "sub"
  }
}

resource "aws_cognito_identity_provider" "oidc" {
  for_each      = var.oidc_providers
  user_pool_id  = aws_cognito_user_pool.main.id
  provider_name = each.key
  provider_type = "OIDC"

  provider_details = {
    client_id                 = each.value.client_id
    client_secret             = var.oidc_client_secrets[each.key]
    oidc_issuer               = each.value.issuer
    authorize_scopes          = "openid email profile"
    attributes_request_method = "GET"
  }

  attribute_mapping = {
    email    = "email"
    name     = "name"
    username = "sub"
  }
}

# The web app: a public client (no secret) using the authorization-code flow with PKCE.
resource "aws_cognito_user_pool_client" "web" {
  name            = "${var.project_name}-web"
  user_pool_id    = aws_cognito_user_pool.main.id
  generate_secret = false

  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  callback_urls                        = local.callback_urls
  logout_urls                          = local.callback_urls
  supported_identity_providers         = [for p in local.sign_in_providers : p.id]

  explicit_auth_flows           = ["ALLOW_REFRESH_TOKEN_AUTH"]
  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true

  id_token_validity      = 60
  access_token_validity  = 60
  refresh_token_validity = 30
  token_validity_units {
    id_token      = "minutes"
    access_token  = "minutes"
    refresh_token = "days"
  }

  # The providers must exist before the client can list them.
  depends_on = [
    aws_cognito_identity_provider.google,
    aws_cognito_identity_provider.apple,
    aws_cognito_identity_provider.oidc,
  ]

  lifecycle {
    precondition {
      condition     = length(local.sign_in_providers) > 0
      error_message = "Configure at least one sign-in provider (google_client_id, apple_services_id, or oidc_providers)."
    }
  }
}
