import { useCallback, useEffect, useState } from 'react';
import { api } from './api.js';
import Dashboard from './pages/Dashboard.jsx';
import Devices from './pages/Devices.jsx';
import PortScan from './pages/PortScan.jsx';
import Listeners from './pages/Listeners.jsx';
import Audit from './pages/Audit.jsx';
import Tools from './pages/Tools.jsx';

const TABS = [
  ['dashboard', 'Tableau de bord'],
  ['devices', 'Appareils'],
  ['portscan', 'Scan de ports'],
  ['listeners', 'Ports locaux'],
  ['audit', 'Audit système'],
  ['tools', 'Outils'],
];

export default function App() {
  const [tab, setTab] = useState('dashboard');
  const [overview, setOverview] = useState(null);
  const [audit, setAudit] = useState({ loading: true, data: null, error: null });
  const [scanTarget, setScanTarget] = useState(null);

  const loadAudit = useCallback(() => {
    setAudit((a) => ({ ...a, loading: true, error: null }));
    api
      .get('/audit')
      .then((data) => setAudit({ loading: false, data, error: null }))
      .catch((e) => setAudit({ loading: false, data: null, error: e.message }));
  }, []);

  useEffect(() => {
    api.get('/overview').then(setOverview).catch(() => setOverview({ error: true }));
    loadAudit();
  }, [loadAudit]);

  const scanPorts = (ip) => {
    setScanTarget({ ip, nonce: Date.now() });
    setTab('portscan');
  };

  // Toutes les pages restent montées : un scan en cours survit au changement d'onglet.
  const page = (id, node) => (
    <section className="page" hidden={tab !== id}>
      {node}
    </section>
  );

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          NetGuard
        </div>
        <nav>
          {TABS.map(([id, label]) => (
            <button key={id} className={tab === id ? 'nav active' : 'nav'} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </nav>
        <p className="sidebar-note">Scans limités à votre réseau local. API accessible uniquement depuis cette machine.</p>
      </aside>
      <main>
        {page('dashboard', <Dashboard overview={overview} audit={audit} go={setTab} />)}
        {page('devices', <Devices onScanPorts={scanPorts} />)}
        {page('portscan', <PortScan preset={scanTarget} defaultTarget={overview?.network?.gateway} />)}
        {page('listeners', <Listeners />)}
        {page('audit', <Audit audit={audit} reload={loadAudit} />)}
        {page('tools', <Tools />)}
      </main>
    </div>
  );
}
