/* =====================================================================
   profile.js — Rang, XP anti-grind, réputation (T8) ; verrous (T9).
   Rangs (bible §6) : VISITEUR · SCRIPT-KIDDIE · APPRENTI · OPÉRATEUR ·
   PENTESTEUR · MAÎTRE DU LABYRINTHE.
   XP anti-grind : chaque TECHNIQUE n'est récompensée qu'une fois
   (techKeys persisté). Les contrats et la campagne ajoutent leur XP.
   Le rang ouvre les couches du web intérieur (T9) : APPRENTI → couche 3,
   OPÉRATEUR → couche 4 (le Puits, M4).
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

  /* ------------------------------------------------ rangs */
  const RANGS = [
    { nom: 'VISITEUR',              xp: 0,     note: 'tu viens d\'arriver' },
    { nom: 'SCRIPT-KIDDIE',         xp: 400,   note: 'tu sais recopier — maintenant comprends' },
    { nom: 'APPRENTI',              xp: 1200,  note: 'débloque NetSec-Intérieur (couche 3)' },
    { nom: 'OPÉRATEUR',             xp: 3000,  note: 'débloque le Puits (couche 4, M4)' },
    { nom: 'PENTESTEUR',            xp: 6000,  note: 'GARDIEN lit tes rapports' },
    { nom: 'MAÎTRE DU LABYRINTHE',  xp: 8000, note: 'exige la campagne terminée', fin: true }
  ];

  function game() { return global.LABYRINTHE && global.LABYRINTHE.game; }

  function rank() {
    const g = game();
    if (!g) return 0;
    let r = 0;
    for (let i = 0; i < RANGS.length; i++) {
      if ((g.xp || 0) < RANGS[i].xp) break;
      if (RANGS[i].fin && !g.finished) break;
      r = i;
    }
    return r;
  }
  const nomRang = i => (RANGS[i] && RANGS[i].nom) || 'INCONNU';

  /* ------------------------------------------------ XP technique anti-grind */
  const TECH = [
    ['recon:fouine',  20, 'Fouine — première recherche',        e => e.type === 'fouine'],
    ['recon:visite',  15, 'Web intérieur — première page lue',  e => e.type === 'visit' && e.found],
    ['recon:whois',   30, 'whois — premier registre interrogé', e => e.type === 'whois' && e.found],
    ['scan:voisins',  25, 'scan — voisinage cartographié',      e => e.type === 'scan'],
    ['scan:nmap',     30, 'nmap — premier scan de ports',       e => e.type === 'nmap'],
    ['scan:sv',       40, 'nmap -sV — versions relevées',       e => e.type === 'nmap' && e.sV],
    ['scan:ss',       20, 'nmap -sS — scan furtif',             e => e.type === 'nmap' && e.sS],
    ['web:curl',      15, 'curl — première lecture HTTP',       e => e.type === 'curl'],
    ['code:python',   10, 'python — premier script exécuté',    e => e.type === 'python' && e.ok],
    ['sess:ssh',      40, 'ssh — première session distante',    e => e.type === 'ssh'],
    ['sess:root',     60, 'root — premier accès admin',         e => e.type === 'admin'],
    ['atk:hydra',     70, 'hydra — premier dictionnaire gagnant', e => e.type === 'hydra' && e.success],
    ['atk:msf',       80, 'metasploit — premier exploit',       e => e.type === 'crack' && e.tool === 'metasploit'],
    ['atk:searchsploit', 25, 'searchsploit — première veille d\'exploits', e => e.type === 'searchsploit'],
    ['def:firewall',  35, 'pare-feu manipulé',                  e => e.type === 'firewall'],
    ['post:exfil',    20, 'exfiltration — premier fichier rapatrié', e => e.type === 'download']
  ];

  function annoncerRang(avant, apres) {
    const g = game();
    if (apres <= avant || !g || !g.say) return;
    g.say('');
    g.say(`☰ RANG ATTEINT : ${RANGS[apres].nom}`, 'ok');
    g.say(`  ${RANGS[apres].note}`, 'dim');
    if (apres === 1) g.say('  Apprends, ne recopie plus. Le forum lit ton rang.', 'dim');
    if (apres === 2) g.say('  NetSec-Intérieur te répond désormais : netsec-interieur.bi dans le navigateur.', 'dim');
    if (apres === 3) g.say('  Le chenillard du Puits t\'attend : tape relais pour commencer.', 'dim');
  }

  function surEvenement(ev) {
    const g = game();
    if (!g || !ev) return;
    if (!g.techKeys) g.techKeys = {};
    for (const [cle, xp, label, test] of TECH) {
      if (g.techKeys[cle] || !test(ev)) continue;
      g.techKeys[cle] = true;
      const avant = rank();
      g.xp = (g.xp || 0) + xp;
      if (g.say) g.say(`+${xp} xp — ${label} (première fois)`, 'dim');
      annoncerRang(avant, rank());
      if ($('profil') && $('profil').classList.contains('open')) peindre();
    }
  }

  function embrancherBus() {
    const g = game();
    if (!g || g.__profileWrap) return void setTimeout(embrancherBus, 500);
    g.__profileWrap = true;
    const origRecord = g.record.bind(g);
    g.record = function (type, data) {
      origRecord(type, data);
      try { surEvenement(Object.assign({}, data || {}, { type })); } catch (e) { console.warn('[profil]', e); }
    };
  }

  /* ------------------------------------------------ badge topbar */
  function rendreBadge() {
    const b = $('rankBadge');
    const g = game();
    if (!b || !g) return;
    b.textContent = `${nomRang(rank())} · ${g.xp || 0} xp`;
  }

  /* ------------------------------------------------ overlay profil */
  function construire() {
    if ($('profil')) return;
    const ov = el('div', 'ov'); ov.id = 'profil';
    const pan = el('div', 'pf-panel');
    const head = el('div', 'web-head');
    head.appendChild(el('div', 'pf-titre', 'PROFIL'));
    const fermer = el('button', 'web-nav', '×');
    fermer.onclick = () => ov.classList.remove('open');
    head.appendChild(fermer);
    pan.appendChild(head);
    pan.appendChild(el('div', 'pf-body')).id = 'pfBody';
    ov.appendChild(pan);
    document.body.appendChild(ov);
  }

  function barre(valeur, seuil) {
    const pct = Math.max(0, Math.min(100, Math.round(100 * valeur / seuil)));
    const d = el('div', 'pf-bar');
    const i = el('i'); i.style.width = pct + '%';
    d.appendChild(i); d.appendChild(el('span', 'pf-bar-txt', pct + ' %'));
    return d;
  }

  function peindre() {
    const g = game();
    const body = $('pfBody');
    if (!g || !body) return;
    body.innerHTML = '';
    const r = rank();
    const prochain = RANGS[r + 1];

    const h = el('div', 'pf-rang');
    h.appendChild(el('div', 'pf-rang-nom', nomRang(r)));
    h.appendChild(el('div', 'pf-rang-note', RANGS[r].note));
    body.appendChild(h);

    if (prochain) {
      body.appendChild(el('div', 'pf-lab', `vers ${prochain.nom} : ${g.xp || 0} / ${prochain.xp} xp`));
      body.appendChild(barre(g.xp || 0, prochain.xp));
    } else {
      body.appendChild(el('div', 'pf-lab', 'rang maximal — tu cartographies à présent pour les autres'));
    }

    body.appendChild(el('div', 'pf-sep'));
    const stats = el('div', 'pf-stats');
    const lignes = [
      ['Crédits', (g.credits || 0) + ' cr'],
      ['Sats (Puits)', (g.sats || 0) + ' sats'],
      ['Respect (surface)', g.respect || 0],
      ['Créd (Puits)', g.cred || 0],
      ['Missions du cursus', g.completed.size + ' / ' + global.Campaign.MISSIONS.length],
      ['Contrats data terminés', (g.contractsState ? g.contractsState.done.length : 0)],
      ['Techniques apprises', Object.keys(g.techKeys || {}).filter(k => !k.startsWith('_')).length + ' / ' + TECH.length]
    ];
    for (const [k, v] of lignes) {
      const row = el('div', 'pf-row');
      row.appendChild(el('span', null, k)); row.appendChild(el('b', null, String(v)));
      stats.appendChild(row);
    }
    body.appendChild(stats);

    body.appendChild(el('div', 'pf-sep'));
    body.appendChild(el('div', 'pf-lab', 'ACCÈS AUX COUCHES'));
    const acces = el('div', 'pf-stats');
    const c3 = rank() >= 2, c4 = rank() >= 3;
    acces.appendChild(ligneAcces('Couche 2 — web clair', true));
    acces.appendChild(ligneAcces('Couche 3 — NetSec-Intérieur', c3, 'rang APPRENTI'));
    acces.appendChild(ligneAcces('Couche 4 — Le Puits (M4)', c4, 'rang OPÉRATEUR'));
    body.appendChild(acces);

    body.appendChild(el('div', 'pf-sep'));
    body.appendChild(el('div', 'pf-lab', 'ÉCHELLE DES RANGS'));
    for (let i = 0; i < RANGS.length; i++) {
      const rg = el('div', 'pf-rangl' + (i === r ? ' actif' : i < r ? ' passé' : ''));
      rg.appendChild(el('b', null, `${i < r ? '✓' : i === r ? '▸' : '·'} ${RANGS[i].nom}`));
      rg.appendChild(el('span', null, `${RANGS[i].xp} xp — ${RANGS[i].note}`));
      body.appendChild(rg);
    }
  }

  function ligneAcces(nom, ok, exigence) {
    const row = el('div', 'pf-row');
    row.appendChild(el('span', null, nom));
    row.appendChild(el('b', ok ? 'pf-ok' : 'pf-no', ok ? 'OUVERT' : 'verrouillé — ' + exigence));
    return row;
  }

  function ouvrir() { construire(); $('profil').classList.add('open'); peindre(); }

  function boot() {
    embrancherBus();
    construire();
    const b = $('rankBadge');
    if (b) b.onclick = ouvrir;
    setInterval(() => { if (!global.LabyPause || !global.LabyPause.active()) rendreBadge(); }, 1000);
    /* pile système : le rang monte aussi par la campagne (xp sans event technique) */
    let rangConnu = 0;
    setInterval(() => {
      if (global.LabyPause && global.LabyPause.active()) return;
      const r = rank();
      if (rangConnu !== r) { annoncerRang(rangConnu, r); rangConnu = r; rendreBadge(); }
    }, 1500);
  }

  global.LabyProfile = { rank, nomRang, open: ouvrir, refresh: peindre, RANGS };

  if (global.LabyPause && global.LabyPause.quandPret) global.LabyPause.quandPret(boot);
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
