import { useEffect, useMemo, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { Spinner, ErrorState, StatusBadge, money, formatDate } from '../components/ui.jsx';

export default function RaffleDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [state, setState] = useState({ loading: true, error: null, raffle: null });
  const [selected, setSelected] = useState(() => new Set());
  const [taken, setTaken] = useState(() => new Set()); // números recusados pela API
  const [buyerName, setBuyerName] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);

  function load() {
    setState({ loading: true, error: null, raffle: null });
    api
      .getRaffle(id)
      .then((res) => setState({ loading: false, error: null, raffle: res.data }))
      .catch((err) => setState({ loading: false, error: err, raffle: null }));
  }

  useEffect(load, [id]);

  const raffle = state.raffle;
  const available = raffle ? raffle.status === 'DISPONIVEL' && raffle.availableNumbers > 0 : false;

  const total = useMemo(
    () => (selected.size * (Number(raffle?.unitPrice) || 0)),
    [selected, raffle]
  );

  function toggle(n) {
    if (!available) return;
    setFeedback(null);
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(n) ? next.delete(n) : next.add(n);
      return next;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFeedback(null);
    if (selected.size === 0) {
      setFeedback({ type: 'error', message: 'Selecione ao menos um número.' });
      return;
    }
    setSubmitting(true);
    try {
      const numbers = [...selected].sort((a, b) => a - b);
      const res = await api.createPurchase(raffle.id, { buyerName, buyerEmail, numbers });
      navigate(`/compras/${res.data.id}`);
    } catch (err) {
      // Se a API devolveu quais números já foram vendidos, destacamos no grid.
      const conflict = err.details?.taken || err.details?.outOfRange;
      if (Array.isArray(conflict)) {
        setTaken((prev) => new Set([...prev, ...conflict]));
      }
      setFeedback({ type: 'error', message: err.message });
      setSubmitting(false);
    }
  }

  if (state.loading) return <Spinner />;
  if (state.error) return <ErrorState error={state.error} onRetry={load} />;
  if (!raffle) return null;

  return (
    <section className="detail">
      <Link to="/" className="back">← Voltar às rifas</Link>

      <div className="detail__head">
        <div>
          <h1>{raffle.title}</h1>
          <p className="muted">{raffle.description}</p>
        </div>
        <StatusBadge status={raffle.status} />
      </div>

      <dl className="stats">
        <div><dt>Valor por número</dt><dd>{money(raffle.unitPrice)}</dd></div>
        <div><dt>Disponíveis</dt><dd>{raffle.availableNumbers} / {raffle.totalNumbers}</dd></div>
        <div><dt>Vendidos</dt><dd>{raffle.soldNumbers}</dd></div>
        <div><dt>Sorteio</dt><dd>{formatDate(raffle.drawDate)}</dd></div>
      </dl>

      {!available && (
        <p className="notice">
          Esta rifa não está disponível para compra no momento.
        </p>
      )}

      <div className="detail__body">
        <div>
          <h2>Escolha seus números</h2>
          <p className="muted small">
            A disponibilidade final é confirmada no momento da compra. Números em
            vermelho já foram vendidos.
          </p>
          <div className="numbers">
            {Array.from({ length: raffle.totalNumbers }, (_, i) => i + 1).map((n) => {
              const isTaken = taken.has(n);
              const isSel = selected.has(n);
              return (
                <button
                  type="button"
                  key={n}
                  className={
                    'num' + (isSel ? ' num--sel' : '') + (isTaken ? ' num--taken' : '')
                  }
                  disabled={!available || isTaken}
                  onClick={() => toggle(n)}
                >
                  {n}
                </button>
              );
            })}
          </div>
        </div>

        <aside className="checkout">
          <h2>Resumo</h2>
          <p>
            <strong>{selected.size}</strong> número(s) selecionado(s)
          </p>
          {selected.size > 0 && (
            <p className="chips">
              {[...selected].sort((a, b) => a - b).map((n) => (
                <span key={n} className="chip">{n}</span>
              ))}
            </p>
          )}
          <p className="total">Total: <strong>{money(total)}</strong></p>

          <form onSubmit={handleSubmit} className="form">
            <label>
              Seu nome
              <input
                type="text"
                value={buyerName}
                maxLength={120}
                required
                onChange={(e) => setBuyerName(e.target.value)}
                placeholder="Maria Silva"
              />
            </label>
            <label>
              Seu e-mail
              <input
                type="email"
                value={buyerEmail}
                required
                onChange={(e) => setBuyerEmail(e.target.value)}
                placeholder="maria@email.com"
              />
            </label>

            {feedback && (
              <p className={`form__msg form__msg--${feedback.type}`}>{feedback.message}</p>
            )}

            <button
              type="submit"
              className="btn btn--primary"
              disabled={!available || submitting}
            >
              {submitting ? 'Processando…' : `Comprar (${money(total)})`}
            </button>
          </form>
        </aside>
      </div>
    </section>
  );
}
