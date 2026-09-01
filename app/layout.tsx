import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chess Arena · 在线国际象棋对战",
  description: "轻量级在线国际象棋对战平台，邀请好友即可实时对弈，无需注册。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
