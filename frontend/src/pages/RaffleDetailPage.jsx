import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { Spinner, ErrorState, StatusBadge, money, formatDate } from '../components/ui.jsx';

export default function RaffleDetailPage() {
  const { id } = useParams();

  const [state, setState] = useState({ loading: true, error: null, raffle: null });
  const [quantity, setQuantity] = useState(1);
  const [buyerName, setBuyerName] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [confirmation, setConfirmation] = useState(null); // compra concluída

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
  const maxQty = raffle ? raffle.availableNumbers : 0;

  const total = useMemo(
    () => quantity * (Number(raffle?.unitPrice) || 0),
    [quantity, raffle]
  );

  // Mantém a quantidade dentro de [1, disponíveis].
  function setQty(value) {
    setFeedback(null);
    const n = Math.floor(Number(value));
    if (Number.isNaN(n)) return setQuantity(1);
    setQuantity(Math.min(Math.max(n, 1), Math.max(maxQty, 1)));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFeedback(null);
    if (quantity < 1) {
      setFeedback({ type: 'error', message: 'Escolha ao menos um número.' });
      return;
    }
    if (quantity > maxQty) {
      setFeedback({ type: 'error', message: `Só há ${maxQty} número(s) disponível(is).` });
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.createPurchase(raffle.id, { buyerName, buyerEmail, quantity });
      // Compra simulada concluída: mostramos os números SORTEADOS pelo
      // servidor. Atualizamos a disponibilidade em segundo plano (sem
      // spinner de página inteira) para não esconder a confirmação.
      setConfirmation(res.data);
      api
        .getRaffle(id)
        .then((r) => setState((s) => ({ ...s, raffle: r.data })))
        .catch(() => {});
    } catch (err) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  function buyAgain() {
    setConfirmation(null);
    setFeedback(null);
    setQuantity(1);
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

      {raffle.winner && (
        <p className="winner-banner">
          🏆 Ganhador sorteado: número <strong>{raffle.winner.number}</strong> —{' '}
          {raffle.winner.name}
        </p>
      )}

      <dl className="stats">
        <div><dt>Valor por número</dt><dd>{money(raffle.unitPrice)}</dd></div>
        <div><dt>Disponíveis</dt><dd>{raffle.availableNumbers} / {raffle.totalNumbers}</dd></div>
        <div><dt>Vendidos</dt><dd>{raffle.soldNumbers}</dd></div>
        <div><dt>Sorteio</dt><dd>{formatDate(raffle.drawDate)}</dd></div>
      </dl>

      {!available && !raffle.winner && (
        <p className="notice">
          Esta rifa não está disponível para compra no momento.
        </p>
      )}

      <div className="buy-panel">
        {confirmation ? (
          <div className="checkout confirm-card">
            <div className="confirm">
              <span className="confirm__icon">✓</span>
              <h2>Compra confirmada</h2>
            </div>
            <p className="muted small">Compra simulada #{confirmation.id}</p>
            <p>Seus números sorteados:</p>
            <p className="chips">
              {confirmation.numbers?.map((n) => (
                <span key={n} className="chip chip--big">{n}</span>
              ))}
            </p>
            <p className="total">Total: <strong>{money(confirmation.totalAmount)}</strong></p>
            <button className="btn btn--ghost" onClick={buyAgain} disabled={!available}>
              Comprar mais números
            </button>
          </div>
        ) : (
          <div className="checkout">
            <h2>Comprar números</h2>
            <p className="muted small">
              Você escolhe apenas a quantidade — os números são sorteados
              automaticamente entre os {raffle.availableNumbers} disponíveis.
            </p>

            <form onSubmit={handleSubmit} className="form">
              <label>
                Quantidade de números
                <div className="stepper">
                  <button
                    type="button"
                    className="btn btn--ghost"
                    disabled={!available || quantity <= 1}
                    onClick={() => setQty(quantity - 1)}
                    aria-label="Diminuir"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={maxQty}
                    step={1}
                    value={quantity}
                    disabled={!available}
                    onChange={(e) => setQty(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn--ghost"
                    disabled={!available || quantity >= maxQty}
                    onClick={() => setQty(quantity + 1)}
                    aria-label="Aumentar"
                  >
                    +
                  </button>
                </div>
              </label>

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

              <p className="total">Total: <strong>{money(total)}</strong></p>

              {feedback && (
                <p className={`form__msg form__msg--${feedback.type}`}>{feedback.message}</p>
              )}

              <button
                type="submit"
                className="btn btn--primary"
                disabled={!available || submitting}
              >
                {submitting ? 'Processando…' : `Comprar ${quantity} número(s) (${money(total)})`}
              </button>
            </form>
          </div>
        )}
      </div>
    </section>
  );
}
