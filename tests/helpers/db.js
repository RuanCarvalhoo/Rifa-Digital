'use strict';

/**
 * Utilitários para os testes de INTEGRAÇÃO.
 *
 * Estratégia:
 * - Usa um banco PostgreSQL DEDICADO a testes, apontado por
 *   TEST_DATABASE_URL. NUNCA reutilizar o banco de desenvolvimento:
 *   os testes truncam tabelas entre casos.
 * - `isDbConfigured()` permite que a suíte de integração seja pulada
 *   com uma mensagem clara quando não há banco disponível (ex.: em uma
 *   máquina sem Postgres), sem quebrar a suíte unitária.
 * - `applySchema()` cria as tabelas a partir do mesmo schema.sql usado
 *   em produção — garantindo que o teste exercite o esquema real.
 */
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const connectionString = process.env.TEST_DATABASE_URL;

function isDbConfigured() {
  return Boolean(connectionString);
}

let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({ connectionString });
  }
  return pool;
}

async function applySchema() {
  const schema = fs.readFileSync(
    path.join(__dirname, '..', '..', 'src', 'database', 'schema.sql'),
    'utf8'
  );
  await getPool().query(schema);
}

async function truncateAll() {
  // RESTART IDENTITY zera as sequências; CASCADE respeita as FKs.
  await getPool().query('TRUNCATE tickets, purchases, raffles RESTART IDENTITY CASCADE');
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

module.exports = { isDbConfigured, getPool, applySchema, truncateAll, closePool };
