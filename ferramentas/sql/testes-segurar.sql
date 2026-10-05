-- Testes do "segurar horário" (rodados por ferramentas/testa-banco.sh, depois de testes-agenda.sql)
-- Cada bloco imprime "ok: ..." e qualquer falha para o script inteiro.
\set ON_ERROR_STOP 1
select (select d::date from generate_series(current_date + 2, current_date + 9, interval '1 day') d where extract(dow from d) = 5 limit 1) as sex \gset
select set_config('t.sex', :'sex', false) \g /dev/null

-- segunda funcionária ativa (a primeira, "Func", vem de testes-agenda.sql)
insert into auth.users (id, email) values ('00000000-0000-4000-8000-000000000004', 'maria@loja.test');
insert into public.funcionarios (user_id, nome, ativo) values ('00000000-0000-4000-8000-000000000004', 'Maria de Fatima', true);

-- a operação TEM que falhar com o erro esperado. Se passar, o teste para aqui.
-- (o "FALHOU" fica fora do bloco que captura erros: senão ele mesmo seria engolido)
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
-- para o teste de expiração: faz o prazo acabar sem esperar 15 minutos
create or replace function public.__vence(p uuid) returns void language plpgsql as $$
begin
  set local session_replication_role = replica;      -- sem gatilhos: só muda o relógio do registro
  update public.agendamentos set segurado_ate = now() - interval '1 minute' where id = p;
  set local session_replication_role = origin;
end $$;

-- ===== 1. funcionária segura um horário livre =====
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', false) \g /dev/null
do $$
declare v uuid; r record; sex date := current_setting('t.sex')::date;
begin
  v := public.segurar_horario(sex, '10:00', 30, 'Cliente falando pelo WhatsApp');
  select * into r from public.agendamentos where id = v;
  if r.status <> 'segurado' then raise exception 'FALHOU 1: status %', r.status; end if;
  if r.segurado_por <> '00000000-0000-4000-8000-000000000004' then raise exception 'FALHOU 1: segurado_por %', r.segurado_por; end if;
  if r.segurado_ate not between now() + interval '29 minutes' and now() + interval '31 minutes' then raise exception 'FALHOU 1: segurado_ate %', r.segurado_ate; end if;
  if r.motivo_seguro <> 'Cliente falando pelo WhatsApp' then raise exception 'FALHOU 1: motivo %', r.motivo_seguro; end if;
  if r.atualizado_por <> auth.uid() then raise exception 'FALHOU 1: atualizado_por'; end if;
  if not exists (select 1 from public.agendamentos_log l where l.agendamento_id = v and l.acao = 'segurou' and l.por = auth.uid())
    then raise exception 'FALHOU 1: histórico sem "segurou"'; end if;
  -- painel: a grade do dia mostra segurado, por quem, até quando e o motivo
  select * into r from public.agenda_dia(sex) g where g.hora = '10:00';
  if r.estado <> 'segurado' or r.segurado_por_nome <> 'Maria de Fatima' or r.expira_em_min not between 29 and 31
     or r.motivo_seguro <> 'Cliente falando pelo WhatsApp' then
    raise exception 'FALHOU 1: agenda_do_dia %', row_to_json(r);
  end if;
  if (select count(*) from public.agenda_dia(sex) g where g.estado = 'livre') <> 8 then
    raise exception 'FALHOU 1: a sexta devia ter 8 horários livres e 1 segurado';
  end if;
  -- valores fora do combinado: nada de zero, negativo, 45 ou 8 horas
  perform public.__espera_erro(format($f$select public.segurar_horario(%L::date, '11:00', 0)$f$, sex), 'duracao_invalida');
  perform public.__espera_erro(format($f$select public.segurar_horario(%L::date, '11:00', -15)$f$, sex), 'duracao_invalida');
  perform public.__espera_erro(format($f$select public.segurar_horario(%L::date, '11:00', 45)$f$, sex), 'duracao_invalida');
  perform public.__espera_erro(format($f$select public.segurar_horario(%L::date, '11:00', 480)$f$, sex), 'duracao_invalida');
  perform public.__espera_erro(format($f$select public.segurar_horario(%L::date, '11:00', null)$f$, sex), 'duracao_invalida');
  perform public.__espera_erro(format($f$select public.segurar_horario(%L::date, '03:00', 30)$f$, sex), 'fora_do_horario');
  perform public.__espera_erro($f$select public.segurar_horario(current_date - 1, '10:00', 30)$f$, 'data_fora_do_periodo');
  perform public.__espera_erro(format($f$select public.segurar_horario(%L::date, '10h', 30)$f$, sex), 'hora_invalida');
  -- gravar direto pela API (mesmo sendo da equipe) não pode: só pelas funções
  perform public.__espera_erro(format($f$insert into public.agendamentos (data, hora, status, segurado_por, segurado_ate)
    values (%L::date, '16:00', 'segurado', '00000000-0000-4000-8000-000000000001', now() + interval '15 minutes')$f$, sex), '42501');
