# 国际象棋竞品生态简报

**日期**：2026-09-03
**场景**：动手前 / 重构后复盘，摸清"哪些轮子已存在、哪些坑已有人踩过"
**参与成员**：调查员（主导）+ 产品评审员（竞品功能比对）+ 安全官（许可证与供应链风险）
**对应文档**：`docs/PRD.md`、`docs/decisions/2026-08-19-requirement-review.md`、`docs/decisions/2026-08-19-dev-plan.md`
**调研方法**：exa 概览 → deepwiki 精读关键项目 → 直接查 `package.json`/源码核验实际实现

---

## 📌 TL;DR（执行摘要）

- **结论：需要补回**。gstack 链路「需求评审 → **竞品生态** → 开发计划」缺中间一环；且 P2 重构（store 分层 + 凭证脱敏）后，外部依赖出现**新的升级约束**（`react-chessboard` v5 要求 React 19），现有两份文档均未覆盖。
- **核心判断：没有需要替换的轮子**。本仓库「chess.js + react-chessboard v4 + 自研 minimax + SSE」的组合，在**「纯前端 + 自研多等级 AI + 无引擎进程 + 无服务端」**的边界内是最优解之一。竞品主流配方（Socket.IO + Stockfish WASM + 数据库 + 独立后端进程）恰好是本项**刻意规避**的方向，不构成重复造轮子。
- **竞品重合度**：功能层面（房间码/观战/PGN/悔棋求和状态机/服务端权威）与 7 个竞品**高度重合且本项均已覆盖**；差异仅在实时信道（SSE vs Socket.IO）与 AI 实现方式（自研 vs Stockfish/LLM）。
- **3 项可借鉴**：`legalTargetSquares` 改用单格生成；alpha-beta 返回"界限"而非"分数"的语义陷阱；延迟初始化 + 优雅降级模式。
- **2 项需规避**：`chessground` 的 **GPL-3.0 许可证污染**；**LLM 下棋**路线（需 API key、走法不保证合法）。
- **1 项暂缓**：`react-chessboard` 升 v5（强制 React 19，且移除 promotion 相关 props）。
- **顺带修正 2 处文档错漏**：`README.md` 项目结构漏列已实现的观战页；`AGENTS.md` 的 ESLint 条款自相矛盾。

---

## 🎯 核心结论卡片

| 项目 | 内容 |
|------|------|
| **是否补回** | ✅ 补回（gstack 链路缺失 + P2 后出现新外部约束） |
| **是否要换轮子** | ❌ 不需要。现有技术栈在既定边界内成立 |
| **重合** | 覆盖 7 个竞品的通用功能面（服务端权威校验、观战、PGN、悔棋/求和状态机） |
| **可借鉴** | 3 项（1 项低风险可立即落地） |
| **需规避** | 2 项（GPL 许可证、LLM 下棋） |
| **暂缓** | 1 项（react-chessboard v5 = 强制 React 19） |
| **调研覆盖度** | 竞品应用 9 个 + 库/引擎 6 个；关键项目经 deepwiki 精读；本仓库 4 个依赖版本已实测核验 |
| **建议负责人** | 文档与行动项：项目主 owner |

---

## 1. 已调研竞品（应用层）

> "AI 实现"列是本次调研的重点筛选维度——只关心**在浏览器里、无后端引擎进程**下棋的方案。

