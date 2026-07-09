# Estratégia de Testes — Rifinha Digital

Documento da estratégia de testes (unitários + integração) da Rifinha Digital,
seguindo **TDD**. O objetivo é validar as regras de negócio de forma rápida e
determinística (unitários) e as garantias que só o banco oferece (integração),
com **injeção de dependência** habilitando *mocks* onde faz sentido.

---

## 1. Ferramenta escolhida — **Jest** (+ Supertest)

**Jest** como *test runner* e *assertion library*; **Supertest** para exercitar
a API HTTP nos testes de integração.

### Por que Jest?

| Critério | Jest | Vitest | Mocha + Chai + Sinon |
|---|---|---|---|
| Tudo-em-um (runner, asserts, mocks, cobertura) | ✅ nativo | ✅ nativo | ❌ precisa juntar libs |
| Maturidade/ubiquidade em Node backend | ✅ padrão de mercado | 🟡 crescente | ✅ maduro |
| Mocks/spies integrados (`jest.fn`, `jest.mock`) | ✅ | ✅ | ❌ (Sinon à parte) |
| Cobertura integrada (`--coverage`) | ✅ | ✅ | ❌ (nyc à parte) |
| Afinidade com projeto CommonJS puro | ✅ direto | 🟡 orientado a ESM/Vite | ✅ |

**Decisão:** o projeto é **Node.js + CommonJS**, sem *bundler*. O Jest roda
nesse cenário sem configuração extra e traz runner, asserts, mocks e cobertura
num só pacote.
- *Vitest* seria natural se houvesse Vite/ESM/front-end — não é o caso; adotá-lo
  aqui traria configuração de ESM sem benefício.
- *Mocha* é excelente, mas exigiria montar (Chai + Sinon + nyc), aumentando a
  superfície de manutenção. Jest entrega o mesmo com menos peças.

*Desvantagem do Jest:* é mais "pesado" e faz *transform* mesmo sem precisarmos —
irrelevante para o tamanho desta suíte.

---

## 2. Estrutura de pastas

```
projeto/
├── jest.config.js                    # Configuração do Jest
├── tests/
│   ├── helpers/
│   │   ├── factories.js              # Test Data Builders (linhas no formato do banco)
│   │   └── db.js                     # Setup/teardown do banco de INTEGRAÇÃO
│   ├── unit/                         # Rápidos, sem I/O — regra de negócio isolada
│   │   ├── raffle.service.test.js    # criação de rifa + listagem/consulta
│   │   └── purchase.service.test.js  # compra, disponibilidade, duplicidade
│   └── integration/                  # Contra PostgreSQL real (via Supertest + repos)
│       └── purchase.flow.test.js
└── src/                              # Código de produção (system under test)
```

Separar `unit/` de `integration/` permite rodá-los isoladamente (os unitários
rodam em qualquer máquina; os de integração só quando há banco), e aplicar
políticas diferentes (ex.: `--runInBand` na integração).

---

## 3. Configuração da ferramenta (`jest.config.js`)

```js
module.exports = {
  testEnvironment: 'node',              // API backend, sem DOM
  clearMocks: true,                     // zera mocks entre testes (isolamento)
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',                   // bootstrap: sem lógica testável por unidade
    '!src/database/**',                 // schema/seed/migrate: infra
  ],
  coverageThreshold: {
    // Gate obrigatório sobre a CAMADA DE SERVIÇOS (regra de negócio),
    // que é o alvo dos unitários e roda sem banco.
    'src/services/*.service.js': {
      branches: 80, functions: 100, lines: 90, statements: 90,
    },
  },
};
```

Pontos de projeto:
- `testEnvironment: 'node'` — sem overhead de jsdom.
- `clearMocks: true` — cada teste começa limpo (evita vazamento de estado entre
  casos), pilar de testes confiáveis.
- **Threshold escopado aos `*.service.js`**: os testes unitários são
  responsáveis pela regra de negócio; controllers/repositories/middlewares são
  cobertos pela **integração** (que exige banco). Escopar o gate evita que
  `npm run test:coverage` falhe em máquinas sem PostgreSQL, mantendo mesmo assim
  um piso rigoroso sobre o núcleo de domínio.

Variável de ambiente da integração (`.env` de teste ou export no shell):

```bash
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/rifinha_test
```

---

## 4. Testes unitários

Isolados do banco por **injeção de repositórios mock** (a factory
`create*Service({ ...deps })`). Não há I/O — são rápidos e determinísticos.

### 4.1 Criação de rifa — `tests/unit/raffle.service.test.js`
- Cria a rifa e retorna o **DTO público** (camelCase, campos derivados como
  `availableNumbers`), verificando que o repositório foi chamado corretamente.
- Rejeita `unitPrice <= 0` → `INVALID_UNIT_PRICE` (422) **sem** chamar o repo.
- Rejeita `totalNumbers < 2` → `INVALID_TOTAL_NUMBERS`.
- Rejeita `drawDate` no passado → `INVALID_DRAW_DATE`.

### 4.2 Compra de números — `tests/unit/purchase.service.test.js`
- Caminho feliz: calcula o total (`unitPrice × qtd`), persiste compra e tickets
  **dentro da transação** (o fake `withTransaction` prova que foi transacional)
  e atualiza os vendidos.
- Rifa inexistente → `RAFFLE_NOT_FOUND` (404).
- Rifa `ENCERRADA` ou com sorteio expirado → `RAFFLE_NOT_AVAILABLE` (422).

