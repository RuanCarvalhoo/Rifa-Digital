// Cliente HTTP fino em cima de fetch. Centraliza:
//  - a base da API (/api, resolvida pelo proxy do Vite em dev);
//  - o parse de JSON;
//  - a conversão do envelope de erro da API ({ error: { code, message } })
//    em uma Error com `.code` e `.details`, para a UI tratar de forma amigável.

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

export class ApiError extends Error {
  constructor(message, { code, status, details } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

async function request(path, { method = 'GET', body, signal } = {}) {
  let response;
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError('Não foi possível conectar à API. Ela está rodando?', {
      code: 'NETWORK_ERROR',
    });
  }

  // 204 ou corpo vazio.
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = payload?.error ?? {};
    throw new ApiError(error.message || `Erro ${response.status}`, {
      code: error.code,
      status: response.status,
      details: error.details,
    });
  }

  return payload;
}

// Constrói query string ignorando valores vazios/undefined.
function qs(params) {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== ''
  );
  if (entries.length === 0) return '';
  return '?' + new URLSearchParams(entries).toString();
}

export const api = {
  listRaffles: ({ status, page, limit } = {}) =>
    request(`/raffles${qs({ status, page, limit })}`),

  getRaffle: (id) => request(`/raffles/${id}`),

  // --- Admin ---------------------------------------------------------------
  createRaffle: ({ title, description, unitPrice, totalNumbers, drawDate }) =>
    request('/raffles', {
      method: 'POST',
      body: { title, description, unitPrice, totalNumbers, drawDate },
    }),

  drawWinner: (raffleId) => request(`/raffles/${raffleId}/draw`, { method: 'POST' }),

  // --- Compra (simulada) ---------------------------------------------------
  // O comprador informa apenas a QUANTIDADE; os números são sorteados no
  // servidor entre os disponíveis.
  createPurchase: (raffleId, { buyerName, buyerEmail, quantity }) =>
    request(`/raffles/${raffleId}/purchases`, {
      method: 'POST',
      body: { buyerName, buyerEmail, quantity },
    }),

  health: () => request('/health'),
};
