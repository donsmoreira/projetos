-- Emissão de NFS-e: habilitar na empresa e certificado digital A1
-- Rode DEPOIS de 20261114_servicos_nfse.sql.
--
-- Cadastro da empresa → "Nota fiscal de serviço (NFS-e)":
--   * caixa "Emissão de NFS-e" (habilita os dados de emissão);
--   * certificado digital A1 (.pfx/.p12) com a senha.
--
-- O certificado é enviado para a função "nfse-certificate" (no servidor),
-- que confere a senha, lê titular, CPF/CNPJ e validade e guarda o arquivo e a
-- senha CRIPTOGRAFADOS nesta tabela. Usuários não leem a tabela: a tela só vê
-- os dados públicos do certificado pela função company_certificate_info.

alter table public.companies
  add column if not exists nfse_enabled boolean not null default false;

create table if not exists public.company_certificates (
  company_id uuid primary key references public.companies (id) on delete cascade,
  kind text not null default 'A1' check (kind = 'A1'),
  subject_name text not null,
  document text,
  issuer text,
  valid_from timestamptz not null,
  valid_until timestamptz not null,
  file_name text,
  encrypted_pfx text not null,
  encrypted_password text not null,
  uploaded_by uuid,
  uploaded_at timestamptz not null default now()
);

alter table public.company_certificates enable row level security;
-- Sem políticas: só a função do servidor (chave secreta) lê e grava
revoke all on public.company_certificates from public, anon, authenticated;

-- Dados públicos do certificado da empresa (quem participa da empresa vê)
create or replace function public.company_certificate_info(p_company_id uuid)
returns table (
  kind text,
  subject_name text,
  document text,
  issuer text,
  valid_from timestamptz,
  valid_until timestamptz,
  file_name text,
  uploaded_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select c.kind, c.subject_name, c.document, c.issuer, c.valid_from, c.valid_until, c.file_name, c.uploaded_at
    from public.company_certificates c
   where c.company_id = p_company_id
     and exists (
       select 1 from public.company_members m
        where m.company_id = p_company_id and m.user_id = auth.uid()
     );
$$;

revoke all on function public.company_certificate_info(uuid) from public, anon;
grant execute on function public.company_certificate_info(uuid) to authenticated;

notify pgrst, 'reload schema';
