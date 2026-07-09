import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { Spinner, ErrorState, Empty, money, formatDate } from '../components/ui.jsx';
import { Pager } from './RafflesPage.jsx';

export default function PurchasesPage() {
  const [email, setEmail] = useState('');
  const [query, setQuery] = useState(null); // e-mail efetivamente buscado
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ loading: false, error: null, data: null });

  function search(targetEmail, targetPage) {
    setState({ loading: true, error: null, data: null });
    api
      .listPurchases({ buyerEmail: targetEmail, page: targetPage, limit: 10 })
      .then((res) => setState({ loading: false, error: null, data: res }))
      .catch((err) => setState({ loading: false, error: err, data: null }));
  }

  function onSubmit(e) {
    e.preventDefault();
    setQuery(email);
    setPage(1);
    search(email, 1);
  }

  function onPage(p) {
    setPage(p);
    search(query, p);
  }

  return (
    <section>
      <div className="page-head">
        <h1>Minhas compras</h1>
      </div>
      <p className="muted">Informe o e-mail usado na compra para consultar seus números.</p>

      <form onSubmit={onSubmit} className="search">
        <input
          type="email"
          required
          placeholder="seu@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button className="btn btn--primary" type="submit">Buscar</button>
      </form>

      {state.loading && <Spinner />}
      {state.error && <ErrorState error={state.error} onRetry={() => search(query, page)} />}

      {state.data && (
        state.data.data.length === 0 ? (
          <Empty>Nenhuma compra encontrada para {query}.</Empty>
        ) : (
          <>
            <ul className="list">
              {state.data.data.map((p) => (
                <li key={p.id}>
                  <Link to={`/compras/${p.id}`} className="list__item">
                    <div>
                      <strong>Compra #{p.id}</strong>
                      <span className="muted"> · {p.buyerName}</span>
                    </div>
                    <div className="list__meta">
                      <span>{p.quantity} número(s)</span>
                      <span>{money(p.totalAmount)}</span>
                      <span className="muted">{formatDate(p.createdAt)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
            {state.data.pagination?.totalPages > 1 && (
              <Pager
                page={state.data.pagination.page}
                totalPages={state.data.pagination.totalPages}
                onChange={onPage}
              />
            )}
          </>
        )
      )}
    </section>
  );
}
