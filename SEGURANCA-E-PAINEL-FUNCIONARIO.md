# SR Phone · Área da Equipe e segurança para produção

Revisado em 02/10/2026, branch `Srphone`. Este arquivo explica o que foi feito, como configurar e o que
ainda depende de configuração manual. **Nada aqui tem chave de verdade.**

> **Resumo:** o código está pronto e testado (inclusive com o servidor de login do Supabase de verdade,
> compilado do código oficial). Para valer em produção ainda faltam passos manuais no Supabase e no
> Netlify (seção 14) e o teste rápido no site publicado (seção 15). Veja o **STATUS PARA PRODUÇÃO** no fim.

---

## 1. O que foi criado

| O quê | Onde |
|---|---|
| **Área da Equipe** (login, agenda do dia, bloqueios, dia inteiro, Ver agendamento, MFA, sessão) | `funcionario/index.html`, `js/funcionario.js`, `css/funcionario.css` → endereço **`/funcionario/`** |
| Banco: papéis, MFA, bloqueio de dia, registro das ações, pedido só pelo servidor, RLS revisado | `supabase/migrations/20261002120000_area_equipe_seguranca.sql` |
| Função do servidor que recebe o pedido do cliente (validação, limite, anti-robô, gravação segura) | `netlify/functions/agendamento.mjs` + `services/agenda/index.mjs` → **`/api/agendamento`** |
| Anti-robô opcional (Cloudflare Turnstile) no agendamento e no login | `js/scheduling.js`, `js/funcionario.js`, conferência no servidor em `services/agenda/index.mjs` |
| Visualizador 3D sem CDN de fora (o CSP não libera mais `cdn.jsdelivr.net`) | `assets/vendor/model-viewer/` |
| Testes novos | `ferramentas/testes-agenda.mjs`, `ferramentas/sql/testes-equipe.sql`, `ferramentas/testa-equipe-real.mjs` |

O painel antigo (a janela que abria em `#/agenda` na página inicial) saiu: tudo o que ele fazia
(confirmar, cancelar, remarcar, segurar, liberar, bloquear, testar o aviso do Telegram) está na Área da
Equipe. Links antigos para `#/agenda` (por exemplo, no aviso do Telegram) levam para `/funcionario/`.

**Não mudou:** página inicial, catálogo, páginas de produto, animações, caixa 3D, visual, preços, fotos,
WhatsApp, entrega, assistente e SEO. No formulário de agendamento entrou só um campo opcional
("Seu aparelho") e, se a loja ligar o Turnstile, a caixinha "não sou robô".

## 2. Arquivos modificados

- `index.html`: campo opcional "Seu aparelho", espaço do anti-robô, link do rodapé "Área da equipe" (`/funcionario/`), saiu a janela do painel antigo.
- `js/scheduling.js`: o pedido vai para `/api/agendamento` (nunca direto ao banco); mensagens para os novos códigos; Turnstile; `#/agenda` e links de e-mail do Supabase levam para `/funcionario/`.
- `js/catalog.js`: model-viewer local. `css/styles.css`: saiu o CSS do painel antigo.
- `data/config.js`: `TURNSTILE_SITE_KEY` (pública, vazia). `.env.example`: variáveis novas (só nomes).
- `_headers` e `netlify.toml`: CSP sem CDN de fora e com o Turnstile; `/funcionario/*` com `noindex` e sem cache; 404 para este arquivo.
- `ferramentas/`: build (Turnstile, robots com `/funcionario/`), lint (regras novas), servidor local (função nova), testes.
- `supabase/migrations/20260926120100_avisos_telegram.sql`: só o exemplo do link (`/funcionario/`).
- `README.md`, `PRODUCAO-SRPHONE.md`, `CHECKLIST-PRODUCAO.md`, `LEIA-ME.txt`: instruções novas.

## 3. Estrutura do banco

