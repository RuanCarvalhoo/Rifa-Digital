'use strict';

const db = require('../config/database');
const raffleRepositoryDefault = require('../repositories/raffle.repository');
const purchaseRepositoryDefault = require('../repositories/purchase.repository');
const ticketRepositoryDefault = require('../repositories/ticket.repository');
const { toPurchaseResponse } = require('./purchase.presenter');
const {
  NotFoundError,
  BusinessRuleError,
  ConflictError,
} = require('../errors/AppError');

/**
 * Service de Compras — concentra as regras de negócio mais sensíveis:
 * validar disponibilidade, impedir números duplicados e encerrar a
 * rifa quando esgotada. Toda a operação de compra é ATÔMICA.
 *
 * Dependências injetadas (DIP): repositórios e o helper de transação.
 */
function createPurchaseService({
  raffleRepository = raffleRepositoryDefault,
  purchaseRepository = purchaseRepositoryDefault,
  ticketRepository = ticketRepositoryDefault,
  withTransaction = db.withTransaction,
} = {}) {
  /**
   * Efetua a compra de números de uma rifa.
   *
   * Fluxo dentro da transação:
   *  1. Trava a rifa (SELECT ... FOR UPDATE) para serializar concorrência.
   *  2. Verifica existência e se está DISPONIVEL (e não expirada).
   *  3. Valida faixa e disponibilidade dos números pedidos.
   *  4. Verifica números já vendidos (mensagem amigável).
   *  5. Cria a compra, insere os tickets (UNIQUE garante no banco).
   *  6. Atualiza vendidos e encerra a rifa se esgotou.
   */
  async function purchaseNumbers({ raffleId, buyerName, buyerEmail, numbers }) {
    return withTransaction(async (client) => {
      const raffle = await raffleRepository.findByIdForUpdate(raffleId, client);
      if (!raffle) {
        throw new NotFoundError(`Rifa ${raffleId} não encontrada.`, 'RAFFLE_NOT_FOUND');
      }

      // Regra: apenas rifas DISPONIVEL recebem compras.
      const totalNumbers = Number(raffle.total_numbers);
      const isExpired = raffle.draw_date && new Date(raffle.draw_date) <= new Date();
      if (raffle.status !== 'DISPONIVEL' || isExpired) {
        throw new BusinessRuleError(
          'Esta rifa não está disponível para compra.',
          'RAFFLE_NOT_AVAILABLE'
        );
      }

      // Regra: números devem estar dentro da faixa válida [1, totalNumbers].
      const outOfRange = numbers.filter((n) => n < 1 || n > totalNumbers);
      if (outOfRange.length > 0) {
        throw new BusinessRuleError(
          `Números fora da faixa permitida (1..${totalNumbers}): ${outOfRange.join(', ')}.`,
          'NUMBERS_OUT_OF_RANGE',
          { outOfRange }
        );
      }

      // Regra: quantidade não pode exceder a disponível.
      const available = totalNumbers - Number(raffle.sold_numbers);
      if (numbers.length > available) {
        throw new BusinessRuleError(
          `Quantidade solicitada (${numbers.length}) excede a disponível (${available}).`,
          'INSUFFICIENT_AVAILABILITY',
          { requested: numbers.length, available }
        );
      }

      // Regra: impedir números já vendidos (checagem prévia amigável).
      const taken = await ticketRepository.findTakenNumbers(raffleId, numbers, client);
      if (taken.length > 0) {
        throw new ConflictError(
          `Os seguintes números já foram vendidos: ${taken.join(', ')}.`,
          'NUMBERS_ALREADY_TAKEN',
          { taken }
        );
      }

      const unitPrice = Number(raffle.unit_price);
      const totalAmount = Number((unitPrice * numbers.length).toFixed(2));

      const purchase = await purchaseRepository.create(
        {
          raffleId,
          buyerName,
          buyerEmail,
          quantity: numbers.length,
          totalAmount,
        },
        client
      );

      // A restrição UNIQUE(raffle_id, number) é a garantia final contra
      // duplicidade em corridas concorrentes; se violada, o handler
      // converte em 409.
      const inserted = await ticketRepository.insertMany(
        raffleId,
        purchase.id,
        numbers,
        client
      );

      await raffleRepository.incrementSoldAndMaybeClose(raffleId, numbers.length, client);

      const soldNumbers = inserted.map((t) => t.number).sort((a, b) => a - b);
      return toPurchaseResponse(purchase, soldNumbers);
    });
  }

  async function getPurchaseById(id) {
    const purchase = await purchaseRepository.findById(id);
    if (!purchase) {
      throw new NotFoundError(`Compra ${id} não encontrada.`, 'PURCHASE_NOT_FOUND');
    }
    const numbers = await ticketRepository.findByPurchaseId(id);
    return toPurchaseResponse(purchase, numbers);
  }

  async function listPurchases({ buyerEmail, raffleId, page, limit }) {
    const offset = (page - 1) * limit;
    const [items, total] = await Promise.all([
      purchaseRepository.findAll({ buyerEmail, raffleId, limit, offset }),
      purchaseRepository.count({ buyerEmail, raffleId }),
    ]);
    return {
      data: items.map((row) => toPurchaseResponse(row)),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  return { purchaseNumbers, getPurchaseById, listPurchases };
}

module.exports = { createPurchaseService };
