#!/bin/sh
# Entrypoint của image API (CV20).
# RUN_MIGRATIONS=true  -> chạy `prisma migrate deploy` trước khi start. Migration lỗi thì container
#                         thoát mã khác 0, không phục vụ traffic (fail-fast), image cũ vẫn chạy.
# Mặc định (false)     -> bỏ qua migration, dùng khi chạy nhiều instance hoặc chạy migration riêng.
set -eu

if [ "${RUN_MIGRATIONS:-false}" = "true" ]; then
  echo "[entrypoint] Chạy prisma migrate deploy..."
  ./node_modules/.bin/prisma migrate deploy
  echo "[entrypoint] Migration xong."
fi

exec "$@"
