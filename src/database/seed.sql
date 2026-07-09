-- Dados de exemplo para desenvolvimento.
INSERT INTO raffles (title, description, unit_price, total_numbers, draw_date, status)
VALUES
  ('iPhone 15 Pro', 'Sorteio de um iPhone 15 Pro 256GB.', 10.00, 100, NOW() + INTERVAL '30 days', 'DISPONIVEL'),
  ('Vale-compras R$ 500', 'Vale-compras para usar em qualquer loja parceira.', 5.00, 50, NOW() + INTERVAL '15 days', 'DISPONIVEL'),
  ('Cesta Básica', 'Rifa encerrada de exemplo.', 2.00, 20, NOW() - INTERVAL '1 day', 'ENCERRADA')
ON CONFLICT DO NOTHING;
