// Pequenos componentes de UI reutilizados pelas páginas.

export function Spinner({ label = 'Carregando…' }) {
  return (
    <div className="state" role="status">
      <span className="spinner" aria-hidden="true" />
      {label}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="state state--error" role="alert">
      <p>{error?.message || 'Ocorreu um erro.'}</p>
      {onRetry && (
        <button className="btn btn--ghost" onClick={onRetry}>
          Tentar novamente
        </button>
      )}
    </div>
  );
}

export function Empty({ children }) {
  return <div className="state">{children}</div>;
}

export function StatusBadge({ status }) {
  const cls = status === 'DISPONIVEL' ? 'badge badge--ok' : 'badge badge--off';
  const label = status === 'DISPONIVEL' ? 'Disponível' : 'Encerrada';
  return <span className={cls}>{label}</span>;
}

export function money(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(Number(value) || 0);
}

export function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
