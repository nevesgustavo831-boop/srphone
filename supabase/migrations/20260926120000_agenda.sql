-- ===========================================================================
--  SR PHONE — AGENDA DA LOJA (migração 1 de 2)
--  Duas formas de aplicar:
--   a) Supabase CLI:  supabase db push   (lê esta pasta supabase/migrations)
--   b) Painel: SQL Editor > cole TUDO isto > RUN. Depois faça o mesmo com a migração 2
--      (20260926120100_avisos_telegram.sql), se quiser aviso no Telegram.
--  Pode rodar de novo sem medo: tudo é "if not exists" / "create or replace".
--
--  ESTADOS DE UM HORÁRIO (coluna status)
--    pendente   o cliente pediu: o horário JÁ FICA RESERVADO para ele
--    confirmado a loja confirmou
--    cancelado  liberado de novo para outros clientes
--    bloqueado  a loja fechou esse horário (almoço, feriado...)
--  Pendente, confirmado e bloqueado ocupam o horário: nenhum outro cliente consegue pedir.
--
--  SEGURANÇA
--    - O site usa só a chave pública (anon). Ela NÃO lê a tabela: só chama as funções
--      horarios_ocupados (dia e hora ocupados, sem nome nem telefone) e solicitar_horario.
--    - Quem trabalha na loja entra com e-mail e senha (Supabase Auth) e precisa estar
--      na tabela funcionarios (ativo = true). Quem decide é o banco, não a tela.
--    - Desligue o cadastro livre: Authentication > Sign In / Providers > "Allow new users to sign up" = OFF.
--    - A chave service_role NUNCA vai para o site.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) TABELA DOS AGENDAMENTOS
-- ---------------------------------------------------------------------------
create table if not exists public.agendamentos (
  id             uuid primary key default gen_random_uuid(),
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid,                                -- funcionário que mexeu por último
  data           date not null,
  hora           text not null,                       -- "09:00", no horário de Brasília
  status         text not null default 'pendente',
  motivo         text not null default '',
  nome           text not null default '',
  telefone       text not null default '',
  obs            text not null default '',
  constraint agendamentos_status_ok
    check (status in ('pendente','confirmado','cancelado','bloqueado')),
  constraint agendamentos_hora_ok
    check (hora ~ '^[0-2][0-9]:[0-5][0-9]$'),
  constraint agendamentos_tamanhos_ok
    check (char_length(nome) <= 60 and char_length(telefone) <= 20
           and char_length(motivo) <= 120 and char_length(obs) <= 200)
);
alter table public.agendamentos add column if not exists atualizado_por uuid;

-- ---------------------------------------------------------------------------
-- 2) A TRAVA CONTRA DOIS CLIENTES NO MESMO HORÁRIO (garantida pelo banco)
--    Índice único parcial: só pode existir UM registro ocupando cada horário
--    (pendente, confirmado ou bloqueado). Se dois clientes pedirem o mesmo horário
--    no mesmo instante, o segundo recebe "horario_ocupado". Não dá para furar pelo navegador.
-- ---------------------------------------------------------------------------
drop index if exists public.agendamentos_horario_ocupado;   -- versão antiga

-- quem rodou a versão antiga pode ter pedidos pendentes repetidos no mesmo horário:
-- fica o mais antigo, os outros viram "cancelado" (com o motivo na observação)
update public.agendamentos a
   set status = 'cancelado', atualizado_em = now(),
       obs = left(btrim(a.obs || ' [cancelado automaticamente: horário já reservado por outro pedido]'), 200)
 where a.status = 'pendente'
   and exists (
     select 1 from public.agendamentos b
      where b.data = a.data and b.hora = a.hora and b.id <> a.id
        and (b.status in ('confirmado','bloqueado')
             or (b.status = 'pendente' and (b.criado_em, b.id) < (a.criado_em, a.id)))
   );

create unique index if not exists agendamentos_horario_reservado
  on public.agendamentos (data, hora)
  where status in ('pendente','confirmado','bloqueado');