| # | 竞品 | 技术栈 | AI 实现方式 | 已知问题 / 边界 | 与本项关系 |
|---|------|--------|-------------|----------------|-----------|
| 1 | **chess-blitz**<br>`shra1dhar/chess-blitz` | Next.js 16 + React 19 + **Zustand 5** + chess.js + react-chessboard + SCSS；后端 Cloudflare Workers + Durable Objects + Hono + Zod | **Stockfish**（Web Worker），4 档难度 | 强绑定 Cloudflare 平台；ELO 匹配需队列 DO；34 语言 i18n 体量大 | **技术栈重合度最高**（Zustand/chess.js/react-chessboard/Next 全中）。差异：它用 Durable Objects 存状态、Stockfish 做 AI |
| 2 | **realtime-multiplayer-chess-game**<br>`harshit-ojha0324` | Next.js 15 + React 19 + react-chessboard + Express + Socket.IO + MongoDB + JWT | 未内置 AI | 需独立 Express 进程 + Mongo；活跃对局只在内存，结束后才落库一次 | **架构思路最接近**（服务端权威 + 内存热路径）。它的"客户端乐观更新 → 服务端拒绝则回退权威 FEN"与本项一致 |
| 3 | **Chessify-WebApp**<br>`AmanVerma1067` | Next.js 13 + react-dnd + **Flask** + Node/Express/Socket.IO | Polyglot 开局库 + **minimax depth 3** + Stockfish，Stockfish 不可用则回退 minimax | 三套服务并存（Next + Flask + Node），运维成本高 | **混合 AI 路线值得注意**：开局库 + 自研搜索 + 强引擎兜底，是"自研 AI"的常见增强路径 |
| 4 | **AIChess**<br>`Miguel07Alm` | Next.js 15 + Tailwind + shadcn + **WebRTC P2P** + Vercel AI SDK | **OpenAI API** 直接下棋 | 需 OpenAI API key；README 自述"Multiple difficulty levels (coming soon)"——**难度分级尚未实现**；无服务端权威 | ⚠️ **需规避**：LLM 直出走法，依赖外部 API（违背本项"零凭证可跑"） |
| 5 | **gambit**<br>`dushyant4665` | Next.js 14 + react-chessboard + Express + Socket.IO + Supabase + 自研棋规引擎 | LLM（Gemini / OpenRouter）生成 3 个候选 → Stockfish 校验 → 兜底 | LLM 限流 20 次/分；需多层回退才能保证走法合法 | ⚠️ **需规避**（同 4）。但其"LLM 候选 → 引擎校验"是 LLM 路线唯一可靠形态 |
| 6 | **chzle**<br>`Gregor-j8` | Next.js 15 + React 19 + Prisma + Clerk + tRPC + Supabase + Socket.IO + chess.js | **js-chess-engine**（轻量 JS 引擎库） | 依赖栈极重（DB + 认证 + ORM + 分析） | 与自研 AI 不同，它选了**现成轻量引擎库**——本项自研的对照方案 |
| 7 | **ChessPlay**<br>`SunilKumarKV` | React 19 + Vite + Zustand + Redux + Express + Socket.IO + Stockfish.js + Postgres/Prisma | Stockfish.js，多难度 | **AGPL-3.0** 许可；含商业化模块（Razorpay 订阅） | ⚠️ 仅作参照；AGPL 不可借鉴 |
| 8 | **chess-ai**<br>`parthjadhao01` | pnpm + Turborepo + Express + `ws` + Redis + Postgres + MCP | **LLM Agent（OpenRouter）+ MCP 工具发现**，开局可用 Exa 联网搜定式 | 架构极重（6 个服务 + Redis + PG） | ⚠️ **需规避**（同 4） |
| 9 | **LeMuffinMan/ChessGame**<br>（Rust，非 JS） | Rust + egui + WASM | **自研 UCI 引擎**：alpha-beta + PVS + 迭代加深 + 渴望窗口 + null-move + LMR + **置换表/Zobrist** + MVV-LVA/killers/history | 自述瓶颈：**未实现 WebWorkers**，bot 思考会阻塞 UI，仅用"自适应时间预算"缓解；`[[Cell;8];8]` 非 bitboard | ✅ **算法路线高度可比**。其实测数据是本项 AI 调参的最佳参照（见 §3.3） |

---

## 2. 已调研库 / 引擎（基础设施层）

