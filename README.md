# Rifinha Digital — API REST

API REST para uma plataforma de rifas digitais: listar rifas, buscar uma
rifa, comprar números, consultar compras — com garantias contra números
duplicados, validação de disponibilidade e encerramento automático da rifa.

Construída em **Node.js + Express + PostgreSQL** (driver `pg` puro), seguindo
**arquitetura em camadas** e os princípios **SOLID**.

---

## Sumário

1. [Framework e tecnologias (com justificativas)](#1-framework-e-tecnologias)
2. [Estrutura de pastas](#2-estrutura-de-pastas)
3. [Arquitetura e SOLID](#3-arquitetura-e-solid)
4. [Modelo de dados](#4-modelo-de-dados)
5. [Como executar](#5-como-executar)
6. [Rotas da API](#6-rotas-da-api)
7. [Exemplos de requisição/resposta](#7-exemplos-de-requisiçãoresposta)
8. [Tratamento de erros](#8-tratamento-de-erros)
9. [Concorrência e integridade](#9-concorrência-e-integridade)
10. [Decisões técnicas: vantagens e desvantagens](#10-decisões-técnicas)

---

## 1. Framework e tecnologias

| Camada | Escolha | Por quê | Alternativa considerada |
|---|---|---|---|
| HTTP | **Express** | Maduro, estável, ecossistema gigante, pouco "mágico". Torna controllers/middlewares/rotas explícitos. | **Fastify** (mais rápido, validação por JSON Schema integrada). Preferi Express pela ubiquidade e legibilidade; a diferença de performance é irrelevante para este volume. |
| Banco | **PostgreSQL** | Requisito do projeto. Relacional, transacional (ACID), com `UNIQUE`, `CHECK` e locks — exatamente o que a regra de "não duplicar número" exige. | — |
| Driver | **pg** puro, sem ORM | Controle fino sobre transações e locks (`SELECT ... FOR UPDATE`), SQL explícito e previsível. | **Prisma/Sequelize/Knex** aceleram CRUD, mas abstraem o controle transacional que é o núcleo deste problema e adicionam peso. Defensável num sistema maior; aqui o `pg` é mais direto. |
| Validação | **Zod** | Schemas declarativos, coerção de tipos (`z.coerce`), mensagens claras, sem decorators. | **Joi** (equivalente); **express-validator** (mais verboso). |
| Config | **dotenv** | Padrão 12-factor para configuração via variáveis de ambiente. | — |

> **Sem TypeScript, Docker e testes** — conforme o escopo solicitado. A
> arquitetura, porém, foi desenhada para acomodá-los: services e repositórios
> recebem dependências por injeção, prontos para mock/TDD.

---

## 2. Estrutura de pastas

```
projeto/
├── package.json
├── .env.example
├── README.md
└── src/
    ├── server.js               # Bootstrap do servidor HTTP + shutdown gracioso
    ├── app.js                  # Montagem do Express (reutilizável em testes)
    ├── config/
    │   ├── env.js              # Leitura/validação de variáveis de ambiente
    │   └── database.js         # Pool pg + helper withTransaction()
    ├── routes/
    │   ├── index.js            # Agregador de rotas (/api)
    │   ├── raffle.routes.js    # Rotas de rifas (+ compra como sub-recurso)
    │   └── purchase.routes.js  # Rotas de consulta de compras
    ├── controllers/            # Adaptadores HTTP <-> domínio (sem regra)
    │   ├── raffle.controller.js
    │   └── purchase.controller.js
    ├── services/               # Regras de negócio (casos de uso)
    │   ├── raffle.service.js
    │   ├── purchase.service.js
    │   ├── raffle.presenter.js   # Mapeia linha do banco -> contrato da API
    │   └── purchase.presenter.js
    ├── repositories/           # Acesso a dados (somente SQL)
    │   ├── raffle.repository.js
    │   ├── purchase.repository.js
    │   └── ticket.repository.js
    ├── middlewares/
    │   ├── asyncHandler.js     # Captura erros de handlers async
    │   ├── validate.js         # Validação declarativa via Zod
    │   └── errorHandler.js     # 404 + tratamento central de erros
    ├── validations/            # Schemas de entrada (Zod)
    │   ├── raffle.validation.js
    │   └── purchase.validation.js
    ├── errors/
    │   └── AppError.js         # Hierarquia de erros de domínio
    └── database/
        ├── schema.sql          # DDL das tabelas
        ├── seed.sql            # Dados de exemplo
        └── migrate.js          # Aplicador de schema/seed
```

**Organização por camada técnica.** Com apenas dois agregados (Rifa e Compra),
a divisão por camada é mais legível que uma divisão por feature e evita
over-engineering. Para muitos domínios, módulos por feature escalariam melhor.

---

## 3. Arquitetura e SOLID

```
HTTP → Rota → [validate] → Controller → Service → Repository → PostgreSQL
                                   ↑ regras de negócio   ↑ apenas SQL
```

- **S — Single Responsibility:** cada camada tem um único motivo para mudar.
  Controller adapta HTTP; Service orquestra regra; Repository fala SQL;
  Presenter formata saída; Validation valida entrada.
- **O — Open/Closed:** novos casos de uso entram como novos services/rotas sem
  alterar os existentes; o `errorHandler` estende por tipo de erro.
- **L — Liskov:** `NotFoundError`, `ConflictError`, `BusinessRuleError` derivam
  de `AppError` e são tratados de forma intercambiável.
- **I — Interface Segregation:** repositórios expõem métodos específicos
  (`findByIdForUpdate`, `findTakenNumbers`) em vez de um repo genérico.
- **D — Dependency Inversion:** services e controllers são **factories** que
  recebem dependências por parâmetro (`createPurchaseService({ ...repos })`),
  dependendo de abstrações. Pronto para mocks em teste, sem container de DI.

---

## 4. Modelo de dados

Três tabelas (ver `src/database/schema.sql`):

- **raffles** — dados da rifa; `status` (`DISPONIVEL` | `ENCERRADA`),
  `total_numbers`, `sold_numbers`. `CHECK (sold_numbers <= total_numbers)`
  protege a invariante central.
- **purchases** — cada compra (comprador, quantidade, valor total).
- **tickets** — **uma linha por número vendido**, com
  `UNIQUE (raffle_id, number)`: garantia definitiva contra duplicidade — o
  banco recusa fisicamente vender o mesmo número duas vezes.

---

## 5. Como executar

Pré-requisitos: Node.js ≥ 18 e um PostgreSQL acessível.

```bash
npm install
cp .env.example .env          # ajuste as credenciais do Postgres
npm run migrate -- --seed     # cria tabelas + dados de exemplo
npm run dev                   # ou: npm start
```

API em `http://localhost:3000`. Healthcheck: `GET /api/health`.

---

## 6. Rotas da API

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/health` | Healthcheck. |
| GET | `/api/raffles` | Lista rifas. Query: `status`, `page`, `limit`. |
| GET | `/api/raffles/:id` | Detalha uma rifa. |
| POST | `/api/raffles/:raffleId/purchases` | Compra números da rifa. |
| GET | `/api/purchases` | Lista compras. Query: `buyerEmail`, `raffleId`, `page`, `limit`. |
| GET | `/api/purchases/:id` | Detalha uma compra (com os números). |

A compra é modelada como **sub-recurso** da rifa
(`/raffles/:id/purchases`) — semanticamente, toda compra pertence a uma rifa.

---

## 7. Exemplos de requisição/resposta

### `GET /api/raffles?status=DISPONIVEL`

```json
{
  "data": [
    {
      "id": 1,
      "title": "iPhone 15 Pro",
      "description": "Sorteio de um iPhone 15 Pro 256GB.",
      "unitPrice": 10.0,
      "totalNumbers": 100,
      "soldNumbers": 3,
      "availableNumbers": 97,
      "drawDate": "2026-08-08T12:00:00.000Z",
      "status": "DISPONIVEL",
      "createdAt": "2026-07-09T12:00:00.000Z",
      "updatedAt": "2026-07-09T12:00:00.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

### `POST /api/raffles/1/purchases`

Requisição:

```json
{
  "buyerName": "Maria Silva",
  "buyerEmail": "maria@email.com",
  "numbers": [7, 13, 21]
}
```

Resposta `201 Created` (header `Location: /api/purchases/10`):

```json
{
  "data": {
    "id": 10,
    "raffleId": 1,
    "buyerName": "Maria Silva",
    "buyerEmail": "maria@email.com",
    "quantity": 3,
    "totalAmount": 30.0,
    "numbers": [7, 13, 21],
    "createdAt": "2026-07-09T12:34:56.000Z"
  }
}
```

### `GET /api/purchases?buyerEmail=maria@email.com`

```json
{
  "data": [
    {
      "id": 10,
      "raffleId": 1,
      "buyerName": "Maria Silva",
      "buyerEmail": "maria@email.com",
      "quantity": 3,
      "totalAmount": 30.0,
      "createdAt": "2026-07-09T12:34:56.000Z"
    }
  ],
  "pagination": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

### `GET /api/purchases/10`

```json
{
  "data": {
    "id": 10,
    "raffleId": 1,
    "buyerName": "Maria Silva",
    "buyerEmail": "maria@email.com",
    "quantity": 3,
    "totalAmount": 30.0,
    "numbers": [7, 13, 21],
    "createdAt": "2026-07-09T12:34:56.000Z"
  }
}
```

---

## 8. Tratamento de erros

Envelope único para todo erro:

```json
{ "error": { "code": "SYMBOLIC_CODE", "message": "Mensagem legível.", "details": [] } }
```

| Cenário | HTTP | `code` |
|---|---|---|
| Entrada inválida (Zod) | 422 | `VALIDATION_ERROR` |
| Rifa/compra inexistente | 404 | `RAFFLE_NOT_FOUND` / `PURCHASE_NOT_FOUND` |
| Rifa não disponível/encerrada/expirada | 422 | `RAFFLE_NOT_AVAILABLE` |
| Números fora da faixa `[1..total]` | 422 | `NUMBERS_OUT_OF_RANGE` |
| Quantidade > disponível | 422 | `INSUFFICIENT_AVAILABILITY` |
| Número já vendido (checagem prévia) | 409 | `NUMBERS_ALREADY_TAKEN` |
| Número já vendido (corrida concorrente) | 409 | `DUPLICATE_TICKET` |
| Rota inexistente | 404 | `ROUTE_NOT_FOUND` |
| Erro inesperado | 500 | `INTERNAL_SERVER_ERROR` |

Exemplo (422 de validação):

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Falha na validação dos dados enviados.",
    "details": [
      { "field": "buyerEmail", "message": "buyerEmail deve ser um e-mail válido." }
    ]
  }
}
```

O `errorHandler` distingue **erros operacionais** (`AppError` → resposta
controlada) de **erros inesperados** (bugs/infra → 500 opaco, sem vazar stack
em produção). Erros async são capturados pelo `asyncHandler`.

---

## 9. Concorrência e integridade

Ponto mais crítico: **duas pessoas comprando o mesmo número ao mesmo tempo**.
Defesa em **duas camadas**:

1. **Lock pessimista de linha:** a compra roda em transação
   (`withTransaction`) e trava a rifa com `SELECT ... FOR UPDATE`. Compras
   concorrentes sobre a mesma rifa são **serializadas**, mantendo a contagem
   de vendidos e o encerramento consistentes.
2. **`UNIQUE(raffle_id, number)`:** garantia final no banco. Mesmo se a lógica
   falhar, o Postgres recusa o número duplicado (erro `23505`), convertido em
   `409 DUPLICATE_TICKET`.

**Encerramento** automático e atômico: ao atingir `total_numbers`, o mesmo
`UPDATE` muda o `status` para `ENCERRADA`. Rifas com `draw_date` no passado
também são recusadas para compra.

---

## 10. Decisões técnicas

**pg puro vs. ORM** — controle explícito de transações e locks, núcleo do
problema. *Desvantagem:* SQL manual e mapeamento snake_case→camelCase à mão
(isolado nos presenters). *Vantagem:* previsibilidade total.

**Express vs. Fastify** — ubiquidade e clareza. *Desvantagem:* menos
performático, sem validação nativa (resolvida com Zod). *Vantagem:* ecossistema.

**Factories para DI vs. container** — injeção manual, explícita, sem framework.
*Desvantagem:* wiring manual. *Vantagem:* testabilidade imediata (basta mocks).

**Número como linha (tickets) vs. array na compra** — permite ao banco impor
unicidade e consultar por número. *Desvantagem:* mais linhas. *Vantagem:*
integridade garantida pelo SGBD.

**Lock pessimista vs. otimista** — contenção sobre a mesma rifa é esperada; o
lock pessimista evita retries. *Desvantagem:* menor concorrência por rifa.
*Vantagem:* correção trivial de raciocinar.

**Sem autenticação** — não solicitada; comprador identificado por nome/e-mail
no corpo. Em produção viriam de um token JWT, com as consultas escopadas ao
usuário autenticado.
