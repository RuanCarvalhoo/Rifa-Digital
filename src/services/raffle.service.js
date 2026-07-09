'use strict';

const raffleRepositoryDefault = require('../repositories/raffle.repository');
const { NotFoundError } = require('../errors/AppError');
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

  return { listRaffles, getRaffleById };
}

module.exports = { createRaffleService };
