#!/usr/bin/env bash
set -e

# Publish dry-run and readiness check
# Usage: ./scripts/publish.sh

echo "=== npm whoami ==="
npm whoami 2>/dev/null || {
  echo "You are not logged into npm. Run: npm login"
  exit 1
}

echo ""
echo "=== npm publish --dry-run ==="
npm publish --dry-run --access public

echo ""
echo "Dry-run passed!"
echo ""
echo "To publish for real, run:"
echo "  npm publish --access public"
echo ""
echo "Requirements for real publish:"
echo "  - npm account with @forgecli organization access"
echo "  - 2FA enabled and OTP ready"
