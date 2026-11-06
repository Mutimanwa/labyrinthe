/* =====================================================================
   programs.js — Mémoire vive, processus duratifs, traçage, thèmes
   Reprend la mécanique observée dans Hacknet : chaque outil est un
   programme qui consomme de la RAM, prend du temps, et affiche sa
   progression dans un panneau.
   ===================================================================== */
(function (global) {
  'use strict';

  const E = global.GameEngine || (typeof require !== 'undefined' ? require('./engine.js') : null);

  // ------------------------------------------------------------ THÈMES
  // Chaque machine impose sa couleur à toute l'interface, comme dans Hacknet.
  const THEMES = {
    cyan:   { name: 'CYAN',   accent: '#00d9ff', dim: '#0a7f96', bg: '#020a0e', panel: '#04141b', line: '#0d3d4d', txt: '#bfe9f5', hot: '#ff3b30' },
    red:    { name: 'ROUGE',  accent: '#ff2d2d', dim: '#8f1a1a', bg: '#0d0202', panel: '#1a0505', line: '#4d0f0f', txt: '#f5c9c9', hot: '#ff5555' },
    green:  { name: 'VERT',   accent: '#22ff66', dim: '#12833a', bg: '#010c04', panel: '#04170a', line: '#0f4d22', txt: '#c6f5d3', hot: '#ff3b30' },
    purple: { name: 'VIOLET', accent: '#b478ff', dim: '#5e3a8f', bg: '#08030f', panel: '#120820', line: '#3a1f5c', txt: '#ded0f5', hot: '#ff3b30' },
    amber:  { name: 'AMBRE',  accent: '#ffb300', dim: '#8f6410', bg: '#0d0800', panel: '#1a1204', line: '#4d3608', txt: '#f5e3c0', hot: '#ff3b30' },
    teal:   { name: 'SARCELLE', accent: '#00e5b0', dim: '#0a8f70', bg: '#01100c', panel: '#04211a', line: '#0d5c47', txt: '#c0f5e8', hot: '#ff3b30' },
    white:  { name: 'BLANC',  accent: '#e8f0f5', dim: '#7d8b96', bg: '#050708', panel: '#0d1114', line: '#2a333a', txt: '#d5dee4', hot: '#ff3b30' }
  };

  // ------------------------------------------------------------ CATALOGUE
  // ram : coût en Mo. duration : ms. steps : étapes de progression affichées.
  const PROGRAMS = {
    Honeypot: {
      ram: 60, duration: 0, persistent: true,
      steps: ['Écoute sur le port 2222 (décoy)', 'Journalise chaque tentative de connexion'],
      desc: 'Faux service SSH : attire et enregistre les scanners. Aucun risque pour tes données.',
      usage: 'honeypot start   |   honeypot stop   |   honeypot status   |   honeypot voir'
    },
    Hydra: {
      ram: 210, duration: 4200,
      steps: ['Chargement de la wordlist', 'Attaque par dictionnaire', 'Validation des réponses'],
      desc: 'Attaque par dictionnaire sur un service d\'authentification.',
      usage: 'hydra -l root -P /usr/share/wordlists/rockyou.txt ssh://<ip>'
    },
    Metasploit: {
      ram: 280, duration: 3800,
      steps: ['Chargement du module', 'Vérification de la cible', 'Envoi de la charge'],
      desc: 'Framework d\'exploitation. Module choisi via searchsploit.',
      usage: 'msfconsole -x "use <module>; set RHOSTS <ip>; exploit"'
    },
    Relais: {
      ram: 40, duration: 3000,
      steps: ['Ouverture du relais', 'Routage simulé', 'Établissement du saut'],
      desc: 'Un saut du chenillard vers le Puits.',
      usage: 'relais sauter   |   relais arreter'
    },
  };

  const RAM_TOTAL = 761;

  // ------------------------------------------------------------ PROCESSUS
  class Process {
    constructor(name, spec, args, nodeId, now) {
      this.pid = Process.nextPid++;
      this.name = name;
      this.spec = spec;
      this.args = args || [];
      this.nodeId = nodeId;
      this.startedAt = now;
      this.duration = spec.duration;
      this.persistent = !!spec.persistent;
      this.progress = 0;
      this.done = false;
      this.cancelled = false;
      this.ram = spec.ram;
    }
    stepIndex() {
      const steps = this.spec.steps;
      if (!steps.length) return -1;
      return Math.min(steps.length - 1, Math.floor(this.progress * steps.length));
    }
    elapsed(now) { return now - this.startedAt; }
  }
  Process.nextPid = 101;

  // ------------------------------------------------------------ EXTENSION
  // Ajoute la couche processus/traçage à une instance de Game.
  function install(game, opts) {
    opts = opts || {};
    game.ramTotal = RAM_TOTAL;
    game.processes = [];
    game.trace = null;                 // {nodeId, remaining, total, startedAt}
    game.traceEnabled = opts.traceEnabled !== false;
    game.honeypot = { active: false }; // pot de miel : processus persistant 'Honeypot'
    game.traceTotal = opts.traceTotal || 180;   // secondes, généreux pour débuter
    game.themeOverride = null;
    game.crackAnim = null;             // animation de force brute
    game.log = [];                     // journal narratif style Hacknet
    game.onProcessDone = opts.onProcessDone || function () {};
    game.onTraceEnd = opts.onTraceEnd || function () {};
    game.onChange = opts.onChange || function () {};

    // -------------------------------------------------- mémoire
    game.ramUsed = function () {
      // Un programme libère sa mémoire en se terminant. Seuls les processus
      // actifs (ou persistants) occupent la RAM — sinon quatre intrusions
      // successives satureraient la mémoire sans raison.
      return this.processes.reduce((a, p) => {
        if (p.cancelled) return a;
        if (p.done && !p.persistent) return a;
        return a + p.ram;
      }, 0);
    };
    game.ramFree = function () { return this.ramTotal - this.ramUsed(); };

    game.canAfford = function (name) {
      const spec = PROGRAMS[name];
      return spec && this.ramFree() >= spec.ram;
    };

    // -------------------------------------------------- journal narratif
    game.say = function (text, cls) {
      this.log.push({ text: String(text), cls: cls || '', at: Date.now() });
      if (this.log.length > 3000) this.log.splice(0, 800);
      this.onChange('log');
    };
    game.rule = function () { this.say('------------------------------------', 'rule'); };

    // -------------------------------------------------- thème courant
    game.currentTheme = function () {
      if (this.themeOverride && THEMES[this.themeOverride]) return THEMES[this.themeOverride];
      const n = this.world.target;
      return THEMES[n.theme] || THEMES.cyan;
    };

    // -------------------------------------------------- lancer un programme
    game.spawn = function (name, args, now) {
      now = now || Date.now();
      const spec = PROGRAMS[name];
      if (!spec) return { ok: false, msg: `Programme inconnu : ${name}` };
      // un seul exemplaire des programmes persistants
      if (spec.persistent && this.processes.some(p => p.name === name && !p.cancelled && !p.done)) {
        return { ok: false, msg: `Program "${name}" est déjà en cours d'exécution.` };
      }
      if (this.ramFree() < spec.ram) {
        return {
          ok: false,
          msg: `Mémoire insuffisante : ${spec.ram} Mo requis, ${this.ramFree()} Mo libres.\nFerme un programme avec : kill <pid>   (liste : ps)`
        };
      }
      const p = new Process(name, spec, args, this.world.current, now);
      this.processes.push(p);
      this.onChange('process');
      if (name === 'Honeypot') this.honeypot = { active: true, depuis: now };
      if (spec.persistent) {
        this.say(`${name} lancé. [PID ${p.pid}]  ${spec.ram} Mo`, 'ok');
        return { ok: true, process: p };
      }
      this.say(`${name} initialisé — en cours…`, 'run');
      return { ok: true, process: p };
    };

    game.kill = function (pid) {
      const p = this.processes.find(x => x.pid === Number(pid) && !x.cancelled);
      if (!p) return { ok: false, msg: `Aucun processus avec le PID ${pid}` };
      p.cancelled = true;
      p.done = true;
      this.say(`Processus ${p.pid} [${p.name}] arrêté.`, 'warn');
      this.onChange('process');
      if (p.name === 'Honeypot' && !this.processes.some(x => x.name === 'Honeypot' && !x.cancelled && !x.done)) {
        this.honeypot = { active: false };
      }
      return { ok: true, process: p };
    };

    game.traceKillActive = function () { return false; };

    // -------------------------------------------------- traçage
    game.startTrace = function (seconds) {
      if (!this.traceEnabled) return;
      const n = this.world.target;
      if (n.id === this.world.playerId) return;
      if (this.trace && this.trace.nodeId === n.id) return;
      const total = seconds || this.traceTotal;
      this.trace = { nodeId: n.id, remaining: total, total, startedAt: Date.now() };
      this.say(`!! TRAÇAGE DÉTECTÉ — ${total}s avant identification !!`, 'trace');
      this.say('   Une attaque lente (hydra -t 1) laisse plus de temps. exit annule.', 'trace');
      this.onChange('trace');
    };

    game.stopTrace = function (reason) {
      if (!this.trace) return;
      this.trace = null;
      if (reason) this.say(reason, 'ok');
      this.onChange('trace');
    };

    game.traceExpired = function () {
      const n = this.world.node(this.trace ? this.trace.nodeId : this.world.current);
      this.trace = null;
      // Pédagogique, pas punitif : on est éjecté, on perd des points,
      // mais la progression (ports ouverts, admin) est conservée.
      this.score = Math.max(0, this.score - 25);
      this.world.current = this.world.playerId;
      this.world.cwd = '/home/joueur';
      this.world.user = 'joueur';
      for (const p of this.processes) { p.cancelled = true; p.done = true; }
      this.say('', '');
      this.say('╔════════════════════════════════════════════════╗', 'trace');
      this.say("║  SÉQUENCE D'ÉVASION D'URGENCE DÉCLENCHÉE     ║", 'trace');
      this.say('╚════════════════════════════════════════════════╝', 'trace');
      this.say(`Traçage abouti depuis ${n ? n.name : 'la cible'}.`, 'trace');
      this.say('Connexion coupée. Adresse IP réassignée. -25 points.', 'trace');
      this.say('Tes ports ouverts et tes accès sont conservés : reconnecte-toi.', 'warn');
      this.say('En situation réelle, un traçage abouti = identification. Ici, tu apprends.', 'dim');
      this.onChange('trace');
      this.onTraceEnd();
    };

    // -------------------------------------------------- horloge
    game.tick = function (now) {
      now = now || Date.now();
      let changed = false;

      for (const p of this.processes) {
        if (p.done || p.cancelled || p.persistent) continue;
        const e = now - p.startedAt;
        p.progress = p.duration > 0 ? Math.min(1, e / p.duration) : 1;
        if (p.progress >= 1) {
          p.done = true;
          changed = true;
          this.finishProcess(p);
        }
      }
      // nettoyer les processus terminés depuis plus de 4 s
      const before = this.processes.length;
      this.processes = this.processes.filter(p =>
        p.persistent && !p.cancelled ? true : (!p.done || now - (p.startedAt + p.duration) < 4000));
      if (this.processes.length !== before) changed = true;

      if (this.trace) {
        const rate = this.traceKillActive() ? 0.15 : 1;
        this.trace.remaining -= (1 / 60) * rate * 3;   // ~tick 20 fps
        if (this.trace.remaining <= 0) { this.traceExpired(); changed = true; }
      }
      if (changed) this.onChange('tick');
      return changed;
    };

    // -------------------------------------------------- effet des programmes
    game.finishProcess = function (p) {
      const w = this.world;
      const n = w.node(p.nodeId) || w.target;
      const shell = this.shell;

      switch (p.name) {
        case 'Hydra': {
          if (this.runHydra) this.runHydra(p);
          break;
        }
        case 'Metasploit': {
          if (this.runMsf) this.runMsf(p);
          break;
        }
        case 'Relais': {
          if (this.runRelais) this.runRelais(p);
          break;
        }
        default:
          this.say(`-- ${p.name} terminé --`, 'ok');
      }
      this.onProcessDone(p);
      this.onChange('process');
    };

    // -------------------------------------------------- sérialisation
    const origSerialize = game.serialize.bind(game);
    game.serialize = function () {
      const base = JSON.parse(origSerialize());
      base.v = Math.max(base.v || 1, 3);
      base.programs = this.processes.filter(p => p.persistent && !p.cancelled)
        .map(p => ({ name: p.name, pid: p.pid }));
      base.traceEnabled = this.traceEnabled;
      base.themeOverride = this.themeOverride;
      base.narrative = this.log.slice(-400);
      return JSON.stringify(base);
    };
    const origRestore = game.restore.bind(game);
    game.restore = function (json) {
      const d = JSON.parse(json);
      // Ces champs sont restaurés par cette couche : les contrôler avant
      // d'appeler la restauration du monde pour éviter une mutation partielle.
      if (d && ((d.programs != null && (!Array.isArray(d.programs) ||
          d.programs.some(p => !p || typeof p !== 'object' || typeof p.name !== 'string' || !Number.isFinite(p.pid)))) ||
          (d.narrative != null && !Array.isArray(d.narrative)))) {
        throw new Error('processus ou journal de sauvegarde invalides');
      }
      origRestore(json);
      this.traceEnabled = d.traceEnabled !== false;
      this.themeOverride = d.themeOverride || null;
      this.log = d.narrative || [];
      this.processes = [];
      this.trace = null;
      if (d.programs) {
        for (const s of d.programs) {
          const spec = PROGRAMS[s.name];
          if (!spec) continue;
          const p = new Process(s.name, spec, [], this.world.current, Date.now());
          p.pid = s.pid;
          Process.nextPid = Math.max(Process.nextPid, Number(p.pid) + 1 || Process.nextPid);
          this.processes.push(p);
        }
      }
      game.honeypot = { active: this.processes.some(p => p.name === 'Honeypot' && !p.cancelled && !p.done) };
      return true;
    };

    // -------------------------------------------------- commandes
    const cmds = game.shell.commands;

    cmds.ps = function () {
      const rows = game.processes.filter(p => !p.cancelled).map(p => {
        const st = p.persistent ? 'actif' : p.done ? 'terminé' : Math.round(p.progress * 100) + '%';
        return `${String(p.pid).padStart(5)}  ${p.name.padEnd(16)} ${String(p.ram).padStart(4)} Mo  ${st}`;
      });
      return {
        out: `  PID  PROGRAMME         RAM     ÉTAT
${rows.join('\n') || '  (aucun processus)'}

  RAM : ${game.ramUsed()} / ${game.ramTotal} Mo   (${game.ramFree()} libres)`, code: 0
      };
    };

    cmds.kill = function (a) {
      if (!a.length) return { out: 'usage: kill <pid>   (liste : ps)', code: 1 };
      const r = game.kill(a[0]);
      return { out: r.ok ? `Processus ${a[0]} arrêté.` : r.msg, code: r.ok ? 0 : 1 };
    };


    // outils de cassage spécifiques


    // programmes persistants

    cmds.trace = function (a) {
      if (a[0] === 'off') {
        game.traceEnabled = false; game.stopTrace();
        return { out: 'Traçage DÉSACTIVÉ. Mode serein : prends ton temps pour apprendre.', code: 0 };
      }
      if (a[0] === 'on') {
        game.traceEnabled = true;
        return { out: `Traçage ACTIVÉ (${game.traceTotal}s par intrusion).\nUne attaque lente (hydra -t 1) laisse plus de temps. exit annule.`, code: 0 };
      }
      if (!game.trace) {
        return { out: `Aucun traçage en cours. Traçage ${game.traceEnabled ? 'activé' : 'désactivé'}.\n  trace on / trace off`, code: 0 };
      }
      return {
        out: `TRAÇAGE : ${game.trace.remaining.toFixed(2)}s restantes
  Cible : ${game.world.node(game.trace.nodeId).name}
  Rythme : ${game.traceKillActive() ? 'ralenti' : 'normal'}
  exit ferme la session et annule le traçage.
  hydra -t 1 attaque lentement : moins de bruit, plus de temps.`, code: 0
      };
    };

    // Le crack générique déclenche un traçage plus rapide que les outils
    // adaptés : c'est la récompense mécanique du bon choix d'outil.
    const origCrack = cmds.crack;

    return game;
  }

  const API = { THEMES, PROGRAMS, RAM_TOTAL, Process, install };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.GamePrograms = API;
})(typeof window !== 'undefined' ? window : globalThis);
