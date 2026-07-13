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
   * Efetua a compra de uma QUANTIDADE de números de uma rifa. O comprador
   * não escolhe os números: eles são sorteados aleatoriamente entre os
   * disponíveis, garantindo que cada número pertença a uma única pessoa e
   * que nunca haja repetição.
   *
   * Fluxo dentro da transação:
   *  1. Trava a rifa (SELECT ... FOR UPDATE) para serializar concorrência.
   *  2. Verifica existência e se está DISPONIVEL (e não expirada).
   *  3. Valida que a quantidade pedida não excede a disponível.
   *  4. Sorteia `quantity` números ainda disponíveis (sem repetição).
   *  5. Cria a compra e insere os tickets (UNIQUE garante no banco).
   *  6. Atualiza vendidos e encerra a rifa se esgotou.
   */
  async function purchaseNumbers({ raffleId, buyerName, buyerEmail, quantity }) {
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

      // Regra: não se pode comprar mais do que existe disponível.
      // Ex.: 30 números disponíveis => impossível comprar 31.
      const available = totalNumbers - Number(raffle.sold_numbers);
      if (quantity > available) {
        throw new BusinessRuleError(
          `Quantidade solicitada (${quantity}) excede a disponível (${available}).`,
          'INSUFFICIENT_AVAILABILITY',
          { requested: quantity, available }
        );
      }

      // Sorteia os números entre os disponíveis. Como a rifa está travada
      // (FOR UPDATE), o conjunto de disponíveis é consistente e não colide
      // com compras concorrentes na mesma rifa.
      const numbers = await ticketRepository.pickRandomAvailable(
        raffleId,
        totalNumbers,
        quantity,
        client
      );

      // Salvaguarda: sob condições normais o passo anterior já garante a
      // quantidade (a checagem de disponibilidade acontece com a rifa
      // travada). Se ainda assim faltar, aborta sem persistir nada.
      if (numbers.length < quantity) {
        throw new ConflictError(
          'Não foi possível reservar todos os números solicitados. Tente novamente.',
          'ALLOCATION_FAILED',
          { requested: quantity, allocated: numbers.length }
        );
      }

      const unitPrice = Number(raffle.unit_price);
      const totalAmount = Number((unitPrice * quantity).toFixed(2));

      const purchase = await purchaseRepository.create(
        {
          raffleId,
          buyerName,
          buyerEmail,
          quantity,
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

      await raffleRepository.incrementSoldAndMaybeClose(raffleId, quantity, client);

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
