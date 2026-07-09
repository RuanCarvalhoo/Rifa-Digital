'use strict';

const { createRaffleService } = require('../../src/services/raffle.service');
const { buildRaffleRow } = require('../helpers/factories');

/**
 * TESTES UNITÁRIOS — Service de Rifas (criação de rifa).
 *
 * O service é isolado do banco por meio de um repositório MOCK,
 * injetado pela factory (Dependency Injection). Assim testamos apenas
 * a REGRA DE NEGÓCIO, sem tocar em I/O — testes rápidos e determinísticos,
 * base do ciclo TDD (red → green → refactor).
 */
describe('RaffleService.createRaffle', () => {
  /** Cria um repositório mock e o service já com ele injetado. */
  function makeSut(repoOverrides = {}) {
    const raffleRepository = {
      create: jest.fn(async (data) =>
        buildRaffleRow({
          title: data.title,
          description: data.description,
          unit_price: data.unitPrice.toFixed(2),
          total_numbers: data.totalNumbers,
          draw_date: data.drawDate ?? null,
        })
      ),
      ...repoOverrides,
    };
    const service = createRaffleService({ raffleRepository });
    return { service, raffleRepository };
  }

  const validInput = {
    title: 'iPhone 15 Pro',
    description: 'Sorteio de um iPhone.',
    unitPrice: 10,
    totalNumbers: 100,
    drawDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  };

  it('cria a rifa e retorna o contrato público (camelCase, campos derivados)', async () => {
    const { service, raffleRepository } = makeSut();

    const result = await service.createRaffle(validInput);

    // Persistência foi chamada exatamente uma vez com os dados corretos.
    expect(raffleRepository.create).toHaveBeenCalledTimes(1);
    expect(raffleRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'iPhone 15 Pro', unitPrice: 10, totalNumbers: 100 })
    );

    // A saída é o DTO da API: novos campos derivados e tipos corretos.
    expect(result).toMatchObject({
      title: 'iPhone 15 Pro',
      unitPrice: 10,
      totalNumbers: 100,
      soldNumbers: 0,
      availableNumbers: 100,
      status: 'DISPONIVEL',
    });
  });

  it('rejeita valor por número menor ou igual a zero (INVALID_UNIT_PRICE)', async () => {
    const { service, raffleRepository } = makeSut();

    await expect(service.createRaffle({ ...validInput, unitPrice: 0 })).rejects.toMatchObject({
      code: 'INVALID_UNIT_PRICE',
      statusCode: 422,
    });
    // Regra de negócio barra ANTES de tocar o repositório.
    expect(raffleRepository.create).not.toHaveBeenCalled();
  });

  it('rejeita rifa com menos de 2 números (INVALID_TOTAL_NUMBERS)', async () => {
    const { service, raffleRepository } = makeSut();

    await expect(service.createRaffle({ ...validInput, totalNumbers: 1 })).rejects.toMatchObject({
      code: 'INVALID_TOTAL_NUMBERS',
    });
    expect(raffleRepository.create).not.toHaveBeenCalled();
  });

  it('rejeita data de sorteio no passado (INVALID_DRAW_DATE)', async () => {
    const { service } = makeSut();
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);

    await expect(
      service.createRaffle({ ...validInput, drawDate: pastDate })
    ).rejects.toMatchObject({ code: 'INVALID_DRAW_DATE' });
  });
});

describe('RaffleService.listRaffles / getRaffleById', () => {
  it('lista rifas com metadados de paginação corretos', async () => {
    const raffleRepository = {
      findAll: jest.fn(async () => [buildRaffleRow()]),
      count: jest.fn(async () => 1),
    };
    const service = createRaffleService({ raffleRepository });

    const result = await service.listRaffles({ status: undefined, page: 1, limit: 20 });

    // offset = (page - 1) * limit
    expect(raffleRepository.findAll).toHaveBeenCalledWith({
      status: undefined,
      limit: 20,
      offset: 0,
    });
    expect(result.pagination).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
    expect(result.data[0]).toMatchObject({ id: 1, availableNumbers: 100 });
  });

  it('retorna a rifa quando encontrada', async () => {
    const raffleRepository = { findById: jest.fn(async () => buildRaffleRow()) };
    const service = createRaffleService({ raffleRepository });

    await expect(service.getRaffleById(1)).resolves.toMatchObject({ id: 1 });
  });

  it('lança 404 quando a rifa não existe', async () => {
    const raffleRepository = { findById: jest.fn(async () => null) };
    const service = createRaffleService({ raffleRepository });

    await expect(service.getRaffleById(999)).rejects.toMatchObject({
      code: 'RAFFLE_NOT_FOUND',
      statusCode: 404,
    });
  });
});
