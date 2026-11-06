'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

require('../src/js/py.js');
require('../src/js/engine.js');
require('../src/js/campaign.js');
const Api = require('../src/js/apiserver.js');
const JsRun = require('../src/js/jsrun.js');
const WebDev = require('../src/js/webdev.js');
const { Game } = require('../src/js/game.js');
const Programs = require('../src/js/programs.js');
const RealCommands = require('../src/js/realcmd.js');
const Echo = require('../src/js/echo.js');

function newGame() {
  const game = new Game();
  Programs.install(game, { traceEnabled: false });
  RealCommands.install(game);
  WebDev.install(game);
  return game;
}

const paths = {
  health: '/home/joueur/projet/src/lib/health.ts',
  users: '/home/joueur/projet/src/lib/users.ts',
  admin: '/home/joueur/projet/src/lib/admin.ts',
  create: '/home/joueur/projet/src/lib/create.ts',
  UserList: '/home/joueur/projet/src/components/UserList.tsx',
  route: '/home/joueur/projet/src/app/api/users/route.ts'
};

const solutions = {
  health: `const r = await fetch('/api/health');
    const data = await r.json(); console.log(data.status);`,
  users: `async function login(email: string, password: string) {
      const r = await fetch('/api/auth/login', {method:'POST',
        headers:{'Content-Type':'application/json'}, body:JSON.stringify({email,password})});
      return await r.json();
    }
    const session = await login('eric@academie.bi','motdepasse123');
    const r = await fetch('/api/users', {headers:{Authorization:'Bearer '+session.token}});
    console.log((await r.json()).total);`,
  admin: `const r = await fetch('/api/admin/stats', {headers:{Authorization:'Bearer dev-token-2026'}});
    if (!r.ok) console.log('Erreur',r.status);`,
  create: `const r = await fetch('/api/users', {method:'POST',
      headers:{'Content-Type':'application/json',Authorization:'Bearer dev-token-2026'},
      body:JSON.stringify({name:'Nouveau',email:'nouveau@example.invalid'})});
    console.log(r.status,(await r.json()).data.id);`,
  UserList: `function UserList({users}) {
      return React.createElement('ul',null,users.map(u=>React.createElement('li',{key:u.id},u.name)));
    }
    const r = await fetch('/api/users',{headers:{Authorization:'Bearer dev-token-2026'}});
    const body = await r.json();
    console.log(renderToStaticMarkup(React.createElement(UserList,{users:body.data})));`,
  route: `async function GET(request) {
      const auth = request.headers.get('authorization');
      if (!auth) return Response.json({error:'unauthorized'},{status:401});
      const r = await fetch('/api/users',{headers:{Authorization:auth}});
      return Response.json(await r.json(),{status:r.status});
    }
    const sans = await GET({headers:new Map()}); console.log('sans jeton:',sans.status);
    const avec = await GET({headers:new Map([['authorization','Bearer dev-token-2026']])});
    console.log('avec jeton:',avec.status); console.log('total:',(await avec.json()).total);`
};

async function runWebFile(game, key, source) {
  game.world.node('apiLab').addFile(paths[key], source, { owner: 'joueur' });
  return game.runWebFile(paths[key], 'tsx');
}

test('première mission : découverte, SSH, lecture et validation réelles', () => {
  const g = newGame();
  assert.equal(g.mission.id, 1);
  assert.equal(g.shell.exec('pwd').out, '/home/joueur');
  assert.equal(g.shell.exec('nmap -sn 10.10.0.0/24').code, 0);
  assert.equal(g.world.node('academie').discovered, true);
  assert.match(g.shell.exec('ssh joueur@10.10.0.1').out, /^__SSHPASS__/);
  assert.equal(g.trySshPassword('joueur').code, 0);
  assert.equal(g.world.current, 'academie');
  assert.equal(g.shell.exec('cat /home/cours/01_navigation.txt').code, 0);
  assert.equal(g.checkMission().done, true);
  assert.match(g.shell.exec('valider').out, /^__MISSION_DONE__/);
  assert.equal(g.mission.id, 2);
  assert(g.completed.has(1));
  assert.equal(global.Campaign.MISSIONS.length, 22);
});