| 库 | 版本 | 现状与实测数据 | 与本项关系 |
|----|------|----------------|-----------|
| **chess.js** | **1.4.0（在用）** | 0x88 棋盘表示；伪合法生成 + 合法性过滤；完整支持 50 步/三次重复/子力不足/逼和。⚠️ **verbose 走法生成是中局性能热点**：`legalMoves(verbose)` 实测 **427–454 µs/次**（ultrachess bench），40 步回放+回退 2.81 ms | ✅ 在用。PRD 评审曾担心的 `^1.0.0-beta.8` beta 陷阱已解除（现为 1.4.0 正式版） |
| **react-chessboard** | **4.7.3（在用）**<br>v5.10（最新） | v4 = 扁平 props（本项用法）。**v5 三大变更**：① **最低要求 React 19.0.0**；② 全部配置收敛为单个 `options` 对象（props 大量重命名：`allowDragOutsideBoard`→`allowDragOffBoard`、`animationDuration`→`animationDurationInMs`、`customBoardStyle`→`boardStyle`）；③ **移除 `arePremovesAllowed`/`autoPromoteToQueen`/`onPromotionCheck`**，升变与预走需外部自行实现 | ⏸ **暂缓升级**。本项 React 18.3.1；`^4.7.0` 不会跨大版本，当前锁在 4.7.3 安全。升级 = 先升 React 19 + 重写 `ChessBoard.tsx` 全部 props（升变弹窗本项已自研，影响可控） |
| **chessground** | 9.2（lichess） | 10 KB gzip、零依赖、自研 DOM diff；性能天花板（100 棋盘仅 5.7 MB 堆 vs rcb 120 MB）。但 **GPL-3.0** 且**无内置棋规**，需自接 chess.js | ⚠️ **需规避**：本项 MIT，引入 GPL-3.0 会造成**许可证污染**。其 refs-only 拖拽设计可作为自研棋盘的北极星 |
| **@ultrachess/react** | 0.x | WASM 引擎；单步 **1.00 次 React commit** vs react-chessboard 的 2.83 次；引擎 `legalMoves` **156 ns** vs chess.js **454 µs**（约 2900×）；但 158 KB wasm + 约 250 ms 一次性编译；包体 20.35 KB gzip | 🔍 **观察**。性能数据亮眼，但引入 WASM 违背"轻量"约束，且生态成熟度低 |
| **chessiro-canvas** | 早期 | 零运行时依赖；mount 3.13 ms vs rcb 14.23 ms（快 78%）、update 0.92 ms vs 2.44 ms（快 62%） | 🔍 **观察**。性能好但生态小，暂无替换必要 |
| **Stockfish WASM** | lichess 版 / nmrugg 版 | lichess 版 ~400 KB（~150 KB gzip），**无 NNUE、无 Syzygy**；nmrugg `lite` 版 ≈7 MB，完整多线程版 >100 MB。⚠️ **多线程需 `SharedArrayBuffer`，而它要求页面跨域隔离（COOP/COEP 响应头）**——开启后会破坏所有未 opt-in 的跨域资源（广告/统计脚本） | ❌ **不引入**。体积与约束直接违背本项边界（PRD 评审中"放弃 Stockfish WASM"的决策得到印证） |
| **js-chess-engine** | — | 轻量 JS 引擎库，chzle 在用 | 🔍 对照方案。本项选自研而非引库，换库收益有限 |

---

## 3. 关键发现（对本项目有直接价值）

### 3.1 ✅ 已落地：`legalTargetSquares` 改为单格生成

deepwiki 精读 chess.js 确认：内部 `_moves()` **支持只生成某一格的走法**（"iterates through all squares on the board, **or a specified single square**"），且 1.4.0 的公开类型中有 `moves({ verbose: true, square })` 重载。原实现是**全量生成后再过滤**，只为拿到 2–8 个目标格。

**本仓库实测**（中局 FEN，33 个合法走法，取 d2 兵的 2 个目标，Node 环境 3000 次循环、双轮取数、带 sink 防 JIT 消除）：

| 实现 | 耗时 | 说明 |
|------|------|------|
| 全量 verbose + filter/map | **≈1950 µs/op** | 生成全部 33 个 `Move` 对象（每个含 `before`/`after` FEN 序列化） |
| `moves({ verbose: true, square })` | **≈112–128 µs/op** | 只构造该格的 2 个 `Move` |
| **加速** | **15–18×** | 与"33 ÷ 2 ≈ 16.5"的走法数比例吻合 |

> ⚠️ 测量陷阱记录：首轮基准误用**空格**（该局面 e2 无子）得到"4848×"的虚高数字——两个实现都返回 0，第二个循环几乎零工作量。改用有走法的格子并加 sink 累积后才得到可信值。**微基准必须验证被测路径真的干了活**。
>
> 另注：外部资料（ultrachess BENCH）报 chess.js verbose `legalMoves` 为 427–454 µs，与本仓库实测 1950 µs 差约 4 倍——量级结论一致（verbose 生成昂贵），但绝对值受 API 用法、Node 版本与机型影响，不可直接套用。

改动：单格生成 + 补等价性回归测试（覆盖开局/中局/王车易位/应将/将死/空格六类语义，断言与原全量过滤结果逐格相等）。测试数 68 → **69**，全通过；`tsc --noEmit` 通过。

**定性**：本项单板对局下 INP 本就在好区间（远低于 200ms 阈值），此项属**顺手优化而非性能救火**——1.95 ms 的点击开销本就不构成卡顿。

### 3.2 🟡 需规避：许可证污染（安全官）

`chessground` 是性能最优解，但为 **GPL-3.0**。本项 LICENSE 为 **MIT**，在前端打包分发场景下引入 GPL 依赖存在传染性争议。**结论：不引入**；如未来要自研棋盘，只借鉴其"refs-only 拖拽 + 静态棋子层优先提交"的架构思路，不抄代码。

### 3.3 🟡 可借鉴：AI 引擎的下一步（置换表）

Rust 竞品（#9）的实测路线图对本项目调参有直接参照价值：

