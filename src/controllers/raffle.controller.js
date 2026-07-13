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

  async function create(req, res) {
    const { title, description, unitPrice, totalNumbers, drawDate } = req.body;
    const raffle = await raffleService.createRaffle({
      title,
      description,
      unitPrice,
      totalNumbers,
      drawDate,
    });
    res.status(201).location(`/api/raffles/${raffle.id}`).json({ data: raffle });
  }

  async function draw(req, res) {
    const raffle = await raffleService.drawWinner(req.params.id);
    res.status(200).json({ data: raffle });
  }

  return { list, getById, create, draw };
}

module.exports = { createRaffleController };
