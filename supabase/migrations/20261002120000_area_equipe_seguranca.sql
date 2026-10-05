-- ===========================================================================
--  SR PHONE — ÁREA DA EQUIPE (/funcionario) E SEGURANÇA DA AGENDA
--  Rode DEPOIS das migrações anteriores (agenda, horário da loja, segurar horário e,
--  se usar, avisos no Telegram). Painel: SQL Editor > cole TUDO isto > RUN.
--  CLI: supabase db push. Pode rodar de novo sem medo: não apaga agendamentos.
--
--  O QUE MUDA
--   1. funcionarios ganha e-mail, papel (role: admin ou funcionario) e exige_mfa.
--      Só entra na área da equipe quem está logado (Supabase Auth), está nesta tabela
--      e tem ativo = true. Com MFA (código de 6 dígitos do app autenticador) ligado
--      para a pessoa, o banco exige sessão verificada (aal2) em TODA operação.
--   2. Bloqueio da loja e agendamento de cliente são coisas diferentes:
--        - horário bloqueado = registro com status 'bloqueado' (almoço, compromisso...)
--        - dia bloqueado     = linha em bloqueios_dia (feriado, loja fechada...)
--        - agendamento       = pedido de cliente (pendente ou confirmado)
--      Bloquear o dia NÃO mexe em agendamento já feito; desbloquear também não.
--      "Liberar" só desfaz bloqueio: nunca libera horário de cliente.
--   3. O cliente NÃO grava mais direto no banco pela chave pública. O pedido passa pela
--      função do servidor (Netlify, /api/agendamento), que confere os dados, o limite de
--      pedidos e o anti-robô (Turnstile), e chama criar_agendamento com a chave secreta
--      (que fica SÓ na variável de ambiente do Netlify). A chave pública só lê os
--      horários ocupados (dia e hora, sem nome nem telefone).
--   4. A equipe só mexe na agenda pelas funções abaixo (nada de gravar direto na tabela),
--      e cada ação fica registrada em audit_logs (quem, o quê, dia, hora, registro).
--   5. Duas pessoas mexendo no mesmo horário ao mesmo tempo: o banco deixa só uma
--      vencer (índice único + trava por dia). A outra recebe 'horario_alterado'.
--
--  COMO LIBERAR UMA PESSOA DA EQUIPE (a conta é criada só pela administração)
--    1. Authentication > Users > Add user (ou "Invite user") com o e-mail da pessoa.
--       Deixe "Allow new users to sign up" DESLIGADO (Authentication > Sign In / Providers).
--    2. SQL Editor:
--         insert into public.funcionarios (user_id, nome, role)
--         select id, 'Maria', 'funcionario' from auth.users where email = 'maria@exemplo.com';
--       Administrador(a): role = 'admin' (o MFA passa a ser exigido automaticamente).
--    Tirar o acesso (vale na hora, sem apagar histórico):
--         update public.funcionarios set ativo = false where email = 'maria@exemplo.com';
--    Exigir MFA de um funcionário comum:
--         update public.funcionarios set exige_mfa = true where email = 'maria@exemplo.com';
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) FUNCIONÁRIOS: e-mail, papel e MFA
-- ---------------------------------------------------------------------------
alter table public.funcionarios add column if not exists email     text    not null default '';
alter table public.funcionarios add column if not exists role      text    not null default 'funcionario';
alter table public.funcionarios add column if not exists exige_mfa boolean not null default false;
alter table public.funcionarios drop constraint if exists funcionarios_role_ok;
alter table public.funcionarios add  constraint funcionarios_role_ok check (role in ('admin','funcionario'));
-- nomes compridos que já existiam são encurtados antes da regra de tamanho (nada trava a migração)
update public.funcionarios set nome = left(nome, 60) where char_length(nome) > 60;
alter table public.funcionarios drop constraint if exists funcionarios_tamanhos_ok;
alter table public.funcionarios add  constraint funcionarios_tamanhos_ok
  check (char_length(nome) <= 60 and char_length(email) <= 320);
create index if not exists funcionarios_email_idx on public.funcionarios (lower(email));

-- o e-mail vem sempre do Supabase Auth (não de quem digita); virar admin liga o MFA
create or replace function public.funcionarios_antes()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  new.nome := left(btrim(regexp_replace(coalesce(new.nome, ''), '[<>[:cntrl:]]', '', 'g')), 60);
  begin
    select coalesce(lower(u.email), '') into new.email from auth.users u where u.id = new.user_id;
  exception when others then
    null;                                   -- sem leitura de auth.users: fica o que já estava
  end;
  new.email := coalesce(new.email, '');
  if new.role = 'admin' and (tg_op = 'INSERT' or old.role is distinct from 'admin') then
    new.exige_mfa := true;
  end if;
  return new;
end;
$$;
drop trigger if exists tg_funcionarios_antes on public.funcionarios;
create trigger tg_funcionarios_antes
  before insert or update on public.funcionarios
  for each row execute function public.funcionarios_antes();
update public.funcionarios set nome = nome;  -- preenche o e-mail de quem já estava cadastrado

-- ---------------------------------------------------------------------------
-- 2) QUEM É FUNCIONÁRIO (agora com MFA)
--    aal2 = a sessão passou pelo código do app autenticador.
--    Precisa de aal2: quem tem exige_mfa = true (todo admin) e quem já cadastrou
--    um autenticador (assim a senha sozinha não basta para quem ativou o MFA).
-- ---------------------------------------------------------------------------
create or replace function public._tem_mfa(p_user uuid)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare v boolean := false;
begin
  begin
    select exists (select 1 from auth.mfa_factors m where m.user_id = p_user and m.status = 'verified') into v;
  exception when others then
    v := false;
  end;
  return coalesce(v, false);
