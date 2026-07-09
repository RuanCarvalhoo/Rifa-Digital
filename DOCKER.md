# Estrutura Docker — Rifinha Digital

Documentação da infraestrutura de contêineres da Rifinha Digital: uma **API
Node.js** e um **PostgreSQL**, orquestrados via **Docker Compose**, com imagem
**multi-stage**, usuário não-root, healthchecks e persistência de dados.

---

## Sumário

1. [Estrutura de diretórios](#1-estrutura-de-diretórios)
2. [Dockerfile](#2-dockerfile)
3. [docker-compose.yml](#3-docker-composeyml)
4. [Configuração do PostgreSQL](#4-configuração-do-postgresql)
5. [Volumes](#5-volumes)
6. [Variáveis de ambiente](#6-variáveis-de-ambiente)
7. [Rede Docker](#7-rede-docker)
8. [Explicação de cada configuração](#8-explicação-de-cada-configuração)
9. [Comandos para executar](#9-comandos-para-executar)
10. [Boas práticas utilizadas](#10-boas-práticas-utilizadas)

---

## 1. Estrutura de diretórios

Arquivos relacionados a Docker (na raiz do projeto):

```
projeto/
├── Dockerfile              # Build multi-stage da imagem da API
├── .dockerignore           # Exclui do contexto de build (node_modules, .env, tests...)
├── docker-compose.yml      # Orquestra os serviços: api + db
├── .env.example            # Contrato de variáveis (copiar para .env)
└── src/                    # Código da aplicação (copiado para a imagem)
```

Decisão: manter os artefatos Docker **na raiz** (e não em uma pasta `docker/`).
Como há um único serviço aplicacional (a API) cujo contexto de build é a raiz,
essa é a convenção mais direta e esperada. Em um monorepo com vários serviços,
o ideal seria um `Dockerfile` por serviço dentro de cada pasta.

---

## 2. Dockerfile

Imagem **multi-stage** com três estágios: `base` → `deps` → `runtime`.

- **base** — `node:20-alpine` + `dumb-init`. Base comum aos demais estágios.
- **deps** — instala **apenas dependências de produção** (`npm ci --omit=dev`)
  a partir do lockfile, aproveitando cache de camadas.
- **runtime** — copia `node_modules` já resolvido + o código; roda como usuário
  não-root `node`; define `HEALTHCHECK` e o comando de inicialização.

Pontos-chave (ver comentários no arquivo `Dockerfile`):

| Recurso | Por quê |
|---|---|
| `node:20-alpine` | Node LTS + imagem pequena (menor superfície de ataque e download). |
| Multi-stage | Imagem final sem devDependencies nem toolchain de build. |
| `npm ci --omit=dev` | Build determinístico (lockfile) e enxuto para produção. |
| `USER node` (não-root) | Princípio do menor privilégio: reduz impacto de uma eventual invasão. |
| `dumb-init` como PID 1 | Encaminha sinais (SIGTERM) → shutdown gracioso; evita zumbis. |
| `HEALTHCHECK` | O orquestrador sabe quando o container está realmente pronto. |
| Ordem de `COPY` | `package*.json` antes do código → maximiza cache de `npm ci`. |

**Alternativas consideradas**
- *Imagem `-slim` (Debian) vs. `alpine`:* Alpine usa `musl` (menor); `-slim` usa
  `glibc` (mais compatível com módulos nativos). Como o driver `pg` é JS puro,
  Alpine venceu pelo tamanho. Se surgir dependência nativa problemática, migrar
  para `-slim` é trivial.
- *Imagem única (single-stage) vs. multi-stage:* single-stage é mais simples,
  porém carrega devDependencies e infla a imagem. Multi-stage foi escolhido pela
  imagem menor e mais segura — vantagem que supera o pequeno custo de leitura.

---

## 3. docker-compose.yml

Dois serviços em uma rede dedicada:

- **db** — PostgreSQL 16 (Alpine), com healthcheck (`pg_isready`) e volume
  persistente. Porta **não** exposta ao host por padrão (segurança).
- **api** — construída pelo `Dockerfile`; `depends_on` o `db` **saudável**;
  aplica migrações e sobe o servidor; expõe a porta da API ao host.

Trecho central do fluxo de inicialização:

```yaml
api:
  depends_on:
    db:
      condition: service_healthy        # espera o banco aceitar conexões
  command: sh -c "npm run migrate && node src/server.js"
```

`condition: service_healthy` resolve o clássico problema de *race condition* em
que a API tenta conectar antes de o Postgres estar pronto — sem precisar de
scripts de espera (`wait-for-it`), pois o healthcheck do banco é a fonte da
verdade.

---

## 4. Configuração do PostgreSQL

```yaml
db:
  image: postgres:16-alpine
  environment:
    POSTGRES_USER:     ${PGUSER:-postgres}
    POSTGRES_PASSWORD: ${PGPASSWORD:-postgres}
    POSTGRES_DB:       ${PGDATABASE:-rifinha}
  volumes:
    - pgdata:/var/lib/postgresql/data
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U ${PGUSER:-postgres} -d ${PGDATABASE:-rifinha}"]
    interval: 10s
    timeout: 5s
    retries: 5
    start_period: 10s
```

- A imagem oficial do Postgres cria automaticamente o usuário/senha/base a partir
  das variáveis `POSTGRES_*` **na primeira inicialização** (quando o volume está
  vazio).
- O **schema das tabelas** não é criado aqui: é aplicado pela API via
  `npm run migrate` (idempotente, `CREATE TABLE IF NOT EXISTS`), mantendo a
  definição de esquema versionada no código (`src/database/schema.sql`) e não
  duplicada na infra.
- `pg_isready` é o comando canônico para healthcheck de Postgres.

> **Segurança:** a porta `5432` fica fechada ao host por padrão. Apenas a API,
> na mesma rede, acessa o banco. Para inspecionar com um client externo (psql,
> DBeaver), descomente o bloco `ports` do serviço `db`.

---

## 5. Volumes

```yaml
volumes:
  pgdata:
    driver: local
```

- **Volume nomeado `pgdata`** montado em `/var/lib/postgresql/data`: os dados do
  banco **persistem** entre reinícios e recriações do container (`docker compose
  down` sem `-v` preserva; `down -v` apaga).
- **Por que volume nomeado e não bind mount** (`./data:/var/lib/...`)? Volumes
  nomeados são gerenciados pelo Docker, portáveis entre SOs (evita problemas de
  permissão/paths no Windows/macOS) e a escolha recomendada para dados de banco.
  *Desvantagem:* menos "visível" no sistema de arquivos do host — aceitável, pois
  não se deve editar arquivos internos do Postgres à mão.
- O **código da API não é montado como volume** no compose de produção: ele é
  *assado* na imagem (imutável, reprodutível). Para hot-reload em
  desenvolvimento, ver a nota sobre `docker-compose.override.yml` na seção 10.

---

## 6. Variáveis de ambiente

Fonte única: arquivo **`.env`** na raiz (copiado de `.env.example`). O Compose
o carrega automaticamente e injeta nos serviços; nada sensível vai para a imagem.

| Variável | Usada por | Default (dev) | Descrição |
|---|---|---|---|
| `NODE_ENV` | api | `production` | Modo de execução do Node. |
| `PORT` | api | `3000` | Porta HTTP da API (host e container). |
| `PGUSER` | db, api | `postgres` | Usuário do Postgres. |
| `PGPASSWORD` | db, api | `postgres` | Senha do Postgres. |
| `PGDATABASE` | db, api | `rifinha` | Nome da base. |
| `DATABASE_URL` | api | derivada | Montada no compose: `postgres://user:pass@db:5432/base`. |

Detalhe importante: dentro da rede do Compose, o host do banco é o **nome do
serviço** (`db`), não `localhost`. Por isso o `DATABASE_URL` da API aponta para
`@db:5432`. Os defaults `${VAR:-default}` deixam o `docker compose up` funcional
mesmo sem `.env`, sem comprometer a personalização.

> **Produção real:** as senhas não devem ficar em `.env` versionado. Use Docker
> Secrets, variáveis do orquestrador (Swarm/Kubernetes) ou um cofre (Vault). O
> `.env` aqui atende dev/homologação.

---

## 7. Rede Docker

```yaml
networks:
  rifinha-net:
    driver: bridge
```

- Uma **rede bridge dedicada** isola os contêineres do projeto e habilita o
  **DNS interno** do Docker: a API resolve o banco pelo nome `db`.
- Por que uma rede explícita em vez da `default`? Torna a topologia explícita e
  evita acoplamento acidental a outros projetos que rodem na rede padrão. Só o
  que está em `rifinha-net` se enxerga.
- A superfície exposta ao host resume-se à porta da API (`3000`); o banco
  permanece acessível apenas internamente — princípio de menor exposição.

---

## 8. Explicação de cada configuração

| Configuração | O que faz | Justificativa |
|---|---|---|
| `restart: unless-stopped` | Reinicia o container se cair (exceto parada manual). | Resiliência sem loops infinitos indesejados. |
| `depends_on: condition: service_healthy` | API só sobe com o banco saudável. | Elimina race condition de conexão na subida. |
| `healthcheck` (db e api) | Sonda de prontidão. | Orquestração confiável; base para readiness. |
| `command: migrate && server` | Migra e inicia. | Esquema sempre atualizado antes de servir tráfego; migração idempotente. |
| `HEALTHCHECK` (Dockerfile) | Checa `/api/health`. | Status real do processo, não só "container up". |
| `dumb-init` | PID 1 correto. | Sinais e shutdown gracioso (SIGTERM → `pool.end()`). |
| `USER node` | Não-root. | Menor privilégio. |
| Porta do db fechada | Sem `ports` no db. | Reduz exposição do banco. |
| Volume `pgdata` | Persistência. | Dados sobrevivem a recriações. |
| Defaults `${VAR:-x}` | Fallbacks. | Funciona "out of the box", personalizável via `.env`. |

---

## 9. Comandos para executar

```bash
# 1. Preparar variáveis (opcional — há defaults de dev)
cp .env.example .env

# 2. Construir as imagens e subir tudo (db + api)
docker compose up --build

# 2b. Em segundo plano (detached)
docker compose up --build -d

# 3. Acompanhar logs
docker compose logs -f api

# 4. Verificar status/health dos serviços
docker compose ps

# 5. Testar a API
#    (Windows PowerShell: Invoke-RestMethod http://localhost:3000/api/health)
curl http://localhost:3000/api/health
curl http://localhost:3000/api/raffles

# 6. Popular com dados de exemplo (opcional)
docker compose exec api npm run migrate -- --seed

# 7. Parar (mantendo os dados)
docker compose down

# 8. Parar e APAGAR os dados do banco (volume)
docker compose down -v
```

> **Nota de verificação:** o `docker compose config` foi validado com sucesso
> (sintaxe correta). O `docker build`/`up` não foi executado neste ambiente
> porque o daemon do Docker não estava em execução — rode os comandos acima em
> uma máquina com o Docker Engine ativo.

---

## 10. Boas práticas utilizadas

- **Multi-stage build** → imagem final menor e sem devDependencies.
- **`npm ci` + lockfile** → builds determinísticos e reprodutíveis.
- **Usuário não-root** (`USER node`) → menor privilégio.
- **`.dockerignore`** → contexto de build enxuto; `.env`/segredos nunca entram
  na imagem.
- **Healthchecks** no banco e na API → orquestração baseada em prontidão real.
- **`depends_on: service_healthy`** → ordem de subida correta sem scripts de
  espera.
- **`dumb-init` como PID 1** → tratamento correto de sinais / shutdown gracioso.
- **Volume nomeado** para o banco → persistência portável e gerenciada.
- **Banco não exposto ao host** → menor superfície de ataque.
- **Rede bridge dedicada** com DNS por nome de serviço → isolamento e clareza.
- **Configuração 12-factor** via variáveis de ambiente com defaults seguros.
- **Imagens oficiais e com tag fixa de major** (`node:20`, `postgres:16`) →
  equilíbrio entre estabilidade e correções; para reprodutibilidade total,
  fixar por *digest*.

### Recomendação de evolução (não incluída para não extrapolar o escopo)

- **`docker-compose.override.yml`** para desenvolvimento: montar `./src` como
  volume e usar `node --watch` para *hot-reload*, mantendo o compose de produção
  imutável. O Compose mescla `docker-compose.yml` + `override` automaticamente.
- **Docker Secrets / cofre** para credenciais em produção.
- **Fixar imagens por digest** e adicionar *scan* de vulnerabilidades (trivy) no
  CI.
```
