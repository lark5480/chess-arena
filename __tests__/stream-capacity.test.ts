import { test } from "node:test";
import assert from "node:assert/strict";
import {
  acquireSubscriberSlot,
  addSubscriber,
  broadcast,
  closeSubscribers,
  subscriberCount,
  totalSubscriberCount,
} from "../lib/realtime";

/** 用真实 ReadableStream 生成 controller，close/enqueue 行为与线上一致 */
function makeController(): ReadableStreamDefaultController<Uint8Array> {
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  new ReadableStream<Uint8Array>({
    start(c) {
      ctrl = c;
    },
  });
  return ctrl;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const OPTS = { maxPerRoom: 12, maxTotal: 300, staleMs: 130_000 };

// ===== 连接容量：达上限先回收僵尸，仍满才拒绝（修复"重连永远 429"） =====

test("容量检查：房间满时回收同玩家多余旧连接（重连残留），保留最新两条", () => {
  const code = "TCAP01";
  for (let i = 0; i < 6; i++) addSubscriber(code, makeController(), "p1");
  for (let i = 0; i < 6; i++) addSubscriber(code, makeController(), "p2");
  assert.equal(subscriberCount(code), 12);

  const slot = acquireSubscriberSlot(code, "p1", OPTS);
  assert.equal(slot, "ok");
  // p1 的 6 条只保留最新 2 条，回收 4 条
  assert.equal(subscriberCount(code), 8);
  closeSubscribers(code);
});

test("容量检查：清理超过平台时长上限的僵尸订阅", async () => {
  const code = "TCAP02";
  for (let i = 0; i < 12; i++) addSubscriber(code, makeController(), `p${i}`);
  await sleep(15);
  // staleMs = 5ms：建立于 15ms 前的订阅全部视为超龄僵尸
  const slot = acquireSubscriberSlot(code, "newcomer", { ...OPTS, staleMs: 5 });
  assert.equal(slot, "ok");
  assert.equal(subscriberCount(code), 0);
  closeSubscribers(code);
});

test("容量检查：真正的满员新鲜连接返回 room-full（不误杀活跃连接）", () => {
  const code = "TCAP03";
  for (let i = 0; i < 12; i++) addSubscriber(code, makeController(), `p${i}`);
  const slot = acquireSubscriberSlot(code, "newcomer", OPTS);
  assert.equal(slot, "room-full");
  assert.equal(subscriberCount(code), 12);
  closeSubscribers(code);
});

test("容量检查：全局连接数达上限返回 global-full", () => {
  // 补足到全局上限（前序用例若有余量则跳过差额）
  let i = 0;
  while (totalSubscriberCount() < 300) {
    addSubscriber(`TGLOBAL${i}`, makeController());
    i += 1;
  }
  const slot = acquireSubscriberSlot("TNEW", "p", OPTS);
  assert.equal(slot, "global-full");
  for (let j = 0; j < i; j++) closeSubscribers(`TGLOBAL${j}`);
});

test("回归：平台掐断残留（cancel 未触发）时反复重连不会堵死房间配额", async () => {
  const code = "TCAP04";
  const pid = "p-reconnect";
  // 模拟被平台掐断但 cancel() 未触发的残留订阅
  addSubscriber(code, makeController(), pid);
  await sleep(15);

  // 连续 15 次重连（每次都是新连接）：即使旧连接全是僵尸，也必须全部能连上
  for (let i = 0; i < 15; i++) {
    const slot = acquireSubscriberSlot(code, pid, { ...OPTS, staleMs: 5 });
    assert.equal(slot, "ok", `第 ${i + 1} 次重连应被接纳`);
    addSubscriber(code, makeController(), pid);
  }
  closeSubscribers(code);
});

// ===== 订阅结构升级（Set → Map）后的行为回归 =====

test("广播与清理：订阅结构升级后 broadcast / closeSubscribers 行为不变", async () => {
  const code = "TCAP05";
  let ctrl!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      ctrl = c;
    },
  });
  addSubscriber(code, ctrl);
  broadcast(code, {
    type: "chat",
    message: { id: "m1", from: "A", text: "hi", at: 1 },
  });
  const reader = stream.getReader();
  const { value } = await reader.read();
  const text = new TextDecoder().decode(value);
  assert.ok(text.includes("event: room"));
  assert.ok(text.includes('"chat"'));
  reader.releaseLock();

  closeSubscribers(code);
  assert.equal(subscriberCount(code), 0);
});
