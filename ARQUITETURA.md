# Arquitetura — Rifinha Digital

Documento de arquitetura de software da **Rifinha Digital**, uma plataforma
de rifas digitais em **Node.js + JavaScript + PostgreSQL**. Este documento
descreve e formaliza a arquitetura adotada no código-fonte real do projeto
(`src/`), com foco em **baixo acoplamento, alta coesão, testabilidade,
escalabilidade e manutenibilidade**, guiada pelos princípios **SOLID**.

> Escopo: apenas arquitetura. Não há aqui implementação de banco de dados nem
> de endpoints — apenas o desenho estrutural e suas justificativas.

---

## Sumário

1. [Arquitetura escolhida](#1-arquitetura-escolhida)
2. [Justificativa](#2-justificativa)
3. [Estrutura completa de diretórios](#3-estrutura-completa-de-diretórios)
4. [Responsabilidade de cada camada](#4-responsabilidade-de-cada-camada)
5. [Fluxo de uma requisição](#5-fluxo-de-uma-requisição)
6. [Aplicação dos cinco princípios SOLID](#6-aplicação-dos-cinco-princípios-solid)
7. [Inversão de dependência](#7-inversão-de-dependência)
8. [Diagrama textual da arquitetura](#8-diagrama-textual-da-arquitetura)
9. [Padrões de projeto utilizados](#9-padrões-de-projeto-utilizados)
10. [Estratégias para escalabilidade](#10-estratégias-para-escalabilidade)
11. [Estratégias para manutenção futura](#11-estratégias-para-manutenção-futura)

---

## 1. Arquitetura escolhida

**Arquitetura em Camadas (Layered Architecture)** com uma influência leve de
**Ports & Adapters (Arquitetura Hexagonal)** na fronteira de dados.

O sistema é dividido em quatro camadas horizontais, com dependências fluindo
sempre **de fora para dentro** (do transporte HTTP em direção ao domínio):

```
Apresentação (HTTP)  →  Aplicação (Casos de uso)  →  Domínio/Regra  →  Infraestrutura (Dados)
   routes/controllers        services                  services            repositories + config
```

Concretamente:

```
Rotas → Controllers → Services → Repositories → PostgreSQL
```

A "influência hexagonal" está no fato de que os **services dependem de uma
abstração de repositório** (um contrato de métodos), e não de um módulo
concreto de banco. O driver PostgreSQL (`pg`) fica confinado exclusivamente
na camada de repositórios e no `config/database.js`, funcionando como um
*adapter* substituível.

### Alternativas consideradas

| Alternativa | Descrição | Por que **não** foi a principal |
|---|---|---|
| **MVC monolítico** (controllers "gordos") | Regra de negócio dentro dos controllers, acesso a dados direto no controller. | Baixa coesão e alto acoplamento ao HTTP e ao banco; dificulta testes unitários e viola SRP. Simples demais para as regras de concorrência exigidas (venda de cotas). |
| **Arquitetura Hexagonal pura** (ports/adapters formais, com interfaces explícitas e inversão total) | Domínio isolado no centro, todas as dependências externas atrás de ports. | Excelente para domínios grandes/complexos, mas em JavaScript (sem interfaces de tipo) e com **apenas 2 agregados** (Rifa e Compra), o cerimonial de ports/adapters formais adiciona indireção sem retorno proporcional. Adotamos apenas a *ideia* (repositório como abstração). |
| **Clean Architecture / Onion** (entidades, use cases, gateways, frameworks em anéis) | Camadas concêntricas com regra de dependência estrita. | Trade-off semelhante ao hexagonal puro: muito boilerplate (entities + use case interactors + boundaries) para o tamanho atual. A arquitetura em camadas entrega 80% do benefício com 20% do custo. |
| **Vertical Slice / por feature** | Organização por funcionalidade em vez de por camada técnica. | Escala melhor com **muitos** domínios; com dois agregados, a divisão por camada técnica é mais legível e navegável. (Ver seção 11 sobre como migrar para módulos por feature quando crescer.) |

**Escolha:** Camadas + repositório como abstração. É a melhor relação
esforço/benefício para o tamanho do domínio, mantendo as portas abertas para
evoluir rumo a hexagonal/feature-slices caso o sistema cresça.

---

## 2. Justificativa

A escolha atende diretamente aos requisitos do projeto:

- **Baixo acoplamento** — cada camada conhece apenas a interface da camada
  imediatamente interna. Controllers não sabem que existe SQL; services não
  sabem que existe HTTP; o domínio não importa o driver `pg`. A troca do
  PostgreSQL por outro banco impacta apenas `repositories/` e `config/`.
- **Alta coesão** — cada módulo tem uma única razão para mudar (SRP):
  validação muda em `validations/`, regra de negócio em `services/`,
  persistência em `repositories/`, formato de saída em `presenters`.
- **Facilidade de testes (TDD)** — como os services recebem seus repositórios
  por **injeção de dependência**, é trivial escrever testes unitários com
  *mocks*, sem banco. Testes de integração podem reutilizar `app.js` via
  Supertest sem abrir porta de rede. Isso viabiliza o ciclo *red-green-refactor*.
- **Escalabilidade** — a aplicação é *stateless* (sem estado em memória entre
  requisições), permitindo escala horizontal atrás de um load balancer.
- **Manutenibilidade** — a estrutura previsível e a separação clara reduzem o
  custo cognitivo de localizar e alterar comportamento.

### Vantagens e desvantagens da arquitetura em camadas

**Vantagens**
- Curva de aprendizado baixa; padrão amplamente conhecido no mercado.
- Fronteiras de teste naturais.
- Substituição de infraestrutura isolada.

**Desvantagens (e mitigação)**
- *Risco de "vazamento" entre camadas* (ex.: colocar SQL no service). →
  Mitigado por convenção estrita e revisão: repositórios são os **únicos** que
  importam `config/database`.
- *Objetos podem atravessar várias camadas ("pass-through")*. → Mitigado com
  **presenters** que transformam o dado do banco no contrato da API, evitando
  vazar o formato de persistência para o cliente.
- *Menos isolamento de domínio que a Clean Architecture*. → Aceitável para o
  tamanho atual; a abstração de repositório já garante o isolamento essencial.

---

## 3. Estrutura completa de diretórios

```
projeto/
├── package.json                # Dependências e scripts (start, dev, migrate)
├── .env.example                # Contrato de variáveis de ambiente
├── README.md                   # Documentação de uso da API
├── ARQUITETURA.md              # (este documento)
└── src/
    ├── server.js               # Bootstrap: sobe o HTTP server + shutdown gracioso
    ├── app.js                  # Composição do Express (sem escutar porta) — testável
    │
    ├── config/                 # Configuração e recursos de infraestrutura
    │   ├── env.js              # Leitura/validação das variáveis de ambiente (fail-fast)
    │   └── database.js         # Pool de conexões pg + helper withTransaction()
    │
    ├── routes/                 # Camada de roteamento (mapeia URL -> controller)
    │   ├── index.js            # Agregador sob o prefixo /api + healthcheck
    │   ├── raffle.routes.js    # Rotas de rifas (+ compra como sub-recurso)
    │   └── purchase.routes.js  # Rotas de consulta de compras
    │
    ├── controllers/            # Camada de apresentação (adaptador HTTP <-> domínio)
    │   ├── raffle.controller.js
    │   └── purchase.controller.js
    │
    ├── services/               # Camada de aplicação/domínio (regras de negócio)
    │   ├── raffle.service.js       # Casos de uso de rifa (factory + DIP)
    │   ├── purchase.service.js     # Caso de uso de compra (transação + regras)
    │   ├── raffle.presenter.js     # Mapeia linha do banco -> contrato público
    │   └── purchase.presenter.js
    │
    ├── repositories/           # Camada de infraestrutura de dados (somente SQL)
    │   ├── raffle.repository.js
    │   ├── purchase.repository.js
    │   └── ticket.repository.js
    │
    ├── middlewares/            # Preocupações transversais (cross-cutting)
    │   ├── asyncHandler.js     # Encaminha erros de handlers async ao error handler
    │   ├── validate.js         # Validação declarativa de entrada (Zod)
    │   └── errorHandler.js     # 404 + tratamento central de erros
    │
    ├── validations/            # Schemas de entrada (contratos de request)
    │   ├── raffle.validation.js
    │   └── purchase.validation.js
    │
    ├── errors/                 # Linguagem de erros do domínio
    │   └── AppError.js         # AppError + NotFound/Validation/Conflict/BusinessRule
    │
    └── database/               # Artefatos de esquema (não é "regra", é infra)
        ├── schema.sql          # DDL das tabelas e restrições
        ├── seed.sql            # Dados de exemplo
        └── migrate.js          # Aplicador idempotente de schema/seed
```

Princípio de organização: **por camada técnica**. Justificado na seção 1 pela
quantidade reduzida de agregados; a seção 11 descreve a rota de evolução para
organização **por feature** quando o domínio crescer.

---

## 4. Responsabilidade de cada camada

| Camada | Responsabilidade (o que **faz**) | O que **não** faz | Arquivos representativos |
|---|---|---|---|
| **Rotas** | Mapear método+URL para um handler; encadear middlewares (validação, asyncHandler). | Não contém lógica de negócio nem acesso a dados. | `routes/raffle.routes.js` |
| **Controllers** | Adaptar HTTP ⇄ domínio: extrair dados já validados de `req`, invocar o service, formatar `status`/corpo/headers da resposta. | Não valida (delegado ao middleware), não aplica regra de negócio, não fala com o banco. | `controllers/purchase.controller.js` |
| **Services** | Orquestrar os **casos de uso** e conter as **regras de negócio**: disponibilidade, faixa de números, impedir duplicados, encerrar rifa, controlar transação. | Não conhece HTTP (`req`/`res`), não escreve SQL. | `services/purchase.service.js` |
| **Presenters** | Traduzir o registro de persistência (snake_case, numéricos como string do `pg`) no **contrato público** da API (camelCase, tipos corretos, campos derivados como `availableNumbers`). | Não consulta dados, não aplica regra. | `services/raffle.presenter.js` |
| **Repositories** | Traduzir operações de persistência em **SQL parametrizado**; expor métodos específicos (`findByIdForUpdate`, `findTakenNumbers`, `incrementSoldAndMaybeClose`). | Não contém regra de negócio; não decide *quando* algo acontece, só *como* persistir. | `repositories/ticket.repository.js` |
| **Middlewares** | Preocupações transversais: parsing de JSON, validação de entrada, captura de erros async, tratamento central de erros e 404. | Não implementam caso de uso específico. | `middlewares/{validate,errorHandler,asyncHandler}.js` |
| **Validations** | Declarar o **formato** esperado de `body`/`params`/`query` (Zod), com coerção e mensagens. | Não aplicam regras de negócio (ex.: "número já vendido" é do service). | `validations/purchase.validation.js` |
| **Errors** | Definir a **linguagem de erros** do domínio (hierarquia `AppError`) com status HTTP e código simbólico. | Não decidem resposta HTTP (isso é do `errorHandler`). | `errors/AppError.js` |
| **Config** | Prover recursos de infraestrutura: variáveis de ambiente validadas e o **pool** de conexões + `withTransaction()`. | Não contém regra nem SQL de domínio. | `config/{env,database}.js` |
| **Bootstrap** | `app.js` compõe o Express; `server.js` sobe a porta e trata shutdown. | — | `app.js`, `server.js` |

> **Distinção importante entre validação e regra de negócio:** a **validação**
> (`validations/`) responde "o formato do pedido é válido?" (e-mail bem-formado,
> números positivos e sem repetição). A **regra de negócio** (`services/`)
> responde "esta operação é permitida agora?" (rifa disponível, números
> ainda livres, quantidade dentro do disponível). Separá-las é o que dá
> coesão a cada camada.

---

## 5. Fluxo de uma requisição

Exemplo canônico — **compra de números**:
`POST /api/raffles/1/purchases`.

### Caminho de sucesso

```
1. Express recebe a requisição e aplica express.json() (parsing do corpo).
2. Router (raffle.routes.js) casa a rota e executa a cadeia de middlewares:
   2a. validate(createPurchaseSchema): valida params (raffleId) e body
       (buyerName, buyerEmail, numbers). Coage tipos e substitui req.body
       pelo dado já parseado. Se inválido -> lança ValidationError (422).
   2b. asyncHandler(controller.create): envolve o controller async.
3. Controller (purchase.controller.js): extrai os dados já confiáveis de req
   e chama purchaseService.purchaseNumbers({ raffleId, buyerName, ... }).
4. Service (purchase.service.js) abre uma TRANSAÇÃO via withTransaction:
   4a. raffleRepository.findByIdForUpdate(raffleId, client)  -> SELECT ... FOR UPDATE
       (trava a linha da rifa: serializa compras concorrentes).
   4b. Regras de negócio:
       - rifa existe?               (senão NotFoundError 404)
       - status = DISPONIVEL e não expirada?  (senão BusinessRuleError 422)
       - números dentro de [1..total]?        (senão 422)
       - quantidade <= disponível?            (senão 422)
       - ticketRepository.findTakenNumbers()  -> algum já vendido? (senão ConflictError 409)
   4c. purchaseRepository.create(...)         -> INSERT da compra
   4d. ticketRepository.insertMany(...)       -> INSERT dos números
       (UNIQUE(raffle_id, number) é a garantia final contra duplicidade)
   4e. raffleRepository.incrementSoldAndMaybeClose(...) -> atualiza vendidos e,
       se esgotou, muda status para ENCERRADA — tudo na mesma transação.
   4f. COMMIT automático (ou ROLLBACK em caso de exceção).
5. Presenter (purchase.presenter.js): monta o objeto de resposta (camelCase).
6. Controller responde 201 Created + header Location + { data: purchase }.
```

### Caminho de erro

```
Qualquer camada lança um AppError (ou o pg lança violação de UNIQUE).
        │
        ▼
asyncHandler captura a rejeição da Promise e chama next(err).
        │
        ▼
errorHandler (middleware terminal de 4 args) decide a resposta:
  - AppError            -> status/código do próprio erro (ex.: 422, 404, 409)
  - pg código '23505'   -> 409 DUPLICATE_TICKET (corrida concorrente)
  - qualquer outro      -> 500 INTERNAL_SERVER_ERROR (stack não vaza em produção)
Envelope único: { "error": { "code", "message", "details" } }
```

Observação-chave: **a fronteira de transação vive inteiramente no service** —
os repositórios recebem o `client` transacional por parâmetro e participam da
mesma unidade de trabalho, sem conhecerem a transação em si.

---

## 6. Aplicação dos cinco princípios SOLID

### S — Single Responsibility Principle
Cada camada/módulo tem um único motivo para mudar:
- `controllers/` muda se o **contrato HTTP** mudar;
- `services/` muda se a **regra de negócio** mudar;
- `repositories/` muda se o **esquema/consulta** mudar;
- `validations/` muda se o **formato de entrada** mudar;
- `presenters` mudam se o **formato de saída** mudar.

Exemplo: alterar a mensagem/formato de erro de validação toca apenas
`middlewares/validate.js` — nenhum controller ou service é afetado.

### O — Open/Closed Principle
O sistema é aberto para extensão, fechado para modificação:
- Um novo caso de uso (ex.: "cancelar compra") entra como um **novo service +
  nova rota**, sem editar os existentes.
- O `errorHandler` trata novos tipos de erro adicionando uma subclasse de
  `AppError` — não é preciso reescrever o handler.
- Um novo agregado (ex.: "Organizador") entra como um novo conjunto
  routes/controller/service/repository, sem tocar em Rifa/Compra.

### L — Liskov Substitution Principle
A hierarquia de erros (`NotFoundError`, `ConflictError`, `BusinessRuleError`,
`ValidationError`) deriva de `AppError` e é usada de forma **intercambiável**
pelo `errorHandler`: qualquer subclasse pode substituir a base sem quebrar o
comportamento (`instanceof AppError` continua verdadeiro e `statusCode`/`code`
são respeitados). O mesmo vale para um repositório *mock* substituir o real.

### I — Interface Segregation Principle
Os repositórios expõem **métodos pequenos e específicos** ao que os services
precisam (`findByIdForUpdate`, `findTakenNumbers`, `incrementSoldAndMaybeClose`)
em vez de um repositório genérico "faz-tudo". Um consumidor que só lê rifas não
é forçado a depender de métodos de escrita de tickets.

### D — Dependency Inversion Principle
Services e controllers são **factories** que recebem suas dependências por
parâmetro e dependem de **abstrações** (o contrato do repositório), não de
implementações concretas. Detalhado na seção 7.

---

## 7. Inversão de dependência

### Como está implementado

Cada service é criado por uma *factory* que aceita suas dependências, com um
*default* que faz o *wiring* de produção:

```js
// services/purchase.service.js  (trecho ilustrativo da assinatura)
function createPurchaseService({
  raffleRepository   = raffleRepositoryDefault,
  purchaseRepository = purchaseRepositoryDefault,
  ticketRepository   = ticketRepositoryDefault,
  withTransaction    = db.withTransaction,
} = {}) {
  async function purchaseNumbers({ ... }) { /* usa as deps injetadas */ }
  return { purchaseNumbers, getPurchaseById, listPurchases };
}
```

O controller, por sua vez, recebe o service:

```js
// controllers/purchase.controller.js
function createPurchaseController({ purchaseService = createPurchaseService() } = {}) { ... }
```

### Direção das dependências

```
Controller  ──depende de──▶  contrato do Service
Service     ──depende de──▶  contrato do Repository   (NÃO do driver pg)
Repository  ──depende de──▶  config/database (pg)      ← única fronteira com o SGBD
```

O **domínio (services) não importa `pg`**. O driver PostgreSQL está confinado
em `repositories/` e `config/database.js`. Assim:

- **Testabilidade:** em um teste unitário do `purchaseService`, injetam-se
  repositórios *fake* e uma `withTransaction` que apenas executa a função —
  nenhum banco é necessário. Isso é o que habilita **TDD** de verdade.
- **Substituibilidade:** trocar PostgreSQL por outro armazenamento significa
  reimplementar os repositórios mantendo a **mesma assinatura de métodos**;
  services e controllers permanecem intactos.

### Por que factories em vez de um container de DI?

| Abordagem | Vantagem | Desvantagem |
|---|---|---|
| **Factory manual (adotada)** | Explícita, sem dependências externas, wiring visível e simples de rastrear; ótima testabilidade. | O wiring é feito à mão (aceitável com poucos módulos). |
| Container de DI (ex.: Awilix, tsyringe) | Automatiza o wiring em grafos grandes. | Adiciona "mágica", dependência e curva de aprendizado desnecessárias neste tamanho. |

Escolhemos a injeção manual por **simplicidade e transparência**; se o grafo de
dependências crescer muito, a migração para um container é incremental.

---

## 8. Diagrama textual da arquitetura

```
                              CLIENTE (HTTP)
                                   │  request/response (JSON)
                                   ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                         CAMADA DE APRESENTAÇÃO                              │
│                                                                            │
│   routes/  ──▶  middlewares (validate ▶ asyncHandler)  ──▶  controllers/   │
│      │                                                          │           │
└──────┼──────────────────────────────────────────────────────────┼─────────┘
       │                                                          │ chama
       │                                                          ▼
┌──────┼───────────────────────────────────────────────────────────────────┐
│                     CAMADA DE APLICAÇÃO / DOMÍNIO                          │
│                                                                           │
│   services/  (regras de negócio, casos de uso)                            │
│      │   ├─ abre/fecha TRANSAÇÃO (withTransaction) ......... UNIT OF WORK  │
│      │   └─ usa presenters/ para formatar a saída (DTO)                    │
│      │                                                                     │
│      │ depende do CONTRATO (abstração) do repositório  ◀── Inversão de Dep.│
└──────┼────────────────────────────────────────────────────────────────────┘
       │
       ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                    CAMADA DE INFRAESTRUTURA DE DADOS                        │
│                                                                            │
│   repositories/  (SQL parametrizado)  ──▶  config/database.js (pool pg)     │
│                                                    │                        │
└────────────────────────────────────────────────────┼──────────────────────┘
                                                     ▼
                                              ┌──────────────┐
                                              │  PostgreSQL  │
                                              │  raffles     │
                                              │  purchases   │
                                              │  tickets     │  UNIQUE(raffle_id, number)
                                              └──────────────┘

Preocupações transversais (atravessam as camadas de apresentação):
  errors/AppError  ─▶  middlewares/errorHandler   (mapeia erro -> resposta HTTP)

Legenda das dependências:  A ──▶ B  significa "A depende de / chama B".
Regra de ouro: as setas de dependência apontam sempre em direção ao domínio;
o domínio nunca aponta para a infraestrutura concreta (apenas para abstrações).
```

---

## 9. Padrões de projeto utilizados

| Padrão | Onde | Papel / Justificativa |
|---|---|---|
| **Layered Architecture** | Estrutura geral | Separação horizontal de responsabilidades. |
| **Repository** | `repositories/` | Abstrai a persistência atrás de métodos de domínio; isola o SQL e permite mock. |
| **Service Layer** | `services/` | Concentra casos de uso e regras de negócio, independente do transporte. |
| **Dependency Injection (via Factory)** | `create*Service`/`create*Controller` | Inverte dependências e habilita testes com mocks. |
| **DTO / Presenter** | `*.presenter.js` | Converte o modelo de persistência no contrato público, evitando vazamento de detalhes do banco. |
| **Front Controller** | Express + `app.js` | Ponto único de entrada que despacha todas as requisições pela mesma cadeia. |
| **Chain of Responsibility (Middleware)** | `middlewares/` | Cada middleware trata uma preocupação e passa adiante (`next`). |
| **Centralized Error Handler** | `middlewares/errorHandler.js` | Ponto único de tradução de erros de domínio → respostas HTTP consistentes. |
| **Unit of Work** | `config/database.js` `withTransaction()` | Agrupa múltiplas operações numa transação atômica (COMMIT/ROLLBACK). |
| **Pessimistic Locking** | `findByIdForUpdate` (`SELECT ... FOR UPDATE`) | Serializa compras concorrentes sobre a mesma rifa, protegendo invariantes. |
| **Guard Clauses** | Services | Validam pré-condições cedo e lançam `AppError`, mantendo o fluxo principal legível. |
| **Fail-fast Configuration** | `config/env.js` | Falha na inicialização se faltar configuração essencial. |

> Cada padrão foi escolhido para resolver um problema concreto do domínio
> (concorrência, atomicidade, consistência de contrato) — evitando padrões
> "decorativos" sem propósito.

---

## 10. Estratégias para escalabilidade

**Aplicação (escala horizontal)**
- O backend é **stateless**: nenhuma sessão em memória entre requisições.
  Pode-se rodar N instâncias atrás de um load balancer / usar o módulo
  `cluster` ou um orquestrador. Vantagem: escala linear simples; requisito é
  que qualquer estado compartilhado viva no PostgreSQL (ou em cache externo).

**Banco de dados**
- **Pool de conexões** (`config/database.js`) reaproveita conexões, evitando o
  custo de abrir/fechar a cada request; o tamanho do pool é o principal ajuste
  de vazão.
- **Índices** nas colunas de filtro (`raffles.status`, `purchases.buyer_email`,
  `purchases.raffle_id`, `tickets.purchase_id`) e a `UNIQUE(raffle_id, number)`
  suportam as consultas mais comuns.
- **Paginação** (`page`/`limit`) em todas as listagens evita respostas e
  varreduras ilimitadas.

**Concorrência**
- O **lock pessimista** por rifa serializa apenas as compras *da mesma rifa* —
  rifas diferentes não competem entre si, então o sistema escala bem quando a
  carga se distribui por muitas rifas.
  - *Trade-off:* uma rifa individual "quente" (muita gente comprando ao mesmo
    tempo) tem sua concorrência limitada por design — é o preço da correção.
    Alternativa futura: enfileirar as compras dessa rifa (ver abaixo).

**Pontos de evolução (quando/onde crescer)**
- **Cache de leitura** (ex.: Redis) para `GET /raffles` — o catálogo muda pouco
  e é muito lido. *Trade-off:* invalidação de cache passa a ser uma preocupação.
- **Read replicas** do PostgreSQL para direcionar consultas de leitura,
  aliviando o primário. *Trade-off:* consistência eventual nas leituras.
- **Fila/mensageria** (ex.: para pagamento assíncrono ou sorteio) desacopla
  operações demoradas do ciclo request/response. *Trade-off:* introduz
  complexidade operacional e a necessidade de idempotência.
- Como a camada de dados está isolada, essas evoluções entram **sem reescrever
  services/controllers** — apenas na infraestrutura/repositórios.

---

## 11. Estratégias para manutenção futura

**Convenções e previsibilidade**
- Nomenclatura consistente por camada (`*.controller.js`, `*.service.js`,
  `*.repository.js`, `*.validation.js`). Localizar comportamento é imediato.
- Regra de ouro reforçada por revisão de código: **só repositórios importam
  `config/database`**; **só controllers tocam `req`/`res`**.

**Evolução do contrato da API**
- Rotas versionáveis sob o prefixo `/api` (evoluir para `/api/v1`, `/api/v2`
  quando houver breaking change, mantendo a versão anterior).
- Envelope de resposta e de erro **padronizados** (`{ data }` / `{ error }`),
  o que estabiliza o contrato para os clientes.

**Esquema de dados**
- Migrações versionadas (`database/`) descrevem a evolução do schema. Para um
  sistema maior, recomenda-se adotar uma ferramenta dedicada (node-pg-migrate,
  Flyway) com histórico e *rollback* — a estrutura já está preparada para isso.

**Testabilidade e TDD**
- **Unitários:** testar services com repositórios *mockados* e uma
  `withTransaction` de teste — cobre as regras de negócio (disponibilidade,
  duplicidade, encerramento) sem banco. É o alvo primário do ciclo TDD.
- **Integração:** reutilizar `app.js` com **Supertest** (sem abrir porta),
  validando o fluxo HTTP completo e os códigos de erro (404/409/422/500).
- A injeção de dependências torna ambos os níveis diretos de escrever.

**Adicionar um novo agregado sem tocar no existente (OCP na prática)**
Para incluir, por exemplo, o agregado **Organizador**:
1. `validations/organizer.validation.js` — schemas de entrada;
2. `repositories/organizer.repository.js` — SQL;
3. `services/organizer.service.js` + `organizer.presenter.js` — regras/saída;
4. `controllers/organizer.controller.js` — adaptação HTTP;
5. `routes/organizer.routes.js` + registro em `routes/index.js`.
Nenhum arquivo de Rifa/Compra é modificado.

**Rota de crescimento arquitetural**
- Quando o número de agregados crescer, migrar da organização **por camada**
  para **por feature** (módulos `modules/raffle/{controller,service,repository}`),
  reduzindo o "salto" entre pastas. A separação de responsabilidades atual já
  torna essa migração mecânica.

**Observabilidade (recomendação)**
- Introduzir *logger* estruturado (ex.: pino) e *request-id* por requisição,
  além de métricas e healthcheck (`/api/health` já existe) para readiness/liveness.

---

## Conclusão

A arquitetura em camadas com repositório como abstração e injeção de
dependência por factories entrega, para o tamanho e as regras da Rifinha
Digital, o melhor equilíbrio entre **simplicidade, baixo acoplamento, alta
coesão, testabilidade (TDD) e escalabilidade**. As decisões priorizam
correção sob concorrência (transação + lock pessimista + `UNIQUE`) e mantêm
portas abertas para evolução (hexagonal, feature-slices, cache, filas, read
replicas) sem reescrever o núcleo de negócio.
```
