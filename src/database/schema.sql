-- ============================================================
--  Rifinha Digital — schema do banco de dados (PostgreSQL)
-- ============================================================
--  Modelagem em 3 tabelas:
--    raffles   — as rifas
--    purchases — cada compra realizada
--    tickets   — cada número/cota vendido (1 linha por número)
--
--  A tabela `tickets` com UNIQUE(raffle_id, number) é o coração da
--  integridade: garante, no nível do banco, que um número nunca seja
--  vendido duas vezes na mesma rifa, mesmo sob concorrência.
-- ============================================================

CREATE TABLE IF NOT EXISTS raffles (
  id            BIGSERIAL PRIMARY KEY,
  title         VARCHAR(160)  NOT NULL,
  description   TEXT          NOT NULL DEFAULT '',
  unit_price    NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
  total_numbers INTEGER       NOT NULL CHECK (total_numbers > 0),
  sold_numbers  INTEGER       NOT NULL DEFAULT 0 CHECK (sold_numbers >= 0),
  draw_date     TIMESTAMPTZ,
  status        VARCHAR(20)   NOT NULL DEFAULT 'DISPONIVEL'
                CHECK (status IN ('DISPONIVEL', 'ENCERRADA')),
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  -- Invariante: nunca vender mais do que existe.
  CONSTRAINT chk_sold_le_total CHECK (sold_numbers <= total_numbers)
);

CREATE TABLE IF NOT EXISTS purchases (
  id           BIGSERIAL PRIMARY KEY,
  raffle_id    BIGINT        NOT NULL REFERENCES raffles(id) ON DELETE CASCADE,
  buyer_name   VARCHAR(120)  NOT NULL,
  buyer_email  VARCHAR(160)  NOT NULL,
  quantity     INTEGER       NOT NULL CHECK (quantity > 0),
  total_amount NUMERIC(12,2) NOT NULL CHECK (total_amount >= 0),
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tickets (
  id          BIGSERIAL PRIMARY KEY,
  raffle_id   BIGINT      NOT NULL REFERENCES raffles(id) ON DELETE CASCADE,
  purchase_id BIGINT      NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  number      INTEGER     NOT NULL CHECK (number > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Garantia definitiva contra números duplicados por rifa.
  CONSTRAINT uq_ticket_raffle_number UNIQUE (raffle_id, number)
);

-- Índices para os filtros/consultas mais comuns.
CREATE INDEX IF NOT EXISTS idx_raffles_status        ON raffles (status);
CREATE INDEX IF NOT EXISTS idx_purchases_buyer_email ON purchases (buyer_email);
CREATE INDEX IF NOT EXISTS idx_purchases_raffle_id   ON purchases (raffle_id);
CREATE INDEX IF NOT EXISTS idx_tickets_purchase_id   ON tickets (purchase_id);
