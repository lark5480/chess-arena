# deploy/ — 自托管部署物料

> 完整手册（买服务器 / 域名 / 初始化 / HTTPS / 验证清单 / 踩坑）见笔记库：
> `wiki/concepts/dev/ops/自托管部署Next.js（Docker + Nginx + SSE）`

## 文件

| 文件 | 用途 |
|---|---|
| `../Dockerfile` | 生产镜像（构建 + 运行两阶段） |
| `../.dockerignore` | 构建上下文瘦身 |
| `nginx.conf` | Nginx 反代（含 SSE 三个必设项） |

## 最短路径

```bash
# 服务器上（已装 Docker，且控制台与系统防火墙都放行了 80/443）
git clone https://github.com/lark5480/chess-arena.git && cd chess-arena
docker build -t chess-arena .
docker run -d --name chess-arena --restart always -p 127.0.0.1:3000:3000 chess-arena

# Nginx 反代
cp deploy/nginx.conf /etc/nginx/conf.d/chess.conf   # 先改 server_name
nginx -t && systemctl reload nginx

# HTTPS
certbot --nginx -d 你的域名

# SSE 实测（应持续输出事件流、不立即结束）
curl -N http://你的域名/api/rooms/<房间码>/stream
```

## 注意

- **必须单实例**：房间状态存在内存里，多实例 / 负载均衡会导致"房间不存在"
- ⚠️ `docs/DEPLOYMENT.md` 里的 Dockerfile 片段**缺少 `RUN mkdir -p public`**（本仓库没有 `public/` 目录）——照抄会构建失败，**以根目录 `Dockerfile` 为准**
- ⚠️ **未实测**：本目录物料由笔记库整理而来，首次部署后请把实际报错 / 与文档不一致处回填笔记（手册会据此更新）