| Tabela | Para quê | Quem lê pela API |
|---|---|---|
| `agendamentos` | pedidos de clientes (`pendente`, `confirmado`), bloqueios de horário (`bloqueado`), horários segurados (`segurado`) e cancelados. Coluna nova: `aparelho` | só funcionário ativo (leitura); **ninguém grava direto** |
| `funcionarios` | `user_id` (a conta do Supabase Auth), `nome`, `email` (copiado do Supabase Auth), `ativo`, `role` (`admin` ou `funcionario`), `exige_mfa`, `criado_em` | cada pessoa só a própria linha |
| `bloqueios_dia` | dia inteiro fechado (data, motivo, quem, quando) | só funcionário ativo |
| `audit_logs` | registro das ações da equipe: quem, ação, dia, horário, registro afetado, motivo | só **admin** (com MFA) |
| `agendamentos_log` | histórico de cada agendamento (já existia) | só funcionário ativo |
| `agenda_limites` | resumo (HMAC) do IP de quem pediu, por 2 dias, para o limite de pedidos | ninguém |
| `agenda_horarios`, `config_avisos` | grade da loja e Telegram (já existiam) | grade: funcionário; Telegram: ninguém |

**Bloqueio interno x agendamento:** são coisas diferentes. Bloqueio de horário é `status = 'bloqueado'`;
dia inteiro é uma linha em `bloqueios_dia`; agendamento de cliente é `pendente`/`confirmado`.
"Liberar" só desfaz bloqueio (`liberar_bloqueio` só mexe em `bloqueado`). Fechar ou abrir o dia nunca
apaga nem libera agendamento de cliente.

**O banco impede, mesmo com requisições ao mesmo tempo** (testado com transações simultâneas):
- dois agendamentos no mesmo horário (índice único `agendamentos_horario_travado`);
- agendamento em horário bloqueado e bloqueio em horário agendado (o mesmo índice: só um vence);
- agendamento em dia bloqueado (trava por dia: `pg_advisory_xact_lock`; pedido e bloqueio do dia entram em fila);
- bloquear vários pela metade (`bloquear_horarios` é uma operação só: um ocupado = nada bloqueado);
- dois funcionários mexendo no mesmo horário: o segundo recebe `horario_alterado` e a tela mostra
  *"Este horário acabou de ser alterado por outro funcionário. Atualizamos a agenda para você."*

**Funções (RPC) da equipe** — todas conferem `e_funcionario()` lá dentro e registram em `audit_logs`:
`meu_acesso`, `agenda_dia`, `resumo_periodo` (calendário), `ver_agendamento`, `bloquear_horarios`,
`liberar_bloqueio`, `bloquear_dia_inteiro`, `desbloquear_dia`, `bloqueios_ativos`, `confirmar_horario`,
`confirmar_agendamento`, `cancelar_agendamento`, `remarcar_agendamento`, `segurar_horario`,
`liberar_horario`, `testar_aviso`. Só admin: `limpar_pendentes_vencidos`, `apagar_dados_antigos`.

**Saíram** (substituídas): `solicitar_horario` (o público gravava direto), `bloquear_horario`,
`bloquear_dia`, `agenda_do_dia`, `equipe_nomes`.

## 4. Políticas RLS (revisão completa)

- **Visitante (chave pública):** só a função `horarios_ocupados` (dia e hora; dia bloqueado aparece todo
  ocupado). Não lê tabela nenhuma, não cria pedido (nem chamando a API direto), não chama função da equipe.
- **Pedido do cliente:** só a chave **secreta** (`service_role`) chama `criar_agendamento`, e ela fica só
  na função do Netlify. Cliente não consulta agendamento de ninguém.
- **Usuário logado que não é da equipe:** não vira funcionário. Lê só a própria linha de `funcionarios`
  (se existir); todo o resto devolve vazio ou `sem_permissao`.
- **Funcionário ativo:** lê a agenda e usa as funções da equipe. **Não grava direto em tabela nenhuma**
  (os privilégios de insert/update/delete foram retirados): toda mudança passa por uma função que valida e registra.
- **Admin:** o mesmo, mais o `audit_logs` e a limpeza (LGPD).
- **MFA no banco:** quem tem `exige_mfa = true` (todo admin) ou já cadastrou um app autenticador só é
  aceito com sessão verificada (`aal2`). Só com a senha, o banco não entrega nada.
- Ninguém se cadastra como funcionário nem se reativa pela API (testado).

## 5. Como funciona o login

1. A pessoa abre `/funcionario/` e vê só: **SR PHONE · Área da Equipe**, E-mail, Senha, **Entrar** e
   **Esqueci minha senha**. Não existe cadastro pelo site.
