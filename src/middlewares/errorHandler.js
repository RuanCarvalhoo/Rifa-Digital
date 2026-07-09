'use strict';

const { AppError } = require('../errors/AppError');
const { env } = require('../config/env');

/**
 * Middleware para rotas não encontradas (404).
 * Deve ser registrado após todas as rotas válidas.
 */
function notFoundHandler(req, res, next) {
  next(new AppError(`Rota não encontrada: ${req.method} ${req.originalUrl}`, 404, 'ROUTE_NOT_FOUND'));
}

/**
 * Error handler central da aplicação (assinatura de 4 argumentos).
 *
 * Estratégia:
 * - Erros operacionais (AppError) → resposta HTTP controlada, com o
 *   status e o código simbólico definidos no domínio.
 * - Violação de UNIQUE do Postgres (código 23505) → 409, pois indica
 *   tentativa de comprar número já vendido em corrida concorrente.
 * - Qualquer outro erro → 500 genérico, sem vazar stack/detalhes em
 *   produção (segurança), mas logado internamente.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
  }

  // Violação de restrição UNIQUE no PostgreSQL.
  if (err && err.code === '23505') {
    return res.status(409).json({
      error: {
        code: 'DUPLICATE_TICKET',
        message: 'Um ou mais números já foram vendidos.',
      },
    });
  }

  // Erro inesperado: logamos internamente e devolvemos 500 opaco.
  // eslint-disable-next-line no-console
  console.error('[errorHandler] Erro não tratado:', err);

  return res.status(500).json({
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Ocorreu um erro interno inesperado.',
      ...(env.nodeEnv !== 'production' ? { debug: err.message } : {}),
    },
  });
}

module.exports = { notFoundHandler, errorHandler };
