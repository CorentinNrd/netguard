import { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';

const PRESETS = [
  ['common', 'Ports courants (≈ 55)'],
  ['well-known', 'Ports 1 à 1024'],
  ['all', 'Tous les ports (1 à 65535)'],
  ['custom', 'Personnalisé'],
];

const RISK = { high: ['bad', 'Risqué'], medium: ['warn', 'À vérifier'], info: ['neutral', 'Courant'] };

export default function PortScan({ preset, defaultTarget }) {
  const [target, setTarget] = useState('');
  const [mode, setMode] = useState('common');
  const [custom, setCustom] = useState('22,80,443,8000-8100');
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);
  const timer = useRef(null);
  const touched = useRef(false);

  useEffect(() => {
    if (preset) {
      touched.current = true;
      setTarget(preset.ip);
    }
  }, [preset]);

  useEffect(() => {
    if (defaultTarget && !touched.current) setTarget(defaultTarget);
  }, [defaultTarget]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const poll = (id) => {
    timer.current = setTimeout(async () => {
      try {
        const next = await api.get(`/portscan/${id}`);
        setJob(next);
        if (next.status === 'running') poll(id);
      } catch (e) {
        setError(e.message);
        setJob((j) => (j ? { ...j, status: 'cancelled' } : j));
      }
    }, 400);
  };

  const start = async (e) => {
    e.preventDefault();
    clearTimeout(timer.current);
    setError(null);
    try {
      const started = await api.post('/portscan', { target, ports: mode === 'custom' ? custom : mode });
      setJob(started);
      poll(started.id);
    } catch (err) {
      setJob(null);
      setError(err.message);
    }
  };

  const cancel = () => job && api.del(`/portscan/${job.id}`).catch(() => {});
  const running = job?.status === 'running';
  const pct = job ? Math.round((job.done / job.total) * 100) : 0;

  return (
    <>
      <header className="page-head">
        <h1>Scan de ports</h1>
        <p>Scan TCP d’un appareil de votre réseau local. Les adresses publiques sont refusées.</p>
      </header>

      <form className="card form-row" onSubmit={start}>
        <label>
          Adresse IP cible
          <input
            className="mono"
            value={target}
            onChange={(e) => {
              touched.current = true;
              setTarget(e.target.value);
            }}
            placeholder="192.168.1.1"
            required
          />
        </label>
        <label>
          Ports
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            {PRESETS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        {mode === 'custom' && (
          <label>
            Liste ou plages
            <input className="mono" value={custom} onChange={(e) => setCustom(e.target.value)} required />
          </label>
        )}
        {running ? (
          <button type="button" className="secondary" onClick={cancel}>
            Annuler
          </button>
        ) : (
          <button type="submit">Lancer le scan</button>
        )}
      </form>

      {mode === 'all' && !running && (
        <p className="notice">Un scan complet peut prendre plusieurs minutes si l’appareil filtre ses ports.</p>
      )}
      {error && <p className="error">{error}</p>}

      {job && (
        <>
          <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div style={{ width: `${pct}%` }} />
          </div>
          <p className="muted">
            <span className="mono">{job.target}</span> — {job.done} / {job.total} ports testés
            {job.status === 'done' && ` en ${(job.durationMs / 1000).toFixed(1)} s`}
            {job.status === 'cancelled' && ' (annulé)'}
            {' · '}
            {job.open.length} ouvert{job.open.length > 1 ? 's' : ''}
          </p>

          {job.fallback && (
            <p className="notice">
              macOS bloque l’accès direct au réseau local pour ce processus : le scan passe par l’utilitaire système nc, plus
              lent. Pour un scan rapide, autorisez l’application qui a lancé NetGuard dans Réglages Système › Confidentialité et
              sécurité › Réseau local.
            </p>
          )}
          {job.open.length > 0 ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th className="num">Port</th>
                    <th>Service probable</th>
                    <th>Niveau</th>
                    <th>Remarque</th>
                  </tr>
                </thead>
                <tbody>
                  {job.open.map((p) => (
                    <tr key={p.port}>
                      <td className="num mono">{p.port}</td>
                      <td>{p.service}</td>
                      <td>
                        <span className={`badge ${RISK[p.risk][0]}`}>{RISK[p.risk][1]}</span>
                      </td>
                      <td className="muted">{p.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            !running && <div className="empty">Aucun port ouvert trouvé sur la plage testée.</div>
          )}
        </>
      )}
    </>
  );
}
