import { execFile } from 'node:child_process';
import os from 'node:os';
import fs from 'node:fs';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** Exécute une commande sans shell (pas d'injection possible via les arguments). */
// Les outils système sont appelés par chemin absolu : le PATH hérité n'est pas fiable.
function resolveBin(cmd) {
  if (cmd.includes('/')) return cmd;
  for (const dir of ['/sbin', '/usr/sbin', '/usr/bin', '/bin']) {
    const full = `${dir}/${cmd}`;
    if (fs.existsSync(full)) return full;
  }
  return cmd;
}

export function run(cmd, args = [], timeout = 8000) {
  return new Promise((resolve) => {
    execFile(
      resolveBin(cmd),
      args,
      {
        timeout,
        maxBuffer: 8 * 1024 * 1024,
        env: {
          ...process.env,
          PATH: `${process.env.PATH || ''}:/sbin:/usr/sbin:/usr/bin:/bin`,
          LC_ALL: 'C',
        },
      },
      (err, stdout, stderr) =>
        resolve({ ok: !err, stdout: String(stdout || ''), stderr: String(stderr || '') }),
    );
  });
}

/** Exécute fn sur chaque élément avec une concurrence limitée. */
export async function pool(items, limit, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
}

export function isIPv4(s) {
  if (typeof s !== 'string' || !/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) return false;
  return s.split('.').every((o) => Number(o) <= 255);
}

export function ipToInt(ip) {
  return ip.split('.').reduce((a, o) => ((a << 8) + Number(o)) >>> 0, 0);
}

export function intToIp(n) {
  return [24, 16, 8, 0].map((s) => (n >>> s) & 255).join('.');
}

/** Adresses privées, loopback ou link-local uniquement (RFC 1918 / 3927). */
export function isPrivateIPv4(ip) {
  if (!isIPv4(ip)) return false;
  const [a, b] = ip.split('.').map(Number);
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

export function isHostname(s) {
  return (
    typeof s === 'string' &&
    /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/i.test(s)
  );
}

/** Interface réseau principale (celle de la route par défaut). */
export async function getPrimaryNetwork() {
  let gateway = null;
  let iface = null;
  if (process.platform === 'darwin') {
    const r = await run('route', ['-n', 'get', 'default']);
    gateway = /gateway:\s*(\S+)/.exec(r.stdout)?.[1] ?? null;
    iface = /interface:\s*(\S+)/.exec(r.stdout)?.[1] ?? null;
  } else {
    const r = await run('ip', ['route', 'show', 'default']);
    const m = /default via (\S+) dev (\S+)/.exec(r.stdout);
    if (m) [, gateway, iface] = m;
  }

  const ifs = os.networkInterfaces();
  const pick = (name) => (ifs[name] || []).find((a) => a.family === 'IPv4' && !a.internal);
  let addr = iface ? pick(iface) : null;
  if (!addr) {
    for (const name of Object.keys(ifs)) {
      const a = pick(name);
      if (a) {
        addr = a;
        iface = name;
        break;
      }
    }
  }
  if (!addr) return null;

  const prefix = Number(addr.cidr.split('/')[1]);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const network = intToIp((ipToInt(addr.address) & mask) >>> 0);
  return {
    iface,
    ip: addr.address,
    netmask: addr.netmask,
    prefix,
    cidr: `${network}/${prefix}`,
    mac: addr.mac,
    gateway: isIPv4(gateway) ? gateway : null,
  };
}
