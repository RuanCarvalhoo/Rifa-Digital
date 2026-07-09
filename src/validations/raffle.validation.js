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

module.exports = { listRafflesSchema, raffleIdParamSchema };
