-- Testes da área da equipe (/funcionario): MFA, administrador, bloqueios de horário e de dia,
-- conflitos, "Ver" e registro das ações. Rodados por ferramentas/testa-banco.sh depois de
-- testes-agenda.sql e testes-segurar.sql. Qualquer falha para o script inteiro.
\set ON_ERROR_STOP 1
select (select d::date from generate_series(current_date + 2, current_date + 9, interval '1 day') d where extract(dow from d) = 4 limit 1) as qui,
       (select d::date from generate_series(current_date + 2, current_date + 9, interval '1 day') d where extract(dow from d) = 6 limit 1) as sab,
       (select d::date from generate_series(current_date - 9, current_date - 2, interval '1 day') d where extract(dow from d) = 2 limit 1) as passada \gset
select set_config('t.qui', :'qui', false), set_config('t.sab', :'sab', false), set_config('t.passada', :'passada', false) \g /dev/null

insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000005', 'dona@loja.test'),
  ('00000000-0000-4000-8000-000000000006', 'joao@loja.test');
insert into public.funcionarios (user_id, nome, role) values
  ('00000000-0000-4000-8000-000000000005', 'Dona da Loja', 'admin'),
  ('00000000-0000-4000-8000-000000000006', 'Joao', 'funcionario');
-- João já cadastrou um app autenticador (MFA verificado)
insert into auth.mfa_factors (user_id, friendly_name, status) values ('00000000-0000-4000-8000-000000000006', 'SR Phone', 'verified');

create or replace function public.__espera_erro(sql text, erro text) returns void language plpgsql as $$
declare passou boolean := false;
begin
  begin
    execute sql;
    passou := true;
  exception when others then
    if position(erro in sqlerrm) = 0 and sqlstate <> erro then raise; end if;
  end;
  if passou then raise exception 'FALHOU: a operação passou, mas devia dar "%": %', erro, sql; end if;
