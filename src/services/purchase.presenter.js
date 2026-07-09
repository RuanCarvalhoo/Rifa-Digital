'use strict';

/**
 * Converte uma linha de `purchases` (opcionalmente com a lista de
 * números) no contrato público da API.
 */
function toPurchaseResponse(row, numbers) {
  if (!row) return null;
  return {
    id: row.id,
    raffleId: row.raffle_id,
    buyerName: row.buyer_name,
    buyerEmail: row.buyer_email,
    quantity: Number(row.quantity),
    totalAmount: Number(row.total_amount),
    numbers: numbers ?? undefined,
    createdAt: row.created_at,
  };
}

module.exports = { toPurchaseResponse };
