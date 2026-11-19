#!/usr/bin/env bash
# Build everything, apply the infrastructure, then publish the static site.
# Usage: ./scripts/deploy.sh            (prompts before applying)
#        ./scripts/deploy.sh -auto-approve
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Installing dependencies"
npm ci

echo "==> Running tests & type checks"
npm run typecheck
npm test

echo "==> Building backend (Lambda bundles) and frontend (static site)"
npm run build

echo "==> Applying infrastructure"
terraform -chdir=infra init -input=false
terraform -chdir=infra apply "$@"

BUCKET=$(terraform -chdir=infra output -raw site_bucket)
DIST_ID=$(terraform -chdir=infra output -raw cloudfront_distribution_id)
URL=$(terraform -chdir=infra output -raw site_url)

echo "==> Uploading site to s3://$BUCKET"
# Hashed assets can be cached forever; everything else must be revalidated.
aws s3 sync frontend/dist "s3://$BUCKET" --delete \
  --exclude "index.html" --exclude "manifest.webmanifest" --exclude "config.json" \
  --cache-control "public,max-age=31536000,immutable"
aws s3 cp frontend/dist/index.html "s3://$BUCKET/index.html" --cache-control "no-cache"
aws s3 cp frontend/dist/manifest.webmanifest "s3://$BUCKET/manifest.webmanifest" \
  --cache-control "no-cache" --content-type "application/manifest+json"

echo "==> Invalidating CloudFront cache"
aws cloudfront create-invalidation --distribution-id "$DIST_ID" --paths "/*" >/dev/null

echo
echo "Done! Open $URL on your phone, then Share -> Add to Home Screen."
