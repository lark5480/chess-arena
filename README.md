# ♟️ Chess Arena

轻量级在线国际象棋对战平台，支持好友实时对弈与人机对战。

## 功能

- **好友对战**：创建房间 → 分享链接 → 对方加入 → 实时对弈
- **人机对战**：内置 AI（minimax + alpha-beta 剪枝），可执白或执黑
- **实时同步**：基于 SSE（Server-Sent Events），无需 WebSocket
- **完整规则**：将军/将死/逼和/王车易位/吃过路兵/升变/50步/三次重复/子力不足
- **将军提示**：被将军时王格红色脉冲闪烁
- **对局功能**：走棋记录（代数记谱）、聊天、悔棋、求和、认输
- **再来一局**：交换先后手重开
- **计时器**：可选时限（5min / 10min / 15min / 无限制）
- **棋盘主题**：多种配色方案
- **音效**：落子/吃子/将军/结束
- **响应式**：适配桌面端与移动端
- **玩法规则**：内置可折叠规则面板

## 技术栈

| 层级 | 技术 |
|------|------|
| 框架 | Next.js 14 (App Router) |
| UI | React 18 + Tailwind CSS |
| 棋盘 | react-chessboard |
| 规则引擎 | chess.js |
| 状态管理 | Zustand |
| 实时通信 | SSE（Server-Sent Events） |
| AI | minimax + alpha-beta 剪枝（depth=2） |
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
│   │   └── ChatPanel.tsx          # 聊天面板
│   └── ui/
│       ├── Button.tsx
│       └── Card.tsx
├── hooks/
│   ├── useRoomGame.ts              # 房间游戏逻辑（SSE 订阅+重连）
│   └── useSound.ts                # 音效
├── lib/
│   ├── chess-engine.ts             # chess.js 封装
│   ├── ai-engine.ts                # AI 走子引擎
│   ├── store.ts                    # 服务端房间状态（内存 Map）
│   ├── realtime.ts                 # SSE 订阅管理
│   ├── events.ts                   # SSE 事件序列化
│   └── utils.ts
├── stores/
│   └── game-store.ts               # Zustand 客户端状态
├── types/
│   └── index.ts                    # TypeScript 类型
├── supabase/
│   └── schema.sql                  # 可选持久化方案
├── __tests__/                      # 单元测试（21 项）
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

## 部署

详见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

快速部署到 Vercel：
1. 推送代码到 GitHub
2. 在 [vercel.com](https://vercel.com) 导入仓库
3. 无需配置环境变量，直接 Deploy

## License

MIT
