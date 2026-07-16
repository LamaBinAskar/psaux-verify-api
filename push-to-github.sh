#!/bin/bash
# Usage: bash push-to-github.sh https://github.com/USERNAME/psaux-verify-api.git
set -e
REPO="$1"
if [ -z "$REPO" ]; then
  echo "❌  أعطني رابط مستودع GitHub. مثال:"
  echo "    bash push-to-github.sh https://github.com/USERNAME/psaux-verify-api.git"
  exit 1
fi
cd "$(dirname "$0")"
git remote remove origin 2>/dev/null || true
git remote add origin "$REPO"
git branch -M main
echo "⏫  جاري الرفع إلى $REPO ..."
git push -u origin main
echo ""
echo "✅  تم الرفع! الحين روح Render.com → New + → Web Service → اختر هذا المستودع."
