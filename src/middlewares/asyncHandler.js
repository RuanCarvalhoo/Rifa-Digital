'use strict';

/**
 * Envolve um handler assíncrono e encaminha qualquer rejeição para o
 * middleware de erro do Express via `next(err)`.
 *
 * Motivo: o Express 4 não captura automaticamente exceções lançadas
 * dentro de funções async. Sem este wrapper, cada controller precisaria
 * de um try/catch repetitivo. Centralizamos isso aqui (DRY).
 *
 * @param {(req, res, next) => Promise<unknown>} fn
 */
function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };
