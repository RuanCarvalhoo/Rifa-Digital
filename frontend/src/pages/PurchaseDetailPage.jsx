import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { Spinner, ErrorState, money, formatDate } from '../components/ui.jsx';

export default function PurchaseDetailPage() {
  const { id } = useParams();
  const [state, setState] = useState({ loading: true, error: null, purchase: null });

  function load() {
    setState({ loading: true, error: null, purchase: null });
    api
      .getPurchase(id)
      .then((res) => setState({ loading: false, error: null, purchase: res.data }))
      .catch((err) => setState({ loading: false, error: err, purchase: null }));
  }

  useEffect(load, [id]);

  if (state.loading) return <Spinner />;
  if (state.error) return <ErrorState error={state.error} onRetry={load} />;

  const p = state.purchase;
  if (!p) return null;

  return (
    <section className="detail">
      <Link to="/compras" className="back">← Voltar às compras</Link>

      <div className="confirm">
        <span className="confirm__icon">✓</span>
        <h1>Compra #{p.id} confirmada</h1>
      </div>

      <dl className="stats">
        <div><dt>Comprador</dt><dd>{p.buyerName}</dd></div>
        <div><dt>E-mail</dt><dd>{p.buyerEmail}</dd></div>
        <div><dt>Rifa</dt><dd>#{p.raffleId}</dd></div>
        <div><dt>Quantidade</dt><dd>{p.quantity}</dd></div>
        <div><dt>Total pago</dt><dd>{money(p.totalAmount)}</dd></div>
        <div><dt>Data</dt><dd>{formatDate(p.createdAt)}</dd></div>
      </dl>

      {Array.isArray(p.numbers) && (
        <>
          <h2>Seus números</h2>
          <p className="chips">
            {p.numbers.map((n) => (
              <span key={n} className="chip chip--big">{n}</span>
            ))}
          </p>
        </>
      )}
    </section>
  );
}
