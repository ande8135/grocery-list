# Copy to terraform.tfvars (git-ignored) and fill in the providers you want.
# Leave a provider out to disable it. At least one is required.
# After the first apply, register the `idp_redirect_uri` output with each provider.

# Google: https://console.cloud.google.com/apis/credentials  (OAuth client, type "Web application")
google_client_id     = ""
google_client_secret = ""

# Apple: Services ID + Sign in with Apple key (https://developer.apple.com/account/resources)
apple_services_id = ""
apple_team_id     = ""
apple_key_id      = ""
apple_private_key = "" # contents of the .p8 file

# Any other OpenID Connect provider (Microsoft shown as an example):
# oidc_providers = {
#   Microsoft = {
#     issuer    = "https://login.microsoftonline.com/<tenant-id>/v2.0"
#     client_id = "..."
#     label     = "Microsoft"
#   }
# }
# oidc_client_secrets = { Microsoft = "..." }
