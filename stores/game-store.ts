import { create } from "zustand";
import { applyMove, createGame, generatePgn, invertColor } from "@/lib/chess-engine";
import { chooseAIMove } from "@/lib/ai-engine";
import type {
  ChatMessage,
  Color,
  GameResult,
  MoveRecord,
  Player,
  RoomEvent,
  RoomStatus,
  TimeLimit,
  Clocks,
} from "@/types";

export interface BoardTheme {
  id: string;
  name: string;
  light: string;
  dark: string;
}

export const BOARD_THEMES: BoardTheme[] = [
  { id: "classic", name: "经典", light: "#eeeed2", dark: "#769656" },
  { id: "blue", name: "蓝调", light: "#dbe4ef", dark: "#4a6fa5" },
  { id: "green", name: "森林", light: "#e8f0d8", dark: "#5b8c4a" },
  { id: "gray", name: "灰阶", light: "#e9e9e9", dark: "#7d7d7d" },
];

interface LobbyInfo {
  code: string;
  playerId: string;
  myColor: Color;
  myName: string;
  mode: "friend" | "ai";
  aiPlayerId?: string;
  aiDifficulty?: number;
}

interface GameStore {
  // 大厅/身份
  code: string;
  playerId: string;
  /** 加入时的原始执子颜色（快照无 playerId，靠 gameNo 奇偶推导当前颜色） */
  initialColor: Color | null;
  myColor: Color | null;
  myName: string;
  mode: "friend" | "ai";
  aiPlayerId: string | null;
  aiDifficulty: number;

  // 房间状态
  status: RoomStatus;
  timeLimit: TimeLimit;
  gameNo: number;
  white: Player | null;
  black: Player | null;
  fen: string;
  turn: Color;
  clocks: Clocks | null;
  clockUpdatedAt: number;
  gameOver: boolean;
  result?: GameResult;
  moves: MoveRecord[];
  chat: ChatMessage[];
  drawOfferBy: Color | null;
  takebackBy: Color | null;
  opponentConnected: boolean;

  // 交互
  selectedSquare: string | null;
  legalTargets: string[];
  pendingPromotion: { from: string; to: string } | null;
  soundEnabled: boolean;
  theme: BoardTheme;
  error: string | null;
  viewIndex: number | null;
  setViewIndex: (i: number | null) => void;
  goToLive: () => void;
  toast: string | null;

  // actions
  setLobby: (info: LobbyInfo) => void;
  handleEvent: (e: RoomEvent) => void;
  selectSquare: (sq: string) => void;
  setLegalTargets: (sqs: string[]) => void;
  setPendingPromotion: (p: { from: string; to: string } | null) => void;
  clearSelection: () => void;
  setSoundEnabled: (v: boolean) => void;
  setTheme: (t: BoardTheme) => void;
  setToast: (t: string | null) => void;

  move: (from: string, to: string, promotion?: string) => Promise<void>;
  sendChat: (text: string) => Promise<void>;
  resign: () => Promise<void>;
  offerDraw: () => Promise<void>;
  respondDraw: (accept: boolean) => Promise<void>;
  requestTakeback: () => Promise<void>;
  respondTakeback: (accept: boolean) => Promise<void>;
  rematch: () => Promise<void>;
  declareTimeout: (target?: Color) => Promise<void>;
}

const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function playerOf(state: GameStore, color: Color): Player | null {
  return color === "white" ? state.white : state.black;
}

