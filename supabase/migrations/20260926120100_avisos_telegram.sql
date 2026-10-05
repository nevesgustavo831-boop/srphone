-- ===========================================================================
--  SR PHONE — AVISO NO TELEGRAM QUANDO CHEGA UM PEDIDO DE HORÁRIO (migração 2 de 2, opcional)
--  Rode DEPOIS da migração 1 (20260926120000_agenda.sql), no mesmo SQL Editor do Supabase.
--
--  O que isto faz: assim que um cliente pede um horário no site, o banco manda
--  uma mensagem para o Telegram da loja. A notificação chega no celular como a
--  de qualquer app, sem precisar instalar nada e sem loja de aplicativos.
--
--  O token do bot fica GUARDADO NO BANCO, numa tabela que a API não expõe.
--  Ele nunca vai para o código do site.
-- ===========================================================================

-- 1) extensão que deixa o banco fazer chamadas HTTP (já vem disponível no Supabase)
create extension if not exists pg_net with schema extensions;

-- 2) onde ficam o token e o destino. Ninguém lê esta tabela pela API:
--    RLS ligado e sem nenhuma política = nem anon nem authenticated enxergam.
create table if not exists public.config_avisos (
  id               int primary key default 1,
  telegram_token   text not null default '',
  telegram_chat_id text not null default '',
  link_agenda      text not null default '',
  ligado           boolean not null default true,
  constraint config_avisos_linha_unica check (id = 1)
);
insert into public.config_avisos (id) values (1) on conflict (id) do nothing;

alter table public.config_avisos enable row level security;
revoke all on table public.config_avisos from anon, authenticated;

-- 3) a mensagem
create or replace function public.avisar_telegram()
returns trigger
language plpgsql security definer set search_path = public, extensions, net
as $$
declare
  c   public.config_avisos%rowtype;
  txt text;
begin
  if new.status <> 'pendente' then
    return new;                       -- bloqueio manual do funcionário não avisa
  end if;

  select * into c from public.config_avisos where id = 1;
  if c.id is null or not c.ligado
     or coalesce(c.telegram_token,'') = '' or coalesce(c.telegram_chat_id,'') = '' then
    return new;                       -- não configurado: segue em frente, sem erro
  end if;

  txt := '🔔 Novo pedido de horário — SR Phone' || E'\n\n' ||
         '📅 ' || to_char(new.data, 'DD/MM/YYYY') || ' às ' || new.hora || E'\n' ||
         '👤 ' || coalesce(nullif(btrim(new.nome), ''), '(sem nome)') || E'\n' ||
         '💬 ' || coalesce(nullif(btrim(new.motivo), ''), '(sem assunto)') ||
         case when coalesce(btrim(new.telefone), '') <> ''
              then E'\n' || '📱 ' || new.telefone else '' end ||
         E'\n\n' || 'Ainda NÃO está confirmado. Abra a agenda para confirmar ou recusar.' ||
         case when coalesce(c.link_agenda,'') <> '' then E'\n' || c.link_agenda else '' end;

  perform net.http_post(
    url     := 'https://api.telegram.org/bot' || c.telegram_token || '/sendMessage',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object(
                 'chat_id', c.telegram_chat_id,
                 'text', txt,
                 'disable_web_page_preview', true)
  );
  return new;
exception when others then
  -- um aviso que falha JAMAIS pode derrubar o agendamento do cliente
  return new;
end;
$$;

drop trigger if exists tg_avisar_telegram on public.agendamentos;
create trigger tg_avisar_telegram
  after insert on public.agendamentos
  for each row execute function public.avisar_telegram();

-- 4) botão de teste: o funcionário logado pode disparar uma mensagem de teste
create or replace function public.testar_aviso()
returns text
language plpgsql security definer set search_path = public, extensions, net
as $$
declare c public.config_avisos%rowtype;
begin
  if not public.e_funcionario() then raise exception 'sem_permissao' using errcode='P0001'; end if;
  select * into c from public.config_avisos where id = 1;
  if c.id is null or coalesce(c.telegram_token,'') = '' or coalesce(c.telegram_chat_id,'') = '' then
    return 'nao_configurado';
  end if;
  perform net.http_post(
    url     := 'https://api.telegram.org/bot' || c.telegram_token || '/sendMessage',
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := jsonb_build_object('chat_id', c.telegram_chat_id,
                 'text', '✅ Teste da SR Phone: os avisos de agendamento estão funcionando.')
  );
  return 'enviado';
end;
$$;
revoke all on function public.testar_aviso() from public;
grant execute on function public.testar_aviso() to authenticated;

-- ===========================================================================
--  COMO PREENCHER (uma vez só)
--
--  1. No Telegram, procure por  @BotFather  e mande  /newbot
--     Escolha um nome e um usuário para o bot. Ele devolve um TOKEN,
--     algo como 8123456789:AAH-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
--
--  2. Abra uma conversa com o SEU bot e mande qualquer mensagem (um "oi").
--     Isso é obrigatório: o Telegram não deixa um bot falar primeiro.
--
--  3. Para descobrir o chat_id, abra no navegador, trocando o token:
--       https://api.telegram.org/bot SEU_TOKEN /getUpdates
--     (sem os espaços). Procure por  "chat":{"id":123456789
--     Esse número é o chat_id. Se for um grupo, começa com  -100
--
--  4. Volte aqui no SQL Editor e rode, trocando os três valores
--     (ENDERECO-DO-SITE = o endereço do site, o mesmo "url" do data/config.js):
--
--       update public.config_avisos set
--         telegram_token   = 'COLE_O_TOKEN_AQUI',
--         telegram_chat_id = 'COLE_O_CHAT_ID_AQUI',
--         link_agenda      = 'https://ENDERECO-DO-SITE/funcionario/',
--         ligado           = true
--       where id = 1;
--
--  5. Teste sem esperar cliente: rode
--       select public.testar_aviso();
--     Tem que voltar 'enviado' e chegar a mensagem no Telegram.
--     Se voltar 'sem_permissao', você não está logado como funcionário —
--     nesse caso rode primeiro o insert da tabela funcionarios (migração 1, item 4).
--
--  Para desligar os avisos a qualquer momento, sem apagar nada:
--       update public.config_avisos set ligado = false where id = 1;
--
--  MAIS DE UMA PESSOA: crie um grupo no Telegram, coloque o bot dentro,
--  mande uma mensagem no grupo e use o chat_id do grupo (o que começa com -100).
--  Aí todo mundo da loja recebe o mesmo aviso.
-- ===========================================================================
