import { Resolver } from 'node:dns/promises';
import tls from 'node:tls';
import { HttpError, run, isHostname, isIPv4 } from './util.js';

function host(input) {
  const h = String(input || '').trim().toLowerCase();
  if (!isHostname(h) && !isIPv4(h)) throw new HttpError(400, 'Nom d’hôte ou adresse IP invalide.');
  return h;
}

export async function dnsLookup(input) {
  const name = host(input);
  const resolver = new Resolver({ timeout: 3000, tries: 1 });
  const types = ['A', 'AAAA', 'CNAME', 'MX', 'NS', 'TXT'];
  const records = {};
  await Promise.all(
    types.map(async (type) => {
      try {
        const res = await resolver.resolve(name, type);
        records[type] = res.map((r) =>
          type === 'MX' ? `${r.priority} ${r.exchange}` : Array.isArray(r) ? r.join('') : String(r),
        );
      } catch {
        records[type] = [];
      }
    }),
  );
  return { host: name, records };
}

export function tlsCheck(input, portInput = 443) {
  const name = host(input);
  const port = Number(portInput);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new HttpError(400, 'Port invalide.');

  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      { host: name, port, servername: isIPv4(name) ? undefined : name, rejectUnauthorized: false, timeout: 6000 },
      () => {
        const cert = socket.getPeerCertificate();
        const validTo = cert.valid_to ? new Date(cert.valid_to) : null;
        resolve({
          host: name,
          port,
          trusted: socket.authorized,
          trustError: socket.authorized ? null : String(socket.authorizationError || ''),
          protocol: socket.getProtocol(),
          cipher: socket.getCipher()?.name || null,
          subject: cert.subject?.CN || null,
          issuer: cert.issuer?.O || cert.issuer?.CN || null,
          altNames: (cert.subjectaltname || '').split(', ').filter(Boolean).slice(0, 20),
          validFrom: cert.valid_from ? new Date(cert.valid_from).toISOString() : null,
          validTo: validTo ? validTo.toISOString() : null,
          daysLeft: validTo ? Math.floor((validTo - Date.now()) / 86400000) : null,
        });
        socket.end();
      },
    );
    socket.once('timeout', () => {
      socket.destroy();
      reject(new HttpError(504, 'Délai dépassé : aucun service TLS ne répond.'));
    });
    socket.once('error', (e) => reject(new HttpError(502, `Connexion TLS impossible : ${e.code || e.message}`)));
  });
}

export async function pingHost(input) {
  const name = host(input);
  const r = await run('ping', ['-c', '4', name], 15000);
  return { host: name, reachable: r.ok, output: (r.stdout || r.stderr).trim() };
}
