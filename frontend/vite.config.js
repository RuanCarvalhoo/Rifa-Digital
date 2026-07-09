import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// A API não habilita CORS, então em desenvolvimento usamos um proxy:
// tudo que começa com /api é encaminhado para o backend Express.
// Ajuste o `target` caso a API rode em outra porta/host.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
});
