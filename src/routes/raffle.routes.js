'use strict';

const { Router } = require('express');
const { createRaffleController } = require('../controllers/raffle.controller');
const { createPurchaseController } = require('../controllers/purchase.controller');
const { asyncHandler } = require('../middlewares/asyncHandler');
const { validate } = require('../middlewares/validate');
const { listRafflesSchema, raffleIdParamSchema } = require('../validations/raffle.validation');
const { createPurchaseSchema } = require('../validations/purchase.validation');

const router = Router();
const raffleController = createRaffleController();
const purchaseController = createPurchaseController();

// GET /api/raffles — listar rifas (com filtro por status e paginação).
router.get('/', validate(listRafflesSchema), asyncHandler(raffleController.list));

// GET /api/raffles/:id — buscar uma rifa.
router.get('/:id', validate(raffleIdParamSchema), asyncHandler(raffleController.getById));

// POST /api/raffles/:raffleId/purchases — comprar números de uma rifa.
// A compra é modelada como sub-recurso da rifa (relação de composição),
// deixando a URL semanticamente clara.
router.post(
  '/:raffleId/purchases',
  validate(createPurchaseSchema),
  asyncHandler(purchaseController.create)
);

module.exports = router;
