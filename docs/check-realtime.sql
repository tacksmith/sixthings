-- 检查 sync_data 是否在 realtime publication 中
select schemaname, tablename from pg_publication_tables
where pubname = 'supabase_realtime'
order by tablename;
