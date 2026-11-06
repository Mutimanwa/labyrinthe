'use strict';

// Parcours de bout en bout du moteur : les processus sont terminés par une
// avance de l'horloge simulée, sans attendre leurs animations en temps réel.
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

test('parcours des 16 missions initiales par les commandes du joueur', () => {
  const g = newGame();
  function cmd(line, code = 0) {
    const result = g.shell.exec(line);
    assert.equal(result.code, code, `${line} : ${result.out}`);
    if (result.out.startsWith('__PROC__')) {
      const process = g.processes.find(p => p.pid === Number(result.out.slice('__PROC__'.length)));
      assert(process, 'processus absent');
      g.tick(process.startedAt + process.duration + 1);
    }
    return result;
  }
  function ssh(user, ip, password) {
    const result = cmd(`ssh ${user}@${ip}`);
    if (result.out.startsWith('__SSHPASS__')) assert.equal(g.trySshPassword(password).code, 0);
  }
  function validate(answer = '') {
    const result = cmd('valider' + (answer ? ' ' + answer : ''));
    assert.match(result.out, /^__MISSION_DONE__/);
  }

  cmd('nmap -sn 10.10.0.0/24');
  ssh('joueur', '10.10.0.1', 'joueur');
  cmd('cat /home/cours/01_navigation.txt'); validate();

  cmd('nmap -sn 10.10.0.0/16'); cmd('nmap -sV 10.10.1.10');
  cmd('hydra -l root -P /usr/share/wordlists/rockyou.txt ssh://10.10.1.10');
  assert.equal(g.mission.objectives[1].done(g.world, g.shell, g.events, g), true);
  ssh('root', '10.10.1.10', 'toor');
  cmd('scp root@10.10.1.10:/home/joueur/archives/rapport_confidentiel.txt .'); validate();

  cmd("sed -i 's/HORS SERVICE/OPERATIONNEL/g' /home/joueur/statut.txt");
  cmd('rm /home/joueur/brouillon.txt'); validate();

  assert.equal(cmd('grep -c ECHEC /var/log/auth.log').out, '4');
  cmd('nmap -sn 10.10.1.0/24');
  cmd('hydra -l root -P /usr/share/wordlists/rockyou.txt ssh://10.10.1.11');
  ssh('root', '10.10.1.11', 'toor');
  cmd('scp root@10.10.1.11:/home/joueur/preuve_incident.txt .');
  cmd('rm /var/log/*.log'); validate('4');

  cmd('exit'); ssh('joueur', '10.10.0.1', 'joueur');
  cmd('hydra -l root -P /usr/share/wordlists/rockyou.txt ssh://10.10.2.10');
  ssh('root', '10.10.2.10', 'toor');
  assert.equal(cmd('python3 exercice_01.py').out.trim(), '22'); validate('22');
  assert.equal(cmd('python3 exercice_02.py').out.trim(), '12'); validate('12');
  cmd('python3 exercice_03.py', 1);
  cmd("sed -i 's/len(ports) + 1/len(ports)/g' exercice_03.py");
  cmd('python3 exercice_03.py'); validate();

  cmd("sed -i 's/return False/return port in (22, 443)/g' exercice_04.py");
  cmd('python3 exercice_04.py'); cmd('nmap -sn 10.10.2.0/24');
  cmd('hydra -l root -P /usr/share/wordlists/rockyou.txt ssh://10.10.2.11');
  ssh('root', '10.10.2.11', 'toor');
  cmd("sed -i 's/return \\[\\]/return [p for p in liste if p > 1024]/g' mission8.py");
  assert.match(cmd('python3 mission8.py').out, /\[3306, 8080\]/); validate();

  cmd('nmap -sV -p 8899 10.10.3.10'); validate('python');
  cmd('exit'); ssh('joueur', '10.10.0.1', 'joueur');
  cmd('hydra -l root -P /usr/share/wordlists/rockyou.txt ssh://10.10.3.10');
  ssh('root', '10.10.3.10', 'admin123'); cmd('nmap -sn 10.10.3.0/24');
  cmd('hydra -l admin -P /usr/share/wordlists/rockyou.txt ssh://10.10.3.11');
  assert.equal(g.mission.objectives[0].done(g.world, g.shell, g.events, g), true);
  ssh('admin', '10.10.3.11', 'letmein'); cmd('sudo -i'); cmd('iptables -F'); validate();

  cmd('nmap -sn 10.10.3.0/24');
  cmd('hydra -l root -P /usr/share/wordlists/rockyou.txt ssh://10.10.3.12');
  ssh('root', '10.10.3.12', 'qwerty'); cmd('nmap -sn 10.10.3.0/24');
  cmd('hydra -l root -P /usr/share/wordlists/rockyou.txt ssh://10.10.3.20');
  ssh('root', '10.10.3.20', 'password');
  cmd('scp root@10.10.3.20:/home/joueur/secret_segment.txt .'); validate();
  cmd('nmap -p- -sV 10.10.3.10'); validate('6');

  cmd('exit'); ssh('joueur', '10.10.0.1', 'joueur');
  cmd('hydra -l root -P /usr/share/wordlists/rockyou.txt ssh://10.10.4.10');
  ssh('root', '10.10.4.10', '123456');
  assert.match(cmd('base64 -d config.b64').out, /SECRET/); validate('SECRET{b4se64_n3st_pas_ch1ffr3}');
  cmd('nmap -sn 10.10.4.0/24'); cmd('nikto -h 10.10.4.20');
  cmd('curl http://10.10.4.20/backups/config.bak'); ssh('root', '10.10.4.20', 'S3nt1n3ll3!');
  cmd('iptables -F'); validate('S3nt1n3ll3!');

  const count = cmd('grep -c intrusion /var/log/actions.log').out.trim();
  cmd('scp root@10.10.4.20:/home/joueur/rapport_audit.txt .'); cmd('exit');
  cmd('scp /home/joueur/telecharges/rapport_audit.txt joueur@10.10.0.9:/depot/'); validate(count);
  ssh('root', '10.10.4.20', 'S3nt1n3ll3!');
  const report = g.world.node('secCible').get('/home/joueur/rapport_audit.txt');
  const original = report.content;
  report.content = original.replace(/A_REMPLIR/g, '6').replace('BROUILLON', 'VALIDE');
  assert.equal(g.checkMission().done, false, 'un faux port dans le rapport ne doit pas valider');
  report.content = original;
  cmd("sed -i 's/Ports TCP ouverts : A_REMPLIR/Ports TCP ouverts : 6/g' /home/joueur/rapport_audit.txt");
  cmd("sed -i 's/Service inconnu sur port eleve : A_REMPLIR/Service inconnu sur port eleve : port 47391/g' /home/joueur/rapport_audit.txt");
  cmd("sed -i 's/BROUILLON/VALIDE/g' /home/joueur/rapport_audit.txt");
  cmd('exit'); ssh('joueur', '10.10.0.1', 'joueur');
  cmd('cat /home/cours/16_ethique.txt'); validate();

  assert.equal(g.completed.size, 16);
  assert.equal(g.mission.id, 17);
});

