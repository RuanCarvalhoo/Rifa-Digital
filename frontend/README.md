# Rifinha Digital — Frontend

Interface web em **React + Vite** para a API da Rifinha Digital.

## Funcionalidades

- **Rifas** (`/`): listagem com filtro por status e paginação, barra de progresso de vendidos.
- **Detalhe da rifa** (`/rifas/:id`): seleção interativa de números, resumo com total e formulário de compra.
- **Minhas compras** (`/compras`): consulta de compras por e-mail.
- **Detalhe da compra** (`/compras/:id`): confirmação com os números adquiridos.

## Como rodar

Pré-requisito: a API (backend Express) rodando — por padrão em `http://localhost:3000`.

```bash
cd frontend
npm install
npm run dev
```

Acesse http://localhost:5173.

### Proxy / CORS

A API não habilita CORS. Em desenvolvimento, o Vite faz proxy de tudo que começa
com `/api` para o backend (ver `vite.config.js`). Para apontar para outro host:

```bash
VITE_API_TARGET=http://localhost:3001 npm run dev
```

Em produção (build estático servido em outro domínio), defina `VITE_API_BASE_URL`
com a URL completa da API e habilite CORS no backend.

## Build

```bash
npm run build    # gera dist/
npm run preview  # serve o build localmente
```

## Stack

- React 18 + React Router
- Vite
- `fetch` puro (cliente em `src/api/client.js`), sem dependências extras de dados.
