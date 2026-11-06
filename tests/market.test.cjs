'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

require('../src/js/py.js');
require('../src/js/engine.js');
require('../src/js/campaign.js');
require('../src/js/apiserver.js');
require('../src/js/jsrun.js');
const WebDev = require('../src/js/webdev.js');
const { Game } = require('../src/js/game.js');
const Programs = require('../src/js/programs.js');
const RealCommands = require('../src/js/realcmd.js');

function newGame() {
  const game = new Game();
  Programs.install(game, { traceEnabled: false });
  RealCommands.install(game);
  WebDev.install(game);
  return game;
}
function command(g, line, expected = 0) {
  const result = g.shell.exec(line);
  assert.equal(result.code, expected, `${line} : ${result.out}`);
  return result;
}
function start(g, line) {
  const result = command(g, line);
  assert.match(result.out, /^__PROC__\d+$/);
  const process = g.processes.find(p => p.pid === Number(result.out.slice(8)));
  assert(process, 'processus introuvable');
  return process;
}
function finish(g, process) {
  g.tick(process.startedAt + process.duration + 1);
  return process;
}
function reachPuits(g) {
  g.xp = 3000;
  g.credits = 20000;
  for (let i = 0; i < 3; i++) finish(g, start(g, 'relais sauter'));
  assert(g.relais.puitsAtteint);
}
function withRandom(value, fn) {
  const original = Math.random;
  Math.random = () => value;
  try { return fn(); } finally { Math.random = original; }
}

test('chenillard : verrou, latence réelle, annulation, sauvegarde et SSH', () => {
  const g = newGame();
  const autre = newGame();
  global.LABYRINTHE = { game: autre }; // Les commandes doivent garder leur propre instance.
  try {
    g.xp = 2999; g.credits = 1000;
    assert.match(command(g, 'relais sauter', 1).out, /OPÉRATEUR/);
    g.xp = 3000; g.credits = 49;
    assert.match(command(g, 'relais sauter', 1).out, /crédits insuffisants/);
    g.credits = 1000;
    const annule = start(g, 'relais sauter');
    assert.equal(annule.duration, 3000);
    g.tick(annule.startedAt + 2999);
    assert.equal(g.relais.position, 0);
    assert.equal(g.credits, 1000);
    assert.match(command(g, 'relais sauter', 1).out, /déjà en cours/);
    command(g, 'relais arreter');
    finish(g, annule);
    assert.equal(g.relais.position, 0);
    assert.equal(g.credits, 1000);

    const enCours = start(g, 'relais sauter');
    const snap = g.serialize();
    g.restore(snap); // un processus antérieur ne doit pas agir sur une partie importée
    finish(g, enCours);
    assert.equal(g.relais.position, 0);
    assert.equal(g.credits, 1000);
    assert.equal(g.processes.length, 0);

    const premier = start(g, 'relais sauter');
    finish(g, premier);
    assert.equal(g.relais.position, 1);
    assert.equal(g.credits, 950);
    assert.equal(g.world.node('relais1').discovered, true);
    assert.equal(autre.relais.position, 0);
    assert.equal(autre.credits, 0);

    const second = start(g, 'relais sauter');
    g.credits = 49; // dépensés pendant le saut : pas d'arrivée ni de débit fantôme
    finish(g, second);
    assert.equal(g.relais.position, 1);
    assert.equal(g.credits, 49);
    g.credits = 950;
    finish(g, start(g, 'relais sauter'));
    finish(g, start(g, 'relais sauter'));
    assert.equal(g.relais.position, 3);
    assert.equal(g.credits, 850);
    assert.equal(g.relais.creditsDepenses, 150);
    assert(g.world.home.links.includes('puits'));
    assert(g.world.node('puits').discovered);
    assert.match(command(g, 'ssh joueur@10.10.0.99').out, /^__SSHPASS__/);
    assert.equal(g.trySshPassword('puits').code, 0);
    assert.equal(g.world.current, 'puits');
    command(g, 'relais recommencer', 1);
    command(g, 'exit');
  } finally { delete global.LABYRINTHE; }
});