test('processus parallèles : chaque attaque garde sa cible, un échec RAM ne les écrase pas', () => {
  const g = newGame();
  for (const id of ['shellLab', 'codeLab', 'netFw', 'netLab']) g.world.node(id).discovered = true;
  g.world.current = 'academie';
  const commands = [
    'hydra -l root -P /usr/share/wordlists/rockyou.txt ssh://10.10.1.10',
    'hydra -l root -P /usr/share/wordlists/rockyou.txt ssh://10.10.2.10',
    'hydra -l admin -P /usr/share/wordlists/rockyou.txt ssh://10.10.3.11'
  ];
  for (const c of commands) assert.match(g.shell.exec(c).out, /^__PROC__/);
  const tooMany = g.shell.exec('hydra -l root -P /usr/share/wordlists/rockyou.txt ssh://10.10.3.10');
  assert.equal(tooMany.code, 1);
  assert.match(tooMany.out, /Mémoire insuffisante/);
  const processes = g.processes.slice();
  g.tick(Math.max(...processes.map(p => p.startedAt + p.duration)) + 1);
  assert.equal(g.knownCred('10.10.1.10', 'root'), 'toor');
  assert.equal(g.knownCred('10.10.2.10', 'root'), 'toor');
  assert.equal(g.knownCred('10.10.3.11', 'admin'), 'letmein');
  assert(processes.every(p => p.result?.found));
});

