# NetGuard

Boîte à outils de sécurité pour votre réseau local, avec une interface web en React.
NetGuard tourne entièrement sur votre machine : un petit serveur Node exécute les scans, et l'interface les pilote depuis le navigateur.

> **À n'utiliser que sur un réseau qui vous appartient ou que vous êtes autorisé à tester.**
> Scanner le réseau d'un tiers sans autorisation est illégal dans la plupart des pays.

## Fonctionnalités

| Onglet | Ce qu'il fait |
| --- | --- |
| **Tableau de bord** | Résumé de la machine, du sous-réseau, de la passerelle et de l'audit. |
| **Appareils** | Liste les appareils connectés (IP, adresse MAC, nom, latence) par balayage ping et lecture de la table ARP. Les appareils marqués « connus » sont mémorisés : tout nouvel arrivant est signalé. |
| **Scan de ports** | Scan TCP d'un appareil : ports courants, 1 à 1024, tous les ports, ou liste personnalisée (`22,80,8000-8100`). Chaque port ouvert est accompagné du service probable et d'un niveau de risque. |
| **Ports locaux** | Programmes de la machine qui acceptent des connexions TCP, et s'ils sont joignables depuis le réseau. |
| **Audit système** | Contrôles en lecture seule : pare-feu, mode furtif, FileVault, SIP, Gatekeeper, mises à jour, chiffrement Wi-Fi, partages SSH / écran / fichiers. |
| **Outils** | Vérification de certificat TLS, recherche DNS, ping. |

## Prérequis

- Node.js 18 ou plus récent
- macOS : c'est la seule plateforme sur laquelle NetGuard a été testé. Le code prévoit Linux pour la découverte, le scan de ports et les outils, mais ce n'est pas vérifié ; l'audit système est propre à macOS.

## Installation

```bash
git clone <url-du-dépôt>
cd netguard
npm install
```

## Utilisation

En développement (rechargement à chaud) :

```bash
npm run dev
```

Puis ouvrez <http://localhost:5173>.

En version compilée, servie par le seul serveur Node sur <http://127.0.0.1:4170> :

```bash
npm run build
npm start
```

| Variable | Rôle | Valeur par défaut |
| --- | --- | --- |
| `NETGUARD_API_PORT` | Port du serveur d'API | `4170` |
| `PORT` | Port de l'interface en développement | `5173` |

## Garde-fous

- **Cibles privées uniquement.** Le scan de ports refuse toute adresse hors des plages privées (`10.x`, `172.16–31.x`, `192.168.x`, `127.x`, `169.254.x`).
- **API locale.** Le serveur n'écoute que sur `127.0.0.1` et rejette les requêtes dont l'en-tête `Host` ou `Origin` n'est pas local, ce qui bloque le DNS rebinding et les appels depuis d'autres sites.
- **Pas de shell.** Les commandes système sont lancées avec `execFile` et des arguments validés : aucune entrée utilisateur n'est interprétée par un shell.
- **Lecture seule.** L'audit ne modifie aucun réglage, et rien n'est envoyé à un service externe. La liste des appareils connus reste dans le stockage local du navigateur.

## Limites connues

- **Permission « Réseau local » de macOS.** Si l'application qui lance NetGuard (terminal, éditeur…) n'a pas cette permission, Node ne peut pas ouvrir de connexion vers le réseau local. NetGuard le détecte et repasse par l'utilitaire système `nc`, plus lent. Pour un scan rapide, autorisez l'application dans *Réglages Système › Confidentialité et sécurité › Réseau local*.
- **Ports locaux.** Sans droits administrateur, seuls les programmes de la session courante sont visibles. Pour voir aussi les services système, scannez l'adresse de la machine dans « Scan de ports ».
- **Scan TCP uniquement.** Pas de scan UDP, pas de détection de version des services : le service affiché est déduit du numéro de port.
- **Pas de nom de fabricant.** Le constructeur n'est pas déduit de l'adresse MAC.
- **IPv4 uniquement**, et un sous-réseau plus large que /22 est ramené au /24 autour de la machine.

## Structure

```
server/
  index.js          Serveur Express, routes de l'API, contrôle Host/Origin
  lib/discovery.js  Balayage ping + table ARP
  lib/portscan.js   Scan TCP, table des services, tâches de scan
  lib/system.js     Ports en écoute, audit macOS
  lib/tools.js      DNS, TLS, ping
  lib/util.js       Exécution de commandes, adresses IP, interface principale
src/
  App.jsx           Navigation et état partagé
  pages/            Une page par onglet
  api.js            Client de l'API
  styles.css        Thème clair et sombre
```

## API

Toutes les routes sont sous `/api` et ne répondent qu'en local.

| Méthode | Route | Rôle |
| --- | --- | --- |
| `GET` | `/overview` | Machine et réseau |
| `POST` | `/discover` | Découverte des appareils |
| `POST` | `/portscan` | Démarre un scan (`{ target, ports }`) |
| `GET` | `/portscan/:id` | Avancement et résultats |
| `DELETE` | `/portscan/:id` | Annule un scan |
| `GET` | `/listeners` | Ports en écoute |
| `GET` | `/audit` | Audit système |
| `POST` | `/tools/dns`, `/tools/tls`, `/tools/ping` | Outils (`{ host }`) |
