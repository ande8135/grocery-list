# Sign-in: a Cognito user pool. People sign in with an external identity provider
# (Google, Apple, any OIDC provider) and/or register with an email + password
# (allow_email_password). Cognito's hosted pages handle all of it (registration, email
# verification, password reset) and issue the tokens the API checks.

resource "aws_cognito_user_pool" "main" {
  name = var.project_name

  # Email addresses are the usernames for password accounts. NOTE: changing this on an
  # existing pool replaces the pool (and loses its users).
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  # With this off, only federated sign-in works (nobody can self-register).
  admin_create_user_config {
    allow_admin_create_user_only = !var.allow_email_password
  }

  password_policy {
    minimum_length    = 10
    require_lowercase = true
    require_uppercase = true
    require_numbers   = true
    require_symbols   = false
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # Cognito's built-in email sender is limited to ~50 emails/day, plenty for a family.
  # For more, switch to SES with email_configuration { email_sending_account = "DEVELOPER" }.
}

# Only used when no cognito_domain_prefix is given.
resource "random_id" "cognito_domain" {
  count       = var.cognito_domain_prefix == "" ? 1 : 0
  byte_length = 4
}

locals {
  cognito_domain_prefix = var.cognito_domain_prefix != "" ? var.cognito_domain_prefix : "${var.project_name}-${try(random_id.cognito_domain[0].hex, "")}"
}

# Hosted sign-in domain: https://<prefix>.auth.<region>.amazoncognito.com
resource "aws_cognito_user_pool_domain" "main" {
  domain       = local.cognito_domain_prefix
  user_pool_id = aws_cognito_user_pool.main.id

  # The classic hosted pages work out of the box; the newer "managed login" needs branding set up first.
  managed_login_version = 1
}

locals {
  sign_in_providers = concat(
    var.google_client_id != "" ? [{ id = "Google", label = "Google" }] : [],
    var.apple_services_id != "" ? [{ id = "SignInWithApple", label = "Apple" }] : [],
    [for name, p in var.oidc_providers : { id = name, label = coalesce(p.label, name) }],
    # "COGNITO" = the hosted email + password form; listed last so social buttons come first.
    var.allow_email_password ? [{ id = "COGNITO", label = "email" }] : [],
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
      error_message = "Enable at least one way to sign in: allow_email_password, google_client_id, apple_services_id, or oidc_providers."
    }
  }
}
