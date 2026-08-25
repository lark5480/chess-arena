# AGENTS.md

> 供 AI 编码助手快速了解本项目的约定与架构。

## 项目一句话

Next.js 14 国际象棋对战平台，SSE 实时通信 + 内存存储，支持好友对战与人机对战。

## 架构关键点

- **服务端状态**：`lib/store.ts` 用 `globalThis.__chessArenaRooms` Map 存储房间状态。用 globalThis 是为了绕过 Next.js dev HMR 导致的模块重置（标准单例模式）。
- **实时通信**：`lib/realtime.ts` 用 `globalThis.__chessArenaSubs` Map 管理每个房间的 SSE 订阅者集合。`broadcast()` 向所有订阅者推送事件。
- **SSE 流**：`app/api/rooms/[code]/stream/route.ts` 是 SSE 长连接入口。连接时推送全量快照（`{type:"state"}`），之后 25s 心跳保活，断连时清理订阅者。
- **客户端状态**：`stores/game-store.ts` 是 Zustand store，包含 fen/turn/players/moves/chat/gameOver 等全部对局状态，以及 `myColor`（当前用户执子方）。
- **AI 走子触发**：客户端 `triggerAIMoveIfNeeded()` 动态识别 AI 颜色（`st.white?.isAI ? st.white : st.black?.isAI ? st.black : null`），不能假设 AI 恒执黑。通过 fetch 请求 `/api/rooms/[code]/move` 走子。
- **走棋权威**：服务端用 chess.js 重放校验，返回权威 FEN。客户端也有 chess.js 做预校验（高亮合法走法），但最终以服务端为准。
- **服务端权威计时**：`RoomState` 含 `clocks`（每方剩余毫秒）与 `clockUpdatedAt`。走子时服务端扣减耗时；无服务端定时器扫描，超时由客户端时钟归零时上报 `/timeout`（任一方可报任一方），`timeoutAction()` 按权威时钟复核后才判负
- **棋谱回看**：客户端 `game-store.ts` 的 `viewIndex` 控制回看步数；`ChessBoard.tsx` 在回看模式用历史 FEN 渲染并禁交互，`MoveHistory.tsx` 提供点击/键盘导航。

## API 路由清单

| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/rooms` | POST | 创建房间 |
| `/api/rooms/[code]` | GET | 获取房间信息 |
| `/api/rooms/[code]/join` | POST | 加入房间（好友对战） |
| `/api/rooms/[code]/ai` | POST | 加入 AI 机器人 |
| `/api/rooms/[code]/move` | POST | 走棋 |
| `/api/rooms/[code]/chat` | POST | 发送聊天 |
| `/api/rooms/[code]/resign` | POST | 认输 |
| `/api/rooms/[code]/draw` | POST | 求和（offer/accept/decline） |
| `/api/rooms/[code]/takeback` | POST | 悔棋（request/accept/decline） |
| `/api/rooms/[code]/rematch` | POST | 再来一局（交换先后手） |
| `/api/rooms/[code]/timeout` | POST | 超时判负 |
| `/api/rooms/[code]/stream` | GET | SSE 实时事件流 |

## 类型系统

所有共享类型在 `types/index.ts`：
- `RoomState`：房间全量状态（SSE 快照 / GET 返回）
- `RoomEvent`：SSE 事件联合类型（state/move/chat/resign/draw_*/takeback_*/rematch/timeout/game_start）；玩家上下线不发独立事件，stream 连接携带 `?playerId=` 驱动 `setConnected()`，变化时广播全量快照
- `Player`：含 `isAI` 标记区分人类与 AI
- `Color = "white" | "black"`
- `Clocks`：每方剩余毫秒数（服务端权威值），随 `RoomState.clocks` 下发
- `LobbyInfo.aiDifficulty`：AI 搜索深度（1=简单 / 2=中等 / 3=困难），存 sessionStorage 刷新后恢复

## 编码约定

- **语言**：TypeScript 严格模式，`tsc --noEmit` 必须通过
- **样式**：Tailwind CSS，配色 token 见 `tailwind.config.ts`（bg/surface/border/accent/muted）
- **暗色主题**：默认深色 UI，背景 `#0f1115`，文字 `#e8eaed`，强调色 `#FF5C1A`
- **状态管理**：服务端用 `lib/store.ts` 的内存 Map，客户端用 Zustand
- **测试**：`node --import tsx --test __tests__/**/*.test.ts`，当前 31 项全通过
- **ESLint**：构建时忽略（`next.config.mjs` 中 `eslint.ignoreDuringBuilds: true`），但请保持代码整洁

## 已知限制

- **内存存储**：服务重启后房间数据丢失，跨 Serverless 实例不共享。Vercel 免费版多实例场景下好友对战可能遇到"房间不存在"。房间有 TTL 清理：结束后 30 分钟或无活动 3 小时自动删除；创建房间有每 IP 10 次/分钟限流。
- **SSE 超时**：Vercel Hobby 版函数超时 10s，SSE 长连接可能被切断。已实现自动重连 + 全量快照恢复。
- **无认证**：无用户系统，房间码即凭证。好友对战场景信任对方，不做防作弊。

## 常见开发任务

### 新增 API 路由
1. 在 `app/api/rooms/[code]/` 下新建 `route.ts`
2. 调用 `lib/store.ts` 中的 action 函数
3. 用 `broadcast()` 推送事件
4. 在 `types/index.ts` 补充事件类型

### 新增棋盘功能
1. `components/chess/ChessBoard.tsx` 是棋盘主组件
2. 通过 `useGameStore` 读写状态
3. 将军检测：`createGame(fen).inCheck()` + `chess.turn()` 找王格
4. 合法走法：`legalTargetSquares(fen, square)`

### 修改 AI
- `lib/ai-engine.ts`：minimax + alpha-beta 剪枝，难度可选 depth 1/2/3（简单/中等/困难），由 `LobbyInfo.aiDifficulty` 传入 `chooseAIMove()`
- AI 走子由客户端触发：`stores/game-store.ts` 的 `triggerAIMoveIfNeeded()`
- 搜索在 Web Worker 中执行（`lib/ai.worker.ts`），环境不支持时回退主线程同步计算（测试即走回退路径）
- AI 走子请求发到 `/api/rooms/[code]/move`，与人类走子共用同一 API

### 新增组件
- 棋盘相关放 `components/chess/`
- 房间/大厅相关放 `components/room/`
- 通用 UI 放 `components/ui/`
- 页面放 `app/`

## 测试

```bash
# 全部测试
npm test

# 类型检查
npm run typecheck

# 生产构建
npm run build
```

测试文件在 `__tests__/`：
- `chess-engine.test.ts`：棋规引擎（走子/将死/逼和/升变/合法走法）
- `store.test.ts`：房间状态管理（创建/加入/AI/走子/rematch/颜色同步）
- `cleanup.test.ts`：房间 TTL 清扫与创建限流
- `presence-timeout.test.ts`：超时上报（任一方可报）与在线状态宽限期
- `verify-fix.test.ts`：端到端集成验证
