'use strict';

const { createRaffleService } = require('../services/raffle.service');

/**
 * Controller de Rifas.
 *
 * Responsabilidade única: adaptar HTTP <-> domínio. Extrai dados já
 * validados de `req`, chama o service e formata a resposta. Nenhuma
 * regra de negócio vive aqui. Também é uma factory, recebendo o service
 * por injeção (DIP + testabilidade).
 */
function createRaffleController({ raffleService = createRaffleService() } = {}) {
  async function list(req, res) {
    const { status, page, limit } = req.query;
    const result = await raffleService.listRaffles({ status, page, limit });
    res.status(200).json(result);
  }

  async function getById(req, res) {
    const raffle = await raffleService.getRaffleById(req.params.id);
    res.status(200).json({ data: raffle });
  }

  return { list, getById };
}

module.exports = { createRaffleController };
