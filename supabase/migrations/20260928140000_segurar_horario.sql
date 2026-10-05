-- ===========================================================================
--  SR PHONE — SEGURAR HORÁRIO
--  Rode DEPOIS de 20260926120000_agenda.sql e 20260928120000_horario_loja.sql
--  (as duas já rodadas no Supabase não precisam rodar de novo).
--  Painel: SQL Editor > cole TUDO isto > RUN.  CLI: supabase db push.
--  Pode rodar de novo sem medo: não apaga dados, tudo é "if not exists" / "create or replace".
--
--  O QUE É
--    O funcionário "segura" um horário livre por 15, 30, 60 ou 120 minutos enquanto
--    conversa com o cliente (por exemplo, no WhatsApp). Enquanto o prazo vale, ninguém
--    mais pega esse horário: nem cliente pelo site, nem outro funcionário.
--    Passou do prazo e ninguém confirmou: o horário volta a ficar livre SOZINHO, sem cron.
--
--  ESTADOS (coluna status)
--    pendente, confirmado, cancelado e bloqueado: como antes.
--    segurado  reserva temporária da equipe. Só vale enquanto segurado_ate > now().
--    BLOQUEADO é a loja fechando o horário (almoço, feriado, reunião): NÃO expira.
--    SEGURADO é temporário: expira em segurado_ate.
--
--  DECISÃO: COMO A TRAVA CONTRA HORÁRIO DUPLICADO CONTINUA SENDO DO BANCO
--    O PostgreSQL não aceita now() na condição de um índice (now() muda a cada instante),
--    então não existe índice "ocupado só se segurado_ate > now()". A solução adotada:
--    1. O índice único parcial passa a incluir 'segurado' (agendamentos_horario_travado).
--       Dois registros ativos no mesmo dia e hora continuam impossíveis, venha a gravação
--       do site, do painel ou da API. Dois funcionários segurando ao mesmo tempo, ou um
--       cliente reservando enquanto um funcionário segura: só um consegue.
--    2. Antes de gravar qualquer registro que ocupa um horário, o gatilho
--       tg_agendamentos_antes marca como 'cancelado' o segurado VENCIDO daquele mesmo
--       horário, na mesma transação. O UPDATE trava a linha: duas gravações simultâneas
--       esperam uma pela outra e o índice decide quem fica. Assim um segurado vencido
--       nunca prende o horário, e nada depende de cron.
--    3. As consultas (horarios_ocupados para o site, agenda_do_dia para o painel) tratam
--       o segurado vencido como livre.
--
--  QUEM PODE O QUÊ
--    anon (site público): só horarios_ocupados (dia e hora) e solicitar_horario. Mais nada.
--    funcionário logado e ATIVO em public.funcionarios: agenda_do_dia, segurar_horario,
--    liberar_horario, confirmar_horario e as ações que já existiam. Quem segurou é sempre
--    auth.uid(): o banco ignora qualquer id enviado pelo navegador.
--
--  ATENÇÃO: se um dia rodar de novo a migração 20260926120000_agenda.sql, rode esta de novo depois.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) COLUNAS NOVAS E REGRAS DA TABELA
--    Quem segurou (segurado_por), até quando (segurado_ate) e o porquê (motivo_seguro).
--    Quando segurou = criado_em (segurar sempre cria um registro novo).
--    Quem confirmou ou liberou = atualizado_por + atualizado_em, e o histórico do item 4.
-- ---------------------------------------------------------------------------
alter table public.agendamentos add column if not exists segurado_por  uuid;
alter table public.agendamentos add column if not exists segurado_ate  timestamptz;
alter table public.agendamentos add column if not exists motivo_seguro text not null default '';

alter table public.agendamentos drop constraint if exists agendamentos_status_ok;
alter table public.agendamentos add  constraint agendamentos_status_ok
  check (status in ('pendente','confirmado','cancelado','bloqueado','segurado'));

alter table public.agendamentos drop constraint if exists agendamentos_segurado_ok;
alter table public.agendamentos add  constraint agendamentos_segurado_ok
  check (status <> 'segurado' or (segurado_por is not null and segurado_ate is not null));

alter table public.agendamentos drop constraint if exists agendamentos_motivo_seguro_ok;
alter table public.agendamentos add  constraint agendamentos_motivo_seguro_ok
  check (char_length(motivo_seguro) <= 200);

-- ---------------------------------------------------------------------------
-- 2) A TRAVA DO HORÁRIO, AGORA COM O SEGURADO (veja a DECISÃO no topo)
--    O índice novo é criado ANTES de apagar o antigo: o horário nunca fica sem trava.
-- ---------------------------------------------------------------------------
create unique index if not exists agendamentos_horario_travado
  on public.agendamentos (data, hora)
  where status in ('pendente','confirmado','bloqueado','segurado');
drop index if exists public.agendamentos_horario_reservado;

create index if not exists agendamentos_segurado_ate_idx
  on public.agendamentos (segurado_ate) where status = 'segurado';
create index if not exists agendamentos_segurado_por_idx
  on public.agendamentos (segurado_por) where segurado_por is not null;

-- ---------------------------------------------------------------------------
-- 3) GATILHO ANTES DE GRAVAR
--    a) segurado: quem segurou é SEMPRE o usuário logado (auth.uid()), e o prazo
--       fica entre agora e no máximo 2 horas. Vale até para quem gravar direto pela API.
--    b) quem vai ocupar um horário solta antes o segurado VENCIDO desse horário.
-- ---------------------------------------------------------------------------
create or replace function public.agendamentos_antes()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if new.status = 'segurado' and (
       tg_op = 'INSERT'
       or old.status is distinct from 'segurado'
       or new.segurado_por is distinct from old.segurado_por
       or new.segurado_ate is distinct from old.segurado_ate) then
    if auth.uid() is not null then
      new.segurado_por := auth.uid();
    end if;
    if new.segurado_ate is null or new.segurado_ate <= now()
       or new.segurado_ate > now() + interval '120 minutes 30 seconds' then
      raise exception 'duracao_invalida' using errcode = 'P0001';
    end if;
  end if;

  if new.status in ('pendente','confirmado','bloqueado','segurado') then
    update public.agendamentos s
       set status = 'cancelado', atualizado_em = now(),
           obs = left(btrim(s.obs || ' [segurado expirou]'), 200)
     where s.data = new.data and s.hora = new.hora and s.id <> new.id
       and s.status = 'segurado' and s.segurado_ate <= now();
  end if;
  return new;
end;
$$;

drop trigger if exists tg_agendamentos_antes on public.agendamentos;
create trigger tg_agendamentos_antes
  before insert or update on public.agendamentos
  for each row execute function public.agendamentos_antes();

-- ---------------------------------------------------------------------------
-- 4) HISTÓRICO (auditoria): quem pediu, segurou, confirmou, liberou, cancelou,
--    bloqueou ou remarcou, e quando. Gravado pelo próprio banco a cada mudança,
--    venha de onde vier. Guarda só ids e estados: nada de nome ou telefone do cliente.
--    Só funcionário ativo lê. Ninguém edita nem apaga pela API.
--    Ao apagar um agendamento antigo (apagar_dados_antigos), o histórico dele vai junto.
-- ---------------------------------------------------------------------------
create table if not exists public.agendamentos_log (
  id             bigint generated always as identity primary key,
  agendamento_id uuid not null references public.agendamentos(id) on delete cascade,
  em             timestamptz not null default now(),
  por            uuid,                -- funcionário (auth.uid()); vazio = cliente pelo site ou o banco
  acao           text not null,       -- pedido, segurou, confirmou, liberou, expirou, cancelou, bloqueou, remarcou
  status_antes   text,
  status_depois  text not null,
  detalhe        text not null default ''
);
create index if not exists agendamentos_log_agendamento_idx on public.agendamentos_log (agendamento_id, em);
create index if not exists agendamentos_log_em_idx on public.agendamentos_log (em);

