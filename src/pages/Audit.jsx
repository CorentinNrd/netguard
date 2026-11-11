const LABEL = { ok: 'Conforme', warn: 'À vérifier', bad: 'À corriger', unknown: 'Indéterminé' };
const CLASS = { ok: 'ok', warn: 'warn', bad: 'bad', unknown: 'neutral' };

export default function Audit({ audit, reload }) {
  const { loading, data, error } = audit;

  return (
    <>
      <header className="page-head">
        <h1>Audit système</h1>
        <p>Réglages de sécurité de cette machine. Lecture seule : rien n’est modifié.</p>
      </header>

      <div className="toolbar">
        <button onClick={reload} disabled={loading}>
          {loading ? 'Analyse en cours…' : 'Relancer l’audit'}
        </button>
        {data?.score && (
          <span className="muted">
            {data.score.ok} / {data.score.total} contrôles conformes
          </span>
        )}
      </div>

      {error && <p className="error">{error}</p>}
      {data && !data.supported && <div className="empty">L’audit système n’est disponible que sur macOS.</div>}

      {data?.supported && (
        <ul className="checks">
          {data.checks.map((c) => (
            <li key={c.id} className="card">
              <div className="check-head">
                <strong>{c.title}</strong>
                <span className={`badge ${CLASS[c.status]}`}>{LABEL[c.status]}</span>
              </div>
              <p className="muted">{c.detail}</p>
              {c.advice && <p className="advice">{c.advice}</p>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
