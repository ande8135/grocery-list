# Copy to terraform.tfvars (git-ignored) and fill in.

# Pick the sign-in domain yourself so you can register Google's redirect URI BEFORE the
# first apply. Must be unique in the region; no "aws", "amazon" or "cognito" in it.
# The redirect URI to register will be:
#   https://<this prefix>.auth.<aws_region>.amazoncognito.com/oauth2/idpresponse
cognito_domain_prefix = "" # e.g. "smith-groceries"

# People can also register with an email + password (Cognito emails them a code). Set false to
# allow only Google.
allow_email_password = true

# Google: https://console.cloud.google.com/apis/credentials  (OAuth client, type "Web application")
google_client_id     = ""
google_client_secret = ""

# --- Not used for now; fill in later to add them (no other changes needed) ---

# Apple: Services ID + Sign in with Apple key (https://developer.apple.com/account/resources)
# apple_services_id = ""
# apple_team_id     = ""
# apple_key_id      = ""
# apple_private_key = "" # contents of the .p8 file

# Any other OpenID Connect provider (Microsoft shown as an example):
# oidc_providers = {
#   Microsoft = {
#     issuer    = "https://login.microsoftonline.com/<tenant-id>/v2.0"
#     client_id = "..."
#     label     = "Microsoft"
#   }
# }
# oidc_client_secrets = { Microsoft = "..." }
