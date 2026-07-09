'use strict';

const { Router } = require('express');
const raffleRoutes = require('./raffle.routes');
const purchaseRoutes = require('./purchase.routes');

const router = Router();

// Healthcheck simples para readiness/liveness probes.
router.get('/health', (_req, res) => res.status(200).json({ status: 'ok' }));

router.use('/raffles', raffleRoutes);
router.use('/purchases', purchaseRoutes);

module.exports = router;
