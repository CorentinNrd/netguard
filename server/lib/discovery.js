import dns from 'node:dns/promises';
import { HttpError, run, pool, ipToInt, intToIp, getPrimaryNetwork } from './util.js';

function normalizeMac(mac) {
  return mac
    .split(':')
    .map((o) => o.padStart(2, '0'))
    .join(':')
    .toLowerCase();
}

async function ping(ip) {
  const args =
    process.platform === 'darwin' ? ['-c', '1', '-t', '1', '-W', '700', ip] : ['-c', '1', '-W', '1', ip];
  const r = await run('ping', args, 3000);
  if (!r.ok) return null;
  const m = /time[=<]([\d.]+)\s*ms/.exec(r.stdout);
  return m ? Number(m[1]) : 0;
}

async function reverseName(ip) {
  try {
    const names = await Promise.race([
      dns.reverse(ip),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 1500)),
    ]);
    return names[0] || null;
  } catch {
    return null;
  }
}

/** Balayage ping du sous-réseau local + lecture de la table ARP. */
export async function discover() {
  const net = await getPrimaryNetwork();
  if (!net) throw new HttpError(503, 'Aucune interface réseau IPv4 active.');

  // Un très grand sous-réseau est ramené au /24 autour de cette machine.
  let prefix = net.prefix;
  const truncated = prefix < 22;
  if (truncated) prefix = 24;
  if (prefix > 30) throw new HttpError(400, 'Sous-réseau trop petit pour être balayé.');

  const mask = (0xffffffff << (32 - prefix)) >>> 0;
  const base = (ipToInt(net.ip) & mask) >>> 0;
  const size = 2 ** (32 - prefix);
  const broadcast = intToIp(base + size - 1);
  const targets = [];
  for (let i = 1; i < size - 1; i++) targets.push(intToIp(base + i));

  const started = Date.now();
  const alive = new Map();
  await pool(targets, 96, async (ip) => {
    const latency = await ping(ip);
    if (latency !== null) alive.set(ip, latency);
  });

  // La table ARP révèle aussi les appareils qui ignorent le ping.
  const macs = new Map();
  const arp = await run('arp', ['-an']);
  for (const line of arp.stdout.split('\n')) {
    const m = /\((\d+\.\d+\.\d+\.\d+)\) at ([0-9a-f:]+) on (\S+)/i.exec(line);
    if (!m) continue;
    const [, ip, rawMac, iface] = m;
    const mac = normalizeMac(rawMac);
    if (iface !== net.iface || ip === broadcast || mac === 'ff:ff:ff:ff:ff:ff') continue;
    if (((ipToInt(ip) & mask) >>> 0) !== base) continue;
    macs.set(ip, mac);
  }
  if (net.mac) macs.set(net.ip, net.mac.toLowerCase());

  const ips = [...new Set([...alive.keys(), ...macs.keys()])].sort(
    (a, b) => ipToInt(a) - ipToInt(b),
  );
  const devices = [];
  await pool(ips, 16, async (ip, idx) => {
    const mac = macs.get(ip) || null;
    devices[idx] = {
      ip,
      mac,
      hostname: await reverseName(ip),
      latencyMs: alive.has(ip) ? alive.get(ip) : null,
      respondsToPing: alive.has(ip),
      isSelf: ip === net.ip,
      isGateway: ip === net.gateway,
      // Bit « administré localement » : adresse MAC aléatoire/privée (téléphones récents).
      randomizedMac: mac ? (parseInt(mac.slice(0, 2), 16) & 2) === 2 : false,
    };
  });

  return {
    network: { ...net, scanned: `${intToIp(base)}/${prefix}`, truncated },
    arpAvailable: arp.ok && macs.size > 1,
    arpError: arp.ok ? null : arp.stderr.trim().slice(0, 200) || 'commande arp indisponible',
    devices,
    durationMs: Date.now() - started,
    scannedAt: new Date().toISOString(),
  };
}
