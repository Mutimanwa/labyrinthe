'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const PYTHON = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
let server, browser, base;

before(async () => {
  server = spawn(PYTHON, ['serve.py', '--bind', '127.0.0.1', '--port', '0'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe']
  });
  base = await new Promise((resolve, reject) => {
    let stdout = '', stderr = '';
    const timer = setTimeout(() => reject(new Error('Démarrage du serveur de test expiré : ' + stderr)), 10000);
    server.stdout.on('data', data => {
      stdout += data;
      const match = stdout.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) { clearTimeout(timer); resolve('http://127.0.0.1:' + match[1]); }
    });
    server.stderr.on('data', data => { stderr += data; });
    server.on('error', err => { clearTimeout(timer); reject(err); });
    server.on('exit', code => { if (!stdout.includes('disponible')) { clearTimeout(timer); reject(new Error('Serveur arrêté : ' + code + ' ' + stderr)); } });
  });
  try {
    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.CHROMIUM_PATH || undefined,
      args: ['--disable-dev-shm-usage']
    });
  } catch (error) {
    throw new Error('Chromium indisponible. Installer avec « npx playwright install chromium » ou définir CHROMIUM_PATH. ' + error.message);
  }
});

after(async () => {
  if (browser) await browser.close();
  if (server) server.kill();
});

async function makePage(t, options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...options });
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  return { page, errors };
}
async function ready(page) {
  await page.waitForFunction(() => window.LABYRINTHE && window.LabyWeb?.ready() &&
    window.LabyContracts?.defs().length === 3 && window.LabyForum?.pret() &&
    window.LABYRINTHE.game.__profileWrap && window.LABYRINTHE.game.__contractsWrap,
  { timeout: 10000 });
}
async function command(page, text) {
  await page.locator('#cmd').fill(text);
  await page.locator('#cmd').press('Enter');
}

test('démarrage, packs et guide jusqu’à la première mission', async t => {
  const { page, errors } = await makePage(t);
  const failed = [];
  page.on('response', response => { if (response.status() >= 400) failed.push(response.url()); });
  await page.goto(base, { waitUntil: 'load' });
  await ready(page);
  assert.equal(await page.title(), 'LABYRINTHE');
  assert.equal(await page.evaluate(() => LabyWeb.sites().length), 12);
  assert.equal(await page.evaluate(() => Campaign.MISSIONS.length), 22);
  assert.match(await page.locator('#termOut').innerText(), /POUR COMMENCER/);
  assert.equal(await page.locator('#tutorialProgress').innerText(), '1/6');

  await page.locator('#tutorialSkip').click();
  assert.equal(await page.locator('#panelTutorial').isVisible(), false);
  await page.locator('#icoTutorial').click();
  assert.equal(await page.locator('#panelTutorial').isVisible(), true);
  await page.locator('#tutorialInsert').click();
  assert.equal(await page.locator('#cmd').inputValue(), 'pwd');
  await page.locator('#cmd').press('Enter');
  assert.equal(await page.locator('#tutorialProgress').innerText(), '2/6');
  await command(page, 'nmap -sn 10.10.0.0/24');
  assert.equal(await page.locator('#tutorialProgress').innerText(), '3/6');
  assert.equal(await page.locator('#missionBody .obj.done').count(), 1);
  await command(page, 'ssh joueur@10.10.0.1');
  assert.equal(await page.locator('#cmd').getAttribute('type'), 'password');
  await page.locator('#icoHelp').click(); // Un bouton ne doit pas être pris pour le mot de passe.
  assert.equal(await page.evaluate(() => !!LABYRINTHE.game.pendingSsh), true);
  await command(page, 'joueur');
  assert.equal(await page.locator('#cmd').getAttribute('type'), 'text');
  assert.equal(await page.locator('#tutorialProgress').innerText(), '4/6');
  const echoes = await page.locator('#termOut .echo').allTextContents();
  assert(!echoes.some(row => /^>\s*joueur\s*$/.test(row)), 'le mot de passe est apparu dans le terminal');
  await page.locator('#cmd').press('ArrowUp');
  assert.equal(await page.locator('#cmd').inputValue(), 'ssh joueur@10.10.0.1');
  await command(page, 'ls /home/cours');
  assert.equal(await page.locator('#tutorialProgress').innerText(), '5/6');
  await command(page, 'cat /home/cours/01_navigation.txt');
  assert.equal(await page.locator('#tutorialProgress').innerText(), '6/6');
  assert.equal(await page.locator('#missionBody .obj.done').count(), 3);
  await command(page, 'valider');
  assert.match(await page.locator('#tutorialTitle').innerText(), /accomplis/);
  assert.equal(await page.evaluate(() => LABYRINTHE.game.mission.id), 2);

  await page.locator('#icoBrowser').click();
  await page.waitForFunction(() => document.querySelector('#webBody')?.textContent.includes('FOUINE'));
  assert.deepEqual(failed, []);
  assert.deepEqual(errors, []);
});

