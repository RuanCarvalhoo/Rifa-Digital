# Análise do Projeto — Rifinha Digital

> Relatório de auditoria de código: falhas, erros de lógica, código morto e sugestões de melhoria.
> Nada foi corrigido — apenas catalogado. Data: 2026-07-13.
>
> Legenda de severidade: 🔴 **Crítico** · 🟠 **Importante** · 🟡 **Moderado** · 🔵 **Sugestão/melhoria**

---

## 1. Docker

### 🔴 D1. Sinais não chegam ao Node quando o Compose sobrescreve o comando
`docker-compose.yml:61` usa `command: sh -c "npm run migrate && node src/server.js"`. A cadeia de processos vira `dumb-init → sh → npm/node`. O `sh` **não repassa SIGTERM** para o processo filho, então todo o cuidado com graceful shutdown (`dumb-init` no `Dockerfile:57` + handlers de `SIGINT/SIGTERM` em `src/server.js:27`) é anulado: no `docker compose down`, o container espera o timeout de 10s e é morto com SIGKILL, sem fechar o pool do banco.
**Sugestão:** usar `exec` (`sh -c "npm run migrate && exec node src/server.js"`) ou mover a migração para um serviço/entrypoint separado.

### 🔴 D2. Alterar `PORT` no `.env` quebra o mapeamento de portas
Em `docker-compose.yml`:
- `environment: PORT: ${PORT:-3000}` → a API passa a escutar na porta `$PORT` **dentro** do container;
- `ports: "${PORT:-3000}:3000"` → o host é mapeado sempre para a porta **3000** do container.

Se o usuário definir `PORT=4000`, a API escuta em 4000 internamente, mas o mapeamento aponta para 3000 → API inacessível. O `HEALTHCHECK` do `Dockerfile:54` também está fixo em `localhost:3000` e passaria a falhar.
**Sugestão:** fixar a porta interna em 3000 (não passar `PORT` para o container) e parametrizar apenas o lado do host: `"${PORT:-3000}:3000"`.

### 🟠 D3. `frontend` não espera a API ficar saudável
`docker-compose.yml:74` usa `depends_on: - api` sem `condition: service_healthy`, embora a imagem da API tenha `HEALTHCHECK`. Se a API demorar ou falhar no boot, o Nginx sobe fazendo proxy para um upstream morto (e, se o container `api` nem existir na rede, o Nginx falha na inicialização com "host not found in upstream api").
**Sugestão:** `depends_on: api: condition: service_healthy`.

### 🟠 D4. Migração roda a cada start do container da API
O `command` do serviço `api` executa `npm run migrate` em **todo** start/restart. Com uma única réplica funciona (o schema é idempotente), mas se escalar (`--scale api=2`) as migrações concorrem entre si, e um erro transitório de migração derruba a API em loop de restart.
**Sugestão:** serviço one-shot dedicado à migração (com `depends_on` + `restart: "no"`), ou ferramenta de migração com lock.

### 🟡 D5. Credenciais padrão embutidas no compose
`docker-compose.yml:55` monta `DATABASE_URL` com fallback `postgres:postgres`. Para dev é aceitável, mas não há nenhuma barreira para isso ir a produção (o compose já define `NODE_ENV: production` por padrão, sinalizando intenção de uso "sério").
**Sugestão:** usar `secrets` do Compose ou exigir as variáveis sem fallback (`${PGPASSWORD:?erro}`), e senha forte no `.env.example` com aviso.

### 🟡 D6. Nginx do frontend roda como root
O `frontend/Dockerfile` usa `nginx:1.27-alpine` padrão (processo master como root). O backend teve o cuidado do `USER node`; o frontend não teve o equivalente.
**Sugestão:** usar `nginxinc/nginx-unprivileged` ou configurar usuário não-root.

