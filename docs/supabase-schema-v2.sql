-- ============================================================
-- 六件事 · 多端同步 RLS v2（基于 auth.uid()，支持 realtime 推送）
-- 在 Supabase SQL Editor 里运行
-- ============================================================

-- 1) 配对表：改用 uid 记录成员
alter table public.pairings add column if not exists host_uid uuid;
alter table public.pairings add column if not exists guest_uid uuid;

-- 2) 同步数据表：记录房间的两个成员 uid（隔离依据）
alter table public.sync_data add column if not exists host_uid uuid;
alter table public.sync_data add column if not exists guest_uid uuid;

-- 3) 清理旧策略（基于 request header 的）
drop policy if exists "pairings_insert" on public.pairings;
drop policy if exists "pairings_select" on public.pairings;
drop policy if exists "pairings_update" on public.pairings;
drop policy if exists "sync_data_select" on public.sync_data;
drop policy if exists "sync_data_insert" on public.sync_data;
drop policy if exists "sync_data_update" on public.sync_data;

-- 4) pairings 新策略
--    创建配对：登录用户可创建（把自己设为 host）
create policy "pairings_insert" on public.pairings
  for insert with check (
    auth.uid() is not null
    and host_uid = auth.uid()
  );

--    查看配对：自己的配对 + 所有等待中的（供他人加入）
create policy "pairings_select" on public.pairings
  for select using (
    status = 'waiting'
    or host_uid = auth.uid()
    or guest_uid = auth.uid()
  );

--    更新配对：加入等待中的；或自己的配对
create policy "pairings_update" on public.pairings
  for update using (
    status = 'waiting'
    or host_uid = auth.uid()
  )
  with check (true);

-- 5) sync_data 新策略（隔离：只有房间成员能读写）
create policy "sync_data_select" on public.sync_data
  for select using (
    auth.uid() = host_uid or auth.uid() = guest_uid
  );

create policy "sync_data_insert" on public.sync_data
  for insert with check (
    auth.uid() = host_uid or auth.uid() = guest_uid
  );

create policy "sync_data_update" on public.sync_data
  for update using (
    auth.uid() = host_uid or auth.uid() = guest_uid
  );

-- 6) 验证
select 'pairings' as tbl, column_name from information_schema.columns
where table_schema='public' and table_name='pairings' and column_name in ('host_uid','guest_uid')
union all
select 'sync_data', column_name from information_schema.columns
where table_schema='public' and table_name='sync_data' and column_name in ('host_uid','guest_uid');
