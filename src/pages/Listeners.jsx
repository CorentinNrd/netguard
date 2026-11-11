import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Listeners() {
  const [state, setState] = useState({ loading: true, data: null, error: null });

  const load = () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    api
      .get('/listeners')
      .then((data) => setState({ loading: false, data, error: null }))
      .catch((e) => setState({ loading: false, data: null, error: e.message }));
  };
  useEffect(load, []);

  const items = state.data?.items || [];
  const exposed = items.filter((i) => i.exposed).length;

  return (
    <>
      <header className="page-head">
        <h1>Ports locaux</h1>
        <p>Programmes de cette machine qui acceptent des connexions TCP.</p>
      </header>

      <div className="toolbar">
        <button onClick={load} disabled={state.loading}>
          {state.loading ? 'Actualisation…' : 'Actualiser'}
        </button>
        {state.data && (
          <span className="muted">
            {items.length} port{items.length > 1 ? 's' : ''} en écoute, dont {exposed} accessible{exposed > 1 ? 's' : ''} depuis le
            réseau
          </span>
        )}
      </div>

      {state.error && <p className="error">{state.error}</p>}
      <p className="notice">
        Sans droits administrateur, seuls les programmes de votre session sont visibles. Pour voir aussi les services système,
        scannez l’adresse de cette machine dans « Scan de ports ».
      </p>

      {state.data && items.length === 0 && <div className="empty">Aucun port en écoute détecté.</div>}

      {items.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th className="num">Port</th>
                <th>Programme</th>
                <th className="num">PID</th>
                <th>Adresse d’écoute</th>
                <th>Portée</th>
              </tr>
            </thead>
            <tbody>
              {items.map((i) => (
                <tr key={`${i.pid}-${i.address}-${i.port}`}>
                  <td className="num mono">{i.port}</td>
                  <td>{i.command}</td>
                  <td className="num mono">{i.pid}</td>
                  <td className="mono">{i.address}</td>
                  <td>
                    {i.exposed ? (
                      <span className="badge warn">Réseau</span>
                    ) : (
                      <span className="badge ok">Local uniquement</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
