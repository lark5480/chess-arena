import { z } from "zod";
import type { TimeLimit } from "@/types";
import { MAX_AVATAR_LEN, MAX_NAME_LEN, VALID_TIME_LIMITS } from "./constants";

/**
 * 入参清洗 schema（替代原手写 sanitize*）。
 *
 * 语义与原实现逐条对齐：
 * - 非字符串 / trim 后为空 → 回落 fallback
 * - 字符串 → trim + 截断到 MAX_NAME_LEN
 * - 失败走 .pipe() 兜底，不抛错
 */
export const playerNameSchema = (fallback: string) =>
  z
    .unknown()
    .transform((v): string => (typeof v === "string" ? v.trim() : ""))
    .pipe(z.string())
    .transform((s) => (s ? s.slice(0, MAX_NAME_LEN) : fallback));

/** 头像：非字符串 / 空 → undefined；否则截断到 MAX_AVATAR_LEN */
export const avatarSchema = z
  .unknown()
  .transform((v): string => (typeof v === "string" ? v.trim() : ""))
  .pipe(z.string())
  .transform((s) => (s ? s.slice(0, MAX_AVATAR_LEN) : undefined));

/**
 * 时限白名单校验：非 {0,300,600,900}（含非数字）一律回落 600。
 * 0 = 无限制，在白名单内，不会被 falsy 兜底吃掉。
 */
export const timeLimitSchema = z
  .number()
  .refine((v): v is TimeLimit => VALID_TIME_LIMITS.includes(v as TimeLimit))
  .catch(600);
