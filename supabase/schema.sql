-- Chess Arena · Supabase 数据模型（部署到 Vercel + Supabase 时启用）
-- 本文件对应 PRD 第五章。当前本地运行使用内存存储，无需此表；
-- 若改用 Supabase 持久化，请执行本 SQL 并配置 RLS 匿名读写策略。

-- 房间表
CREATE TABLE IF NOT EXISTS rooms (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_code   VARCHAR(6) UNIQUE NOT NULL,
  status      VARCHAR(20) DEFAULT 'waiting',
  time_limit  INTEGER DEFAULT 600,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ
);

-- 玩家表
CREATE TABLE IF NOT EXISTS players (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     UUID REFERENCES rooms(id),
  name        VARCHAR(50),
  color       VARCHAR(5) NOT NULL,
  connected   BOOLEAN DEFAULT true,
  joined_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (room_id, color)
);

-- 走棋记录表
CREATE TABLE IF NOT EXISTS moves (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     UUID REFERENCES rooms(id),
  move_number INTEGER NOT NULL,
  san         VARCHAR(10) NOT NULL,
  fen         TEXT NOT NULL,
  played_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (room_id, move_number)
);

-- 对局结果表
CREATE TABLE IF NOT EXISTS game_results (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     UUID REFERENCES rooms(id),
  game_no     INTEGER DEFAULT 1,
  winner      VARCHAR(5),
  reason      VARCHAR(30),
  ended_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 匿名可读写策略（开发/好友对战场景）
-- ⚠️ 生产环境请按需收紧，避免公开写入
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE moves ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_read" ON rooms FOR SELECT USING (true);
CREATE POLICY "anon_write" ON rooms FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_update" ON rooms FOR UPDATE USING (true);

CREATE POLICY "anon_read" ON players FOR SELECT USING (true);
CREATE POLICY "anon_write" ON players FOR INSERT WITH CHECK (true);
CREATE POLICY "anon_update" ON players FOR UPDATE USING (true);

CREATE POLICY "anon_read" ON moves FOR SELECT USING (true);
CREATE POLICY "anon_write" ON moves FOR INSERT WITH CHECK (true);

CREATE POLICY "anon_read" ON game_results FOR SELECT USING (true);
CREATE POLICY "anon_write" ON game_results FOR INSERT WITH CHECK (true);