end $$;
-- e o gatilho continua de guarda (para quem grava com a chave do servidor): quem segurou é
-- sempre o usuário logado, e prazo de 10 horas não passa
reset role;
do $$
declare v uuid; sex date := current_setting('t.sex')::date;
begin
  insert into public.agendamentos (data, hora, status, segurado_por, segurado_ate)
  values (sex, '16:00', 'segurado', '00000000-0000-4000-8000-000000000001', now() + interval '15 minutes')
  returning id into v;
  if (select segurado_por from public.agendamentos where id = v) <> '00000000-0000-4000-8000-000000000004' then
    raise exception 'FALHOU 1: segurado_por veio do navegador';
  end if;
  update public.agendamentos set status = 'cancelado' where id = v;
  perform public.__espera_erro(format($f$insert into public.agendamentos (data, hora, status, segurado_por, segurado_ate)
    values (%L::date, '17:00', 'segurado', auth.uid(), now() + interval '10 hours')$f$, sex), 'duracao_invalida');
end $$;
set role authenticated;
select 'ok: 1. funcionária segura horário livre (quem, até quando, motivo, histórico, validações)';

-- ===== 3. outra funcionária não segura nem bloqueia o mesmo horário =====
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false) \g /dev/null
do $$
declare sex date := current_setting('t.sex')::date; r text;
begin
  perform public.__espera_erro(format($f$select public.segurar_horario(%L::date, '10:00', 15)$f$, sex), 'horario_ocupado');
  perform public.__espera_erro(format($f$select public.bloquear_horarios(%L::date, array['10:00'])$f$, sex), 'horario_alterado');
  -- e o nome de quem segurou chega para a equipe
  if (select segurado_por_nome from public.agenda_dia(sex) g where g.hora = '10:00') <> 'Maria de Fatima' then raise exception 'FALHOU 3: nome de quem segurou'; end if;
end $$;
select 'ok: 3. outra funcionária não segura (nem bloqueia) o horário segurado';

-- ===== 2 e 4. para o cliente, o horário segurado some e não pode ser reservado =====
reset role;
select set_config('request.jwt.claim.sub', '', false) \g /dev/null
set role anon;
do $$
declare sex date := current_setting('t.sex')::date; n int;
begin
  select count(*) into n from public.horarios_ocupados(sex, sex) o where o.hora = '10:00';
  if n <> 1 then raise exception 'FALHOU 2: horário segurado não apareceu como ocupado (%)', n; end if;
  -- nada de dado da equipe para o público: cada linha tem só dia e hora
  if (select array_agg(k order by k) from jsonb_object_keys(
        (select to_jsonb(o) from public.horarios_ocupados(sex, sex) o where o.hora = '10:00')) k) <> array['data','hora'] then
    raise exception 'FALHOU 2: horarios_ocupados devolve mais que dia e hora';
  end if;
end $$;
reset role;
set role service_role;
do $$ begin
  perform public.__espera_erro(format($f$select public.criar_agendamento(%L::date, '10:00', 'x', 'Gabi Rocha', '22977770001')$f$, current_setting('t.sex')), 'horario_ocupado');
end $$;
select 'ok: 2. horário segurado aparece só como ocupado (dia e hora) para o cliente';
select 'ok: 4. cliente não reserva horário segurado';
reset role;

-- ===== 5. prazo acabou: o horário volta sozinho (sem cron) =====
select public.__vence(id) from public.agendamentos
 where data = current_setting('t.sex')::date and hora = '10:00' and status = 'segurado' \g /dev/null
