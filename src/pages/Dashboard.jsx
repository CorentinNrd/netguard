export default function Dashboard({ overview, audit, go }) {
  const net = overview?.network;
  const score = audit.data?.score;
  const issues = (audit.data?.checks || []).filter((c) => c.status === 'bad' || c.status === 'warn');

  return (
    <>
      <header className="page-head">
        <h1>Tableau de bord</h1>
        <p>Vue d’ensemble de cette machine et de son réseau.</p>
      </header>

      <div className="grid">
        <div className="card">
          <h2>Cette machine</h2>
          {!overview ? (
            <p className="muted">Chargement…</p>
          ) : overview.error ? (
            <p className="error">Serveur injoignable.</p>
          ) : (
            <dl>
              <dt>Nom</dt>
              <dd>{overview.hostname}</dd>
              <dt>Système</dt>
              <dd>{overview.os}</dd>
              <dt>Adresse IP</dt>
              <dd className="mono">{net?.ip || '—'}</dd>
              <dt>Adresse MAC</dt>
              <dd className="mono">{net?.mac || '—'}</dd>
            </dl>
          )}
        </div>

        <div className="card">
          <h2>Réseau</h2>
          {!overview ? (
            <p className="muted">Chargement…</p>
          ) : !net ? (
            <p className="muted">Aucune connexion réseau active.</p>
          ) : (
            <dl>
              <dt>Sous-réseau</dt>
              <dd className="mono">{net.cidr}</dd>
              <dt>Passerelle</dt>
              <dd className="mono">{net.gateway || '—'}</dd>
              <dt>Interface</dt>
              <dd className="mono">{net.iface}</dd>
              <dt>Masque</dt>
              <dd className="mono">{net.netmask}</dd>
            </dl>
          )}
        </div>

        <div className="card">
          <h2>Audit système</h2>
          {audit.loading ? (
            <p className="muted">Analyse en cours…</p>
          ) : audit.error ? (
            <p className="error">{audit.error}</p>
          ) : !audit.data.supported ? (
            <p className="muted">L’audit système n’est disponible que sur macOS.</p>
          ) : (
            <>
              <p className="score">
                {score.ok}
                <span> / {score.total} contrôles conformes</span>
              </p>
              {issues.length === 0 ? (
                <p className="muted">Aucun point d’attention.</p>
              ) : (
                <ul className="issues">
                  {issues.map((c) => (
                    <li key={c.id}>
                      <span className={`dot ${c.status}`} />
                      {c.title}
                    </li>
                  ))}
                </ul>
              )}
              <button className="link" onClick={() => go('audit')}>
                Voir le détail
              </button>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Actions rapides</h2>
        <div className="actions">
          <button onClick={() => go('devices')}>Découvrir les appareils connectés</button>
          <button className="secondary" onClick={() => go('portscan')}>
            Scanner les ports d’un appareil
          </button>
          <button className="secondary" onClick={() => go('listeners')}>
            Voir les ports ouverts sur cette machine
          </button>
        </div>
      </div>
    </>
  );
}
