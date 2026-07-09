'use strict';

const { z } = require('zod');

/**
 * Schemas de entrada relacionados a Compras.
 */

const createPurchaseSchema = {
  params: z.object({
    raffleId: z.coerce.number().int().positive(),
  }),
  body: z.object({
    // Identificação simples do comprador. Em um cenário com autenticação,
    // este dado viria do token e não do corpo da requisição.
    buyerName: z.string().trim().min(1, 'buyerName é obrigatório.').max(120),
    buyerEmail: z.string().trim().email('buyerEmail deve ser um e-mail válido.'),
    // Números desejados. Único, positivos, e ao menos um.
    numbers: z
      .array(z.number().int().positive())
      .nonempty('Informe ao menos um número.')
      .max(1000, 'Quantidade de números por compra excede o limite.')
      .refine(
        (arr) => new Set(arr).size === arr.length,
        'Não repita números na mesma compra.'
      ),
  }),
};

const listPurchasesSchema = {
  query: z.object({
    buyerEmail: z.string().trim().email().optional(),
    raffleId: z.coerce.number().int().positive().optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
};

const purchaseIdParamSchema = {
  params: z.object({
    id: z.coerce.number().int().positive(),
  }),
};

module.exports = { createPurchaseSchema, listPurchasesSchema, purchaseIdParamSchema };
