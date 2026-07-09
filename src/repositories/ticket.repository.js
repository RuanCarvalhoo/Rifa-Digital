'use strict';

const db = require('../config/database');

/**
 * Repositório de Cotas (tickets/números).
 *
 * A tabela `tickets` possui restrição UNIQUE (raffle_id, number), que é
 * a garantia definitiva contra números duplicados no nível do banco —
 * mesmo sob concorrência, dois clientes não conseguem inserir o mesmo
 * número para a mesma rifa.
 */

function runner(client) {
  return client ?? db;
}

/**
 * Retorna, dentre os números informados, quais já estão vendidos.
 * Usado para dar uma mensagem de erro clara ANTES de tentar inserir.
 */
async function findTakenNumbers(raffleId, numbers, client) {
  const sql = `
    SELECT number
    FROM tickets
    WHERE raffle_id = $1 AND number = ANY($2::int[])
  `;
  const { rows } = await runner(client).query(sql, [raffleId, numbers]);
  return rows.map((r) => r.number);
}

/**
 * Insere em lote os tickets de uma compra.
 * Usa unnest para inserir todos os números numa única query eficiente.
 * Se algum número já existir, a violação de UNIQUE (23505) é lançada e
 * capturada pela transação/handler.
 */
async function insertMany(raffleId, purchaseId, numbers, client) {
  const sql = `
    INSERT INTO tickets (raffle_id, purchase_id, number)
    SELECT $1, $2, unnest($3::int[])
    RETURNING id, number
  `;
  const { rows } = await runner(client).query(sql, [raffleId, purchaseId, numbers]);
  return rows;
}

async function findByPurchaseId(purchaseId, client) {
  const sql = `
    SELECT number
    FROM tickets
    WHERE purchase_id = $1
    ORDER BY number ASC
  `;
  const { rows } = await runner(client).query(sql, [purchaseId]);
  return rows.map((r) => r.number);
}

module.exports = { findTakenNumbers, insertMany, findByPurchaseId };
