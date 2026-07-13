'use strict';

const { createPurchaseService } = require('../services/purchase.service');

/**
 * Controller de Compras.
 */
function createPurchaseController({ purchaseService = createPurchaseService() } = {}) {
  async function create(req, res) {
    const { raffleId } = req.params;
    const { buyerName, buyerEmail, quantity } = req.body;
    const purchase = await purchaseService.purchaseNumbers({
      raffleId,
      buyerName,
      buyerEmail,
      quantity,
    });
    // 201 Created + Location apontando para o recurso criado.
    res
      .status(201)
      .location(`/api/purchases/${purchase.id}`)
      .json({ data: purchase });
  }

  async function getById(req, res) {
    const purchase = await purchaseService.getPurchaseById(req.params.id);
    res.status(200).json({ data: purchase });
  }

  async function list(req, res) {
    const { buyerEmail, raffleId, page, limit } = req.query;
    const result = await purchaseService.listPurchases({ buyerEmail, raffleId, page, limit });
    res.status(200).json(result);
  }

  return { create, getById, list };
}

module.exports = { createPurchaseController };
