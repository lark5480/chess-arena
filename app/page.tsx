"use client";

import Link from "next/link";
import { CreateRoom } from "@/components/room/CreateRoom";
import { JoinRoom } from "@/components/room/JoinRoom";
import { History } from "lucide-react";

export default function HomePage() {
  return (
    <div className="mx-auto flex min-h-screen max-w-5xl flex-col items-center px-4 py-10">
      <header className="mb-10 text-center">
        <div className="mb-2 text-5xl">♟️</div>
        <h1 className="text-3xl font-bold text-gray-100">Chess Arena</h1>
        <p className="mt-2 text-muted">轻量级在线国际象棋对战 · 邀请好友，无需注册即可开战</p>
      </header>

      <div className="grid w-full gap-6 md:grid-cols-2">
        <section className="rounded-2xl border border-border bg-surface p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-100">🎮 创建对局</h2>
          <CreateRoom />
        </section>

        <section className="rounded-2xl border border-border bg-surface p-6">
          <h2 className="mb-4 text-lg font-semibold text-gray-100">🔗 加入对局</h2>
          <JoinRoom />
        </section>
      </div>

      <div className="mt-8">
        <Link
          href="/history"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-4 py-2 text-sm text-gray-200 hover:border-accent"
        >
          <History size={16} /> 查看对局历史
        </Link>
      </div>

      <footer className="mt-auto pt-10 text-center text-xs text-muted">
        基于 Next.js 14 · chess.js · SSE 实时同步 · 本地零凭证即可运行
      </footer>
    </div>
  );
}