test('marché : taux et montants, livraison, outils utiles et chemins protégés', () => {
  const g = newGame();
  assert.match(command(g, 'help').out, /relais  marché/);
  assert.match(command(g, 'help marché').out, /marché acheter/);
  assert.match(command(g, 'help tâche-noire').out, /note fictive/);
  command(g, 'help constructor', 1);
  command(g, 'constructor', 127);
  command(g, 'marché', 1);
  assert.match(command(g, 'fin', 1).out, /Campagne en cours/);
  reachPuits(g);
  const before = g.credits;
  for (const montant of ['0', '-1', '12abc', '1e3', '1.5', '9007199254740992']) {
    command(g, `marché changer ${montant}`, 1);
    assert.equal(g.credits, before);
    assert.equal(g.sats, 0);
  }
  const exchange = command(g, 'marché changer 1200');
  const rate = Number(exchange.out.match(/taux : (\d+) cr\/sat/)[1]);
  assert(rate >= 40 && rate <= 60);
  assert.equal(g.sats, Math.floor(1200 / rate));
  assert.equal(g.credits, before - Math.floor(1200 / rate) * rate, 'le reliquat reste sur le compte');
  const savedSats = g.sats;
  for (const id of ['constructor', '__proto__', 'toString']) {
    command(g, 'marché acheter ' + id, 1);
    assert.equal(g.sats, savedSats);
  }

  g.sats = 1000;
  const home = g.world.home;
  home.addFile('/usr/share/wordlists/rockyou_premium.txt', 'ma_liste_personnelle', { owner: 'joueur' });
  command(g, 'marché acheter wordlist-premium');
  assert.equal(home.get('/home/joueur/achats').type, 'dir');
  assert.match(home.get('/usr/share/wordlists/rockyou_premium.txt').content, /ma_liste_personnelle/);
  assert.match(home.get('/usr/share/wordlists/rockyou_premium.txt').content, /P@ssw0rd!/);
  command(g, 'cd achats');
  assert.match(command(g, 'ls').out, /wordlist-premium.txt/);
  assert.match(command(g, 'cat wordlist-premium.txt').out, /hydra/);
  assert.equal(g.cred, 1);
  command(g, 'marché acheter wordlist-premium');
  assert.equal(g.cred, 1, 'pas de gain de créd à répétition');

  const code = g.world.node('codeLab');
  code.discovered = true;
  const hydra = start(g, 'hydra -l admin -P /usr/share/wordlists/rockyou_premium.txt ssh://10.10.2.10');
  finish(g, hydra);
  assert.equal(hydra.result.found, true);
  assert.equal(g.knownCred(code.ip, 'admin'), 'P@ssw0rd!');

  const module = 'exploit/labyrinthe/http/entrainement';
  const msf = ip => `msfconsole -x "use ${module}; set RHOSTS ${ip}; exploit"`;
  command(g, msf(code.ip), 1);
  command(g, 'marché acheter exploit-0day');
  const good = start(g, msf(code.ip));
  finish(g, good);
  assert.equal(good.result.ok, true);
  const wrong = g.world.node('shellLab');
  wrong.discovered = true;
  const bad = start(g, msf(wrong.ip));
  finish(g, bad);
  assert.equal(bad.result.ok, false);
  assert.equal(g.knownCred(wrong.ip, 'root'), undefined);

  command(g, 'marché acheter relais-prive');
  command(g, 'relais recommencer');
  assert.equal(g.world.node('puits').discovered, false);
  const rapide = start(g, 'relais sauter');
  assert.equal(rapide.duration, 1000);
  g.tick(rapide.startedAt + 999);
  assert.equal(g.relais.position, 0);
  finish(g, rapide);
  assert.equal(g.relais.position, 1);

  const bloquee = newGame();
  reachPuits(bloquee);
  bloquee.sats = 100;
  bloquee.world.home.addFile('/home/joueur/achats', 'données personnelles', { owner: 'joueur' });
  command(bloquee, 'marche acheter wordlist-premium', 1);
  assert.equal(bloquee.sats, 100);
  assert.equal(bloquee.world.home.get('/home/joueur/achats').content, 'données personnelles');
});

