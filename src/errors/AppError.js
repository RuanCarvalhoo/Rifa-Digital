'use strict';

/**
 * Erro de aplicação previsível/operacional.
 *
 * Diferencia erros "de negócio" (que devem virar respostas HTTP
 * controladas) de erros inesperados (bugs, falhas de infraestrutura),
 * que devem retornar 500 sem vazar detalhes. A flag `isOperational`
 * permite ao error handler tomar essa decisão.
 */
class AppError extends Error {
  /**
   * @param {string} message  Mensagem legível para o cliente da API.
   * @param {number} statusCode  Código HTTP.
   * @param {string} [code]  Código simbólico estável (ex.: 'RAFFLE_NOT_FOUND').
   * @param {unknown} [details]  Detalhes adicionais (ex.: erros de validação).
   */
  constructor(message, statusCode = 400, code = 'BAD_REQUEST', details = undefined) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Recurso não encontrado.', code = 'NOT_FOUND', details) {
    super(message, 404, code, details);
  }
}

class ValidationError extends AppError {
  constructor(message = 'Dados inválidos.', details, code = 'VALIDATION_ERROR') {
    super(message, 422, code, details);
  }
}

class ConflictError extends AppError {
  constructor(message = 'Conflito de estado.', code = 'CONFLICT', details) {
    super(message, 409, code, details);
  }
}

class BusinessRuleError extends AppError {
  constructor(message = 'Operação não permitida pelas regras de negócio.', code = 'BUSINESS_RULE', details) {
    super(message, 422, code, details);
  }
}

module.exports = {
  AppError,
  NotFoundError,
  ValidationError,
  ConflictError,
  BusinessRuleError,
};