create index if not exists agendamentos_data_idx on public.agendamentos (data);
create index if not exists agendamentos_status_idx on public.agendamentos (status);
create index if not exists agendamentos_criado_idx on public.agendamentos (criado_em);

-- ---------------------------------------------------------------------------
-- 3) GRADE DE HORÁRIOS DA LOJA (o servidor só aceita pedido dentro dela)
--    dia_semana: 0 = domingo ... 6 = sábado. Mantenha IGUAL a STORE_CONFIG.agenda
--    (data/config.js): horarios (segunda a sexta), horariosSabado e diasFechados.
--    Para mudar: delete from public.agenda_horarios where dia_semana = 6;
--                insert into public.agenda_horarios values (6,'09:00'),(6,'10:00');
-- ---------------------------------------------------------------------------
create table if not exists public.agenda_horarios (
  dia_semana int  not null check (dia_semana between 0 and 6),
  hora       text not null check (hora ~ '^[0-2][0-9]:[0-5][0-9]$'),
  primary key (dia_semana, hora)
);
insert into public.agenda_horarios (dia_semana, hora)
select d, h
  from unnest(array[1,2,3,4,5]) d,
       unnest(array['09:00','10:00','11:00','13:00','14:00','15:00','16:00','17:00']) h
on conflict do nothing;
insert into public.agenda_horarios (dia_semana, hora)
select 6, h from unnest(array['09:00','10:00','11:00','12:00']) h
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 4) QUEM É FUNCIONÁRIO
--    Só quem estiver nesta tabela (e ativo) enxerga e mexe na agenda.
--    Depois de criar o usuário em Authentication > Users > Add user, rode:
--      insert into public.funcionarios (user_id, nome)
--      select id, 'Nome da pessoa' from auth.users where email = 'email@dela';
--    Para tirar o acesso sem apagar o histórico:
--      update public.funcionarios set ativo = false
--       where user_id = (select id from auth.users where email = 'email@dela');
-- ---------------------------------------------------------------------------
create table if not exists public.funcionarios (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  nome      text not null default '',
  ativo     boolean not null default true,
  criado_em timestamptz not null default now()
);
alter table public.funcionarios add column if not exists ativo boolean not null default true;

create or replace function public.e_funcionario()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.funcionarios f where f.user_id = auth.uid() and f.ativo);
$$;

-- ---------------------------------------------------------------------------
-- 5) TRAVAS DE ACESSO (RLS)
--    Ninguém de fora lê as tabelas. Nem nome, nem telefone, nem motivo.
--    O site público só enxerga a agenda através das funções do item 6.
-- ---------------------------------------------------------------------------
alter table public.agendamentos    enable row level security;
alter table public.funcionarios    enable row level security;
alter table public.agenda_horarios enable row level security;

drop policy if exists "funcionario le agendamentos"     on public.agendamentos;
drop policy if exists "funcionario cria agendamentos"   on public.agendamentos;
drop policy if exists "funcionario altera agendamentos" on public.agendamentos;
drop policy if exists "funcionario apaga agendamentos"  on public.agendamentos;
create policy "funcionario le agendamentos"
  on public.agendamentos for select to authenticated using (public.e_funcionario());
create policy "funcionario cria agendamentos"
  on public.agendamentos for insert to authenticated with check (public.e_funcionario());
create policy "funcionario altera agendamentos"
  on public.agendamentos for update to authenticated
  using (public.e_funcionario()) with check (public.e_funcionario());
create policy "funcionario apaga agendamentos"
  on public.agendamentos for delete to authenticated using (public.e_funcionario());

drop policy if exists "funcionario se ve" on public.funcionarios;
create policy "funcionario se ve"
  on public.funcionarios for select to authenticated using (user_id = auth.uid());

drop policy if exists "funcionario le horarios" on public.agenda_horarios;
create policy "funcionario le horarios"
  on public.agenda_horarios for select to authenticated using (public.e_funcionario());