end;
$$;

create or replace function public._mfa_ok(p_user uuid, p_exige boolean)
returns boolean
language plpgsql stable security definer set search_path = public
as $$
begin
  if coalesce(auth.jwt() ->> 'aal', '') = 'aal2' then return true; end if;
  if coalesce(p_exige, false) then return false; end if;
  return not public._tem_mfa(p_user);
end;
$$;

create or replace function public.e_funcionario()
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare f record;
begin
  select user_id, ativo, exige_mfa into f from public.funcionarios where user_id = auth.uid();
  if not found or not f.ativo then return false; end if;
  return public._mfa_ok(f.user_id, f.exige_mfa);
end;
$$;

create or replace function public.e_admin()
returns boolean
language plpgsql stable security definer set search_path = public
as $$
declare f record;
begin
  select user_id, ativo, role, exige_mfa into f from public.funcionarios where user_id = auth.uid();
  if not found or not f.ativo or f.role <> 'admin' then return false; end if;
  return public._mfa_ok(f.user_id, f.exige_mfa);
end;
$$;

-- o que a tela de login precisa saber: ok, sem_acesso, mfa_cadastrar ou mfa_codigo.
-- Para quem não é da equipe, só "sem_acesso" (nem diz se a pessoa existe ou foi desativada).
create or replace function public.meu_acesso()
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare f public.funcionarios%rowtype; v_aal2 boolean := coalesce(auth.jwt() ->> 'aal', '') = 'aal2'; v_tem boolean;
begin
  select * into f from public.funcionarios where user_id = auth.uid();
  if not found or not f.ativo then return jsonb_build_object('situacao', 'sem_acesso'); end if;
  v_tem := public._tem_mfa(f.user_id);
  if not v_aal2 and v_tem then return jsonb_build_object('situacao', 'mfa_codigo'); end if;
  if not v_aal2 and f.exige_mfa then return jsonb_build_object('situacao', 'mfa_cadastrar'); end if;
  return jsonb_build_object('situacao', 'ok', 'nome', f.nome, 'role', f.role,
                            'mfa', v_aal2 or v_tem, 'exige_mfa', f.exige_mfa);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) REGISTRO DAS AÇÕES DA EQUIPE (audit_logs)
--    Quem, o quê, quando, dia e horário, e o registro afetado. Sem senha, token,
--    chave, nome ou telefone de cliente. Só administrador ativo lê; ninguém edita.
-- ---------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id               bigint generated always as identity primary key,
  em               timestamptz not null default now(),
  funcionario_id   uuid,
  funcionario_nome text not null default '',
  acao             text not null,
  data             date,
  hora             text not null default '',
  registro_id      uuid,
  detalhe          text not null default ''
);
create index if not exists audit_logs_em_idx on public.audit_logs (em);
create index if not exists audit_logs_funcionario_idx on public.audit_logs (funcionario_id, em);

create or replace function public._registra_acao(p_acao text, p_data date, p_hora text, p_registro uuid, p_detalhe text default '')
returns void
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.audit_logs (funcionario_id, funcionario_nome, acao, data, hora, registro_id, detalhe)
  values (auth.uid(),
          coalesce((select f.nome from public.funcionarios f where f.user_id = auth.uid()), ''),
          p_acao, p_data, left(coalesce(p_hora, ''), 200), p_registro, left(coalesce(p_detalhe, ''), 200));
end;
$$;

-- ---------------------------------------------------------------------------
-- 4) DIA INTEIRO BLOQUEADO (feriado, loja fechada, evento, folga)
-- ---------------------------------------------------------------------------
create table if not exists public.bloqueios_dia (
  data        date primary key,
  motivo      text not null default '',
  criado_por  uuid,
  criado_em   timestamptz not null default now(),
  constraint bloqueios_dia_motivo_ok check (char_length(motivo) <= 120)
);

-- aparelho do cliente (opcional, ex.: "iPhone 13 128 GB") e o limite de pedidos por origem
alter table public.agendamentos add column if not exists aparelho text not null default '';
alter table public.agendamentos drop constraint if exists agendamentos_aparelho_ok;
alter table public.agendamentos add  constraint agendamentos_aparelho_ok check (char_length(aparelho) <= 60);

-- origem = resumo (HMAC) do IP feito pela função do servidor. Nunca o IP. Guardado por 2 dias.
create table if not exists public.agenda_limites (
  id     bigint generated always as identity primary key,
  em     timestamptz not null default now(),
  origem text not null check (origem ~ '^[a-f0-9]{16,64}$')
);
create index if not exists agenda_limites_idx on public.agenda_limites (origem, em);
create index if not exists agenda_limites_em_idx on public.agenda_limites (em);

-- trava por dia: tudo o que mexe na agenda de um dia (pedido, bloqueio, segurar, remarcar)
-- entra em fila para aquele dia, mesmo com muitas requisições ao mesmo tempo
create or replace function public._trava_dia(p_data date)
returns void
language plpgsql
as $$
begin
  perform pg_advisory_xact_lock(hashtext('srphone:agenda:dia:' || coalesce(p_data::text, '')));
end;
$$;