### 🔵 D7. Melhorias gerais de imagem/compose
- Imagens base fixadas apenas por major (`node:20-alpine`, `postgres:16-alpine`, `nginx:1.27-alpine`); para builds reprodutíveis, fixar por digest (o próprio comentário do `Dockerfile:12` reconhece isso).
- Sem limites de recursos (`mem_limit`/`cpus`) nos serviços.
- Sem configuração de log rotation (`logging: max-size`) — logs do Postgres/API crescem sem limite.
- O seed (`seed.sql`) nunca é executado no fluxo do Compose — o ambiente sobe sempre vazio; se for intencional, documentar; senão, adicionar variável tipo `SEED=true`.
- O healthcheck do frontend (`wget http://localhost/`) só testa o estático; não valida o proxy `/api` (um healthcheck em `/api/health` via Nginx testaria a cadeia completa).

---

## 2. Arquitetura

### 🔴 A1. Ausência total de autenticação/autorização nas rotas de admin
`POST /api/raffles` e `POST /api/raffles/:id/draw` são descritas nos comentários como "ação de administrador" (`raffle.routes.js:22,28`), mas **qualquer pessoa** pode criar rifas e — pior — **sortear o ganhador** de qualquer rifa a qualquer momento, encerrando-a. A página `/admin` do frontend também é pública. Em um domínio com dinheiro envolvido, isso é a falha mais grave do projeto.
**Sugestão:** no mínimo uma API key/admin token via header, validada por middleware; idealmente autenticação real (JWT/sessão) com papéis.

### 🟠 A2. Endpoints implementados e não utilizados (código órfão pós-remoção de páginas)
As páginas `PurchasesPage.jsx` e `PurchaseDetailPage.jsx` foram deletadas do frontend, mas o backend mantém intactos:
- `GET /api/purchases` (`purchase.routes.js:16`) — listagem com filtros;
- `GET /api/purchases/:id` (`purchase.routes.js:19`) — detalhe com números;
- `purchaseService.getPurchaseById` e `listPurchases`, `purchaseRepository.findAll/count/findById`, `ticketRepository.findByPurchaseId`, `listPurchasesSchema`, `purchaseIdParamSchema`.

Nada consome essas rotas hoje. Ou é dívida (decidir: remover ou recriar a UI de "minhas compras"), ou é superfície de ataque gratuita (ver A3).

### 🟠 A3. `GET /api/purchases?buyerEmail=...` vaza dados pessoais
Sem autenticação, qualquer um pode consultar as compras (nome, e-mail, quantidade, valores) de **qualquer e-mail**, e enumerar compras por `id` sequencial em `GET /api/purchases/:id`. Também `winner_email` é retornado publicamente no payload da rifa (`raffle.presenter.js:30`). Exposição de PII.
**Sugestão:** exigir autenticação/prova de posse do e-mail, e não expor `winner.email` no contrato público (o nome já identifica o ganhador).

### 🟠 A4. Código morto / não utilizado
- `required()` em `src/config/env.js:10` — exportada e nunca usada em lugar nenhum. O comentário do módulo promete "fail-fast de variáveis obrigatórias", mas nenhuma variável usa o helper (tudo tem fallback silencioso, inclusive a senha do banco).
- `api.health()` em `frontend/src/api/client.js:84` — nunca chamado.
- Parâmetro `signal` de `request()` (`client.js:19`) — o cliente suporta `AbortController`, mas nenhuma página passa `signal`; os `useEffect` de todas as páginas têm race condition clássica de fetch (resposta antiga pode sobrescrever a nova ao trocar filtro/página rapidamente) justamente por não usar o recurso já implementado.
- `Pager` em `RafflesPage.jsx:109` é `export`ada, mas só usada no próprio arquivo (o consumidor externo era a página de compras deletada).

### 🟡 A5. Dois controllers/services de compra instanciados
`raffle.routes.js:17` e `purchase.routes.js:13` chamam cada um o seu `createPurchaseController()`, criando duas instâncias de controller/service. Inofensivo por serem stateless, mas contradiz a intenção de injeção de dependência e dificulta um futuro singleton com estado (cache, métricas).
**Sugestão:** compor os controllers uma vez (composition root) e injetá-los nas rotas.

