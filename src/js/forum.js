/* =====================================================================
   forum.js — NetSec-Intérieur, couche 3 (T10).
   Fils permanents data-driven (content/forum/threads.json) + fils créés
   par le joueur. Règles du lieu (pilier P1 : jamais la solution) :
   - poser une question = choisir un NIVEAU d'indice, payé en Respect
   - un PNJ répond ~2 h en heure monde (T6), sans dévoiler la réponse
   - marquer son fil RÉSOLU quand on a trouvé soi-même : +2 Respect
   ===================================================================== */
(function (global) {
  'use strict';

  const $ = id => document.getElementById(id);
  const el = (t, c, x) => {
    const e = document.createElement(t);
    if (c) e.className = c;
    if (x !== undefined) e.textContent = x;
    return e;
  };
  const puce = n => String(n).padStart(2, '0');

  const PERMANENTS = [];
  let charges = false;

  const PNJ = ['mur_0', 'Tautologue', 'MURMURE', 'anon_7'];

  /* Niveaux d'indice : libellés + coût en Respect (P1 : jamais la solution) */
  const NIVEAUX = [
    { lv: 0, label: 'Niveau 1 — la méthode (gratuit)', cout: 0 },
    { lv: 1, label: 'Niveau 2 — la piste précise (−2 respect)', cout: 2 },
    { lv: 2, label: 'Niveau 3 — presque-solution (−5 respect)', cout: 5 }
  ];

  /* Banque générique par sujet — 3 niveaux : méthode → piste → forte piste.
     Aucune ne contient de réponse de mission, conformément à P1. */
  const REPONSES = {
    'terminal': [
      'Relis le module 01 lentement. Puis décris à voix haute où tu es, where tu vas, ce que `pwd` te répond.',
      'Regarde `tree` et `find` : l\'un montre la forêt, l\'autre l\'arbre. Tu bloques sur lequel ?',
      'Ta cible est probablement un chemin relatif mal compris. Fais `ls` après chaque `cd`, prends le tic-tac.'
    ],
    'python': [
      'Module 05 puis 07. Les erreurs de l\'interpréteur se lisent comme des phrases, pas comme des injures.',
      'Colle UNIQUEMENT la ligne de l\'erreur dans Fouine. Pas ton script entier.',
      'IndentationError ≈ tab contre espaces. TypeError ≈ tu additionnes une chaîne et un nombre. Vois ?'
    ],
    'scan et bruit': [
      'La grille : -sn 1 · -sS 2 · -sT 4 · -sV 5 · tout-porter ×2. Choisis en fonction de QUI écoute là-bas.',
      'Découvre d\'abord (voisinage), puis UN hôte, puis les ports utiles. Pas l\'inverse.',
      'Si tu as dépassé la dizaine, un chasseur a déjà ton profil. Ça s\'appelle ECHO et ça revient toujours.'
    ],
    'mots de passe': [
      'Le fil épinglé de Tautologue : une liste de 20 mots tirés de la VIE de la cible > rockyou.',
      'whois, profils publics, pastes oubliés : prénom + date + animal + ville. Mélange proprement.',
      'hydra -t 4. Patiente. Lire auth.log d\'un client après -t 16 est une expérience, demande à kage_busa.'
    ],
    'traces et logs': [
      'Module 14. auth.log, wtmp, history : chaque visite écrit son nom quelque part.',
      'Preuve d\'abord, effacement ensuite. Et on efface les lignes qui te nomment, pas le fichier entier.',
      'Un trou dans le journal est une enquête ouverte. Deux lignes absentes = un artisan.'
    ],
    'couche et accès': [
      'Les portraits se débloquent par rang, pas par gentillesse. Fais des contrats, monte en rang.',
      'APPRENTI ouvre la couche 3. Le reste, c\'est OPÉRATEUR — et ce n\'est pas encore ton affaire.',
      'Le Puits ne se visite pas, il se mérite : invitation, relais, opsec. Reviens quand tu seras prêt.'
    ],
    'éthique': [
      'Module 16 : périmètre écrit, autorisation, rapport. Le reste est du vol avec un clavier.',
      'Si tu hésites entre "légal" et "pas vu", c\'est déjà non.',
      'Le Respect dépensé ici se regagne en aidant les autres plus tard. La roue tourne.'
    ],
    'contrat en cours': [
      'Quel est le dernier FAIT que tu as établi ? Pas ce que tu as essayé : ce que tu SAIS.',
      'Découpe : où est-ce que la chaîne se casse — recon, accès, privilège, discrétion ?',
      'Ton donneur de contrat a laissé des indices en trois niveaux. Tu en es auquel, honnêtement ?'
    ]
  };

  /* ------------------------------------------------ état & persistance */
  function game() { return global.LABYRINTHE && global.LABYRINTHE.game; }
  function etat() {
    const g = game();
    if (!g.forum) g.forum = { threads: [], compteur: 1 };
    return g.forum;
  }

  async function charger() {
    try {
      let d = null;
      if (global.LabyBridge && global.LabyBridge.tauri) {
        const r = await global.LabyBridge.contentLoad('forum/threads.json');
        d = r ? JSON.parse(r) : null;
      } else {
        const r = await fetch('content/forum/threads.json');
        d = r.ok ? await r.json() : null;
      }
      if (d && d.threads) { PERMANENTS.push(...d.threads); charges = true; }
    } catch (e) { console.warn('[forum]', e); }
  }

  function heureMonde() {
    const g = game();
    return global.LabyClock && g ? global.LabyClock.fmtMonde(g) : '--:--';
  }

  function tousLesFils() {
    return etat().threads.slice().reverse().concat(PERMANENTS);  // récents joueurs d'abord
  }

  /* ------------------------------------------------ réponses différées */
  function choisirReponse(fil) {
    // Le PNJ pioche dans le niveau d'indice choisi par le joueur.
    const banque = REPONSES[fil.sujet] || REPONSES['contrat en cours'];
    let txt = banque[fil.niveau] || banque[0];
    // Si un contrat data est actif et le sujet est "contrat en cours" :
    // l'indice vient des hints_forum du contrat (toujours gradué, jamais la solution).
    if (fil.sujet === 'contrat en cours' && global.LabyContracts) {
      const actifs = etat() && game() ? (game().contractsState.active || []) : [];
      const def = actifs.length && global.LabyContracts.defs().find(d => d.id === actifs[actifs.length - 1]);
      if (def && def.hints_forum && def.hints_forum[fil.niveau]) txt = def.hints_forum[fil.niveau];
    }
    const qui = PNJ[Math.floor(Math.random() * PNJ.length)];
    const prefixe = fil.niveau === 2
      ? 'Dernier avertissement de politesse : presque-solution ≠ solution.\n\n'
      : '';
    return { qui, quand: heureMonde(), txt: prefixe + txt };
  }

  function ordonnanceur() {
    const g = game();
    if (!g) return void setTimeout(ordonnanceur, 2000);
    setInterval(() => {
      const monde = g.worldMin || 0;
      let change = false;
      for (const fil of etat().threads) {
        if (fil.statut === 'attente' && monde >= fil.reponseA) {
          const rep = choisirReponse(fil);
          fil.posts.push(rep);
          fil.statut = 'ouvert';
          change = true;
          if (g.say) {
            g.say('');
            g.say(`📨 NetSec-Intérieur : ${rep.qui} a répondu à ton fil « ${fil.titre} »`, 'ok');
            g.say('  lecture : navigateur → netsec-interieur.bi/fil/' + fil.id, 'dim');
          }
        }
      }
      if (change && $('web') && $('web').classList.contains('open')) {
        // réaffiche la page courante si le joueur a le forum sous les yeux
        const u = $('webUrl'); if (u && u.value.includes('netsec-interieur')) global.LabyWeb && global.LabyWeb.navigate(u.value, false);
      }
    }, 1000);
  }

  /* ------------------------------------------------ actions joueur */
  function poserQuestion(sujet, niveau, texte) {
    const g = game();
    const s = etat();
    const niv = NIVEAUX[niveau];
    if ((g.respect || 0) < niv.cout) return { ok: false, msg: `Pas assez de Respect pour ce niveau (${niv.cout} requis).` };
    g.respect = (g.respect || 0) - niv.cout;
    const titre = (sujet === 'contrat en cours' && s.threads.length)
      ? `re: ${sujet} (#${s.compteur})` : `${sujet} — question (#${s.compteur})`;
    const fil = {
      id: 'u' + (s.compteur++),
      titre,
      auteur: 'toi',
      statut: 'attente',
      sujet, niveau,
      posts: [{ qui: 'toi', quand: heureMonde(), txt: texte || '…' }],
      reponseA: (g.worldMin || 0) + 120          // +2 h monde (≈ 2 min réelles)
    };
    s.threads.push(fil);
    g.record('forum-question', { sujet, niveau, cout: niv.cout });
    if (g.say) {
      g.say(`Fil « ${fil.titre} » posté sur NetSec-Intérieur.`, 'dim');
      if (niv.cout) g.say(`−${niv.cout} respect (niveau ${niveau + 1} demandé). La réponse arrive sous ~2 h monde.`, 'dim');
    }
    return { ok: true, fil };
  }

  function resoudre(id) {
    const g = game();
    const fil = etat().threads.find(f => f.id === id);
    if (!fil || fil.statut === 'resolu') return;
    fil.statut = 'resolu';
    g.respect = (g.respect || 0) + 2;
    g.record('forum-resolu', { id });
    if (g.say) g.say('Fil marqué RÉSOLU. +2 respect — la mémoire du forum nourrit les suivants.', 'ok');
  }

  function repondre(id, txt) {
    const fil = etat().threads.find(f => f.id === id);
    if (!fil || !txt.trim()) return;
    fil.posts.push({ qui: 'toi', quand: heureMonde(), txt: txt.trim().slice(0, 500) });
    game().record('forum-reponse', { id });
  }

  /* ------------------------------------------------ rendu (dans le navigateur) */
  function rendreListe(body) {
    const d = el('div');
    d.appendChild(el('div', 'web-h1', 'NETSEC-INTÉRIEUR'));
    d.appendChild(el('div', 'web-p', 'Le forum. On ne donne pas de poissons ; on donne des cannes, graduées, payées en Respect.'));
    const regles = el('div', 'web-p web-dim');
    regles.textContent = 'Niveaux d\'indice : 1 gratuit · 2 = −2 respect · 3 = −5 respect · RÉSOLU = +2';
    d.appendChild(regles);

    const bloc = el('div', 'fm-list');
    for (const fil of tousLesFils()) {
      const ligne = el('div', 'fm-fil' + (fil.statut === 'epingle' ? ' epingle' : ''));
      const t = el('button', 'web-link', (fil.statut === 'epingle' ? '📌 ' : fil.statut === 'resolu' ? '✔ ' : fil.statut === 'attente' ? '⏳ ' : '') + fil.titre);
      t.onclick = () => global.LabyWeb.navigate('netsec-interieur.bi/fil/' + fil.id);
      ligne.appendChild(t);
      ligne.appendChild(el('span', 'fm-meta', `${fil.auteur} · ${fil.posts.length} msg · ${fil.il_y_a || fil.posts[0].quand}`));
      bloc.appendChild(ligne);
    }
    d.appendChild(bloc);

    d.appendChild(el('div', 'web-sep'));
    const poser = el('button', 'web-btn', 'POSER UNE QUESTION');
    poser.onclick = () => global.LabyWeb.navigate('netsec-interieur.bi/poser');
    d.appendChild(poser);
    body.appendChild(d);
  }

  function rendreFil(body, id) {
    const fil = tousLesFils().find(f => f.id === id);
    if (!fil) return null;
    const d = el('div');
    d.appendChild(el('div', 'web-h2', fil.titre));
    for (const p of fil.posts) {
      const post = el('div', 'fm-post');
      post.appendChild(el('div', 'fm-qui', p.qui + (p.quand ? ' — ' + p.quand : '')));
      post.appendChild(el('div', 'fm-txt', p.txt));
      d.appendChild(post);
    }
    if (fil.statut === 'attente') {
      d.appendChild(el('div', 'web-dim', '⏳ En attente d\'une réponse (~2 h monde). Va travailler autre chose, reviens.'));
    }
    // actions sur ses propres fils
    if (fil.auteur === 'toi' && fil.statut === 'ouvert') {
      const rep = el('textarea', 'fm-rep'); rep.placeholder = 'Compléter ton fil (contexte, ce que tu as trouvé depuis)…';
      const envoyer = el('button', 'web-btn', 'AJOUTER AU FIL');
      envoyer.onclick = () => { repondre(id, rep.value); global.LabyWeb.navigate('netsec-interieur.bi/fil/' + id, false); };
      const ok = el('button', 'web-btn fm-resolu', 'MARQUER RÉSOLU (j\'ai trouvé)');
      ok.onclick = () => { resoudre(id); global.LabyWeb.navigate('netsec-interieur.bi/fil/' + id, false); };
      const row = el('div', 'fm-actions');
      row.appendChild(rep); row.appendChild(envoyer); row.appendChild(ok);
      d.appendChild(row);
    }
    d.appendChild(el('div', 'web-sep'));
    const retour = el('button', 'web-link', '← liste des fils');
    retour.onclick = () => global.LabyWeb.navigate('netsec-interieur.bi/');
    d.appendChild(retour);
    body.appendChild(d);
    return true;
  }

  function rendrePoser(body) {
    const d = el('div');
    d.appendChild(el('div', 'web-h2', 'POSER UNE QUESTION'));
    d.appendChild(el('div', 'web-p', 'Sois précis, sois honnête. Le niveau choisi règle la finesse de la piste — et son prix en Respect.'));

    const f = el('div', 'web-form');
    f.appendChild(el('div', 'web-form-titre', 'Sujet'));
    const sel = document.createElement('select');
    sel.className = 'web-in';
    for (const s of Object.keys(REPONSES)) sel.appendChild(new Option(s, s));
    f.appendChild(sel);

    f.appendChild(el('div', 'web-form-titre', 'Niveau d\'indice demandé'));
    const selN = document.createElement('select');
    selN.className = 'web-in';
    NIVEAUX.forEach((n, i) => selN.appendChild(new Option(n.label, i)));
    f.appendChild(selN);

    const ta = el('textarea', 'fm-rep');
    ta.placeholder = 'Contexte : ce que tu as établi, où ça coince (pas interprété — pour la postérité du fil).';
    f.appendChild(ta);

    const info = el('div', 'web-info');
    const b = el('button', 'web-btn', 'POSTER LE FIL');
    b.onclick = () => {
      const r = poserQuestion(sel.value, parseInt(selN.value, 10), ta.value);
      if (r.ok) global.LabyWeb.navigate('netsec-interieur.bi/fil/' + r.fil.id);
      else info.textContent = r.msg;
    };
    f.appendChild(b); f.appendChild(info);
    d.appendChild(f);

    const retour = el('button', 'web-link', '← liste des fils');
    retour.onclick = () => global.LabyWeb.navigate('netsec-interieur.bi/');
    d.appendChild(retour);
    body.appendChild(d);
  }

  /* ------------------------------------------------ API navigateur (T2 hooks) */
  global.LabyForum = {
    canRoute: path => path === '/poser' || /^\/fil\/[\w-]+$/.test(path),
    renderRoute(body, domain, path) {
      if (path === '/poser') { rendrePoser(body); return true; }
      const m = path.match(/^\/fil\/([\w-]+)$/);
      if (m) return rendreFil(body, m[1]);
      return null;
    },
    renderList: rendreListe,
    pret: () => charges
  };

  function boot() { charger(); ordonnanceur(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
