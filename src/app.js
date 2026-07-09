'use strict';

const express = require('express');
const routes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middlewares/errorHandler');

/**
 * Monta a aplicação Express (sem iniciar o servidor).
 *
 * Separar `app` de `server` é uma boa prática: permite reutilizar a
 * aplicação em testes de integração (supertest) sem abrir uma porta,
 * e mantém a responsabilidade de bootstrap isolada em server.js.
 */
function createApp() {
  const app = express();

  // Parsers e limites. O limite protege contra payloads abusivos.
  app.use(express.json({ limit: '100kb' }));

  // Todas as rotas de negócio ficam sob o prefixo /api (versionável).
  app.use('/api', routes);

  // 404 para rotas não mapeadas + error handler central (sempre por último).
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