-- texto livre que vem da tela: sem HTML, sem caracteres de controle, espaços juntos, cortado
create or replace function public._texto_limpo(p text, p_max int)
returns text
language sql immutable
as $$
  select left(btrim(regexp_replace(regexp_replace(coalesce(p, ''), '[<>[:cntrl:]]', ' ', 'g'), '\s+', ' ', 'g')), p_max);
$$;

-- motivo de bloqueio: só da lista (ou vazio). "Outro" pode ter um detalhe curto.
create or replace function public._motivo_bloqueio(p_motivo text, p_detalhe text, p_lista text[], p_padrao text)
returns text
language plpgsql immutable
as $$
declare m text := public._texto_limpo(p_motivo, 40); d text := public._texto_limpo(p_detalhe, 60);
begin
  if m = '' then return p_padrao; end if;
  if not (m = any (p_lista)) then raise exception 'motivo_invalido' using errcode = 'P0001'; end if;
  if m = 'Outro' and d <> '' then return 'Outro: ' || d; end if;
  return m;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5) O QUE O SITE PÚBLICO VÊ: dia e hora ocupados (agora com o dia bloqueado inteiro)
-- ---------------------------------------------------------------------------
create or replace function public.horarios_ocupados(de date, ate date)
returns table (data date, hora text)
language sql stable security definer set search_path = public
as $$
  select a.data, a.hora
    from public.agendamentos a
   where (a.status in ('pendente','confirmado','bloqueado')
          or (a.status = 'segurado' and a.segurado_ate > now()))
     and a.data >= de and a.data <= least(ate, de + 62)
  union
  select b.data, g.hora
    from public.bloqueios_dia b
    join public.agenda_horarios g on g.dia_semana = extract(dow from b.data)::int
   where b.data >= de and b.data <= least(ate, de + 62);
$$;

-- ---------------------------------------------------------------------------
-- 6) O PEDIDO DO CLIENTE: só a função do servidor (service_role) chama.
--    Mesmas regras de antes (grade, data, horário passado, ocupado, nome, WhatsApp,
--    pedido repetido, 2 pendentes por WhatsApp, 15 pedidos em 10 minutos) e mais:
--    dia bloqueado e no máximo 4 pedidos por hora / 8 por dia da mesma origem.
--    Uma trava geral deixa os pedidos em fila: os limites valem mesmo com robô
--    disparando centenas de pedidos ao mesmo tempo.
-- ---------------------------------------------------------------------------
create or replace function public.criar_agendamento(
  p_data     date,
  p_hora     text,
  p_servico  text,
  p_nome     text,
  p_telefone text,
  p_aparelho text default '',
  p_origem   text default ''
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_id       uuid;
  v_hoje     date := (now() at time zone 'America/Sao_Paulo')::date;
  v_agora    time := (now() at time zone 'America/Sao_Paulo')::time;
  v_nome     text := public._texto_limpo(p_nome, 80);
  v_tel      text := btrim(regexp_replace(coalesce(p_telefone, ''), '[^0-9()+ -]', '', 'g'));
  v_dig      text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_servico  text := public._texto_limpo(p_servico, 120);
  v_aparelho text := public._texto_limpo(p_aparelho, 60);
  v_origem   text := lower(coalesce(p_origem, ''));
begin
  if p_hora is null or p_hora !~ '^[0-2][0-9]:[0-5][0-9]$' then
    raise exception 'hora_invalida' using errcode = 'P0001';
  end if;
  if char_length(v_nome) > 60 or v_nome ~ '[0-9]'
     or char_length(regexp_replace(v_nome, '[^A-Za-zÀ-ÖØ-öø-ÿ]', '', 'g')) < 2 then
    raise exception 'nome_invalido' using errcode = 'P0001';
  end if;
  if char_length(v_tel) > 20 or char_length(v_dig) < 10 or char_length(v_dig) > 13 then
    raise exception 'telefone_invalido' using errcode = 'P0001';
  end if;
  if v_origem <> '' and v_origem !~ '^[a-f0-9]{16,64}$' then
    raise exception 'origem_invalida' using errcode = 'P0001';
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

  -- fila: um pedido por vez (limites exatos) e nada de corrida com o bloqueio do dia
  perform pg_advisory_xact_lock(hashtext('srphone:agenda:pedidos'));
  perform public._trava_dia(p_data);

  if exists (select 1 from public.bloqueios_dia b where b.data = p_data) then
    raise exception 'dia_bloqueado' using errcode = 'P0001';
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
  if v_origem <> '' then
    delete from public.agenda_limites where em < now() - interval '2 days';
    if (select count(*) from public.agenda_limites l where l.origem = v_origem and l.em > now() - interval '1 hour') >= 4
       or (select count(*) from public.agenda_limites l where l.origem = v_origem and l.em > now() - interval '24 hours') >= 8 then
      raise exception 'muitas_tentativas' using errcode = 'P0001';
    end if;
  end if;

  insert into public.agendamentos (data, hora, status, motivo, nome, telefone, aparelho)
  values (p_data, p_hora, 'pendente', v_servico, v_nome, left(v_tel, 20), v_aparelho)
  returning id into v_id;
  if v_origem <> '' then
    insert into public.agenda_limites (origem) values (v_origem);
  end if;
  return v_id;
exception
  when unique_violation then
    raise exception 'horario_ocupado' using errcode = 'P0001';
end;
$$;

-- a porta antiga (chave pública gravando direto) fecha de vez
drop function if exists public.solicitar_horario(date, text, text, text, text);

-- ---------------------------------------------------------------------------
-- 7) A AGENDA DO DIA PARA A EQUIPE
--    estado: livre, agendado, segurado, bloqueado ou indisponivel (já passou)
--    detalhe: pendente/confirmado (agendado) ou horario/dia (bloqueado)
--    Telefone não sai aqui: só em ver_agendamento (botão "Ver").
-- ---------------------------------------------------------------------------
drop function if exists public.agenda_do_dia(date);
drop function if exists public.equipe_nomes();
create or replace function public.agenda_dia(p_data date)
returns table (
  hora              text,
  estado            text,
  detalhe           text,
  id                uuid,
  cliente           text,
  servico           text,
  motivo            text,
  segurado_por_nome text,
  expira_em_min     int,
  motivo_seguro     text
)
language plpgsql stable security definer set search_path = public
as $$
#variable_conflict use_column
declare
  v_hoje  date := (now() at time zone 'America/Sao_Paulo')::date;
  v_agora text := to_char(now() at time zone 'America/Sao_Paulo', 'HH24:MI');
  v_bloq  boolean := false;
  v_mdia  text;
begin
  if not public.e_funcionario() then raise exception 'sem_permissao' using errcode = 'P0001'; end if;
  if p_data is null then raise exception 'data_invalida' using errcode = 'P0001'; end if;
  select true, b.motivo into v_bloq, v_mdia from public.bloqueios_dia b where b.data = p_data;
  v_bloq := coalesce(v_bloq, false);
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
         case when x.status in ('pendente','confirmado') then 'agendado'
              when x.status = 'segurado' then 'segurado'
              when x.status = 'bloqueado' or v_bloq then 'bloqueado'
              when p_data < v_hoje or (p_data = v_hoje and hs.h <= v_agora) then 'indisponivel'
              else 'livre' end,
         case when x.status in ('pendente','confirmado') then x.status
              when x.status = 'bloqueado' then 'horario'
              when x.id is null and v_bloq then 'dia' end,
         x.id,
         case when x.status in ('pendente','confirmado')
              then coalesce(nullif(btrim(x.nome), ''), 'Reservado pela equipe') end,
         case when x.status in ('pendente','confirmado')
              then coalesce(nullif(btrim(x.motivo), ''), nullif(btrim(x.motivo_seguro), ''), '') end,
         case when x.status = 'bloqueado'
              then coalesce(nullif(btrim(x.obs), ''), nullif(btrim(x.motivo), ''), 'Bloqueio da loja')
              when x.id is null and v_bloq then coalesce(nullif(btrim(v_mdia), ''), 'Dia bloqueado') end,
         case when x.status = 'segurado' then coalesce(nullif(btrim(f.nome), ''), 'Equipe') end,
         case when x.status = 'segurado'
              then greatest(1, ceil(extract(epoch from (x.segurado_ate - now())) / 60))::int end,
         case when x.status = 'segurado' then x.motivo_seguro end
    from horas hs
    left join ativos x on x.hora = hs.h
    left join public.funcionarios f on f.user_id = x.segurado_por
   order by hs.h;
end;
$$;

-- o calendário: por dia, quantos agendamentos, pendentes e bloqueios, e se o dia está fechado
create or replace function public.resumo_periodo(p_de date, p_ate date)
returns table (data date, agendados int, pendentes int, bloqueados int, dia_bloqueado boolean)
language plpgsql stable security definer set search_path = public
as $$
#variable_conflict use_column
begin
  if not public.e_funcionario() then raise exception 'sem_permissao' using errcode = 'P0001'; end if;
  if p_de is null or p_ate is null or p_ate < p_de then raise exception 'data_invalida' using errcode = 'P0001'; end if;
  return query
  with c as (
    select a.data as d,
           count(*) filter (where a.status in ('pendente','confirmado'))::int as ag,
           count(*) filter (where a.status = 'pendente')::int as pe,
           count(*) filter (where a.status = 'bloqueado')::int as bl
      from public.agendamentos a
     where a.data between p_de and least(p_ate, p_de + 62)
       and a.status in ('pendente','confirmado','bloqueado')
     group by a.data
  ), b as (
    select x.data as d from public.bloqueios_dia x where x.data between p_de and least(p_ate, p_de + 62)
  )
  select coalesce(c.d, b.d), coalesce(c.ag, 0), coalesce(c.pe, 0), coalesce(c.bl, 0), b.d is not null
    from c full join b on b.d = c.d
   order by 1;
end;
$$;

-- os dados de UM agendamento (botão "Ver"): só o necessário para atender
create or replace function public.ver_agendamento(p_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = public
as $$
declare r jsonb;
begin
  if not public.e_funcionario() then raise exception 'sem_permissao' using errcode = 'P0001'; end if;
  select jsonb_build_object(
           'id', a.id, 'data', a.data, 'hora', a.hora, 'status', a.status,
           'cliente', a.nome, 'telefone', a.telefone,
           'servico', coalesce(nullif(btrim(a.motivo), ''), a.motivo_seguro),
           'aparelho', a.aparelho, 'pela_equipe', (a.nome = '' and a.segurado_por is not null))
    into r
    from public.agendamentos a
   where a.id = p_id and a.status in ('pendente','confirmado');
  if r is null then raise exception 'horario_alterado' using errcode = 'P0001'; end if;
  return r;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8) BLOQUEAR E LIBERAR (tudo ou nada; conflito = 'horario_alterado')
-- ---------------------------------------------------------------------------
drop function if exists public.bloquear_horario(date, text, text);
drop function if exists public.bloquear_dia(date, text);

