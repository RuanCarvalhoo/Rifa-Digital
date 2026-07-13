'use strict';

const { createPurchaseService } = require('../../src/services/purchase.service');
const { buildRaffleRow, buildPurchaseRow } = require('../helpers/factories');

/**
 * TESTES UNITÁRIOS — Service de Compras.
 *
 * Cobre os requisitos: compra de números, validação de disponibilidade
 * e impedimento de compra duplicada. Tudo isolado do banco:
 *  - os três repositórios são MOCKados;
 *  - `withTransaction` é substituído por um fake que apenas executa a
 *    função recebida, injetando um "client" fictício. Assim testamos a
 *    orquestração/regra sem precisar de transação real.
 */
describe('PurchaseService.purchaseNumbers', () => {
  function makeSut({ raffle = buildRaffleRow(), picked, repoOverrides = {} } = {}) {
    const fakeClient = { __fake: true };

    const raffleRepository = {
      findByIdForUpdate: jest.fn(async () => raffle),
      incrementSoldAndMaybeClose: jest.fn(async () => raffle),
      ...repoOverrides.raffleRepository,
    };
    const ticketRepository = {
      // Sorteio simulado: por padrão devolve [1..quantity] (o real é aleatório);
      // testes podem forçar um resultado específico via `picked`.
      pickRandomAvailable: jest.fn(async (_r, _t, quantity) =>
        picked ?? Array.from({ length: quantity }, (_, i) => i + 1)
      ),
      insertMany: jest.fn(async (_r, _p, numbers) =>
        numbers.map((n, i) => ({ id: i + 1, number: n }))
      ),
      ...repoOverrides.ticketRepository,
    };
    const purchaseRepository = {
      create: jest.fn(async (data) =>
        buildPurchaseRow({ quantity: data.quantity, total_amount: data.totalAmount.toFixed(2) })
      ),
      ...repoOverrides.purchaseRepository,
    };

    // Fake de transação: executa o callback com o client fictício.
    const withTransaction = jest.fn(async (fn) => fn(fakeClient));

    const service = createPurchaseService({
      raffleRepository,
      purchaseRepository,
      ticketRepository,
      withTransaction,
    });

    return { service, raffleRepository, ticketRepository, purchaseRepository, withTransaction };
  }

  const input = {
    raffleId: 1,
    buyerName: 'Maria Silva',
    buyerEmail: 'maria@email.com',
    quantity: 3,
  };

  // ---- Caminho feliz: compra por quantidade -------------------------------
  it('sorteia a quantidade pedida, calcula o total e persiste na transação', async () => {
    const { service, purchaseRepository, ticketRepository, withTransaction } = makeSut({
      picked: [7, 13, 21],
    });

    const result = await service.purchaseNumbers(input);

    // Rodou dentro de uma transação.
    expect(withTransaction).toHaveBeenCalledTimes(1);

    // Sorteou entre os disponíveis: (raffleId, totalNumbers, quantity, client).
    expect(ticketRepository.pickRandomAvailable).toHaveBeenCalledWith(
      1,
      100,
      3,
      expect.anything()
    );

    // Total = preço unitário (10.00) * 3 números = 30.00.
    expect(purchaseRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ quantity: 3, totalAmount: 30 }),
      expect.anything()
    );

    // Inseriu exatamente os números sorteados.
    expect(ticketRepository.insertMany).toHaveBeenCalledWith(
      1,
      expect.any(Number),
      [7, 13, 21],
      expect.anything()
    );

    expect(result).toMatchObject({ quantity: 3, totalAmount: 30, numbers: [7, 13, 21] });
  });

  it('atualiza a contagem de vendidos (podendo encerrar a rifa)', async () => {
    const { service, raffleRepository } = makeSut();

    await service.purchaseNumbers(input);

    expect(raffleRepository.incrementSoldAndMaybeClose).toHaveBeenCalledWith(
      1,
      3,
      expect.anything()
    );
  });

  // ---- Rifa inexistente ----------------------------------------------------
  it('lança 404 quando a rifa não existe', async () => {
    const { service, raffleRepository } = makeSut({
      repoOverrides: { raffleRepository: { findByIdForUpdate: jest.fn(async () => null) } },
    });

    await expect(service.purchaseNumbers(input)).rejects.toMatchObject({
      code: 'RAFFLE_NOT_FOUND',
      statusCode: 404,
    });
    expect(raffleRepository.incrementSoldAndMaybeClose).not.toHaveBeenCalled?.();
  });

  // ---- Rifa não disponível -------------------------------------------------
  it('impede compra em rifa ENCERRADA (RAFFLE_NOT_AVAILABLE)', async () => {
    const { service } = makeSut({ raffle: buildRaffleRow({ status: 'ENCERRADA' }) });

    await expect(service.purchaseNumbers(input)).rejects.toMatchObject({
      code: 'RAFFLE_NOT_AVAILABLE',
      statusCode: 422,
    });
  });

  it('impede compra em rifa com data de sorteio já expirada', async () => {
    const past = new Date(Date.now() - 60 * 1000);
    const { service } = makeSut({ raffle: buildRaffleRow({ draw_date: past }) });

    await expect(service.purchaseNumbers(input)).rejects.toMatchObject({
      code: 'RAFFLE_NOT_AVAILABLE',
    });
  });

  // ---- Não comprar mais do que o disponível -------------------------------
  it('rejeita quantidade maior que a disponível (INSUFFICIENT_AVAILABILITY)', async () => {
    // total 5, já vendidos 4 => disponível 1; pedindo 2 números.
    const raffle = buildRaffleRow({ total_numbers: 5, sold_numbers: 4 });
    const { service, purchaseRepository, ticketRepository } = makeSut({ raffle });

    await expect(
      service.purchaseNumbers({ ...input, quantity: 2 })
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_AVAILABILITY', statusCode: 422 });

    // Barra ANTES de sortear ou persistir qualquer coisa.
    expect(ticketRepository.pickRandomAvailable).not.toHaveBeenCalled();
    expect(purchaseRepository.create).not.toHaveBeenCalled();
  });

  // ---- Salvaguarda: sorteio devolveu menos que o pedido -------------------
  it('aborta sem persistir se o sorteio não alocou tudo (ALLOCATION_FAILED)', async () => {
    // Pediu 3, mas o sorteio (simulado) só devolveu 1 número.
    const { service, purchaseRepository } = makeSut({ picked: [1] });

    await expect(service.purchaseNumbers(input)).rejects.toMatchObject({
      code: 'ALLOCATION_FAILED',
      statusCode: 409,
    });

    expect(purchaseRepository.create).not.toHaveBeenCalled();
  });
});

