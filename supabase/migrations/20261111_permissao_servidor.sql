-- Permissão para o papel de servidor do Supabase (service_role) nas tabelas.
--
-- A função "admin-users" (cadastrar usuário) usa a chave secreta, que entra no
-- banco como service_role. Neste projeto as tabelas criadas por SQL não deram
-- acesso automático a esse papel, e a função recebia "permission denied".
--
-- É seguro: o service_role só é usado dentro do Supabase com a chave secreta;
-- o site nunca tem essa chave. (É o padrão dos projetos Supabase.)
--
-- Como rodar: Supabase > SQL Editor > New query > colar tudo > Run.
-- Pode rodar mais de uma vez sem problema.

grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Tabelas e funções criadas depois também já nascem com acesso
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to service_role;

-- Conferência: deve listar o service_role com SELECT, INSERT, UPDATE e DELETE
select grantee, string_agg(privilege_type, ', ' order by privilege_type) as permissoes
  from information_schema.role_table_grants
 where table_schema = 'public'
   and table_name = 'profiles'
 group by grantee
 order by grantee;
