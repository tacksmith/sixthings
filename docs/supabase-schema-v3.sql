-- Six Things Web/PWA sync v3. Run once in Supabase SQL Editor; safe to rerun.
-- Requires Supabase anonymous authentication. Existing v2 data is preserved.
begin;

create table if not exists public.six_rooms (
  id uuid primary key,
  owner_id uuid not null references auth.users(id),
  revision bigint not null default 0 check (revision between 0 and 9007199254740991),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now()
);
create table if not exists public.six_members (
  room_id uuid not null references public.six_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  primary key (room_id, user_id)
);
create table if not exists public.six_invites (
  code text primary key,
  room_id uuid not null references public.six_rooms(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  expires_at timestamptz not null,
  used_by uuid references auth.users(id)
);
create table if not exists public.six_writes (
  room_id uuid not null references public.six_rooms(id) on delete cascade,
  id uuid not null,
  user_id uuid not null references auth.users(id),
  primary key (room_id, id)
);
create table if not exists public.six_legacy_rooms (
  legacy_room text primary key,
  room_id uuid not null references public.six_rooms(id) on delete cascade
);

alter table public.six_rooms enable row level security;
alter table public.six_members enable row level security;
alter table public.six_invites enable row level security;
alter table public.six_writes enable row level security;
alter table public.six_legacy_rooms enable row level security;
revoke all on public.six_rooms, public.six_members, public.six_invites,
  public.six_writes, public.six_legacy_rooms from public, anon, authenticated;
grant select on public.six_rooms, public.six_members to authenticated;
drop policy if exists six_members_read on public.six_members;
create policy six_members_read on public.six_members for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists six_rooms_read on public.six_rooms;
create policy six_rooms_read on public.six_rooms for select to authenticated using (
  exists (select 1 from public.six_members m where m.room_id = id and m.user_id = (select auth.uid()))
);

create or replace function public.six_get_room(p_room uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r public.six_rooms; members integer;
begin
  if auth.uid() is null or not exists (
    select 1 from public.six_members where room_id = p_room and user_id = auth.uid()
  ) then raise exception 'not a room member' using errcode = '42501'; end if;
  select * into strict r from public.six_rooms where id = p_room;
  select count(*) into members from public.six_members where room_id = p_room;
  return jsonb_build_object('room', r.id, 'revision', r.revision, 'data', r.data, 'members', members);
end $$;

create or replace function public.six_create_room(p_room uuid, p_data jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 1048576 then
    raise exception 'invalid document' using errcode = '22023';
  end if;
  insert into public.six_rooms(id, owner_id, data) values (p_room, auth.uid(), p_data) on conflict do nothing;
  if not exists (select 1 from public.six_rooms where id = p_room and owner_id = auth.uid()) then
    raise exception 'room already exists' using errcode = '42501';
  end if;
  insert into public.six_members(room_id, user_id) values (p_room, auth.uid()) on conflict do nothing;
  return public.six_get_room(p_room);
end $$;

create or replace function public.six_create_invite(p_room uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare invitation text; deadline timestamptz := now() + interval '10 minutes';
begin
  perform public.six_get_room(p_room);
  perform 1 from public.six_rooms where id = p_room for update;
  delete from public.six_invites where room_id = p_room and created_by = auth.uid() and used_by is null;
  loop
    invitation := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    begin
      insert into public.six_invites(code, room_id, created_by, expires_at)
        values (invitation, p_room, auth.uid(), deadline);
      exit;
    exception when unique_violation then null;
    end;
  end loop;
  return jsonb_build_object('code', invitation, 'expiresAt', deadline);
end $$;

create or replace function public.six_join_room(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare invitation public.six_invites;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select * into invitation from public.six_invites where code = upper(trim(p_code)) for update;
  if not found then raise exception 'invalid or expired invitation' using errcode = '22023'; end if;
  -- A retry after a lost response by the same member is idempotent.
  if invitation.used_by = auth.uid() and exists (
    select 1 from public.six_members where room_id = invitation.room_id and user_id = auth.uid()
  ) then return public.six_get_room(invitation.room_id); end if;
  if invitation.used_by is not null or invitation.expires_at <= now() then
    raise exception 'invalid or expired invitation' using errcode = '22023';
  end if;
  if invitation.created_by = auth.uid() then
    raise exception 'use this invitation on another device' using errcode = '22023';
  end if;
  insert into public.six_members(room_id, user_id) values (invitation.room_id, auth.uid()) on conflict do nothing;
  update public.six_invites set used_by = auth.uid() where code = invitation.code;
  return public.six_get_room(invitation.room_id);
end $$;

create or replace function public.six_write_room(p_room uuid, p_revision bigint, p_data jsonb, p_write_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare current_revision bigint;
begin
  select revision into current_revision from public.six_rooms where id = p_room for update;
  perform public.six_get_room(p_room);
  if p_revision is null or p_revision < 0 or p_write_id is null or p_data is null or jsonb_typeof(p_data) <> 'object' or octet_length(p_data::text) > 1048576 then
    raise exception 'invalid document' using errcode = '22023';
  end if;
  if exists (select 1 from public.six_writes where room_id = p_room and id = p_write_id and user_id = auth.uid()) then
    return public.six_get_room(p_room) || jsonb_build_object('applied', true);
  end if;
  if current_revision <> p_revision then
    return public.six_get_room(p_room) || jsonb_build_object('applied', false);
  end if;
  update public.six_rooms set data = p_data, revision = revision + 1, updated_at = now() where id = p_room;
  insert into public.six_writes(room_id, id, user_id) values (p_room, p_write_id, auth.uid());
  return public.six_get_room(p_room) || jsonb_build_object('applied', true);
end $$;

create or replace function public.six_leave_room(p_room uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.six_get_room(p_room);
  perform 1 from public.six_rooms where id = p_room for update;
  delete from public.six_invites where room_id = p_room and created_by = auth.uid();
  delete from public.six_members where room_id = p_room and user_id = auth.uid();
  if not exists (select 1 from public.six_members where room_id = p_room) then
    delete from public.six_rooms where id = p_room;
  end if;
end $$;

-- Existing devices can upgrade the same v2 room without exchanging new codes.
create or replace function public.six_migrate_legacy(p_legacy_room text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare old_row jsonb; new_room uuid; old_data jsonb; member uuid;
begin
  if auth.uid() is null or to_regclass('public.sync_data') is null then
    raise exception 'legacy room unavailable' using errcode = '42501';
  end if;
  select to_jsonb(s) into old_row from public.sync_data s where s.room = p_legacy_room for update;
  if old_row is null or not (auth.uid()::text = coalesce(old_row->>'host_uid','') or auth.uid()::text = coalesce(old_row->>'guest_uid','')) then
    raise exception 'not a legacy room member' using errcode = '42501';
  end if;
  select room_id into new_room from public.six_legacy_rooms where legacy_room = p_legacy_room;
  if new_room is null then
    new_room := gen_random_uuid();
    old_data := (old_row->>'data')::jsonb;
    perform public.six_create_room(new_room, old_data);
    foreach member in array array[(old_row->>'host_uid')::uuid, (old_row->>'guest_uid')::uuid] loop
      if member is not null then
        insert into public.six_members(room_id, user_id) values (new_room, member) on conflict do nothing;
      end if;
    end loop;
    insert into public.six_legacy_rooms(legacy_room, room_id) values (p_legacy_room, new_room);
  end if;
  return public.six_get_room(new_room);
end $$;

-- Once migrated, an old client must refresh instead of silently forking data.
create or replace function public.six_guard_legacy_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.six_legacy_rooms where legacy_room = new.room) then
    raise exception 'sync upgraded; refresh all devices' using errcode = '55000';
  end if;
  return new;
end $$;
do $$ begin
  if to_regclass('public.sync_data') is not null then
    execute 'drop trigger if exists six_legacy_write_guard on public.sync_data';
    execute 'create trigger six_legacy_write_guard before insert or update on public.sync_data for each row execute function public.six_guard_legacy_write()';
  end if;
end $$;

revoke all on function public.six_get_room(uuid), public.six_create_room(uuid,jsonb),
  public.six_create_invite(uuid), public.six_join_room(text), public.six_write_room(uuid,bigint,jsonb,uuid),
  public.six_leave_room(uuid), public.six_migrate_legacy(text), public.six_guard_legacy_write() from public, anon;
grant execute on function public.six_get_room(uuid), public.six_create_room(uuid,jsonb),
  public.six_create_invite(uuid), public.six_join_room(text), public.six_write_room(uuid,bigint,jsonb,uuid),
  public.six_leave_room(uuid), public.six_migrate_legacy(text) to authenticated;

-- Realtime is an acceleration only; clients also poll and retry pending writes.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') and not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'six_rooms'
  ) then alter publication supabase_realtime add table public.six_rooms; end if;
end $$;
notify pgrst, 'reload schema';
commit;
