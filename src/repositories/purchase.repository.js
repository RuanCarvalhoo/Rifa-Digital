'use strict';

const db = require('../config/database');

/**
 * Repositório de Compras.
 */

const PURCHASE_COLUMNS = `
  id, raffle_id, buyer_name, buyer_email, quantity, total_amount, created_at
`;

function runner(client) {
  return client ?? db;
}

async function create({ raffleId, buyerName, buyerEmail, quantity, totalAmount }, client) {
  const sql = `
    INSERT INTO purchases (raffle_id, buyer_name, buyer_email, quantity, total_amount)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING ${PURCHASE_COLUMNS}
  `;
  const { rows } = await runner(client).query(sql, [
    raffleId,
    buyerName,
    buyerEmail,
    quantity,
    totalAmount,
  ]);
  return rows[0];
}

async function findById(id, client) {
  const sql = `SELECT ${PURCHASE_COLUMNS} FROM purchases WHERE id = $1`;
  const { rows } = await runner(client).query(sql, [id]);
  return rows[0] ?? null;
}

async function findAll({ buyerEmail, raffleId, limit, offset }, client) {
  const conditions = [];
  const values = [];

  if (buyerEmail) {
    values.push(buyerEmail);
    conditions.push(`buyer_email = $${values.length}`);
  }
  if (raffleId) {
    values.push(raffleId);
    conditions.push(`raffle_id = $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  values.push(limit, offset);

  const sql = `
    SELECT ${PURCHASE_COLUMNS}
    FROM purchases
    ${where}
    ORDER BY created_at DESC
    LIMIT $${values.length - 1} OFFSET $${values.length}
  `;
  const { rows } = await runner(client).query(sql, values);
  return rows;
}

async function count({ buyerEmail, raffleId }, client) {
  const conditions = [];
  const values = [];
  if (buyerEmail) {
    values.push(buyerEmail);
    conditions.push(`buyer_email = $${values.length}`);
  }
  if (raffleId) {
    values.push(raffleId);
    conditions.push(`raffle_id = $${values.length}`);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await runner(client).query(
    `SELECT COUNT(*)::int AS total FROM purchases ${where}`,
    values
  );
  return rows[0].total;
}

module.exports = { create, findById, findAll, count };
