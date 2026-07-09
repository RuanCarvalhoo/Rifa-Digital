'use strict';

const { createApp } = require('./app');
const { env } = require('./config/env');
const { pool } = require('./config/database');

const app = createApp();

const server = app.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`[server] Rifinha Digital API ouvindo na porta ${env.port} (${env.nodeEnv})`);
});

/**
 * Encerramento gracioso: ao receber SIGINT/SIGTERM, paramos de aceitar
 * novas conexões e fechamos o pool do banco, evitando conexões órfãs.
 */
function shutdown(signal) {
  // eslint-disable-next-line no-console
  console.log(`[server] Recebido ${signal}, encerrando...`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

['SIGINT', 'SIGTERM'].forEach((sig) => process.on(sig, () => shutdown(sig)));

module.exports = { server };
