/**
 * 房间状态存储层（对外入口）。
 *
 * 原为单个 795 行的 store.ts，现按职责拆分：
 * - `constants` / `validate`：常量、限额与输入清洗
 * - `room` / `snapshot` / `presence` / `lifecycle`：存储单例、脱敏快照、在线状态、TTL 清扫
 * - `clock`：服务端权威计时（扣时、超时复核）
 * - `outcome`：终局状态的统一落地
 * - `lobby` / `chat` / `move` / `actions`：对局生命周期各环节
 *
 * 对外导出的名称与签名保持不变，调用方无需改动。
 */

export { RoomError } from "./constants";

export { sweepExpiredRooms } from "./lifecycle";
export { setConnected } from "./presence";

export { createRoom, getRoom, getSnapshot, joinAIRoom, joinRoom } from "./lobby";
export { sendChatAction } from "./chat";

export { applyMoveAction, type MoveOutcome } from "./move";
export {
  drawOfferAction,
  drawRespondAction,
  rematchAction,
  resignAction,
  takebackRequestAction,
  takebackRespondAction,
  timeoutAction,
} from "./actions";
