/* =====================================================================
   browser.js — Navigateur interne (T2/T3).
   Rend les sites déclaratifs de content/web/sites/, fait tourner le
   moteur « Fouine », expose window.LabyWeb (whoisOf, search, open).
   Couches verrouillées : écran diégétique en attendant les rangs (T8/T9).
   Aucun vrai web : tout est local, tout est fiction.
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
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

  /* Pont vers le bus d'événements du jeu (game.js → record) :
     les actions du navigateur deviennent des faits de contrat — OSINT compris. */
  function evt(type, payload) {
    const L = global.LABYRINTHE;
    if (L && L.game && typeof L.game.record === 'function') {
      L.game.record(type, Object.assign({ via: 'web' }, payload || {}));
    }
  }

  /* ------------------------------------------------ registry (T1) */
  const Sites = new Map();        // domaine -> fiche site
  const Index = [];               // entrées Fouine
  let ready = false;
  const LATENCE = { 1: 120, 2: 220, 3: 600, 4: 2400 };   // ms, par couche

  async function lireContenu(chemin) {
    if (global.LabyBridge && global.LabyBridge.tauri) {
      const r = await global.LabyBridge.contentLoad(chemin);
      return r ? JSON.parse(r) : null;
    }
    const r = await fetch('content/' + chemin);
    return r.ok ? r.json() : null;
  }

  async function chargerSites() {
    try {
      const manifest = await lireContenu('web/manifest.json');
      if (!manifest) return;
      for (const f of manifest.sites) {
        const s = await lireContenu('web/sites/' + f);
        if (!s || !s.domain) continue;
        Sites.set(s.domain, s);
        if (!(s.fouine && s.fouine.noindex)) {
          Index.push({
            domain: s.domain,
            title: s.title || s.domain,
            excerpt: (s.fouine && s.fouine.excerpt) || '',
            pages: Object.keys(s.pages || {}),
            corpus: corpusDe(s)
          });
        }
      }
      ready = true;
    } catch (e) { console.warn('[labyweb] chargement impossible', e); }
  }

  function whoisOf(domaine) {
    const s = Sites.get(String(domaine || '').toLowerCase());
    return s && s.whois ? s.whois : null;
  }

  /* Fouine indexe TOUT le contenu d'un site, pas seulement ses tags :
     un pseudo dans une bio, un CMS dans un footer — tout remonte. */
  function corpusDe(site) {
    const t = [site.domain, site.title || '', (site.fouine && site.fouine.tags || []).join(' ')];
    for (const p of Object.values(site.pages || {})) {
      t.push(p.title || '');
      for (const b of p.blocks || []) {
        if (typeof b.x === 'string') t.push(b.x);
        if (Array.isArray(b.x)) t.push(b.x.join(' '));
        if (b.href) t.push(b.href);
        if (b.rows) for (const r of b.rows) t.push(r.join(' '));
      }
    }
    return t.join(' ').toLowerCase();
  }

  function recherche(q) {
    q = q.toLowerCase().trim();
    if (!q) return [];
    const mots = q.split(/\s+/);
    return Index
      .map(s => {
        const foin = s.corpus;
        let score = 0;
        for (const m of mots) {
          if (foin.includes(m)) score += m.length;
          if (s.domain.startsWith(m)) score += m.length * 2;   // nom propre > mention
        }
        return { s, score };
      })
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(r => r.s);
  }

  /* ------------------------------------------------ navigation */
  const hist = []; let histI = -1;

  function parseUrl(u) {
    u = String(u || '').trim().toLowerCase()
      .replace(/^https?:\/\//, '').replace(/^laby:\/\//, '');
    const slash = u.indexOf('/');
    const domain = slash < 0 ? u : u.slice(0, slash);
    const path = slash < 0 ? '/' : u.slice(slash);
    return { domain, path: path || '/' };
  }

  function coucheDu(domaine) {
    const s = Sites.get(domaine);
    return (s && s.acl && s.acl.layer) || 2;
  }

  function navigate(urlSansNettoyage, pousser = true) {
    const { domain, path } = parseUrl(urlSansNettoyage);
    const couche = coucheDu(domain);
    const t0 = performance.now();
    const stat = $('webStat');
    if (stat) stat.textContent = 'résolution…';

    setTimeout(() => {
      const ms = Math.max(1, Math.round(performance.now() - t0));
      const s = Sites.get(domain);
      const body = $('webBody');
      const barre = $('webUrl');
      if (!body) return;
      body.innerHTML = '';

      if (!s) {
        evt('visit', { target: domain + path, found: false });
        corpsErreur(body, 'NXDOMAIN',
          `Aucun enregistrement pour « ${domain} ».`,
          'Fouine ne connaît que ce que lui rapportent ses fouines. Cherche, ou vérifie l\'orthographe.');
        if (stat) stat.textContent = `échec DNS · ${ms} ms`;
        return;
      }
      /* T9 — verrous réels : couche 3 = APPRENTI, couche 4 = OPÉRATEUR (cf. RANGS) */
      const rangRequis = couche >= 4 ? 3 : couche >= 3 ? 2 : 0;
      const rangJoueur = (global.LabyProfile && global.LabyProfile.rank()) || 0;
      if (rangJoueur < rangRequis) {
        const nomRang = global.LabyProfile ? global.LabyProfile.nomRang(rangRequis) : ('rang ' + rangRequis);
        corpsErreur(body, '403 — COUCHE ' + couche,
          `« ${domain} » ne répond pas aux inconnus.`,
          `Accès réservé — ${nomRang} requis. (${rangJoueur}/${rangRequis} : monte en rang, les portes s'ouvrent.)`);
        if (stat) stat.textContent = `verrou · couche ${couche} · rang ${nomRang} requis · ${ms} ms`;
        return;
      }
      const page = s.pages[path];
      let routeDynamique = false;
      if (!page && s.forum && global.LabyForum && global.LabyForum.canRoute(path)) {
        evt('visit', { target: domain + path, found: true });
        routeDynamique = global.LabyForum.renderRoute(body, domain, path) === true;
      }
      if (routeDynamique) {
        document.title = 'LABYRINTHE — ' + s.title;
        if (barre) barre.value = domain + path;
      } else if (!page && path !== '/') {
        corpsErreur(body, '404', `Pas de page « ${path} » sur ${domain}.`, 'Le serveur existe, la page non.');
      } else {
        const pg = page || s.pages['/'];
        document.title = 'LABYRINTHE — ' + (pg.title || s.title);
        if (barre) barre.value = domain + (path === '/' ? '/' : path);
        evt('visit', { target: domain + path, found: true });
        for (const b of pg.blocks || []) rendBlock(body, b, domain);
      }
      if (stat) stat.textContent = `${domain} · couche ${couche} · ${ms} ms`;
      if (pousser) {
        hist.splice(histI + 1);
        hist.push(domain + path); histI = hist.length - 1;
      }
    }, LATENCE[couche] || 220);
  }

  function corpsErreur(body, code, msg, note) {
    const d = el('div', 'web-err');
    d.appendChild(el('div', 'web-err-code', code));
    d.appendChild(el('div', 'web-err-msg', msg));
    d.appendChild(el('div', 'web-err-note', note));
    body.appendChild(d);
  }

  /* ------------------------------------------------ rendu des blocks */
  function rendBlock(body, b, domaineCourant) {
    switch (b.t) {
      case 'h': body.appendChild(el('div', 'web-h1', b.x)); break;
      case 'h2': body.appendChild(el('div', 'web-h2', b.x)); break;
      case 'p': body.appendChild(el('div', 'web-p', b.x)); break;
      case 'sep': body.appendChild(el('div', 'web-sep')); break;
      case 'code': {
        const pre = el('pre', 'web-code'); pre.textContent = b.x; body.appendChild(pre); break;
      }
      case 'list': {
        const d = el('div', 'web-list');
        for (const it of b.x || []) {
          const li = el('div', 'web-li');
          li.appendChild(el('span', 'web-puce', '▸')); li.appendChild(el('span', null, it));
          d.appendChild(li);
        }
        body.appendChild(d); break;
      }
      case 'table': {
        const d = el('div', 'web-tbl');
        for (const row of b.rows || []) {
          const r = el('div', 'web-tr');
          for (const c of row) r.appendChild(el('span', 'web-tc', c));
          d.appendChild(r);
        }
        body.appendChild(d); break;
      }
      case 'link': {
        const a = el('button', 'web-link', '⟶ ' + b.x);
        a.onclick = () => navigate(b.href);
        body.appendChild(a); break;
      }
      case 'search': corpsRecherche(body); break;
      case 'forum': if (global.LabyForum) global.LabyForum.renderList(body); break;
      case 'form': {  // T16 : login vulnérable plus tard — v1 : affichage seul
        const f = el('div', 'web-form');
        f.appendChild(el('div', 'web-form-titre', b.titre || 'Connexion'));
        const i1 = el('input', 'web-in'); i1.placeholder = b.champs && b.champs[0] || 'utilisateur';
        const i2 = el('input', 'web-in'); i2.type = 'password'; i2.placeholder = b.champs && b.champs[1] || 'mot de passe';
        const ok = el('button', 'web-btn', b.bouton || 'Entrer');
        ok.onclick = () => { f.appendChild(el('div', 'web-info', '… rien ne répond. (formulaire inerte — M3 : il deviendra crochettable.)')); };
        f.appendChild(i1); f.appendChild(i2); f.appendChild(ok);
        body.appendChild(f); break;
      }
      default: {
        const d = el('div', 'web-p'); d.textContent = b.x || '';
      }
    }
  }

  function corpsRecherche(body) {
    const wrap = el('div', 'web-search');
    const input = el('input', 'web-in'); input.placeholder = ready ? 'chercher sur le web intérieur…' : 'initialisation des fouines…';
    const res = el('div', 'web-res');
    const tirets = (m) => { const d = el('div', 'web-res-ligne'); d.innerHTML = m; return d; };
    const afficher = (q) => {
      res.innerHTML = '';
      if (!q) return;
      evt('fouine', { q: q.toLowerCase().trim() });
      const trouves = recherche(q);
      if (!trouves.length) {
        res.appendChild(tirets(`<span class="web-dim">Aucun résultat pour « ${esc(q)} ». Une fouine passera plus tard.</span>`));
        return;
      }
      for (const s of trouves) {
        const r = el('div', 'web-hit');
        const lien = el('button', 'web-link', s.title);
        lien.onclick = () => navigate(s.domain + '/');
        r.appendChild(lien);
        r.appendChild(el('span', 'web-hit-dom', s.domain));
        if (s.excerpt) r.appendChild(el('div', 'web-hit-ex', s.excerpt));
        res.appendChild(r);
      }
      res.appendChild(el('div', 'web-dim', `${trouves.length} résultat(s) — classés par pertinence de fouine`));
    };
    let deb = null;
    input.oninput = () => { clearTimeout(deb); deb = setTimeout(() => afficher(input.value), 180); };
    wrap.appendChild(input); wrap.appendChild(res);
    body.appendChild(wrap);
    setTimeout(() => input.focus(), 50);
  }

  /* ------------------------------------------------ overlay (auto-injecté) */
  function construireOverlay() {
    if ($('web')) return;
    const ov = el('div', 'ov'); ov.id = 'web';

    const pan = el('div', 'web-panel');
    const head = el('div', 'web-head');
    const mk = (label, cb, titre) => { const b = el('button', 'web-nav', label); b.title = titre || ''; b.onclick = cb; return b; };
    head.appendChild(mk('◀', () => { if (histI > 0) { histI--; navigate(hist[histI], false); } }, 'Précédent'));
    head.appendChild(mk('▶', () => { if (histI < hist.length - 1) { histI++; navigate(hist[histI], false); } }, 'Suivant'));
    head.appendChild(mk('⌂', () => navigate('fouine.bi'), 'Accueil (Fouine)'));

    const url = el('input', 'web-url'); url.id = 'webUrl';
    url.placeholder = 'domaine.bi/page';
    url.spellcheck = false;
    url.onkeydown = (e) => { if (e.key === 'Enter') navigate(url.value); };
    head.appendChild(url);
    head.appendChild(mk('⟶', () => navigate(url.value), 'Aller'));
    const close = el('button', 'web-nav', '×'); close.title = 'Fermer';
    close.onclick = () => ov.classList.remove('open');
    head.appendChild(close);
    pan.appendChild(head);

    pan.appendChild(el('div', 'web-body')).id = 'webBody';
    const stat = el('div', 'web-stat'); stat.id = 'webStat'; stat.textContent = 'web intérieur — aucun paquet ne quitte ta machine';
    pan.appendChild(stat);
    ov.appendChild(pan);
    document.body.appendChild(ov);
  }

  function ouvrir(url) {
    construireOverlay();
    $('web').classList.add('open');
    navigate(url || 'fouine.bi');
  }

  /* ------------------------------------------------ API + câblage */
  global.LabyWeb = {
    open: ouvrir,
    navigate,
    whoisOf,
    search: recherche,
    sites: () => Array.from(Sites.keys()),
    history: () => hist.slice(),            // T13 : lisible… par les PNJ aussi
    ready: () => ready
  };

  function boot() {
    construireOverlay();
    chargerSites().then(() => {
      const b = $('icoBrowser');
      if (b) b.onclick = () => ouvrir();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
