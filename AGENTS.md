# AGENTS.md

> 供 AI 编码助手快速了解本项目的约定与架构。

## 项目一句话

Next.js 14 国际象棋对战平台，SSE 实时通信 + 内存存储，支持好友对战与人机对战。

## 架构关键点

- **服务端状态**：`lib/store.ts` 用 `globalThis.__chessArenaRooms` Map 存储房间状态。用 globalThis 是为了绕过 Next.js dev HMR 导致的模块重置（标准单例模式）。
- **身份凭证隔离（重要）**：playerId 是所有写操作的唯一凭证，**只通过创建/加入的私有 HTTP 响应下发给本人**。`snapshot()` 与所有广播事件中 `players[].id` 一律为空串，防止观战者/对手拿到凭证冒充操作。客户端凭 sessionStorage 的 lobby 身份识别自己；`myColor` 由加入时的原始颜色 + gameNo 奇偶推导（每次 rematch 服务端必翻转颜色），断线错过 rematch 事件也能恢复。
- **实时通信**：`lib/realtime.ts` 用 `globalThis.__chessArenaSubs` Map 管理每个房间的 SSE 订阅者集合。`broadcast()` 向所有订阅者推送事件。SSE 连接有上限：每房间 12 条、全局 300 条。
- **SSE 流**：`app/api/rooms/[code]/stream/route.ts` 是 SSE 长连接入口。连接时推送全量快照（`{type:"state"}`），之后 25s 心跳保活，断连时清理订阅者。客户端重连为指数退避（3s→30s 上限，带抖动）。
- **客户端状态**：`stores/game-store.ts` 是 Zustand store，包含 fen/turn/players/moves/chat/gameOver 等全部对局状态，以及 `myColor`（当前用户执子方）。
- **AI 走子触发**：客户端 `triggerAIMoveIfNeeded()` 动态识别 AI 颜色（`st.white?.isAI ? st.white : st.black?.isAI ? st.black : null`），不能假设 AI 恒执黑。通过 fetch 请求 `/api/rooms/[code]/move` 走子。AI 回合有在途去重（`aiMoveInFlight`），Worker 失败自动回退主线程。
- **走棋权威**：服务端用 chess.js 重放校验，返回权威 FEN。客户端也有 chess.js 做预校验（高亮合法走法），但最终以服务端为准。
- **服务端权威计时**：`RoomState` 含 `clocks`（每方剩余毫秒）与 `clockUpdatedAt`。走子时服务端扣减耗时；走子请求晚于钟面耗尽超过 200ms 容差时该步无效并直接判负。无服务端定时器扫描，超时由客户端时钟归零时上报 `/timeout`（任一方可报任一方），`timeoutAction()` 按权威时钟复核：轮到被判方扣减 elapsed 后比对容差；停表方仅当钟面恰好为 0（走子时耗尽）才可判负。悔棋回退时钟到被悔着法的 `clocksBefore`。
- **终局状态一致性**：所有终局路径（将死/认输/超时/和棋）都会清除残留的 `draw`/`takeback` pending，且响应动作（accept/decline）有 `status==="playing"` 守卫，杜绝"对局结束后改写结果/回退棋盘"。
- **人机模式自动应答**：人类向 AI 求和 → AI 自动拒绝；人类请求悔棋 → AI 自动同意（服务端 `drawOfferAction`/`takebackRequestAction` 内处理）。好友模式不支持悔棋（客户端禁用按钮）。
- **在线状态**：`setConnected` 按连接计数（同一玩家多标签页不误判离线），离线有 10s 宽限期。
- **棋谱回看**：客户端 `game-store.ts` 的 `viewIndex` 控制回看步数；`ChessBoard.tsx` 在回看模式用历史 FEN 渲染并禁交互（最后一手高亮也跟随所看着法），`MoveHistory.tsx` 提供点击/键盘导航。

## API 路由清单

| 路由 | 方法 | 说明 |
|------|------|------|
| `/api/rooms` | POST | 创建房间（10 次/分/IP） |
| `/api/rooms/[code]` | GET | 获取房间信息（120 次/分/IP） |
| `/api/rooms/[code]/join` | POST | 加入房间（好友对战，10 次/分/IP 防枚举抢座） |
| `/api/rooms/[code]/ai` | POST | 加入 AI 机器人（10 次/分/IP） |
| `/api/rooms/[code]/move` | POST | 走棋（60 次/分/IP） |
| `/api/rooms/[code]/chat` | POST | 发送聊天（30 次/分/IP，单条 500 字封顶，房间 200 条封顶） |
| `/api/rooms/[code]/resign` | POST | 认输（20 次/分/IP） |
| `/api/rooms/[code]/draw` | POST | 求和（offer/accept/decline，30 次/分/IP） |
| `/api/rooms/[code]/takeback` | POST | 悔棋（request/accept/decline，30 次/分/IP） |
| `/api/rooms/[code]/rematch` | POST | 再来一局（交换先后手，20 次/分/IP） |
| `/api/rooms/[code]/timeout` | POST | 超时判负（30 次/分/IP） |
| `/api/rooms/[code]/stream` | GET | SSE 实时事件流（30 连接/分/IP，房间 12 条、全局 300 条上限） |

