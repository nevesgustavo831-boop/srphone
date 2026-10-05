-- ============================================================================
-- SR Phone · horário da loja (28/09/2026)
-- Segunda a sexta: 09:00 às 19:00 · Sábado: 09:00 às 17:00 · Domingo: fechado.
-- O último horário do agendamento termina até o fechamento (18:00 na semana,
-- 16:00 no sábado), com a pausa do almoço ao meio-dia.
-- Mantenha IGUAL a STORE_CONFIG.agenda (data/config.js).
-- Pode rodar mais de uma vez: o resultado é sempre o mesmo.
-- Pedidos que já existem num horário que saiu da grade continuam no banco.
-- ============================================================================
delete from public.agenda_horarios where dia_semana between 1 and 6;
insert into public.agenda_horarios (dia_semana, hora)
select d, h
  from unnest(array[1,2,3,4,5]) d,
       unnest(array['09:00','10:00','11:00','13:00','14:00','15:00','16:00','17:00','18:00']) h
on conflict do nothing;
insert into public.agenda_horarios (dia_semana, hora)
select 6, h
  from unnest(array['09:00','10:00','11:00','13:00','14:00','15:00','16:00']) h
on conflict do nothing;
