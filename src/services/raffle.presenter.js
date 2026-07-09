'use strict';

/**
 * Converte uma linha da tabela `raffles` (snake_case, numéricos como
 * string por conta do driver pg) no contrato público da API (camelCase,
 * tipos corretos). Isolar a apresentação evita vazar detalhes do banco
 * para o cliente e centraliza o formato de saída.
 */
function toRaffleResponse(row) {
  if (!row) return null;
  const total = Number(row.total_numbers);
  const sold = Number(row.sold_numbers);
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    unitPrice: Number(row.unit_price),
    totalNumbers: total,
    soldNumbers: sold,
    availableNumbers: total - sold,
    drawDate: row.draw_date,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = { toRaffleResponse };