create or replace function public.agendamentos_registra()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare v_acao text; v_det text := '';
begin
  if tg_op = 'INSERT' then
    v_acao := case new.status when 'pendente' then 'pedido' when 'segurado' then 'segurou'
                              when 'bloqueado' then 'bloqueou' when 'confirmado' then 'confirmou'
                              else 'criou' end;
    if new.status = 'segurado' then
      v_det := 'até ' || to_char(new.segurado_ate at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI');
    end if;
    insert into public.agendamentos_log (agendamento_id, por, acao, status_antes, status_depois, detalhe)
    values (new.id, auth.uid(), v_acao, null, new.status, v_det);
  elsif new.status is distinct from old.status
        or new.data is distinct from old.data or new.hora is distinct from old.hora then
    v_acao := case
      when new.status = old.status then 'remarcou'
      when old.status = 'segurado' and new.status = 'cancelado' and old.segurado_ate <= now() then 'expirou'
      when old.status = 'segurado' and new.status = 'cancelado' then 'liberou'
      when new.status = 'confirmado' then 'confirmou'
      when new.status = 'cancelado' then 'cancelou'
      when new.status = 'bloqueado' then 'bloqueou'
      else old.status || ' > ' || new.status end;
    if new.data is distinct from old.data or new.hora is distinct from old.hora then
      v_det := 'de ' || to_char(old.data, 'DD/MM') || ' ' || old.hora ||
               ' para ' || to_char(new.data, 'DD/MM') || ' ' || new.hora;
    end if;
    insert into public.agendamentos_log (agendamento_id, por, acao, status_antes, status_depois, detalhe)
    values (new.id, auth.uid(), v_acao, old.status, new.status, v_det);
  end if;
  return null;
end;
$$;

drop trigger if exists tg_agendamentos_log on public.agendamentos;
create trigger tg_agendamentos_log
  after insert or update on public.agendamentos
  for each row execute function public.agendamentos_registra();

alter table public.agendamentos_log enable row level security;
drop policy if exists "funcionario le historico" on public.agendamentos_log;
create policy "funcionario le historico"
  on public.agendamentos_log for select to authenticated using (public.e_funcionario());

-- ---------------------------------------------------------------------------
-- 5) O SITE PÚBLICO: segurado VÁLIDO aparece só como ocupado (dia e hora).
--    Nenhum nome, motivo, id ou funcionário sai daqui. Segurado vencido = livre.
-- ---------------------------------------------------------------------------
create or replace function public.horarios_ocupados(de date, ate date)
returns table (data date, hora text)
language sql stable security definer set search_path = public
as $$
  select a.data, a.hora
  from public.agendamentos a
  where (a.status in ('pendente','confirmado','bloqueado')
         or (a.status = 'segurado' and a.segurado_ate > now()))
    and a.data >= de and a.data <= least(ate, de + 62);
$$;

-- o cliente pede um horário: igual a antes, e agora o segurado válido também conta como ocupado.
-- (O índice do item 2 continua sendo a última palavra; o gatilho do item 3 solta o segurado vencido.)
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
  if char_length(v_tel) > 20 or char_length(v_dig) < 10 or char_length(v_dig) > 13 then
    raise exception 'telefone_invalido' using errcode = 'P0001';
  end if;
  if p_data is null or p_data < v_hoje or p_data > v_hoje + 30 then
    raise exception 'data_fora_do_periodo' using errcode = 'P0001';
  end if;
  if p_data = v_hoje and p_hora::time <= v_agora then
    raise exception 'horario_passado' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.agenda_horarios g
                  where g.dia_semana = extract(dow from p_data)::int and g.hora = p_hora) then
    raise exception 'fora_do_horario' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.agendamentos a
    where a.data = p_data and a.hora = p_hora
      and (a.status in ('pendente','confirmado','bloqueado')
           or (a.status = 'segurado' and a.segurado_ate > now()))
  ) then
    raise exception 'horario_ocupado' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.agendamentos a
    where a.data = p_data and a.status in ('pendente','confirmado')
      and regexp_replace(a.telefone, '\D', '', 'g') = v_dig
  ) then
    raise exception 'pedido_duplicado' using errcode = 'P0001';
  end if;
  if (select count(*) from public.agendamentos a
       where a.status = 'pendente' and a.data >= v_hoje
         and regexp_replace(a.telefone, '\D', '', 'g') = v_dig) >= 2 then
    raise exception 'limite_por_telefone' using errcode = 'P0001';
  end if;
  if (select count(*) from public.agendamentos a
       where a.status = 'pendente' and a.criado_em > now() - interval '10 minutes') >= 15 then
    raise exception 'muitos_pedidos' using errcode = 'P0001';
  end if;

  insert into public.agendamentos (data, hora, status, motivo, nome, telefone)
  values (p_data, p_hora, 'pendente', v_motivo, left(v_nome, 60), left(v_tel, 20))
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'horario_ocupado' using errcode = 'P0001';
end;
$$;

-- remarcar: o destino também não pode estar segurado por alguém
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
      and (a.status in ('pendente','confirmado','bloqueado')
           or (a.status = 'segurado' and a.segurado_ate > now()))
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