2. O login é o do **Supabase Auth** (e-mail e senha). Nada de senha própria.
3. Logo depois, o banco responde quem é (`meu_acesso`): `ok`, `sem_acesso`, `mfa_codigo` ou `mfa_cadastrar`.
   Quem não está em `funcionarios` (ou está com `ativo = false`) vê "Acesso não liberado".
4. **Sessão:** só os tokens do Supabase Auth, no `sessionStorage` da aba (somem ao fechar o navegador).
   Renovação automática antes de vencer. Se a renovação não vale mais, a tela volta ao login com
   "Sua sessão terminou". **Sair** encerra a sessão no Supabase (o token de renovação deixa de valer) e
   apaga tudo do navegador. Nada de chave secreta, senha ou token próprio guardado.
5. **Esqueci minha senha:** o Supabase manda um link; ele abre `/funcionario/`, a pessoa cria a senha nova
   e entra. A resposta é a mesma exista ou não a conta (ninguém descobre e-mails da equipe). O token do
   link sai da barra de endereço na hora.
6. Descobrir o endereço `/funcionario/` não dá acesso a nada: sem login válido e sem estar ativo na
   tabela, o banco não entrega dado nenhum (testado chamando a API direto).

## 6. Como cadastrar um funcionário (só a administração)

1. Supabase → **Authentication → Users → Add user → Create new user** (e-mail e senha provisória, marque
   "Auto Confirm User") — ou **Invite user** (a pessoa recebe um e-mail e cria a senha em `/funcionario/`).
2. Supabase → **SQL Editor**:

```sql
insert into public.funcionarios (user_id, nome, role)
select id, 'Maria', 'funcionario' from auth.users where email = 'maria@exemplo.com';
```

   Para a dona/o dono: `'admin'` no lugar de `'funcionario'` (o MFA passa a ser exigido).

## 7. Como desativar um funcionário

```sql
update public.funcionarios set ativo = false where email = 'maria@exemplo.com';
```

Vale **na hora** (o banco confere a cada operação) e não apaga o histórico. Para cortar também o login:
Authentication → Users → a pessoa → **Ban user** (ou apagar a conta). Para reativar: `ativo = true`.

## 8. Como ativar o MFA (verificação em duas etapas)

O MFA é o do próprio **Supabase Auth** (TOTP: código de 6 dígitos de um app como Google Authenticator ou
Microsoft Authenticator). Nada de autenticação própria.

1. No Supabase, confira **Authentication → Multi-Factor** (ou "MFA"): **TOTP habilitado** (vem ligado por
   padrão nos projetos do Supabase; se estiver desligado, ligue).
2. **Admin:** é automático. Ao virar `role = 'admin'`, `exige_mfa` fica `true`. No próximo login, a tela
   mostra o código QR; a pessoa lê com o app, digita o código e pronto. Dali em diante, todo login pede o código.
3. **Exigir de um funcionário comum:**
   `update public.funcionarios set exige_mfa = true where email = 'maria@exemplo.com';`
4. **Opcional para qualquer um:** no painel, "Proteger a conta com verificação em duas etapas". Quem ativa
   passa a precisar do código (o banco exige `aal2` de quem tem autenticador cadastrado).
5. Perdeu o celular? A administração remove o autenticador da pessoa no painel do Supabase
   (**Authentication → Users →** a pessoa → remover os fatores de MFA). Se o painel não mostrar essa opção,
   apague a conta, crie de novo e rode outra vez o `insert` da seção 6. No próximo login, a pessoa cadastra
   o app de novo.

## 9. Como funciona o limite de pedidos (rate limit)

| Onde | Limite |
|---|---|
| Agendamento — Netlify (todas as cópias da função) | 6 pedidos por minuto por IP (`config.rateLimit`) |
| Agendamento — função | 3 por minuto e 12 por hora por IP (por cópia; `AGENDA_LIMITE_MINUTO/HORA`) |
| Agendamento — **banco** (vale para tudo, exato, em fila) | 4 por hora e 8 por dia da mesma origem (HMAC do IP); 1 por WhatsApp por dia; 2 pendentes por WhatsApp; 15 pedidos novos em 10 minutos no total |
| Assistente com IA | 20/min no Netlify; 8/min e 60/h por IP na função (já existia) |
| Entrega | 90/min no Netlify; 40/min e 400/h por IP; 40 sugestões por sessão (já existia) |
| Login da equipe | limites do próprio Supabase Auth por IP; a tela espera 1 minuto depois de 5 senhas erradas; captcha opcional (seção 10) |