test('anciennes sauvegardes : accès Puits et livraison sans perte ni répétition', () => {
  const original = newGame();
  reachPuits(original);
  original.sats = 100;
  command(original, 'marche acheter wordlist-premium');
  const old = JSON.parse(original.serialize());
  delete old.marcheVersion;
  delete old.xpVersion;
  old.completed = [1, 2];
  old.missionIndex = 2;
  old.xp = 300;
  old.fin = 'blanche'; // ancienne fin figée trop tôt
  old.nodes.puits.users = {};
  old.nodes.puits.discovered = false;
  old.nodes.joueur.links = old.nodes.joueur.links.filter(id => id !== 'puits');
  delete old.nodes.joueur.files['/usr/share/wordlists/rockyou_premium.txt'];
  old.nodes.joueur.files['/home/joueur/achats'] = { type: 'file', content: '', owner: 'joueur' };
  const g = newGame();
  g.restore(JSON.stringify(old));
  assert.equal(g.xp, 525); // 300 + (150 + 300) / 2
  assert.equal(g.fin, null);
  assert.equal(g.relais.position, 3);
  assert(g.world.node('puits').discovered);
  assert(g.world.home.links.includes('puits'));
  assert.equal(g.world.node('puits').users.joueur, 'puits');
  assert.equal(g.world.home.get('/home/joueur/achats').type, 'dir');
  assert.match(g.world.home.get('/usr/share/wordlists/rockyou_premium.txt').content, /P@ssw0rd!/);
  assert.equal(g.inventaire.length, 1);
  const restoredAgain = newGame();
  restoredAgain.restore(g.serialize());
  assert.equal(restoredAgain.xp, 525);
  delete restoredAgain.world.home.files['/usr/share/wordlists/rockyou_premium.txt'];
  const intentionalDeletion = newGame();
  intentionalDeletion.restore(restoredAgain.serialize());
  assert.equal(intentionalDeletion.world.home.get('/usr/share/wordlists/rockyou_premium.txt'), undefined);

  old.nodes.joueur.files['/home/joueur/achats'].content = 'ne pas effacer';
  old.nodes.joueur.files['/usr/share/wordlists/rockyou_premium.txt'] = { type: 'file', content: 'wordlist personnalisée', owner: 'joueur' };
  const preserve = newGame();
  preserve.restore(JSON.stringify(old));
  assert.equal(preserve.world.home.get('/home/joueur/achats').content, 'ne pas effacer');
  assert.equal(preserve.world.home.get('/usr/share/wordlists/rockyou_premium.txt').content, 'wordlist personnalisée');

  const v3 = JSON.parse(original.serialize());
  v3.v = 3;
  delete v3.xp;
  delete v3.xpVersion;
  v3.completed = [1, 2];
  v3.missionIndex = 2;
  const restoredV3 = newGame();
  restoredV3.restore(JSON.stringify(v3));
  assert.equal(restoredV3.xp, 425); // 100 par mission + leurs compléments
});

test('GARDIEN : décisions effectives, incidents distincts et saisie sans suppression des fichiers', () => {
  const g = newGame();
  reachPuits(g);
  g.sats = 500; g.respect = 20;
  command(g, 'marché acheter wordlist-premium');
  command(g, 'marché acheter nettoyeur-magique');
  assert.equal(g.incidentsNoirs.length, 1);
  withRandom(0.99, () => command(g, 'run /home/joueur/achats/nettoyeur-magique.sh'));
  assert.equal(g.gardienEnquete.active, true);
  assert.deepEqual(g.events.filter(e => e.type === 'incident-noir').map(e => e.incidentType), ['achat-piege', 'execution-binaire-puits']);
  const credits = g.credits, respect = g.respect;
  command(g, 'gardien cooperer');
  assert.equal(g.gardienEnquete.active, false);
  assert.equal(g.credits, credits - 100);
  assert.equal(g.respect, respect - 2);
  command(g, 'gardien cooperer', 1);

  withRandom(0.99, () => command(g, 'run /home/joueur/achats/nettoyeur-magique.sh'));
  assert.equal(g.gardienEnquete.active, false);
  withRandom(0.99, () => command(g, 'run /home/joueur/achats/nettoyeur-magique.sh'));
  assert.equal(g.gardienEnquete.active, true);
  const cred = g.cred;
  withRandom(0, () => command(g, 'gardien resister'));
  assert.equal(g.gardienEnquete.active, false);
  assert.equal(g.cred, cred + 2);
  assert.deepEqual(g.inventaire, []);
  assert(g.world.home.get('/home/joueur/achats/nettoyeur-magique.sh'));
  assert(g.world.home.get('/usr/share/wordlists/rockyou_premium.txt'));
  command(g, 'marche acheter wordlist-premium');
  assert.equal(g.cred, cred + 2, 'un rachat ne donne pas de créd');
});