-- um ou vários horários livres do mesmo dia, numa operação só
create or replace function public.bloquear_horarios(
  p_data date, p_horas text[], p_motivo text default '', p_detalhe text default ''
) returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_hoje   date := (now() at time zone 'America/Sao_Paulo')::date;
  v_agora  text := to_char(now() at time zone 'America/Sao_Paulo', 'HH24:MI');
  v_motivo text;
  v_horas  text[];
  h        text;
begin
  if not public.e_funcionario() then raise exception 'sem_permissao' using errcode = 'P0001'; end if;
  v_motivo := public._motivo_bloqueio(p_motivo, p_detalhe,
                array['Almoço','Compromisso','Atendimento externo','Outro'], 'Bloqueio da loja');
  if p_data is null or p_data < v_hoje then raise exception 'data_passada' using errcode = 'P0001'; end if;
  if p_data > v_hoje + 365 then raise exception 'data_fora_do_periodo' using errcode = 'P0001'; end if;
  select array_agg(distinct x order by x) into v_horas from unnest(p_horas) x;
  if v_horas is null or cardinality(v_horas) = 0 or cardinality(v_horas) > 24 then
    raise exception 'hora_invalida' using errcode = 'P0001';
  end if;
  foreach h in array v_horas loop
    if h is null or h !~ '^[0-2][0-9]:[0-5][0-9]$' then raise exception 'hora_invalida' using errcode = 'P0001'; end if;
    if not exists (select 1 from public.agenda_horarios g
                    where g.dia_semana = extract(dow from p_data)::int and g.hora = h) then
      raise exception 'fora_do_horario' using errcode = 'P0001';
    end if;
    if p_data = v_hoje and h <= v_agora then raise exception 'horario_passado' using errcode = 'P0001'; end if;
  end loop;

  perform public._trava_dia(p_data);
  if exists (select 1 from public.bloqueios_dia b where b.data = p_data) then
    raise exception 'dia_bloqueado' using errcode = 'P0001';
  end if;
  begin
    foreach h in array v_horas loop
      insert into public.agendamentos (data, hora, status, motivo, nome, obs, atualizado_por)
      values (p_data, h, 'bloqueado', v_motivo, '', '', auth.uid());
    end loop;
  exception when unique_violation then
    -- alguém (cliente ou outro funcionário) pegou um desses horários: nada é bloqueado
    raise exception 'horario_alterado' using errcode = 'P0001';
  end;
  perform public._registra_acao('bloqueou_horario', p_data, array_to_string(v_horas, ', '), null, v_motivo);
  return cardinality(v_horas);
end;
$$;

-- liberar: só desfaz BLOQUEIO. Agendamento de cliente nunca passa por aqui.
create or replace function public.liberar_bloqueio(p_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare v record;
begin
  if not public.e_funcionario() then raise exception 'sem_permissao' using errcode = 'P0001'; end if;
  select a.data, a.hora into v from public.agendamentos a where a.id = p_id;
  if v.data is not null then perform public._trava_dia(v.data); end if;
  update public.agendamentos
     set status = 'cancelado', atualizado_em = now(), atualizado_por = auth.uid()
   where id = p_id and status = 'bloqueado'
  returning data, hora into v;
  if not found then raise exception 'horario_alterado' using errcode = 'P0001'; end if;
  perform public._registra_acao('liberou_horario', v.data, v.hora, p_id, '');
  return 'ok';
end;
$$;

-- dia inteiro: os agendamentos que já existem naquele dia continuam valendo.
-- Devolve quantos agendamentos de cliente existem no dia (para a tela avisar).
create or replace function public.bloquear_dia_inteiro(p_data date, p_motivo text default '', p_detalhe text default '')
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_hoje   date := (now() at time zone 'America/Sao_Paulo')::date;
  v_motivo text;
  v_n      int;
begin
  if not public.e_funcionario() then raise exception 'sem_permissao' using errcode = 'P0001'; end if;
  v_motivo := public._motivo_bloqueio(p_motivo, p_detalhe,
                array['Feriado','Loja fechada','Evento','Folga','Outro'], 'Dia bloqueado');
  if p_data is null or p_data < v_hoje then raise exception 'data_passada' using errcode = 'P0001'; end if;
  if p_data > v_hoje + 365 then raise exception 'data_fora_do_periodo' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.agenda_horarios g where g.dia_semana = extract(dow from p_data)::int) then
    raise exception 'loja_fechada' using errcode = 'P0001';
  end if;
  perform public._trava_dia(p_data);
  begin
    insert into public.bloqueios_dia (data, motivo, criado_por) values (p_data, v_motivo, auth.uid());
  exception when unique_violation then
    raise exception 'horario_alterado' using errcode = 'P0001';
  end;
  select count(*) into v_n from public.agendamentos a
   where a.data = p_data and a.status in ('pendente','confirmado');
  perform public._registra_acao('bloqueou_dia', p_data, '', null, v_motivo);
  return jsonb_build_object('ok', true, 'agendamentos', v_n);
end;
$$;

-- desbloquear o dia: tira só o bloqueio do dia. Agendamentos e bloqueios de horário ficam.
create or replace function public.desbloquear_dia(p_data date)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_n int; v_motivo text;
begin
  if not public.e_funcionario() then raise exception 'sem_permissao' using errcode = 'P0001'; end if;
  perform public._trava_dia(p_data);
  delete from public.bloqueios_dia where data = p_data returning motivo into v_motivo;
  if not found then raise exception 'horario_alterado' using errcode = 'P0001'; end if;
  select count(*) into v_n from public.agendamentos a
   where a.data = p_data and a.status in ('pendente','confirmado');
  perform public._registra_acao('desbloqueou_dia', p_data, '', null, coalesce(v_motivo, ''));
  return jsonb_build_object('ok', true, 'agendamentos', v_n);
