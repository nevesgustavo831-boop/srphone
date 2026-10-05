# Checklist de produção · SR Phone

Data: 30/09/2026 · Branch: `Srphone` · Entrega final (correções, resultados e lista única do que falta): `AUDITORIA-PRODUCAO-SRPHONE.md`

`[x]` = feito **e conferido** (por teste automático ou verificação descrita). `[ ]` = pendente. Nada foi marcado sem ter sido verificado.

## Técnico (conferido)

- [x] `npm install` funcionando (Playwright 1.56.1 nas devDependencies, 0 vulnerabilidades)
- [x] Build funcionando (`npm run build`: BUILD CONCLUÍDO COM SUCESSO)
- [x] Lint funcionando (`npm run lint`: LINT SEM ERROS)
- [x] Testes no navegador: **592 ok, 0 falhas** (`npm test`), com esperas por condição (sem pausas fixas de espera)
- [x] Testes do servidor do assistente com IA: **76 ok, 0 falhas** (`npm run test:ia`, sem chave e sem IA de verdade)
- [x] Preço do assistente conferido por produto + armazenamento + cor (a falha "iPhone 15 de 128 GB por R$ 13.000,00" é recusada); a IA escreve `[[preco:...]]` e o valor vem do catálogo; histórico do navegador sem valores
- [x] "Disponível" do produto não vale para opção sem preço; nenhum código técnico na tela da entrega; tarifas de exemplo avisadas ao cliente
- [x] Celular 390 × 844: "Ver iPhones" inteiro na primeira tela (também 390 × 664, 375 × 667 e 430 × 932)
- [x] Testes do servidor da calculadora de entrega: **91 ok, 0 falhas** (`npm run test:entrega`, sem chave e sem Google de verdade)
- [x] Produção (`PRODUCAO-SRPHONE.md`): `MAPS_SERVER_KEY` (servidor) e `MAPS_BROWSER_KEY` (navegador) separadas, com o nome antigo `MAPS_API_KEY` ainda aceito; sessão do mapa criada no navegador com a chave dele; funções recusam pedido sem `Origin`; chave do servidor nunca aparece em resposta, erro ou registro (testado)
- [x] IA: modelo padrão `claude-sonnet-5` ("Active" na tabela oficial de status em 30/09/2026 e presente no SDK oficial); `claude-opus-5-5`, `claude-sonnet-5-5` e `claude-fable-5-1` fora da lista por decisão da loja; lista única de modelos aceitos (`MODELOS`) com effort e reserva de cada um (no padrão: `effort: low`, sem reserva); `AI_MODEL` fora da lista → padrão; modelo recusado (404) → nova tentativa no padrão; injeção pedindo `MAPS_SERVER_KEY` recusada sem chamar a IA; provedor de demonstração bloqueado fora do computador
- [x] Frete: uma única conta (`calcularEntrega`), regra de arredondamento configurável (`roundingMode`, 5 regras testadas), retirada R$ 0,00, contexto do produto do catálogo (id, nome, armazenamento, cor, preço) na mensagem do WhatsApp
- [x] Celular: calculadora testada em 375, 390, 430 e 768 px (e 1280 px), com o mapa saindo da frente quando o teclado abre
- [x] Calculadora de entrega: mapa com rota pelas ruas (A = loja, B = cliente), localização só depois do toque, endereço com sugestões, por partes ou CEP, valor pela regra de `DELIVERY_CONFIG` calculado no servidor, fora da área sem valor, WhatsApp sem envio automático, falha sem preço inventado, nada guardado no aparelho (`ENTREGA-SRPHONE.md`)
- [x] Assistente oferece a calculadora ("Quanto fica para entregar aqui?") e repete só os números do sistema de rotas
- [x] Segurança da entrega: chave do servidor só no Netlify, CSP com só `tile.googleapis.com` a mais, `Permissions-Policy: geolocation=(self)`, lint recusa chave do Google (`AIza...`) no projeto
- [x] Assistente SR Phone: mascote 3D da marca (versão final, feita no código) com pernas, sapatos e 12 gestos suaves; chat híbrido (atalhos, troca guiada, escolha de iPhone, memória da visita, "Limpar conversa", WhatsApp com resumo); função da IA no servidor com proteções
- [x] Links, âncoras, imagens, imports e sitemap sem nada quebrado (`npm run links`: 27 páginas, 1023 referências)
- [x] Migrações do Supabase testadas num PostgreSQL 16 local, rodadas duas vezes, com RLS, funcionário, bloqueio, cancelamento, remarcação, anti-spam e **dois pedidos simultâneos no mesmo horário** (`npm run test:banco`)
- [x] Site de verdade contra a API (PostgREST) e o banco migrado, com Publishable key: consulta horários, reserva como pendente, recusa horário duplicado, login do funcionário, confirmar, cancelar, bloquear horário e dia inteiro (23 verificações, `POSTGREST=... npm run test:banco`)
- [x] Publishable key (`sb_publishable_...`) só no cabeçalho `apikey`; Secret key e service_role recusadas no build e ignoradas no site
- [x] Segurar horário (15/30/60/120 min) testado no banco (10 cenários + concorrência: duas funcionárias, funcionária x cliente nas duas ordens, dois clientes num segurado vencido) e no painel contra a API (celular), com o prazo vencendo sozinho, sem cron
- [x] Catálogo validado: 25 produtos (sem seminovos CPO), sem R$ 0, sem "undefined/null/NaN", sem id ou nome repetido, sem imagem quebrada
- [x] Preços confirmados aplicados (lista no relatório), com preço por armazenamento **e por cor** (17 Pro 512 GB só no Prateado)
- [x] Variante sem preço mostra "Preço sob consulta" e abre o WhatsApp para consultar
- [x] Aparelhos CPO retirados do site: catálogo, páginas próprias, sitemap, busca e textos (motivos, perguntas, termos e dados para o Google). Link antigo de CPO mostra o aviso "não está mais no catálogo"
- [x] Se a loja voltar a vender CPO: regras de seminovo testadas com um CPO de teste (sem "novo e lacrado", "caixa lacrada", "aparelho novo", "garantia do fabricante" ou "nota fiscal em todas as vendas", já no HTML gerado (testado no HTML inicial e com o produto aberto)
- [x] Nota fiscal e garantia separadas: novos seguem a configuração dos novos; seminovos só o que for confirmado (`notaFiscalSeminovos`, `garantiaSeminovos`)
- [x] Ficha do iPhone 18 Pro / Pro Max corrigida (três câmeras traseiras; números não confirmados retirados)
- [x] Produto sem foto mostra ilustração do modelo com o selo "Ilustração" (nunca foto de outro aparelho)
- [x] WhatsApp validado: produto, produto com cor, troca, assistência e agendamento, sem campo vazio
- [x] Mobile validado de 320 a 1920 px: sem rolagem lateral, cabeçalho numa linha, botões com 40 px ou mais
- [x] Campos com 16 px nas telas de toque (o iPhone não dá zoom ao tocar)
- [x] SEO validado: página própria por produto (`/produto/<id>/`) com title, description, canonical, Open Graph e Twitter Card
- [x] Sitemap com 26 endereços (início + 25 produtos) e robots.txt com o sitemap
- [x] Product/Offer (schema.org) só com preço real, em BRL; LocalBusiness só com dados reais
- [x] Domínio centralizado em `SITE_CONFIG.url` (ou `SITE_URL` no `.env`); o `npm run links` acusa domínio escrito à mão
- [x] Segurança validada: sem segredo no código, CSP, `rel="noopener noreferrer"` em todo link externo, texto escapado, RLS no banco
- [x] 404 validada (status 404 com a página da SR Phone) e produto inexistente com aviso educado
- [x] Console sem erros nos testes (todas as páginas testadas)
- [x] Formulários: validação no campo, máscara de WhatsApp, bloqueio de clique duplo, campo-isca contra robô, prazo de 12 s quando o servidor não responde
- [x] Google Analytics preparado: sem ID não carrega nada; com ID, eventos testados sem dado pessoal
- [x] Política de privacidade e termos de acordo com o que o site realmente faz
- [x] Área da equipe escondida do rodapé enquanto a agenda online não estiver configurada
- [x] Área da Equipe em `/funcionario/`: login do Supabase Auth, só funcionário ativo (conferido pelo banco), MFA, bloqueios, dia inteiro, Ver, conflitos e registro das ações (testado com o Supabase Auth de verdade compilado do código oficial)
- [ ] Agenda em produção: rodar a migração `20261002120000_area_equipe_seguranca.sql`, cadastrar `SUPABASE_SECRET_KEY` no Netlify, liberar a equipe e fazer o teste rápido de `SEGURANCA-E-PAINEL-FUNCIONARIO.md`
- [ ] Anti-robô (opcional, recomendado): criar o widget no Cloudflare Turnstile e cadastrar `TURNSTILE_SITE_KEY` e `TURNSTILE_SECRET_KEY`
- [ ] Ligar o MFA da dona/do dono (`role = 'admin'`) e conferir o login com o código de 6 dígitos
- [x] `.env.example` sem nenhuma credencial; `.env` fora do Git

## Técnico (depende de ambiente que não existe aqui)

- [ ] Conferir num iPhone de verdade (Safari): os testes automáticos usam o Chromium com tela e toque de celular
- [x] Mascote 3D: versão final da marca feita no código (sem arquivo para baixar). Um GLB de artista é opcional (`GUIA-MODELO-3D-SRPHONE.md`)
- [ ] Assistente com IA: criar a chave na Anthropic, cadastrar `AI_API_KEY` no Netlify (escopo Functions) e publicar por Git ou Netlify CLI (Netlify Drop não publica a função). Passo a passo em `PRODUCAO-SRPHONE.md`
- [ ] Assistente com IA: fazer perguntas no site publicado e conferir os logs da função (não foi possível testar com a IA de verdade aqui)
- [ ] Entrega: Google Cloud com faturamento; ativar Routes API, Places API (New), Geocoding API e Map Tiles API; chave do servidor (`MAPS_SERVER_KEY`, restrita a Routes, Places New e Geocoding) e do navegador (`MAPS_BROWSER_KEY`, restrita ao domínio e à Map Tiles API) no Netlify. Passo a passo em `PRODUCAO-SRPHONE.md`
- [ ] Custos: orçamento com alertas e cotas por dia no Google Cloud; limite de gasto na Anthropic (`PRODUCAO-SRPHONE.md`, item 14)
- [ ] Entrega: testar no site publicado com endereços reais e num celular de verdade, com a localização permitida e negada (não foi possível testar com o Google de verdade aqui)
- [ ] Entrega: conferir nos termos atuais da Map Tiles API se a atribuição precisa da imagem oficial do logotipo do Google
- [ ] Aplicar as migrações no projeto Supabase real (depende das credenciais da loja)
- [ ] Rodar no Supabase `supabase/migrations/20260928140000_segurar_horario.sql` (ativa o "Segurar horário")
- [ ] Aviso no Telegram (opcional): token do bot e chat_id
- [ ] Depois de publicar: testar o domínio definitivo no Google Search Console e no validador de dados estruturados (Rich Results Test)

## Dados que dependem da loja

- [ ] Valores reais da entrega em `DELIVERY_CONFIG` (os de agora, R$ 7 + R$ 1,50/km, mínimo R$ 8, até 30 km, são de EXEMPLO) e depois `tarifasConfirmadas: true`
- [ ] (Opcional) Ponto exato da entrada da loja em `DELIVERY_CONFIG.origem` (vazio = o Google acha pelo endereço)

- [ ] CNPJ — aguardando informação do proprietário
- [ ] Razão social — aguardando informação do proprietário
- [ ] E-mail de contato — aguardando informação do proprietário
- [ ] Domínio — aguardando domínio definitivo
- [ ] Google Analytics — aguardando Measurement ID (G-...)
- [ ] Supabase — colar a Project URL e a Publishable key (`sb_publishable_...`) em `SUPABASE_URL` e `SUPABASE_ANON_KEY` e rodar `npm run build`
- [ ] Funcionários da agenda — aguardando e-mails de quem vai usar
- [ ] Google Maps — aguardando o link de incorporação
- [x] Google Reviews: nota 5,0, 3 avaliações reais e o link oficial (`AVALIACOES_GOOGLE`, conferidos em 29/09/2026)
- [ ] Google Reviews: a cada avaliação nova, atualizar `nota`, `total`, `lista` e `conferidoEm` em `data/config.js`
- [ ] Link direto "Pedir avaliações" do Perfil da Empresa (opcional): com ele em `linkAvaliar` aparece o botão "Avalie a SR Phone"
- [ ] Estoque real — hoje todos mostram "Consulte disponibilidade"; só o iPhone 15 de 128 GB mostra "Disponível" (dado do site original: confirmar; o 256 GB e o 512 GB, sem preço, mostram "Consulte disponibilidade")
- [ ] Preços que faltam: iPhone Air, iPhone 17e, iPad Pro, iPad Air, MacBook Air, MacBook Pro, AirPods Max 2 e as opções/cores sem preço (lista completa no `npm run build` e em `AUDITORIA-PRODUCAO-SRPHONE.md`)
- [ ] Armazenamento do iPhone 17 (R$ 5.450), e do iPhone 16 Pro Max (R$ 6.850)
- [ ] Tamanho do Apple Watch Series 12 (R$ 3.500): 42 ou 46 mm
- [ ] iPhone 17 Pro 512 GB: preço nas cores Laranja-cósmico e Azul-profundo
- [ ] Fotos das cores sem foto: Apple Watch Series 12 (Dourado-claro e Preto), iPhone 15 (Verde, Amarelo e Rosa) e iPad Pro (Preto-espacial). Hoje aparece "Foto desta cor em atualização"
- [ ] Ficha técnica completa do iPhone 18 Pro / Pro Max (hoje só o que é certo)
- [ ] A loja faz assistência técnica? (pronto, mas desligado)
- [ ] Seminovos CPO: fora do site. Se voltarem, confirmar procedência, nota fiscal (`notaFiscalSeminovos`) e garantia (`garantiaSeminovos`)
- [ ] Desconto no Pix e parcelas sem juros, se a loja oferecer
