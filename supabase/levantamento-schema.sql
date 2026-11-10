-- Levantamento da estrutura do banco (somente leitura: não altera nada).
-- Como usar: Supabase → SQL Editor → New query → cole tudo → Run.
-- O resultado é uma única célula "schema". Copie o conteúdo dela e salve em
-- supabase/schema-atual.json, na pasta do projeto.

select json_build_object(
  'tabelas', (
    select json_agg(t order by t.tabela)
    from (
      select
        c.relname as tabela,
        c.relrowsecurity as rls_ativo,
        c.relforcerowsecurity as rls_forcado,
        (
          select json_agg(json_build_object(
            'coluna', a.attname,
            'tipo', format_type(a.atttypid, a.atttypmod),
            'obrigatoria', a.attnotnull,
            'padrao', pg_get_expr(d.adbin, d.adrelid)
          ) order by a.attnum)
          from pg_attribute a
          left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
          where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
        ) as colunas,
        (
          select json_agg(json_build_object(
            'nome', con.conname,
            'definicao', pg_get_constraintdef(con.oid)
          ))
          from pg_constraint con
          where con.conrelid = c.oid
        ) as restricoes,
        (
          select json_agg(pg_get_indexdef(i.indexrelid))
          from pg_index i
          where i.indrelid = c.oid
        ) as indices
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
    ) t
  ),
  'politicas_rls', (
    select json_agg(json_build_object(
      'tabela', tablename,
      'nome', policyname,
      'comando', cmd,
      'papeis', roles,
      'using', qual,
      'with_check', with_check
    ) order by tablename, policyname)
    from pg_policies
    where schemaname = 'public'
  ),
  'funcoes', (
    select json_agg(json_build_object(
      'nome', p.proname,
      'definicao', pg_get_functiondef(p.oid)
    ))
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  ),
  'triggers', (
    select json_agg(json_build_object(
      'tabela', c.relname,
      'nome', tg.tgname,
      'definicao', pg_get_triggerdef(tg.oid)
    ))
    from pg_trigger tg
    join pg_class c on c.oid = tg.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and not tg.tgisinternal
  ),
  'views', (
    select json_agg(json_build_object(
      'nome', viewname,
      'definicao', definition
    ))
    from pg_views
    where schemaname = 'public'
  )
) as schema;
