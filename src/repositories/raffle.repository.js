'use strict';

const db = require('../config/database');

/**
 * Repositório de Rifas.
 *
 * Responsabilidade única: traduzir operações de persistência de rifas
 * em SQL. Não contém regra de negócio — apenas acesso a dados.
 *
 * Todos os métodos aceitam um `client` opcional. Quando fornecido
 * (ex.: dentro de uma transação de compra), as queries participam da
 * mesma transação; caso contrário, usam o pool global. Isso permite
 * compor operações atômicas sem acoplar o repositório à transação.
 */

const RAFFLE_COLUMNS = `
  id, title, description, unit_price, total_numbers,
  sold_numbers, draw_date, status, created_at, updated_at
`;

function runner(client) {
  return client ?? db;
}

async function findAll({ status, limit, offset }, client) {
  const conditions = [];
  const values = [];

  if (status) {
    values.push(status);
    conditions.push(`status = $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  values.push(limit, offset);

  const sql = `
    SELECT ${RAFFLE_COLUMNS}
    FROM raffles
    ${where}
    ORDER BY created_at DESC
    LIMIT $${values.length - 1} OFFSET $${values.length}
  `;

  const { rows } = await runner(client).query(sql, values);
  return rows;
}

async function findById(id, client) {
  const sql = `SELECT ${RAFFLE_COLUMNS} FROM raffles WHERE id = $1`;
  const { rows } = await runner(client).query(sql, [id]);
  return rows[0] ?? null;
}

/**
 * Busca a rifa aplicando um lock de linha (FOR UPDATE).
 *
 * Essencial para a compra: ao travar a linha da rifa dentro da
 * transação, serializamos compras concorrentes sobre a mesma rifa,
 * evitando condições de corrida na contagem de vendidos e no
 * encerramento. DEVE ser chamado com um client transacional.
 */
async function findByIdForUpdate(id, client) {
  const sql = `SELECT ${RAFFLE_COLUMNS} FROM raffles WHERE id = $1 FOR UPDATE`;
  const { rows } = await runner(client).query(sql, [id]);
  return rows[0] ?? null;
}

/**
 * Incrementa o total de vendidos e, se necessário, encerra a rifa.
 * Retorna a rifa atualizada.
 */
async function incrementSoldAndMaybeClose(id, quantity, client) {
  const sql = `
    UPDATE raffles
    SET sold_numbers = sold_numbers + $2,
        status = CASE
          WHEN sold_numbers + $2 >= total_numbers THEN 'ENCERRADA'
          ELSE status
        END,
        updated_at = NOW()
    WHERE id = $1
    RETURNING ${RAFFLE_COLUMNS}
  `;
  const { rows } = await runner(client).query(sql, [id, quantity]);
  return rows[0];
}

async function count({ status }, client) {
  const values = [];
  let where = '';
  if (status) {
    values.push(status);
    where = 'WHERE status = $1';
  }
  const { rows } = await runner(client).query(
    `SELECT COUNT(*)::int AS total FROM raffles ${where}`,
    values
  );
  return rows[0].total;
}

module.exports = {
  findAll,
  findById,
  findByIdForUpdate,
  incrementSoldAndMaybeClose,
  count,
};
