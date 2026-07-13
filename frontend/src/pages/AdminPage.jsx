import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import { Spinner, ErrorState, Empty, StatusBadge, money, formatDate } from '../components/ui.jsx';

const EMPTY_FORM = {
  title: '',
  description: '',
  unitPrice: '',
  totalNumbers: '',
  drawDate: '',
};

export default function AdminPage() {
  const [list, setList] = useState({ loading: true, error: null, data: null });
  const [form, setForm] = useState(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState(null);
  const [drawingId, setDrawingId] = useState(null);
  const [drawMsg, setDrawMsg] = useState(null);

  function loadRaffles() {
    setList({ loading: true, error: null, data: null });
    api
      .listRaffles({ limit: 100 })
      .then((res) => setList({ loading: false, error: null, data: res.data }))
      .catch((err) => setList({ loading: false, error: err, data: null }));
  }

  useEffect(loadRaffles, []);

  function updateField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleCreate(e) {
    e.preventDefault();
    setCreateMsg(null);
    setCreating(true);
    try {
      const payload = {
        title: form.title,
        description: form.description,
        unitPrice: Number(form.unitPrice),
        totalNumbers: Number(form.totalNumbers),
        // Só envia a data quando preenchida (o backend exige data futura).
        drawDate: form.drawDate ? new Date(form.drawDate).toISOString() : undefined,
      };
      const res = await api.createRaffle(payload);
      setCreateMsg({ type: 'ok', text: `Rifa "${res.data.title}" criada com sucesso.` });
      setForm(EMPTY_FORM);
      loadRaffles();
    } catch (err) {
      setCreateMsg({ type: 'error', text: err.message });
    } finally {
      setCreating(false);
    }
  }

  async function handleDraw(raffle) {
    setDrawMsg(null);
    setDrawingId(raffle.id);
    try {
      const res = await api.drawWinner(raffle.id);
      const w = res.data.winner;
      setDrawMsg({
        type: 'ok',
        text: `Rifa "${res.data.title}": ganhador é o número ${w.number} (${w.name}).`,
      });
      // Atualiza apenas a rifa sorteada na lista, sem recarregar tudo.
      setList((prev) => ({
        ...prev,
        data: prev.data?.map((r) => (r.id === res.data.id ? res.data : r)),
      }));
    } catch (err) {
      setDrawMsg({ type: 'error', text: err.message });
    } finally {
      setDrawingId(null);
    }
  }

  return (
    <section>
      <div className="page-head">
        <h1>Administração</h1>
      </div>

      <h2>Criar nova rifa</h2>
      <form onSubmit={handleCreate} className="admin-form">
        <div className="admin-form__grid">
          <label>
            Prêmio / título
            <input
              type="text"
              required
              maxLength={160}
              value={form.title}
              onChange={(e) => updateField('title', e.target.value)}
              placeholder="iPhone 15 Pro"
            />
          </label>
          <label>
            Valor por número (R$)
            <input
              type="number"
              required
              min="0.01"
              step="0.01"
              value={form.unitPrice}
              onChange={(e) => updateField('unitPrice', e.target.value)}
              placeholder="10.00"
            />
          </label>
          <label>
            Quantidade de números
            <input
              type="number"
              required
              min="2"
              max="10000"
              step="1"
              value={form.totalNumbers}
              onChange={(e) => updateField('totalNumbers', e.target.value)}
              placeholder="100"
            />
          </label>
          <label>
            Data do sorteio (opcional)
            <input
              type="datetime-local"
              value={form.drawDate}
              onChange={(e) => updateField('drawDate', e.target.value)}
            />
          </label>
          <label className="admin-form__wide">
            Descrição
            <input
              type="text"
              maxLength={2000}
              value={form.description}
              onChange={(e) => updateField('description', e.target.value)}
              placeholder="Detalhes do prêmio e regras."
            />
          </label>
        </div>

        {createMsg && (
          <p className={`form__msg form__msg--${createMsg.type === 'ok' ? 'ok' : 'error'}`}>
            {createMsg.text}
          </p>
        )}

        <button type="submit" className="btn btn--primary" disabled={creating}>
          {creating ? 'Criando…' : 'Criar rifa'}
        </button>
      </form>

      <h2>Rifas &amp; sorteio</h2>
      {drawMsg && (
        <p className={`form__msg form__msg--${drawMsg.type === 'ok' ? 'ok' : 'error'}`}>
          {drawMsg.text}
        </p>
      )}

      {list.loading && <Spinner />}
      {list.error && <ErrorState error={list.error} onRetry={loadRaffles} />}

      {list.data &&
        (list.data.length === 0 ? (
          <Empty>Nenhuma rifa cadastrada. Crie a primeira acima.</Empty>
        ) : (
          <ul className="list">
            {list.data.map((r) => (
              <li key={r.id} className="list__item">
                <div>
                  <Link to={`/rifas/${r.id}`}>
                    <strong>{r.title}</strong>
                  </Link>
                  <div className="list__meta muted small">
                    <StatusBadge status={r.status} />
                    <span>{r.soldNumbers} / {r.totalNumbers} vendidos</span>
                    <span>{money(r.unitPrice)}/nº</span>
                    <span>Sorteio: {formatDate(r.drawDate)}</span>
                  </div>
                </div>

                {r.winner ? (
                  <span className="winner-tag">🏆 Nº {r.winner.number} · {r.winner.name}</span>
                ) : (
                  <button
                    className="btn btn--primary"
                    disabled={drawingId === r.id || r.soldNumbers === 0}
                    title={r.soldNumbers === 0 ? 'Nenhum número vendido ainda' : undefined}
                    onClick={() => handleDraw(r)}
                  >
                    {drawingId === r.id ? 'Sorteando…' : 'Sortear ganhador'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        ))}
    </section>
  );
}
