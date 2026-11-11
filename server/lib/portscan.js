import net from 'node:net';
import crypto from 'node:crypto';
import { HttpError, isPrivateIPv4, pool, run } from './util.js';

// port → [service, niveau de risque, remarque]
const SERVICES = {
  20: ['FTP (données)', 'high', 'Transfert non chiffré.'],
  21: ['FTP', 'high', 'Identifiants transmis en clair. Préférez SFTP.'],
  22: ['SSH', 'info', 'Accès distant chiffré. Vérifiez mots de passe et clés.'],
  23: ['Telnet', 'high', 'Accès distant en clair. À désactiver.'],
  25: ['SMTP', 'medium', 'Serveur de messagerie.'],
  53: ['DNS', 'info', 'Résolution de noms (normal sur une box).'],
  67: ['DHCP', 'info', ''],
  80: ['HTTP', 'medium', 'Interface web non chiffrée.'],
  88: ['Kerberos', 'info', ''],
  110: ['POP3', 'high', 'Messagerie en clair.'],
  111: ['RPCbind', 'medium', 'Souvent inutile sur un réseau domestique.'],
  135: ['MS RPC', 'medium', 'Service Windows.'],
  137: ['NetBIOS', 'medium', ''],
  139: ['NetBIOS/SMB', 'medium', 'Partage de fichiers Windows ancien.'],
  143: ['IMAP', 'high', 'Messagerie en clair.'],
  161: ['SNMP', 'medium', ''],
  389: ['LDAP', 'medium', ''],
  443: ['HTTPS', 'info', 'Interface web chiffrée.'],
  445: ['SMB', 'medium', 'Partage de fichiers. À ne jamais exposer sur Internet.'],
  465: ['SMTPS', 'info', ''],
  515: ['LPD (impression)', 'info', ''],
  548: ['AFP', 'medium', 'Partage de fichiers Apple ancien.'],
  554: ['RTSP', 'medium', 'Flux vidéo (caméras). Vérifiez le mot de passe.'],
  587: ['SMTP (soumission)', 'info', ''],
  631: ['IPP (impression)', 'info', ''],
  993: ['IMAPS', 'info', ''],
  995: ['POP3S', 'info', ''],
  1433: ['Microsoft SQL Server', 'high', 'Base de données exposée.'],
  1723: ['PPTP', 'high', 'VPN obsolète.'],
  1883: ['MQTT', 'medium', 'Messagerie IoT, souvent sans authentification.'],
  1900: ['UPnP', 'medium', ''],
  2049: ['NFS', 'medium', 'Partage de fichiers réseau.'],
  3000: ['Serveur de développement', 'info', ''],
  3283: ['Apple Remote Desktop', 'medium', ''],
  3306: ['MySQL', 'high', 'Base de données exposée.'],
  3389: ['RDP', 'high', 'Bureau à distance Windows. Cible fréquente.'],
  3689: ['DAAP (iTunes)', 'info', ''],
  5000: ['AirPlay / UPnP', 'info', ''],
  5353: ['mDNS', 'info', ''],
  5432: ['PostgreSQL', 'high', 'Base de données exposée.'],
  5900: ['VNC', 'high', 'Partage d’écran, souvent mal protégé.'],
  6379: ['Redis', 'high', 'Souvent sans authentification.'],
  7000: ['AirPlay', 'info', ''],
  8000: ['HTTP alternatif', 'info', ''],
  8008: ['HTTP (Chromecast)', 'info', ''],
  8009: ['Chromecast', 'info', ''],
  8080: ['HTTP alternatif / proxy', 'medium', 'Interface d’administration fréquente.'],
  8443: ['HTTPS alternatif', 'info', ''],
  8883: ['MQTT (TLS)', 'info', ''],
  9000: ['HTTP alternatif', 'info', ''],
  9100: ['Impression (JetDirect)', 'info', ''],
  27017: ['MongoDB', 'high', 'Base de données exposée.'],
  32400: ['Plex', 'info', ''],
  49152: ['UPnP / services dynamiques', 'info', ''],
  62078: ['iPhone (lockdownd)', 'info', ''],
};

const COMMON = Object.keys(SERVICES).map(Number);

