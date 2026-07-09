'use strict';

/**
 * TESTES DE INTEGRAÇÃO — fluxo de compra contra um PostgreSQL REAL.
 *
 * Diferente dos unitários, aqui NÃO há mocks: exercitamos repositórios,
 * transação, o esquema (schema.sql) e a API HTTP de ponta a ponta. É o
 * que valida as garantias que só o banco oferece — sobretudo a
 * restrição UNIQUE(raffle_id, number) contra números duplicados.
 *
 * Requer a variável TEST_DATABASE_URL apontando para um banco DEDICADO
 * a testes. Sem ela, a suíte é PULADA (describe.skip) com aviso — para
 * não falhar em ambientes sem Postgres.
 */
const {
  isDbConfigured,
  applySchema,
  truncateAll,
  closePool,
} = require('../helpers/db');

// Direciona a aplicação/repositórios para o banco de testes ANTES de
// carregar os módulos que leem a configuração (config/env em require-time).
if (isDbConfigured()) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

const request = require('supertest');

// Requeridos após ajustar DATABASE_URL.
const { createApp } = isDbConfigured() ? require('../../src/app') : {};
const raffleRepository = isDbConfigured()
  ? require('../../src/repositories/raffle.repository')
  : {};
const { createPurchaseService } = isDbConfigured()
  ? require('../../src/services/purchase.service')
  : {};
const { pool } = isDbConfigured() ? require('../../src/config/database') : {};

const describeDb = isDbConfigured() ? describe : describe.skip;

if (!isDbConfigured()) {
  // eslint-disable-next-line no-console
  console.warn(
    '[integration] TEST_DATABASE_URL não definida — testes de integração pulados.'
  );
}

describeDb('Fluxo de compra (integração com PostgreSQL)', () => {
  let app;

  beforeAll(async () => {
    await applySchema();
    app = createApp();
  });

  beforeEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    // Fecha tanto o pool do app quanto o pool do helper de testes.
    await pool.end();
    await closePool();
  });

  async function seedRaffle(overrides = {}) {
    return raffleRepository.create({
      title: 'Rifa de Teste',
      description: 'Integração',
      unitPrice: 10,
      totalNumbers: 5,
      drawDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
      ...overrides,
    });
  }

  it('GET /api/raffles retorna a rifa persistida', async () => {
    await seedRaffle();

    const res = await request(app).get('/api/raffles').expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({ title: 'Rifa de Teste', availableNumbers: 5 });
  });

  it('POST compra números, grava tickets e atualiza vendidos', async () => {
    const raffle = await seedRaffle();

    const res = await request(app)
      .post(`/api/raffles/${raffle.id}/purchases`)
      .send({ buyerName: 'Maria', buyerEmail: 'maria@email.com', numbers: [1, 2] })
      .expect(201);

    expect(res.body.data).toMatchObject({ quantity: 2, totalAmount: 20, numbers: [1, 2] });

    // Estado do banco reflete a compra.
    const updated = await raffleRepository.findById(raffle.id);
    expect(Number(updated.sold_numbers)).toBe(2);
  });

  it('encerra a rifa automaticamente ao vender o último número', async () => {
    const raffle = await seedRaffle({ totalNumbers: 2 });

    await request(app)
      .post(`/api/raffles/${raffle.id}/purchases`)
      .send({ buyerName: 'Ana', buyerEmail: 'ana@email.com', numbers: [1, 2] })
      .expect(201);

    const updated = await raffleRepository.findById(raffle.id);
    expect(updated.status).toBe('ENCERRADA');
  });

  it('impede número duplicado — a UNIQUE do banco garante (409)', async () => {
    const raffle = await seedRaffle();
    const purchaseService = createPurchaseService();

    // Primeira compra reserva o número 3.
    await purchaseService.purchaseNumbers({
      raffleId: raffle.id,
      buyerName: 'A',
      buyerEmail: 'a@a.com',
      numbers: [3],
    });

    // Segunda compra do mesmo número deve ser recusada.
    const res = await request(app)
      .post(`/api/raffles/${raffle.id}/purchases`)
      .send({ buyerName: 'B', buyerEmail: 'b@b.com', numbers: [3] })
      .expect(409);

    expect(res.body.error.code).toBe('NUMBERS_ALREADY_TAKEN');

    // Garantia de integridade: apenas 1 ticket para o número 3.
    const { rows } = await pool.query(
      'SELECT COUNT(*)::int AS c FROM tickets WHERE raffle_id = $1 AND number = 3',
      [raffle.id]
    );
    expect(rows[0].c).toBe(1);
  });

  it('duas compras concorrentes do mesmo número: só uma vence', async () => {
    const raffle = await seedRaffle();
    const purchaseService = createPurchaseService();

    const buy = (email) =>
      purchaseService.purchaseNumbers({
        raffleId: raffle.id,
        buyerName: email,
        buyerEmail: email,
        numbers: [4],
      });

    // Dispara as duas ao mesmo tempo; o lock + UNIQUE serializam.
    const results = await Promise.allSettled([buy('x@x.com'), buy('y@y.com')]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
  });
});
