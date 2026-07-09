'use strict';

/**
 * Script de migração mínimo: aplica schema.sql e (opcionalmente)
 * seed.sql. Executado via `npm run migrate` ou `npm run migrate -- --seed`.
 *
 * Para um projeto maior valeria uma ferramenta dedicada (node-pg-migrate,
 * Flyway), com versionamento e rollback. Aqui, um script idempotente
 * (CREATE IF NOT EXISTS) é suficiente e sem dependências extras.
 */
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');

async function run() {
  const shouldSeed = process.argv.includes('--seed');
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

  try {
    await pool.query(schema);
    // eslint-disable-next-line no-console
    console.log('[migrate] Schema aplicado com sucesso.');

    if (shouldSeed) {
      const seed = fs.readFileSync(path.join(__dirname, 'seed.sql'), 'utf8');
      await pool.query(seed);
      // eslint-disable-next-line no-console
      console.log('[migrate] Seed aplicado com sucesso.');
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[migrate] Falha na migração:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

run();