### 4.3 Validação de disponibilidade — mesmo arquivo
- Números fora da faixa `[1..total]` → `NUMBERS_OUT_OF_RANGE` (422).
- Quantidade maior que a disponível → `INSUFFICIENT_AVAILABILITY` (422).

### 4.4 Impedir compra duplicada — mesmo arquivo
- Quando o repositório de tickets indica número já vendido →
  `NUMBERS_ALREADY_TAKEN` (409) e **nada é persistido** (`create` não é chamado).

> Também há testes de consulta (`getById`/`list`) para rifas e compras, elevando
> a cobertura da camada de serviços a 100% das linhas.

---

## 5. Testes de integração (com banco de dados)

`tests/integration/purchase.flow.test.js` — **sem mocks**: exercita
repositórios, transação, o `schema.sql` real e a API via **Supertest**.

- Aplica o schema real (`applySchema`) e trunca as tabelas entre casos
  (`TRUNCATE ... RESTART IDENTITY CASCADE`), garantindo isolamento.
- `GET /api/raffles` retorna a rifa persistida.
- `POST` compra grava tickets e incrementa `sold_numbers`.
- **Encerramento automático**: ao vender o último número, `status` vira
  `ENCERRADA`.
- **Duplicidade real**: segunda compra do mesmo número retorna **409** e o banco
  mantém **apenas 1 ticket** — provando a `UNIQUE(raffle_id, number)`.
- **Concorrência**: duas compras simultâneas do mesmo número — só uma vence
  (lock + UNIQUE serializam).

Se `TEST_DATABASE_URL` não estiver definida, a suíte é **pulada**
(`describe.skip`) com aviso — não quebra em máquinas sem Postgres.

---

## 6. Mocks — quando e por quê

| Situação | Estratégia | Motivo |
|---|---|---|
| Testes unitários de service | **Repositórios mockados** (`jest.fn`) injetados pela factory | Isolar a regra de negócio de I/O; testes rápidos e determinísticos. |
| Transação em unitário | **Fake** de `withTransaction` que só executa o callback | Testar a orquestração sem abrir transação real. |
| Testes de integração | **Sem mocks** | O objetivo é justamente validar o banco e suas restrições. |

**Regra prática:** *mocka-se a fronteira de I/O nos unitários; não se mocka o que
se quer justamente validar (o banco) na integração.* Evitamos *over-mocking* —
mocks demais testam o mock, não o sistema.

---

## 7. Explicação dos testes (padrões adotados)

- **AAA (Arrange-Act-Assert)** e um helper `makeSut()` (System Under Test) por
  arquivo, que monta o service com dependências controladas — reduz repetição e
  deixa claro o que varia em cada caso.
- **Test Data Builders** (`factories.js`) constroem linhas no formato do banco
  (snake_case, `NUMERIC` como string), refletindo o que o driver `pg` retorna;
  cada teste sobrescreve só o relevante.
- **Asserção por contrato de erro** (`code`/`statusCode`) em vez de mensagem
  literal — os testes não quebram por ajuste de texto.
- **Verificação de efeitos colaterais**: além do retorno, checa-se *se* e *como*
  os repositórios foram chamados (`toHaveBeenCalledWith`) e que nada é persistido
  em caminhos de erro.
- Alinhado a **TDD**: cada regra de negócio corresponde a um teste escrito para
  falhar primeiro (red) e passar após a implementação (green).

---

## 8. Cobertura recomendada

| Camada | Alvo recomendado | Como é coberta | Enforçado? |
|---|---|---|---|
| **Services** (regra de negócio) | **≥ 90%** linhas / 100% funções | Testes unitários | ✅ gate no `jest.config.js` |
| Controllers / Rotas | ~70–80% | Integração (Supertest) | Recomendado (CI com banco) |
| Repositories | ~70–80% | Integração | Recomendado (CI com banco) |
| Middlewares | ~80% | Integração + unit do `errorHandler` | Recomendado |
| **Global do projeto** | **≥ 80%** | Unit + Integração combinados | CI com PostgreSQL |

Racional: exige-se o piso **mais alto onde está o risco de negócio** (services).
Números globais só são significativos com a **integração rodando** — por isso o
gate obrigatório recai nos serviços, e o piso global de ~80% deve ser verificado
no **CI**, onde um PostgreSQL de teste está disponível (ex.: *service container*).
Métricas atuais dos serviços: **100% de linhas**.

---

## 9. Comandos para executar os testes

```bash
# Instalar dependências (inclui jest e supertest como devDependencies)
npm install

# Todos os testes (integração é pulada se não houver TEST_DATABASE_URL)
npm test

# Apenas unitários (rápidos, sem banco)
npm run test:unit

# Apenas integração (requer TEST_DATABASE_URL; --runInBand evita corrida no schema)
export TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/rifinha_test
npm run test:integration

# Modo watch (TDD: red → green → refactor)
npm run test:watch

# Relatório de cobertura (aplica o gate dos serviços)
npm run test:coverage
```

> No PowerShell (Windows), defina a variável com:
> `$env:TEST_DATABASE_URL = "postgres://postgres:postgres@localhost:5432/rifinha_test"`

### Estado atual (sem banco configurado)

```
Test Suites: 1 skipped, 2 passed, 2 of 3 total
Tests:       5 skipped, 18 passed, 23 total
Cobertura src/services/*.service.js: 100% linhas (gate: OK)
```
