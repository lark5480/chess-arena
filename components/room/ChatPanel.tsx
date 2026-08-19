"use client";

import { useEffect, useRef, useState } from "react";
import { useGameStore } from "@/stores/game-store";
import { Send } from "lucide-react";

export function ChatPanel() {
  const chat = useGameStore((s) => s.chat);
  const sendChat = useGameStore((s) => s.sendChat);
  const myColor = useGameStore((s) => s.myColor);
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.length]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    sendChat(t);
    setText("");
  };

  return (
    <div className="flex h-full flex-col">
      <h3 className="mb-2 text-sm font-semibold text-gray-200">对局聊天</h3>
      <div className="flex-1 space-y-1 overflow-y-auto rounded-lg bg-surface-2 p-2 text-sm">
        {chat.length === 0 && <p className="text-muted">暂无消息</p>}
        {chat.map((m) => (
          <div key={m.id} className="leading-snug">
            {m.system ? (
              <span className="text-xs text-muted">· {m.text}</span>
            ) : (
              <span>
                <span
                  className={`font-medium ${
                    m.color === "white" ? "text-gray-100" : "text-accent-soft"
                  }`}
                >
                  {m.from}：
                </span>
                <span className="text-gray-200">{m.text}</span>
              </span>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <form onSubmit={submit} className="mt-2 flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="说点什么…"
          className="flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-gray-100 outline-none focus:border-accent"
        />
        <button
          type="submit"
          className="rounded-lg bg-accent px-3 py-2 text-white hover:bg-accent-soft"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
