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

# ---------- Sign-in providers ----------
# Configure at least one. Leave a provider's id empty ("") to disable it.
# Redirect URI to register with each provider: see the `idp_redirect_uri` output.

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