Teste do robô: **20 pedidos ao mesmo tempo da mesma origem → 3 aceitos** (função) e **30 direto no banco → 4** (banco).
Uso normal (uma pessoa pedindo um horário) não chega perto dos limites.

## 10. Como funciona o anti-robô

- **Sempre ligado:** campo invisível (robô que preenche é recusado sem tocar no banco), pedido sem `Origin`
  do próprio site é recusado, limites da seção 9, validação de tudo de novo no servidor e no banco.
- **Cloudflare Turnstile (opcional, recomendado):** com `TURNSTILE_SITE_KEY` (pública, no site) e
  `TURNSTILE_SECRET_KEY` (só no Netlify), o formulário mostra a caixinha e **o servidor confere o token com
  a Cloudflare** (`siteverify`, com o segredo e o IP) antes de gravar. Token falso, repetido ou de outro
  formulário é recusado. O navegador nunca decide sozinho.
- **Login (opcional):** em Supabase → **Authentication → Attack Protection** (ou "Bot and Abuse
  Protection") → **Captcha protection** → Turnstile, com o mesmo segredo. A tela de login já manda o token.

## 11. Como bloquear horários

Área da Equipe → **Agenda** → escolha o dia no calendário:
- **Um horário:** no horário "Livre", toque em **Bloquear** → confira data e hora → motivo opcional
  (Almoço, Compromisso, Atendimento externo, Outro) → **Confirmar bloqueio**. Some do site na hora.
- **Vários:** **Selecionar vários** → marque os horários livres → **Bloquear selecionados** (uma operação só).

## 12. Como bloquear e desbloquear o dia

- **Bloquear dia inteiro** → "Deseja bloquear todos os horários de 05/10/2026?" → motivo opcional (Feriado,
  Loja fechada, Evento, Folga, Outro) → **Confirmar bloqueio**. Se o dia já tiver agendamentos de clientes,
  a janela avisa: eles **continuam marcados** (avise o cliente, se for o caso).
- **Desbloquear dia** (na agenda ou na aba **Bloqueios**): antes de confirmar, o painel confere no banco
  quantos agendamentos existem e avisa que eles continuam como estão. Só o bloqueio do dia sai.

## 13. Como liberar

- Horário bloqueado: **Liberar** (na agenda ou na aba **Bloqueios**, com filtros Hoje / Próximos dias / Todos).
- Horário segurado: **Liberar** ou **Confirmar**. Agendamento de cliente **não tem** "Liberar": abra
  **Ver** (cliente, telefone, data, horário, serviço, aparelho) e use Confirmar, WhatsApp, Remarcar ou Cancelar.

## 14. Variáveis de ambiente e configuração manual

**Netlify → Site configuration → Environment variables** (depois: Deploys → Trigger deploy):

| Nome | Escopo | O quê |
|---|---|---|
| `SUPABASE_SECRET_KEY` | Functions | Secret key do Supabase (`sb_secret_...`). A antiga `service_role` também serve (`SUPABASE_SERVICE_ROLE_KEY`). **Só servidor.** |
| `SUPABASE_URL` | All | `https://SEU-PROJETO.supabase.co` (o build também grava no site; é público) |
| `SUPABASE_ANON_KEY` | Builds/All | a **Publishable** key (`sb_publishable_...`), pública |
| `TURNSTILE_SITE_KEY` | Builds/All | (opcional) Site Key do Turnstile, pública |
| `TURNSTILE_SECRET_KEY` | Functions | (opcional) segredo do Turnstile. **Só servidor.** |
| `AI_API_KEY`, `MAPS_SERVER_KEY`, `MAPS_BROWSER_KEY` | Functions | já existiam (`PRODUCAO-SRPHONE.md`) |

**Supabase:**
1. **SQL Editor:** rodar `supabase/migrations/20261002120000_area_equipe_seguranca.sql` (depois das
   anteriores). Pode rodar de novo sem medo. Ordem segura: variáveis no Netlify → publicar → migração →
   teste (em qualquer ordem o site não finge reserva: no meio do caminho ele oferece o WhatsApp).
2. **Authentication → Sign In / Providers:** "Allow new users to sign up" **desligado**; e-mail ligado.
3. **Authentication → URL Configuration:** Site URL = `https://SEU-DOMINIO`; em Redirect URLs, acrescente
   `https://SEU-DOMINIO/funcionario/` (para o link de senha nova e do convite).
4. **Authentication → Multi-Factor:** TOTP habilitado (seção 8).
5. (Opcional) **Captcha** no Auth com o Turnstile (seção 10) e revisar **Rate Limits** do Auth (os nomes
   dos menus do Supabase mudam de vez em quando; procure por "Attack Protection", "Captcha" e "Rate Limits").
6. Cadastrar a equipe (seção 6) e tornar a dona/o dono `admin`.
7. Telegram (se usa): `update public.config_avisos set link_agenda = 'https://SEU-DOMINIO/funcionario/' where id = 1;`

**Cloudflare Turnstile (opcional):** dash.cloudflare.com → Turnstile → Add widget → domínios do site
(o próprio e o `*.netlify.app`) → modo "Managed" → copie Site Key e Secret Key para as variáveis acima.

**Google Maps (revisado):** a `MAPS_BROWSER_KEY` aparece no navegador **de propósito** (desenho do mapa);
quem a protege são as restrições no Google Cloud: "Sites" = só os domínios do site e "APIs" = só Map Tiles
API. A `MAPS_SERVER_KEY` fica só na função; restrinja às APIs Routes, Places (New) e Geocoding e ponha cota
e alerta de gasto (detalhes em `PRODUCAO-SRPHONE.md`, itens 9 a 12).

## 15. Teste rápido depois de publicar

1. `https://SEU-DOMINIO/api/agendamento` no navegador → `{"ok":false,"erro":"metodo"}` (a função existe).
2. No site, peça um horário de teste → "Horário reservado".
3. Em `/funcionario/`, entre com uma conta da equipe → o pedido aparece em "aguardando confirmação"; abra **Ver**.
4. Bloqueie um horário → numa janela anônima, o site não oferece mais esse horário. Libere → volta.
5. Entre com uma conta que **não** está em `funcionarios` → "Acesso não liberado".
6. Admin: login pede o código de 6 dígitos. **Sair** → volta ao login.
7. Supabase → Table Editor → `audit_logs`: as ações aparecem com o nome de quem fez.

## 16. Segurança do site (revisão)

- **Chaves:** auditoria completa (lint em todo arquivo público + teste no navegador): nenhuma chave
  secreta, senha ou token em HTML, JavaScript, `data/config.js`, migrações, `.env.example`, Git,
  `localStorage`/`sessionStorage` ou console. As públicas (Publishable do Supabase, Site Key do Turnstile,
  `MAPS_BROWSER_KEY`) são públicas de propósito e protegidas pelo banco/restrições.
- **CSP:** só o necessário. Saiu `cdn.jsdelivr.net` (model-viewer agora é local); entrou
  `challenges.cloudflare.com` (Turnstile) em `script-src` e `frame-src`. Sem `unsafe-eval` e sem script
  embutido. Mantidos: Google Analytics, Supabase, mapa da entrega, fontes, vídeos.
- **Cabeçalhos:** HSTS, CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`,
  `X-Frame-Options: DENY` + `frame-ancestors 'none'`, COOP (iguais no `_headers` e no `netlify.toml`,
  conferido pelo lint). `/funcionario/*`: `noindex` e `no-store`.
- **XSS:** a Área da Equipe monta tudo com `textContent` (o lint proíbe `innerHTML` nela; teste com HTML
  no nome do cliente confirmou). O resto do site já escapava o texto. Nome, telefone, aparelho, serviço,
  motivo e observações são validados na tela, na função e no banco (a do banco é a definitiva).
- **Erros:** o cliente nunca vê erro técnico (testado com "relation does not exist": vira "Não foi possível
  concluir..."/WhatsApp). Os registros da função têm só códigos (sem nome, telefone, IP ou chave).
- **404:** página da SR Phone, sem detalhe técnico. Pastas de trabalho e documentos respondem 404.
- **Dados pessoais:** a lista do dia não mostra telefone (só o **Ver**); o público vê só dia e hora; o
  registro das ações não guarda dado de cliente; IP vira resumo apagado em 2 dias; `apagar_dados_antigos`
  (admin) limpa agendamentos antigos e o registro com mais de 1 ano.

## 17. Resultados dos testes

Rodados em 02/10/2026 neste projeto (Node 22, PostgreSQL 16, PostgREST 12.2.3, Supabase Auth compilado do
código oficial `supabase/auth`, Chromium do Playwright):

| Comando | Resultado |
|---|---|
| `npm run lint` | **LINT SEM ERROS** (inclui as regras novas: nada de segredo, CDN de fora, `innerHTML` na Área da Equipe ou pedido direto ao banco) |
| `npm run build` | **BUILD CONCLUÍDO COM SUCESSO**; `npm run build -- --conferir`: arquivos gerados em dia |
| `npm test` | **0 falhas**: site no navegador 598 ok, assistente 76 ok, entrega 91 ok, função de agendamento 37 ok |
| `npm run test:banco` | **0 falhas**: testes SQL da agenda, do "segurar" e da Área da Equipe (MFA, admin, bloqueios, dia inteiro, Ver, registro, desativar), concorrência (pedido x pedido, bloqueio x cliente nas duas ordens, vários tudo-ou-nada, dois funcionários liberando, dia fechado x cliente), robô (30 pedidos simultâneos → 4 aceitos), Telegram, e **76 verificações de ponta a ponta** com o Supabase Auth de verdade |
| `npm audit` | **found 0 vulnerabilities** (nenhuma atualização foi necessária) |
| Atualização de um banco com dados antigos | **OK**: migrações antigas + funcionário, bloqueio e pedido antigos → migração nova aplicada sem erro; e-mail preenchido, bloqueio e pedido aparecem certos na agenda nova; a porta antiga `solicitar_horario` sumiu |

**Testes obrigatórios pedidos** (todos automáticos; "E2E" = navegador + Supabase Auth + banco de verdade):

| Teste | Resultado |
|---|---|
| Cliente vê horários livres | OK (E2E) |
| Cliente não vê horários bloqueados | OK (E2E) |
| Cliente não consegue reservar horário bloqueado | OK (E2E, mesmo com a tela desatualizada; e SQL) |
| Cliente não consegue reservar horário ocupado | OK (E2E e SQL, inclusive ao mesmo tempo) |
| Reserva válida funciona | OK (E2E: gravada como pendente, com WhatsApp e aparelho) |
| Bot não consegue disparar reservas ilimitadas | OK (20 simultâneos na função → 3; 30 no banco → 4; chave pública não cria nada) |
| Usuário não autenticado não acessa /funcionario | OK (só o login; a API devolve 401 mesmo chamando direto) |
| Autenticado, mas não cadastrado, não acessa | OK ("Acesso não liberado"; o banco devolve `sem_permissao` e lista vazia) |
| Funcionário ativo consegue entrar | OK |
| Funcionário consegue bloquear horário | OK (E2E, nos 4 tamanhos de tela) |
| Funcionário consegue liberar horário | OK |
| Funcionário consegue bloquear dia inteiro | OK |
| Funcionário consegue desbloquear dia | OK (na agenda e na aba Bloqueios) |
| Agendamento existente não é apagado ao bloquear o dia | OK (continua confirmado; o painel avisa antes) |
| Dois funcionários não causam conflito | OK (o segundo recebe o aviso e a agenda atualiza; um registro só) |
| Nenhuma chave privada no frontend | OK (arquivos, respostas, `sessionStorage`/`localStorage`, lint) |
| Nenhum dado de cliente fica público | OK (público só dia e hora; tabelas fechadas) |
| Logout funciona | OK (sessão encerrada no Supabase Auth; renovar depois de sair dá erro) |
| Sessão expirada volta ao login | OK (com aviso; e a renovação automática funciona quando ainda vale) |
| O site continua funcionando normalmente | OK (`npm test` inteiro: catálogo, produto, WhatsApp, IA, entrega, 3D, celular) |
| MFA | OK (admin com só a senha não lê nada; QR do Supabase; código errado recusado; código certo entra; próximo login pede só o código) |
| Esqueci minha senha | OK (link real do Supabase Auth → senha nova → entra com ela) |
| Celular (iPhone e Android), tablet e computador | OK (login, calendário, seleção, bloqueio, liberação e Ver sem rolagem lateral, botões de 44 px ou mais) |


## 18. Riscos que continuam (e o que fazer)

1. **A chave secreta no Netlify** dá acesso total ao banco se a conta do Netlify for invadida. Ligue o
   2FA no Netlify e no Supabase e dê acesso só a quem precisa.
2. **Turnstile desligado** até a loja criar o widget: os limites seguram robô simples, mas o Turnstile é a
   barreira contra robô que troca de IP e de telefone.
3. **IP compartilhado (rede de celular):** o limite de 4 pedidos/hora por origem pode, raramente, barrar
   alguém na mesma rede. Se acontecer, o cliente vê a mensagem e o WhatsApp; o número fica em
   `criar_agendamento` (migração) e pode ser aumentado.
4. **Os testes usam o Supabase Auth compilado do código oficial, o PostgREST e o PostgreSQL locais**, não o
   seu projeto do Supabase. Faça o teste rápido da seção 15 depois de publicar.
5. **Supabase do lado dele:** a conferência "quem já tem autenticador" lê `auth.mfa_factors`. Se o Supabase
   mudar essa permissão, ela deixa de valer para quem ativou o MFA por conta própria; para o admin (e quem
   tem `exige_mfa`) a exigência continua (vem do token).
6. **Quem é da equipe vê os dados dos clientes** (é o trabalho). Por isso: contas individuais, MFA para o
   admin, desativar na hora quem sair e o registro das ações.
7. **iPhone de verdade:** os testes usam o Chromium com tela e toque de iPhone, Android e tablet. Vale
   abrir `/funcionario/` num iPhone (Safari) antes de entregar para a equipe.

---

## STATUS PARA PRODUÇÃO

| Item | Status | Observação |
|---|---|---|
| Área da Equipe (`/funcionario/`): login, agenda, bloqueios, dia inteiro, Ver, conflitos | **OK** | testado de ponta a ponta |
| Autorização no banco (funcionário ativo, RLS, sem gravação direta) | **OK** | |
| Registro das ações (`audit_logs`) | **OK** | |
| Pedido do cliente só pela função do servidor, com limites | **OK** | |
| Chaves e segredos fora do site, do Git e do navegador | **OK** | lint + teste no navegador |
| CSP, cabeçalhos, XSS, mensagens de erro, 404 | **OK** | |
| `npm run lint`, `npm run build`, `npm test`, `npm run test:banco`, `npm audit` | **OK** | 0 falhas, 0 vulnerabilidades |
| Rodar a migração `20261002120000_area_equipe_seguranca.sql` no Supabase | **PENDENTE** | seção 14 |
| `SUPABASE_SECRET_KEY` no Netlify (escopo Functions) e deploy pelo GitHub | **PENDENTE** | sem ela o agendamento segue pelo WhatsApp |
| Cadastro público desligado e URLs de redirecionamento no Supabase Auth | **PENDENTE** | seção 14, itens 2 e 3 |
| Cadastrar a equipe e tornar a dona/o dono `admin` (MFA) | **PENDENTE** | seções 6 e 8 |
| Teste rápido no site publicado | **PENDENTE** | seção 15 |
| Anti-robô Cloudflare Turnstile (agendamento e login) | **ATENÇÃO** | opcional, mas recomendado; sem ele valem os limites |
| Limite de 4 pedidos/hora por origem em rede de celular compartilhada | **ATENÇÃO** | raro; ajustável (risco 3) |
| Conferir `/funcionario/` num iPhone de verdade (Safari) | **ATENÇÃO** | testado no Chromium com tela e toque de iPhone |
| 2FA nas contas do Netlify e do Supabase | **ATENÇÃO** | protege a chave secreta e o banco |

**Conclusão:** nenhuma falha crítica de segurança encontrada e nenhum erro causado pelas mudanças nos
testes. O sistema **não está "100% pronto" para produção** enquanto os itens PENDENTE (configuração manual
no Supabase e no Netlify) não forem feitos e o teste rápido da seção 15 não passar no site publicado.