test('sauvegarde de l’API, compatibilité ancienne et import invalide non destructif', () => {
  const g = newGame();
  const legacy = JSON.parse(g.serialize());
  delete legacy.api;
  delete legacy.tutorial;
  delete legacy.intro;
  delete legacy.reports;

  const response = g.api.handle('POST', '/api/users', {
    headers: { authorization: 'Bearer dev-token-2026' },
    body: JSON.stringify({ name: 'Test', email: 'test@example.invalid' })
  });
  assert.equal(response.status, 201);
  g.tutorial.step = 3;
  g.intro = { terminee: false, etape: 2, pauseEnregistreeA: 1000 };
  g.reports['bb-03'] = { valide: true };
  const saved = g.serialize();
  const loaded = newGame();
  loaded.restore(saved);
  assert.equal(loaded.api.users.length, 6);
  assert.equal(loaded.api.users[5].email, 'test@example.invalid');
  assert.equal(loaded.api.nextId, 7);
  assert.equal(loaded.tutorial.step, 3);
  assert.deepEqual(loaded.intro, { terminee: false, etape: 2, pauseEnregistreeA: 1000 });
  assert.equal(loaded.reports['bb-03'].valide, true);
  assert.equal(JSON.parse(saved).api.calls, undefined);

  const before = loaded.serialize();
  assert.throws(() => loaded.restore('{"v":4}'), /incomplète|corrompue/);
  for (const corrupt of [
    d => { d.programs = {}; },
    d => { d.narrative = 'journal cassé'; },
    d => { d.api.users.push(null); },
    d => { d.contracts.active = {}; },
    d => { d.tutorial.step = 1.5; },
    d => { d.intro.terminee = 'oui'; },
    d => { d.intro.etape = -1; },
    d => { d.intro.etape = 1.5; },
    d => { d.intro.pauseEnregistreeA = 'hier'; },
    d => { d.incidentsNoirs.push(null); },
    d => { d.tacheNoire.sauvegardes = { '/home/joueur/bloc_notes.txt': { contenu: 42, marqueur: 'x' } }; },
    d => { d.relais.position = 4; },
    d => { d.sats = -1; },
    d => { d.events.push({ type: 'read', paths: [null] }); },
    d => { d.nodes[Object.keys(d.nodes)[0]].files['/tmp/cassé'] = { type: 'file', content: null }; }
  ]) {
    const bad = JSON.parse(before);
    bad.credits = 98765; // Une mutation prématurée serait visible.
    corrupt(bad);
    assert.throws(() => loaded.restore(JSON.stringify(bad)), /invalide/);
    assert.equal(loaded.serialize(), before);
  }
  assert.equal(loaded.api.users.length, 6);
  assert.equal(loaded.mission.id, 1);
  loaded.restore(JSON.stringify(legacy));
  assert.equal(loaded.api.users.length, 5);
  assert.equal(loaded.tutorial.hidden, true);
  assert.deepEqual(loaded.intro, { terminee: true, etape: 0 });
  assert.deepEqual(loaded.reports, {});
});

test('ECHO : la décroissance repart de l’heure restaurée', () => {
  const g = newGame();
  Echo.install(g);
  g.worldMin = 10;
  g.echo = { nodes: { academie: { bruit: 80, signalements: 0, tracee: false } } };
  const saved = g.serialize();
  g.worldMin = 1000;
  g._echoMonde = 1000;
  g._clockLast = 1;
  g.restore(saved);
  assert.equal(g._echoMonde, 10);
  assert(g._clockLast > 1);
  g.worldMin = 370;
  g.tick(Date.now());
  assert(Math.abs(g.echo.nodes.academie.bruit - 40) < 0.001);
});

test('rapport : dossier correct, gabarit vide refusé et rapport rempli accepté', () => {
  const g = newGame();
  g.world.current = 'codeLab';
  assert.match(g.shell.exec('rapport bb-03').out, /^__EDIT_HOME__/);
  assert.equal(g.world.home.get('/home/joueur/rapports').type, 'dir');
  assert.equal(g.shell.exec('rapport soumettre bb-03').code, 1);
  const path = '/home/joueur/rapports/rapport_bb-03.txt';
  g.world.home.addFile(path, '1. VULNÉRABILITÉ\nInjection\n2. PREUVE\nParamètre vulnérable\n3. IMPACT\nFuite\n4. CORRECTIF\nRequêtes préparées\n5. SIGNATURE\nJoueur', { owner: 'joueur' });
  assert.equal(g.shell.exec('rapport soumettre bb-03').code, 0);
  assert.equal(g.reports['bb-03'].valide, true);
});

