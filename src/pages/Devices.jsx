import { useState } from 'react';
import { api } from '../api.js';

const STORE = 'netguard.knownDevices';

function loadKnown() {
  try {
    return new Set(JSON.parse(localStorage.getItem(STORE) || '[]'));
  } catch {
    return new Set();
  }
}

function saveKnown(set) {
  try {
    localStorage.setItem(STORE, JSON.stringify([...set]));
  } catch {
    /* stockage indisponible : la liste reste en mémoire */
  }
}

// Une MAC aléatoire change d'un réseau à l'autre mais reste stable sur un même réseau.
const keyOf = (d) => d.mac || d.ip;

export default function Devices({ onScanPorts }) {
  const [state, setState] = useState({ loading: false, data: null, error: null });
  const [known, setKnown] = useState(loadKnown);

  const scan = () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    api
      .post('/discover')
      .then((data) => setState({ loading: false, data, error: null }))
      .catch((e) => setState((s) => ({ ...s, loading: false, error: e.message })));
  };

  const updateKnown = (fn) =>
    setKnown((prev) => {
      const next = new Set(prev);
      fn(next);
      saveKnown(next);
      return next;
    });

  const { data, loading, error } = state;
  const devices = data?.devices || [];
  const unknownCount = devices.filter((d) => !d.isSelf && !known.has(keyOf(d))).length;

  return (
    <>
      <header className="page-head">
        <h1>Appareils connectés</h1>
        <p>Balayage ping du sous-réseau et lecture de la table ARP. Comptez quelques secondes.</p>
      </header>

      <div className="toolbar">
        <button onClick={scan} disabled={loading}>
          {loading ? 'Découverte en cours…' : data ? 'Relancer la découverte' : 'Lancer la découverte'}
        </button>
        {unknownCount > 0 && (
          <button className="secondary" onClick={() => updateKnown((s) => devices.forEach((d) => s.add(keyOf(d))))}>
            Tout marquer comme connu
          </button>
        )}
        {data && (
          <span className="muted">
            {devices.length} appareil{devices.length > 1 ? 's' : ''} sur <span className="mono">{data.network.scanned}</span> en{' '}
            {(data.durationMs / 1000).toFixed(1)} s
          </span>
        )}
      </div>

      {error && <p className="error">{error}</p>}
      {data?.network.truncated && (
        <p className="notice">Sous-réseau très étendu : seul le /24 autour de cette machine a été balayé.</p>
      )}
      {data && !data.arpAvailable && (
        <p className="notice">
          Table ARP illisible{data.arpError ? ` (${data.arpError})` : ''} : les adresses MAC et les appareils qui ignorent le ping
          n’apparaissent pas.
        </p>
      )}
      {data && unknownCount > 0 && (
        <p className="notice">
          {unknownCount} appareil{unknownCount > 1 ? 's' : ''} non reconnu{unknownCount > 1 ? 's' : ''}. Identifiez-les, puis
          marquez-les comme connus : les prochains scans signaleront tout nouvel arrivant.
        </p>
      )}

      {!data && !loading && !error && (
        <div className="empty">Aucun scan pour l’instant. Lancez la découverte pour lister ce qui est connecté à votre réseau.</div>
      )}

      {data && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Adresse IP</th>
                <th>Nom</th>
                <th>Adresse MAC</th>
                <th className="num">Latence</th>
                <th>État</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => {
                const isKnown = d.isSelf || known.has(keyOf(d));
                return (
                  <tr key={d.ip}>
                    <td className="mono">{d.ip}</td>
                    <td>
                      {d.hostname || <span className="muted">—</span>}
                      {d.isSelf && <span className="tag">Cette machine</span>}
                      {d.isGateway && <span className="tag">Passerelle</span>}
                    </td>
                    <td className="mono">
                      {d.mac || '—'}
                      {d.randomizedMac && !d.isSelf && (
                        <span className="tag" title="Adresse aléatoire, typique des téléphones et ordinateurs récents">
                          MAC privée
                        </span>
                      )}
                    </td>
                    <td className="num">
                      {d.respondsToPing ? `${d.latencyMs.toFixed(1)} ms` : <span className="muted" title="Vu dans la table ARP mais ne répond pas au ping">silencieux</span>}
                    </td>
                    <td>
                      {isKnown ? <span className="badge ok">Connu</span> : <span className="badge warn">Nouveau</span>}
                    </td>
                    <td className="row-actions">
                      {!d.isSelf && (
                        <button
                          className="link"
                          onClick={() => updateKnown((s) => (isKnown ? s.delete(keyOf(d)) : s.add(keyOf(d))))}
                        >
                          {isKnown ? 'Oublier' : 'Marquer connu'}
                        </button>
                      )}
                      <button className="link" onClick={() => onScanPorts(d.ip)}>
                        Scanner les ports
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
