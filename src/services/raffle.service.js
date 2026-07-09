'use strict';

const raffleRepositoryDefault = require('../repositories/raffle.repository');
const { NotFoundError, BusinessRuleError } = require('../errors/AppError');
const { toRaffleResponse } = require('./raffle.presenter');

/**
 * Service de Rifas.
 *
 * Implementado como uma factory que recebe suas dependências
 * (repositório) por parâmetro — Inversão de Dependência (o "D" de
 * SOLID). O service depende de uma abstração (contrato do repositório),
 * não de um módulo concreto, o que facilita substituição e testes.
 *
 * @param {{ raffleRepository?: typeof raffleRepositoryDefault }} deps
 */
function createRaffleService({ raffleRepository = raffleRepositoryDefault } = {}) {
  /**
   * Cria uma nova rifa aplicando as regras de negócio.
   *
   * A validação de *formato* (tipos, presença) é feita na borda (Zod);
   * aqui garantimos os *invariantes de domínio* que não são meramente
   * sintáticos: preço positivo e quantidade mínima de números. Assim o
   * caso de uso é seguro mesmo se chamado por outro cliente que não a API.
   */
  async function createRaffle({ title, description, unitPrice, totalNumbers, drawDate }) {
    if (unitPrice <= 0) {
      throw new BusinessRuleError('O valor por número deve ser maior que zero.', 'INVALID_UNIT_PRICE');
    }
    if (!Number.isInteger(totalNumbers) || totalNumbers < 2) {
      throw new BusinessRuleError('A rifa deve ter ao menos 2 números.', 'INVALID_TOTAL_NUMBERS');
    }
    if (drawDate && new Date(drawDate) <= new Date()) {
      throw new BusinessRuleError('A data do sorteio deve ser futura.', 'INVALID_DRAW_DATE');
    }

    const created = await raffleRepository.create({
      title,
      description,
      unitPrice,
      totalNumbers,
      drawDate,
    });
    return toRaffleResponse(created);
  }

  async function listRaffles({ status, page, limit }) {
    const offset = (page - 1) * limit;
    const [items, total] = await Promise.all([
      raffleRepository.findAll({ status, limit, offset }),
      raffleRepository.count({ status }),
    ]);

    return {
      data: items.map(toRaffleResponse),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async function getRaffleById(id) {
    const raffle = await raffleRepository.findById(id);
    if (!raffle) {
      throw new NotFoundError(`Rifa ${id} não encontrada.`, 'RAFFLE_NOT_FOUND');
    }
    return toRaffleResponse(raffle);
  }

  return { createRaffle, listRaffles, getRaffleById };
}

module.exports = { createRaffleService };