describe('PurchaseService — consulta de compras', () => {
  it('getPurchaseById retorna a compra com seus números', async () => {
    const purchaseRepository = { findById: jest.fn(async () => buildPurchaseRow()) };
    const ticketRepository = { findByPurchaseId: jest.fn(async () => [7, 13, 21]) };
    const service = createPurchaseService({ purchaseRepository, ticketRepository });

    const result = await service.getPurchaseById(10);

    expect(result).toMatchObject({ id: 10, numbers: [7, 13, 21] });
  });

  it('getPurchaseById lança 404 quando não existe', async () => {
    const purchaseRepository = { findById: jest.fn(async () => null) };
    const service = createPurchaseService({ purchaseRepository });

    await expect(service.getPurchaseById(999)).rejects.toMatchObject({
      code: 'PURCHASE_NOT_FOUND',
      statusCode: 404,
    });
  });

  it('listPurchases devolve dados e paginação', async () => {
    const purchaseRepository = {
      findAll: jest.fn(async () => [buildPurchaseRow()]),
      count: jest.fn(async () => 1),
    };
    const service = createPurchaseService({ purchaseRepository });

    const result = await service.listPurchases({
      buyerEmail: 'maria@email.com',
      raffleId: undefined,
      page: 1,
      limit: 20,
    });

    expect(purchaseRepository.findAll).toHaveBeenCalledWith({
      buyerEmail: 'maria@email.com',
      raffleId: undefined,
      limit: 20,
      offset: 0,
    });
    expect(result.pagination).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
  });
});
