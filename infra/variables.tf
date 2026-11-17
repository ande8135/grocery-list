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
