/* =====================================================================
   npc.js — Les chasseurs (T13). ECHO prend un visage.
   · Le BALAYEUR  : vagues de scans périodiques contre ta machine ;
     force brute si ton ssh est exposé et faible → intrusion niveau 1.
   · Le CHASSEUR DE TRACES : relit l'auth.log des machines où ton bruit
     dépasse 20 ; ta signature (10.10.0.5) y a disparu ? il va chercher
     ailleurs. Trois relevés → publication moqueuse (−2 respect).
   · Le RANCUNIER : touche netInterne (sa machine) → ripostes différées.
     Il perd ta trace si tu nettoies SES journaux. Vécu, pas expliqué.

   Tout est daté en heure monde et persisté (game.npc, v4).
   La parade du joueur = T14 (durcissement) ; le sang plein = T15/T20.
   ===================================================================== */
(function (global) {
  'use strict';

  const MOIS3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MOI = 'joueur';
  const SIEEEE = ['94.23.117.88', '185.107.94.2', '203.0.113.66', '198.51.100.23'];
  const FAIBLES = ['root', 'joueur', '1234', 'password', 'qwerty', 'toor', 'letmein', 'admin', '123456'];

  function game() { return global.LABYRINTHE && global.LABYRINTHE.game; }
  function etat(g) {
    if (!g.npc) g.npc = {
      balayeur: { prochain: 25 },
      chasseur: { prochain: 120, pistes: 0 },
      rancunier: { enColere: false, prochain: 0, vagues: 0 }
    };
    return g.npc;
  }
  function ts(g) {
    const d = global.LabyClock ? global.LabyClock.dateMonde(g) : new Date();
    return `${MOIS3[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, ' ')} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')}`;
  }
  const alea = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const jitter = base => Math.round(base * (0.7 + Math.random() * 0.6));

  /* ------------------------------------------------ utilitaires monde */
  function ecrireChemin(node, path, ligne) {
    if (!node || !node.files) return;
    const f = node.get(path);
    if (f && f.type === 'file') f.content = (f.content || '') + ligne + '\n';
    else if (node.addFile) node.addFile(path, ligne + '\n', {});
    // borne logrotate brutale
    const ls = (node.get(path) && node.get(path).content || '').split('\n');
    if (ls.length > 400) node.get(path).content = ls.slice(-400).join('\n');
  }
  function postureMoi(g) {
    // ta machine est-elle une cible ouverte ? ssh exposé + authentification par mot de passe
    const me = g.world && g.world.nodes && g.world.nodes[MOI];
    if (!me) return { ouvert: false, faible: false, me: null };
    const sshPort = me.sshPort ? me.sshPort() : 22;
    const ouvert = me.porteOuverte ? me.porteOuverte(sshPort) : false;
    const cfg = me.sshd ? me.sshd() : { PermitRootLogin: 'yes', PasswordAuthentication: 'yes' };
    const authOk = cfg.PasswordAuthentication !== 'no';
    const users = me.users || {};
    const faible = ouvert && authOk && Object.keys(users).some(u => {
      const pass = String(users[u] || '').toLowerCase();
      if (!FAIBLES.includes(pass)) return false;
      if (u === 'root' && cfg.PermitRootLogin === 'no') return false;
      return true;
    });
    return { ouvert, faible, me, sshPort, cfg };
  }
  function dire(g, txt, cls) { if (g.say) g.say(txt, cls); }

  /* ------------------------------------------------ LE BALAYEUR */
  function vagueBalayeur(g) {
    const n = etat(g);
    const src = alea(SIEEEE);
    const { ouvert, faible, me } = postureMoi(g);
    if (!me) return;
    const h = me.name || 'Ton poste';
    ecrireChemin(me, '/var/log/kern.log',
      `${ts(g)} ${h} kernel: [SCAN] IN=eth0 SRC=${src} SYN DPT=22 WINDOW=65535`);
    // les vagues passent souvent en silence — la leçon, c'est ta lecture des logs
    if (Math.random() < 0.08) dire(g, `· ta passerelle note un balayage depuis ${src} (cf. /var/log/kern.log)`, 'dim');

    if (!ouvert) {
      // le pare-feu (ou l'absence de port) stoppe le balayage au niveau réseau
      if (Math.random() < 0.2) dire(g, `· le Balayeur bute sur ton pare-feu (${src}) — il passe son chemin.`, 'ok');
      n.balayeur.prochain = (g.worldMin || 0) + jitter(200);
      return;
    }
    // le port écoute : tentative d'authentification
    const cfg = me.sshd ? me.sshd() : { PasswordAuthentication: 'yes' };
    if (cfg.PasswordAuthentication === 'no') {
      ecrireChemin(me, '/var/log/auth.log',
        `${ts(g)} ${h} sshd[44${Math.floor(Math.random() * 90 + 10)}]: Connection closed by ${src} [preauth]`);
      if (Math.random() < 0.25) dire(g, `· ${src} a tenté de se brancher : ton sshd refuse les mots de passe.`, 'dim');
      if (g.honeypot && g.honeypot.active) ecrireChemin(me, '/var/log/honeypot.log',
        `${ts(g)} ALERTE MIEL — connexion ssh refusée depuis ${src} (authentification par clé requise)`);
      n.balayeur.prochain = (g.worldMin || 0) + jitter(150);
      return;
    }
    if (Math.random() < 0.5) {
      ecrireChemin(me, '/var/log/auth.log',
        `${ts(g)} ${h} sshd[44${Math.floor(Math.random() * 90 + 10)}]: Failed password for root from ${src} port ${51000 + Math.floor(Math.random() * 900)} ssh2`);
      if (g.honeypot && g.honeypot.active) ecrireChemin(me, '/var/log/honeypot.log',
        `${ts(g)} ALERTE MIEL — tentative ssh depuis ${src}`);
      if (faible) {
        // première intrusion facile (la leçon), répétitions rares (pas de spam)
        const dejaPasse = me.get && me.get('/home/joueur/LISEZ-MOI.txt');
        if (Math.random() < (dejaPasse ? 0.10 : 0.5)) intrusion(g, 'balayeur', src);
      }
    } else if (Math.random() < 0.35) {
      ecrireChemin(me, '/var/log/auth.log',
        `${ts(g)} ${h} sshd[44${Math.floor(Math.random() * 90 + 10)}]: Failed password for invalid user ${alea(['admin', 'test', 'guest', 'root'])} from ${src} port ${51000 + Math.floor(Math.random() * 900)} ssh2`);
    }
    n.balayeur.prochain = (g.worldMin || 0) + jitter(faible ? 75 : 150);
  }

  function intrusion(g, qui, src) {
    const { me } = postureMoi(g);
    if (!me) return;
    ecrireChemin(me, '/var/log/auth.log', `${ts(g)} ${me.name} sshd[4500]: Accepted password for root from ${src} port 51515 ssh2`);
    if (g.honeypot && g.honeypot.active) ecrireChemin(me, '/var/log/honeypot.log',
      `${ts(g)} ALERTE MIEL — intrusion réussie depuis ${src} (ton mot de passe a cédé)`);
    if (!me.get('/home/joueur/LISEZ-MOI.txt')) {
      me.addFile('/home/joueur/LISEZ-MOI.txt',
        `Je suis passé.\n\nTon ssh était ouvert et ton mot de passe était dans mes dix premiers essais.\nRien d'effacé — cette fois. Ferme le port 22 ou change tes mots de passe,\npuis lis manpages.bi/traces avant que quelqu'un de moins poli revienne.\n\n— ${qui === 'balayeur' ? 'le Balayeur' : 'le Rancunier'}`, {});
      dire(g, '');
      dire(g, `▓▓ INTRUSION — quelqu'un est entré sur TON poste (${src}).`, 'trace');
      dire(g, '   Un fichier LISEZ-MOI.txt traîne dans /home/joueur. Va lire tes propres journaux : logs.', 'warn');
    } else if (Math.random() < 0.4) {
      me.addFile('/home/joueur/ENCORE.txt', 'Repassé. Toujours aussi serviable, ton sshd.', {});
      if (Math.random() < 0.5) dire(g, `· ${src} est repassé te voir pendant que tu regardais ailleurs.`, 'err');
    }
    // T15 — vol d'outil avec une intrusion reussie (niveau 2 : « être hacké »)
    if (Math.random() < 0.4) volerObjet(g, qui, src);
    g.record('intrusion-subie', { par: qui, source: src });
  }

  /* ------------------------------------------------ LE CHASSEUR DE TRACES */
  function tourChasseur(g) {
    const n = etat(g);
    const e = g.echo && g.echo.nodes ? g.echo.nodes : {};
    let signe = null;
    for (const id in e) {
      if (e[id].bruit < 20) continue;
      const node = g.world.nodes[id];
      const log = node && node.get && node.get('/var/log/auth.log');
      if (log && (log.content || '').includes('10.10.0.5')) { signe = id; break; }
    }
    if (signe) {
      n.chasseur.pistes += 1;
      if (n.chasseur.pistes >= 3) {
        // publication : la honte publique, pédagogie par la moquerie
        n.chasseur.pistes = 0;
        g.respect = Math.max(0, (g.respect || 0) - 2);
        if (!g.forum) g.forum = { threads: [], compteur: 1 };
        g.forum.threads.push({
          id: 'c' + (g.forum.compteur++), auteur: 'anon_moqueur',
          titre: 'le nouveau laisse auth.log ouvert partout, compil',
          statut: 'ouvert',
          posts: [
            { qui: 'anon_moqueur', quand: global.LabyClock ? global.LabyClock.fmtMonde(g) : '--:--', txt: `Trois machines, trois auth.log, la même belle IP maison. Il a même signé ses cracks. On commence la collection ?` },
            { qui: 'mur_0', quand: global.LabyClock ? global.LabyClock.fmtMonde(g) : '--:--', txt: 'Relire mod_14. Nettoyer ne veut pas dire vider. Et avant : copier les preuves.' }
          ]
        });
        dire(g, '');
        dire(g, '▓ CHASSEUR — ta signature a été corrélée sur ' + g.world.nodes[signe].name + '.', 'warn');
        dire(g, '  Un fil moqueur circule sur NetSec-Intérieur. −2 respect. Nettoie en sélectif, pas en vandale.', 'dim');
        g.record('chasseur-signature', { cible: signe });
      } else {
        dire(g, `· quelqu'un relit les journaux de ${g.world.nodes[signe].name} (relevé ${n.chasseur.pistes}/3 contre ta signature)`, 'dim');
      }
    } else if (n.chasseur.pistes > 0) {
      n.chasseur.pistes -= 1;   // tes journaux propres le découragent
    }
    n.chasseur.prochain = (g.worldMin || 0) + jitter(120);
  }

  /* ------------------------------------------------ LE RANCUNIER */
  function declencherRancune(g, cible) {
    const n = etat(g);
    if (cible !== 'netInterne' || n.rancunier.enColere) return;
    n.rancunier.enColere = true;
    n.rancunier.vagues = 3;
    n.rancunier.prochain = (g.worldMin || 0) + jitter(45);
    dire(g, '· quelque part, quelqu\'un vient de reconnaître ta patte sur sa machine.', 'dim');
    g.record('rancunier-reveille', {});
  }

  function vagueRancunier(g) {
    const n = etat(g);
    const r = n.rancunier;
    // apaisement : ses journaux ne parlent plus de toi ?
    const cible = g.world.nodes['netInterne'];
    const log = cible && cible.get && cible.get('/var/log/auth.log');
    if (log && !(log.content || '').includes('10.10.0.5')) {
      r.enColere = false; r.vagues = 0;
      dire(g, '· la rancune s\'essouffle : sa machine ne raconte plus ton passage.', 'ok');
      g.record('rancunier-apaise', {});
      return;
    }
    const { ouvert, faible, me } = postureMoi(g);
    if (!me) return;
    const src = alea(SIEEEE);
    ecrireChemin(me, '/var/log/auth.log',
      `${ts(g)} ${me.name} sshd[6666]: reverse mapping checking getaddrinfo for « je-sais-que-c-est-toi » [${src}] failed — POSSIBLE BREAK-IN ATTEMPT!`);
    if (g.honeypot && g.honeypot.active) ecrireChemin(me, '/var/log/honeypot.log',
      `${ts(g)} ALERTE MIEL — présence suspecte depuis ${src}`);
    if (ouvert && faible && Math.random() < 0.65) {
      intrusion(g, 'rancunier', src);
      me.addFile('/home/joueur/NETTOIE_TES_TRACES.txt',
        `Ton IP dort dans mon auth.log. Va la récupérer.\nEt pendant que tu y es : change ces mots de passe de honte.\n\n— R.`, {});
    }
    r.vagues -= 1;
    if (r.vagues <= 0) { r.enColere = false; dire(g, '· il s\'est lassé de te chercher — pour cette fois.', 'dim'); }
    else r.prochain = (g.worldMin || 0) + jitter(110);
  }

  /* ------------------------------------------------ moteur */
  function demarrer(g) {
    etat(g);                                     // initialise l'état
    // posture par défaut : ton poste écoute en ssh avec des mots de passe
    // honteux — exactement ce que la T14 t'apprendra à réparer.
    const me = g.world.nodes[MOI];
    if (me) {
      if (!me.ports[22]) me.ports[22] = { service: 'ssh', version: 'OpenSSH 9.6p1', state: 'open' };
      if (!me.users.joueur) me.users.joueur = 'joueur';
      if (!me.get('/etc/ssh/sshd_config')) {
        me.addFile('/etc/ssh/sshd_config',
          `# LABYRINTHE — sshd simulé. Édite ce fichier (sed -i, éditeur, cat > ...).\n` +
          `Port 22\n` +
          `PermitRootLogin yes\n` +
          `PasswordAuthentication yes\n`, { owner: 'root' });
      }
    }
    // écoute du bus : toucher netInterne réveille la rancune
    if (!g.__npcWrap) {
      g.__npcWrap = true;
      const orig = g.record.bind(g);
      g.record = function (type, data) {
        orig(type, data);
        try {
          const cible = data && data.target;
          if (['ssh', 'admin', 'crack'].includes(type) && cible === 'netInterne') declencherRancune(g, cible);
          if (type === 'hydra' && cible === 'netInterne' && data.success) declencherRancune(g, cible);
        } catch (e) { console.warn('[npc]', e); }
      };
    }
    // commande du joueur pour consulter/gerer ses vols
    if (g.shell) g.shell.commands.vols = function (a) { return cmdVols(g, a); };

    // battements du monde
    setInterval(() => {
      if (global.LabyPause ? global.LabyPause.active() : (global.LabyIntro && global.LabyIntro.isOpen())) return;
      if (g.traceEnabled === false) return;       // mode serein : les chasseurs dorment aussi
      const monde = g.worldMin || 0;
      const n = etat(g);
      if (monde >= n.balayeur.prochain) vagueBalayeur(g);
      if (monde >= n.chasseur.prochain) tourChasseur(g);
      if (n.rancunier.enColere && monde >= n.rancunier.prochain) vagueRancunier(g);
      verifierVolsExpires(g);
    }, 1000);
  }

/* ------------------------------------------------ VOLS (T15 — etre hacke niveau 2) */
const OBJETS_VOLABLES = [
  { path: '/usr/share/wordlists/rockyou.txt', nom: 'wordlist rockyou.txt', prix: 250 },
  { path: '/home/joueur/bloc_notes.txt', nom: 'ton bloc-notes', prix: 120 },
  { path: '/home/joueur/LISEZ_MOI.txt', nom: 'guide LABYRINTHE', prix: 80 }
];
const DELAI_VOL_MIN = 360;   // 6 h monde avant mise en vente publique

function volsEtat(g) {
  if (!g.vols) g.vols = { liste: [], compteur: 0 };
  return g.vols;
}
function volerObjet(g, qui, src) {
  const me = g.world.nodes[MOI];
  const v = volsEtat(g);
  const cibles = OBJETS_VOLABLES.filter(s => {
    const f = me.get(s.path);
    return f && f.type === 'file';
  });
  if (!cibles.length) return null;
  const spec = cibles[Math.floor(Math.random() * cibles.length)];
  const id = 'v' + (++v.compteur);
  const vol = {
    id, objet: spec.nom, path: spec.path, prix: spec.prix,
    depuis: g.worldMin || 0, recupere: false, publie: false,
    par: qui, source: src
  };
  v.liste.push(vol);
  me.addFile(`/home/joueur/VOL-${id}.txt`,
    `ALERTE — VOL D'OUTIL DETECTE\n\n` +
    `Objet : ${spec.nom}\n` +
    `Par : ${qui === 'balayeur' ? 'le Balayeur' : 'le Rancunier'} (${src})\n` +
    `Prix de rachat : ${spec.prix} cr\n` +
    `Sans rachat ni recuperation forensique dans 6 h monde, l'objet est mis en vente publique.\n` +
    `Commande : vols pour liste, vols racheter <id> pour payer.\n`,
    { owner: 'joueur' });
  g.record('vol-subi', { id, objet: spec.nom, par: qui, source: src });
  dire(g, '');
  dire(g, `▓▓ VOL — ${spec.nom} a ete copie pendant l'intrusion. Avis : /home/joueur/VOL-${id}.txt`, 'trace');
  dire(g, `   Tape \`vols\` pour voir tes biens compromises.`, 'warn');
  return vol;
}
function delaiPasse(g, vol) {
  return (g.worldMin || 0) - vol.depuis >= DELAI_VOL_MIN;
}
function publierVol(g, vol) {
  if (vol.publie) return;
  vol.publie = true;
  g.respect = Math.max(0, (g.respect || 0) - 3);
  if (!g.forum) g.forum = { threads: [], compteur: 1 };
  g.forum.threads.push({
    id: 'v' + (g.forum.compteur++),
    auteur: 'recleur_anonyme',
    titre: `vente a la sauvette : ${vol.objet}`,
    statut: 'ouvert',
    posts: [{
      qui: 'recleur_anonyme',
      quand: global.LabyClock ? global.LabyClock.fmtMonde(g) : '--:--',
      txt: `Recupere chez un debutant bruyant : ${vol.objet}. Prix : ${vol.prix} cr. Contact : le Rancunier.`
    }]
  });
  dire(g, '');
  dire(g, `▓ EXPOSITION — ${vol.objet} mis en vente sur le marche gris. −3 respect.`, 'warn');
  g.record('vol-publie', { id: vol.id });
}
function verifierVolsExpires(g) {
  const v = volsEtat(g);
  for (const vol of v.liste) {
    if (!vol.recupere && !vol.publie && delaiPasse(g, vol)) publierVol(g, vol);
  }
}
function cmdVols(g, a) {
  const v = volsEtat(g);
  const nonRecup = v.liste.filter(x => !x.recupere);
  if (!a.length || a[0] === 'liste') {
    const lines = ['VOLS D\'OUTILS — biens compromises :'];
    if (!nonRecup.length) { lines.push('  (aucun)'); return { out: lines.join('\n'), code: 0 }; }
    for (const vol of nonRecup) {
      const reste = Math.max(0, DELAI_VOL_MIN - ((g.worldMin || 0) - vol.depuis));
      lines.push(`  ${vol.id} · ${vol.objet} · ${vol.prix} cr · ${reste} min monde avant mise en vente`);
    }
    lines.push('');
    lines.push('  vols racheter <id>   payer en credits (perte seche)');
    lines.push('  vols recupere <id>   declare recuperation forensique (copie effacee chez le voleur)');
    return { out: lines.join('\n'), code: 0 };
  }
  if (a[0] === 'racheter') {
    const id = a[1];
    const vol = v.liste.find(x => x.id === id && !x.recupere);
    if (!vol) return { out: `vols: aucun vol '${id}' a racheter.`, code: 1 };
    if ((g.credits || 0) < vol.prix) {
      return { out: `vols: credits insuffisants (${g.credits} cr, ${vol.prix} cr necessaires).`, code: 1 };
    }
    g.credits -= vol.prix;
    vol.recupere = true;
    const me = g.world.nodes[MOI];
    me.remove(`/home/joueur/VOL-${id}.txt`);
    g.record('vol-rachete', { id, prix: vol.prix });
    dire(g, `Objet ${vol.objet} rachete pour ${vol.prix} cr. Honte incluse.`, 'warn');
    return { out: `Rachat de ${vol.objet} confirme (-${vol.prix} cr).`, code: 0 };
  }
  if (a[0] === 'recupere') {
    const id = a[1];
    const vol = v.liste.find(x => x.id === id && !x.recupere);
    if (!vol) return { out: `vols: aucun vol '${id}' a valider.`, code: 1 };
    vol.recupere = true;
    const me = g.world.nodes[MOI];
    me.remove(`/home/joueur/VOL-${id}.txt`);
    g.respect = Math.min(100, (g.respect || 0) + 1);
    g.record('vol-recupere', { id });
    return { out: `Recuperation de ${vol.objet} validee. +1 respect.`, code: 0 };
  }
  return { out: 'usage: vols          (liste)\n       vols racheter <id>\n       vols recupere <id>', code: 1 };
}

  global.LabyNPC = {
    etat: () => etat(game()),
    vols: () => volsEtat(game()),
    demarrer,
    _test: { vagueBalayeur, tourChasseur, vagueRancunier, declencherRancune, postureMoi, volerObjet, publierVol, verifierVolsExpires }
  };

  if (typeof document !== 'undefined') {
    // Le monde doit être restauré avant que les chasseurs s'arment.
    const boot = () => {
      const g = game();
      if (!g || !g.world || !g.world.nodes) { console.error('[npc] monde indisponible au signal laby:ready'); return; }
      demarrer(g);
    };
    if (global.LabyPause && global.LabyPause.quandPret) global.LabyPause.quandPret(boot);
    else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = global.LabyNPC;
})(typeof window !== 'undefined' ? window : globalThis);
