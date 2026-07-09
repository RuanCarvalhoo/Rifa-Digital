'use strict';

const { Pool } = require('pg');
const { env } = require('./env');

/**
 * Pool único de conexões compartilhado por toda a aplicação.
 *
 * Decisão: usar o driver `pg` diretamente (sem ORM). Para um domínio
 * fortemente transacional como venda de cotas de rifa — onde precisamos
 * de controle fino sobre locks (SELECT ... FOR UPDATE) e transações —
 * o SQL explícito é mais previsível e didático do que a camada de
 * abstração de um ORM. Ver justificativa no README.
 */
const pool = new Pool(
  env.database.connectionString
    ? { connectionString: env.database.connectionString }
    : {
        host: env.database.host,
        port: env.database.port,
        user: env.database.user,
        password: env.database.password,
        database: env.database.database,
      }
);

pool.on('error', (err) => {
  // Erro em cliente ocioso do pool — logamos para observabilidade.
  // Não derrubamos o processo: o pool se recupera abrindo novas conexões.
  // eslint-disable-next-line no-console
  console.error('[database] Erro inesperado em cliente ocioso do pool', err);
});

/**
 * Atalho para queries simples (sem transação).
 */
function query(text, params) {
  return pool.query(text, params);
}

/**
 * Executa uma função dentro de uma transação, com COMMIT/ROLLBACK
 * automáticos. O client transacional é injetado no callback para que
 * todas as queries participem da mesma transação.
 *
 * @template T
 * @param {(client: import('pg').PoolClient) => Promise<T>} fn
 * @returns {Promise<T>}
 */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction };
