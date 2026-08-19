# ♟️ 国际象棋在线对战平台 — PRD

---

## 一、产品概述

| 项目 | 说明 |
|------|------|
| **产品名称** | Chess Arena（暂定） |
| **产品定位** | 轻量级在线国际象棋对战平台，支持好友实时对弈 |
| **部署平台** | Vercel |
| **目标** | 创建一个可以邀请朋友一起下棋的Web应用，无需注册即可快速开局 |

---

## 二、目标用户

- 国际象棋爱好者（休闲玩家为主）
- 希望和朋友远程对弈的用户
- 不需要复杂排名/竞技系统的轻度用户

---

## 三、核心功能

### P0 — 必须实现（MVP）

| 功能模块 | 描述 |
|----------|------|
| 🎮 创建房间 | 玩家创建房间，生成唯一房间链接 |
| 🔗 加入房间 | 通过链接/房间号加入对局 |
| ♟️ 棋盘交互 | 拖拽/点击移动棋子，高亮合法走法 |
| 📡 实时同步 | 双方走棋实时同步，延迟 < 500ms |
| ✅ 规则引擎 | 完整国际象棋规则（将军、将死、逼和、王车易位、吃过路兵、升变，以及 50 步规则、三次重复局面、子力不足判和） |
| 🔄 回合控制 | 严格轮流制，非己方回合不可操作 |
| 🏁 对局结束 | 检测将死、逼和，展示结果（超时判负见 P1 计时器） |
| 📋 走棋记录 | 显示代数记谱法（如 e4, Nf3, O-O） |

### P1 — 重要增强

| 功能模块 | 描述 |
|----------|------|
| ⏱️ 计时器 | 可选时限（5min / 10min / 15min / 无限制），时间耗尽自动判负 |
| 💬 对局聊天 | 房间内简单文字聊天 |
| 🔄 悔棋请求 | 一方可请求悔棋，对方可同意/拒绝 |
| 🏳️ 认输 | 主动认输按钮 |
| 🤝 求和 | 提议和棋，对方可接受/拒绝 |
| 📊 对局历史 | 保存最近对局记录（localStorage 或数据库） |
| 🔁 再来一局 | 对局结束后一键重开，双方交换先后手 |

### P2 — 锦上添花

| 功能模块 | 描述 |
|----------|------|
| 👤 用户系统 | 简单昵称/头像（无需邮箱注册） |
| 🎨 主题切换 | 棋盘配色方案选择 |
| 🔊 音效 | 落子音效、将军提示音 |
| 📱 响应式 | 移动端完美适配 |
| 🤖 AI 对弈 | 集成 Stockfish WASM，支持人机对战 |
| 📤 分享棋谱 | 导出 PGN 格式 |
| 👁️ 观战模式 | 通过链接围观进行中的对局（对应页面 /room/[code]/spectate） |

---

## 四、技术架构

```
┌─────────────────────────────────────────────────────┐
│                    客户端 (Browser)                    │
│  Next.js + React + chess.js + react-chessboard       │
└──────────────────────┬──────────────────────────────┘
                       │ WebSocket / HTTP
                       ▼
┌─────────────────────────────────────────────────────┐
│                  Vercel Platform                      │
│                                                       │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │  Next.js    │  │  API Routes  │  │  Edge      │ │
│  │  Pages/SSR  │  │  (REST)      │  │  Functions │ │
│  └─────────────┘  └──────────────┘  └────────────┘ │
└──────────────────────┬──────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────┐
│              实时通信 & 数据存储                       │
│                                                       │
│  方案A: Supabase Realtime + PostgreSQL               │
│  方案B: Ably / Pusher (WebSocket as a Service)       │
│  方案C: Socket.io + Redis (Upstash)                  │
└─────────────────────────────────────────────────────┘
```

### 技术选型

| 层级 | 技术 | 理由 |
|------|------|------|
| **框架** | Next.js 14 (App Router) | SSR + API Routes 一体化，Vercel 原生支持 |
| **UI** | Tailwind CSS + shadcn/ui | 快速开发，美观 |
| **棋盘组件** | react-chessboard | 成熟的棋盘UI组件，支持拖拽 |
| **棋规引擎** | chess.js | 纯JS实现完整国际象棋规则 |
| **实时通信** | Supabase Realtime | 免费额度够用，无需自建WebSocket服务器 |
| **数据库** | Supabase (PostgreSQL) | 存储房间、对局记录 |
| **状态管理** | Zustand | 轻量，适合游戏状态 |
| **部署** | Vercel | 零配置部署，自动CI/CD |

