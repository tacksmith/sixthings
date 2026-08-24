-- ============================================================
-- 六件事 · 多端同步表结构 + RLS 数据隔离
-- 在 Supabase Dashboard → SQL Editor → New query 里粘贴运行
-- ============================================================

-- 0) 辅助函数：读取请求头里的 x-device-id（区分设备/用户）
create or replace function public.current_device_id() returns text
language sql stable as $$
  select coalesce(current_setting('request.headers', true)::json->>'x-device-id', '');
$$;

-- 1) 配对表：记录配对码、发起方、加入方
create table if not exists public.pairings (
  code text primary key,               -- 8位配对码
  host text not null,                  -- 发起方设备ID
  guest text,                          -- 加入方设备ID（配对后填充）
  status text not null default 'waiting',  -- waiting / paired
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes')
);

-- 2) 同步数据表：每个配对房间一行，存最新全量数据
create table if not exists public.sync_data (
  room text primary key,               -- 房间名（如 room-XXXX）
  data text not null,                  -- JSON 全量数据
  device text not null,                -- 最后写入的设备ID
  updated_at timestamptz not null default now()
);

-- 3) 索引
create index if not exists idx_pairings_status on public.pairings(status);
create index if not exists idx_sync_data_room on public.sync_data(room);

-- 4) 启用 RLS
alter table public.pairings enable row level security;
alter table public.sync_data enable row level security;

-- 5) 清理旧策略
drop policy if exists "pairings_insert" on public.pairings;
drop policy if exists "pairings_select_own" on public.pairings;
drop policy if exists "pairings_update_join" on public.pairings;
drop policy if exists "sync_data_select" on public.sync_data;
drop policy if exists "sync_data_insert" on public.sync_data;
drop policy if exists "sync_data_update" on public.sync_data;
drop policy if exists "sync_data_delete" on public.sync_data;

-- 6) pairings 策略
--    可创建（任何人发起配对）
create policy "pairings_insert" on public.pairings
  for insert with check (true);

--    可查看：自己的配对 + 所有等待中的配对（供他人扫码加入）
create policy "pairings_select" on public.pairings
  for select using (
    status = 'waiting'
    or host = public.current_device_id()
    or guest = public.current_device_id()
  );

--    可更新：加入等待中的配对；或自己的配对
create policy "pairings_update" on public.pairings
  for update using (
    status = 'waiting'
    or host = public.current_device_id()
  )
  with check (true);

-- 7) sync_data 策略（核心隔离：只能读写自己参与的房间）
--    判断当前设备是否为该房间的 host 或 guest
create policy "sync_data_select" on public.sync_data
  for select using (
    exists (
      select 1 from public.pairings p
      where 'room-' || p.code = sync_data.room
        and (p.host = public.current_device_id() or p.guest = public.current_device_id())
    )
  );

create policy "sync_data_insert" on public.sync_data
  for insert with check (
    exists (
      select 1 from public.pairings p
      where 'room-' || p.code = sync_data.room
        and (p.host = public.current_device_id() or p.guest = public.current_device_id())
    )
  );

create policy "sync_data_update" on public.sync_data
  for update using (
    exists (
      select 1 from public.pairings p
      where 'room-' || p.code = sync_data.room
        and (p.host = public.current_device_id() or p.guest = public.current_device_id())
    )
  );

-- 8) 验证表已创建
select tablename from pg_tables
where schemaname = 'public' and tablename in ('pairings','sync_data')
order by tablename;
