'use strict';

/**
 * Fábricas de dados de teste (Object Mother / Test Data Builder).
 *
 * Centralizam a construção de objetos no formato em que o BANCO os
 * devolve (snake_case, `unit_price` como string — o driver `pg`
 * entrega NUMERIC como string). Isso mantém os testes legíveis e
 * evita repetição; cada teste sobrescreve só o que lhe interessa.
 */

function buildRaffleRow(overrides = {}) {
  return {
    id: 1,
    title: 'iPhone 15 Pro',
    description: 'Sorteio de um iPhone.',
    unit_price: '10.00',
    total_numbers: 100,
    sold_numbers: 0,
    draw_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // +30 dias
    status: 'DISPONIVEL',
    created_at: new Date('2026-07-09T12:00:00Z'),
    updated_at: new Date('2026-07-09T12:00:00Z'),
    ...overrides,
  };
}

function buildPurchaseRow(overrides = {}) {
  return {
    id: 10,
    raffle_id: 1,
    buyer_name: 'Maria Silva',
    buyer_email: 'maria@email.com',
    quantity: 3,
    total_amount: '30.00',
    created_at: new Date('2026-07-09T12:34:56Z'),
    ...overrides,
  };
}

module.exports = { buildRaffleRow, buildPurchaseRow };