test('Tâche-Noire : récupération persistée, paiement exact, refus et note modifiée préservée', () => {
  const g = newGame();
  reachPuits(g);
  g.sats = 100;
  const path = '/home/joueur/bloc_notes.txt';
  g.world.home.get(path).content = 'Mes notes importantes.';
  command(g, 'marché acheter nettoyeur-magique');
  withRandom(0, () => command(g, 'run /home/joueur/achats/nettoyeur-magique.sh'));
  assert(g.tacheNoire.active);
  assert.match(g.world.home.get(path).content, /SIMULATION TÂCHE-NOIRE/);
  const recovered = newGame();
  recovered.restore(g.serialize());
  command(recovered, 'tache-noire refuser');
  assert(recovered.tacheNoire.active);
  const sats = recovered.sats;
  const pay = command(recovered, 'tâche-noire payer');
  assert.match(pay.out, /20 sats/);
  assert.equal(recovered.sats, sats - 20);
  assert.equal(recovered.world.home.get(path).content, 'Mes notes importantes.');
  assert.equal(recovered.tacheNoire.active, false);

  withRandom(0, () => command(recovered, 'run /home/joueur/achats/nettoyeur-magique.sh'));
  recovered.world.home.get(path).content = 'Texte modifié après l’incident';
  const avant = recovered.sats;
  command(recovered, 'tache-noire payer', 1);
  assert.equal(recovered.sats, avant);
  recovered.xp = 5000;
  const cleanup = command(recovered, 'tache-noire nettoyer');
  assert.match(cleanup.out, /laissé\(s\) en l’état/);
  assert.equal(recovered.world.home.get(path).content, 'Texte modifié après l’incident');
  assert.equal(recovered.tacheNoire.active, false);

  const legacy = JSON.parse(recovered.serialize());
  legacy.tacheNoire = { active: true, fichiersChiffres: [], rancon: 20, ts: 1 };
  recovered.restore(JSON.stringify(legacy));
  recovered.xp = 0;
  command(recovered, 'tache-noire nettoyer');
  assert.equal(recovered.tacheNoire.active, false);
  assert.equal(recovered.world.home.get(path).content, 'Texte modifié après l’incident');
});

test('XP et fins : progression atteignable, récit choisi seulement après les 22 missions', () => {
  const g = newGame();
  command(g, 'fin', 1);
  while (g.mission) {
    g.missionStartedAt = Date.now() - 600000; // sans bonus de rapidité
    g.completeMission();
  }
  assert.equal(g.completed.size, 22);
  assert.equal(g.credits, 11100);
  assert.equal(g.score, 2200);
  assert.equal(g.xp, 7750);
  assert.match(command(g, 'fin').out, /FIN BLANCHE/);
  assert.equal(g.fin, 'blanche');
  const noir = newGame();
  noir.completed = new Set(global.Campaign.MISSIONS.map(m => m.id));
  noir.incidentsNoirs = [{ type: 'a' }, { type: 'b' }, { type: 'c' }];
  assert.match(command(noir, 'fin').out, /FIN NOIRE/);
  assert.match(command(noir, 'fin').out, /aucun nouveau contrat/);
  const loaded = newGame();
  loaded.restore(noir.serialize());
  assert.equal(loaded.fin, 'noire');
});
