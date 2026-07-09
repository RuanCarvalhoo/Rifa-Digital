'use strict';

const { Router } = require('express');
const { createPurchaseController } = require('../controllers/purchase.controller');
const { asyncHandler } = require('../middlewares/asyncHandler');
const { validate } = require('../middlewares/validate');
const {
  listPurchasesSchema,
  purchaseIdParamSchema,
} = require('../validations/purchase.validation');

const router = Router();
const purchaseController = createPurchaseController();

// GET /api/purchases — consultar compras (filtro por e-mail e/ou rifa).
router.get('/', validate(listPurchasesSchema), asyncHandler(purchaseController.list));

// GET /api/purchases/:id — detalhar uma compra (inclui os números).
router.get('/:id', validate(purchaseIdParamSchema), asyncHandler(purchaseController.getById));

module.exports = router;