### 🟡 A6. Shutdown gracioso sem timeout
`src/server.js:21` — `server.close()` espera todas as conexões ativas terminarem; se um cliente mantiver uma conexão keep-alive pendurada, o processo nunca sai (fora do Docker; dentro do Docker, ver D1).
**Sugestão:** `setTimeout(() => process.exit(1), N).unref()` como escape hatch.

### 🟡 A7. Observabilidade inexistente
Todo log é `console.log/error` sem estrutura, sem request logging (morgan/pino-http), sem correlação de requisições. O comentário do compose fala em "readiness/liveness probes", mas não há nenhuma métrica além do `/health` binário (que nem valida a conexão com o banco — um healthcheck que faz `SELECT 1` diria muito mais).

### 🔵 A8. Outras melhorias arquiteturais
- API sem versionamento real: o comentário em `app.js:20` diz "prefixo /api (versionável)", mas não há `/v1`; introduzir depois será breaking change.
- Sem `helmet` (headers de segurança) nem rate limiting (`express-rate-limit`) — relevante para endpoints de compra e sorteio.
- Documentação (`ARQUITETURA.md`, `README.md`) provavelmente desatualizada em relação à remoção das páginas de compras — conferir e atualizar.
- Constantes de negócio duplicadas e mágicas: o teto `10000` aparece em `raffle.validation.js:41` e `purchase.validation.js:24` sem uma fonte única (ex.: `src/config/constants.js`).
- Frontend: `JSON.parse(text)` em `client.js:37` lança `SyntaxError` cru se o servidor devolver não-JSON (ex.: página de erro 502 do Nginx) — o erro escapa do envelope `ApiError` e vira mensagem técnica na UI. Envolver em try/catch.

---

## 3. API

### 🟠 P1. Rifa expirada continua "DISPONIVEL" — inconsistência entre listagem e compra
O backend rejeita compra quando `draw_date <= now` (`purchase.service.js:50`), mas **nada** muda o `status` da rifa expirada: ela continua `DISPONIVEL` no banco. Consequências:
- `GET /api/raffles?status=DISPONIVEL` lista rifas em que ninguém consegue comprar;
- o frontend calcula `available` apenas por `status === 'DISPONIVEL' && availableNumbers > 0` (`RaffleDetailPage.jsx:28`), sem olhar `drawDate` — mostra o formulário habilitado e o usuário só descobre o erro (422) ao submeter.

**Sugestão:** filtrar/derivar expiração na query de listagem (`draw_date IS NULL OR draw_date > NOW()`), expor um campo derivado `isExpired` no presenter, ou job que encerra rifas vencidas. E o sorteio (`drawWinner`) não valida `draw_date` — o admin pode sortear antes da data anunciada; decidir se é regra e aplicá-la.

### 🟠 P2. Handler de erro 23505 assume que toda violação de UNIQUE é ticket duplicado
`errorHandler.js:38` converte **qualquer** erro Postgres `23505` em `409 DUPLICATE_TICKET`. Hoje só existe uma constraint UNIQUE, mas a primeira nova constraint (ex.: e-mail único) fará a API responder "Um ou mais números já foram vendidos" para um conflito completamente diferente.
**Sugestão:** checar `err.constraint === 'uq_ticket_raffle_number'` antes de assumir a semântica.

### 🟡 P3. Dinheiro em ponto flutuante
`purchase.service.js:91`: `Number((unitPrice * quantity).toFixed(2))` — aritmética monetária em float IEEE 754. Para os valores atuais funciona, mas é frágil (ex.: `0.1 * 3`). O banco usa `NUMERIC` corretamente; a conversão para `Number` nos presenters (`raffle.presenter.js:17`, `purchase.presenter.js:15`) reintroduz o float na borda.
**Sugestão:** trabalhar em centavos (inteiros) ou delegar o cálculo ao banco (`unit_price * $qty` na própria query).

