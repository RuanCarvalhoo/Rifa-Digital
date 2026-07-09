'use strict';

const { ValidationError } = require('../errors/AppError');

/**
 * Middleware genérico de validação baseado em schemas Zod.
 *
 * Recebe um objeto com schemas opcionais para `body`, `params` e `query`.
 * Ao validar com sucesso, substitui a fonte pelo dado já parseado e
 * coagido (ex.: strings viram números), de forma que os controllers
 * recebam dados sempre confiáveis e tipados.
 *
 * Vantagem de centralizar: a camada de validação fica isolada e
 * declarativa, mantendo controllers e services livres de checagens
 * defensivas repetitivas (Single Responsibility).
 *
 * @param {{ body?: import('zod').ZodTypeAny, params?: import('zod').ZodTypeAny, query?: import('zod').ZodTypeAny }} schemas
 */
function validate(schemas) {
  return function validateMiddleware(req, _res, next) {
    try {
      for (const source of ['body', 'params', 'query']) {
        const schema = schemas[source];
        if (!schema) continue;
        const result = schema.safeParse(req[source]);
        if (!result.success) {
          const details = result.error.issues.map((issue) => ({
            field: issue.path.join('.') || source,
            message: issue.message,
          }));
          throw new ValidationError('Falha na validação dos dados enviados.', details);
        }
        req[source] = result.data;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { validate };