set role anon;
do $$
declare sex date := current_setting('t.sex')::date; n int;
begin
  select count(*) into n from public.horarios_ocupados(sex, sex) o where o.hora = '10:00';
  if n <> 0 then raise exception 'FALHOU 5: segurado vencido continua ocupando para o cliente'; end if;
end $$;
reset role;
set role service_role;
select public.criar_agendamento(current_setting('t.sex')::date, '10:00', 'Trocar de aparelho', 'Gabi Rocha', '22977770001') \g /dev/null
reset role;
do $$
declare sex date := current_setting('t.sex')::date;
begin
  if (select count(*) from public.agendamentos where data = sex and hora = '10:00' and status = 'pendente') <> 1 then
    raise exception 'FALHOU 5: o cliente não reservou o horário vencido';
  end if;
  if not exists (select 1 from public.agendamentos a join public.agendamentos_log l on l.agendamento_id = a.id
                  where a.data = sex and a.hora = '10:00' and a.status = 'cancelado' and l.acao = 'expirou') then
    raise exception 'FALHOU 5: o segurado vencido não foi encerrado com "expirou" no histórico';
  end if;
end $$;
-- vencido também não impede outra funcionária de segurar de novo, nem aceita confirmação
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', false) \g /dev/null
select set_config('t.v11', public.segurar_horario(current_setting('t.sex')::date, '11:00', 15)::text, false) \g /dev/null
reset role;
select public.__vence(current_setting('t.v11')::uuid) \g /dev/null
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false) \g /dev/null
do $$
declare sex date := current_setting('t.sex')::date; r record;
begin
  if public.confirmar_horario(current_setting('t.v11')::uuid) <> 'expirado' then raise exception 'FALHOU 5: confirmou um segurado vencido'; end if;
  select * into r from public.agenda_dia(sex) g where g.hora = '11:00';
  if r.estado <> 'livre' then raise exception 'FALHOU 5: painel mostra o vencido como %', r.estado; end if;
  perform public.segurar_horario(sex, '11:00', 60, 'outra conversa');
  if (select count(*) from public.agendamentos where data = sex and hora = '11:00' and status = 'segurado') <> 1 then
    raise exception 'FALHOU 5: não segurou de novo o horário vencido';
  end if;
end $$;
select 'ok: 5. segurado vencido volta a ficar livre (cliente reserva, painel mostra livre, dá para segurar de novo)';

-- ===== 6. liberar =====
do $$
declare sex date := current_setting('t.sex')::date; v uuid; r text;
begin
  v := public.segurar_horario(sex, '13:00', 15);
  r := public.liberar_horario(v);
  if r <> 'ok' then raise exception 'FALHOU 6: liberar devolveu %', r; end if;
  if (select status from public.agendamentos where id = v) <> 'cancelado' then raise exception 'FALHOU 6: status depois de liberar'; end if;
  if (select atualizado_por from public.agendamentos where id = v) <> auth.uid() then raise exception 'FALHOU 6: atualizado_por'; end if;
  if not exists (select 1 from public.agendamentos_log where agendamento_id = v and acao = 'liberou' and por = auth.uid()) then
    raise exception 'FALHOU 6: histórico sem "liberou"'; end if;
  if public.liberar_horario(v) <> 'nao_encontrado' then raise exception 'FALHOU 6: liberou duas vezes'; end if;
  if (select estado from public.agenda_dia(sex) g where g.hora = '13:00') <> 'livre' then raise exception 'FALHOU 6: não voltou a ficar livre'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false) \g /dev/null
set role service_role;
select public.criar_agendamento(current_setting('t.sex')::date, '13:00', 'x', 'Hugo Lins', '22977770002') \g /dev/null
reset role;
select 'ok: 6. funcionário libera e o horário volta para o cliente';

