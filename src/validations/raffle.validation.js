'use strict';

const { z } = require('zod');

/**
 * Schemas de entrada relacionados a Rifas.
 * Mantidos separados dos controllers para respeitar a separação de
 * responsabilidades: aqui vive apenas a definição da forma dos dados.
 */

const listRafflesSchema = {
  query: z.object({
    // Filtro opcional por status; se ausente, lista todas.
    status: z.enum(['DISPONIVEL', 'ENCERRADA']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
};

const raffleIdParamSchema = {
  params: z.object({
    id: z.coerce.number().int().positive({ message: 'id deve ser um inteiro positivo.' }),
  }),
};

/**
 * Criação de rifa (ação de administrador). A validação de formato fica
 * aqui; os invariantes de domínio (preço > 0, data futura) são reforçados
 * no service. O teto de `totalNumbers` também mantém a grade de números
 * do frontend utilizável.
 */
const createRaffleSchema = {
  body: z.object({
    title: z.string().trim().min(1, 'title é obrigatório.').max(160),
    description: z.string().trim().max(2000).optional().default(''),
    unitPrice: z.coerce.number().positive('unitPrice deve ser maior que zero.'),
    totalNumbers: z.coerce
      .number()
      .int()
      .min(2, 'A rifa deve ter ao menos 2 números.')
      .max(10000, 'Máximo de 10000 números por rifa.'),
    // Opcional; quando enviada, o service exige que seja futura.
    drawDate: z.coerce.date().optional(),
  }),
};

module.exports = { listRafflesSchema, raffleIdParamSchema, createRaffleSchema };