test('Metasploit parallèle et annulation d’un processus', () => {
  const g = newGame();
  for (const id of ['shellLab', 'netLab', 'codeLab']) g.world.node(id).discovered = true;
  const script = (ip, password) => `msfconsole -x "use auxiliary/scanner/ssh/ssh_login; set RHOSTS ${ip}; set USERNAME root; set PASSWORD ${password}; exploit"`;
  assert.match(g.shell.exec(script('10.10.1.10', 'toor')).out, /^__PROC__/);
  assert.match(g.shell.exec(script('10.10.3.10', 'admin123')).out, /^__PROC__/);
  const jobs = g.processes.slice();
  g.tick(Math.max(...jobs.map(p => p.startedAt + p.duration)) + 1);
  assert(jobs.every(p => p.result?.ok));
  assert.equal(g.knownCred('10.10.1.10', 'root'), 'toor');
  assert.equal(g.knownCred('10.10.3.10', 'root'), 'admin123');
  const hydra = g.shell.exec('hydra -l root -P /usr/share/wordlists/rockyou.txt ssh://10.10.2.10');
  const pid = Number(hydra.out.slice('__PROC__'.length));
  const process = g.processes.find(p => p.pid === pid);
  assert(g.kill(pid).ok);
  g.tick(process.startedAt + process.duration + 1);
  assert.equal(g.knownCred('10.10.2.10', 'root'), undefined);
});

test('nmap distingue estimation, version réelle et scan complet', () => {
  const g = newGame();
  g.world.node('netLab').discovered = true;
  const byDefault = g.shell.exec('nmap 10.10.3.10').out;
  const guessed = g.shell.exec('nmap -p 8899 10.10.3.10').out;
  const version = g.shell.exec('nmap -sV -p 8899 10.10.3.10').out;
  const full = g.shell.exec('nmap -p- 10.10.3.10').out;
  assert.doesNotMatch(byDefault, /8899\/tcp/);
  assert.match(guessed, /8899\/tcp.*ospf-lite/);
  assert.doesNotMatch(guessed, /SimpleHTTPServer/);
  assert.match(version, /8899\/tcp.*http.*SimpleHTTPServer/);
  assert.match(full, /8899\/tcp/);
});

test('sudo et règles de pare-feu : isolation des parties et persistance', () => {
  const a = newGame(), b = newGame();
  a.world.current = 'academie';
  assert.match(a.shell.exec('sudo -l').out, /NOPASSWD/);
  assert.equal(a.shell.exec('sudo -i').code, 0);
  a.world.current = 'netFw';
  const fw = a.world.target;
  fw.isAdmin = true;
  assert.equal(fw.porteOuverte(80), false);
  assert.equal(a.shell.exec('iptables -A INPUT -p tcp --dport 80 -j ACCEPT').code, 0);
  assert.equal(fw.porteOuverte(80), true);
  assert.equal(b.world.node('netFw').porteOuverte(80), false, 'les règles ne doivent pas contaminer une autre partie');
  const saved = a.serialize();
  assert.equal(JSON.parse(saved).v, 4);
  const restored = newGame();
  restored.restore(saved);
  assert.equal(restored.world.node('netFw').porteOuverte(80), true);
  assert.equal(restored.shell.exec('iptables -D INPUT 1').code, 0);
  assert.equal(restored.world.node('netFw').porteOuverte(80), false);
  assert.equal(restored.shell.exec('iptables -F').code, 0);
  assert.equal(restored.shell.exec('iptables -A INPUT -p tcp --dport 443 -j DROP').code, 0);
  assert.equal(restored.world.node('netFw').porteOuverte(80), true);
  assert.equal(restored.world.node('netFw').porteOuverte(443), false);
});