end;
$$;

-- a tela "Bloqueios": hoje, próximos 7 dias ou todos (de hoje em diante)
create or replace function public.bloqueios_ativos(p_filtro text default 'todos')
returns table (tipo text, id uuid, data date, hora text, motivo text, por_nome text, criado_em timestamptz)
language plpgsql stable security definer set search_path = public
as $$
#variable_conflict use_column
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ate  date;
begin
  if not public.e_funcionario() then raise exception 'sem_permissao' using errcode = 'P0001'; end if;
  v_ate := case coalesce(p_filtro, 'todos') when 'hoje' then v_hoje when 'proximos' then v_hoje + 7
                                             when 'todos' then v_hoje + 400 end;
  if v_ate is null then raise exception 'filtro_invalido' using errcode = 'P0001'; end if;
  return query
  select * from (
    select 'dia'::text as t_tipo, null::uuid as t_id, b.data as t_data, null::text as t_hora,
           b.motivo as t_motivo, coalesce(f.nome, '') as t_por, b.criado_em as t_em
      from public.bloqueios_dia b left join public.funcionarios f on f.user_id = b.criado_por
     where b.data between v_hoje and v_ate
    union all
    select 'horario'::text, a.id, a.data, a.hora,
           coalesce(nullif(btrim(a.obs), ''), nullif(btrim(a.motivo), ''), 'Bloqueio da loja'),
           coalesce(f.nome, ''), a.criado_em
      from public.agendamentos a left join public.funcionarios f on f.user_id = a.atualizado_por
     where a.status = 'bloqueado' and a.data between v_hoje and v_ate
  ) t
  order by t.t_data, t.t_tipo, t.t_hora
  limit 500;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9) AÇÕES QUE JÁ EXISTIAM, AGORA COM REGISTRO, TRAVA DO DIA E DIA BLOQUEADO