test('sauvegarde, restauration, import invalide et reset web', async t => {
  const { page, errors } = await makePage(t);
  await page.goto(base);
  await ready(page);
  assert.equal(await page.evaluate(() => LABYRINTHE.game.api.handle('POST', '/api/users', {
    headers: { authorization: 'Bearer dev-token-2026' },
    body: JSON.stringify({ name: 'Audit', email: 'audit@example.invalid' })
  }).status), 201);
  await command(page, 'pwd');
  await command(page, 'sauver');
  await page.waitForFunction(() => localStorage.getItem('labyrinthe.save.v2')?.includes('audit@example.invalid'));
  await page.reload();
  await ready(page);
  assert.equal(await page.evaluate(() => LABYRINTHE.game.api.users.length), 6);
  assert.equal(await page.evaluate(() => LABYRINTHE.game.tutorial.step), 1);
  await page.evaluate(() => { LABYRINTHE.game.credits = 444; });
  const downloadPromise = page.waitForEvent('download');
  await command(page, 'exporter');
  const download = await downloadPromise;
  const exported = fs.readFileSync(await download.path());
  assert.equal(JSON.parse(exported.toString()).v, 4);
  await page.evaluate(() => { LABYRINTHE.game.credits = 999; });
  await page.locator('#fileInput').setInputFiles({ name: 'save.json', mimeType: 'application/json', buffer: exported });
  await page.waitForFunction(() => LABYRINTHE.game.credits === 444);
  await page.locator('#fileInput').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"v":4}') });
  await page.waitForFunction(() => document.querySelector('#termOut').textContent.includes('Fichier invalide'));
  assert.equal(await page.evaluate(() => LABYRINTHE.game.api.users.length), 6);

  // Simuler aussi une erreur après mutation partielle, et pas seulement un
  // JSON rejeté avant restauration : le retour arrière doit être effectif.
  await page.evaluate(() => {
    const g = LABYRINTHE.game, restore = g.restore;
    g.restore = function (json) {
      const result = restore.call(this, json);
      if (JSON.parse(json).__simulateFailure) { this.credits = 1234; throw new Error('panne de restauration simulée'); }
      return result;
    };
  });
  const partial = JSON.parse(exported.toString());
  partial.__simulateFailure = true;
  await page.locator('#fileInput').setInputFiles({ name: 'partial.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(partial)) });
  await page.waitForFunction(() => document.querySelector('#termOut').textContent.includes('panne de restauration simulée'));
  assert.equal(await page.evaluate(() => LABYRINTHE.game.credits), 444);
  assert.equal(await page.evaluate(() => LABYRINTHE.game.api.users.length), 6);
  await command(page, 'pwd');

  await page.evaluate(() => { window.__oldGame = LABYRINTHE.game; });
  await command(page, 'reset oui');
  await page.waitForFunction(() => !window.__oldGame && window.LABYRINTHE?.game?.__contractsWrap && LABYRINTHE.game.__profileWrap);
  await ready(page);
  const state = await page.evaluate(() => {
    const g = LABYRINTHE.game, before = g.xp;
    g.record('nmap', { target: 'academie', sV: true });
    return { mission: g.mission.id, users: g.api.users.length, tutorial: g.tutorial,
      saved: localStorage.getItem('labyrinthe.save.v2'), xpBefore: before, xpAfter: g.xp,
      wrappers: ['__clockWrap', '__contractsWrap', '__profileWrap', '__echoWrap'].map(k => !!g[k]) };
  });
  assert.equal(state.mission, 1);
  assert.equal(state.users, 5);
  assert.equal(state.tutorial.step, 0);
  assert.equal(state.saved, null);
  assert(state.wrappers.every(Boolean));
  assert(state.xpAfter > state.xpBefore);
  assert.deepEqual(errors, []);
});

test('une sauvegarde corrompue au démarrage ne masque pas la nouvelle partie', async t => {
  const { page, errors } = await makePage(t);
  await page.addInitScript(() => localStorage.setItem('labyrinthe.save.v2', '{"v":4}'));
  await page.goto(base);
  await ready(page);
  await page.waitForFunction(() => document.querySelector('#termOut').textContent.includes('Sauvegarde précédente illisible'));
  assert.match(await page.locator('#termOut').innerText(), /POUR COMMENCER/);
  await command(page, 'pwd');
  assert.match(await page.locator('#termOut').innerText(), /\/home\/joueur/);
  assert.equal(await page.evaluate(() => LABYRINTHE.game.mission.id), 1);
  assert.deepEqual(errors, []);
});

test('navigateur interne : dernière navigation prioritaire, erreurs et historique cohérents', async t => {
  const { page, errors } = await makePage(t);
  await page.goto(base);
  await ready(page);
  await page.evaluate(() => {
    LABYRINTHE.game.xp = 1200;
    LabyWeb.open('netsec-interieur.bi/fil/inexistant'); // couche 3 : 600 ms
    LabyWeb.navigate('fouine.bi/');                    // couche 2 : 220 ms
  });
  await page.locator('#webBody .web-search').waitFor();
  await page.waitForTimeout(750); // la première réponse, plus lente, est désormais arrivée
  assert.equal(await page.locator('#webUrl').inputValue(), 'fouine.bi/');
  assert.equal(await page.locator('#webBody .web-search').count(), 1);
  assert.equal(await page.evaluate(() => LABYRINTHE.game.events.some(e => e.target === 'netsec-interieur.bi/fil/inexistant')), false);

  await page.evaluate(() => LabyWeb.navigate('inconnu.bi/page'));
  await page.locator('#webBody .web-err-code').filter({ hasText: 'NXDOMAIN' }).waitFor();
  assert.equal(await page.locator('#webUrl').inputValue(), 'inconnu.bi/page');
  assert.deepEqual((await page.evaluate(() => LabyWeb.history())).slice(-2), ['fouine.bi/', 'inconnu.bi/page']);
  await page.locator('#web button[title="Précédent"]').click();
  await page.locator('#webBody .web-search').waitFor();
  assert.equal(await page.locator('#webUrl').inputValue(), 'fouine.bi/');

  await page.evaluate(() => LabyWeb.navigate('netsec-interieur.bi/fil/inexistant'));
  await page.locator('#webBody .web-err-code').filter({ hasText: '404' }).waitFor();
  assert.equal(await page.locator('#webUrl').inputValue(), 'netsec-interieur.bi/fil/inexistant');
  assert.equal(await page.evaluate(() => LABYRINTHE.game.events.filter(e => e.target === 'netsec-interieur.bi/fil/inexistant').at(-1).found), false);
  assert.deepEqual(errors, []);
});

test('forum : question payante, réponse différée puis résolution unique', async t => {
  const { page, errors } = await makePage(t);
  await page.goto(base);
  await ready(page);
  await page.evaluate(() => { LABYRINTHE.game.xp = 1200; LABYRINTHE.game.respect = 10; LabyWeb.open('netsec-interieur.bi/poser'); });
  await page.locator('#webBody select').first().waitFor();
  await page.locator('#webBody select').nth(0).selectOption('python');
  await page.locator('#webBody select').nth(1).selectOption('1');
  await page.locator('#webBody textarea').fill('Je lis le message d’erreur.');
  await page.getByRole('button', { name: 'POSTER LE FIL' }).click();
  await page.waitForFunction(() => LABYRINTHE.game.forum?.threads.length === 1);
  await page.getByText(/En attente d'une réponse/).waitFor();
  assert.equal(await page.evaluate(() => LABYRINTHE.game.respect), 8);
  assert.equal(await page.getByRole('button', { name: /MARQUER RÉSOLU/ }).count(), 0);
  await page.evaluate(() => { const g = LABYRINTHE.game; g.worldMin = g.forum.threads[0].reponseA + 1; });
  await page.waitForFunction(() => LABYRINTHE.game.forum.threads[0].statut === 'ouvert');
  await page.getByRole('button', { name: /MARQUER RÉSOLU/ }).waitFor();
  assert.equal(await page.evaluate(() => LABYRINTHE.game.forum.threads[0].posts.length), 2);
  await page.getByRole('button', { name: /MARQUER RÉSOLU/ }).click();
  await page.waitForFunction(() => LABYRINTHE.game.forum.threads[0].statut === 'resolu');
  assert.equal(await page.evaluate(() => LABYRINTHE.game.respect), 10);
  await page.waitForTimeout(750);
  assert.equal(await page.getByRole('button', { name: /MARQUER RÉSOLU/ }).count(), 0);
  assert.deepEqual(errors, []);
});

test('phishing : une restauration reprend l’échéance et un exercice terminé reste inactif', async t => {
  const { page, errors } = await makePage(t);
  await page.goto(base);
  await ready(page);
  await page.evaluate(() => { LABYRINTHE.game.xp = 1200; LABYRINTHE.game.respect = 20; });
  await page.waitForFunction(() => LABYRINTHE.game.mail?.phish?.statut === 'envoye');
  const snapshot = await page.evaluate(() => LABYRINTHE.game.serialize());
  await page.evaluate(() => { LABYRINTHE.game.mail.phish.statut = 'rate'; });
  await page.locator('#fileInput').setInputFiles({ name: 'mail.json', mimeType: 'application/json', buffer: Buffer.from(snapshot) });
  await page.waitForFunction(() => LABYRINTHE.game.mail.phish.statut === 'envoye');
  await page.evaluate(() => { const g = LABYRINTHE.game; g.worldMin = g.mail.phish.creeA + 240; });
  await page.waitForFunction(() => LABYRINTHE.game.mail.phish.statut === 'reussi');
  assert.equal(await page.evaluate(() => LABYRINTHE.game.respect), 22);
  await page.evaluate(() => LabyMail.open());
  await page.locator('#mlList .ml-item').filter({ hasText: 'suspendu' }).click();
  const button = page.locator('#mlRead [data-phish-confirm]');
  assert.equal(await button.isDisabled(), true);
  await button.evaluate(b => { b.disabled = false; b.click(); }); // même un vieux bouton ne repénalise pas
  assert.equal(await page.evaluate(() => LABYRINTHE.game.mail.phish.statut), 'reussi');
  assert.equal(await page.evaluate(() => LABYRINTHE.game.respect), 22);
  assert.deepEqual(errors, []);
});

test('phishing : un clic coûte du respect une seule fois', async t => {
  const { page, errors } = await makePage(t);
  await page.goto(base);
  await ready(page);
  await page.evaluate(() => { LABYRINTHE.game.xp = 1200; LABYRINTHE.game.respect = 30; });
  await page.waitForFunction(() => LABYRINTHE.game.mail?.phish?.statut === 'envoye');
  await page.evaluate(() => LabyMail.open());
  await page.locator('#mlList .ml-item').filter({ hasText: 'suspendu' }).click();
  const button = page.locator('#mlRead [data-phish-confirm]');
  await button.click();
  assert.equal(await button.isDisabled(), true);
  await button.evaluate(b => { b.disabled = false; b.click(); });
  assert.equal(await page.evaluate(() => LABYRINTHE.game.mail.phish.statut), 'rate');
  assert.equal(await page.evaluate(() => LABYRINTHE.game.respect), 20);
  assert.equal(await page.evaluate(() => LABYRINTHE.game.mail.inbox.filter(m => m.sujet.includes('ÉCHOUÉ')).length), 1);
  assert.deepEqual(errors, []);
});

test('bb-03 depuis une machine distante : rapport obligatoire et récompense unique', async t => {
  const { page, errors } = await makePage(t);
  await page.goto(base);
  await ready(page);
  await page.locator('#btnContracts').click();
  await page.locator('#sideContracts .sd-card').filter({ hasText: 'bb-03' }).locator('button').click();
  await page.locator('#contractsClose').click();
  await page.evaluate(() => {
    const g = LABYRINTHE.game;
    g.world.current = 'codeLab';
    g.world.node('codeLab').discovered = true;
  });
  await command(page, 'sqlmap -u "http://10.10.2.10/login.php" --dbs --batch');
  assert.equal(await page.evaluate(() => LABYRINTHE.game.events.filter(e => e.type === 'sqlmap').length), 0);
  await command(page, 'sqlmap -u "http://10.10.2.10/login.php?id=1" --dbs --batch');
  assert.equal(await page.evaluate(() => LABYRINTHE.game.events.filter(e => e.type === 'sqlmap').length), 1);
  assert.deepEqual(await page.evaluate(() => LABYRINTHE.game.contractsState), { active: ['bb-03'], done: [] });
  assert.equal(await page.evaluate(() => LABYRINTHE.game.credits), 0);

  await command(page, 'rapport bb-03');
  assert.match(await page.locator('#editorPath').innerText(), /Ton poste/);
  assert.match(await page.locator('#editorText').inputValue(), /VULNÉRABILITÉ/);
  assert.equal(await page.evaluate(() => LABYRINTHE.game.world.home.get('/home/joueur/rapports').type), 'dir');
  await page.locator('#editorSave').click();
  await page.locator('#editorClose').click();
  await command(page, 'rapport soumettre bb-03');
  assert.equal(await page.evaluate(() => LABYRINTHE.game.reports['bb-03'].valide), false);
  assert.equal(await page.evaluate(() => LABYRINTHE.game.credits), 0);

  await command(page, 'rapport bb-03');
  await page.locator('#editorText').fill('1. VULNÉRABILITÉ\nInjection SQL\n2. PREUVE\nParamètre id\n3. IMPACT\nFuite\n4. CORRECTIF\nRequêtes préparées\n5. SIGNATURE\nJoueur');
  await page.locator('#editorSave').click();
  await page.locator('#editorClose').click();
  await command(page, 'rapport soumettre bb-03');
  const result = await page.evaluate(() => {
    const g = LABYRINTHE.game;
    g.record('rapport-valide', { id: 'bb-03' });
    return { report: g.reports['bb-03'], state: g.contractsState, credits: g.credits };
  });
  assert.equal(result.report.valide, true);
  assert.deepEqual(result.state, { active: [], done: ['bb-03'] });
  assert.equal(result.credits, 900);
  assert.deepEqual(errors, []);
});

test('pont Tauri simulé : écritures ordonnées et reset sans réimport de l’ancienne partie', async t => {
  const { page, errors } = await makePage(t);
  await page.addInitScript(() => {
    window.__TAURI__ = { core: { invoke: async (cmd, args) => {
      if (cmd === 'content_load') return await (await fetch('/content/' + args.pack)).text();
      if (cmd === 'save_read') return localStorage.getItem('__mockSQLite');
      if (cmd === 'save_write') { await new Promise(r => setTimeout(r, 150)); localStorage.setItem('__mockSQLite', args.data); return; }
      if (cmd === 'save_delete') { localStorage.removeItem('__mockSQLite'); return; }
      if (cmd === 'save_list') return [];
      if (cmd === 'app_version') return 'test';
      throw new Error('Commande inconnue : ' + cmd);
    } } };
  });
  await page.goto(base);
  await ready(page);
  await page.evaluate(() => {
    localStorage.setItem('labyrinthe.save.v2', LABYRINTHE.game.serialize());
    LABYRINTHE.game.credits = 777;
  });
  await command(page, 'sauver');
  await command(page, 'reset oui');
  await page.waitForFunction(() => window.LABYRINTHE?.game?.__contractsWrap && LABYRINTHE.game.credits === 0);
  const state = await page.evaluate(() => ({ tauri: LabyBridge.tauri, credits: LABYRINTHE.game.credits,
    db: localStorage.getItem('__mockSQLite'), legacy: localStorage.getItem('labyrinthe.save.v2') }));
  assert.deepEqual(state, { tauri: true, credits: 0, db: null, legacy: null });
  assert.deepEqual(errors, []);
});

test('pont Tauri simulé : import et export passent par les commandes natives dédiées', async t => {
  const { page, errors } = await makePage(t);
  await page.addInitScript(() => {
    window.__nativeFiles = { exported: null, imported: null, path: '/choisi/partie.json', calls: [] };
    window.__TAURI__ = { core: { invoke: async (cmd, args) => {
      if (cmd === 'content_load') return await (await fetch('/content/' + args.pack)).text();
      if (cmd === 'save_read') return null;
      if (cmd === 'save_write') return;
      if (cmd === 'export_save') {
        window.__nativeFiles.calls.push({ cmd, keys: Object.keys(args).sort() });
        window.__nativeFiles.exported = args.contents;
        return window.__nativeFiles.path;
      }
      if (cmd === 'import_save') {
        window.__nativeFiles.calls.push({ cmd });
        return window.__nativeFiles.imported;
      }
      throw new Error('Commande inconnue : ' + cmd);
    } } };
  });
  await page.goto(base);
  await ready(page);
  await page.evaluate(() => { LABYRINTHE.game.credits = 321; });
  await command(page, 'exporter');
  await page.waitForFunction(() => document.querySelector('#termOut').textContent.includes('Sauvegarde écrite sur le disque'));
  assert.equal(await page.evaluate(() => JSON.parse(__nativeFiles.exported).credits), 321);
  await page.evaluate(() => {
    __nativeFiles.imported = __nativeFiles.exported;
    LABYRINTHE.game.credits = 999;
  });
  await command(page, 'importer');
  await page.waitForFunction(() => LABYRINTHE.game.credits === 321);
  await page.evaluate(() => { __nativeFiles.imported = '{"v":4}'; });
  await command(page, 'importer');
  await page.waitForFunction(() => document.querySelector('#termOut').textContent.includes('Import natif impossible'));
  assert.equal(await page.evaluate(() => LABYRINTHE.game.credits), 321);
  await page.evaluate(() => { __nativeFiles.imported = null; __nativeFiles.path = null; });
  await command(page, 'importer');
  await page.waitForFunction(() => document.querySelector('#termOut').textContent.includes('Import annulé'));
  await command(page, 'exporter');
  await page.waitForFunction(() => document.querySelector('#termOut').textContent.includes('Export annulé'));
  assert.deepEqual(await page.evaluate(() => __nativeFiles.calls), [
    { cmd: 'export_save', keys: ['contents'] }, { cmd: 'import_save' },
    { cmd: 'import_save' }, { cmd: 'import_save' }, { cmd: 'export_save', keys: ['contents'] }
  ]);
  assert.deepEqual(errors, []);
});

test('pont Tauri simulé : un échec de suppression conserve la partie', async t => {
  const { page, errors } = await makePage(t);
  await page.addInitScript(() => {
    window.__TAURI__ = { core: { invoke: async (cmd, args) => {
      if (cmd === 'content_load') return await (await fetch('/content/' + args.pack)).text();
      if (cmd === 'save_delete') throw new Error('suppression refusée');
      return null;
    } } };
  });
  await page.goto(base);
  await ready(page);
  await page.evaluate(() => { LABYRINTHE.game.credits = 333; });
  await command(page, 'reset oui');
  await page.waitForFunction(() => document.querySelector('#termOut').textContent.includes('Impossible de supprimer'));
  assert.equal(await page.evaluate(() => LABYRINTHE.game.credits), 333);
  await command(page, 'pwd');
  assert.match(await page.locator('#termOut').innerText(), /\/home\/joueur/);
  assert.deepEqual(errors, []);
});

test('politique CSP Tauri reproduite : WASM fonctionne, réseau réel interdit, boucle interrompue', async t => {
  const { page, errors } = await makePage(t);
  const csp = JSON.parse(fs.readFileSync(path.join(ROOT, 'src-tauri/tauri.conf.json'), 'utf8')).app.security.csp;
  const probes = [];
  page.on('request', request => { if (request.url().includes('/__network_probe')) probes.push(request.url()); });
  await page.route('**/*', async route => {
    if (!route.request().isNavigationRequest()) return route.continue();
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': csp } });
  });
  await page.goto(base);
  await ready(page);
  const result = await page.evaluate(async url => {
    const api = new ApiServerMod.ApiServer();
    return {
      health: await JsRun.run(`const r=await fetch('/api/health');console.log((await r.json()).status);`, api),
      blocked: await JsRun.run(`await globalThis.fetch('${url}/__network_probe')`, api),
      loop: await JsRun.run('while(true){}', api, { timeout: 120 })
    };
  }, base);
  assert.equal(result.health.ok, true);
  assert.equal(result.health.output, 'ok');
  assert.equal(result.blocked.ok, false);
  assert.match(result.blocked.error, /seule l.API simulée/);
  assert.equal(result.loop.ok, false);
  assert.match(result.loop.error, /TimeoutError/);
  assert.deepEqual(probes, []);
  assert.deepEqual(errors, []);
});

test('monofichier ouvert en file:// : packs intacts et exécution hors ligne', async t => {
  const build = spawnSync(PYTHON, ['build-single.py'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(build.status, 0, build.stderr);
  const { page, errors } = await makePage(t);
  const network = [];
  page.on('request', request => { if (!request.url().startsWith('file:')) network.push(request.url()); });
  await page.goto(pathToFileURL(path.join(ROOT, 'dist/labyrinthe-single.html')).href);
  await ready(page);
  assert.equal(await page.evaluate(() => LabyWeb.sites().length), 12);
  assert.equal(await page.locator('#tutorialProgress').innerText(), '1/6');
  const embedded = await page.evaluate(() => window.__LABY_CONTENT__);
  for (const [name, text] of Object.entries(embedded)) {
    assert.equal(text, fs.readFileSync(path.join(ROOT, 'content', name), 'utf8'), 'contenu altéré : ' + name);
  }
  const health = await page.evaluate(() => JsRun.run(`const r=await fetch('/api/health'); console.log((await r.json()).status);`, new ApiServerMod.ApiServer()));
  assert.equal(health.ok, true);
  assert.equal(health.output, 'ok');
  assert.deepEqual(network, []);
  assert.deepEqual(errors, []);
});

test('Puits en navigateur : processus, carte, achats, incidents et restauration', async t => {
  const { page, errors } = await makePage(t);
  await page.goto(base);
  await ready(page);
  await page.evaluate(() => {
    const g = LABYRINTHE.game;
    g.xp = 3000; g.credits = 10000; g.sats = 400; g.respect = 20;
    g.world.home.get('/home/joueur/bloc_notes.txt').content = 'Note à conserver.';
  });
  await command(page, 'fin');
  assert.match(await page.locator('#termOut').innerText(), /Campagne en cours/);
  await command(page, 'relais sauter');
  assert.equal(await page.evaluate(() => LABYRINTHE.game.relais.position), 0);
  assert.equal(await page.evaluate(() => LABYRINTHE.game.credits), 10000);
  assert.equal(await page.evaluate(() => LABYRINTHE.game.processes.find(p => p.name === 'Relais').duration), 3000);
  assert.match(await page.locator('#procStack').innerText(), /relais/i);
  // Le premier saut s'exécute en temps réel ; les deux suivants utilisent une
  // avance d'horloge pour que le test ne passe pas 9 secondes à attendre.
  await page.waitForFunction(() => LABYRINTHE.game.relais.position === 1, { timeout: 6000 });
  assert.equal(await page.evaluate(() => LABYRINTHE.game.credits), 9950);
  assert.equal(await page.locator('#mapSvg .node').filter({ hasText: 'Relais n°1' }).count(), 1);
  for (let i = 0; i < 2; i++) {
    await command(page, 'relais sauter');
    await page.evaluate(() => {
      const g = LABYRINTHE.game;
      const p = g.processes.find(p => p.name === 'Relais' && !p.done && !p.cancelled);
      g.tick(p.startedAt + p.duration + 1);
    });
  }
  assert.equal(await page.evaluate(() => LABYRINTHE.game.relais.puitsAtteint), true);
  for (const name of ['Relais n°1', 'Relais n°2', 'Relais n°3', 'Le Puits']) {
    const node = page.locator('#mapSvg .node').filter({ hasText: name });
    assert.equal(await node.count(), 1, name);
    const cy = Number(await node.locator('circle').first().getAttribute('cy'));
    assert(cy > 0 && cy < 175, `${name} est hors de la carte`);
  }
  await command(page, 'ssh joueur@10.10.0.99');
  assert.equal(await page.locator('#cmd').getAttribute('type'), 'password');
  await command(page, 'puits');
  assert.equal(await page.evaluate(() => LABYRINTHE.game.world.current), 'puits');
  await command(page, 'exit');
  await command(page, 'marché acheter wordlist-premium');
  await command(page, 'marché acheter relais-prive');
  await command(page, 'marché acheter nettoyeur-magique');
  await command(page, 'cd achats');
  await command(page, 'ls');
  assert.match(await page.locator('#termOut').innerText(), /wordlist-premium\.txt/);
  await page.evaluate(() => { window.__originalRandom = Math.random; Math.random = () => 0; });
  await command(page, 'run nettoyeur-magique.sh');
  await page.evaluate(() => { Math.random = window.__originalRandom; });
  assert.equal(await page.evaluate(() => LABYRINTHE.game.gardienEnquete.active), true);
  assert.equal(await page.evaluate(() => LABYRINTHE.game.tacheNoire.active), true);
  assert.equal(await page.evaluate(() => LABYRINTHE.game.events.filter(e => e.type === 'incident-noir').length), 2);
  await command(page, 'gardien cooperer');
  assert.equal(await page.evaluate(() => LABYRINTHE.game.gardienEnquete.active), false);
  await command(page, 'sauver');
  await page.reload();
  await ready(page);
  assert.equal(await page.evaluate(() => LABYRINTHE.game.tacheNoire.active), true);
  assert.equal(await page.evaluate(() => LABYRINTHE.game.world.home.get('/home/joueur/achats').type), 'dir');
  await command(page, 'tache-noire payer');
  assert.match(await page.locator('#termOut').innerText(), /Rançon simulée payée \(20 sats\)/);
  assert.equal(await page.evaluate(() => LABYRINTHE.game.world.home.get('/home/joueur/bloc_notes.txt').content), 'Note à conserver.');
  await command(page, 'relais recommencer');
  await command(page, 'relais sauter');
  assert.equal(await page.evaluate(() => LABYRINTHE.game.processes.find(p => p.name === 'Relais' && !p.done).duration), 1000);
  assert.deepEqual(errors, []);
});

test('import durant une demande SSH : processus et mot de passe en attente annulés', async t => {
  const { page, errors } = await makePage(t);
  await page.goto(base);
  await ready(page);
  await command(page, 'nmap -sn 10.10.0.0/24');
  const snapshot = await page.evaluate(() => LABYRINTHE.game.serialize());
  await command(page, 'ssh joueur@10.10.0.1');
  assert.equal(await page.locator('#cmd').getAttribute('type'), 'password');
  await page.locator('#fileInput').setInputFiles({ name: 'restauration.json', mimeType: 'application/json', buffer: Buffer.from(snapshot) });
  await page.waitForFunction(() => document.querySelector('#termOut').textContent.includes('Sauvegarde importée.'));
  assert.equal(await page.locator('#cmd').getAttribute('type'), 'text');
  assert.equal(await page.evaluate(() => LABYRINTHE.game.pendingSsh), null);
  await command(page, 'pwd');
  assert.match(await page.locator('#termOut').innerText(), /\/home\/joueur/);
  assert.deepEqual(errors, []);
});

test('profil : le rang final exige 8000 XP et la campagne terminée', async t => {
  const { page, errors } = await makePage(t);
  await page.goto(base);
  await ready(page);
  const ranks = await page.evaluate(() => {
    const g = LABYRINTHE.game;
    g.xp = 8000;
    const before = LabyProfile.nomRang(LabyProfile.rank());
    g.completed = new Set(Campaign.MISSIONS.map(m => m.id));
    const after = LabyProfile.nomRang(LabyProfile.rank());
    return { before, after };
  });
  assert.deepEqual(ranks, { before: 'PENTESTEUR', after: 'MAÎTRE DU LABYRINTHE' });
  assert.deepEqual(errors, []);
});