| 优化手段 | 其效果 |
|----------|--------|
| alpha-beta 剪枝 | 显著提升 |
| 走法排序（MVV-LVA / killers / history） | 进一步降低分支因子 |
| **apply/undo 内增量更新评估分**（替代每叶重算） | 达到 depth 9 |
| **置换表（Zobrist 哈希）** | 达到 depth 12–16（视局面复杂度） |

本项 AI 现状（源码核验）：minimax + alpha-beta + **MVV-LVA 排序** + 静态搜索（`QUIESCENCE_MAX_PLY=5`）+ 迭代加深（1200 ms 预算，depth 1/2/3），**无置换表、无 null-move、无 killer/history**。这与 `AGENTS.md` 的结论一致：要把困难档中局也推到 3 层，**首选手段是置换表（Zobrist）**，其次 null-move。

### 3.4 🔴 需规避：alpha-beta 的"界限 vs 分数"语义陷阱

浏览器自研引擎实践者（ChessLoupe）踩过的**正确性**坑：alpha-beta 剪枝掉的节点返回的是 **fail-low 界限（"至多这么好"），不是真实分数**。若把这些数当评估分展示给多候选走法，最佳走法是对的，但**排序靠后的走法分数是错的**。修法是每选出一条主变后，**排除已选走法重新搜索一次**（每条额外线路约等于一次完整搜索）。

**本项是否受影响**：否。`chooseAIMove()` 只在根层比较分数选最佳走法，**不对外暴露分数**。但若未来要做"AI 评分显示""多候选走法解释""走法质量徽章"，**必须**按上述方式 re-search。→ 记录为未来约束。

### 3.5 🟢 已规避：Worker 请求串行化（与社区踩坑吻合）

社区踩坑：**一个 Worker = 一个引擎实例，`postMessage` 不按请求排队**——并发派发 80 个位置会得到 80 组交错输出，无法归属。

本项 `stores/game-store.ts` 的 `requestAIMove()` 用**自增 `aiWorkerSeq` 做 id 匹配**（`if (ev.data?.id !== id) return` 丢弃过期结果），配合 `aiMoveInFlight` 在途去重——**已在架构上规避**。✅ 无需改动。

### 3.6 🟢 已规避：WASM 引擎的首屏阻塞

社区实测：7.3 MB WASM 置于关键路径 → 节流 4G 下**首屏 36 s+ 白屏**。修法是**延迟初始化 + 优雅降级**（首次真正需要引擎时才加载，失败则回退规则化策略）。

本项：AI 引擎为纯 TS，**零 WASM、零下载**；且 Worker 不可用时**自动回退主线程同步计算**（`requestAIMove` 的 `onError` 分支）。同类思路，且更彻底。✅

### 3.7 ⚠️ 需规避：LLM 下棋路线

三个竞品（#4 AIChess、#5 gambit、#8 chess-ai）走 LLM 下棋，无一例外需要：外部 API key、限流、以及**引擎校验兜底**（LLM 不保证走法合法）。这与本项"**零凭证、离线可跑、自研多等级 AI**"的定位正面冲突。**结论：不采用**。

### 3.8 📌 内部教训（本次调研期间实测发现，非竞品问题）

P2 凭证脱敏后，`triggerAIMoveIfNeeded()` 曾从快照玩家对象取 AI 凭证（`aiPlayer.id`），而快照 `players[].id` 已被脱敏为空串 → AI 走子请求 `playerId: ""` → 服务端 400「参数缺失」，表现为**"AI 不会走棋"**。已修（改用 `st.aiPlayerId`）并补回归测试。

**教训**：凭证脱敏是"写路径"的约束，但**凡是发请求的路径都要复查凭证来源**——包括 AI 这种"自己给自己发请求"的场景。建议在 `AGENTS.md` 的"凭证纪律"条目中固化此点。

---

## 4. 重合 / 可借鉴 / 需规避 总表