-- ---------------------------------------------------------------------------
create or replace function public.confirmar_agendamento(p_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare v record;
begin
  if not public.e_funcionario() then raise exception 'sem_permissao' using errcode='P0001'; end if;
  update public.agendamentos
     set status = 'confirmado', atualizado_em = now(), atualizado_por = auth.uid()
   where id = p_id and status = 'pendente'
  returning data, hora into v;
  if not found then return 'nao_encontrado'; end if;
  perform public._registra_acao('confirmou', v.data, v.hora, p_id, '');
  return 'ok';
exception
  when unique_violation then return 'ocupado';
end;
$$;

-- cancelar: só agendamento (pendente ou confirmado). Bloqueio se desfaz em liberar_bloqueio.
create or replace function public.cancelar_agendamento(p_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare v record;
begin
  if not public.e_funcionario() then raise exception 'sem_permissao' using errcode='P0001'; end if;
  update public.agendamentos
     set status = 'cancelado', atualizado_em = now(), atualizado_por = auth.uid()
   where id = p_id and status in ('pendente','confirmado')
  returning data, hora into v;
  if not found then return 'nao_encontrado'; end if;
  perform public._registra_acao('cancelou', v.data, v.hora, p_id, '');
  return 'ok';
end;
$$;

create or replace function public.remarcar_agendamento(p_id uuid, p_data date, p_hora text)
returns text
language plpgsql security definer set search_path = public
as $$
declare v record;
begin
  if not public.e_funcionario() then raise exception 'sem_permissao' using errcode='P0001'; end if;
  if p_hora is null or p_hora !~ '^[0-2][0-9]:[0-5][0-9]$' then raise exception 'hora_invalida' using errcode='P0001'; end if;
  if p_data is null then raise exception 'data_invalida' using errcode='P0001'; end if;
  select a.data, a.hora into v from public.agendamentos a where a.id = p_id and a.status in ('pendente','confirmado');
  if not found then return 'nao_encontrado'; end if;
  -- trava os dois dias, sempre na mesma ordem (sem impasse entre duas remarcações)
  perform public._trava_dia(least(v.data, p_data));
  if v.data <> p_data then perform public._trava_dia(greatest(v.data, p_data)); end if;
  if exists (select 1 from public.bloqueios_dia b where b.data = p_data) then return 'dia_bloqueado'; end if;
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
   where id = p_id and status in ('pendente','confirmado');
  if not found then return 'nao_encontrado'; end if;
  perform public._registra_acao('remarcou', p_data, p_hora, p_id,
    'de ' || to_char(v.data, 'DD/MM/YYYY') || ' ' || v.hora);
  return 'ok';
exception
  when unique_violation then return 'ocupado';
end;
$$;

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
  v_motivo text := public._texto_limpo(p_motivo, 200);
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
  perform public._trava_dia(p_data);
  if exists (select 1 from public.bloqueios_dia b where b.data = p_data) then
    raise exception 'dia_bloqueado' using errcode = 'P0001';
  end if;

  insert into public.agendamentos (data, hora, status, motivo, nome, obs, atualizado_por,
                                   segurado_por, segurado_ate, motivo_seguro)
  values (p_data, p_hora, 'segurado', '', '', '', auth.uid(),
          auth.uid(), now() + make_interval(mins => p_duracao_minutos), v_motivo)
  returning id into v_id;
  perform public._registra_acao('segurou_horario', p_data, p_hora, v_id, p_duracao_minutos || ' min');
  return v_id;
exception
  when unique_violation then
    raise exception 'horario_ocupado' using errcode = 'P0001';
end;
$$;

create or replace function public.liberar_horario(p_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare v record;
begin
  if not public.e_funcionario() then raise exception 'sem_permissao' using errcode = 'P0001'; end if;
  update public.agendamentos
     set status = 'cancelado', atualizado_em = now(), atualizado_por = auth.uid()
   where id = p_id and status = 'segurado'
  returning data, hora into v;
  if not found then return 'nao_encontrado'; end if;
  perform public._registra_acao('liberou_segurado', v.data, v.hora, p_id, '');
  return 'ok';
end;
$$;

create or replace function public.confirmar_horario(p_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare v_st text; v_ate timestamptz; v_data date; v_hora text;
begin
  if not public.e_funcionario() then raise exception 'sem_permissao' using errcode = 'P0001'; end if;
  select status, segurado_ate, data, hora into v_st, v_ate, v_data, v_hora
    from public.agendamentos where id = p_id for update;
  if v_st is null or v_st not in ('segurado','pendente') then return 'nao_encontrado'; end if;
  if v_st = 'segurado' and v_ate <= now() then return 'expirado'; end if;
  update public.agendamentos
     set status = 'confirmado', segurado_ate = null,
         atualizado_em = now(), atualizado_por = auth.uid()
   where id = p_id;
  perform public._registra_acao('confirmou', v_data, v_hora, p_id, '');
  return 'ok';
exception
  when unique_violation then return 'ocupado';
end;
$$;

-- limpeza (LGPD): só administrador
create or replace function public.limpar_pendentes_vencidos()
returns integer
language plpgsql security definer set search_path = public
as $$
declare v_n int;
begin
  if not public.e_admin() then raise exception 'sem_permissao' using errcode='P0001'; end if;
  delete from public.agendamentos
   where status = 'pendente'
     and data < (now() at time zone 'America/Sao_Paulo')::date;
  get diagnostics v_n = row_count;
  perform public._registra_acao('limpou_pendentes', null, '', null, v_n || ' registros');
  return v_n;
end;
$$;

create or replace function public.apagar_dados_antigos(p_dias int default 180)
returns integer
language plpgsql security definer set search_path = public
as $$
declare v_n int; v_corte date := (now() at time zone 'America/Sao_Paulo')::date - greatest(coalesce(p_dias, 180), 30);
begin
  if not public.e_admin() then raise exception 'sem_permissao' using errcode='P0001'; end if;
  delete from public.agendamentos where data < v_corte;
  get diagnostics v_n = row_count;
  delete from public.bloqueios_dia where data < v_corte;
  delete from public.audit_logs where em < now() - interval '365 days';
  perform public._registra_acao('apagou_dados_antigos', null, '', null, v_n || ' registros');
  return v_n;
end;
$$;

-- histórico por agendamento: "desbloqueou" quando um bloqueio é desfeito
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
      when old.status = 'bloqueado' and new.status = 'cancelado' then 'desbloqueou'
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

-- ---------------------------------------------------------------------------
-- 10) RLS: QUEM LÊ O QUÊ (revisão completa)
--     Ninguém grava direto em tabela nenhuma pela API: só pelas funções acima.
--     (exceto service_role, a chave secreta, que fica só no servidor)
-- ---------------------------------------------------------------------------
alter table public.agendamentos     enable row level security;
alter table public.funcionarios     enable row level security;
alter table public.agenda_horarios  enable row level security;
alter table public.agendamentos_log enable row level security;
alter table public.audit_logs       enable row level security;
alter table public.bloqueios_dia    enable row level security;
alter table public.agenda_limites   enable row level security;

drop policy if exists "funcionario le agendamentos"     on public.agendamentos;
drop policy if exists "funcionario cria agendamentos"   on public.agendamentos;
drop policy if exists "funcionario altera agendamentos" on public.agendamentos;
drop policy if exists "funcionario apaga agendamentos"  on public.agendamentos;
create policy "funcionario le agendamentos"
  on public.agendamentos for select to authenticated using ((select public.e_funcionario()));

drop policy if exists "funcionario se ve" on public.funcionarios;
create policy "funcionario se ve"
  on public.funcionarios for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists "funcionario le horarios" on public.agenda_horarios;
create policy "funcionario le horarios"
  on public.agenda_horarios for select to authenticated using ((select public.e_funcionario()));

drop policy if exists "funcionario le historico" on public.agendamentos_log;
create policy "funcionario le historico"
  on public.agendamentos_log for select to authenticated using ((select public.e_funcionario()));

drop policy if exists "funcionario le bloqueios do dia" on public.bloqueios_dia;
create policy "funcionario le bloqueios do dia"
  on public.bloqueios_dia for select to authenticated using ((select public.e_funcionario()));

drop policy if exists "admin le registro" on public.audit_logs;
create policy "admin le registro"
  on public.audit_logs for select to authenticated using ((select public.e_admin()));

-- agenda_limites: nenhuma política = ninguém da API lê (só as funções do banco)

revoke all on table public.agendamentos     from anon, authenticated;
revoke all on table public.funcionarios     from anon, authenticated;
revoke all on table public.agenda_horarios  from anon, authenticated;
revoke all on table public.agendamentos_log from anon, authenticated;
revoke all on table public.audit_logs       from anon, authenticated;
revoke all on table public.bloqueios_dia    from anon, authenticated;
revoke all on table public.agenda_limites   from anon, authenticated;
grant select on table public.agendamentos     to authenticated;   -- RLS: só funcionário ativo
grant select on table public.funcionarios     to authenticated;   -- RLS: só a própria linha
grant select on table public.agenda_horarios  to authenticated;   -- RLS: só funcionário ativo
grant select on table public.agendamentos_log to authenticated;   -- RLS: só funcionário ativo
grant select on table public.bloqueios_dia    to authenticated;   -- RLS: só funcionário ativo
grant select on table public.audit_logs       to authenticated;   -- RLS: só administrador
do $$ begin
  if to_regclass('public.config_avisos') is not null then
    revoke all on table public.config_avisos from anon, authenticated;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 11) QUEM CHAMA CADA FUNÇÃO
--     No Supabase toda função nova nasce liberada para anon: aqui cada uma é fechada.
-- ---------------------------------------------------------------------------
-- internas: ninguém de fora chama
revoke all on function public._tem_mfa(uuid)                                from public, anon, authenticated;
revoke all on function public._mfa_ok(uuid, boolean)                        from public, anon, authenticated;
revoke all on function public._registra_acao(text, date, text, uuid, text)  from public, anon, authenticated;
revoke all on function public._trava_dia(date)                              from public, anon, authenticated;
revoke all on function public._texto_limpo(text, int)                       from public, anon, authenticated;
revoke all on function public._motivo_bloqueio(text, text, text[], text)    from public, anon, authenticated;
revoke all on function public.funcionarios_antes()                          from public, anon, authenticated;
revoke all on function public.agendamentos_antes()                          from public, anon, authenticated;
revoke all on function public.agendamentos_registra()                       from public, anon, authenticated;

-- pedido do cliente: SÓ a chave secreta (função do servidor no Netlify)
revoke all on function public.criar_agendamento(date, text, text, text, text, text, text) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.criar_agendamento(date, text, text, text, text, text, text) to service_role;
  end if;
end $$;

-- site público: só os horários ocupados (dia e hora)
revoke all on function public.horarios_ocupados(date, date) from public;
grant execute on function public.horarios_ocupados(date, date) to anon, authenticated;

-- equipe (cada função confere e_funcionario() ou e_admin() lá dentro)
revoke all on function public.e_funcionario()                               from public, anon;
revoke all on function public.e_admin()                                     from public, anon;
revoke all on function public.meu_acesso()                                  from public, anon;
revoke all on function public.agenda_dia(date)                              from public, anon;
revoke all on function public.resumo_periodo(date, date)                    from public, anon;
revoke all on function public.ver_agendamento(uuid)                         from public, anon;
revoke all on function public.bloquear_horarios(date, text[], text, text)   from public, anon;
revoke all on function public.liberar_bloqueio(uuid)                        from public, anon;
revoke all on function public.bloquear_dia_inteiro(date, text, text)        from public, anon;
revoke all on function public.desbloquear_dia(date)                         from public, anon;
revoke all on function public.bloqueios_ativos(text)                        from public, anon;
revoke all on function public.confirmar_agendamento(uuid)                   from public, anon;
revoke all on function public.cancelar_agendamento(uuid)                    from public, anon;
revoke all on function public.remarcar_agendamento(uuid, date, text)        from public, anon;
revoke all on function public.segurar_horario(date, text, int, text)        from public, anon;
revoke all on function public.liberar_horario(uuid)                         from public, anon;
revoke all on function public.confirmar_horario(uuid)                       from public, anon;
revoke all on function public.limpar_pendentes_vencidos()                   from public, anon;
revoke all on function public.apagar_dados_antigos(int)                     from public, anon;
grant execute on function public.e_funcionario()                             to authenticated;
grant execute on function public.e_admin()                                   to authenticated;
grant execute on function public.meu_acesso()                                to authenticated;
grant execute on function public.agenda_dia(date)                            to authenticated;
grant execute on function public.resumo_periodo(date, date)                  to authenticated;
grant execute on function public.ver_agendamento(uuid)                       to authenticated;
grant execute on function public.bloquear_horarios(date, text[], text, text) to authenticated;
grant execute on function public.liberar_bloqueio(uuid)                      to authenticated;
grant execute on function public.bloquear_dia_inteiro(date, text, text)      to authenticated;
grant execute on function public.desbloquear_dia(date)                       to authenticated;
grant execute on function public.bloqueios_ativos(text)                      to authenticated;
grant execute on function public.confirmar_agendamento(uuid)                 to authenticated;
grant execute on function public.cancelar_agendamento(uuid)                  to authenticated;
grant execute on function public.remarcar_agendamento(uuid, date, text)      to authenticated;
grant execute on function public.segurar_horario(date, text, int, text)      to authenticated;
grant execute on function public.liberar_horario(uuid)                       to authenticated;
grant execute on function public.confirmar_horario(uuid)                     to authenticated;
grant execute on function public.limpar_pendentes_vencidos()                 to authenticated;
grant execute on function public.apagar_dados_antigos(int)                   to authenticated;
do $$ begin
  if to_regprocedure('public.testar_aviso()') is not null then
    revoke all on function public.testar_aviso() from public, anon;
    grant execute on function public.testar_aviso() to authenticated;
  end if;
  if to_regprocedure('public.avisar_telegram()') is not null then
    revoke all on function public.avisar_telegram() from public, anon, authenticated;
  end if;
end $$;

-- a API do Supabase passa a enxergar as funções novas na hora
notify pgrst, 'reload schema';