### 为什么选 Supabase Realtime？

> Vercel 的 Serverless Functions 是**无状态**的，不适合维持 WebSocket 长连接。Supabase Realtime 提供了托管的 WebSocket 服务，免费计划支持 200 并发连接，完美适配此场景。

---

## 五、数据模型

```sql
-- 房间表
CREATE TABLE rooms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code   VARCHAR(6) UNIQUE NOT NULL,  -- 短房间号，如 "A3F9K2"；生成时校验唯一，碰撞则重生成
  status      VARCHAR(20) DEFAULT 'waiting', -- waiting | playing | finished
  time_limit  INTEGER DEFAULT 600,          -- 秒，0=无限制
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

-- 玩家表
CREATE TABLE players (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     UUID REFERENCES rooms(id),
  name        VARCHAR(50),
  color       VARCHAR(5) NOT NULL,  -- 'white' | 'black'
  connected   BOOLEAN DEFAULT true,
  joined_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (room_id, color)           -- 一个房间每色仅一人，防止重复加入同色
);

-- 走棋记录表
CREATE TABLE moves (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     UUID REFERENCES rooms(id),
  move_number INTEGER NOT NULL,
  san         VARCHAR(10) NOT NULL,   -- 标准代数记谱，如 "Nf3"
  fen         TEXT NOT NULL,          -- 走后的 FEN（最长约 90 字符，用 TEXT 避免截断）
  played_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (room_id, move_number)      -- 防止同一步被重复写入
);

-- 对局结果（一房可有多局，支持再来一局，故用自增主键而非 room_id 主键）
CREATE TABLE game_results (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     UUID REFERENCES rooms(id),
  game_no     INTEGER DEFAULT 1,       -- 第几局，再来一局累加
  winner      VARCHAR(5),             -- 'white' | 'black' | NULL(和棋)
  reason      VARCHAR(30),            -- checkmate | resignation | timeout | draw
  ended_at    TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 六、页面结构

```
/                     → 首页（创建房间 / 加入房间）
/room/[code]          → 对局房间（核心页面）
/room/[code]/spectate → 观战模式（P2）
/history              → 对局历史（P1）
```

### 首页设计

```
┌────────────────────────────────────┐
│         ♟️ Chess Arena             │
│                                    │
│   ┌──────────────────────────┐     │
│   │    🎮 创建新对局          │     │
│   └──────────────────────────┘     │
│                                    │
│   ─────── 或 ───────              │
│                                    │
│   ┌──────────────────────────┐     │
│   │  输入房间号: [______]    │     │
│   │         [加入对局]        │     │
│   └──────────────────────────┘     │
│                                    │
│   ⚙️ 设置: 时限 [5|10|15|∞]       │
└────────────────────────────────────┘
```

### 对局页面设计

```
┌──────────────────────────────────────────────┐
│  对手: Player2 (Black)    ⏱️ 08:32          │
│  ┌─────────────────────────────────────┐     │
│  │                                     │     │
│  │         ♟️ 棋  盘                   │     │
│  │        (8 x 8)                      │     │
│  │                                     │     │
│  └─────────────────────────────────────┘     │
│  你: Player1 (White)      ⏱️ 09:15          │
│                                              │
│  ┌──────────┐  ┌─────────────────────────┐  │
│  │ 走棋记录  │  │  操作按钮               │  │
│  │ 1. e4 e5 │  │  [认输] [求和] [悔棋]   │  │
│  │ 2. Nf3   │  └─────────────────────────┘  │
│  │          │  ┌─────────────────────────┐  │
│  │          │  │  💬 聊天区域             │  │
│  └──────────┘  └─────────────────────────┘  │
└──────────────────────────────────────────────┘
```

---

## 七、核心流程

### 7.1 创建 & 加入房间

```
玩家A                          服务器                         玩家B
  │                              │                              │
  │── POST /api/rooms ──────────▶│                              │
  │◀── { roomCode: "A3F9K2" } ──│                              │
  │                              │                              │
  │── 分享链接 ─────────────────────────────────────────────────▶│
  │                              │                              │
  │                              │◀── POST /api/rooms/join ─────│
  │                              │── 分配颜色，广播开始 ──────────▶│
  │◀── Realtime: game_start ────│── Realtime: game_start ─────▶│