### 🟡 P4. Validações de domínio duplicadas de forma incompleta
`raffle.service.js:37-45` re-valida `unitPrice > 0` e `totalNumbers >= 2` (já garantidos pelo Zod — duplicação intencional e documentada), mas o Zod **não** valida `drawDate` futura, enquanto o service valida. Ou seja: a "borda" e o "domínio" divergem em qual camada garante o quê. Além disso, o teto de `10000` números só existe no Zod — um chamador interno do service poderia criar rifa com 1 milhão de números (e `generate_series` de 1M viraria custo real em cada compra).
**Sugestão:** alinhar: invariantes completos no service, formato no Zod.

### 🟡 P5. `Location` com prefixo hardcoded e recurso sem GET
- `purchase.controller.js:21` monta `Location: /api/purchases/:id` com prefixo fixo — quebra se o mount point mudar.
- Se as rotas de consulta de compras forem removidas (ver A2), o header apontará para um recurso inexistente.

### 🟡 P6. Erros do frontend em fluxos de mutação
- `RaffleDetailPage.jsx:63`: refresh da rifa pós-compra com `.catch(() => {})` — falha silenciosa; a UI pode mostrar disponibilidade obsoleta.
- `AdminPage.jsx:25`: lista fixa `limit: 100` sem paginação — a partir da 101ª rifa o admin simplesmente não vê o restante, sem indicação disso.

### 🔵 P7. Melhorias de contrato
- Respostas de erro do Zod usam `422` para tudo; convenção comum é `400` para formato malformado de params (ex.: `/raffles/abc`) e `422` para semântica — hoje `GET /api/raffles/abc` devolve 422 onde a maioria das APIs devolveria 400. Padronizar e documentar.
- `toPurchaseResponse` com `numbers: undefined` (`purchase.presenter.js:16`) depende do `JSON.stringify` omitir a chave — funciona, mas é implícito; melhor omitir explicitamente.
- Não há documentação da API (OpenAPI/Swagger); os contratos vivem só nos comentários.

---

## 4. Banco de Dados

### 🔴 B1. Seed não é idempotente — `ON CONFLICT DO NOTHING` sem constraint aplicável
`seed.sql:7` termina com `ON CONFLICT DO NOTHING`, mas a tabela `raffles` **não tem nenhuma constraint UNIQUE** sobre as colunas inseridas (o `id` é BIGSERIAL, nunca conflita). Ou seja, o `ON CONFLICT` nunca dispara: cada execução de `npm run migrate -- --seed` insere as 3 rifas **de novo**, duplicando dados. O comentário do `migrate.js:8` promete "script idempotente", o que é verdade para o schema e falso para o seed.
**Sugestão:** UNIQUE em `title` (ou inserir com `WHERE NOT EXISTS`), ou seed com ids fixos + `ON CONFLICT (id) DO NOTHING`.

### 🟠 B2. CHECKs do schema divergem das regras de negócio
- `unit_price CHECK (unit_price >= 0)` (`schema.sql:18`) permite preço **zero**; o service exige `> 0`. Uma inserção direta/bug cria rifa gratuita válida para o banco e inválida para o domínio.
- `total_numbers CHECK (total_numbers > 0)` permite rifa de **1** número; a regra de negócio exige mínimo 2.

**Sugestão:** alinhar os CHECKs (`> 0` → `>= 0.01`/`> 0` conforme regra; `total_numbers >= 2`). O banco é a última linha de defesa — deveria codificar o mesmo invariante.

### 🟠 B3. Migrações "de verdade" inexistentes — schema.sql com ALTERs acumulados
`schema.sql:39-42` já contém `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` como remendo para bancos antigos. Isso é o sintoma clássico da falta de migrações versionadas: o arquivo vai acumular ALTERs para sempre e não há rollback nem histórico de versões.
**Sugestão:** adotar `node-pg-migrate` (ou similar) com migrações numeradas — o próprio comentário do `migrate.js` reconhece o limite da abordagem.