所有限流为进程内滑动窗口（`lib/rate-limit.ts` 的 `rateLimitGuard()`），IP 取自 X-Forwarded-For/X-Real-IP——仅在可信反代后面才可靠。

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
- **测试**：`npm test`，当前 68 项全通过。glob 固定写单星 `__tests__/*.test.ts`——双星 `**` 依赖 Node 自身对 glob 的实现，在 Linux CI 上可能匹配不到文件，造成"跑 0 个测试却显示通过"的假绿灯
- **代码风格**：ESLint（`next/core-web-vitals`）+ Prettier。`next.config.mjs` 已移除 `eslint.ignoreDuringBuilds`，因此 `npm run build` 会真正跑 lint；提交前用 `npm run lint:fix` 与 `npm run format` 收敛。Markdown 目前不纳入 Prettier（避免格式改动混入内容 diff）
- **CI**：`.github/workflows/ci.yml` 在 push/PR 到 `main`、`dev` 时执行 `npm ci` → `lint` → `format:check` → `typecheck` → `test` → `build`，同一分支新提交自动取消旧任务
- **ESLint**：构建时忽略（`next.config.mjs` 中 `eslint.ignoreDuringBuilds: true`），但请保持代码整洁
- **输入校验**：服务端入口统一做类型/长度校验（`sanitizeName`/`sanitizeAvatar`/`normalizeTimeLimit`），timeLimit 只接受白名单 {0,300,600,900}（0=无限制，勿用 `||` 兜底，会吃掉 0）
- **凭证纪律**：新增任何对外下发 room 数据的路径（快照/事件/响应），players[].id 必须脱敏（`publicPlayer()` 或 `snapshot()`）

## 已知限制

- **内存存储**：服务重启后房间数据丢失，跨 Serverless 实例不共享。Vercel 免费版多实例场景下好友对战可能遇到"房间不存在"。房间有 TTL 清理：结束后 30 分钟或无活动 3 小时自动删除；进程内房间数上限 500。
- **SSE 超时**：Vercel Hobby 版函数超时 10s，SSE 长连接可能被切断。已实现自动重连（指数退避）+ 全量快照恢复。
- **无认证**：无用户系统，房间码即凭证。playerId 已不在快照中下发，但房间码本身可分享/枚举（6 位 32 字符集），join/ai 路由已限流缓解。好友对战场景信任对方，不做防作弊。
- **限流为进程内实现**：单实例内存计数，重启清零，且 IP 头在无可信反代时可伪造。

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
- `lib/ai-engine.ts`：minimax + alpha-beta 剪枝 + 静态搜索 + 迭代加深。难度可选 depth 1/2/3（简单/中等/困难），由 `LobbyInfo.aiDifficulty` 传入 `chooseAIMove(fen, depth, timeBudgetMs)`
  - **评估** = 子力（`PIECE_VALUE`，单位厘兵）+ 位置（`PIECE_SQUARE_TABLES`，白方视角，索引 0=a8 … 63=h1，黑方取 `sq ^ 56` 镜像）。纯子力评估会让开局所有走法同分而退化成随机走子，位置项是 AI 棋力的关键
  - **走法排序**用 MVV-LVA（`victim * 10 - attacker`），提升 alpha-beta 剪枝效率
  - `MATE_SCORE`（100000）必须远大于任何真实局面分（当前上限约 4500），否则将死会被位置分盖过
  - **静态搜索（quiescence）**：depth 用尽时不直接评估，而是继续只展开**吃子**直到局面平静，以此消除地平线效应（否则 AI 会"白送子"）。**切勿把升变也计入 forcing moves**——升变可以延后，一旦计入就会让 stand-pat 的下界语义失效，表现为"先走闲棋再升变"的分数反而高于"立即升变"
  - **迭代加深**：从 depth 1 逐层加深；某层超时（默认 `DEFAULT_TIME_BUDGET_MS` = 1200ms）即丢弃该层的不完整结果、沿用上一层。这保证即使是最难的困难档，Worker 失效回退主线程同步计算时也不会卡住 UI
  - **性能特征**（实测，调参前先读这里）：开局/残局 depth 3 约 300ms 即可完整完成；复杂中局 depth 2 约 850ms、depth 3 约 4.2s。预算取 1200ms 的关键原因是中局 depth 1+2 累计约 990ms——**低于该值会让 depth 2 层在收尾前被反复截断丢弃、最终只剩 depth 1 的结果，迭代加深会退化成负优化**。因此困难档在开局与残局能看满 3 层、中局自动回落到 2 层，这是自适应的预期行为而非缺陷
  - 若要把困难档的中局也推到 3 层，最有效的手段是**置换表（Zobrist 哈希）**，其次 null-move 剪枝；单纯调低 `QUIESCENCE_MAX_PLY` 收益极小（实测 8→5 仅快约 1%）
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
- `review-fixes.test.ts`：代码审查修复的回归测试（终局守卫/悔棋退钟/时限白名单/playerId 脱敏/AI 自动应答/停表超时/连接计数/输入校验）
- `verify-fix.test.ts`：端到端集成冒烟（真实断言版）
- `ai-engine.test.ts`：AI 引擎（PST 表结构与方向、厘兵量纲、开局走法、白吃后、一步杀、升变、静态搜索防白送子）
- `pgn.test.ts`：PGN 导出与回放编解码（UCI 往返、升变、非法走法截断、结果标签映射）
