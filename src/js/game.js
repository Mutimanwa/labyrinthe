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
      this.xp = 0; this.respect = 0; this.cred = 0; this.sats = 0;
      this.worldMin = 0;                                   // minutes monde écoulées (1 s réelle = 1 min)
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
      this.events.push(Object.assign({ type, at: Date.now() }, data || {}));
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
      this.xp = (this.xp || 0) + gained;                   // T8 — la campagne nourrit le rang
      this.missionIndex = Math.min(this.missionIndex + 1, C.MISSIONS.length);
      this.missionStartedAt = Date.now();
      this.answer = null;
      return { mission: m, gained, speedBonus, elapsed: Math.round(elapsed), reward: m.reward || 0, credits: this.credits };
    }

    serialize() {
      const nodes = {};
      for (const id in this.world.nodes) {
        const n = this.world.nodes[id];
        nodes[id] = {
          files: n.files,
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
        completed: [...this.completed],
        hintsUsed: this.hintsUsed,
        score: this.score,
        credits: this.credits || 0,
        xp: this.xp || 0,
        respect: this.respect || 0,
        cred: this.cred || 0,
        worldMin: Math.round(this.worldMin || 0),
        contracts: this.contractsState || { active: [], done: [] },
        sats: this.sats || 0,
        inventaire: this.inventaire || [],
        achats: this.achats || {},
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
      for (const id in d.nodes) {
        const n = this.world.nodes[id];
        if (!n) continue;
        const s = d.nodes[id];
        n.files = s.files;
        n.crackedPorts = new Set(s.crackedPorts);
        n.firewallDown = s.firewallDown;
        n.isAdmin = s.isAdmin;
        n.discovered = s.discovered;
        n.loggingDisabled = !!s.loggingDisabled;
      }
      // v3 : identifiants découverts par hydra / msfconsole, et mode de traçage
      this.creds = d.creds || {};
      if (d.traceEnabled !== undefined) this.traceEnabled = !!d.traceEnabled;
      this.world.current = d.current;
      this.world.cwd = d.cwd;
      this.world.user = d.user;
      this.missionIndex = d.missionIndex;
      this.completed = new Set(d.completed);
      this.hintsUsed = d.hintsUsed;
      this.score = d.score;
      this.credits = d.credits || 0;
      if (d.soundEnabled !== undefined) this.soundEnabled = !!d.soundEnabled;
      if (typeof d.soundVolume === 'number') this.soundVolume = d.soundVolume;
      if (d.promptStyle) this.promptStyle = d.promptStyle;
      this.startedAt = d.startedAt;
      // v4 : profil, horloge, contrats data (défauts sûrs pour anciennes saves)
      this.xp = d.xp || 0;
      this.respect = d.respect || 0;
      this.cred = d.cred || 0;
      this.worldMin = d.worldMin || 0;
      this.contractsState = d.contracts || { active: [], done: [] };
      this.sats = d.sats || 0;
      this.inventaire = d.inventaire || [];
      this.achats = d.achats || {};
      this.techKeys = d.tech || {};
      if (d.forum) this.forum = d.forum;
      if (d.mail) this.mail = d.mail;
      if (d.echo) this.echo = d.echo;
      if (d.npc) this.npc = d.npc;
      if (d.vols) this.vols = d.vols;
      if (d.reports) this.reports = d.reports;
      if (d.relais) this.relais = d.relais;
      if (d.incidentsNoirs) this.incidentsNoirs = d.incidentsNoirs;
      if (d.gardienEnquete) this.gardienEnquete = d.gardienEnquete;
      if (d.tacheNoire) this.tacheNoire = d.tacheNoire;
      if (d.fin !== undefined) this.fin = d.fin;
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
          out: `CURSUS — 16 missions, 4 modules
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
          out: `MISSION ${m.id}/16 — ${m.module}
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
        const rows = ['SHELL LINUX', 'PROGRAMMATION', 'RESEAU', 'CYBERSECURITE']
          .map(mod => `  ${mod.padEnd(16)} ${g.moduleRank(mod)}`);
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
  Rang       ${rank}`, code: 0
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
        if (!home.get('/home/joueur/rapports')) home.addFile('/home/joueur/rapports', '', { owner: 'joueur' });
        if (!home.get(path)) {
          home.addFile(path,
            `RAPPORT DE PENTEST — contrat ${id}\n\n` +
            `Date : ${new Date().toISOString().slice(0, 10)}\n` +
            `Auditeur : joueur (10.10.0.5)\n` +
            `Cible : \n\n` +
            `1. VULNÉRABILITÉ\n   ___\n\n____________________________________________________________\n\n2. PREUVE\n   ___\n\n____________________________________________________________\n\n3. IMPACT\n   ___\n\n____________________________________________________________\n\n4. CORRECTIF\n   ___\n\n____________________________________________________________\n\n5. SIGNATURE\n   Je certifie que ce rapport reflète mes propres constatations.\n   Signé : \n`,
            { owner: 'joueur' });
        }
        return { out: '__EDIT__' + path, code: 0 };
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
