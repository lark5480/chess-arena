# Chess Arena 部署指南

## 架构概览

```
浏览器 ──HTTP fetch──▶ Next.js API Routes (Vercel Serverless)
        └──SSE 长连接──▶ /api/rooms/[code]/stream (实时推送)

服务端状态：内存存储（globalThis Map），无外部数据库依赖
实时通信：SSE (Server-Sent Events)，非 WebSocket
棋规引擎：chess.js（服务端权威校验 + 客户端预校验）
AI 对战：minimax + alpha-beta 剪枝（depth 1/2/3 可选，浏览器 Web Worker 中计算）
```

**关键点**：项目当前使用**纯内存存储**，不依赖 Supabase / 数据库。部署到 Vercel 即可运行，无需配置外部服务。

## 前置条件

| 项目 | 要求 |
|------|------|
| Node.js | ≥ 18.17（本地开发） |
| npm | ≥ 9 |
| Vercel 账号 | 免费版即可 |
| GitHub 仓库 | 代码推送后自动部署 |

## 部署步骤

### 1. 推送代码到 GitHub

```bash
git init
git add .
git commit -m "feat: chess-arena initial release"
git remote add origin https://github.com/<你的用户名>/chess-arena.git
git push -u origin main
```

### 2. 在 Vercel 导入项目

1. 打开 [vercel.com](https://vercel.com) → 登录 → New Project
2. 选择你的 GitHub 仓库 `chess-arena`
3. Vercel 自动识别 Next.js，框架预设选 `Next.js`
4. **无需配置环境变量**（当前无外部依赖）
5. 点击 Deploy

### 3. 验证部署

部署完成后访问 Vercel 分配的域名（如 `chess-arena.vercel.app`），确认：

- [ ] 首页正常渲染，可创建/加入房间
- [ ] 人机对战可正常落子，AI 能应招
- [ ] 好友对战：创建房间 → 分享链接 → 对方加入 → 双方走棋实时同步
- [ ] 将军时王格红色脉冲闪烁
- [ ] 走棋记录、聊天、悔棋、求和、认输功能正常
- [ ] 对局结束后可「再来一局」交换先后手

## 关于 SSE 在 Vercel 上的注意事项

Vercel Serverless Functions 有执行时间限制：

| 套餐 | 函数超时 |
|------|---------|
| Hobby（免费） | 10 秒（2024 年起对 SSE 流式接口有额外限制） |
| Pro | 60 秒 |
| Enterprise | 可协商 |

**当前 SSE 路由 `/api/rooms/[code]/stream` 是长连接**，在 Vercel 免费版上可能因超时断开。项目已实现：

- 25 秒心跳 ping（保活）
- 客户端 `useRoomGame` hook 自动重连（指数退避 3s→30s 上限、带随机抖动；重连后推送全量快照恢复状态）
- SSE 连接数上限：每房间 12 条、全局 300 条（防连接洪泛）；所有 API 路由均有按 IP 限流

但仍可能遇到 Vercel 平台层面的连接限制。**如果好友对战场景 SSE 频繁断开**，有两个升级路径：

### 方案 A：升级 Vercel Pro（推荐，改动最小）

Pro 版函数超时 60 秒，SSE 心跳 + 自动重连可覆盖绝大多数场景。`vercel.json` 中可指定：

```json
{
  "functions": {
    "app/api/rooms/[code]/stream/route.ts": {
      "maxDuration": 60
    }
  }
}
```

### 方案 B：自托管 Node.js 服务器（无超时限制）

在有 Node.js 的服务器上运行 `npm start`（需配置端口），SSE 无超时限制。适合 VPS / 云主机部署。

## 自托管部署（VPS / 云主机）

### Docker 方式（推荐）

```dockerfile
# Dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./
EXPOSE 3000
CMD ["npm", "start"]
```

```bash
docker build -t chess-arena .
docker run -d -p 3000:3000 --name chess-arena chess-arena
```

### PM2 方式

```bash
npm ci --production
npm run build
pm2 start npm --name chess-arena -- start
pm2 save
pm2 startup
```

### Nginx 反向代理（SSE 特殊配置）

SSE 需要 Nginx 关闭缓冲：

```nginx
location /api/rooms/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 86400s;
}
```

**关键**：`proxy_buffering off` 和 `proxy_read_timeout` 必须设置，否则 SSE 会被 Nginx 缓冲导致实时性丧失。

## 可选：启用 Supabase 持久化

当前项目用内存存储，重启后房间数据丢失。如需持久化：

1. 在 [supabase.com](https://supabase.com) 创建项目
2. 在 SQL Editor 执行 `supabase/schema.sql`
3. 在项目根目录创建 `.env.local`：

```env
NEXT_PUBLIC_SUPABASE_URL=https://<你的项目>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<你的 anon key>
```

4. 修改 `lib/store.ts` 将内存操作替换为 Supabase 查询（需自行实现）

> 当前版本未集成 Supabase，以上为后续扩展路径。

## 环境变量说明

当前版本**无环境变量依赖**。以下为未来扩展时需要的环境变量：

| 变量 | 说明 | 当前是否需要 |
|------|------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目 URL | 否（未集成） |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 匿名密钥 | 否（未集成） |
| `PORT` | 自托管端口 | 否（默认 3000） |

## 常见问题

### Q: 部署后房间创建成功但对方加入时提示"房间不存在"？

A: Vercel Serverless 是无状态的，每个请求可能落在不同实例。当前用 `globalThis` Map 存储房间，在同一实例内有效，但跨实例不共享。**好友对战需要两人请求落在同一实例**。如果遇到此问题，建议使用自托管方式部署。

### Q: SSE 连接频繁断开怎么办？

A: 检查 Vercel 函数超时设置，或改用自托管。项目已实现自动重连（指数退避）+ 全量快照恢复，断线后会重新同步状态。

### Q: 自托管/局域网直连部署需要注意什么？

A: 全部 API 路由的限流按 `X-Forwarded-For` / `X-Real-IP` 头识别客户端 IP。**只有在可信反向代理（如 Nginx、Vercel）后面该头才可靠**；直连暴露时该头可被伪造，限流只能防正常滥用，不能防刻意伪造者。另外进程内房间数上限 500、聊天每房间 200 条封顶，均为内存保护兜底。

### Q: AI 对战部署后不工作？

A: AI 走子由客户端 `triggerAIMoveIfNeeded()` 触发，通过 HTTP 请求服务端 API 走子。确保 API 路由正常部署，检查浏览器控制台是否有 fetch 错误。