export const useGameStore = create<GameStore>((set, get) => ({
  code: "",
  playerId: "",
  initialColor: null,
  myColor: null,
  myName: "",
  mode: "friend",
  aiPlayerId: null,
  aiDifficulty: 2,

  status: "waiting",
  timeLimit: 600,
  gameNo: 1,
  white: null,
  black: null,
  fen: INITIAL_FEN,
  turn: "white",
  clocks: null,
  clockUpdatedAt: 0,
  gameOver: false,
  result: undefined,
  moves: [],
  chat: [],
  drawOfferBy: null,
  takebackBy: null,
  opponentConnected: true,

  selectedSquare: null,
  legalTargets: [],
  pendingPromotion: null,
  soundEnabled: true,
  theme: BOARD_THEMES[0],
  error: null,
  viewIndex: null,
  toast: null,

  setLobby: (info) =>
    set({
      code: info.code,
      playerId: info.playerId,
      initialColor: info.myColor,
      myColor: info.myColor,
      myName: info.myName,
      mode: info.mode,
      aiPlayerId: info.aiPlayerId ?? null,
      aiDifficulty: info.aiDifficulty ?? 2,
    }),

  handleEvent: (e) => {
    switch (e.type) {
      case "state":
        applyRoom(set, e.room);
        break;
      case "game_start":
        set({
          status: "playing",
          fen: e.fen,
          turn: e.turn,
          clocks: { white: e.timeLimit * 1000, black: e.timeLimit * 1000 },
          clockUpdatedAt: Date.now(),
          timeLimit: e.timeLimit,
          white: e.white,
          black: e.black,
          myColor: colorAtGame(get().initialColor, 1),
          moves: [],
          chat: [],
          gameOver: false,
          result: undefined,
          drawOfferBy: null,
          takebackBy: null,
          gameNo: 1,
          opponentConnected: true,
          pendingPromotion: null,
          error: null,
        });
        break;
      case "move": {
        const st = get();
        if (st.moves.some((m) => m.moveNumber === e.move.moveNumber)) break; // 乐观更新已存在
        set({
          fen: e.fen,
          turn: e.turn,
          moves: [...st.moves, e.move],
          gameOver: e.gameOver,
          result: e.result ?? st.result,
          selectedSquare: null,
          legalTargets: [],
          pendingPromotion: null,
          ...(e.clocks ? { clocks: { ...e.clocks } } : {}),
          clockUpdatedAt: Date.now(),
        });
        break;
      }
      case "chat":
        set((s) => ({ chat: [...s.chat, e.message] }));
        break;
      case "resign":
        set({
          gameOver: true,
          result: e.result,
          status: "finished",
          drawOfferBy: null,
          takebackBy: null,
          pendingPromotion: null,
        });
        break;
      case "draw_offer":
        set({ drawOfferBy: e.by });
        break;
      case "draw_accepted":
        set({
          gameOver: true,
          result: e.result,
          status: "finished",
          drawOfferBy: null,
          pendingPromotion: null,
        });
        break;
      case "draw_declined":
        set({ drawOfferBy: null });
        break;
      case "takeback_request":
        set({ takebackBy: e.by });
        break;
      case "takeback_accepted":
        set({
          fen: e.fen,
          moves: e.moves,
          turn: e.turn,
          takebackBy: null,
          selectedSquare: null,
          legalTargets: [],
          pendingPromotion: null,
          ...(e.clocks ? { clocks: { ...e.clocks } } : {}),
          clockUpdatedAt: Date.now(),
        });
        break;
      case "takeback_declined":
        set({ takebackBy: null });
        break;
      case "timeout":
        set({
          gameOver: true,
          result: e.result,
          status: "finished",
          drawOfferBy: null,
          takebackBy: null,
          pendingPromotion: null,
        });
        break;
      case "rematch":
        set({
          status: "playing",
          gameNo: e.gameNo,
          fen: e.fen,
          turn: e.turn,
          clocks: { white: e.timeLimit * 1000, black: e.timeLimit * 1000 },
          clockUpdatedAt: Date.now(),
          timeLimit: e.timeLimit,
          white: e.white,
          black: e.black,
          myColor: colorAtGame(get().initialColor, e.gameNo),
          moves: [],
          chat: [],
          gameOver: false,
          result: undefined,
          drawOfferBy: null,
          takebackBy: null,
          opponentConnected: true,
          pendingPromotion: null,
          error: null,
        });
        break;
    }
    // 对局结束 → 写入本地历史（去重后每个对局只写一次）
    const ended = get().result && get().gameOver;
    if (ended && lastRecordedGameId !== currentGameId()) {
      lastRecordedGameId = currentGameId();
      recordHistory();
    }
    // 人机模式：若轮到 AI，自动走子
    triggerAIMoveIfNeeded();
  },

  selectSquare: (sq) => set({ selectedSquare: sq }),
  setLegalTargets: (sqs) => set({ legalTargets: sqs }),
  setPendingPromotion: (p) => set({ pendingPromotion: p }),
  clearSelection: () => set({ selectedSquare: null, legalTargets: [] }),
  setSoundEnabled: (v) => set({ soundEnabled: v }),
  setTheme: (t) => set({ theme: t }),
  setToast: (t) => set({ toast: t }),
  setViewIndex: (i) => set({ viewIndex: i }),
  goToLive: () => set({ viewIndex: null, selectedSquare: null, legalTargets: [] }),

  move: async (from, to, promotion) => {
    const st = get();
    if (!st.code || !st.playerId) return;
    if (st.gameOver || st.status !== "playing" || st.turn !== st.myColor) return;

    // 乐观更新（本地即时反馈），失败时回滚
    const prevFen = st.fen;
    const prevTurn = st.turn;
    const tmp = createGame(st.fen);
    const r = applyMove(tmp, { from, to, promotion });
    if (!r.ok) {
      set({ error: r.error ?? "非法走子" });
      return;
    }
    set({
      fen: r.fen!,
      turn: invertColor(st.turn),
      selectedSquare: null,
      legalTargets: [],
      pendingPromotion: null,
    });

    try {
      const res = await fetch(`/api/rooms/${st.code}/move`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: st.playerId, from, to, promotion }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        set({ error: data.error ?? "走子失败" });
        await resync(set, get);
      }
    } catch {
      // 网络异常：回滚乐观更新，棋盘回到服务端认知的局面
      set({ error: "网络错误", fen: prevFen, turn: prevTurn });
    }
  },

  sendChat: async (text) => {
    const st = get();
    if (!st.code || !st.playerId) return;
    try {
      await fetch(`/api/rooms/${st.code}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: st.playerId, text }),
      });
    } catch {
      set({ error: "聊天发送失败" });
    }
  },

  resign: async () => {
    const st = get();
    if (!st.code || !st.playerId) return;
    await postAction(set, `/api/rooms/${st.code}/resign`, { playerId: st.playerId });
  },

  offerDraw: async () => {
    const st = get();
    if (!st.code || !st.playerId) return;
    await postAction(set, `/api/rooms/${st.code}/draw`, { playerId: st.playerId });
  },

  respondDraw: async (accept) => {
    const st = get();
    if (!st.code || !st.playerId) return;
    await postAction(set, `/api/rooms/${st.code}/draw`, {
      playerId: st.playerId,
      action: accept ? "accept" : "decline",
    });
  },

  requestTakeback: async () => {
    const st = get();
    if (!st.code || !st.playerId) return;
    await postAction(set, `/api/rooms/${st.code}/takeback`, { playerId: st.playerId });
  },

  respondTakeback: async (accept) => {
    const st = get();
    if (!st.code || !st.playerId) return;
    await postAction(set, `/api/rooms/${st.code}/takeback`, {
      playerId: st.playerId,
      action: accept ? "accept" : "decline",
    });
  },

  rematch: async () => {
    const st = get();
    if (!st.code || !st.playerId) return;
    await postAction(set, `/api/rooms/${st.code}/rematch`, { playerId: st.playerId });
  },

  declareTimeout: async (target) => {
    const st = get();
    if (!st.code || !st.playerId) return;
    await postAction(set, `/api/rooms/${st.code}/timeout`, {
      playerId: st.playerId,
      color: target,
    });
  },
}));

// ===== 内部工具 =====
function buildPgnFromState(): string {
  const st = useGameStore.getState();
  const chess = createGame();
  for (const m of st.moves) {
    try {
      chess.move({ from: m.from, to: m.to, promotion: m.promotion as any });
    } catch {
      /* skip */
    }
  }
  const res = st.result;
  const resultStr = res ? (res.winner ? (res.winner === "white" ? "1-0" : "0-1") : "1/2-1/2") : "*";
  return generatePgn(chess, {
    white: st.white?.name ?? "白方",
    black: st.black?.name ?? "黑方",
    result: resultStr,
  });
}

/** 当前对局的去重 id（code + gameNo），用于本地历史只记一次 */
function currentGameId(): string {
  const st = useGameStore.getState();
  return `${st.code}-${st.gameNo}`;
}
let lastRecordedGameId = "";

function recordHistory() {
  if (typeof window === "undefined") return;
  const st = useGameStore.getState();
  if (!st.code || !st.result) return;
  try {
    const key = "chess-arena-history";
    const raw = localStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    const id = `${st.code}-${st.gameNo}`;
    if (list.some((h: any) => h.id === id)) return;
    list.unshift({
      id,
      code: st.code,
      gameNo: st.gameNo,
      white: st.white?.name ?? "白方",
      black: st.black?.name ?? "黑方",
      result: st.result,
      endedAt: st.result.endedAt,
      pgn: buildPgnFromState(),
    });
    localStorage.setItem(key, JSON.stringify(list.slice(0, 50)));
  } catch {
    /* ignore */
  }
}

function applyRoom(set: (partial: Partial<GameStore>) => void, room: import("@/types").RoomState) {
  const st = useGameStore.getState();
  // 快照不含 playerId（凭证不下发）：颜色按 gameNo 奇偶从加入时的原始颜色推导
  const myColor = colorAtGame(st.initialColor, room.gameNo);
  // 对手按颜色推导，不假设固定执黑；尚未加入时视为在线
  const opponent = myColor ? room.players.find((p) => p.color !== myColor) : undefined;
  set({
    status: room.status,
    timeLimit: room.timeLimit,
    gameNo: room.gameNo,
    white: room.players.find((p) => p.color === "white") ?? null,
    black: room.players.find((p) => p.color === "black") ?? null,
    myColor,
    fen: room.currentFen,
    turn: room.turn,
    clocks: room.clocks ?? null,
    clockUpdatedAt: room.clockUpdatedAt ?? 0,
    gameOver: room.gameOver,
    result: room.result,
    moves: room.moves,
    chat: room.chat,
    drawOfferBy: room.draw?.by ?? null,
    takebackBy: room.takeback?.by ?? null,
    opponentConnected: opponent ? opponent.connected : true,
  });
}

async function postAction(set: (partial: Partial<GameStore>) => void, url: string, body: unknown) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      set({ error: data.error ?? "操作失败" });
    }
  } catch {
    set({ error: "网络错误" });
  }
}

async function resync(set: (partial: Partial<GameStore>) => void, get: () => GameStore) {
  const st = get();
  if (!st.code) return;
  try {
    const res = await fetch(`/api/rooms/${st.code}`);
    if (res.ok) {
      const room = (await res.json()) as import("@/types").RoomState;
      applyRoom(set, room);
    }
  } catch {
    /* ignore */
  }
}

/**
 * 事件与快照不携带 playerId（凭证不下发），颜色推导改为纯本地逻辑：
 * 以加入时的原始颜色为基准，每次 rematch（gameNo+1）服务端必翻转双方颜色，
 * 故当前颜色 = 原始颜色按 (gameNo-1) 奇偶翻转。断线错过 rematch 事件后
 * 靠快照的 gameNo 也能恢复正确颜色。
 */
function colorAtGame(initial: Color | null, gameNo: number): Color | null {
  if (!initial) return null;
  return (gameNo - 1) % 2 === 0 ? initial : invertColor(initial);
}

/** 供 hook 在 AI 回合触发走子 */
let aiMoveInFlight = false;

export function triggerAIMoveIfNeeded(): void {
  const st = useGameStore.getState();
  if (st.mode !== "ai" || !st.aiPlayerId) return;
  if (st.gameOver || st.status !== "playing") return;

  // AI 执子方不固定：新一局交换先后手后 AI 可能执白
  const aiPlayer = st.white?.isAI ? st.white : st.black?.isAI ? st.black : null;
  if (!aiPlayer || st.turn !== aiPlayer.color) return;
  // 在途去重：AI 思考期间其他事件（聊天/状态广播）不应重复派发搜索
  if (aiMoveInFlight) return;

  const fen = st.fen;
  const aiPlayerId = aiPlayer.id;
  const code = st.code;
  aiMoveInFlight = true;
  // 模拟思考延迟，体验更自然
  setTimeout(
    async () => {
      requestAIMove(
        fen,
        st.aiDifficulty ?? 2,
        async (move) => {
          aiMoveInFlight = false;
          if (!move) return;
          try {
            await fetch(`/api/rooms/${code}/move`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                playerId: aiPlayerId,
                from: move.from,
                to: move.to,
                promotion: move.promotion,
              }),
            });
          } catch {
            /* ignore：SSE 状态同步会驱动重试（轮次未变时下个事件再触发） */
          }
        },
        // Worker 异常兜底：标记完成并回退主线程同步计算一次
        () => {
          aiMoveInFlight = false;
          try {
            const fallbackMove = chooseAIMove(fen, useGameStore.getState().aiDifficulty ?? 2);
            if (fallbackMove) {
              fetch(`/api/rooms/${code}/move`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  playerId: aiPlayerId,
                  from: fallbackMove.from,
                  to: fallbackMove.to,
                  promotion: fallbackMove.promotion,
                }),
              }).catch(() => {});
            }
          } catch {
            /* ignore */
          }
        }
      );
    },
    500 + Math.random() * 600
  );
}

// ===== Web Worker 中执行 AI 搜索，避免阻塞主线程 =====
let aiWorker: Worker | null = null;
let aiWorkerSeq = 0;

function getAIWorker(): Worker | null {
  if (typeof window === "undefined" || typeof Worker === "undefined") return null;
  if (!aiWorker) {
    try {
      aiWorker = new Worker(new URL("../lib/ai.worker.ts", import.meta.url));
    } catch {
      return null; // 环境不支持时回退主线程同步计算（如测试环境）
    }
  }
  return aiWorker;
}

type AIMoveResult = { id: number; move: import("@/lib/ai-engine").AIMove | null };

function requestAIMove(
  fen: string,
  depth: number,
  onDone: (move: import("@/lib/ai-engine").AIMove | null) => void,
  onError?: () => void
): void {
  const worker = getAIWorker();
  if (!worker) {
    try {
      onDone(chooseAIMove(fen, depth));
    } catch {
      onError?.();
    }
    return;
  }
  const id = ++aiWorkerSeq;
  worker.onmessage = (ev: MessageEvent<AIMoveResult>) => {
    if (ev.data?.id !== id) return; // 丢弃过期请求的结果
    onDone(ev.data.move ?? null);
  };
  worker.onerror = () => {
    if (id !== aiWorkerSeq) return;
    aiWorker = null; // 下次重建 Worker
    onError?.();
  };
  try {
    worker.postMessage({ fen, depth, id });
  } catch {
    aiWorker = null;
    onError?.();
  }
}
