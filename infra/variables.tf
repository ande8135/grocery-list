variable "project_name" {
  description = "Prefix for resource names."
  type        = string
  default     = "grocery-list"
}

variable "aws_region" {
  description = "Region for the API, Lambda and DynamoDB. (CloudFront is global.)"
  type        = string
  default     = "us-east-1"
}

variable "cloudfront_price_class" {
  description = "CloudFront price class. PriceClass_100 = North America + Europe, the cheapest."
  type        = string
  default     = "PriceClass_100"
}

variable "api_throttle_rate_limit" {
  description = "Steady-state requests/second allowed through API Gateway. A cost/abuse backstop while the app is unauthenticated."
  type        = number
  default     = 20
}

variable "api_throttle_burst_limit" {
  description = "Burst requests allowed through API Gateway."
  type        = number
  default     = 40
}

variable "log_retention_days" {
  description = "CloudWatch log retention for the Lambdas."
  type        = number
  default     = 14
}

# ---------- Store sections (Amazon Bedrock) ----------

variable "enable_categorization" {
  description = <<-EOT
    Sort new items into store sections (Produce, Dairy & eggs, ...) with a small Claude model on Amazon Bedrock.
    Off by default because the model must first be enabled for your AWS account in the Bedrock console
    (Model access). Until then, leave this false: items just go in "Other". The model is only asked about
    items a household hasn't added before; it remembers the answer.
  EOT
  type        = bool
  default     = false
}

variable "bedrock_model_id" {
  description = "Bedrock model id used to pick the section. Claude Haiku 5.5 is the small, cheap one."
  type        = string
  default     = "anthropic.claude-haiku-5-5"
}

variable "bedrock_region" {
  description = "Region to call Bedrock in. Empty means the same as aws_region. Must be a region where the model is available."
  type        = string
  default     = ""
}

# ---------- Sign-in ----------
# Google and email + password are on by default. Leave a provider's id empty ("") to disable it.
# Redirect URI to register with each provider: see the `idp_redirect_uri` output.

variable "cognito_domain_prefix" {
  description = <<-EOT
    Prefix of the hosted sign-in domain: https://<prefix>.auth.<region>.amazoncognito.com
    Must be unique within the region. Choose it BEFORE the first apply and you can register the
    provider redirect URI (https://<prefix>.auth.<region>.amazoncognito.com/oauth2/idpresponse)
    up front. Leave empty to get "<project_name>-<random>".
  EOT
  type        = string
  default     = ""

  validation {
    condition     = var.cognito_domain_prefix == "" || can(regex("^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$", var.cognito_domain_prefix))
    error_message = "Use 1-63 lowercase letters, numbers and hyphens, not starting or ending with a hyphen."
  }

  validation {
    condition     = !can(regex("aws|amazon|cognito", var.cognito_domain_prefix))
    error_message = "Cognito doesn't allow \"aws\", \"amazon\" or \"cognito\" in the domain prefix."
  }
}

variable "allow_email_password" {
  description = "Let people register and sign in with an email address and password (Cognito verifies the email with a code)."
  type        = bool
  default     = true
}

variable "google_client_id" {
  description = "Google OAuth client ID (Google Cloud Console > Credentials > OAuth client, type Web)."
  type        = string
  default     = ""
}

variable "google_client_secret" {
  type      = string
  default   = ""
  sensitive = true
}

variable "apple_services_id" {
  description = "Apple Services ID (the identifier you enable Sign in with Apple on). Empty disables Apple."
  type        = string
  default     = ""
}

variable "apple_team_id" {
  type    = string
  default = ""
}

variable "apple_key_id" {
  description = "Key ID of the Sign in with Apple private key."
  type        = string
  default     = ""
}

variable "apple_private_key" {
  description = "Contents of the .p8 private key file."
  type        = string
  default     = ""
  sensitive   = true
}

variable "oidc_providers" {
  description = <<-EOT
    Any other OpenID Connect provider (Microsoft, Auth0, Okta, GitHub via a bridge, ...), keyed by a short name.
    Example: { Microsoft = { issuer = "https://login.microsoftonline.com/<tenant>/v2.0", client_id = "...", label = "Microsoft" } }
    Put each provider's secret in oidc_client_secrets under the same key.
  EOT
  type = map(object({
    issuer    = string
    client_id = string
    label     = optional(string)
  }))
  default = {}
}

variable "oidc_client_secrets" {
  type      = map(string)
  default   = {}
  sensitive = true
}

variable "allow_localhost_signin" {
  description = "Also allow http://localhost:5173 as a sign-in redirect, for local development against the real user pool."
  type        = bool
  default     = true
}
