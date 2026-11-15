#!/usr/bin/env bash
# Smoke test sau deploy (CV20).
# Dùng:  scripts/smoke-test.sh <API_URL> [WEB_URL]
# Thử lại tối đa SMOKE_RETRIES lần (mặc định 30, cách nhau 10 giây) vì Render cần thời gian
# kéo image và khởi động. Hết số lần thử mà vẫn lỗi thì thoát mã 1 (fail-fast).
set -uo pipefail

API_URL="${1:-}"
WEB_URL="${2:-}"
RETRIES="${SMOKE_RETRIES:-30}"
DELAY="${SMOKE_DELAY:-10}"

if [ -z "$API_URL" ]; then
  echo "Thiếu API_URL. Dùng: $0 <API_URL> [WEB_URL]" >&2
  exit 2
fi
API_URL="${API_URL%/}"
WEB_URL="${WEB_URL%/}"

check() { # check <tên> <url> <chuỗi phải có trong body>
  local name="$1" url="$2" expect="$3" body code
  for i in $(seq 1 "$RETRIES"); do
    body="$(curl -sS -m 15 -w '\n%{http_code}' "$url" 2>/dev/null)" || body=$'\n000'
    code="${body##*$'\n'}"
    body="${body%$'\n'*}"
    if [ "$code" = "200" ] && printf '%s' "$body" | grep -q "$expect"; then
      echo "OK   $name ($url) sau $i lần thử"
      return 0
    fi
    echo "...  $name chưa sẵn sàng (HTTP $code), thử lại $i/$RETRIES"
    sleep "$DELAY"
  done
  echo "FAIL $name ($url)" >&2
  return 1
}

fail=0
check "API liveness"  "$API_URL/health"       '"status":"ok"'    || fail=1
check "API readiness" "$API_URL/health/ready" '"database":"up"'  || fail=1
check "API menu"      "$API_URL/products"     '\['               || fail=1
if [ -n "$WEB_URL" ]; then
  check "Web trang chủ" "$WEB_URL/" '<html' || fail=1
fi

if [ "$fail" -ne 0 ]; then
  echo "SMOKE TEST THẤT BẠI. Rollback: chạy workflow 'Rollback' với image_tag của bản trước." >&2
  exit 1
fi
echo "SMOKE TEST ĐẠT."
