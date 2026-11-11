import express from 'express';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getPrimaryNetwork } from './lib/util.js';
import { discover } from './lib/discovery.js';
import { startScan, getScan, cancelScan } from './lib/portscan.js';
import { listeners, audit } from './lib/system.js';
import { dnsLookup, tlsCheck, pingHost } from './lib/tools.js';

const PORT = Number(process.env.NETGUARD_API_PORT) || 4170;
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '10kb' }));

// L'API lance des scans : elle ne doit répondre qu'à cette machine.
// Le contrôle Host/Origin bloque le DNS rebinding et les requêtes d'autres sites.
const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]']);
const hostnameOf = (value) => {
  try {
    return new URL(value.includes('://') ? value : `http://${value}`).hostname;
  } catch {
    return '';
  }
};
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!LOCAL.has(hostnameOf(req.headers.host || '')) || (origin && !LOCAL.has(hostnameOf(origin)))) {
    return res.status(403).json({ error: 'Accès refusé : API réservée à cette machine.' });
  }
  next();
});

const route = (fn) => async (req, res) => {
  try {
    res.json(await fn(req));
  } catch (e) {
    if (!e.status) console.error(e);
    res.status(e.status || 500).json({ error: e.status ? e.message : 'Erreur interne du serveur.' });
  }
};

app.get('/api/overview', route(async () => ({
  hostname: os.hostname(),
  platform: process.platform,
  os: `${os.type()} ${os.release()}`,
  network: await getPrimaryNetwork(),
})));
app.post('/api/discover', route(() => discover()));
app.post('/api/portscan', route((req) => startScan(req.body?.target, req.body?.ports)));
app.get('/api/portscan/:id', route((req) => getScan(req.params.id)));
app.delete('/api/portscan/:id', route((req) => cancelScan(req.params.id)));
app.get('/api/listeners', route(() => listeners()));
app.get('/api/audit', route(() => audit()));
app.post('/api/tools/dns', route((req) => dnsLookup(req.body?.host)));
app.post('/api/tools/tls', route((req) => tlsCheck(req.body?.host, req.body?.port)));
app.post('/api/tools/ping', route((req) => pingHost(req.body?.host)));

// En production (npm run build && npm start), le serveur sert aussi l'interface.
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, '127.0.0.1', () => {
  console.log(`NetGuard API sur http://127.0.0.1:${PORT}`);
});
