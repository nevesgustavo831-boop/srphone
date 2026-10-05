-- Testes da agenda (rodados por ferramentas/testa-banco.sh num PostgreSQL local descartável)
\set ON_ERROR_STOP 1
select (select d::date from generate_series(current_date + 2, current_date + 9, interval '1 day') d where extract(dow from d) = 1 limit 1) as seg,
       (select d::date from generate_series(current_date + 2, current_date + 9, interval '1 day') d where extract(dow from d) = 2 limit 1) as ter,
       (select d::date from generate_series(current_date + 2, current_date + 9, interval '1 day') d where extract(dow from d) = 0 limit 1) as dom \gset
select set_config('t.seg', :'seg', false), set_config('t.ter', :'ter', false), set_config('t.dom', :'dom', false) \g /dev/null

-- funcionário de teste (ativo) e um usuário comum que NÃO é funcionário
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-000000000001', 'func@loja.test'),
  ('00000000-0000-4000-8000-000000000002', 'cliente@x.test'),
  ('00000000-0000-4000-8000-000000000003', 'exfunc@loja.test');
insert into public.funcionarios (user_id, nome, ativo) values
  ('00000000-0000-4000-8000-000000000001', 'Func', true),
  ('00000000-0000-4000-8000-000000000003', 'Ex', false);
select 'ok: e-mail do funcionário veio do Supabase Auth'
 where (select email from public.funcionarios where user_id = '00000000-0000-4000-8000-000000000001') = 'func@loja.test';

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

-- ---------- pedido do cliente: só pela função do servidor (service_role) ----------
set role service_role;
do $$
declare seg text := current_setting('t.seg'); dom text := current_setting('t.dom');
begin
  perform public.criar_agendamento(seg::date, '10:00', 'Comprar um aparelho', 'Ana Souza', '(22) 99999-0001', 'iPhone 13 128 GB', '');
  perform public.__espera_erro(format($f$select public.criar_agendamento(%L::date, '10:00', 'x', 'Bruno Lima', '22999990002')$f$, seg), 'horario_ocupado');
  perform public.__espera_erro(format($f$select public.criar_agendamento(%L::date, '03:00', 'x', 'Bruno Lima', '22999990002')$f$, seg), 'fora_do_horario');
  perform public.__espera_erro(format($f$select public.criar_agendamento(%L::date, '10:00', 'x', 'Bruno Lima', '22999990002')$f$, dom), 'fora_do_horario');
  perform public.__espera_erro(format($f$select public.criar_agendamento(%L::date, '11:00', 'x', 'B', '22999990002')$f$, seg), 'nome_invalido');
  perform public.__espera_erro(format($f$select public.criar_agendamento(%L::date, '11:00', 'x', 'Bruno 2', '22999990002')$f$, seg), 'nome_invalido');
  perform public.__espera_erro(format($f$select public.criar_agendamento(%L::date, '11:00', 'x', 'Bruno Lima', '123')$f$, seg), 'telefone_invalido');
  perform public.__espera_erro(format($f$select public.criar_agendamento(%L::date, '11:00', 'x', 'Bruno Lima', '22999990002', '', 'nao-e-hash')$f$, seg), 'origem_invalida');
  perform public.__espera_erro($f$select public.criar_agendamento(current_date - 1, '11:00', 'x', 'Bruno Lima', '22999990002')$f$, 'data_fora_do_periodo');
  perform public.__espera_erro($f$select public.criar_agendamento(current_date + 45, '11:00', 'x', 'Bruno Lima', '22999990002')$f$, 'data_fora_do_periodo');
  -- mesmo WhatsApp, mesmo dia: pedido repetido
  perform public.__espera_erro(format($f$select public.criar_agendamento(%L::date, '11:00', 'x', 'Ana Souza', '22 99999-0001')$f$, seg), 'pedido_duplicado');
  -- limite de 2 pedidos pendentes futuros por WhatsApp
  perform public.criar_agendamento(current_setting('t.ter')::date, '09:00', 'x', 'Ana Souza', '22999990001');
  perform public.__espera_erro(format($f$select public.criar_agendamento(%L::date + 7, '09:00', 'x', 'Ana Souza', '22999990001')$f$, seg), 'limite_por_telefone');
  -- HTML no nome não passa adiante; nome com acento vale
  perform public.criar_agendamento(seg::date, '13:00', '<b>x</b>', 'Carla <script>', '22999990003');
  perform public.criar_agendamento(seg::date, '16:00', 'Conhecer a loja', 'Zé', '22999990009');
end $$;
reset role;
select 'ok: sanitização' where (select nome from public.agendamentos where telefone like '%0003') = 'Carla script';
select 'ok: aparelho guardado' where (select aparelho from public.agendamentos where telefone like '%0001' and hora = '10:00') = 'iPhone 13 128 GB';

