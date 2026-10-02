begin;

-- PostgREST 14 treats SQLSTATE 40001 as retryable. Optimistic version
-- conflicts are permanent for a given request, so expose them as HTTP 409
-- without changing any genuine serialization failure raised by PostgreSQL.
do $migration$
declare
  v_directory regprocedure := 'public.save_directory_record(text,uuid,uuid,bigint,uuid,jsonb)'::regprocedure;
  v_image regprocedure := 'public.set_directory_image(text,uuid,uuid,bigint,uuid,uuid,text,integer,integer,bigint)'::regprocedure;
  v_definition text;
  v_needle constant text := 'errcode=''40001''';
  v_replacement constant text := 'errcode=''PT409''';
  v_count integer;
begin
  select pg_catalog.pg_get_functiondef(v_directory) into v_definition;
  v_count := (pg_catalog.char_length(v_definition) - pg_catalog.char_length(pg_catalog.replace(v_definition,v_needle,'')))
    / pg_catalog.char_length(v_needle);
  if v_count <> 3 then
    raise exception 'Expected three custom 40001 conflicts in %, found %',v_directory::text,v_count;
  end if;
  execute pg_catalog.replace(v_definition,v_needle,v_replacement);

  select pg_catalog.pg_get_functiondef(v_image) into v_definition;
  v_count := (pg_catalog.char_length(v_definition) - pg_catalog.char_length(pg_catalog.replace(v_definition,v_needle,'')))
    / pg_catalog.char_length(v_needle);
  if v_count <> 1 then
    raise exception 'Expected one custom 40001 conflict in %, found %',v_image::text,v_count;
  end if;
  execute pg_catalog.replace(v_definition,v_needle,v_replacement);

  if pg_catalog.strpos(pg_catalog.pg_get_functiondef(v_directory),'40001') > 0
    or pg_catalog.strpos(pg_catalog.pg_get_functiondef(v_image),'40001') > 0 then
    raise exception 'A custom 40001 conflict remains after the migration';
  end if;
end
$migration$;

revoke all on function public.save_directory_record(text,uuid,uuid,bigint,uuid,jsonb)
  from public,anon,authenticated;
grant execute on function public.save_directory_record(text,uuid,uuid,bigint,uuid,jsonb)
  to authenticated;
revoke all on function public.set_directory_image(text,uuid,uuid,bigint,uuid,uuid,text,integer,integer,bigint)
  from public,anon,authenticated;
grant execute on function public.set_directory_image(text,uuid,uuid,bigint,uuid,uuid,text,integer,integer,bigint)
  to authenticated;

comment on function public.save_directory_record(text,uuid,uuid,bigint,uuid,jsonb) is
  'Owner-only transactional directory save. Complete payload, optimistic version, actor-scoped retry key; stale conflicts use PT409/HTTP 409; no hard delete.';
comment on function public.set_directory_image(text,uuid,uuid,bigint,uuid,uuid,text,integer,integer,bigint) is
  'Owner-only immutable directory image pointer update; stale conflicts use PT409/HTTP 409.';

commit;