end $$;
grant execute on function public.__espera_erro(text, text) to anon, authenticated, service_role;
-- "entra" como alguém: o mesmo que o PostgREST faz com o token (sub e aal)
create or replace function public.__como(p_sub text, p_aal text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', false);
  perform set_config('request.jwt.claims', json_build_object('sub', p_sub, 'role', 'authenticated', 'aal', p_aal)::text, false);
end $$;
grant execute on function public.__como(text, text) to anon, authenticated, service_role;

select 'ok: admin nasce com MFA obrigatório'
 where (select exige_mfa from public.funcionarios where user_id = '00000000-0000-4000-8000-000000000005');

-- ===== MFA =====
set role authenticated;
do $$
declare qui date := current_setting('t.qui')::date;
begin
  -- admin com senha mas sem o código (aal1): ainda não entra
  perform public.__como('00000000-0000-4000-8000-000000000005', 'aal1');
  if public.meu_acesso() ->> 'situacao' <> 'mfa_cadastrar' then raise exception 'FALHOU MFA: admin sem MFA não foi mandado cadastrar'; end if;
  perform public.__espera_erro(format($f$select * from public.agenda_dia(%L::date)$f$, qui), 'sem_permissao');
  if exists (select 1 from public.agendamentos) then raise exception 'FALHOU MFA: admin em aal1 leu agendamentos'; end if;
  -- com o código (aal2): entra
  perform public.__como('00000000-0000-4000-8000-000000000005', 'aal2');
  if public.meu_acesso() ->> 'situacao' <> 'ok' or public.meu_acesso() ->> 'role' <> 'admin' then raise exception 'FALHOU MFA: admin em aal2'; end if;
  perform public.agenda_dia(qui);
  -- quem ativou o MFA por conta própria: a senha sozinha não basta
  perform public.__como('00000000-0000-4000-8000-000000000006', 'aal1');
  if public.meu_acesso() ->> 'situacao' <> 'mfa_codigo' then raise exception 'FALHOU MFA: pediu código para quem tem autenticador'; end if;
  perform public.__espera_erro(format($f$select public.bloquear_horarios(%L::date, array['09:00'])$f$, qui), 'sem_permissao');
  perform public.__como('00000000-0000-4000-8000-000000000006', 'aal2');
  if public.meu_acesso() ->> 'situacao' <> 'ok' then raise exception 'FALHOU MFA: João em aal2'; end if;
  -- funcionário comum sem MFA: entra com a senha (aal1)
  perform public.__como('00000000-0000-4000-8000-000000000001', 'aal1');
  if public.meu_acesso() ->> 'situacao' <> 'ok' then raise exception 'FALHOU MFA: funcionário sem MFA'; end if;
end $$;
select 'ok: MFA (admin precisa de código; quem ativou o autenticador também; aal1 não lê nada)';

-- ===== bloquear vários horários de uma vez (tudo ou nada) =====
do $$
declare qui date := current_setting('t.qui')::date; n int;
begin
  perform public.__como('00000000-0000-4000-8000-000000000001', 'aal1');
  n := public.bloquear_horarios(qui, array['09:00','10:00','11:00'], 'Compromisso');
  if n <> 3 then raise exception 'FALHOU vários: %', n; end if;
  if (select count(*) from public.agenda_dia(qui) g where g.estado = 'bloqueado' and g.motivo = 'Compromisso') <> 3 then
    raise exception 'FALHOU vários: a grade não mostra os 3 bloqueios';
  end if;
  -- um dos horários já está bloqueado: nada é bloqueado (operação única)
  perform public.__espera_erro(format($f$select public.bloquear_horarios(%L::date, array['13:00','11:00'])$f$, qui), 'horario_alterado');
  if (select estado from public.agenda_dia(qui) g where g.hora = '13:00') <> 'livre' then raise exception 'FALHOU vários: bloqueou pela metade'; end if;
  -- validações
  perform public.__espera_erro(format($f$select public.bloquear_horarios(%L::date, array['13:00'], 'Inventado')$f$, qui), 'motivo_invalido');
  perform public.__espera_erro(format($f$select public.bloquear_horarios(%L::date, array['03:00'])$f$, qui), 'fora_do_horario');
  perform public.__espera_erro(format($f$select public.bloquear_horarios(%L::date, array[]::text[])$f$, qui), 'hora_invalida');
  perform public.__espera_erro(format($f$select public.bloquear_horarios(%L::date, array['13:00'])$f$, current_setting('t.passada')), 'data_passada');
  -- "Outro" com detalhe: o texto é limpo (sem HTML)
  perform public.bloquear_horarios(qui, array['13:00'], 'Outro', '<b>Reunião</b> com fornecedor');
  if (select motivo from public.agenda_dia(qui) g where g.hora = '13:00') <> 'Outro: b Reunião /b com fornecedor' then
    raise exception 'FALHOU vários: detalhe do "Outro" (%)', (select motivo from public.agenda_dia(qui) g where g.hora = '13:00');
  end if;
end $$;
reset role;
set role service_role;
do $$ begin
  perform public.__espera_erro(format($f$select public.criar_agendamento(%L::date, '10:00', 'x', 'Lia Prado', '22966660001')$f$, current_setting('t.qui')), 'horario_ocupado');
  perform public.criar_agendamento(current_setting('t.qui')::date, '14:00', 'Comprar um aparelho', 'Lia Prado', '22966660001', 'iPhone 15', '');
end $$;
reset role;
select 'ok: bloquear vários horários numa operação só (e o cliente não reserva o bloqueado)';

-- ===== "Ver" e liberar =====
set role authenticated;
do $$
declare qui date := current_setting('t.qui')::date; v uuid; j jsonb; r record;
begin
  perform public.__como('00000000-0000-4000-8000-000000000004', 'aal1');   -- Maria
  select * into r from public.agenda_dia(qui) g where g.hora = '14:00';
  if r.estado <> 'agendado' or r.detalhe <> 'pendente' or r.cliente <> 'Lia Prado' then raise exception 'FALHOU ver: grade %', row_to_json(r); end if;
  -- a grade não traz telefone; o "Ver" traz só o necessário
  if to_jsonb(r) ? 'telefone' then raise exception 'FALHOU ver: telefone na grade'; end if;
  j := public.ver_agendamento(r.id);
  if j ->> 'cliente' <> 'Lia Prado' or j ->> 'telefone' <> '22966660001' or j ->> 'aparelho' <> 'iPhone 15'
     or j ->> 'servico' <> 'Comprar um aparelho' or j ->> 'hora' <> '14:00' then
    raise exception 'FALHOU ver: %', j;
  end if;
  -- liberar NUNCA libera agendamento de cliente
  perform public.__espera_erro(format('select public.liberar_bloqueio(%L::uuid)', r.id), 'horario_alterado');
  if (select status from public.agendamentos where id = r.id) <> 'pendente' then raise exception 'FALHOU: liberar mexeu no agendamento'; end if;
  -- liberar um bloqueio: volta a ficar livre; liberar de novo = alguém já mudou
  select g.id into v from public.agenda_dia(qui) g where g.hora = '09:00';
  if public.liberar_bloqueio(v) <> 'ok' then raise exception 'FALHOU liberar'; end if;
  if (select estado from public.agenda_dia(qui) g where g.hora = '09:00') <> 'livre' then raise exception 'FALHOU liberar: não ficou livre'; end if;
  perform public.__espera_erro(format('select public.liberar_bloqueio(%L::uuid)', v), 'horario_alterado');
  -- quem liberou fica registrado (o registro é só do admin; aqui confere direto no banco depois)
end $$;
reset role;
set role service_role;
select public.criar_agendamento(current_setting('t.qui')::date, '09:00', 'Conhecer a loja', 'Rui Barros', '22966660002') \g /dev/null
reset role;
select 'ok: "Ver" mostra só o necessário; liberar desfaz bloqueio e nunca agendamento; o horário volta para o cliente';

-- ===== dia inteiro =====
set role authenticated;
do $$
declare sab date := current_setting('t.sab')::date; qui date := current_setting('t.qui')::date; j jsonb; n int;
begin
  perform public.__como('00000000-0000-4000-8000-000000000001', 'aal1');
  j := public.bloquear_dia_inteiro(qui, 'Feriado');
  if (j ->> 'agendamentos')::int <> 2 then raise exception 'FALHOU dia: devia avisar 2 agendamentos (%)', j; end if;
  -- os agendamentos de cliente continuam; o resto do dia fica bloqueado
  if (select count(*) from public.agenda_dia(qui) g where g.estado = 'agendado') <> 2 then raise exception 'FALHOU dia: perdeu agendamento'; end if;
  if (select count(*) from public.agenda_dia(qui) g where g.estado = 'bloqueado' and g.detalhe = 'dia' and g.motivo = 'Feriado') < 3 then
    raise exception 'FALHOU dia: grade do dia bloqueado';
  end if;
  -- outra pessoa bloqueando o mesmo dia ao mesmo tempo: "alterado"
  perform public.__espera_erro(format($f$select public.bloquear_dia_inteiro(%L::date)$f$, qui), 'horario_alterado');
  perform public.__espera_erro(format($f$select public.bloquear_horarios(%L::date, array['15:00'])$f$, qui), 'dia_bloqueado');
  perform public.__espera_erro(format($f$select public.segurar_horario(%L::date, '15:00', 30)$f$, qui), 'dia_bloqueado');
  perform public.__espera_erro(format($f$select public.bloquear_dia_inteiro(%L::date, 'Aniversário')$f$, sab), 'motivo_invalido');
  perform public.__espera_erro(format($f$select public.bloquear_dia_inteiro(%L::date)$f$, current_setting('t.passada')), 'data_passada');
  perform public.__espera_erro($f$select public.bloquear_dia_inteiro((select d::date from generate_series(current_date + 2, current_date + 9, interval '1 day') d where extract(dow from d) = 0 limit 1))$f$, 'loja_fechada');
  -- lista de bloqueios: o dia e os horários
  if not exists (select 1 from public.bloqueios_ativos('todos') b where b.tipo = 'dia' and b.data = qui and b.motivo = 'Feriado' and b.por_nome = 'Func') then
    raise exception 'FALHOU dia: não aparece em Bloqueios';
  end if;
  if (select count(*) from public.bloqueios_ativos('todos') b where b.tipo = 'horario' and b.data = qui) <> 3 then
    raise exception 'FALHOU dia: horários bloqueados na lista (%)', (select count(*) from public.bloqueios_ativos('todos') b where b.tipo = 'horario' and b.data = qui);
  end if;
  if exists (select 1 from public.bloqueios_ativos('hoje') b where b.data <> (now() at time zone 'America/Sao_Paulo')::date) then
    raise exception 'FALHOU dia: filtro "hoje"';
  end if;
  perform public.__espera_erro($f$select * from public.bloqueios_ativos('qualquer')$f$, 'filtro_invalido');
  -- calendário
  select count(*) into n from public.resumo_periodo(qui, qui) r where r.dia_bloqueado and r.agendados = 2 and r.pendentes = 2 and r.bloqueados = 3;
  if n <> 1 then raise exception 'FALHOU dia: resumo do calendário'; end if;
end $$;
reset role;
set role service_role;
do $$ begin
  perform public.__espera_erro(format($f$select public.criar_agendamento(%L::date, '15:00', 'x', 'Teo Dias', '22966660003')$f$, current_setting('t.qui')), 'dia_bloqueado');
end $$;
reset role;
-- desbloquear o dia: os agendamentos e os bloqueios de horário continuam como estavam
set role authenticated;
do $$
declare qui date := current_setting('t.qui')::date; j jsonb;
begin
  perform public.__como('00000000-0000-4000-8000-000000000004', 'aal1');
  j := public.desbloquear_dia(qui);
  if (j ->> 'agendamentos')::int <> 2 then raise exception 'FALHOU desbloquear: %', j; end if;
  if (select count(*) from public.agenda_dia(qui) g where g.estado = 'agendado') <> 2 then raise exception 'FALHOU desbloquear: mexeu em agendamento'; end if;
  if (select estado from public.agenda_dia(qui) g where g.hora = '15:00') <> 'livre' then raise exception 'FALHOU desbloquear: 15:00 não voltou'; end if;
  if (select estado from public.agenda_dia(qui) g where g.hora = '10:00') <> 'bloqueado' then raise exception 'FALHOU desbloquear: levou o bloqueio do horário junto'; end if;
  perform public.__espera_erro(format($f$select public.desbloquear_dia(%L::date)$f$, qui), 'horario_alterado');
end $$;
reset role;
select 'ok: dia inteiro (bloquear, avisar agendamentos, conflito, desbloquear sem mexer em cliente)';

-- ===== dia que já passou: tudo "indisponível" para quem está livre =====
set role authenticated;
do $$ begin
  perform public.__como('00000000-0000-4000-8000-000000000001', 'aal1');
  if exists (select 1 from public.agenda_dia(current_setting('t.passada')::date) g where g.estado = 'livre') then
    raise exception 'FALHOU: dia passado com horário livre';
  end if;
  if not exists (select 1 from public.agenda_dia(current_setting('t.passada')::date) g where g.estado = 'indisponivel') then
    raise exception 'FALHOU: dia passado sem "indisponivel"';
  end if;
end $$;
reset role;

-- ===== registro das ações: só admin lê; ninguém edita =====
set role authenticated;
do $$
declare n int;
begin
  perform public.__como('00000000-0000-4000-8000-000000000001', 'aal1');
  select count(*) into n from public.audit_logs;
  if n <> 0 then raise exception 'FALHOU registro: funcionário comum leu % linhas', n; end if;
  perform public.__espera_erro($f$insert into public.audit_logs (acao) values ('falso')$f$, '42501');
  perform public.__espera_erro('select public._registra_acao(''falso'', null, '''', null, '''')', '42501');
  perform public.__espera_erro('select public.apagar_dados_antigos(30)', 'sem_permissao');
  -- admin sem o código (aal1) também não lê
  perform public.__como('00000000-0000-4000-8000-000000000005', 'aal1');
  select count(*) into n from public.audit_logs;
  if n <> 0 then raise exception 'FALHOU registro: admin em aal1 leu'; end if;
  perform public.__como('00000000-0000-4000-8000-000000000005', 'aal2');
  select count(*) into n from public.audit_logs;
  if n < 6 then raise exception 'FALHOU registro: admin leu só % linhas', n; end if;
  if not exists (select 1 from public.audit_logs where acao = 'bloqueou_horario' and hora = '09:00, 10:00, 11:00' and detalhe = 'Compromisso'
                    and funcionario_nome = 'Func') then raise exception 'FALHOU registro: bloquear vários'; end if;
  if not exists (select 1 from public.audit_logs where acao = 'liberou_horario' and hora = '09:00' and funcionario_nome = 'Maria de Fatima' and registro_id is not null)
    then raise exception 'FALHOU registro: liberar'; end if;
  if not exists (select 1 from public.audit_logs where acao = 'desbloqueou_dia' and funcionario_nome = 'Maria de Fatima') then raise exception 'FALHOU registro: desbloquear dia'; end if;
  -- e nada de dado de cliente no registro
  if exists (select 1 from public.audit_logs where detalhe ~ '2296666|Lia Prado|Rui Barros' or hora ~ 'Lia') then raise exception 'FALHOU registro: dado de cliente'; end if;
end $$;
reset role;
select 'ok: registro das ações (quem, o quê, dia, hora, registro), só o admin com MFA lê, ninguém edita';

-- ===== desativar funcionário: vale na hora =====
update public.funcionarios set ativo = false where email = 'joao@loja.test';
set role authenticated;
do $$ begin
  perform public.__como('00000000-0000-4000-8000-000000000006', 'aal2');
  if public.meu_acesso() ->> 'situacao' <> 'sem_acesso' then raise exception 'FALHOU: desativado continuou entrando'; end if;
  perform public.__espera_erro(format($f$select * from public.agenda_dia(%L::date)$f$, current_setting('t.qui')), 'sem_permissao');
end $$;
reset role;
select 'ok: funcionário desativado perde o acesso na hora';

select set_config('request.jwt.claims', '', false) \g /dev/null
select set_config('request.jwt.claim.sub', '', false) \g /dev/null
drop function public.__espera_erro(text, text);
drop function public.__como(text, text);
select 'TESTES DA ÁREA DA EQUIPE: TUDO OK';
