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
 * Sorteia `quantity` números AINDA DISPONÍVEIS da rifa, de forma
 * aleatória e sem repetição. A seleção é feita no próprio banco:
 * `generate_series(1..total)` gera todos os números possíveis, excluímos
 * os que já têm ticket e `ORDER BY random() LIMIT quantity` escolhe.
 *
 * Deve ser chamado dentro da transação que trava a rifa (FOR UPDATE), de
 * modo que o conjunto de disponíveis seja consistente entre compradores
 * concorrentes. Retorna menos que `quantity` apenas se não houver
 * disponibilidade suficiente (o service valida isso antes).
 */
async function pickRandomAvailable(raffleId, totalNumbers, quantity, client) {
  const sql = `
    SELECT n
    FROM generate_series(1, $1::int) AS n
    WHERE NOT EXISTS (
      SELECT 1 FROM tickets t WHERE t.raffle_id = $2 AND t.number = n
    )
    ORDER BY random()
    LIMIT $3::int
  `;
  const { rows } = await runner(client).query(sql, [totalNumbers, raffleId, quantity]);
  return rows.map((r) => r.n);
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

/**
 * Sorteia aleatoriamente UM número já vendido da rifa, trazendo junto os
 * dados do comprador (via JOIN com a compra). Retorna `null` se nenhum
 * número foi vendido ainda. O `ORDER BY random() LIMIT 1` do Postgres dá
 * uma seleção uniforme entre os tickets — suficiente para o sorteio.
 */
async function findRandomSoldTicket(raffleId, client) {
  const sql = `
    SELECT t.number, p.buyer_name, p.buyer_email
    FROM tickets t
    JOIN purchases p ON p.id = t.purchase_id
    WHERE t.raffle_id = $1
    ORDER BY random()
    LIMIT 1
  `;
  const { rows } = await runner(client).query(sql, [raffleId]);
  return rows[0] ?? null;
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

module.exports = {
  pickRandomAvailable,
  insertMany,
  findRandomSoldTicket,
  findByPurchaseId,
};