```

### 7.1.1 颜色分配规则

- 创建房间者默认执白（先手），通过链接加入者执黑（后手）。
- 一房仅两人，每色一人（players 表已加 `(room_id, color)` 唯一约束）。
- 若需要"创建者可自选颜色"或"随机分配"，可作为后续增强，当前采用「创建者=白、加入者=黑」。

### 7.2 走棋同步

```
玩家A (White)                  Supabase Realtime              玩家B (Black)
  │                              │                              │
  │── 拖拽棋子 e2→e4            │                              │
  │── chess.js 验证合法性        │                              │
  │── broadcast('move', {       │                              │
  │     san: 'e4',              │                              │
  │     fen: '...'              │                              │
  │   }) ──────────────────────▶│                              │
  │                              │── Realtime push ────────────▶│
  │                              │                              │── 更新棋盘
  │                              │                              │── 切换回合
```

---

## 八、关键实现细节

### 8.1 规则校验 & 状态同步（朋友间玩，默认信任对方，不做防作弊）

```typescript
// 核心原则：在各自客户端用 chess.js 校验走子合法性（防止自己走错）；FEN 由当前走子方生成并同步给对方
function handleMove(from: string, to: string, promotion?: string) {
  const game = chessRef.current; // chess.js 实例
  
  // 1. 验证是否轮到自己
  if (game.turn() !== myColor) return false;
  
  // 2. 尝试走棋（chess.js 会自动验证合法性）
  const move = game.move({ from, to, promotion });
  if (!move) return false;
  
  // 3. 广播给对手
  broadcastMove(move.san, game.fen());
  
  // 4. 检查游戏是否结束
  if (game.isGameOver()) {
    handleGameOver(game);
  }
  
  return true;
}
```

### 8.1.1 升变交互

当兵走到对方底线需升变时，弹出选择框（皇后 / 车 / 象 / 马），默认推荐皇后；用户选择后带上 `promotion` 参数走棋（§8.1 的 `handleMove` 已支持该参数）。

### 8.1.2 和棋完整条件

除将死外，以下情况也判为和棋并结束对局：逼和（无合法走法且未被将军）、50 步规则、三次重复局面、双方子力不足（如王对王）。chess.js 的 `isStalemate()` / `isThreefoldRepetition()` / `isInsufficientMaterial()` / `isDraw()` 可直接调用。

### 8.2 断线重连

```typescript
// 玩家重新进入房间时
async function reconnectToRoom(roomCode: string) {
  // 1. 从数据库获取最新 FEN
  const { fen, moves } = await fetchGameState(roomCode);
  
  // 2. 恢复棋盘状态
  chessRef.current.load(fen);
  
  // 3. 重新订阅 Realtime 频道
  subscribeToRoom(roomCode);
}
```

### 8.3 计时器实现

```typescript
// 客户端倒计时（朋友间玩够用，超时由本端判断；非防作弊 / 防篡改设计）
function useChessTimer(initialSeconds: number, isActive: boolean) {
  const [timeLeft, setTimeLeft] = useState(initialSeconds);
  
  useEffect(() => {
    if (!isActive) return;
    const interval = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 0) {
          handleTimeout(); // 超时判负
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isActive]);
  
  return timeLeft;
}
```

---

## 九、项目结构

```
chess-arena/
├── app/
│   ├── page.tsx                    # 首页
│   ├── room/
│   │   └── [code]/
│   │       └── page.tsx            # 对局房间
│   ├── api/
│   │   ├── rooms/
│   │   │   ├── route.ts            # POST 创建房间
│   │   │   └── [code]/
│   │   │       ├── route.ts        # GET 房间信息
│   │   │       └── join/
│   │   │           └── route.ts    # POST 加入房间
│   │   └── moves/
│   │       └── route.ts            # POST 记录走棋（持久化）
│   └── layout.tsx
├── components/
│   ├── chess/
│   │   ├── ChessBoard.tsx          # 棋盘组件
│   │   ├── MoveHistory.tsx         # 走棋记录
│   │   ├── GameControls.tsx        # 操作按钮
│   │   └── PlayerInfo.tsx          # 玩家信息+计时器
│   ├── room/
│   │   ├── CreateRoom.tsx          # 创建房间表单
│   │   ├── JoinRoom.tsx            # 加入房间
│   │   └── WaitingRoom.tsx         # 等待对手
│   └── ui/                         # shadcn/ui 组件
├── lib/
│   ├── chess-engine.ts             # chess.js 封装
│   ├── supabase.ts                 # Supabase 客户端
│   ├── realtime.ts                 # Realtime 订阅管理
│   └── utils.ts
├── hooks/
│   ├── useChessGame.ts             # 游戏状态管理
│   ├── useRoom.ts                  # 房间状态
│   ├── useTimer.ts                 # 计时器
│   └── useRealtime.ts              # 实时通信
├── stores/
│   └── game-store.ts               # Zustand 状态
├── types/
│   └── index.ts                    # TypeScript 类型定义
└── package.json
```

---

## 十、依赖清单

```json
{
  "dependencies": {
    "next": "^14.2",
    "react": "^18.3",
    "react-dom": "^18.3",
    "chess.js": "^1.0.0",
    "react-chessboard": "^4.7",
    "@supabase/supabase-js": "^2.45",
    "@supabase/realtime-js": "^2.10",
    "zustand": "^4.5",
    "nanoid": "^5.0",
    "tailwindcss": "^3.4",
    "lucide-react": "^0.400"
  }
}
```

---

## 十一、开发里程碑

| 阶段 | 时间 | 交付物 |
|------|------|--------|
| **M1: 基础棋盘** | Day 1-2 | 棋盘渲染、棋子拖拽、规则验证（单机可玩） |
| **M2: 房间系统** | Day 3-4 | 创建/加入房间、等待页面、房间链接分享 |
| **M3: 实时对战** | Day 5-6 | Realtime 通信、走棋同步、回合控制 |
| **M4: 游戏结束** | Day 7 | 将死/逼和检测、结果展示、重新开始 |
| **M5: 计时器** | Day 8 | 倒计时、超时判负 |
| **M6: 体验优化** | Day 9-10 | 悔棋、认输、求和、聊天、移动端适配 |
| **M7: 部署上线** | Day 11 | Vercel 部署、域名配置、测试 |

---

## 十二、Vercel 部署配置

```typescript
// vercel.json
{
  "framework": "nextjs",
  "env": {
    "NEXT_PUBLIC_SUPABASE_URL": "@supabase-url",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY": "@supabase-anon-key"
  }
}
```

### 环境变量

| 变量 | 说明 |
|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 匿名密钥 |

---

## 十三、风险 & 应对

| 风险 | 影响 | 应对方案 |
|------|------|----------|
| Supabase 免费额度限制 | 200 并发连接 | 初期够用；超出后升级或换 Ably |
| 网络延迟导致状态不同步 | 双方棋盘不一致 | 以 FEN 为唯一真相源，每次走棋携带完整 FEN |
| 玩家中途关闭浏览器 | 对手卡在等待 | 心跳检测 + 30s 无响应提示 + 允许断线重连 |
| chess.js 规则边界 case | 罕见局面判断错误 | 锁定 chess.js 正式稳定版（已去掉 beta），补充单元测试覆盖升变 / 易位 / 逼和 / 子力不足等边界 |
| 数据库表未配访问规则 | 匿名用户读不到 / 写不了房间与走棋 | 给四张表配匿名可读写规则（Supabase 开启 RLS 并加允许策略），否则好友进不了房间 |
| Supabase 免费项目休眠 | 超过 7 天无访问会暂停，下次首开较慢 | 朋友玩频率低时会遇到，属正常现象，重新打开即恢复 |

---

## 十四、成功指标

- ✅ 两人可通过链接在 10 秒内开始对局
- ✅ 走棋延迟 < 500ms（以实际网络为准；Supabase 区域若选海外，国内访问可能偏高，建议 M3 前实测一次）
- ✅ 移动端可正常游玩
- ✅ 无需注册即可使用

---