-- ---------------------------------------------------------------------------
-- 6) O QUE O SITE PÚBLICO PODE VER: só dia e hora que estão ocupados
--    (pendente, confirmado ou bloqueado). Nenhum nome, telefone ou motivo sai daqui.
--    Período limitado a 62 dias por consulta.
-- ---------------------------------------------------------------------------
create or replace function public.horarios_ocupados(de date, ate date)
returns table (data date, hora text)
language sql stable security definer set search_path = public
as $$
  select a.data, a.hora
  from public.agendamentos a
  where a.status in ('pendente','confirmado','bloqueado')
    and a.data >= de and a.data <= least(ate, de + 62);
$$;

-- ---------------------------------------------------------------------------
-- 7) O CLIENTE PEDE UM HORÁRIO
--    Entra como "pendente" e o horário JÁ FICA RESERVADO para ele. A loja confirma
--    pelo WhatsApp ou cancela. Tudo é validado AQUI, no servidor (fuso de Brasília):
--    grade da loja, data e horário passados, horário ocupado, nome, telefone,
--    pedido repetido e excesso de pedidos (proteção contra robô e spam).
-- ---------------------------------------------------------------------------
create or replace function public.solicitar_horario(
  p_data     date,
  p_hora     text,
  p_motivo   text,
  p_nome     text,
  p_telefone text default ''
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id     uuid;
  v_hoje   date := (now() at time zone 'America/Sao_Paulo')::date;
  v_agora  time := (now() at time zone 'America/Sao_Paulo')::time;
  v_nome   text := btrim(regexp_replace(coalesce(p_nome, ''), '[<>[:cntrl:]]', '', 'g'));
  v_tel    text := btrim(regexp_replace(coalesce(p_telefone, ''), '[^0-9()+ -]', '', 'g'));
  v_dig    text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_motivo text := left(btrim(regexp_replace(coalesce(p_motivo, ''), '[<>[:cntrl:]]', '', 'g')), 120);
begin
  if p_hora is null or p_hora !~ '^[0-2][0-9]:[0-5][0-9]$' then
    raise exception 'hora_invalida' using errcode = 'P0001';
  end if;
  if char_length(v_nome) < 2 or char_length(v_nome) > 60 or v_nome ~ '[0-9]' then
    raise exception 'nome_invalido' using errcode = 'P0001';
  end if;
  -- o WhatsApp é obrigatório: é por ele que a loja confirma
  if char_length(v_tel) > 20 or char_length(v_dig) < 10 or char_length(v_dig) > 13 then
    raise exception 'telefone_invalido' using errcode = 'P0001';
  end if;
  if p_data is null or p_data < v_hoje or p_data > v_hoje + 30 then
    raise exception 'data_fora_do_periodo' using errcode = 'P0001';
  end if;
  if p_data = v_hoje and p_hora::time <= v_agora then
    raise exception 'horario_passado' using errcode = 'P0001';
  end if;
  -- só horários da grade da loja (nada de 03:00 nem domingo)
  if not exists (select 1 from public.agenda_horarios g
                  where g.dia_semana = extract(dow from p_data)::int and g.hora = p_hora) then
    raise exception 'fora_do_horario' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.agendamentos a
    where a.data = p_data and a.hora = p_hora
      and a.status in ('pendente','confirmado','bloqueado')
  ) then
    raise exception 'horario_ocupado' using errcode = 'P0001';
  end if;
  -- o mesmo WhatsApp não reserva dois horários no mesmo dia (evita pedido repetido)
  if exists (
    select 1 from public.agendamentos a
    where a.data = p_data and a.status in ('pendente','confirmado')
      and regexp_replace(a.telefone, '\D', '', 'g') = v_dig
  ) then
    raise exception 'pedido_duplicado' using errcode = 'P0001';
  end if;
  -- no máximo 2 pedidos pendentes futuros por WhatsApp
  if (select count(*) from public.agendamentos a
       where a.status = 'pendente' and a.data >= v_hoje
         and regexp_replace(a.telefone, '\D', '', 'g') = v_dig) >= 2 then
    raise exception 'limite_por_telefone' using errcode = 'P0001';
  end if;
  -- proteção contra robô: muitos pedidos novos em pouco tempo, de qualquer origem
  if (select count(*) from public.agendamentos a
       where a.status = 'pendente' and a.criado_em > now() - interval '10 minutes') >= 15 then
    raise exception 'muitos_pedidos' using errcode = 'P0001';
  end if;

  insert into public.agendamentos (data, hora, status, motivo, nome, telefone)
  values (p_data, p_hora, 'pendente', v_motivo, left(v_nome, 60), left(v_tel, 20))
  returning id into v_id;

  return v_id;
