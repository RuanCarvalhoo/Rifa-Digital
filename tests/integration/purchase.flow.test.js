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

  it('POST compra a quantidade pedida, sorteia números válidos e atualiza vendidos', async () => {
    const raffle = await seedRaffle();

    const res = await request(app)
      .post(`/api/raffles/${raffle.id}/purchases`)
      .send({ buyerName: 'Maria', buyerEmail: 'maria@email.com', quantity: 2 })
      .expect(201);

    expect(res.body.data).toMatchObject({ quantity: 2, totalAmount: 20 });

    // Números foram sorteados pelo servidor: 2, distintos e dentro da faixa.
    const numbers = res.body.data.numbers;
    expect(numbers).toHaveLength(2);
    expect(new Set(numbers).size).toBe(2);
    numbers.forEach((n) => expect(n).toBeGreaterThanOrEqual(1));
    numbers.forEach((n) => expect(n).toBeLessThanOrEqual(5));

    // Estado do banco reflete a compra.
    const updated = await raffleRepository.findById(raffle.id);
    expect(Number(updated.sold_numbers)).toBe(2);
  });

  it('encerra a rifa automaticamente ao vender o último número', async () => {
    const raffle = await seedRaffle({ totalNumbers: 2 });

    await request(app)
      .post(`/api/raffles/${raffle.id}/purchases`)
      .send({ buyerName: 'Ana', buyerEmail: 'ana@email.com', quantity: 2 })
      .expect(201);

    const updated = await raffleRepository.findById(raffle.id);
    expect(updated.status).toBe('ENCERRADA');
  });

  it('rejeita comprar mais do que o disponível (INSUFFICIENT_AVAILABILITY, 422)', async () => {
    // 3 números disponíveis => impossível comprar 4.
    const raffle = await seedRaffle({ totalNumbers: 3 });

    const res = await request(app)
      .post(`/api/raffles/${raffle.id}/purchases`)
      .send({ buyerName: 'B', buyerEmail: 'b@b.com', quantity: 4 })
      .expect(422);

    expect(res.body.error.code).toBe('INSUFFICIENT_AVAILABILITY');

    // Nada foi vendido.
    const updated = await raffleRepository.findById(raffle.id);
    expect(Number(updated.sold_numbers)).toBe(0);
  });

  it('não repete números entre compras distintas (cada número tem um dono)', async () => {
    const raffle = await seedRaffle({ totalNumbers: 5 });

    const first = await request(app)
      .post(`/api/raffles/${raffle.id}/purchases`)
      .send({ buyerName: 'A', buyerEmail: 'a@a.com', quantity: 3 })
      .expect(201);

    const second = await request(app)
      .post(`/api/raffles/${raffle.id}/purchases`)
      .send({ buyerName: 'B', buyerEmail: 'b@b.com', quantity: 2 })
      .expect(201);

    const all = [...first.body.data.numbers, ...second.body.data.numbers].sort((x, y) => x - y);
    // Preencheu exatamente {1..5}, sem repetição.
    expect(all).toEqual([1, 2, 3, 4, 5]);

    // Integridade no banco: nenhum número aparece duas vezes.
    const { rows } = await pool.query(
      'SELECT number, COUNT(*)::int AS c FROM tickets WHERE raffle_id = $1 GROUP BY number HAVING COUNT(*) > 1',
      [raffle.id]
    );
    expect(rows).toHaveLength(0);
  });

  it('compras concorrentes não ultrapassam a disponibilidade', async () => {
    // 3 disponíveis; duas compras de 2 ao mesmo tempo (total 4 > 3).
    const raffle = await seedRaffle({ totalNumbers: 3 });
    const purchaseService = createPurchaseService();

    const buy = (email) =>
      purchaseService.purchaseNumbers({
        raffleId: raffle.id,
        buyerName: email,
        buyerEmail: email,
        quantity: 2,
      });

    // O lock (FOR UPDATE) serializa: uma compra vence, a outra é recusada
    // por falta de disponibilidade — nunca vendemos mais do que existe.
    const results = await Promise.allSettled([buy('x@x.com'), buy('y@y.com')]);

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    const updated = await raffleRepository.findById(raffle.id);
    expect(Number(updated.sold_numbers)).toBe(2);
  });
});
