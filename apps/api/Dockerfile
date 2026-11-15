# syntax=docker/dockerfile:1.7
# Image production cho NestJS API (CV19). Build từ thư mục gốc repo:
#   docker build -f apps/api/Dockerfile -t brewlite-api:local .
# Image chạy bằng user không phải root, không chứa secret (cấu hình qua biến môi trường lúc chạy).

# ---------- build ----------
FROM node:22-alpine AS build

RUN apk add --no-cache libc6-compat openssl ca-certificates

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ENV CHECKPOINT_DISABLE=1
ENV PRISMA_HIDE_UPDATE_MESSAGE=1

RUN corepack enable && corepack prepare pnpm@12.14.0 --activate

WORKDIR /app

# Copy manifest trước để tận dụng layer cache khi chỉ source thay đổi.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store --filter @brewlite/api...

COPY apps/api apps/api

RUN pnpm --filter @brewlite/api prisma:generate \
 && pnpm --filter @brewlite/api build

# ---------- runtime ----------
FROM node:22-alpine AS runtime

RUN apk add --no-cache libc6-compat openssl ca-certificates

ENV NODE_ENV=production
ENV PORT=3000
ENV CHECKPOINT_DISABLE=1
ENV PRISMA_HIDE_UPDATE_MESSAGE=1

WORKDIR /app

# Giữ node_modules đầy đủ (kèm Prisma CLI) để chạy được `prisma migrate deploy`
# trước khi khởi động ở môi trường production.
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build --chown=node:node /app/apps/api/dist ./apps/api/dist
COPY --from=build --chown=node:node /app/apps/api/prisma ./apps/api/prisma
COPY --from=build --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --chown=node:node apps/api/docker-entrypoint.sh ./apps/api/docker-entrypoint.sh
RUN sed -i "s/\r$//" /app/apps/api/docker-entrypoint.sh && chmod +x /app/apps/api/docker-entrypoint.sh

USER node
WORKDIR /app/apps/api

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/main.js"]