-- ===== 7. confirmar =====
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', false) \g /dev/null
do $$
declare sex date := current_setting('t.sex')::date; v uuid; r record;
begin
  v := public.segurar_horario(sex, '14:00', 120, 'Cliente vai passar à tarde');
  if public.confirmar_horario(v) <> 'ok' then raise exception 'FALHOU 7: confirmar'; end if;
  select * into r from public.agendamentos where id = v;
  if r.status <> 'confirmado' or r.segurado_ate is not null or r.segurado_por <> auth.uid()
     or r.motivo_seguro <> 'Cliente vai passar à tarde' then
    raise exception 'FALHOU 7: registro confirmado %', row_to_json(r);
  end if;
  if not exists (select 1 from public.agendamentos_log where agendamento_id = v and acao = 'confirmou' and por = auth.uid()) then
    raise exception 'FALHOU 7: histórico sem "confirmou"'; end if;
  if public.confirmar_horario(v) <> 'nao_encontrado' then raise exception 'FALHOU 7: confirmou duas vezes'; end if;
  if public.liberar_horario(v) <> 'nao_encontrado' then raise exception 'FALHOU 7: liberou um confirmado'; end if;
  -- pedido pendente de cliente também confirma por aqui, sem perder nome e telefone
  select id into v from public.agendamentos where data = sex and hora = '13:00' and status = 'pendente';
  if public.confirmar_horario(v) <> 'ok' then raise exception 'FALHOU 7: confirmar pendente'; end if;
  select * into r from public.agendamentos where id = v;
  if r.status <> 'confirmado' or r.nome <> 'Hugo Lins' or r.telefone = '' then raise exception 'FALHOU 7: dados do cliente'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', false) \g /dev/null
set role service_role;
do $$ begin
  perform public.__espera_erro(format($f$select public.criar_agendamento(%L::date, '14:00', 'x', 'Iara Melo', '22977770003')$f$, current_setting('t.sex')), 'horario_ocupado');
end $$;
reset role;
select 'ok: 7. funcionário confirma (status confirmado, prazo limpo, dados do cliente preservados)';

-- ===== 8. visitante e usuário sem acesso não chamam nada da equipe =====
set role anon;
do $$
declare sex text := current_setting('t.sex');
begin
  perform public.__espera_erro(format($f$select public.segurar_horario(%L::date, '15:00', 30)$f$, sex), '42501');
  perform public.__espera_erro('select public.liberar_horario(gen_random_uuid())', '42501');
  perform public.__espera_erro('select public.confirmar_horario(gen_random_uuid())', '42501');
  perform public.__espera_erro(format($f$select * from public.agenda_dia(%L::date)$f$, sex), '42501');
  perform public.__espera_erro('select * from public.bloqueios_ativos()', '42501');
  perform public.__espera_erro('select public.confirmar_agendamento(gen_random_uuid())', '42501');
  perform public.__espera_erro(format($f$select public.bloquear_horarios(%L::date, array['15:00'])$f$, sex), '42501');
  perform public.__espera_erro(format($f$select public.bloquear_dia_inteiro(%L::date)$f$, sex), '42501');
  perform public.__espera_erro(format($f$select public.desbloquear_dia(%L::date)$f$, sex), '42501');
  perform public.__espera_erro('select public.liberar_bloqueio(gen_random_uuid())', '42501');
  perform public.__espera_erro('select public.ver_agendamento(gen_random_uuid())', '42501');
  perform public.__espera_erro('select count(*) from public.agendamentos_log', '42501');
  perform public.__espera_erro('select count(*) from public.agendamentos', '42501');
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', false) \g /dev/null
do $$
declare sex text := current_setting('t.sex'); n int;
begin
  perform public.__espera_erro(format($f$select public.segurar_horario(%L::date, '15:00', 30)$f$, sex), 'sem_permissao');
  perform public.__espera_erro('select public.liberar_horario(gen_random_uuid())', 'sem_permissao');
  perform public.__espera_erro('select public.confirmar_horario(gen_random_uuid())', 'sem_permissao');
  perform public.__espera_erro(format($f$select * from public.agenda_dia(%L::date)$f$, sex), 'sem_permissao');
  perform public.__espera_erro('select * from public.bloqueios_ativos()', 'sem_permissao');
  perform public.__espera_erro('select public.ver_agendamento(gen_random_uuid())', 'sem_permissao');
  perform public.__espera_erro('select public.liberar_bloqueio(gen_random_uuid())', 'sem_permissao');
  select count(*) into n from public.agendamentos_log;
  if n <> 0 then raise exception 'FALHOU 8: usuário comum leu % linhas do histórico', n; end if;
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', false) \g /dev/null
do $$ begin
  perform public.__espera_erro(format($f$select public.segurar_horario(%L::date, '15:00', 30)$f$, current_setting('t.sex')), 'sem_permissao');
