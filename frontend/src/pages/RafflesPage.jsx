import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { Spinner, ErrorState, Empty, StatusBadge, money, formatDate } from '../components/ui.jsx';

export default function RafflesPage() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ loading: true, error: null, data: null });

  function load() {
    setState({ loading: true, error: null, data: null });
    api
      .listRaffles({ status: status || undefined, page, limit: 12 })
      .then((res) => setState({ loading: false, error: null, data: res }))
      .catch((err) => setState({ loading: false, error: err, data: null }));
  }

  useEffect(load, [status, page]);

  const pagination = state.data?.pagination;

  return (
    <section>
      <div className="page-head">
        <h1>Rifas</h1>
        <div className="filters">
          <label>
            Status:{' '}
            <select
              value={status}
              onChange={(e) => {
                setPage(1);
                setStatus(e.target.value);
              }}
            >
              <option value="">Todas</option>
              <option value="DISPONIVEL">Disponíveis</option>
              <option value="ENCERRADA">Encerradas</option>
            </select>
          </label>
        </div>
      </div>

      {state.loading && <Spinner />}
      {state.error && <ErrorState error={state.error} onRetry={load} />}

      {state.data && (
        <>
          {state.data.data.length === 0 ? (
            <Empty>Nenhuma rifa encontrada.</Empty>
          ) : (
            <div className="grid">
              {state.data.data.map((raffle) => (
                <Link key={raffle.id} to={`/rifas/${raffle.id}`} className="card">
                  <div className="card__head">
                    <h3>{raffle.title}</h3>
                    <StatusBadge status={raffle.status} />
                  </div>
                  <p className="card__desc">{raffle.description}</p>
                  <dl className="card__meta">
                    <div>
                      <dt>Valor</dt>
                      <dd>{money(raffle.unitPrice)}</dd>
                    </div>
                    <div>
                      <dt>Disponíveis</dt>
                      <dd>
                        {raffle.availableNumbers} / {raffle.totalNumbers}
                      </dd>
                    </div>
                    <div>
                      <dt>Sorteio</dt>
                      <dd>{formatDate(raffle.drawDate)}</dd>
                    </div>
                  </dl>
                  <Progress sold={raffle.soldNumbers} total={raffle.totalNumbers} />
                </Link>
              ))}
            </div>
          )}

          {pagination && pagination.totalPages > 1 && (
            <Pager
              page={pagination.page}
              totalPages={pagination.totalPages}
              onChange={setPage}
            />
          )}
        </>
      )}
    </section>
  );
}

function Progress({ sold, total }) {
  const pct = total ? Math.round((sold / total) * 100) : 0;
  return (
    <div className="progress" title={`${pct}% vendidos`}>
      <div className="progress__bar" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Pager({ page, totalPages, onChange }) {
  return (
    <div className="pager">
      <button className="btn btn--ghost" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        ← Anterior
      </button>
      <span>
        Página {page} de {totalPages}
      </span>
      <button
        className="btn btn--ghost"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        Próxima →
      </button>
    </div>
  );
}
