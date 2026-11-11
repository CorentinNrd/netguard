import { run, getPrimaryNetwork } from './util.js';
import { probe, describePort } from './portscan.js';

/** Ports TCP en écoute sur cette machine (processus de l'utilisateur courant). */
export async function listeners() {
  const r = await run('lsof', ['+c', '0', '-nP', '-iTCP', '-sTCP:LISTEN']);
  const seen = new Set();
  const items = [];
  for (const line of r.stdout.split('\n').slice(1)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 10) continue;
    const name = parts[parts.length - 2];
    const sep = name.lastIndexOf(':');
    if (sep < 0) continue;
    const address = name.slice(0, sep);
    const port = Number(name.slice(sep + 1));
    const pid = Number(parts[1]);
    const key = `${pid}|${address}|${port}`;
    if (!port || seen.has(key)) continue;
    seen.add(key);
    const local = address.startsWith('127.') || address === '[::1]';
    items.push({
      command: parts[0].replace(/\\x20/g, ' '),
      pid,
      user: parts[2],
      address,
      port,
      exposed: !local,
      service: describePort(port).service,
    });
  }
  items.sort((a, b) => a.port - b.port || a.pid - b.pid);
  return { supported: r.ok || items.length > 0, items };
}

const check = (id, title, status, detail, advice = '') => ({ id, title, status, detail, advice });

async function wifiCheck() {
  const r = await run('system_profiler', ['SPAirPortDataType', '-json'], 20000);
  try {
    const ifaces = JSON.parse(r.stdout).SPAirPortDataType?.[0]?.spairport_airport_interfaces || [];
    const current = ifaces.map((i) => i.spairport_current_network_information).find(Boolean);
    if (!current) return check('wifi', 'Chiffrement Wi-Fi', 'unknown', 'Non connecté en Wi-Fi.');
    const raw = String(current.spairport_security_mode || '');
    const label = raw.replace(/^s?pairport_security_mode_/, '').replace(/_/g, ' ').toUpperCase() || 'inconnu';
    if (/wpa3|wpa2/.test(raw)) return check('wifi', 'Chiffrement Wi-Fi', 'ok', label);
    if (/wep|none|wpa/.test(raw))
      return check(
        'wifi',
        'Chiffrement Wi-Fi',
        'bad',
        label,
        'Réseau ouvert ou chiffrement obsolète : passez la box en WPA2 ou WPA3.',
      );
    return check('wifi', 'Chiffrement Wi-Fi', 'unknown', label);
  } catch {
    return check('wifi', 'Chiffrement Wi-Fi', 'unknown', 'Information indisponible.');
  }
}

/** Contrôles de configuration de sécurité de cette machine (macOS). */
export async function audit() {
  if (process.platform !== 'darwin') {
    return { supported: false, checks: [], score: null };
  }
  const fw = '/usr/libexec/ApplicationFirewall/socketfilterfw';
  const net = await getPrimaryNetwork();
  const lanIp = net?.ip || '127.0.0.1';

  const [firewall, stealth, fileVault, sip, gatekeeper, updates, wifi, ssh, screen, smb] =
    await Promise.all([
      run(fw, ['--getglobalstate']),
      run(fw, ['--getstealthmode']),
      run('fdesetup', ['status']),
      run('csrutil', ['status']),
      run('spctl', ['--status']),
      run('defaults', ['read', '/Library/Preferences/com.apple.SoftwareUpdate', 'AutomaticCheckEnabled']),
      wifiCheck(),
      probe(lanIp, 22, 500),
      probe(lanIp, 5900, 500),
      probe(lanIp, 445, 500),
    ]);

  const tri = (r, okRe, badRe) =>
    !r.stdout.trim() ? 'unknown' : okRe.test(r.stdout) ? 'ok' : badRe.test(r.stdout) ? 'bad' : 'unknown';
  const out = (r) => r.stdout.trim().split('\n')[0] || 'Information indisponible.';

  const fwStatus = tri(firewall, /enabled|State = [12]/i, /disabled|State = 0/i);
  const stealthOn = /\bon\b|enabled/i.test(stealth.stdout);
  const upd = updates.stdout.trim();

  const checks = [
    check('firewall', 'Pare-feu macOS', fwStatus, out(firewall),
      fwStatus === 'bad' ? 'Activez-le dans Réglages Système › Réseau › Coupe-feu.' : ''),
    check('stealth', 'Mode furtif du pare-feu', !stealth.stdout.trim() ? 'unknown' : stealthOn ? 'ok' : 'warn',
      out(stealth), stealthOn ? '' : 'Optionnel : rend la machine invisible aux sondes réseau (options du coupe-feu).'),
    check('filevault', 'Chiffrement du disque (FileVault)', tri(fileVault, /is On/i, /is Off/i), out(fileVault),
      /is Off/i.test(fileVault.stdout) ? 'Activez FileVault dans Réglages Système › Confidentialité et sécurité.' : ''),
    check('sip', 'Protection de l’intégrité du système (SIP)', tri(sip, /enabled/i, /disabled/i), out(sip),
      /disabled/i.test(sip.stdout) ? 'Réactivez SIP depuis le mode de récupération (csrutil enable).' : ''),
    check('gatekeeper', 'Gatekeeper', tri(gatekeeper, /enabled/i, /disabled/i), out(gatekeeper),
      /disabled/i.test(gatekeeper.stdout) ? 'Réactivez la vérification des applications (spctl --master-enable).' : ''),
    check('updates', 'Recherche automatique des mises à jour',
      upd === '1' ? 'ok' : upd === '0' ? 'bad' : 'unknown',
      upd === '1' ? 'Activée.' : upd === '0' ? 'Désactivée.' : 'Réglage non défini (activé par défaut).',
      upd === '0' ? 'Activez-la dans Réglages Système › Général › Mise à jour de logiciels.' : ''),
    wifi,
    check('ssh', 'Session à distance (SSH)', ssh ? 'warn' : 'ok',
      ssh ? `Port 22 ouvert sur ${lanIp}.` : 'Port 22 fermé.',
      ssh ? 'Désactivez-la si vous ne l’utilisez pas (Réglages Système › Général › Partage).' : ''),
    check('screen', 'Partage d’écran (VNC)', screen ? 'warn' : 'ok',
      screen ? `Port 5900 ouvert sur ${lanIp}.` : 'Port 5900 fermé.',
      screen ? 'Désactivez-le si vous ne l’utilisez pas (Réglages Système › Général › Partage).' : ''),
    check('smb', 'Partage de fichiers (SMB)', smb ? 'warn' : 'ok',
      smb ? `Port 445 ouvert sur ${lanIp}.` : 'Port 445 fermé.',
      smb ? 'Désactivez-le si vous ne l’utilisez pas (Réglages Système › Général › Partage).' : ''),
  ];

  const known = checks.filter((c) => c.status !== 'unknown');
  return {
    supported: true,
    checks,
    score: { ok: known.filter((c) => c.status === 'ok').length, total: known.length },
    checkedAt: new Date().toISOString(),
  };
}
