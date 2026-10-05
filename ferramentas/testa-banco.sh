#!/usr/bin/env bash
# Testa as migrações do Supabase (supabase/migrations) num PostgreSQL local descartável.
# Uso: bash ferramentas/testa-banco.sh   (precisa do PostgreSQL 14+ instalado: initdb, pg_ctl, psql)
set -euo pipefail
RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)"; BIN="${BIN:-$(dirname "$(command -v initdb)")}"
TMP="$(mktemp -d)"; chmod 777 "$TMP"; PORTA=55439
COMO=""; [ "$(id -u)" = "0" ] && COMO="runuser -u postgres --"
limpa(){ $COMO "$BIN/pg_ctl" -D "$TMP/db" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap limpa EXIT
$COMO "$BIN/initdb" -D "$TMP/db" -A trust -U postgres >/dev/null
$COMO "$BIN/pg_ctl" -D "$TMP/db" -o "-p $PORTA -k $TMP -c timezone=UTC" -l "$TMP/log" start -w >/dev/null
export PGOPTIONS="-c client_min_messages=warning"
P(){ psql -h "$TMP" -p $PORTA -U postgres -d postgres -v ON_ERROR_STOP=1 -qAt "$@"; }
P -f "$RAIZ/ferramentas/sql/supabase-local.sql" >/dev/null
# roda a migração DUAS vezes: tem que ser repetível sem erro
P -f "$RAIZ/supabase/migrations/20260926120000_agenda.sql" >/dev/null
P -f "$RAIZ/supabase/migrations/20260926120000_agenda.sql" >/dev/null
P -f "$RAIZ/supabase/migrations/20260928120000_horario_loja.sql" >/dev/null
P -f "$RAIZ/supabase/migrations/20260928120000_horario_loja.sql" >/dev/null
P -f "$RAIZ/supabase/migrations/20260928140000_segurar_horario.sql" >/dev/null
P -f "$RAIZ/supabase/migrations/20260928140000_segurar_horario.sql" >/dev/null
P -f "$RAIZ/supabase/migrations/20261002120000_area_equipe_seguranca.sql" >/dev/null
P -f "$RAIZ/supabase/migrations/20261002120000_area_equipe_seguranca.sql" >/dev/null
# a grade do banco tem que ser igual à do site (data/config.js)
GRADE="$(P -c "select string_agg(dia_semana || ' ' || hora, ',' order by dia_semana, hora) from public.agenda_horarios")"
ESPERADA="$(node -e 'global.window={};eval(require("fs").readFileSync(process.argv[1],"utf8")+";const a=STORE_CONFIG.agenda,l=[];for(let d=0;d<7;d++){if(a.diasFechados.includes(d))continue;for(const h of (d===6&&a.horariosSabado&&a.horariosSabado.length?a.horariosSabado:a.horarios))l.push(d+\" \"+h)}console.log(l.join(\",\"))")' "$RAIZ/data/config.js")"
[ "$GRADE" = "$ESPERADA" ] || { echo "FALHA: grade do banco diferente do site"; echo " banco: $GRADE"; echo " site:  $ESPERADA"; exit 1; }
echo "GRADE: banco igual ao site ($(echo "$GRADE" | tr ',' '\n' | wc -l) horários por semana)"
P -f "$RAIZ/ferramentas/sql/testes-agenda.sql"
P -f "$RAIZ/ferramentas/sql/testes-segurar.sql"
P -f "$RAIZ/ferramentas/sql/testes-equipe.sql"

# duas pessoas pedindo o MESMO horário no MESMO instante: o banco deixa só uma reservar
DIA="$(P -c "select d::date from generate_series(current_date + 2, current_date + 9, interval '1 day') d where extract(dow from d) = 3 limit 1")"
( P -c "begin; set role service_role; select public.criar_agendamento('$DIA', '09:00', 'x', 'Pessoa Um', '22988880001'); select pg_sleep(2); commit;" >/dev/null ) &
sleep 0.5
if P -c "set role service_role; select public.criar_agendamento('$DIA', '09:00', 'x', 'Pessoa Dois', '22988880002');" >/dev/null 2>"$TMP/b.err"; then
  echo "FALHOU: dois pedidos simultâneos reservaram o mesmo horário"; exit 1
fi
wait
grep -q horario_ocupado "$TMP/b.err" || { echo "FALHOU: o segundo pedido não recebeu horario_ocupado:"; cat "$TMP/b.err"; exit 1; }
[ "$(P -c "select count(*) from public.agendamentos where data = '$DIA' and hora = '09:00' and status <> 'cancelado'")" = "1" ] \
  || { echo "FALHOU: mais de um registro no mesmo horário"; exit 1; }
echo "CONCORRÊNCIA: 2 pedidos simultâneos, 1 reservado, o outro recebeu horario_ocupado"

# ---------- segurar horário ao mesmo tempo: só uma operação vence ----------
F1="00000000-0000-4000-8000-000000000001"; F2="00000000-0000-4000-8000-000000000004"
como_func(){ echo "set role authenticated; select set_config('request.jwt.claim.sub', '$1', true);"; }
ativos(){ P -c "select count(*) from public.agendamentos where data = '$DIA' and hora = '$1' and status in ('pendente','confirmado','bloqueado','segurado')"; }
disputa(){ # $1 = primeira operação (segura a transação 2 s), $2 = segunda, $3 = erro esperado na segunda, $4 = hora
  ( P -c "begin; $1 select pg_sleep(2); commit;" >/dev/null ) &
  sleep 0.5
  if P -c "begin; $2 commit;" >/dev/null 2>"$TMP/d.err"; then echo "FALHOU: as duas operações ficaram com $4"; exit 1; fi
  wait
  grep -q "$3" "$TMP/d.err" || { echo "FALHOU: a segunda operação em $4 não recebeu $3:"; cat "$TMP/d.err"; exit 1; }
  [ "$(ativos "$4")" = "1" ] || { echo "FALHOU: mais de um registro ativo em $4"; exit 1; }
}
disputa "$(como_func $F1) select public.segurar_horario('$DIA', '10:00', 30, 'A');" \
        "$(como_func $F2) select public.segurar_horario('$DIA', '10:00', 30, 'B');" horario_ocupado 10:00
disputa "$(como_func $F1) select public.segurar_horario('$DIA', '11:00', 30, 'A');" \
        "set role service_role; select public.criar_agendamento('$DIA', '11:00', 'x', 'Pessoa Cinco', '22988880005');" horario_ocupado 11:00
disputa "set role service_role; select public.criar_agendamento('$DIA', '13:00', 'x', 'Pessoa Seis', '22988880006');" \
        "$(como_func $F2) select public.segurar_horario('$DIA', '13:00', 30, 'B');" horario_ocupado 13:00
# segurado vencido + dois clientes ao mesmo tempo: o vencido não prende, e só um cliente fica
P -c "begin; $(como_func $F1) select public.segurar_horario('$DIA', '14:00', 15, 'vai vencer'); commit;" >/dev/null
P -c "set session_replication_role = replica; update public.agendamentos set segurado_ate = now() - interval '1 minute' where data = '$DIA' and hora = '14:00' and status = 'segurado';" >/dev/null
disputa "set role service_role; select public.criar_agendamento('$DIA', '14:00', 'x', 'Pessoa Sete', '22988880007');" \
        "set role service_role; select public.criar_agendamento('$DIA', '14:00', 'x', 'Pessoa Oito', '22988880008');" horario_ocupado 14:00
[ "$(P -c "select count(*) from public.agendamentos where data = '$DIA' and hora = '14:00' and status = 'pendente'")" = "1" ] \
  || { echo "FALHOU: o segurado vencido impediu a reserva"; exit 1; }
echo "CONCORRÊNCIA (segurar): 2 funcionárias ao mesmo tempo, funcionária x cliente nas duas ordens e 2 clientes num segurado vencido: sempre 1 só"

# ---------- área da equipe: bloqueio x cliente, dois funcionários, dia inteiro x cliente ----------
disputa "$(como_func $F1) select public.bloquear_horarios('$DIA', array['15:00','16:00'], 'Almoço');" \
        "set role service_role; select public.criar_agendamento('$DIA', '16:00', 'x', 'Pessoa Nove', '22988880009');" horario_ocupado 16:00
disputa "set role service_role; select public.criar_agendamento('$DIA', '17:00', 'x', 'Pessoa Dez', '22988880010');" \
        "$(como_func $F2) select public.bloquear_horarios('$DIA', array['17:00','18:00'], 'Compromisso');" horario_alterado 17:00
[ "$(ativos 18:00)" = "0" ] || { echo "FALHOU: bloqueio de vários ficou pela metade"; exit 1; }
# dois funcionários liberando o mesmo bloqueio: um libera, o outro recebe "alterado"
B15="$(P -c "select id from public.agendamentos where data = '$DIA' and hora = '15:00' and status = 'bloqueado'")"
( P -c "begin; $(como_func $F1) select public.liberar_bloqueio('$B15'); select pg_sleep(2); commit;" >/dev/null ) &
sleep 0.5
if P -c "begin; $(como_func $F2) select public.liberar_bloqueio('$B15'); commit;" >/dev/null 2>"$TMP/l.err"; then echo "FALHOU: os dois liberaram"; exit 1; fi
wait
grep -q horario_alterado "$TMP/l.err" || { echo "FALHOU: o segundo não recebeu horario_alterado"; cat "$TMP/l.err"; exit 1; }
# fechar o dia enquanto um cliente reserva: ou o pedido entra antes (e continua valendo) ou é recusado
DIA3="$(P -c "select d::date from generate_series(current_date + 10, current_date + 16, interval '1 day') d where extract(dow from d) = 2 limit 1")"
( P -c "begin; $(como_func $F1) select public.bloquear_dia_inteiro('$DIA3', 'Feriado'); select pg_sleep(2); commit;" >/dev/null ) &
sleep 0.5
if P -c "set role service_role; select public.criar_agendamento('$DIA3', '10:00', 'x', 'Pessoa Onze', '22988880011');" >/dev/null 2>"$TMP/f.err"; then
  echo "FALHOU: cliente reservou num dia que estava sendo fechado"; exit 1
fi
wait
grep -q dia_bloqueado "$TMP/f.err" || { echo "FALHOU: o pedido não recebeu dia_bloqueado:"; cat "$TMP/f.err"; exit 1; }
echo "CONCORRÊNCIA (equipe): bloqueio x cliente nas duas ordens, bloqueio de vários tudo-ou-nada, 2 funcionários liberando, dia fechado x cliente"

# ---------- robô: 30 pedidos AO MESMO TEMPO da mesma origem: no máximo 4 entram ----------
DIA4="$(P -c "select d::date from generate_series(current_date + 17, current_date + 23, interval '1 day') d where extract(dow from d) = 3 limit 1")"
P -c "delete from public.agenda_limites; set session_replication_role = replica; update public.agendamentos set criado_em = now() - interval '1 hour';" >/dev/null
for i in $(seq 1 30); do
  H="$(printf '%02d' $(( 9 + (i % 9) ))):00"
  ( P -c "set role service_role; select public.criar_agendamento('$DIA4'::date + $(( i % 2 )), '$H', 'x', 'Robo Robo', '2297777$(printf '%04d' $i)', '', repeat('ef', 16));" >/dev/null 2>&1 || true ) &
done
wait
ROBO="$(P -c "select count(*) from public.agendamentos where nome = 'Robo Robo'")"
[ "$ROBO" = "4" ] || { echo "FALHOU: o robô reservou $ROBO horários (devia parar em 4)"; exit 1; }
echo "ROBÔ: 30 pedidos simultâneos da mesma origem, $ROBO aceitos (limite 4 por hora)"

# migração 2 (aviso no Telegram): pg_net só existe no Supabase, então aqui ela é imitada.
# O que importa: o aviso nunca pode impedir o cliente de reservar, nem quando o Telegram falha.
P -c "create schema if not exists extensions; create schema if not exists net;
      create table net.chamadas (url text, corpo jsonb);
      create function net.http_post(url text, headers jsonb, body jsonb) returns bigint language plpgsql as \$\$
      begin if body->>'text' like '%FALHA%' then raise exception 'rede fora'; end if;
            insert into net.chamadas values (url, body); return 1; end \$\$;"
grep -v "create extension if not exists pg_net" "$RAIZ/supabase/migrations/20260926120100_avisos_telegram.sql" > "$TMP/m2.sql"
P -f "$TMP/m2.sql" >/dev/null
P -f "$TMP/m2.sql" >/dev/null
P -c "update public.config_avisos set telegram_token = 'TESTE', telegram_chat_id = '123', ligado = true where id = 1"
DIA2="$(P -c "select d::date from generate_series(current_date + 2, current_date + 9, interval '1 day') d where extract(dow from d) = 4 limit 1")"
P -c "set role service_role; select public.criar_agendamento('$DIA2', '15:00', 'Comprar', 'Pessoa Tres', '22988880003')" >/dev/null
[ "$(P -c "select count(*) from net.chamadas where corpo->>'text' like '%Pessoa Tres%'")" = "1" ] || { echo "FALHOU: aviso do Telegram não saiu"; exit 1; }
P -c "set role service_role; select public.criar_agendamento('$DIA2', '16:00', 'FALHA', 'Pessoa Quatro', '22988880004')" >/dev/null \
  || { echo "FALHOU: Telegram fora do ar impediu a reserva"; exit 1; }
P -c "set role anon; select count(*) from public.config_avisos" >/dev/null 2>&1 && { echo "FALHOU: visitante leu o token do Telegram"; exit 1; }
echo "TELEGRAM: aviso enviado; com o Telegram fora do ar a reserva continua; token invisível para o visitante"

# ---------- o site de verdade: navegador + Supabase Auth (login, MFA) + PostgREST + função do servidor ----------
# Precisa de dois binários (sem eles, esta parte é pulada e o resto dos testes continua valendo):
#   POSTGREST=/caminho/do/postgrest   (PostgREST 12: https://github.com/PostgREST/postgrest/releases)
#   GOTRUE=/caminho/do/auth  e  GOTRUE_MIGRACOES=/caminho/da/pasta/migrations  (Supabase Auth:
#   https://github.com/supabase/auth, "go build" gera o binário; a pasta migrations vem junto do código)
PGRST_BIN="${POSTGREST:-$(command -v postgrest || true)}"
if [ -z "$PGRST_BIN" ] || [ ! -x "$PGRST_BIN" ] || [ -z "${GOTRUE:-}" ] || [ ! -x "${GOTRUE:-/nao}" ] || [ ! -d "${GOTRUE_MIGRACOES:-/nao}" ]; then
  echo "SITE + ÁREA DA EQUIPE: pulado (defina POSTGREST, GOTRUE e GOTRUE_MIGRACOES para o teste de ponta a ponta com login de verdade)"
  exit 0
fi
PGHOST="$TMP" PGPORT="$PORTA" POSTGREST="$PGRST_BIN" GOTRUE="$GOTRUE" GOTRUE_MIGRACOES="$GOTRUE_MIGRACOES" node "$RAIZ/ferramentas/testa-equipe-real.mjs"