end $$;
reset role;
select 'ok: 8. visitante (anon) e usuário que não é funcionário ativo não seguram, liberam, confirmam nem leem a agenda';

-- ===== 9. bloqueado continua igual: não expira e não é "liberado" =====
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false) \g /dev/null
do $$
declare sex date := current_setting('t.sex')::date; v uuid;
begin
  if public.bloquear_horarios(sex, array['15:00'], 'Almoço') <> 1 then raise exception 'FALHOU 9: bloquear'; end if;
  select id into v from public.agendamentos where data = sex and hora = '15:00' and status = 'bloqueado';
  if (select segurado_ate from public.agendamentos where id = v) is not null then raise exception 'FALHOU 9: bloqueio ganhou prazo'; end if;
  if public.liberar_horario(v) <> 'nao_encontrado' then raise exception 'FALHOU 9: "liberar" desfez um bloqueio'; end if;
  if (select estado from public.agenda_dia(sex) g where g.hora = '15:00') <> 'bloqueado' then raise exception 'FALHOU 9: painel'; end if;
end $$;
reset role;
-- mesmo "muito tempo depois", o bloqueio segue fechando o horário
select set_config('request.jwt.claim.sub', '', false) \g /dev/null
set role anon;
do $$
declare sex date := current_setting('t.sex')::date;
begin
  if not exists (select 1 from public.horarios_ocupados(sex, sex) o where o.hora = '15:00') then raise exception 'FALHOU 9: bloqueio sumiu'; end if;
end $$;
reset role;
set role service_role;
do $$ begin
  perform public.__espera_erro(format($f$select public.criar_agendamento(%L::date, '15:00', 'x', 'Joana Paz', '22977770004')$f$, current_setting('t.sex')), 'horario_ocupado');
end $$;
reset role;
select 'ok: 9. bloqueado continua fechando o horário, sem prazo e sem "liberar"';

-- ===== 10. o que já existia continua funcionando =====
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false) \g /dev/null
do $$
declare sex date := current_setting('t.sex')::date; v uuid; r text;
begin
  -- pedido feito antes (testes-agenda.sql) segue lá e a equipe confirma e cancela como antes
  select id into v from public.agendamentos where nome = 'Carla script';
  if v is null then raise exception 'FALHOU 10: pedido antigo sumiu'; end if;
  if public.confirmar_agendamento(v) <> 'ok' then raise exception 'FALHOU 10: confirmar_agendamento'; end if;
  if public.cancelar_agendamento(v) <> 'ok' then raise exception 'FALHOU 10: cancelar_agendamento'; end if;
  -- remarcar para um horário segurado: ocupado. Para um livre: ok
  select id into v from public.agendamentos where data = sex and hora = '10:00' and status = 'pendente';
  r := public.remarcar_agendamento(v, sex, '11:00');
  if r <> 'ocupado' then raise exception 'FALHOU 10: remarcou para cima de um segurado (%)', r; end if;
  r := public.remarcar_agendamento(v, sex, '17:00');
  if r <> 'ok' then raise exception 'FALHOU 10: remarcar para horário livre (%)', r; end if;
  if not exists (select 1 from public.agendamentos_log where agendamento_id = v and acao = 'remarcou') then
    raise exception 'FALHOU 10: histórico sem "remarcou"'; end if;
  -- bloquear o dia não mexe no que está ocupado ou segurado
  perform public.bloquear_dia_inteiro(sex, 'Loja fechada');
  if (select count(*) from public.agendamentos where data = sex and hora = '11:00' and status in ('segurado','bloqueado')) <> 1 then
    raise exception 'FALHOU 10: bloquear o dia mexeu no horário segurado';
  end if;
  if (select estado from public.agenda_dia(sex) g where g.hora = '11:00') <> 'segurado'
     or (select estado from public.agenda_dia(sex) g where g.hora = '16:00') <> 'bloqueado' then
    raise exception 'FALHOU 10: grade do dia fechado';
  end if;
end $$;
reset role;
select 'ok: 10. pedidos, confirmação, cancelamento, remarcação e bloqueio antigos continuam funcionando';

select set_config('request.jwt.claim.sub', '', false) \g /dev/null
drop function public.__espera_erro(text, text);
drop function public.__vence(uuid);
select 'TESTES DE SEGURAR HORÁRIO: TUDO OK';