-- ---------------------------------------------------------------------------
-- 6) AÇÕES NOVAS DO FUNCIONÁRIO (todas conferem e_funcionario() no servidor)
-- ---------------------------------------------------------------------------

-- segurar um horário livre por 15, 30, 60 ou 120 minutos. Devolve o id do registro.
-- Erros: sem_permissao, hora_invalida, duracao_invalida, data_fora_do_periodo,
--        fora_do_horario, horario_passado, horario_ocupado.
create or replace function public.segurar_horario(
  p_data             date,
  p_hora             text,
  p_duracao_minutos  int,
  p_motivo           text default ''
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id     uuid;
  v_hoje   date := (now() at time zone 'America/Sao_Paulo')::date;
  v_agora  time := (now() at time zone 'America/Sao_Paulo')::time;
  v_motivo text := left(btrim(regexp_replace(regexp_replace(coalesce(p_motivo, ''), '[<>[:cntrl:]]', ' ', 'g'), '\s+', ' ', 'g')), 200);
begin
  if not public.e_funcionario() then raise exception 'sem_permissao' using errcode = 'P0001'; end if;
  if p_hora is null or p_hora !~ '^[0-2][0-9]:[0-5][0-9]$' then
    raise exception 'hora_invalida' using errcode = 'P0001';
  end if;
  if p_duracao_minutos is null or p_duracao_minutos not in (15, 30, 60, 120) then
    raise exception 'duracao_invalida' using errcode = 'P0001';
  end if;
  if p_data is null or p_data < v_hoje or p_data > v_hoje + 60 then
    raise exception 'data_fora_do_periodo' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.agenda_horarios g
                  where g.dia_semana = extract(dow from p_data)::int and g.hora = p_hora) then
    raise exception 'fora_do_horario' using errcode = 'P0001';
  end if;
  if p_data = v_hoje and p_hora::time <= v_agora then
    raise exception 'horario_passado' using errcode = 'P0001';
  end if;

  insert into public.agendamentos (data, hora, status, motivo, nome, obs, atualizado_por,
                                   segurado_por, segurado_ate, motivo_seguro)
  values (p_data, p_hora, 'segurado', '', '', '', auth.uid(),
          auth.uid(), now() + make_interval(mins => p_duracao_minutos), v_motivo)
  returning id into v_id;
  return v_id;
exception
  -- outro funcionário segurou, ou um cliente reservou, no mesmo instante: só um fica
  when unique_violation then
    raise exception 'horario_ocupado' using errcode = 'P0001';
end;
$$;