### 🟡 B4. `withTransaction` pode mascarar o erro original
`database.js:58`: se o `ROLLBACK` falhar (ex.: conexão caiu no meio da transação), a exceção do rollback **substitui** o erro original — o log mostrará a falha do rollback, não a causa raiz.
**Sugestão:** envolver o `ROLLBACK` em try/catch próprio, logando a falha do rollback e relançando o erro original.

### 🟡 B5. Pool sem tunning e sem SSL
`database.js:15` cria o `Pool` sem `max`, `idleTimeoutMillis`, `connectionTimeoutMillis` nem `statement_timeout`. Uma query travada (ex.: lock disputado) segura conexões indefinidamente. Não há opção de SSL — inviabiliza bancos gerenciados (RDS, Neon, Supabase) que exigem TLS.
**Sugestão:** parametrizar via env (`PGPOOLMAX`, `PGSSL`, timeouts) com defaults sensatos.

### 🟡 B6. `winner_number` sem vínculo referencial com a venda
O ganhador é denormalizado em `raffles` (decisão documentada, ok), mas não há nem FK, nem CHECK, nem trigger garantindo que `winner_number` corresponda a um ticket vendido da própria rifa. Um UPDATE manual pode registrar como ganhador um número nunca vendido, e nada acusa.
**Sugestão:** guardar também `winner_ticket_id BIGINT REFERENCES tickets(id)` — mantém a denormalização para leitura e ganha integridade.

### 🔵 B7. Melhorias de modelagem
- `status VARCHAR + CHECK` funciona; um tipo `ENUM` nativo (ou tabela de domínio) evita strings mágicas espalhadas por SQL, service e frontend.
- IDs `BIGSERIAL` sequenciais expostos publicamente permitem enumeração de recursos (`/purchases/1,2,3...`); considerar UUID/nanoid para recursos públicos (agrava A3).
- `sold_numbers` é contador denormalizado de `tickets` — consistente hoje porque tudo roda na mesma transação, mas vale um índice/consulta de reconciliação (`SELECT COUNT(*) FROM tickets GROUP BY raffle_id`) em rotina de sanidade, e/ou trigger.
- `purchases` não tem `updated_at` — irrelevante enquanto for imutável; se um dia houver status de pagamento (o próximo passo natural: hoje a compra é "simulada", sem pagamento), a tabela precisará de reforma.
- Falta índice em `raffles (draw_date)` se a listagem passar a filtrar expiração (ver P1).

---

## 5. Testes

### 🟠 T1. `drawWinner` não tem nenhum teste — em nenhuma camada
O sorteio do ganhador é a operação mais sensível depois da compra (lock, re-sorteio proibido, rifa sem vendas, encerramento automático) e:
- `tests/unit/raffle.service.test.js` cobre apenas `createRaffle`, `listRaffles` e `getRaffleById` — **zero** testes para `drawWinner` (404, `RAFFLE_ALREADY_DRAWN`, `NO_TICKETS_SOLD`, caminho feliz);
- `tests/integration/purchase.flow.test.js` não exercita `POST /api/raffles/:id/draw`.

Curiosamente, o threshold de cobertura exige `functions: 100` em services (`jest.config.js:31`) — o que sugere que `drawWinner` ou é executado indiretamente ou o gate está falhando/não sendo rodado com `--coverage`.

### 🟡 T2. Asserção enfraquecida por optional chaining acidental
`tests/unit/purchase.service.test.js:121`:
```js
expect(raffleRepository.incrementSoldAndMaybeClose).not.toHaveBeenCalled?.();
```
O `?.()` torna a chamada "opcional" — se por qualquer motivo o matcher não existisse, a linha viraria no-op silencioso em vez de erro. Funciona hoje por acaso; é claramente um typo (nenhuma outra asserção usa esse padrão).