export function parsePorts(spec) {
  if (spec === 'common' || !spec) return COMMON;
  if (spec === 'well-known') return Array.from({ length: 1024 }, (_, i) => i + 1);
  if (spec === 'all') return Array.from({ length: 65535 }, (_, i) => i + 1);
  if (typeof spec !== 'string' || spec.length > 500) throw new HttpError(400, 'Liste de ports invalide.');

  const set = new Set();
  for (const part of spec.split(',')) {
    const m = /^\s*(\d{1,5})\s*(?:-\s*(\d{1,5}))?\s*$/.exec(part);
    if (!m) throw new HttpError(400, `Ports invalides : « ${part.trim()} ». Exemple : 22,80,8000-8100`);
    const from = Number(m[1]);
    const to = m[2] ? Number(m[2]) : from;
    if (from < 1 || to > 65535 || from > to) throw new HttpError(400, `Plage invalide : « ${part.trim()} ».`);
    for (let p = from; p <= to; p++) set.add(p);
  }
  return [...set].sort((a, b) => a - b);
}

// Codes renvoyés quand le système refuse la connexion à ce processus (et non l'appareil cible).
// Cas typique : la permission « Réseau local » de macOS n'est pas accordée à l'app qui a lancé Node.
const BLOCKED = new Set(['EHOSTUNREACH', 'ENETUNREACH', 'EPERM', 'EACCES']);

function socketProbe(host, port, timeout) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (state) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(state);
    };
    socket.setTimeout(timeout);
    socket.once('connect', () => finish('open'));
    socket.once('timeout', () => finish('closed'));
    socket.once('error', (e) => finish(BLOCKED.has(e.code) ? 'blocked' : 'closed'));
    socket.connect(port, host);
  });
}

/**
 * Teste un port TCP. Si le système bloque les sockets de Node, on repasse par
 * l'utilitaire système nc, qui n'est pas soumis à cette restriction.
 * `stats.fallback` est mis à true quand ce repli a servi.
 */
export async function probe(host, port, timeout = 800, stats = null) {
  const state = await socketProbe(host, port, timeout);
  if (state !== 'blocked') return state === 'open';
  if (stats) stats.fallback = true;
  const r = await run('nc', ['-z', '-G', '1', '-w', '1', host, String(port)], 3000);
  return r.ok;
}

export function describePort(port) {
  const [service, risk, note] = SERVICES[port] || ['Inconnu', 'info', ''];
  return { port, service, risk, note };
}

const jobs = new Map();

export function resolveTarget(target) {
  const t = String(target || '').trim().toLowerCase();
  const ip = t === 'localhost' ? '127.0.0.1' : t;
  if (!isPrivateIPv4(ip)) {
    throw new HttpError(
      400,
      'Cible refusée : seules les adresses IPv4 privées (10.x, 172.16–31.x, 192.168.x, 127.x) sont autorisées.',
    );
  }
  return ip;
}

export function startScan(target, spec) {
  const ip = resolveTarget(target);
  const ports = parsePorts(spec);
  const id = crypto.randomUUID();
  const job = {
    id,
    target: ip,
    status: 'running',
    total: ports.length,
    done: 0,
    open: [],
    startedAt: Date.now(),
    durationMs: null,
    cancelled: false,
    fallback: false,
  };
  jobs.set(id, job);
  // On ne garde que les 20 derniers scans en mémoire.
  while (jobs.size > 20) jobs.delete(jobs.keys().next().value);

  pool(ports, 128, async (port) => {
    if (job.cancelled) return;
    if (await probe(ip, port, 800, job)) job.open.push(describePort(port));
    job.done++;
  }).then(() => {
    job.open.sort((a, b) => a.port - b.port);
    job.status = job.cancelled ? 'cancelled' : 'done';
    job.durationMs = Date.now() - job.startedAt;
  });

  return job;
}

export function getScan(id) {
  const job = jobs.get(id);
  if (!job) throw new HttpError(404, 'Scan introuvable.');
  return { ...job, open: [...job.open].sort((a, b) => a.port - b.port) };
}

export function cancelScan(id) {
  const job = jobs.get(id);
  if (!job) throw new HttpError(404, 'Scan introuvable.');
  job.cancelled = true;
  return { ok: true };
}