-- ---------- visitante (anon): não grava e não lê nada pessoal ----------
set role anon;
do $$
declare seg text := current_setting('t.seg'); n int;
begin
  -- a porta antiga fechou: a chave pública não cria pedido de jeito nenhum
  perform public.__espera_erro(format($f$select public.criar_agendamento(%L::date, '11:00', 'x', 'Robo Robo', '22999990010')$f$, seg), '42501');
  perform public.__espera_erro(format($f$select public.solicitar_horario(%L::date, '11:00', 'x', 'Robo Robo', '22999990010')$f$, seg), 'does not exist');
  perform public.__espera_erro(format($f$insert into public.agendamentos (data, hora, nome) values (%L::date, '11:00', 'Robo')$f$, seg), '42501');
  perform public.__espera_erro('select count(*) from public.agendamentos', '42501');
  perform public.__espera_erro('select count(*) from public.funcionarios', '42501');
  perform public.__espera_erro('select count(*) from public.audit_logs', '42501');
  perform public.__espera_erro('select count(*) from public.bloqueios_dia', '42501');
  perform public.__espera_erro('select count(*) from public.agenda_limites', '42501');
  perform public.__espera_erro('select public.confirmar_agendamento(gen_random_uuid())', '42501');
  perform public.__espera_erro('select public.meu_acesso()', '42501');
  -- o público vê só dia e hora ocupados
  select count(*) into n from public.horarios_ocupados(current_date, current_date + 30);
  if n <> 4 then raise exception 'FALHOU: horarios_ocupados devolveu % linhas', n; end if;
end $$;
reset role;

-- ---------- usuário logado que NÃO é funcionário ----------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', false) \g /dev/null
do $$
declare n int;
begin
  select count(*) into n from public.agendamentos;
  if n <> 0 then raise exception 'FALHOU: usuário comum enxergou % agendamentos', n; end if;
  if public.meu_acesso() ->> 'situacao' <> 'sem_acesso' then raise exception 'FALHOU: usuário comum entrou na área da equipe'; end if;
  perform public.__espera_erro('select public.confirmar_agendamento(gen_random_uuid())', 'sem_permissao');
  perform public.__espera_erro(format($f$select public.bloquear_horarios(%L::date, array['15:00'])$f$, current_setting('t.seg')), 'sem_permissao');
  perform public.__espera_erro(format($f$select public.criar_agendamento(%L::date, '11:00', 'x', 'Robo Robo', '22999990010')$f$, current_setting('t.seg')), '42501');
  -- ninguém se cadastra como funcionário pela API
  perform public.__espera_erro($f$insert into public.funcionarios (user_id, nome) values ('00000000-0000-4000-8000-000000000002', 'Eu')$f$, '42501');
end $$;
-- ex-funcionário (ativo = false) também não entra
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', false) \g /dev/null
do $$ begin
  perform public.__espera_erro('select public.confirmar_agendamento(gen_random_uuid())', 'sem_permissao');
  if public.meu_acesso() ->> 'situacao' <> 'sem_acesso' then raise exception 'FALHOU: ex-funcionário entrou'; end if;
  -- e não se reativa sozinho
  perform public.__espera_erro($f$update public.funcionarios set ativo = true where user_id = auth.uid()$f$, '42501');
end $$;