exception
  -- dois pedidos no mesmo instante: o índice do item 2 barra o segundo
  when unique_violation then
    raise exception 'horario_ocupado' using errcode = 'P0001';
end;
$$;

-- ---------------------------------------------------------------------------
-- 8) AÇÕES DO FUNCIONÁRIO (todas conferem e_funcionario() no servidor)
-- ---------------------------------------------------------------------------
create or replace function public.confirmar_agendamento(p_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare v_n int;
begin
  if not public.e_funcionario() then raise exception 'sem_permissao' using errcode='P0001'; end if;
  update public.agendamentos
     set status = 'confirmado', atualizado_em = now(), atualizado_por = auth.uid()
   where id = p_id and status = 'pendente';
  get diagnostics v_n = row_count;
  if v_n = 0 then return 'nao_encontrado'; end if;
  return 'ok';
exception
  when unique_violation then return 'ocupado';
end;
$$;

create or replace function public.cancelar_agendamento(p_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare v_n int;
begin
  if not public.e_funcionario() then raise exception 'sem_permissao' using errcode='P0001'; end if;
  update public.agendamentos
     set status = 'cancelado', atualizado_em = now(), atualizado_por = auth.uid()
   where id = p_id and status in ('pendente','confirmado','bloqueado');
  get diagnostics v_n = row_count;
  return case when v_n = 0 then 'nao_encontrado' else 'ok' end;
end;
$$;

create or replace function public.remarcar_agendamento(p_id uuid, p_data date, p_hora text)
returns text
language plpgsql security definer set search_path = public
as $$
declare v_st text; v_n int;
begin
  if not public.e_funcionario() then raise exception 'sem_permissao' using errcode='P0001'; end if;
  if p_hora !~ '^[0-2][0-9]:[0-5][0-9]$' then raise exception 'hora_invalida' using errcode='P0001'; end if;
  select status into v_st from public.agendamentos where id = p_id;
  if v_st is null then return 'nao_encontrado'; end if;
  if exists (
    select 1 from public.agendamentos a
    where a.data = p_data and a.hora = p_hora and a.id <> p_id
      and a.status in ('pendente','confirmado','bloqueado')
  ) then
    return 'ocupado';
  end if;
  update public.agendamentos
     set data = p_data, hora = p_hora, atualizado_em = now(), atualizado_por = auth.uid()
   where id = p_id;
  get diagnostics v_n = row_count;
  return case when v_n = 0 then 'nao_encontrado' else 'ok' end;
exception
  when unique_violation then return 'ocupado';
end;
$$;

create or replace function public.bloquear_horario(p_data date, p_hora text, p_obs text default '')
returns text
language plpgsql security definer set search_path = public
as $$
begin
  if not public.e_funcionario() then raise exception 'sem_permissao' using errcode='P0001'; end if;
  if p_hora !~ '^[0-2][0-9]:[0-5][0-9]$' then raise exception 'hora_invalida' using errcode='P0001'; end if;
  insert into public.agendamentos (data, hora, status, motivo, nome, obs, atualizado_por)
  values (p_data, p_hora, 'bloqueado', 'Bloqueio da loja', '', left(coalesce(p_obs,''), 200), auth.uid());
  return 'ok';
exception
  when unique_violation then return 'ocupado';
end;
$$;

-- fecha o dia inteiro (feriado, inventário): bloqueia todos os horários livres da grade
create or replace function public.bloquear_dia(p_data date, p_obs text default '')
returns integer
language plpgsql security definer set search_path = public
as $$
declare v_n int := 0; h text;
begin
  if not public.e_funcionario() then raise exception 'sem_permissao' using errcode='P0001'; end if;
  for h in select g.hora from public.agenda_horarios g where g.dia_semana = extract(dow from p_data)::int loop
    begin
      insert into public.agendamentos (data, hora, status, motivo, nome, obs, atualizado_por)
      values (p_data, h, 'bloqueado', 'Bloqueio da loja', '', left(coalesce(p_obs,''), 200), auth.uid());
      v_n := v_n + 1;
    exception when unique_violation then null;   -- já ocupado: segue
    end;
  end loop;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9) LIMPEZA E LGPD
--    limpar_pendentes_vencidos: pedidos pendentes que já passaram da data.
--    apagar_dados_antigos: apaga agendamentos com mais de N dias (padrão 180),
--    para não guardar nome e telefone além do necessário.
--    Rode à mão de vez em quando, ou agende em Database > Cron.
-- ---------------------------------------------------------------------------
create or replace function public.limpar_pendentes_vencidos()
returns integer
language plpgsql security definer set search_path = public
as $$
declare v_n int;
begin
  if not public.e_funcionario() then raise exception 'sem_permissao' using errcode='P0001'; end if;
  delete from public.agendamentos
   where status = 'pendente'
     and data < (now() at time zone 'America/Sao_Paulo')::date;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

create or replace function public.apagar_dados_antigos(p_dias int default 180)
returns integer
language plpgsql security definer set search_path = public
as $$
declare v_n int;
begin
  if not public.e_funcionario() then raise exception 'sem_permissao' using errcode='P0001'; end if;
  delete from public.agendamentos
   where data < (now() at time zone 'America/Sao_Paulo')::date - greatest(coalesce(p_dias, 180), 30);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------------
-- 10) QUEM PODE CHAMAR CADA FUNÇÃO E LER CADA TABELA
-- ---------------------------------------------------------------------------
revoke all on function public.horarios_ocupados(date, date)                   from public;
revoke all on function public.solicitar_horario(date, text, text, text, text) from public;
revoke all on function public.confirmar_agendamento(uuid)                     from public;
revoke all on function public.cancelar_agendamento(uuid)                      from public;
revoke all on function public.remarcar_agendamento(uuid, date, text)          from public;
revoke all on function public.bloquear_horario(date, text, text)              from public;
revoke all on function public.bloquear_dia(date, text)                        from public;
revoke all on function public.limpar_pendentes_vencidos()                     from public;
revoke all on function public.apagar_dados_antigos(int)                       from public;
revoke all on function public.e_funcionario()                                 from public;

grant execute on function public.horarios_ocupados(date, date)                   to anon, authenticated;
grant execute on function public.solicitar_horario(date, text, text, text, text) to anon, authenticated;
grant execute on function public.confirmar_agendamento(uuid)                     to authenticated;
grant execute on function public.cancelar_agendamento(uuid)                      to authenticated;
grant execute on function public.remarcar_agendamento(uuid, date, text)          to authenticated;
grant execute on function public.bloquear_horario(date, text, text)              to authenticated;
grant execute on function public.bloquear_dia(date, text)                        to authenticated;
grant execute on function public.limpar_pendentes_vencidos()                     to authenticated;
grant execute on function public.apagar_dados_antigos(int)                       to authenticated;
grant execute on function public.e_funcionario()                                 to authenticated;

-- o site público NÃO tem acesso direto às tabelas, só às funções acima
revoke all on table public.agendamentos    from anon;
revoke all on table public.funcionarios    from anon;
revoke all on table public.agenda_horarios from anon;
grant select, insert, update, delete on table public.agendamentos to authenticated;   -- RLS: só funcionário ativo
grant select on table public.funcionarios    to authenticated;                       -- RLS: só a própria linha
grant select on table public.agenda_horarios to authenticated;                       -- RLS: só funcionário ativo
