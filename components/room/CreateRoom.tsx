"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useGameStore } from "@/stores/game-store";
import { writeLobby } from "@/hooks/useRoomGame";
import { TIME_LIMIT_OPTIONS } from "@/lib/utils";
import type { LobbyInfo, TimeLimit } from "@/types";
import { Bot, Users } from "lucide-react";

export function CreateRoom() {
  const router = useRouter();
  const setLobby = useGameStore((s) => s.setLobby);
  const [name, setName] = useState("");
  const [timeLimit, setTimeLimit] = useState<TimeLimit>(600);
  const [mode, setMode] = useState<"friend" | "ai">("friend");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name || "玩家1", timeLimit }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "创建失败");

      const myName = name || "玩家1";
      if (mode === "ai") {
        const aiRes = await fetch(`/api/rooms/${data.code}/ai`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "🤖 电脑" }),
        });
        const aiData = await aiRes.json();
        if (!aiRes.ok) throw new Error(aiData.error || "加入电脑失败");
        const lobby: LobbyInfo = {
          code: data.code,
          playerId: data.playerId,
          myColor: "white",
          myName,
          mode: "ai",
          aiPlayerId: aiData.playerId,
        };
        writeLobby(lobby);
        setLobby(lobby);
      } else {
        const lobby: LobbyInfo = {
          code: data.code,
          playerId: data.playerId,
          myColor: "white",
          myName,
          mode: "friend",
        };
        writeLobby(lobby);
        setLobby(lobby);
      }
      router.push(`/room/${data.code}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建失败");
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <label className="mb-1 block text-xs text-muted">你的昵称</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="玩家1"
          className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-sm text-gray-100 outline-none focus:border-accent"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-muted">对局模式</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode("friend")}
            className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm ${
              mode === "friend" ? "border-accent bg-surface-2" : "border-border"
            }`}
          >
            <Users size={16} /> 好友对战
          </button>
          <button
            type="button"
            onClick={() => setMode("ai")}
            className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm ${
              mode === "ai" ? "border-accent bg-surface-2" : "border-border"
            }`}
          >
            <Bot size={16} /> 人机对战
          </button>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-muted">时限</label>
        <div className="grid grid-cols-4 gap-2">
          {TIME_LIMIT_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setTimeLimit(o.value)}
              className={`rounded-lg border px-2 py-2 text-sm ${
                timeLimit === o.value ? "border-accent bg-surface-2" : "border-border"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "创建中…" : "🎮 创建新对局"}
      </Button>
    </form>
  );
}