-- liberar: o horário volta a ficar livre na hora. Devolve 'ok' ou 'nao_encontrado'.
create or replace function public.liberar_horario(p_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare v_n int;
begin
  if not public.e_funcionario() then raise exception 'sem_permissao' using errcode = 'P0001'; end if;
  update public.agendamentos
     set status = 'cancelado', atualizado_em = now(), atualizado_por = auth.uid()
   where id = p_id and status = 'segurado';
  get diagnostics v_n = row_count;
  return case when v_n = 0 then 'nao_encontrado' else 'ok' end;
end;
$$;

-- confirmar um horário segurado (ou um pedido pendente). Os dados do cliente, se houver, ficam.
-- Devolve 'ok', 'expirado' (o prazo do segurado acabou) ou 'nao_encontrado'.
create or replace function public.confirmar_horario(p_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare v_st text; v_ate timestamptz;
begin
  if not public.e_funcionario() then raise exception 'sem_permissao' using errcode = 'P0001'; end if;
  select status, segurado_ate into v_st, v_ate
    from public.agendamentos where id = p_id for update;
  if v_st is null or v_st not in ('segurado','pendente') then return 'nao_encontrado'; end if;
  if v_st = 'segurado' and v_ate <= now() then return 'expirado'; end if;
  update public.agendamentos
     set status = 'confirmado', segurado_ate = null,
         atualizado_em = now(), atualizado_por = auth.uid()
   where id = p_id;
  return 'ok';
exception
  when unique_violation then return 'ocupado';
end;
$$;

-- a grade de um dia para o painel: cada horário com o estado (livre, pendente,
-- confirmado, bloqueado ou segurado). Segurado vencido aparece como livre.
create or replace function public.agenda_do_dia(p_data date)
returns table (
  hora              text,
  estado            text,
  id                uuid,
  nome              text,
  telefone          text,
  motivo            text,
  obs               text,
  segurado_por_nome text,
  segurado_ate      timestamptz,
  expira_em_min     int,
  motivo_seguro     text
)
language plpgsql stable security definer set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.e_funcionario() then raise exception 'sem_permissao' using errcode = 'P0001'; end if;
  return query
  with ativos as (
    select a.* from public.agendamentos a
     where a.data = p_data
       and (a.status in ('pendente','confirmado','bloqueado')
            or (a.status = 'segurado' and a.segurado_ate > now()))
  ), horas as (
    select g.hora as h from public.agenda_horarios g where g.dia_semana = extract(dow from p_data)::int
    union
    select x.hora from ativos x
  )
  select hs.h,
         coalesce(x.status, 'livre'),
         x.id, x.nome, x.telefone, x.motivo, x.obs,
         case when x.status = 'segurado' then coalesce(nullif(btrim(f.nome), ''), 'Funcionário') end,
         case when x.status = 'segurado' then x.segurado_ate end,
         case when x.status = 'segurado'
              then greatest(1, ceil(extract(epoch from (x.segurado_ate - now())) / 60))::int end,
         case when x.status = 'segurado' then x.motivo_seguro end
    from horas hs
    left join ativos x on x.hora = hs.h
    left join public.funcionarios f on f.user_id = x.segurado_por
   order by hs.h;
end;
$$;

-- nomes da equipe, para o painel mostrar "Por: Maria" na lista de agendamentos
create or replace function public.equipe_nomes()
returns table (user_id uuid, nome text)
language plpgsql stable security definer set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.e_funcionario() then raise exception 'sem_permissao' using errcode = 'P0001'; end if;
  return query select f.user_id, f.nome from public.funcionarios f;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7) PERMISSÕES
--    No Supabase, toda função nova em "public" já nasce liberada para anon. Por isso
--    cada função da equipe tem a permissão de anon retirada aqui, uma por uma
--    (inclusive as antigas). Dentro delas, e_funcionario() confere o resto.
-- ---------------------------------------------------------------------------
revoke all on function public.segurar_horario(date, text, int, text) from public, anon;
revoke all on function public.liberar_horario(uuid)                  from public, anon;
revoke all on function public.confirmar_horario(uuid)                from public, anon;
revoke all on function public.agenda_do_dia(date)                    from public, anon;
revoke all on function public.equipe_nomes()                         from public, anon;
revoke all on function public.agendamentos_antes()                   from public, anon, authenticated;
revoke all on function public.agendamentos_registra()                from public, anon, authenticated;
grant execute on function public.segurar_horario(date, text, int, text) to authenticated;
grant execute on function public.liberar_horario(uuid)                  to authenticated;
grant execute on function public.confirmar_horario(uuid)                to authenticated;
grant execute on function public.agenda_do_dia(date)                    to authenticated;
grant execute on function public.equipe_nomes()                         to authenticated;

-- as ações antigas da equipe também deixam de aceitar chamada anônima
revoke execute on function public.confirmar_agendamento(uuid)            from public, anon;
revoke execute on function public.cancelar_agendamento(uuid)             from public, anon;
revoke execute on function public.remarcar_agendamento(uuid, date, text) from public, anon;
revoke execute on function public.bloquear_horario(date, text, text)     from public, anon;
revoke execute on function public.bloquear_dia(date, text)               from public, anon;
revoke execute on function public.limpar_pendentes_vencidos()            from public, anon;
revoke execute on function public.apagar_dados_antigos(int)              from public, anon;
revoke execute on function public.e_funcionario()                        from public, anon;
do $$ begin
  if to_regprocedure('public.testar_aviso()') is not null then
    revoke execute on function public.testar_aviso() from public, anon;
  end if;
end $$;

-- o site público continua só com estas duas
grant execute on function public.horarios_ocupados(date, date)                   to anon, authenticated;
grant execute on function public.solicitar_horario(date, text, text, text, text) to anon, authenticated;

-- histórico: ninguém de fora; funcionário só lê (RLS do item 4)
revoke all on table public.agendamentos_log from anon, authenticated;
grant select on table public.agendamentos_log to authenticated;

-- a API do Supabase passa a enxergar as funções novas na hora
notify pgrst, 'reload schema';