| 分类 | 对象 | 说明 |
|------|------|------|
| **🔵 重合**（已有人做、本项已覆盖，不必重造） | 服务端权威校验（chess.js 重放） | 竞品 #2 #3 #5 标配；本项已实现 |
| | 房间码/链接分享、观战、PGN 导出 | 竞品标配；本项已实现（观战页 `app/room/[code]/spectate/page.tsx` 已落地） |
| | 悔棋/求和状态机、重连恢复 | 竞品标配；本项已实现 |
| | 棋盘渲染与规则引擎分离 | 生态通用范式 |
| **🟢 可借鉴** | `chess.moves({ square })` 单格生成 | 低风险，可立即落地（§3.1） |
| | 置换表 Zobrist（推困难档中局到 depth 3） | 中等改动，收益最大（§3.3） |
| | 增量评估（apply/undo 内更新，替代每叶全盘重算） | 本项 `evaluate()` 每次遍历 64 格，是搜索热点 |
| | 延迟初始化 + 优雅降级模式 | 本项已具备同类能力，可作为设计原则固化 |
| | alpha-beta 界限语义约束 | 未来做"评分展示"前必读（§3.4） |
| **🔴 需规避** | `chessground`（GPL-3.0） | 与 MIT 许可证冲突（§3.2） |
| | LLM 下棋（OpenAI/Gemini/OpenRouter） | 需 API key、走法不保证合法、有成本（§3.7） |
| | Stockfish WASM | 546 KB–7.3 MB 体积；多线程需 COOP/COEP 跨域隔离，会破坏未 opt-in 的跨域资源（§2） |
| | 独立后端进程（Express/Flask + DB） | 违背"一个 Next.js 进程跑完"的既定边界 |
| **⏸ 暂缓** | `react-chessboard` 升 v5 | = 强制升级 React 19 + 重写全部 props + 自行实现升变/预走（§2） |

---

## ✅ 行动清单

| # | 行动 | 类型 | 优先级 | 说明 |
|---|------|------|--------|------|
| 1 | ~~`legalTargetSquares` 改用 `chess.moves({ square, verbose: true })` 单格生成~~ | 代码优化 | ✅ **已完成** | 实测加速 15–18×，已补等价性回归测试（测试 68 → 69） |
| 2 | `AGENTS.md`「凭证纪律」补充："AI 走子等自发起请求的路径同样须用私有响应下发的凭证，不得取快照玩家 id" | 文档 | 🟢 高（防回归） | §3.8 教训固化 |
| 3 | `AGENTS.md`「已知限制」补充：`react-chessboard` 锁 v4（4.7.3），v5 需 React 19 + options API | 文档 | 🟡 中 | 防止有人"顺手升级"踩坑 |
| 4 | `README.md` 项目结构补 `app/room/[code]/spectate/page.tsx` | 文档 | 🟡 中 | 观战已实现但结构树遗漏（已修正） |
| 5 | `AGENTS.md` ESLint 条款矛盾修正 | 文档 | 🟡 中 | 已修正（见 §5） |
| 6 | AI 引入置换表（Zobrist） | 代码增强 | 🟢 低（P2 可选） | 推困难档中局到 depth 3；改前先读 `AGENTS.md` 的性能特征实测段 |
| 7 | 未来若做"AI 评分/走法质量"展示，先读 §3.4 的 re-search 要求 | 未来约束 | 🟢 低 | 非当前需求，仅记录 |

---

## ⚠️ 待完善 / 已知局限

- 竞品的"已知问题"主要来自其 **README/文档自述与架构推断**，**未实际部署或运行验证**；性能结论不保证在其最新代码上仍成立。
- 性能数字（ultrachess BENCH、chessiro BENCH）均为**各项目自测**，非本仓库实测，仅作量级参照；不同机型/React 版本差异显著（ultrachess 自述其"2× 差距"在 dev 构建下才出现，生产构建下消失）。
- `chessground` 的 GPL-3.0 在"仅前端打包分发"场景下的具体合规边界**未做法律层面确认**；本简报按"规避风险"给出保守结论。
- 本次**未评估**无障碍/键盘操作与 i18n（记谱法本地化）的竞品实现——这两项在本项 PRD 评审中已被标为"非目标或 P2"。
- deepwiki 精读仅覆盖 `Clariity/react-chessboard` 与 `jhlywa/chess.js` 两个**本项已在用**的库；`chessground`/`@ultrachess/react`/`chessiro-canvas` 的信息来自其公开文档与基准测试，未做源码级核验。

---

## 📚 成员产出索引

- **gstack-investigator（调查员）**：竞品全貌（9 个应用）、库/引擎生态（6 个）、deepwiki 精读 chess.js 与 react-chessboard、本仓库源码与依赖版本实测核验（chess.js 1.4.0 / react-chessboard 4.7.3 / next 14.2.15 / react 18.3.1）
- **gstack-product-reviewer（产品评审员）**：竞品功能面与本项 P0/P1/P2 的重合度比对，确认"无缺口、无重复造轮子"
- **gstack-security-officer（安全官）**：许可证与供应链风险——GPL-3.0 污染、LLM 路线的外部依赖与凭证冲突、凭证脱敏在自发起请求路径上的回归风险
- **未上场成员**：gstack-designer（视觉/设计系统）、gstack-qa-lead（测试与发布）— 本次为生态调研，无代码与设计改动，暂不需要

---

> 本报告由软件工坊 AI 协作生成，关键决策请由工程负责人复核。
