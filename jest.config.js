'use strict';

/**
 * Configuração do Jest.
 *
 * - testEnvironment 'node': não há DOM; é uma API backend.
 * - Coleta de cobertura focada em src/, excluindo bootstrap e artefatos
 *   de banco (schema/seed/migrate) que são infra e não lógica testável
 *   por unidade.
 * - coverageThreshold define o piso de qualidade: o CI falha se a
 *   cobertura cair abaixo do recomendado (ver README de testes).
 */
module.exports = {
  testEnvironment: 'node',
  clearMocks: true,
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/server.js',
    '!src/database/**',
  ],
  // O gate obrigatório recai sobre a CAMADA DE SERVIÇOS (regra de negócio),
  // que é o alvo dos testes unitários e roda sem banco. Controllers,
  // repositórios e middlewares são cobertos pela suíte de integração
  // (que exige TEST_DATABASE_URL) — por isso não entram no piso obrigatório
  // aqui, evitando que `test:coverage` falhe em máquinas sem PostgreSQL.
  // Ver "Cobertura recomendada" no README de testes.
  coverageThreshold: {
    'src/services/*.service.js': {
      branches: 80,
      functions: 100,
      lines: 90,
      statements: 90,
    },
  },
};
