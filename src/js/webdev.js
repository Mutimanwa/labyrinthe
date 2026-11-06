/* =====================================================================
   WEBDEV — module DÉVELOPPEMENT WEB.

   Un serveur Next.js simulé sert une vraie API REST. L'apprenti écrit
   du TypeScript, du React et des Route Handlers, puis les exécute
   réellement contre cette API. Les contrats se valident sur ce que le
   code a FAIT (requêtes émises, statuts obtenus, DOM produit), pas sur
   une réponse tapée au hasard.
   ===================================================================== */
(function (global) {
  'use strict';

  const P = (service, version) => ({ service, version, state: 'open' });

  // -------------------------------------------------- la machine
  const WEB_NODE = {
    id: 'apiLab', users: { joueur: 'joueur', root: 'toor' }, sudoNoPasswd: true,
    theme: 'purple', name: 'Serveur API — Next.js', ip: '10.10.5.10', os: 'Linux',
    desc: 'Application Next.js 15 et son API REST.',
    links: ['academie'],
    ports: { 22: P('ssh', 'OpenSSH 9.6p1'), 3000: P('http', 'Next.js 15.1'), 5432: P('postgresql', 'PostgreSQL 16.2') },
    portsNeeded: 0,
    files: {
      '/home/joueur/LISEZ_MOI.txt': `MODULE DÉVELOPPEMENT WEB

Ici, tu n'attaques pas : tu CONSTRUIS. Le serveur fait tourner une
application Next.js et son API REST sur le port 3000.

  curl http://10.10.5.10:3000/api/health     voir l'API répondre
  cat /home/joueur/projet/API.md            la documentation des routes
  cd /home/joueur/projet
  ls -la src/lib

Tu écris du TypeScript dans les fichiers, puis tu l'exécutes :

  npx tsx src/lib/health.ts
  node src/lib/health.js        (si tu préfères le JavaScript)

Le code est VRAIMENT exécuté. fetch() interroge VRAIMENT l'API du
serveur — simulated localement, mais avec les vrais codes HTTP,
les vrais en-têtes et le vrai JSON.`,

      '/home/joueur/projet/API.md': `# API de l'Académie — http://10.10.5.10:3000

| Méthode | Route | Auth | Effet |
|---|---|---|---|
| GET | /api/health | non | état du service |
| POST | /api/auth/login | non | {email,password} → {token,user} |
| GET | /api/users | Bearer | liste ; ?city= ?role= ?limit= |
| POST | /api/users | Bearer | {name,email} → 201 + Location |
| GET | /api/users/:id | Bearer | un utilisateur |
| DELETE | /api/users/:id | admin | supprime → 204 |
| GET | /api/posts | non | ?userId= ?tag= |
| GET | /api/admin/stats | admin | statistiques |

## Authentification
En-tête : \`Authorization: Bearer <token>\`
Sans jeton : 401. Jeton sans le bon rôle : 403.

## Comptes de développement
  eric@academie.bi  /  motdepasse123   (rôle user)
  aline@academie.bi /  Adm1n!2026      (rôle admin)`,

      '/home/joueur/projet/package.json': `{
  "name": "academie-web",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "15.1.0",
    "react": "19.0.0",
    "react-dom": "19.0.0"
  },
  "devDependencies": {
    "typescript": "5.7.2",
    "tsx": "4.19.2",
    "@types/react": "19.0.0",
    "@types/node": "22.10.0"
  }
}`,
      '/home/joueur/projet/.env.local': `# Variables d'environnement — NE JAMAIS committer ce fichier
API_BASE=http://10.10.5.10:3000
API_DEV_EMAIL=eric@academie.bi
API_DEV_PASSWORD=motdepasse123`,

      '/home/joueur/projet/src/lib/health.ts': `// CONTRAT 17 — connecter l'API.
// Objectif : appeler GET /api/health et afficher le champ "status".
//
// Rappel : fetch est asynchrone. Il faut await, puis await r.json().

const API = 'http://10.10.5.10:3000';

async function main() {
  // TODO : appelle /api/health, récupère le JSON, affiche data.status
}

await main();`,

      '/home/joueur/projet/src/lib/users.ts': `// CONTRAT 18 — authentifier puis lire la liste.
// Objectif :
//   1. POST /api/auth/login avec email + password (voir .env.local)
//   2. récupérer le jeton
//   3. GET /api/users avec l'en-tête Authorization: Bearer <token>
//   4. afficher le nombre d'utilisateurs (le champ "total")

const API = 'http://10.10.5.10:3000';

async function login(email: string, password: string) {
  // TODO
}

async function main() {
  // TODO
}

await main();`,

      '/home/joueur/projet/src/lib/admin.ts': `// CONTRAT 19 — gérer les erreurs HTTP.
// Objectif : appeler /api/admin/stats avec le jeton d'un compte USER.
// Le serveur répond 403. Ton code NE DOIT PAS planter :
// il doit détecter le statut et afficher une ligne contenant "403".
//
// Piège classique : appeler r.json() puis lire j.data alors que la
// réponse est une erreur → TypeError. Vérifie r.ok AVANT.

const API = 'http://10.10.5.10:3000';
const TOKEN = 'dev-token-2026';

async function main() {
  // TODO
}

await main();`,

      '/home/joueur/projet/src/lib/create.ts': `// CONTRAT 20 — créer une ressource.
// Objectif : POST /api/users avec un nom et un email, en étant authentifié.
// Le serveur doit répondre 201. Affiche ce statut, puis l'id créé.
//
// N'oublie pas l'en-tête Content-Type: application/json,
// et JSON.stringify pour le corps.

const API = 'http://10.10.5.10:3000';
const TOKEN = 'dev-token-2026';

async function main() {
  // TODO
}

await main();`,

      '/home/joueur/projet/src/components/UserList.tsx': `// CONTRAT 21 — un composant React qui affiche les données de l'API.
// Objectif : récupérer les utilisateurs puis produire ce HTML :
//   <ul><li>Aline Nkurunziza</li>...<li>Esther Niyonkuru</li></ul>
//
// React est fourni, ainsi que renderToStaticMarkup.
// Utilise React.createElement (pas de JSX ici : le bac à sable
// n'inclut pas de transpileur JSX).
//
//   React.createElement('li', { key: u.id }, u.name)

const API = 'http://10.10.5.10:3000';
const TOKEN = 'dev-token-2026';

function UserList(props) {
  // TODO : retourne un <ul> contenant un <li> par utilisateur
}

async function main() {
  // TODO : charge les utilisateurs, rends le composant, affiche le HTML
}

await main();`,

      '/home/joueur/projet/src/app/api/users/route.ts': `// CONTRAT 22 — un Route Handler Next.js.
// Objectif : écrire la fonction GET(request) qui :
//   1. lit l'en-tête Authorization de la requête entrante
//   2. s'il manque, renvoie Response.json({error:'...'}, {status:401})
//   3. sinon, interroge l'API en amont avec ce jeton
//   4. renvoie Response.json(data, {status:200})
//
// Le harnais de test appelle ta fonction deux fois :
// une fois sans en-tête (doit donner 401), une fois avec (200).

const API = 'http://10.10.5.10:3000';

async function GET(request) {
  // TODO
}

// --- harnais : ne pas modifier ---
const sans = await GET({ headers: new Map() });
console.log('sans jeton:', sans.status);
const avec = await GET({ headers: new Map([['authorization', 'Bearer dev-token-2026']]) });
console.log('avec jeton:', avec.status);
const corps = await avec.json();
console.log('total:', corps.total);`,

      '/var/log/next.log': `[next] ready on http://10.10.5.10:3000
[api] GET /api/health 200 in 12ms
[api] GET /api/users 401 in 3ms
[api] POST /api/auth/login 200 in 41ms
[api] GET /api/users 200 in 9ms
[api] GET /api/admin/stats 403 in 2ms`
    }
  };

  // -------------------------------------------------- les contrats
  const ran = (ev, file) => ev.filter(e => e.type === 'jsrun' && new RegExp('/' + file + '\\.[jt]sx?$').test(e.path || ''));
  const lastRun = (ev, file) => { const r = ran(ev, file); return r[r.length - 1]; };
  function matchingCall(run, path, method, status) {
    return (run && run.calls || []).find(c => {
      try { return new URL(c.url).pathname === path && c.method === method && c.status === status; }
      catch (_) { return false; }
    });
  }
  function totalDisplayed(run, label) {
    const call = matchingCall(run, '/api/users', 'GET', 200);
    const prefix = label ? label + '\\s*:\\s*' : '(^|[^0-9])';
    return !!(call && Number.isInteger(call.total) &&
      new RegExp(prefix + call.total + '([^0-9]|$)', 'i').test(run.output || ''));
  }
  function createdIdDisplayed(run) {
    const call = matchingCall(run, '/api/users', 'POST', 201);
    return !!(call && Number.isInteger(call.createdId) &&
      new RegExp('(^|[^0-9])' + call.createdId + '([^0-9]|$)').test(run.output || ''));
  }
  function usersRendered(run) {
    const call = matchingCall(run, '/api/users', 'GET', 200);
    if (!call || !Array.isArray(call.names) || !call.names.length) return false;
    const output = run.output || '';
    const rows = output.match(/<li(?:\s[^>]*)?>[\s\S]*?<\/li>/g) || [];
    const escape = name => String(name).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    return /<ul(?:\s[^>]*)?>/.test(output) && rows.length >= call.names.length &&
      call.names.every(name => rows.some(row => row.includes(escape(name))));
  }

  const WEB_MISSIONS = [
    {
      id: 17, module: 'DÉVELOPPEMENT WEB', titre: 'Connecter l’API',
      client: 'Académie · équipe produit', reward: 400, difficulty: 2, kind: 'Premier appel réseau',
      cours: null, needsAnswer: false,
      objectives: [
        { label: 'Serveur API découvert', done: (w) => w.node('apiLab').discovered },
        { label: 'Documentation de l’API lue', done: (w, sh, ev) => ev.some(e => e.type === 'read' && (e.paths || []).some(p => /API\.md/.test(p))) },
        { label: 'health.ts exécuté et affichant « ok »', done: (w, sh, ev) => { const r = lastRun(ev, 'health'); return !!(r && r.ok && /\bok\b/.test(r.output || '') && matchingCall(r, '/api/health', 'GET', 200)); } }
      ],
      brief: `OBJECTIF
  Écris le premier appel réseau de l'application.

ÉTAPES
  nmap -sn 10.10.0.0/16          depuis ACADEMIE
  ssh root@10.10.5.10            (hydra trouve le mot de passe)
  curl http://10.10.5.10:3000/api/health
  cat /home/joueur/projet/API.md
  cd /home/joueur/projet
  editeur src/lib/health.ts
  npx tsx src/lib/health.ts

Ton code doit afficher : ok

Le fetch est RÉELLEMENT exécuté contre l'API du serveur.`,
      validate(w, sh, ev) {
        const r = lastRun(ev, 'health');
        const docs = ev.some(e => e.type === 'read' && (e.paths || []).some(p => /API\.md$/.test(p)));
        const ok = !!(w.node('apiLab').discovered && docs && r && r.ok &&
          /\bok\b/.test(r.output || '') && matchingCall(r, '/api/health', 'GET', 200));
        const hint = !w.node('apiLab').discovered ? 'Découvre le serveur API depuis ACADEMIE avec nmap.'
          : !docs ? 'Lis la documentation : cat /home/joueur/projet/API.md'
          : 'Complète src/lib/health.ts puis : npx tsx src/lib/health.ts';
        return { done: ok, hint: ok ? '' : hint };
      },
      debrief: `Tu as fait le geste de base de toute application web : appeler
une API et lire sa réponse.

Trois choses à retenir :
  - fetch est asynchrone : await fetch(...), puis await r.json()
  - la réponse a un statut ; le corps n'est pas la réponse entière
  - l'URL doit être absolue ou correctement relative à l'origine`
    },
    {
      id: 18, module: 'DÉVELOPPEMENT WEB', titre: 'S’authentifier',
      client: 'Académie · équipe produit', reward: 600, difficulty: 3, kind: 'Jeton Bearer',
      cours: null, needsAnswer: false,
      objectives: [
        { label: 'POST /api/auth/login réussi', done: (w, sh, ev) => !!matchingCall(lastRun(ev, 'users'), '/api/auth/login', 'POST', 200) },
        { label: 'GET /api/users avec un jeton', done: (w, sh, ev) => { const r = lastRun(ev, 'users'); return !!(r && r.authedUsers); } },
        { label: 'Le nombre d’utilisateurs est affiché', done: (w, sh, ev) => { const r = lastRun(ev, 'users'); return !!(r && r.ok && totalDisplayed(r)); } }
      ],
      brief: `OBJECTIF
  L'API refuse les requêtes anonymes (401). Authentifie-toi.

ÉTAPES
  editeur src/lib/users.ts
  npx tsx src/lib/users.ts

Ton code doit :
  1. POST /api/auth/login  {email, password}
     (identifiants dans .env.local — cat ../.env.local)
  2. lire le champ "token" de la réponse
  3. GET /api/users avec  Authorization: Bearer <token>
  4. afficher le total

C'est le schéma d'authentification le plus répandu du web.`,
      validate(w, sh, ev) {
        const r = lastRun(ev, 'users');
        const ok = !!(r && r.ok && r.authedUsers &&
          matchingCall(r, '/api/auth/login', 'POST', 200) && totalDisplayed(r));
        return { done: ok, hint: ok ? '' : 'Login POST → token → GET /api/users avec l’en-tête Authorization' };
      },
      debrief: `Le schéma complet :
  POST /api/auth/login  →  { token }
  Authorization: Bearer <token>  sur chaque requête suivante

Un 401 signifie « je ne sais pas qui tu es ».
Un 403 signifie « je sais qui tu es, et tu n'as pas le droit ».
Les confondre est l'erreur de débutant la plus courante.`
    },
    {
      id: 19, module: 'DÉVELOPPEMENT WEB', titre: 'Gérer les erreurs HTTP',
      client: 'Académie · fiabilité', reward: 550, difficulty: 3, kind: 'Robustesse',
      cours: null, needsAnswer: false,
      objectives: [
        { label: 'Le code ne plante pas sur un 403', done: (w, sh, ev) => { const r = lastRun(ev, 'admin'); return !!(r && r.ok); } },
        { label: 'Le statut 403 est détecté et affiché', done: (w, sh, ev) => { const r = lastRun(ev, 'admin'); return !!(r && /403/.test(r.output || '') && matchingCall(r, '/api/admin/stats', 'GET', 403)); } }
      ],
      brief: `OBJECTIF
  Appelle /api/admin/stats avec un jeton de compte USER.
  Le serveur répond 403. Ton code doit le gérer proprement.

  editeur src/lib/admin.ts
  npx tsx src/lib/admin.ts

Attendu : aucune exception, et une ligne contenant 403.

Le piège : lire r.json().data alors que la réponse est une erreur
provoque un TypeError. Vérifie r.ok AVANT de lire les données.`,
      validate(w, sh, ev) {
        const r = lastRun(ev, 'admin');
        const ok = !!(r && r.ok && /403/.test(r.output || '') &&
          matchingCall(r, '/api/admin/stats', 'GET', 403));
        return { done: ok, hint: ok ? '' : 'Teste r.ok (ou r.status) avant de lire le corps, et affiche 403' };
      },
      debrief: `Une API bien élevée renvoie une erreur STRUCTURÉE.
Ton client doit la lire, pas la subir.

  const r = await fetch(url, { headers });
  if (!r.ok) {
    console.error('échec', r.status);
    return;
  }
  const data = await r.json();

En production, c'est cette discipline qui évite l'écran blanc.`
    },
    {
      id: 20, module: 'DÉVELOPPEMENT WEB', titre: 'Créer une ressource',
      client: 'Académie · équipe produit', reward: 500, difficulty: 3, kind: 'POST et 201',
      cours: null, needsAnswer: false,
      objectives: [
        { label: 'POST /api/users émis', done: (w, sh, ev) => { const r = lastRun(ev, 'create'); return !!(r && (r.calls || []).some(c => /\/api\/users/.test(c.url) && c.method === 'POST')); } },
        { label: 'Le serveur a répondu 201', done: (w, sh, ev) => !!matchingCall(lastRun(ev, 'create'), '/api/users', 'POST', 201) },
        { label: 'L’utilisateur existe vraiment côté serveur', done: (w, sh, ev) => { const r = lastRun(ev, 'create'); return !!(r && r.created); } }
      ],
      brief: `OBJECTIF
  Crée un utilisateur via l'API.

  editeur src/lib/create.ts
  npx tsx src/lib/create.ts

Ton code doit envoyer :
  method: 'POST'
  headers: { 'Content-Type': 'application/json',
             Authorization: 'Bearer dev-token-2026' }
  body: JSON.stringify({ name: '...', email: '...' })

Puis afficher le statut (201) et l'id renvoyé.

201 Created est le code correct pour une création — pas 200.`,
      validate(w, sh, ev) {
        const r = lastRun(ev, 'create');
        const ok = !!(r && r.ok && /\b201\b/.test(r.output || '') && r.created &&
          matchingCall(r, '/api/users', 'POST', 201) && createdIdDisplayed(r));
        return { done: ok, hint: ok ? '' : 'POST avec Content-Type et JSON.stringify, puis affiche 201 et l’id' };
      },
      debrief: `Les codes HTTP ne sont pas décoratifs :
  200 OK          la requête a réussi
  201 Created     une ressource est née (souvent + en-tête Location)
  400 Bad Request il manque un champ
  409 Conflict    la ressource existe déjà (email pris)

Savoir les distinguer, c'est savoir dialoguer avec n'importe quelle API.`
    },
    {
      id: 21, module: 'DÉVELOPPEMENT WEB', titre: 'Un composant React branché',
      client: 'Académie · interface', reward: 800, difficulty: 4, kind: 'React + données',
      cours: null, needsAnswer: false,
      objectives: [
        { label: 'Données chargées depuis l’API', done: (w, sh, ev) => { const r = lastRun(ev, 'UserList'); return !!(r && r.authedUsers); } },
        { label: 'Un <ul> est produit', done: (w, sh, ev) => { const r = lastRun(ev, 'UserList'); return !!(r && /<ul(?:\s[^>]*)?>/.test(r.output || '')); } },
        { label: 'Les utilisateurs chargés sont rendus en <li>', done: (w, sh, ev) => usersRendered(lastRun(ev, 'UserList')) }
      ],
      brief: `OBJECTIF
  Écris un composant React qui affiche les utilisateurs de l'API.

  editeur src/components/UserList.tsx
  npx tsx src/components/UserList.tsx

React et renderToStaticMarkup sont fournis. Pas de JSX ici :
utilise React.createElement.

  React.createElement('li', { key: u.id }, u.name)
  React.createElement('ul', null, liste.map(...))

Attendu : un <ul> avec un <li> par utilisateur retourné par l’API.`,
      validate(w, sh, ev) {
        const r = lastRun(ev, 'UserList');
        const ok = !!(r && r.ok && r.authedUsers && usersRendered(r));
        return { done: ok, hint: ok ? '' : 'Charge les utilisateurs, rends un <ul> de <li> et affiche le HTML' };
      },
      debrief: `Un composant n'est qu'une fonction : données → éléments.

  function UserList({ users }) {
    return React.createElement('ul', null,
      users.map(u => React.createElement('li', { key: u.id }, u.name)));
  }

La clé (key) n'est pas cosmétique : sans elle, React ne sait pas
quel élément a changé et re-rend tout.

Dans Next.js, ce composant serait un Server Component : le fetch
se fait côté serveur, et le HTML arrive déjà rempli.`
    },
    {
      id: 22, module: 'DÉVELOPPEMENT WEB', titre: 'Un Route Handler Next.js',
      client: 'Académie · équipe produit', reward: 1000, difficulty: 5, kind: 'Backend Next.js',
      cours: null, needsAnswer: false,
      objectives: [
        { label: 'Requête sans jeton → 401', done: (w, sh, ev) => { const r = lastRun(ev, 'route'); return !!(r && /sans jeton:\s*401/.test(r.output || '')); } },
        { label: 'Requête avec jeton → 200', done: (w, sh, ev) => { const r = lastRun(ev, 'route'); return !!(r && /avec jeton:\s*200/.test(r.output || '')); } },
        { label: 'Les données remontent jusqu’au client', done: (w, sh, ev) => totalDisplayed(lastRun(ev, 'route'), 'total') }
      ],
      brief: `OBJECTIF — le contrat final
  Écris le Route Handler src/app/api/users/route.ts.

  editeur src/app/api/users/route.ts
  npx tsx src/app/api/users/route.ts

Ta fonction GET(request) doit :
  1. lire request.headers.get('authorization')
  2. absent → Response.json({error:'…'}, {status:401})
  3. présent → fetch l'API amont avec ce jeton
  4. renvoyer Response.json(data, {status:200})

Le harnais teste les deux cas et affiche :
  sans jeton: 401
  avec jeton: 200
  total: 5   (ou plus si tu as créé des utilisateurs)

C'est exactement un fichier route.ts de Next.js App Router.`,
      validate(w, sh, ev) {
        const r = lastRun(ev, 'route');
        const ok = !!(r && r.ok && r.authedUsers && /sans jeton:\s*401/.test(r.output || '') &&
          /avec jeton:\s*200/.test(r.output || '') && totalDisplayed(r, 'total'));
        return { done: ok, hint: ok ? '' : 'GET doit renvoyer 401 sans en-tête, 200 avec, et relayer le JSON' };
      },
      debrief: `Tu viens d'écrire un backend.

Dans Next.js App Router, un fichier route.ts exporte des fonctions
nommées GET, POST, PUT, DELETE. Elles reçoivent une Request et
renvoient une Response. C'est tout.

  export async function GET(request: Request) {
    const auth = request.headers.get('authorization');
    if (!auth) return Response.json({ error: 'unauthorized' }, { status: 401 });
    const r = await fetch(UPSTREAM + '/api/users', { headers: { authorization: auth } });
    return Response.json(await r.json(), { status: r.status });
  }

Ton serveur ne fait jamais confiance au client : il vérifie, puis
 relaie. C'est la base d'une architecture saine.`
    }
  ];

  // -------------------------------------------------- commandes
  function install(game) {
    const api = new global.ApiServerMod.ApiServer();
    game.api = api;
    const cmds = game.shell.commands;
    const w = () => game.world;

    async function runFile(arg, runner) {
      const n = w().target;
      const p = game.shell.resolve(arg);
      const f = n.get(p);
      if (!f || f.type !== 'file') return { out: `${runner}: ${arg}: fichier introuvable`, code: 1 };
      if (n.id !== 'apiLab' && !/\.([jt]sx?)$/.test(p)) {
        return { out: `${runner}: ${arg}: extension non reconnue`, code: 1 };
      }
      const before = api.users.length;
      const res = await global.JsRun.run(f.content, api, { apiBase: 'http://10.10.5.10:3000' });
      // Ce que le code a réellement accompli, pour les validateurs.
      // Seuls les appels de cette exécution, et leur vrai statut simulé,
      // comptent. Un ancien appel ou un jeton invalide ne valide pas la mission.
      const authedUsers = !!matchingCall(res, '/api/users', 'GET', 200);
      const created = api.users.length > before;
      game.record('jsrun', {
        path: p, ok: res.ok, output: res.output, error: res.error || null,
        calls: res.calls, authedUsers, created, runner
      });
      const head = `${runner} ${p}`;
      if (res.ok) {
        return { out: head + '\n' + (res.output || '(aucune sortie)') + '\n\n[processus terminé · code 0]', code: 0 };
      }
      return {
        out: head + '\n' + (res.output ? res.output + '\n' : '') + '\n' + (res.error || 'erreur inconnue') +
          '\n\n[processus terminé · code 1]', code: 1
      };
    }

    // node / npx tsx / tsx : exécution asynchrone, on rend la main via une promesse.
    cmds.node = function (a) {
      if (!a.length) return { out: 'usage: node <fichier.js>', code: 1 };
      return { out: '__ASYNC__' + JSON.stringify({ kind: 'run', arg: a[0], runner: 'node' }), code: 0 };
    };
    cmds.tsx = function (a) {
      if (!a.length) return { out: 'usage: npx tsx <fichier.ts>', code: 1 };
      return { out: '__ASYNC__' + JSON.stringify({ kind: 'run', arg: a[0], runner: 'tsx' }), code: 0 };
    };
    cmds.npx = function (a) {
      if (a[0] === 'tsx') return cmds.tsx.call(this, a.slice(1));
      if (a[0] === 'tsc') {
        return { out: 'tsc: la vérification de types complète demande le compilateur TypeScript.\nIci, les annotations sont retirées puis le code est exécuté : npx tsx <fichier>', code: 0 };
      }
      return { out: `npx: '${a[0] || ''}' n'est pas installé sur ce labo. Disponibles : tsx`, code: 1 };
    };
    cmds.npm = function (a) {
      if (a[0] === 'run' && a[1] === 'dev') {
        return { out: '> next dev\n\n  ▲ Next.js 15.1.0\n  - Local:   http://10.10.5.10:3000\n  - Environments: .env.local\n\n ✓ Ready in 1.8s\n\nTeste l\'API :  curl http://10.10.5.10:3000/api/health', code: 0 };
      }
      if (a[0] === 'run' && a[1] === 'build') {
        return { out: '> next build\n\n ✓ Compiled successfully\n ✓ Collecting page data\n\nRoute (app)                    Size\n┌ ○ /                          1.2 kB\n├ ƒ /api/users                 0 B\n└ ○ /_not-found                0 B\n\n○  (Static)   prerendered\nƒ  (Dynamic)  server-rendered on demand', code: 0 };
      }
      if (a[0] === 'install' || a[0] === 'i') {
        return { out: 'Les dépendances sont déjà installées sur ce labo (Next.js 15.1, React 19, TypeScript 5.7).', code: 0 };
      }
      return { out: 'usage: npm run dev | npm run build | npm install', code: 1 };
    };

    // curl interroge réellement l'API quand on vise le port 3000 du labo.
    const baseCurl = cmds.curl;
    cmds.curl = function (a, raw) {
      const url = a.find(x => /^https?:\/\//.test(x));
      if (url && /10\.10\.5\.10(:3000)?/.test(url)) {
        const headOnly = a.includes('-I');
        // indexOf renvoie -1 quand l'option est absente : ne jamais faire +1 aveuglément.
        const xi = a.indexOf('-X');
        const method = (xi >= 0 && a[xi + 1] ? a[xi + 1] : (headOnly ? 'HEAD' : 'GET')).toUpperCase();
        const r = api.handle(method === 'HEAD' ? 'GET' : method, url, {});
        game.record('curl', { target: 'apiLab', path: new URL(url).pathname, status: r.status });
        const lines = [`HTTP/1.1 ${r.status}`];
        for (const k in r.headers) lines.push(`${k}: ${r.headers[k]}`);
        if (headOnly) return { out: lines.join('\n'), code: 0 };
        return { out: JSON.stringify(r.body, null, 2), code: r.status < 400 ? 0 : 1 };
      }
      return baseCurl ? baseCurl.call(this, a, raw) : { out: 'curl: hôte injoignable', code: 1 };
    };

    // Route d'API consultable : la doc du serveur.
    cmds.api = function () {
      const rows = api.routes().map(([m, p, auth, d]) =>
        `  ${m.padEnd(7)} ${p.padEnd(22)} ${auth.padEnd(7)} ${d}`);
      return {
        out: `API DE L'ACADÉMIE — http://10.10.5.10:3000

${rows.join('\n')}

  Authentification : Authorization: Bearer <token>
  Obtenir un jeton : POST /api/auth/login {email,password}

  curl http://10.10.5.10:3000/api/health
  npx tsx src/lib/health.ts`, code: 0
      };
    };

    game.runWebFile = runFile;
    return game;
  }

  const mod = { WEB_NODE, WEB_MISSIONS, install };
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  global.WebDev = mod;

  // Greffe sur la campagne existante.
  const C = global.Campaign || (typeof require === 'function' ? require('./campaign.js') : null);
  if (C && C.WORLD_SPEC && !C.WORLD_SPEC.nodes.some(n => n.id === 'apiLab')) {
    C.WORLD_SPEC.nodes.push(WEB_NODE);
    const hub = C.WORLD_SPEC.nodes.find(n => n.id === 'academie');
    if (hub && !hub.links.includes('apiLab')) hub.links.push('apiLab');
    for (const m of WEB_MISSIONS) C.MISSIONS.push(m);
  }
})(typeof window !== 'undefined' ? window : globalThis);