### 🟡 T3. Rotas de consulta e error handling sem cobertura de integração
Sem testes para:
- `GET /api/purchases` e `GET /api/purchases/:id` (se forem mantidas — ver A2);
- respostas de validação Zod (422 com `details` por campo) — o contrato de erro não é testado;
- mapeamento `23505 → 409 DUPLICATE_TICKET` do `errorHandler` (a garantia "definitiva" contra duplicidade nunca é exercitada de fato — os testes de concorrência atuais são barrados antes, pelo `INSUFFICIENT_AVAILABILITY`);
- `notFoundHandler` (404 de rota inexistente);
- rifa expirada rejeitando compra via HTTP (existe só no unitário).

### 🟡 T4. Suíte de integração frágil por depender de ordem de `require`
`purchase.flow.test.js:24-38` muta `process.env.DATABASE_URL` e usa requires condicionais (`isDbConfigured() ? require(...) : {}`) — padrão frágil: qualquer import antecipado de `src/config/env` (ex.: por um novo helper) congelaria a URL errada silenciosamente, e os `{}` vazios geram erros confusos se `describeDb` mudar. Além disso, `npm test` roda unit + integração juntas em paralelo; hoje só há um arquivo de integração, mas o segundo arquivo criado introduzirá corrida no `TRUNCATE` (o `--runInBand` só está no script `test:integration`, não no `test`).
**Sugestão:** projetos Jest separados (`projects:` no config) com `globalSetup` para a integração, ou `testEnvironment` custom que injeta a URL antes de tudo.

### 🔵 T5. Lacunas e melhorias gerais
- **Frontend sem nenhum teste** (nem unitário de componentes, nem E2E). O fluxo de compra na UI — o coração do produto — só é validado manualmente. Sugestão: Vitest + Testing Library para componentes; Playwright para o fluxo completo via Compose.
- Sem CI configurada (nenhum workflow no repositório) — o gate de cobertura do Jest só vale se alguém rodar `npm run test:coverage` localmente.
- O fake de `withTransaction` nos unitários nunca simula rollback — não há teste de que um erro no meio da compra não persiste nada (isso só é garantido pela transação real; ok, mas o comportamento do service diante de erro do repositório não é verificado).
- `jest.config.js` não define `testTimeout`; testes de integração contra Postgres em máquina lenta/CI podem flakear com o default de 5s.
- Factories (`factories.js`) não incluem as colunas `winner_*` — funciona porque `undefined != null`, mas ao adicionar testes de `drawWinner` (T1) será preciso atualizá-las; deixar explícito (`winner_number: null`) evita surpresas.

---

## Resumo executivo

| # | Tópico | Críticos 🔴 | Importantes 🟠 | Moderados 🟡 | Sugestões 🔵 |
|---|--------|:---:|:---:|:---:|:---:|
| 1 | Docker | 2 | 2 | 2 | 1 (múltiplos itens) |
| 2 | Arquitetura | 1 | 3 | 3 | 1 (múltiplos itens) |
| 3 | API | 0 | 2 | 4 | 1 (múltiplos itens) |
| 4 | Banco de Dados | 1 | 2 | 3 | 1 (múltiplos itens) |
| 5 | Testes | 0 | 1 | 3 | 1 (múltiplos itens) |

**Top 5 para atacar primeiro:**
1. **A1** — rotas de admin (criar rifa / sortear) totalmente abertas, sem autenticação.
2. **B1** — seed duplica dados a cada execução (`ON CONFLICT` inócuo).
3. **D1 + D2** — shutdown quebrado no Compose e mapeamento de porta que quebra com `PORT` customizada.
4. **P1** — rifa expirada segue listada/exibida como disponível (backend e frontend divergem).
5. **T1** — `drawWinner` (operação crítica) sem nenhum teste.
