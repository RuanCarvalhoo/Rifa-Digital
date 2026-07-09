'use strict';

require('dotenv').config();

/**
 * Centraliza a leitura e validação das variáveis de ambiente.
 * Falhar cedo (fail-fast) na inicialização é preferível a descobrir
 * uma configuração ausente somente em tempo de execução.
 */
function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return value;
}

const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3000),
  database: {
    // DATABASE_URL tem prioridade; caso contrário monta a conexão pelas partes.
    connectionString: process.env.DATABASE_URL,
    host: process.env.PGHOST ?? 'localhost',
    port: Number(process.env.PGPORT ?? 5432),
    user: process.env.PGUSER ?? 'postgres',
    password: process.env.PGPASSWORD ?? 'postgres',
    database: process.env.PGDATABASE ?? 'rifinha',
  },
};

module.exports = { env, required };
