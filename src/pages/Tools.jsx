import { useState } from 'react';
import { api } from '../api.js';

function Tool({ title, description, endpoint, placeholder, extra, children }) {
  const [host, setHost] = useState('');
  const [state, setState] = useState({ loading: false, data: null, error: null });

  const submit = (e) => {
    e.preventDefault();
    setState({ loading: true, data: null, error: null });
    api
      .post(endpoint, { host, ...extra })
      .then((data) => setState({ loading: false, data, error: null }))
      .catch((err) => setState({ loading: false, data: null, error: err.message }));
  };

  return (
    <div className="card">
      <h2>{title}</h2>
      <p className="muted">{description}</p>
      <form className="form-row" onSubmit={submit}>
        <label>
          Hôte
          <input className="mono" value={host} onChange={(e) => setHost(e.target.value)} placeholder={placeholder} required />
        </label>
        <button type="submit" disabled={state.loading}>
          {state.loading ? 'En cours…' : 'Lancer'}
        </button>
      </form>
      {state.error && <p className="error">{state.error}</p>}
      {state.data && children(state.data)}
    </div>
  );
}

const date = (iso) => (iso ? new Date(iso).toLocaleDateString('fr-FR', { dateStyle: 'long' }) : '—');

export default function Tools() {
  return (
    <>
      <header className="page-head">
        <h1>Outils</h1>
        <p>Diagnostics ponctuels sur un nom de domaine ou une adresse.</p>
      </header>

      <Tool
        title="Certificat TLS"
        description="Vérifie le certificat HTTPS d’un site ou d’un appareil (port 443)."
        endpoint="/tools/tls"
        placeholder="example.com"
      >
        {(d) => (
          <dl>
            <dt>Confiance</dt>
            <dd>
              {d.trusted ? (
                <span className="badge ok">Certificat valide</span>
              ) : (
                <span className="badge bad">Non approuvé ({d.trustError})</span>
              )}
            </dd>
            <dt>Expiration</dt>
            <dd>
              {date(d.validTo)}{' '}
              {d.daysLeft !== null && (
                <span className={`badge ${d.daysLeft < 0 ? 'bad' : d.daysLeft < 21 ? 'warn' : 'neutral'}`}>
                  {d.daysLeft < 0 ? 'Expiré' : `${d.daysLeft} jours restants`}
                </span>
              )}
            </dd>
            <dt>Sujet</dt>
            <dd className="mono">{d.subject || '—'}</dd>
            <dt>Émetteur</dt>
            <dd>{d.issuer || '—'}</dd>
            <dt>Protocole</dt>
            <dd className="mono">
              {d.protocol} · {d.cipher}
            </dd>
          </dl>
        )}
      </Tool>

      <Tool
        title="Recherche DNS"
        description="Enregistrements A, AAAA, CNAME, MX, NS et TXT d’un domaine."
        endpoint="/tools/dns"
        placeholder="example.com"
      >
        {(d) => {
          const rows = Object.entries(d.records).filter(([, v]) => v.length);
          return rows.length === 0 ? (
            <p className="muted">Aucun enregistrement trouvé.</p>
          ) : (
            <dl>
              {rows.map(([type, values]) => (
                <div key={type} className="dl-row">
                  <dt>{type}</dt>
                  <dd className="mono">
                    {values.map((v, i) => (
                      <div key={i}>{v}</div>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          );
        }}
      </Tool>

      <Tool
        title="Ping"
        description="Envoie 4 requêtes pour tester la joignabilité et la latence."
        endpoint="/tools/ping"
        placeholder="192.168.1.1"
      >
        {(d) => (
          <>
            <p>
              {d.reachable ? <span className="badge ok">Joignable</span> : <span className="badge bad">Injoignable</span>}
            </p>
            <pre>{d.output || 'Aucune sortie.'}</pre>
          </>
        )}
      </Tool>
    </>
  );
}
