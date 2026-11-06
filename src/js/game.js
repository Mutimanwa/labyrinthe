/* =====================================================================
   game.js — Progression, validation, commandes de jeu et cryptographie
   ===================================================================== */
(function (global) {
  'use strict';

  const E = global.GameEngine || (typeof require !== 'undefined' ? require('./engine.js') : null);
  const C = global.Campaign || (typeof require !== 'undefined' ? require('./campaign.js') : null);
  const PY = global.PyInterp || (typeof require !== 'undefined' ? require('./py.js') : null);

  // ------------------------------------------------------------ CRYPTO
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

  function b64encode(str) {
    const bytes = [];
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      if (c < 128) bytes.push(c);
      else if (c < 2048) bytes.push(192 | (c >> 6), 128 | (c & 63));
      else bytes.push(224 | (c >> 12), 128 | ((c >> 6) & 63), 128 | (c & 63));
    }
    let out = '';
    for (let i = 0; i < bytes.length; i += 3) {
      const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
      out += B64[b0 >> 2];
      out += B64[((b0 & 3) << 4) | ((b1 || 0) >> 4)];
      out += b1 === undefined ? '=' : B64[((b1 & 15) << 2) | ((b2 || 0) >> 6)];
      out += b2 === undefined ? '=' : B64[b2 & 63];
    }
    return out;
  }

  function b64decode(str) {
    const clean = str.replace(/[^A-Za-z0-9+/]/g, '');
    const bytes = [];
    for (let i = 0; i < clean.length; i += 4) {
      const n = (B64.indexOf(clean[i]) << 18) | (B64.indexOf(clean[i + 1]) << 12) |
        ((B64.indexOf(clean[i + 2]) & 63) << 6) | (B64.indexOf(clean[i + 3]) & 63);
      bytes.push((n >> 16) & 255);
      if (clean[i + 2] !== undefined && B64.indexOf(clean[i + 2]) >= 0) bytes.push((n >> 8) & 255);
      if (clean[i + 3] !== undefined && B64.indexOf(clean[i + 3]) >= 0) bytes.push(n & 255);
    }
    // décodage UTF-8
    let out = '', i = 0;
    while (i < bytes.length) {
      const b = bytes[i++];
      if (b < 128) out += String.fromCharCode(b);
      else if (b < 224) out += String.fromCharCode(((b & 31) << 6) | (bytes[i++] & 63));
      else out += String.fromCharCode(((b & 15) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63));
    }
    return out;
  }

  function rot13(str) {
    return str.replace(/[a-zA-Z]/g, c => {
      const base = c <= 'Z' ? 65 : 97;
      return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base);
    });
  }

  function caesar(str, shift) {
    return str.replace(/[a-zA-Z]/g, c => {
      const base = c <= 'Z' ? 65 : 97;
      return String.fromCharCode(((c.charCodeAt(0) - base + shift + 260) % 26) + base);
    });
  }

  // Hachage pédagogique (FNV-1a étendu sur 64 hex) — PAS cryptographique,
  // et le jeu le dit explicitement.
  function simpleHash(str) {
    let h1 = 0x811c9dc5, h2 = 0x01000193, h3 = 0xdeadbeef, h4 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
      h2 = Math.imul(h2 + c, 2246822519) >>> 0;
      h3 = Math.imul(h3 ^ (c + i), 3266489917) >>> 0;
      h4 = Math.imul(h4 + (c * (i + 1)), 668265263) >>> 0;
    }
    const hex = n => n.toString(16).padStart(8, '0');
    return hex(h1) + hex(h2) + hex(h3) + hex(h4) + hex(Math.imul(h1 ^ h3, 2654435761) >>> 0) + hex(Math.imul(h2 ^ h4, 40503) >>> 0);
  }

  function xorCipher(str, key) {
    if (!key) return str;
    let out = '';
    for (let i = 0; i < str.length; i++) {
      out += String.fromCharCode(str.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return out;
  }

  // ------------------------------------------------------------ PARTIE
  class Game {
    constructor(opts) {
      opts = opts || {};
      this.world = new E.World(C.WORLD_SPEC);
      this.events = [];
      this.missionIndex = 0;         // mission courante (0-based)
      this.completed = new Set();
      this.hintsUsed = 0;
      this.score = 0;
      this.credits = 0;
      this.startedAt = Date.now();
      this.missionStartedAt = Date.now();
      this.answer = null;
      // M2 — profil joueur, horloge du monde (T6), contrats data (T7)
      this.xp = 0; this.xpVersion = 1; this.respect = 0; this.cred = 0; this.sats = 0;
      this.worldMin = 0;                                   // minutes monde écoulées (1 s réelle = 1 min)
      this.intro = { terminee: false, etape: 0 };         // introduction narrative facultative
      this.tutorial = { step: 0, hidden: false };         // guide facultatif des premiers pas
      this.contractsState = { active: [], done: [] };
      this.techKeys = {};                                  // T8 — XP anti-grind : techniques déjà récompensées
      this.reports = {};                                   // T17 — rapports de pentest validés : { idContrat: { note, ts } }
      this.relais = {                                      // T18 — chenillard de relais vers le Puits
        position: 0,                                       // sauts déjà effectués (0-3)
        creditsDepenses: 0,                                // crédits dépensés en sauts
        puitsAtteint: false,                               // le Puits est-il accessible ?
        dernierSaut: null,                                 // timestamp du dernier saut
        historique: [],                                    // { saut, ts, cout, latence }
      };
      this.inventaire = [];                                // T19 — objets achetés au Marché du Puits
      this.achats = {};                                    // T19 — { idItem: { qte, ts } }
      this.marcheVersion = 1;                              // migration des anciennes livraisons
      this.sats = 0;                                       // T19 — sats (monnaie Puits)
      this.incidentsNoirs = [];                            // T20 — incidents noirs (achat piégé, exécution binaire Puits, etc.)
      this.gardienEnquete = {                              // T20 — enquête du GARDIEN
        active: false,                                     // une enquête est-elle en cours ?
        incidents: 0,                                      // nombre d'incidents noirs corrélés
        etat: 0,                                           // 0=rien, 1=convocation, 2=saisie, 3=fermeture
        ts: null,
      };
      this.tacheNoire = {                                  // T20 — rançongiciel du Puits
        active: false,                                     // la Tâche-Noire a-t-elle frappé ?
        fichiersChiffres: [],                              // chemins des fichiers chiffrés
        rancon: 0,                                         // montant demandé en sats
        ts: null,
        sauvegardes: {},                                   // copies de notes fictives, jamais de fichiers réels
        refusee: false,
      };
      this.fin = null;                                     // T20 — 'blanche' | 'noire' | null
      this.shell = new E.Shell(this.world, {
        py: PY,
        onEvent: (type, data) => this.record(type, data)
      });
      this.installCommands();
      // marquer le hub et le dépôt comme connus dès le départ ? non : à découvrir
    }

    record(type, data) {
      // Le type est l'identité de l'événement, pas un champ que le détail
      // peut écraser (un incident possède lui aussi son propre sous-type).
      this.events.push(Object.assign({ at: Date.now() }, data || {}, { type }));
      if (this.events.length > 4000) this.events.splice(0, 1000);
    }

    get mission() { return C.MISSIONS[this.missionIndex]; }
    get finished() { return this.completed.size >= C.MISSIONS.length; }

    moduleRank(mod) {
      const ids = C.MISSIONS.filter(m => m.module === mod).map(m => m.id);
      return ids.filter(id => this.completed.has(id)).length + '/' + ids.length;
    }

    checkMission(answer) {
      const m = this.mission;
      if (!m) return { done: false, hint: 'Cursus terminé.' };
      if (answer !== undefined && answer !== null && answer !== '') {
        this.answer = answer;
      }
      const res = m.validate(this.world, this.shell, this.events,
        m.needsAnswer ? this.answer : null);
      return res;
    }

    completeMission() {
      const m = this.mission;
      if (!m || this.completed.has(m.id)) return null;
      this.completed.add(m.id);
      const elapsed = (Date.now() - this.missionStartedAt) / 1000;
      const speedBonus = elapsed < 120 ? 25 : elapsed < 300 ? 10 : 0;
      const gained = 100 + speedBonus;
      this.score += gained;
      this.credits += (m.reward || 0);
      // L'XP reflète aussi la difficulté de la mission. Sans cette part, les
      // rangs avancés et le nettoyage de Tâche-Noire étaient inatteignables.
      const xpGained = gained + Math.round((m.reward || 0) / 2);
      this.xp = (this.xp || 0) + xpGained;
      this.missionIndex = Math.min(this.missionIndex + 1, C.MISSIONS.length);
      this.missionStartedAt = Date.now();
      this.answer = null;
      return { mission: m, gained, xpGained, speedBonus, elapsed: Math.round(elapsed), reward: m.reward || 0, credits: this.credits };
    }

    serialize() {
      const nodes = {};
      for (const id in this.world.nodes) {
        const n = this.world.nodes[id];
        nodes[id] = {
          files: n.files,
          ports: n.ports,
          firewall: n.firewall,
          users: n.users,
          links: n.links,
          crackedPorts: [...n.crackedPorts],
          firewallDown: n.firewallDown,
          isAdmin: n.isAdmin,
          discovered: n.discovered,
          loggingDisabled: n.loggingDisabled
        };
      }
      return JSON.stringify({
        v: 4,
        nodes,
        creds: this.creds || {},
        traceEnabled: this.traceEnabled !== false,
        current: this.world.current,
        cwd: this.world.cwd,
        user: this.world.user,
        missionIndex: this.missionIndex,
        missionStartedAt: this.missionStartedAt,
        answer: this.answer,
        completed: [...this.completed],
        hintsUsed: this.hintsUsed,
        score: this.score,
        credits: this.credits || 0,
        xp: this.xp || 0,
        xpVersion: this.xpVersion,
        respect: this.respect || 0,
        cred: this.cred || 0,
        worldMin: Math.round(this.worldMin || 0),
        intro: this.intro || { terminee: true, etape: 0 },
        tutorial: this.tutorial || { step: 0, hidden: true },
        contracts: this.contractsState || { active: [], done: [] },
        api: this.api && typeof this.api.snapshot === 'function' ? this.api.snapshot() : null,
        sats: this.sats || 0,
        inventaire: this.inventaire || [],
        achats: this.achats || {},
        marcheVersion: this.marcheVersion,
        tech: this.techKeys || {},
        forum: this.forum || null,
        mail: this.mail || null,
        echo: this.echo || null,
        npc: this.npc || null,
        reports: this.reports || {},
        vols: this.vols || null,
        relais: this.relais || { position: 0 },
        incidentsNoirs: this.incidentsNoirs || [],
        gardienEnquete: this.gardienEnquete || { active: false, incidents: 0, etat: 0, ts: null },
        tacheNoire: this.tacheNoire || { active: false, fichiersChiffres: [], rancon: 0, ts: null },
        fin: this.fin || null,
        soundEnabled: this.soundEnabled !== false,
        soundVolume: typeof this.soundVolume === 'number' ? this.soundVolume : 0.35,
        promptStyle: this.promptStyle || 'demande',
        startedAt: this.startedAt,
        events: this.events.slice(-800)
      });
    }

    restore(json) {
      const d = JSON.parse(json);
      if (!d || ![1, 2, 3, 4].includes(d.v)) throw new Error('format de sauvegarde inconnu');
      // Valider avant toute mutation : un fichier d'import incomplet ne doit
      // pas casser la partie courante ni être ensuite autosauvegardé.
      if (!d.nodes || typeof d.nodes !== 'object' || Array.isArray(d.nodes) ||
          typeof d.current !== 'string' || !this.world.nodes[d.current] ||
          typeof d.cwd !== 'string' || typeof d.user !== 'string' ||
          !Number.isInteger(d.missionIndex) || d.missionIndex < 0 || d.missionIndex > C.MISSIONS.length ||
          !Array.isArray(d.completed) || d.completed.some(id => !C.MISSIONS.some(m => m.id === id)) ||
          (d.events != null && !Array.isArray(d.events))) {
        throw new Error('sauvegarde incomplète ou corrompue');
      }
      const isObject = value => !!value && typeof value === 'object' && !Array.isArray(value);
      for (const node of Object.values(d.nodes)) {
        if (!isObject(node) || !isObject(node.files) ||
            Object.values(node.files).some(file => !isObject(file) ||
              !['file', 'dir'].includes(file.type) || (file.type === 'file' && typeof file.content !== 'string')) ||
            (node.crackedPorts != null && !Array.isArray(node.crackedPorts)) ||
            (node.links != null && (!Array.isArray(node.links) || node.links.some(id => typeof id !== 'string'))) ||
            (node.ports != null && (!isObject(node.ports) || Object.values(node.ports).some(port => !isObject(port)))) ||
            (node.users != null && !isObject(node.users)) ||
            (node.firewall != null && (!isObject(node.firewall) ||
              (node.firewall.allow != null && !Array.isArray(node.firewall.allow)) ||
              (node.firewall.rules != null && !Array.isArray(node.firewall.rules))))) {
          throw new Error('machines de sauvegarde invalides');
        }
      }
      if (d.events && d.events.some(event => !isObject(event) || typeof event.type !== 'string' ||
          (event.paths != null && (!Array.isArray(event.paths) || event.paths.some(path => typeof path !== 'string'))) ||
          (event.ports != null && !Array.isArray(event.ports)))) {
        throw new Error('événements de sauvegarde invalides');
      }
      if (d.contracts != null && (!isObject(d.contracts) || !Array.isArray(d.contracts.active) || !Array.isArray(d.contracts.done))) {
        throw new Error('contrats de sauvegarde invalides');
      }
      if (d.tutorial != null && (!isObject(d.tutorial) ||
          (d.tutorial.step != null && !Number.isInteger(d.tutorial.step)))) {
        throw new Error('guide de sauvegarde invalide');
      }
      if (d.intro != null && (!isObject(d.intro) || typeof d.intro.terminee !== 'boolean' ||
          !Number.isInteger(d.intro.etape) || d.intro.etape < 0 ||
          (d.intro.pauseEnregistreeA != null && (!Number.isFinite(d.intro.pauseEnregistreeA) || d.intro.pauseEnregistreeA < 0)))) {
        throw new Error('introduction de sauvegarde invalide');
      }
      if ((d.worldMin != null && (!Number.isFinite(d.worldMin) || d.worldMin < 0)) ||
          (d.relais != null && (!isObject(d.relais) ||
            (d.relais.position != null && (!Number.isInteger(d.relais.position) || d.relais.position < 0 || d.relais.position > 3)) ||
            (d.relais.creditsDepenses != null && (!Number.isFinite(d.relais.creditsDepenses) || d.relais.creditsDepenses < 0)) ||
            (d.relais.historique != null && !Array.isArray(d.relais.historique)))) ||
          (d.inventaire != null && (!Array.isArray(d.inventaire) || d.inventaire.some(item => typeof item !== 'string'))) ||
          (d.achats != null && !isObject(d.achats)) ||
          (d.marcheVersion != null && (!Number.isInteger(d.marcheVersion) || d.marcheVersion < 0)) ||
          (d.xpVersion != null && (!Number.isInteger(d.xpVersion) || d.xpVersion < 0)) ||
          (d.incidentsNoirs != null && (!Array.isArray(d.incidentsNoirs) || d.incidentsNoirs.some(i => !isObject(i) || typeof i.type !== 'string'))) ||
          (d.gardienEnquete != null && (!isObject(d.gardienEnquete) || (d.gardienEnquete.active != null && typeof d.gardienEnquete.active !== 'boolean'))) ||
          (d.tacheNoire != null && (!isObject(d.tacheNoire) ||
            (d.tacheNoire.active != null && typeof d.tacheNoire.active !== 'boolean') ||
            (d.tacheNoire.rancon != null && (!Number.isSafeInteger(d.tacheNoire.rancon) || d.tacheNoire.rancon < 0)) ||
            (d.tacheNoire.fichiersChiffres != null && (!Array.isArray(d.tacheNoire.fichiersChiffres) || d.tacheNoire.fichiersChiffres.some(path => typeof path !== 'string'))) ||
            (d.tacheNoire.sauvegardes != null && (!isObject(d.tacheNoire.sauvegardes) || Object.entries(d.tacheNoire.sauvegardes).some(([path, copy]) =>
              !path.startsWith('/home/joueur/') || !isObject(copy) || typeof copy.contenu !== 'string' || typeof copy.marqueur !== 'string'))))) ||
          ['credits', 'xp', 'respect', 'cred', 'sats'].some(key => d[key] != null && (!Number.isSafeInteger(d[key]) || d[key] < 0))) {
        throw new Error('progression de sauvegarde invalide');
      }
      if (d.api != null && (!isObject(d.api) || !Array.isArray(d.api.users) || !Array.isArray(d.api.posts) ||
          d.api.users.some(user => !isObject(user) || !Number.isFinite(user.id) ||
            ['name', 'email', 'role', 'city'].some(key => typeof user[key] !== 'string')) ||
          d.api.posts.some(post => !isObject(post) || !Array.isArray(post.tags)))) {
        throw new Error('données API de sauvegarde invalides');
      }
      // Les processus temporaires et les demandes de mot de passe ne sont pas
      // sérialisés. Ne pas laisser un ancien travail agir sur la partie importée.
      // La couche programmes rétablit ensuite les processus persistants sauvegardés.
      if (Array.isArray(this.processes)) this.processes = [];
      if (this.honeypot) this.honeypot = { active: false };
      this.trace = null;
      this.crackAnim = null;
      this.pendingSsh = null;
      for (const id in d.nodes) {
        const n = this.world.nodes[id];
        if (!n) continue;
        const s = d.nodes[id];
        n.files = s.files;
        if (s.ports) n.ports = s.ports;
        if (s.users) n.users = s.users;
        n.links = s.links ? s.links.slice() : n._initialLinks.slice();
        n.firewall = s.firewall !== undefined ? s.firewall
          : n._initialFirewall ? JSON.parse(JSON.stringify(n._initialFirewall)) : null;
        n.crackedPorts = new Set(s.crackedPorts);
        n.firewallDown = typeof s.firewallDown === 'boolean' ? s.firewallDown : !n.firewall;
        n.isAdmin = !!s.isAdmin;
        n.discovered = !!s.discovered;
        n.loggingDisabled = !!s.loggingDisabled;
      }
      // v3 : identifiants découverts par hydra / msfconsole, et mode de traçage
      this.creds = d.creds || {};
      if (d.traceEnabled !== undefined) this.traceEnabled = !!d.traceEnabled;
      this.world.current = d.current;
      this.world.cwd = d.cwd;
      this.world.user = d.user;
      this.missionIndex = d.missionIndex;
      this.missionStartedAt = Number.isFinite(d.missionStartedAt) ? d.missionStartedAt : Date.now();
      this.answer = typeof d.answer === 'string' ? d.answer : null;
      this.completed = new Set(d.completed);
      this.hintsUsed = d.hintsUsed || 0;
      this.score = d.score || 0;
      this.credits = d.credits || 0;
      if (d.soundEnabled !== undefined) this.soundEnabled = !!d.soundEnabled;
      if (typeof d.soundVolume === 'number') this.soundVolume = d.soundVolume;
      if (d.promptStyle) this.promptStyle = d.promptStyle;
      this.startedAt = Number.isFinite(d.startedAt) ? d.startedAt : Date.now();
      // v4 : profil, horloge, contrats data (défauts sûrs pour anciennes saves)
      this.xp = d.xp || 0;
      // Attribuer une seule fois le complément d'XP aux missions déjà
      // terminées dans les sauvegardes antérieures au rééquilibrage.
      if (!d.xpVersion) this.xp += C.MISSIONS.reduce((sum, mission) =>
        sum + (this.completed.has(mission.id) ? Math.round((mission.reward || 0) / 2) + (d.xp == null ? 100 : 0) : 0), 0);
      this.xpVersion = 1;
      this.respect = d.respect || 0;
      this.cred = d.cred || 0;
      this.worldMin = d.worldMin || 0;
      // Les décorateurs d'horloge et d'ECHO existent déjà lors d'un import en
      // cours de partie ; repartir de l'heure restaurée évite de perdre ou de
      // concentrer artificiellement la décroissance des traces.
      if (this._clockLast !== undefined) this._clockLast = Date.now();
      if (this._echoMonde !== undefined) this._echoMonde = this.worldMin;
      // Ne pas interrompre les anciennes parties, qui peuvent revoir
      // l'introduction à la demande depuis la barre haute.
      this.intro = d.intro || { terminee: true, etape: 0 };
      // Les anciennes parties n'affichent pas le guide de force ; ◎ permet
      // de le rouvrir à tout moment.
      this.tutorial = d.tutorial || { step: 0, hidden: true };
      this.contractsState = d.contracts || { active: [], done: [] };
      if (this.api) {
        if (typeof this.api.reset === 'function') this.api.reset();
        if (d.api && typeof this.api.restore === 'function') this.api.restore(d.api);
      }
      this.__reportNotices = new Set();
      this.sats = d.sats || 0;
      this.inventaire = d.inventaire || [];
      this.achats = d.achats || {};
      this.techKeys = d.tech || {};
      this.forum = d.forum || null;
      this.mail = d.mail || null;
      this.echo = d.echo || null;
      this.npc = d.npc || null;
      this.vols = d.vols || null;
      this.reports = d.reports || {};
      this.relais = Object.assign({ position: 0, creditsDepenses: 0, puitsAtteint: false, dernierSaut: null, historique: [] }, d.relais || {});
      if (this.relais.position == null) this.relais.position = 0;
      if (this.relais.creditsDepenses == null) this.relais.creditsDepenses = 0;
      if (!Array.isArray(this.relais.historique)) this.relais.historique = [];
      // Réparer les anciennes parties qui avaient atteint le Puits avant que
      // les liens et le compte de visite soient sauvegardés correctement.
      if (this.relais.puitsAtteint) {
        this.relais.position = 3;
        const puits = this.world.node('puits');
        if (puits) {
          puits.discovered = true;
          if (!Object.prototype.hasOwnProperty.call(puits.users, 'joueur')) puits.users.joueur = 'puits';
        }
        if (!this.world.home.links.includes('puits')) this.world.home.links.push('puits');
      }
      // Une ancienne version créait « achats » comme fichier vide tout en y
      // plaçant des enfants : convertir seulement ce cas sans données perdues.
      const achats = this.world.home.get('/home/joueur/achats');
      if (achats && achats.type === 'file' && achats.content === '' &&
          Object.keys(this.world.home.files).some(path => path.startsWith('/home/joueur/achats/'))) {
        this.world.home.files['/home/joueur/achats'] = { type: 'dir', perms: 'drwxr-xr-x', owner: 'joueur' };
      }
      this.marcheVersion = d.marcheVersion || 0;
      if (this.marcheVersion < 1 && typeof this.migrerMarche === 'function' && this.migrerMarche()) this.marcheVersion = 1;
      this.incidentsNoirs = d.incidentsNoirs || [];
      this.gardienEnquete = Object.assign({ active: false, incidents: 0, etat: 0, ts: null }, d.gardienEnquete || {});
      this.tacheNoire = Object.assign({ active: false, fichiersChiffres: [], rancon: 0, ts: null, sauvegardes: {}, refusee: false }, d.tacheNoire || {});
      if (!Array.isArray(this.tacheNoire.fichiersChiffres)) this.tacheNoire.fichiersChiffres = [];
      if (!isObject(this.tacheNoire.sauvegardes)) this.tacheNoire.sauvegardes = {};
      if (this.tacheNoire.rancon == null) this.tacheNoire.rancon = 0;
      // Les anciennes versions pouvaient figer une fin dès le premier tour.
      // Tant que le cursus n'est pas terminé, ce choix n'est pas définitif.
      this.fin = this.finished && ['blanche', 'noire'].includes(d.fin) ? d.fin : null;
      this.events = d.events || [];
      return true;
    }

    // -------------------------------------------------- COMMANDES DE JEU
    installCommands() {
      const g = this;
      const cmds = this.shell.commands;

      cmds.missions = function () {
        const rows = [];
        let lastMod = null;
        for (const m of C.MISSIONS) {
          if (m.module !== lastMod) {
            rows.push('');
            rows.push(`  ${m.module}   [${g.moduleRank(m.module)}]`);
            lastMod = m.module;
          }
          const done = g.completed.has(m.id);
          const current = g.mission && g.mission.id === m.id;
          const locked = !done && !current && m.id > (g.mission ? g.mission.id : 1);
          const mark = done ? '[X]' : current ? '[>]' : locked ? '[ ]' : '[ ]';
          rows.push(`    ${mark} ${String(m.id).padStart(2)}. ${m.titre}${current ? '   ← en cours' : ''}`);
        }
        return {
          out: `CURSUS — ${C.MISSIONS.length} missions, ${new Set(C.MISSIONS.map(m => m.module)).size} modules
${rows.join('\n')}

  [X] réussie   [>] en cours   [ ] à venir

  objectif     relire la mission en cours
  indice       obtenir de l'aide
  stats        ton score`, code: 0
        };
      };

      cmds.objectif = function () {
        const m = g.mission;
        if (!m) return { out: 'Cursus terminé ! Tape "stats" pour ton bilan.', code: 0 };
        return {
          out: `MISSION ${m.id}/${C.MISSIONS.length} — ${m.module}
${m.titre}

${m.brief}

${m.cours ? `Note de cours : cat ${m.cours}  (depuis ACADEMIE 10.10.0.1)` : ''}`,
          code: 0
        };
      };

      cmds.indice = function () {
        const m = g.mission;
        if (!m) return { out: 'Plus rien à faire, tu as tout terminé.', code: 0 };
        const res = g.checkMission();
        g.hintsUsed++;
        g.score = Math.max(0, g.score - 5);
        if (res.done) {
          return { out: 'Objectif déjà atteint ! Tape : valider', code: 0 };
        }
        return {
          out: `INDICE (-5 points)

  ${res.hint || 'Relis la note de cours : cat ' + m.cours}

  Rappel : 'objectif' pour relire la consigne complète.`, code: 0
        };
      };

      cmds.valider = function (a, raw) {
        const m = g.mission;
        if (!m) return { out: 'Cursus déjà terminé. Bravo !', code: 0 };
        const answer = raw.replace(/^valider\s*/, '').trim();
        const res = g.checkMission(answer || null);
        if (!res.done) {
          return {
            out: `PAS ENCORE VALIDÉ

  ${res.hint || 'Relis la consigne avec : objectif'}

  Besoin d'aide ? Tape : indice`, code: 1
          };
        }
        const done = g.completeMission();
        const next = g.mission;
        return {
          out: `__MISSION_DONE__${JSON.stringify({
            id: done.mission.id,
            titre: done.mission.titre,
            module: done.mission.module,
            gained: done.gained,
            xpGained: done.xpGained,
            speedBonus: done.speedBonus,
            debrief: done.mission.debrief,
            next: next ? { id: next.id, titre: next.titre, module: next.module } : null,
            score: g.score,
            reward: done.reward,
            credits: g.credits,
            finished: g.finished
          })}`, code: 0
        };
      };

      cmds.stats = function () {
        const elapsed = Math.round((Date.now() - g.startedAt) / 1000);
        const mins = Math.floor(elapsed / 60), secs = elapsed % 60;
        const rows = [...new Set(C.MISSIONS.map(m => m.module))]
          .map(mod => `  ${mod.padEnd(20)} ${g.moduleRank(mod)}`);
        const pct = Math.round(100 * g.completed.size / C.MISSIONS.length);
        let rank;
        if (pct === 100) rank = 'ARCHITECTE';
        else if (pct >= 75) rank = 'ANALYSTE CONFIRMÉ';
        else if (pct >= 50) rank = 'APPRENTI';
        else if (pct >= 25) rank = 'INITIÉ';
        else rank = 'DÉBUTANT';
        return {
          out: `PROGRESSION

${rows.join('\n')}

  Total      ${g.completed.size}/${C.MISSIONS.length}  (${pct} %)
  Score      ${g.score} points
  Indices    ${g.hintsUsed}
  Durée      ${mins}m${String(secs).padStart(2, '0')}s
  Cursus     ${rank} (progression des missions)
  XP         ${g.xp || 0} (rang dans le profil)`, code: 0
        };
      };

      cmds.sauver = function () {
        g.record('save', {});
        return { out: '__SAVE__' + g.serialize(), code: 0 };
      };

      cmds.charger = function (a, raw) {
        return { out: '__LOAD__', code: 0 };
      };

      cmds.reset = function () {
        return { out: '__RESET__', code: 0 };
      };

      // -------------------------------------------------- PROMPT
      cmds.prompt = function (a) {
        const styles = ['demande', 'kali', 'simple'];
        const want = (a[0] || '').toLowerCase();
        if (!want) {
          const p = g.promptStyle || 'demande';
          return { out: `PROMPT — style actuel : ${p}

  prompt demande   (10.10.0.5@㉿joueur)-[~/telecharges]  puis  >
  prompt kali      ┌──(joueur㉿10.10.0.5)-[~/telecharges]  puis  └─$
  prompt simple    10.10.0.5@>

Le chemin affiché est toujours le chemin RÉEL du dossier courant,
avec ~ pour ton répertoire personnel.`, code: 0 };
        }
        if (!styles.includes(want)) return { out: 'styles disponibles : ' + styles.join(', '), code: 1 };
        g.promptStyle = want;
        return { out: `Style de prompt : ${want}`, code: 0 };
      };

      // -------------------------------------------------- RAPPORT DE PENTEST (T17)
      // Gabarit à remplir dans l'éditeur, validé par mots-clés + structure.
      // Un contrat avec report_required ne paie que si le rapport est validé.
      cmds.rapport = function (a, raw) {
        const id = a[0];
        if (!id) {
          return { out: 'usage: rapport <id_contrat>   (ouvre le gabarit dans l’éditeur)\n       rapport soumettre <id_contrat>   (valide et note le rapport)', code: 1 };
        }
        if (a[0] === 'soumettre') {
          const cid = a[1];
          if (!cid) return { out: 'usage: rapport soumettre <id_contrat>', code: 1 };
          return soumettreRapport(g, cid);
        }
        // ouvrir le gabarit dans l’éditeur
        const path = '/home/joueur/rapports/rapport_' + id + '.txt';
        const home = g.world.home;
        const dir = '/home/joueur/rapports';
        const existing = home.get(dir);
        // Anciennes parties : une version créait par erreur un fichier vide
        // à la place du dossier. Ne pas écraser un fichier non vide du joueur.
        if (existing && existing.type !== 'dir') {
          if (existing.type === 'file' && existing.content === '') {
            home.files[dir] = { type: 'dir', perms: 'drwxr-xr-x', owner: 'joueur' };
          } else {
            return { out: `rapport: ${dir} n'est pas un dossier. Déplacez ce fichier avant de continuer.`, code: 1 };
          }
        }
        if (!home.get(path)) {
          home.addFile(path,
            `RAPPORT DE PENTEST — contrat ${id}\n\n` +
            `Date : ${new Date().toISOString().slice(0, 10)}\n` +
            `Auditeur : joueur (10.10.0.5)\n` +
            `Cible : \n\n` +
            `1. VULNÉRABILITÉ\n   ___\n\n____________________________________________________________\n\n2. PREUVE\n   ___\n\n____________________________________________________________\n\n3. IMPACT\n   ___\n\n____________________________________________________________\n\n4. CORRECTIF\n   ___\n\n____________________________________________________________\n\n5. SIGNATURE\n   Je certifie que ce rapport reflète mes propres constatations.\n   Signé : \n`,
            { owner: 'joueur' });
        }
        return { out: '__EDIT_HOME__' + path, code: 0 };
      };

      function soumettreRapport(g, cid) {
        const home = g.world.home;
        const path = '/home/joueur/rapports/rapport_' + cid + '.txt';
        const f = home.get(path);
        if (!f || f.type !== 'file') {
          return { out: `rapport: aucun fichier '${path}'. Ouvrez d’abord avec : rapport ${cid}`, code: 1 };
        }
        const c = f.content || '';
        const lignes = c.split('\n');
        const score = [];
        // 1. Vulnérabilité : section remplie (quelque chose entre le marqueur et le suivant)
        function section(titre) {
          const i = lignes.findIndex(l => l.trim() === titre || l.trim().startsWith(titre));
          if (i < 0) return null;
          let j = i + 1;
          while (j < lignes.length && !/^\d\./.test(lignes[j])) j++;
          return lignes.slice(i + 1, j).join(' ').trim();
        }
        function texteSection(titre) {
          const brut = section(titre) || '';
          // ___ = marqueur de placeholder non rempli
          return brut.replace(/___/g, '').replace(/\s/g, '');
        }
        const vuln = texteSection('1. VULNÉRABILITÉ');
        const preuve = texteSection('2. PREUVE');
        const impact = texteSection('3. IMPACT');
        const correctif = texteSection('4. CORRECTIF');
        let note = 0;
        let motifs = [];
        if (!vuln) motifs.push('section 1 (vulnérabilité) non remplie');
        else { note += 25; motifs.push('section 1 présente'); }
        if (!preuve) motifs.push('section 2 (preuve) non remplie');
        else { note += 25; motifs.push('section 2 présente'); }
        if (!impact) motifs.push('section 3 (impact) non remplie');
        else { note += 25; motifs.push('section 3 présente'); }
        if (!correctif) motifs.push('section 4 (correctif) non remplie');
        else { note += 25; motifs.push('section 4 présente'); }
        const valide = note === 100;
        if (!g.reports) g.reports = {};
        g.reports[cid] = { note, valide, ts: Date.now() };
        if (valide) {
          g.record('rapport-valide', { id: cid, note });
          return {
            out: `RAPPORT ${cid} VALIDÉ — note ${note}/100.\n  ${motifs.join('; ')}.\n  Le contrat peut désormais être payé si les faits du monde sont atteints.`,
            code: 0
          };
        }
        return {
          out: `RAPPORT ${cid} REJETÉ — note ${note}/100.\n  ${motifs.join('; ')}.\n  Complétez les sections manquantes, puis resoumettez : rapport soumettre ${cid}`,
          code: 1
        };
      }

      // -------------------------------------------------- CRYPTO
      cmds.base64 = function (a, raw) {
        const text = raw.replace(/^base64\s*/, '').replace(/^["']|["']$/g, '');
        if (!text) return { out: 'usage: base64 <texte>', code: 1 };
        g.record('crypto', { op: 'base64' });
        return { out: b64encode(text), code: 0 };
      };





    }
  }

  const API = { Game, b64encode, b64decode, rot13, caesar, simpleHash, xorCipher };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.GameCore = API;
})(typeof window !== 'undefined' ? window : globalThis);