-- ---------- funcionário ativo ----------
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', false) \g /dev/null
do $$
declare n int; v uuid; r text; j jsonb; seg date := current_setting('t.seg')::date;
begin
  if public.meu_acesso() ->> 'situacao' <> 'ok' then raise exception 'FALHOU: funcionário ativo não entrou'; end if;
  select count(*) into n from public.agendamentos;
  if n < 3 then raise exception 'FALHOU: funcionário enxergou só % agendamentos', n; end if;
  -- nem funcionário grava direto na tabela: só pelas funções (que registram e conferem tudo)
  perform public.__espera_erro(format($f$insert into public.agendamentos (data, hora, status) values (%L::date, '17:00', 'bloqueado')$f$, seg), '42501');
  perform public.__espera_erro('delete from public.agendamentos', '42501');
  select id into v from public.agendamentos where data = seg and hora = '10:00';
  r := public.confirmar_agendamento(v);        if r <> 'ok' then raise exception 'FALHOU confirmar: %', r; end if;
  r := public.confirmar_agendamento(v);        if r <> 'nao_encontrado' then raise exception 'FALHOU confirmar 2x: %', r; end if;
  perform public.__espera_erro(format($f$select public.bloquear_horarios(%L::date, array['10:00'])$f$, seg), 'horario_alterado');
  if public.bloquear_horarios(seg, array['14:00'], 'Almoço') <> 1 then raise exception 'FALHOU bloquear'; end if;
  r := public.remarcar_agendamento(v, seg, '14:00'); if r <> 'ocupado' then raise exception 'FALHOU remarcar p/ ocupado: %', r; end if;
  r := public.remarcar_agendamento(v, seg, '15:00'); if r <> 'ok' then raise exception 'FALHOU remarcar: %', r; end if;
  r := public.cancelar_agendamento(v);         if r <> 'ok' then raise exception 'FALHOU cancelar: %', r; end if;
  if (select atualizado_por from public.agendamentos where id = v) <> auth.uid() then raise exception 'FALHOU: atualizado_por'; end if;
  -- cancelar não desfaz bloqueio (isso é "liberar")
  select id into v from public.agendamentos where data = seg and hora = '14:00' and status = 'bloqueado';
  if public.cancelar_agendamento(v) <> 'nao_encontrado' then raise exception 'FALHOU: cancelar desfez um bloqueio'; end if;
  -- fecha o dia: os pedidos que já existem continuam lá
  j := public.bloquear_dia_inteiro(seg, 'Feriado');
  if (j ->> 'agendamentos')::int <> 2 then raise exception 'FALHOU bloquear_dia_inteiro: %', j; end if;
  if (select count(*) from public.agendamentos where data = seg and status = 'pendente') <> 2 then
    raise exception 'FALHOU: bloquear o dia mexeu nos agendamentos';
  end if;
end $$;
reset role;
-- o registro das ações (só o admin lê pela API; aqui o teste confere direto no banco)
select 'ok: ações registradas' where exists (select 1 from public.audit_logs where acao = 'bloqueou_dia' and data = current_setting('t.seg')::date
  and funcionario_id = '00000000-0000-4000-8000-000000000001' and detalhe = 'Feriado')
  and exists (select 1 from public.audit_logs where acao = 'bloqueou_horario' and hora = '14:00' and detalhe = 'Almoço')
  and exists (select 1 from public.audit_logs where acao = 'remarcou' and hora = '15:00')
  and exists (select 1 from public.audit_logs where acao = 'cancelou');
do $$ begin
  if not exists (select 1 from public.audit_logs where acao = 'bloqueou_dia') then raise exception 'FALHOU: bloquear o dia não ficou registrado'; end if;
end $$;

-- dia fechado: nenhum cliente reserva, nem no horário que ficou livre com o cancelamento
set role service_role;
do $$ begin
  perform public.__espera_erro(format($f$select public.criar_agendamento(%L::date, '15:00', 'x', 'Davi Reis', '22999990004')$f$, current_setting('t.seg')), 'dia_bloqueado');
end $$;
reset role;
set role anon;
do $$
declare seg date := current_setting('t.seg')::date;
begin
  if (select count(*) from public.horarios_ocupados(seg, seg)) <> 9 then raise exception 'FALHOU: dia fechado não aparece todo ocupado'; end if;
end $$;
reset role;

-- proteção contra robô: 15 pedidos em 10 minutos travam o 16º
insert into public.agendamentos (data, hora, status, nome, telefone)
select current_date + 20, lpad(h::text, 2, '0') || ':30', 'pendente', 'Robo', '2299999' || lpad(h::text, 4, '0')
from generate_series(0, 14) h;
set role service_role;
do $$ begin
  perform public.__espera_erro(format($f$select public.criar_agendamento(%L::date, '16:00', 'x', 'Eva Nunes', '22999990005')$f$, current_setting('t.ter')), 'muitos_pedidos');
end $$;
reset role;
delete from public.agendamentos where nome = 'Robo';

-- mesma origem (resumo do IP): no máximo 4 pedidos por hora
set role service_role;
do $$
declare ter date := current_setting('t.ter')::date; o text := repeat('ab', 16); i int;
begin
  for i in 1..4 loop
    perform public.criar_agendamento(ter, (array['10:00','11:00','13:00','14:00'])[i], 'x', 'Pessoa Teste', '2298888000' || i, '', o);
  end loop;
  perform public.__espera_erro(format($f$select public.criar_agendamento(%L::date, '15:00', 'x', 'Pessoa Teste', '22988880005', '', %L)$f$, ter, o), 'muitas_tentativas');
  -- outra origem continua podendo pedir
  perform public.criar_agendamento(ter, '15:00', 'x', 'Outra Pessoa', '22988880006', '', repeat('cd', 16));
end $$;
reset role;
delete from public.agendamentos where data = current_setting('t.ter')::date and nome in ('Pessoa Teste', 'Outra Pessoa');
delete from public.agenda_limites;

drop function public.__espera_erro(text, text);
select 'TESTES DO BANCO: TUDO OK';
