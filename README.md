# ♟️ Chess Arena

[![CI](https://github.com/lark5480/chess-arena/actions/workflows/ci.yml/badge.svg)](https://github.com/lark5480/chess-arena/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

轻量级在线国际象棋对战平台，支持好友实时对弈与人机对战。

**零依赖实时对弈**：无需数据库、无需 Redis、无需独立 WebSocket 服务，一个 Next.js 进程即可承载完整实时对弈。

## 功能

- **好友对战**：创建房间 → 分享链接 → 对方加入 → 实时对弈
- **人机对战**：内置 AI（minimax + alpha-beta 剪枝 + 位置评估表 + 静态搜索 + 迭代加深），可执白或执黑；向 AI 悔棋自动同意、求和自动拒绝
- **实时同步**：基于 SSE（Server-Sent Events），无需 WebSocket；断线指数退避重连 + 全量快照恢复
- **完整规则**：将军/将死/逼和/王车易位/吃过路兵/升变/50步/三次重复/子力不足
- **将军提示**：被将军时王格红色脉冲闪烁
- **对局功能**：走棋记录（代数记谱）、聊天、悔棋（好友模式禁用）、求和、认输
- **操作反馈**：非法走子/操作失败/断线重连等状态全局提示（StatusNotice）
- **棋谱回看**：点击走棋记录回溯任意局面，支持 ←→/Home/End 键盘导航，回看时高亮跟随所看着法
- **PGN 导出**：一键下载标准 PGN 文件（含双方昵称与对局结果）
- **分享回放**：生成回放链接，对方打开即可逐步回看并自动播放；**走法编码在 URL hash 中，服务端无需存储任何数据**
- **AI 难度**：简单 / 中等 / 困难三档可选
- **棋盘坐标**：显示 a-h/1-8 坐标，支持手动翻转视角
- **再来一局**：交换先后手重开
- **计时器**：服务端权威计时（5min/10min/15min/无限制），刷新不重置，超时由服务端校验判负；悔棋回退时钟
- **棋盘主题**：多种配色方案
- **音效**：落子/吃子/将军/结束
- **响应式**：适配桌面端与移动端
- **玩法规则**：内置可折叠规则面板
- **多标签页**：同一身份开多个标签页不会误判离线（连接计数）

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 14 (App Router) |
| UI | React 18 + Tailwind CSS |
| 棋盘 | react-chessboard |
| 规则引擎 | chess.js |
| 状态管理 | Zustand |
| 实时通信 | SSE（Server-Sent Events） |
| AI | minimax + alpha-beta + 位置评估表 + 静态搜索（depth 1/2/3，带 1200ms 时间预算） |
| 部署 | Vercel / 自托管 |

## 快速开始

```bash
# 安装依赖
npm install

# 本地开发
npm run dev
# → http://localhost:3000

# 生产构建
npm run build && npm start

# 类型检查
npm run typecheck

# 运行测试
npm test
```

## 项目结构

```
chess-arena/
├── app/
│   ├── page.tsx                    # 首页（创建/加入房间）
│   ├── room/[code]/page.tsx        # 对局房间
│   ├── replay/page.tsx             # 对局回放（走法编码在 URL hash）
│   ├── history/page.tsx            # 对局历史
│   ├── api/rooms/
│   │   ├── route.ts                # POST 创建房间
│   │   └── [code]/
│   │       ├── route.ts            # GET 房间信息
│   │       ├── join/route.ts       # POST 加入房间
│   │       ├── ai/route.ts         # POST 加入 AI
│   │       ├── move/route.ts       # POST 走棋
│   │       ├── chat/route.ts       # POST 聊天
│   │       ├── resign/route.ts     # POST 认输
│   │       ├── draw/route.ts       # POST 求和
│   │       ├── takeback/route.ts   # POST 悔棋
│   │       ├── rematch/route.ts    # POST 再来一局
│   │       ├── timeout/route.ts    # POST 超时
│   │       └── stream/route.ts     # GET  SSE 实时流
│   └── layout.tsx
├── components/
│   ├── chess/
│   │   ├── ChessBoard.tsx          # 棋盘（拖拽/点击/将军高亮）
│   │   ├── MoveHistory.tsx         # 走棋记录
│   │   ├── GameControls.tsx        # 认输/求和/悔棋按钮
│   │   ├── PlayerInfo.tsx          # 玩家信息+计时器
│   │   ├── PromotionDialog.tsx     # 升变选择弹窗
│   │   ├── RulesPanel.tsx          # 玩法规则面板
│   │   └── Timer.tsx
│   ├── room/
│   │   ├── CreateRoom.tsx          # 创建房间表单
│   │   ├── JoinRoom.tsx            # 加入房间
│   │   ├── WaitingRoom.tsx         # 等待对手
│   │   ├── GameView.tsx            # 对局主视图
│   │   ├── GameResultModal.tsx     # 结果弹窗
│   │   ├── ThemePicker.tsx         # 棋盘主题切换
│   │   └── ChatPanel.tsx          # 聊天面板
│   └── ui/
│       ├── Button.tsx
│       ├── Card.tsx
│       └── StatusNotice.tsx        # 全局错误/连接状态提示
├── hooks/
│   ├── useRoomGame.ts              # 房间游戏逻辑（SSE 订阅+重连）
│   └── useSound.ts                # 音效
├── lib/
│   ├── chess-engine.ts             # chess.js 封装
│   ├── ai-engine.ts                # AI 走子引擎
│   ├── ai.worker.ts                # AI 搜索 Web Worker
│   ├── pgn.ts                      # PGN 导出与走法编解码
│   ├── store/                       # 服务端房间状态（内存 Map，按职责拆分）
│   │   ├── index.ts                 #   统一出口（对外 API 不变）
│   │   ├── room.ts                  #   存储单例与查找
│   │   ├── snapshot.ts              #   脱敏快照与系统消息
│   │   ├── presence.ts              #   在线状态（连接计数+宽限期）
│   │   ├── lifecycle.ts             #   TTL 清扫
│   │   ├── clock.ts                 #   服务端权威计时
│   │   ├── lobby.ts                 #   创建/加入
│   │   ├── move.ts / actions.ts     #   走棋/认输/求和/悔棋/超时/再来一局
│   │   ├── chat.ts                  #   聊天
│   │   ├── outcome.ts               #   终局统一落地
│   │   └── validate.ts              #   Zod 入参清洗
│   ├── realtime.ts                 # SSE 订阅管理
│   ├── rate-limit.ts               # 进程内滑动窗口限流
│   ├── events.ts                   # SSE 事件序列化
│   └── utils.ts
├── stores/
│   └── game-store.ts               # Zustand 客户端状态
├── types/
│   └── index.ts                    # TypeScript 类型
├── supabase/
│   └── schema.sql                  # 可选持久化方案
├── __tests__/                      # 单元测试（68 项：含审查修复回归测试、AI 引擎与 PGN 测试）
└── docs/
    ├── 需求PRD.md                   # 产品需求文档
    └── DEPLOYMENT.md               # 部署指南
```

## 玩法

1. 创建房间 → 选择人机对战或好友对战
2. 好友对战：分享 6 位房间码或链接给对方
3. 白方先手，拖拽或点击棋子移动
4. 被将军时王格闪烁红色，需应将
5. 兵到达底线可选择升变为后/车/象/马
6. 将死对方获胜，或对方认输/超时获胜
7. 对局结束后可「再来一局」交换先后手

## 局域网联机（与同事同网对战）

默认 `npm run dev` 仅本机可访问（绑定 127.0.0.1）。要让同一局域网内的同事连进来，用：

```bash
npm run dev:lan
# 等价于 next dev -H 0.0.0.0 -p 3000，监听所有网卡
```

- 本机打开 http://localhost:3000 创建房间
- 把地址栏完整链接（如 `http://192.168.x.x:3000/room/XXXXXX`）发给同事，对方打开即进同一房间
- 若同事打不开页面：多半是 Windows 防火墙拦了 3000 端口，以管理员身份放行一次
  ```bash
  netsh advfirewall firewall add rule name="ChessArena3000" dir=in action=allow protocol=TCP localport=3000
  ```
- 房间状态存在内存中，服务重启即清空，试玩中途请勿重启

## 部署

详见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

快速部署到 Vercel：
1. 推送代码到 GitHub
2. 在 [vercel.com](https://vercel.com) 导入仓库
3. 无需配置环境变量，直接 Deploy

## 参与贡献

提交 PR 前请确保本地通过 CI 的五道工序：

```bash
npm run lint         # ESLint
npm run format:check # Prettier 格式检查（npm run format 可自动修复）
npm run typecheck    # 类型检查
npm test             # 单元测试（68 项）
npm run build        # 生产构建
```

新增/修改 AI 相关逻辑时，请同步维护 `__tests__/ai-engine.test.ts` 中的位置评估与静态搜索断言。

## License

[MIT](LICENSE)