test('configuration Tauri : ressources, icônes et accès IPC présents', () => {
  const base = path.resolve(__dirname, '../src-tauri');
  const config = JSON.parse(fs.readFileSync(path.join(base, 'tauri.conf.json'), 'utf8'));
  assert(config.app.security.csp.includes('ipc:'));
  assert(config.app.security.csp.includes('http://ipc.localhost'));
  assert(fs.existsSync(path.resolve(base, '../content')));
  for (const icon of config.bundle.icon) assert(fs.existsSync(path.resolve(base, icon)), icon);
  const png = fs.readFileSync(path.join(base, 'icons/icon.png'));
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16), 512);
  assert.equal(png.readUInt32BE(20), 512);
  assert.equal(fs.readFileSync(path.join(base, 'icons/icon.icns')).subarray(0, 4).toString(), 'icns');
  assert.equal(fs.readFileSync(path.join(base, 'icons/icon.ico')).readUInt16LE(2), 1);
  const rust = fs.readFileSync(path.join(base, 'src/main.rs'), 'utf8');
  assert.match(rust, /\.plugin\(tauri_plugin_dialog::init\(\)\)/);
  assert.match(rust, /async fn export_save\(/);
  assert.match(rust, /async fn import_save\(/);
  assert.match(rust, /tauri::generate_handler!\[[\s\S]*export_save,[\s\S]*import_save,/);
});

test('API fictive : auth, statuts et création', () => {
  const api = new Api.ApiServer();
  assert.equal(api.handle('GET', '/api/health').status, 200);
  assert.equal(api.handle('GET', '/api/users').status, 401);
  assert.equal(api.handle('GET', '/api/users', { headers: { Authorization: 'Bearer invalid' } }).status, 401);
  assert.equal(api.handle('GET', '/api/admin/stats', { headers: { Authorization: 'Bearer dev-token-2026' } }).status, 403);
  assert.equal(api.handle('GET', '/api/admin/stats', { headers: { Authorization: 'Bearer admin-token-2026' } }).status, 200);
  const headers = { Authorization: 'Bearer admin-token-2026' };
  assert.equal(api.handle('POST', '/api/users', { headers, body: { name: 'Test', email: 'test@example.invalid', city: 42 } }).status, 400);
  assert.equal(api.handle('POST', '/api/users', { headers, body: { name: 'Test', email: 'test@example.invalid', city: 'Gitega' } }).status, 201);
  assert.equal(api.handle('GET', '/api/users?city=Gitega', { headers }).body.total, 2);
  assert.equal(api.handle('DELETE', '/api/users/1', { headers }).status, 204);
  assert.equal(api.handle('POST', '/api/auth/login', { body: { email: 'aline@academie.bi', password: 'Adm1n!2026' } }).status, 401);
});

test('QuickJS : API simulée, TypeScript, React, isolation et interruption', async () => {
  const api = new Api.ApiServer();
  const health = await JsRun.run(`const r=await fetch('/api/health'); console.log((await r.json()).status)`, api);
  assert.equal(health.ok, true);
  assert.equal(health.output, 'ok');
  assert.equal(health.calls[0].status, 200);

  const ts = await JsRun.run('interface N { x: number }\nconst n: number = 4; console.log(n + 2);', api);
  assert.equal(ts.ok, true);
  assert.equal(ts.output, '6');
  const react = await JsRun.run(`console.log(renderToStaticMarkup(React.createElement('ul',null,React.createElement('li',null,'A&B'))));`, api);
  assert.equal(react.output, '<ul><li>A&amp;B</li></ul>');

  let realFetchCalls = 0;
  const originalFetch = global.fetch;
  global.fetch = () => { realFetchCalls++; throw new Error('réseau réel appelé'); };
  try {
    const isolate = await JsRun.run(`console.log(typeof window,typeof process,typeof require,typeof XMLHttpRequest,typeof WebSocket);
      try { await globalThis.fetch('https://exemple.invalid/probe'); } catch(e) { console.log(e.message); }`, api);
    assert.equal(isolate.ok, true);
    assert.match(isolate.output, /^undefined undefined undefined undefined undefined/);
    assert.match(isolate.output, /seule l.API simulée est accessible/);
    assert.equal(realFetchCalls, 0);
    assert.equal(isolate.calls.length, 0);
    const loop = await JsRun.run('while (true) {}', api, { timeout: 120 });
    assert.equal(loop.ok, false);
    assert.match(loop.error, /TimeoutError/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('missions web : solutions exécutées et faux résultats refusés', async () => {
  const g = newGame();
  g.world.current = 'apiLab';
  const keys = ['health', 'users', 'admin', 'create', 'UserList', 'route'];
  const bad = {
    health: `console.log('ok');`,
    users: `await fetch('/api/auth/login',{method:'POST',body:JSON.stringify({email:'eric@academie.bi',password:'motdepasse123'})});
      await fetch('/api/users',{headers:{Authorization:'Bearer invalid'}}); console.log('5');`,
    admin: `console.log('403');`,
    create: `const r=await fetch('/api/users',{method:'POST',headers:{Authorization:'Bearer dev-token-2026'},
      body:JSON.stringify({name:'Autre',email:'autre@example.invalid'})}); console.log(r.status);`,
    UserList: `await fetch('/api/users',{headers:{Authorization:'Bearer dev-token-2026'}});
      console.log('<ul><li>Aline</li><li>X</li><li>X</li><li>X</li><li>X</li></ul>');`,
    route: `await fetch('/api/users',{headers:{Authorization:'Bearer dev-token-2026'}});
      console.log('sans jeton: 401'); console.log('avec jeton: 200'); console.log('total: 999');`
  };
  g.world.node('apiLab').discovered = true;
  g.record('read', { paths: ['/home/joueur/projet/API.md'] });
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i], mission = WebDev.WEB_MISSIONS[i];
    await runWebFile(g, key, bad[key]);
    assert.equal(mission.validate(g.world, g.shell, g.events).done, false, `faux résultat accepté : ${mission.id}`);
    const run = await runWebFile(g, key, solutions[key]);
    assert.equal(run.code, 0, `exécution mission ${mission.id} : ${run.out}`);
    assert.equal(mission.validate(g.world, g.shell, g.events).done, true, `solution refusée : ${mission.id}`);
  }
});
