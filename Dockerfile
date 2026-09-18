# Chess Arena — 生产镜像（Next.js 自托管）
# 用法见 deploy/README.md；完整部署手册见笔记库 concepts/dev/ops/自托管部署Next.js（Docker + Nginx + SSE）

# ---------- 1) 构建 ----------
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# ⚠️ 本仓库没有 public/ 目录；不补这行，下一阶段的 COPY 会直接构建失败
RUN mkdir -p public
RUN npm run build

# ---------- 2) 运行 ----------
FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./
COPY --from=builder /app/next.config.mjs ./
EXPOSE 3000
CMD ["npm", "start"]
