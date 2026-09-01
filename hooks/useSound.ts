"use client";

import { useCallback, useRef } from "react";
import { useGameStore } from "@/stores/game-store";

type Tone = "move" | "check" | "end" | "capture";

// 复用单个 AudioContext：浏览器对同页实例数有限制（Chrome ~6 个），
// 每次播放新建会在连续事件（将杀+结束音）时创建失败
let sharedCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC) return null;
  let ctx = sharedCtx;
  if (!ctx) {
    ctx = new AC() as AudioContext;
    sharedCtx = ctx;
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

function playTone(kind: Tone) {
  const ctx = getAudioContext();
  if (!ctx) return;
  const now = ctx.currentTime;

  const presets: Record<Tone, { freq: number; dur: number; type: OscillatorType; gain: number }> = {
    move: { freq: 320, dur: 0.08, type: "sine", gain: 0.18 },
    capture: { freq: 200, dur: 0.12, type: "square", gain: 0.16 },
    check: { freq: 660, dur: 0.18, type: "triangle", gain: 0.2 },
    end: { freq: 440, dur: 0.4, type: "sawtooth", gain: 0.18 },
  };
  const p = presets[kind];
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = p.type;
  osc.frequency.value = p.freq;
  gain.gain.setValueAtTime(p.gain, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + p.dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + p.dur);
}

export function useSound() {
  const enabled = useGameStore((s) => s.soundEnabled);
  const ref = useRef(enabled);
  ref.current = enabled;

  const play = useCallback((kind: Tone) => {
    if (!ref.current) return;
    try {
      playTone(kind);
    } catch {
      /* ignore */
    }
  }, []);

  return { play };
}
