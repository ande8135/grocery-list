output "site_url" {
  description = "Open this on your phones."
  value       = "https://${aws_cloudfront_distribution.site.domain_name}"
}

output "site_bucket" {
  description = "S3 bucket the built frontend is synced to."
  value       = aws_s3_bucket.site.bucket
}

output "cloudfront_distribution_id" {
  description = "Used by scripts/deploy.sh to invalidate the cache."
  value       = aws_cloudfront_distribution.site.id
}

output "api_direct_url" {
  description = "Direct API Gateway URL. Should answer 401 to any request (only CloudFront is allowed)."
  value       = aws_apigatewayv2_api.api.api_endpoint
}

output "table_name" {
  value = aws_dynamodb_table.items.name
}

output "idp_redirect_uri" {
  description = "Register this as the authorized redirect URI in Google / Apple / your OIDC provider."
  value       = "https://${aws_cognito_user_pool_domain.main.domain}.auth.${var.aws_region}.amazoncognito.com/oauth2/idpresponse"
}

output "user_pool_id" {
  value = aws_cognito_user_pool.main.id
}

output "user_pool_client_id" {
  value = aws_cognito_user_pool_client.web.id
}
