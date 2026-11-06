/* =====================================================================
   mail.js — Courrier du monde (T11).
   Boîte aux lettres narrative : bienvenue du Cartographe, bordereaux de
   contrats, et le premier test de phishing (à l'entrée APPRENTI).
   Chaque mail peut porter des actions (ouvrir le tableau, accepter un
   contrat…). Persisté dans game.mail (v4). Zéro vrai réseau, comme tout.
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

  function game() { return global.LABYRINTHE && global.LABYRINTHE.game; }
  function boite() {
    const g = game();
    if (!g.mail) g.mail = { inbox: [], compteur: 1, welcomed: false, phish: null };
    return g.mail;
  }
  function heureMonde() {
    const g = game();
    return global.LabyClock && g ? global.LabyClock.fmtMonde(g) : '--:--';
  }

  /* ------------------------------------------------ écriture d'un mail */
  function poster(m) {
    const b = boite();
    m.id = 'm' + (b.compteur++);
    m.quand = heureMonde();
    m.lu = false;
    b.inbox.push(m);
    const g = game();
    if (g && g.say) g.say(`✉ ${m.de}: « ${m.sujet} »`, 'mail');
    peindreBadge();
    if ($('mail') && $('mail').classList.contains('open')) peindreListe();
  }

  function nonLus() { return boite().inbox.filter(m => !m.lu).length; }

  /* ------------------------------------------------ scénarios déclenchés */
  function mailBienvenue() {
    poster({
      de: 'Cartographe', sujet: 'tu es accepté (premier conseil, gratuit)',
      corps: [
        'Bienvenue à l\'Académie. Tout le monde arrive par le terminal ; les bons y restent, les autres lisent.',
        'Premier conseil, gratuit : les portes du Labyrinthe s\'ouvrent au rang, pas à l\'arrogance.',
        'Deuxième conseil : lis « cours », lis ManPages (manpages.bi), et vérifie TON adresse expéditrice avant de cliquer quoi que ce soit — même ce mail.',
        '— C.'
      ]
    });
  }

  function mailContrat(id, sens) {
    const def = global.LabyContracts && global.LabyContracts.defs().find(d => d.id === id);
    if (!def) return;
    if (sens === 'accepte') {
      poster({
        de: def.giver || 'donneur', sujet: `[${def.id}] ${def.titre} — bordereau`,
        corps: [def.brief, 'Périmètre rappelé : rien hors du cadre. La méthode est notée autant que le résultat.'],
        actions: [{ label: 'OUVRIR LE TABLEAU DES CONTRATS', kind: 'tableau' }]
      });
    } else if (sens === 'fait') {
      poster({
        de: def.giver || 'donneur', sujet: `[${def.id}] reçu, vérifié, payé`,
        corps: [
          'Les faits parlaient, je n\'ai eu qu\'à lire. Récompense versée.',
          'Le prochain contrat exigera le rapport écrit, pas seulement les traces propres. (M4 du cursus — tu verras.)'
        ]
      });
    }
  }

  /* Le phishing d'initiation : déclenché une seule fois, quand le rang
     APPRENTI ouvre la couche 3. Échec = Respect −10 + leçon ; ignorer
     4 h monde = réussite +2. Le domaine est fautif À DESSEIN (indice). */
  function mailPhish() {
    const b = boite();
    b.phish = { creeA: (game().worldMin || 0), statut: 'envoye' };
    poster({
      de: 'admin@netsec-interleur.bi', sujet: '⚠ Ton compte NetSec-Intérieur va etre suspendu',
      kind: 'phish',
      corps: [
        'Bonjour apprenti,',
        'Suite a une migration de nos serveurs ton compte sera SUPPRIME dans moins de 24 heures sauf si tu confirmes tes identifiants immediatement.',
        'Clique ci-dessous et entre ton mot de passe pour conserver ton acces au forum.',
        '— Administration NetSec-Intérieur'
      ],
      actions: [{ label: 'CONFIRMER MES IDENTIFIANTS', kind: 'phish-confirm' }]
    });
  }

  function debriefPhish(reussi) {
    const b = boite();
    // L'exercice ne peut être évalué qu'une fois, même si un ancien message
    // reste ouvert après une sauvegarde ou plusieurs clics.
    if (!b.phish || b.phish.statut !== 'envoye') return false;
    b.phish.statut = reussi ? 'reussi' : 'rate';
    const bouton = document.querySelector('#mlRead [data-phish-confirm]');
    if (bouton) bouton.disabled = true;
    const g = game();
    if (reussi) {
      g.respect = (g.respect || 0) + 2;
      poster({
        de: 'MURMURE', sujet: 'exercice de phishing — réussi',
        corps: [
          'Tu n\'as rien confirmé. Bien.',
          'Indices qui auraient dû te mettre en garde : le domaine s\'écrit « interLEUR » ; l\'urgence sous 24 h ; aucun vrai admin ne demande un mot de passe par mail. Tu as ignoré les trois ? Non ? Alors retiens-les.',
          '+2 respect. Le forum a bonne mémoire.'
        ]
      });
      if (g.say) g.say('✉ Exercice de phishing ignoré — réussi. +2 respect.', 'ok');
    } else {
      g.respect = Math.max(0, (g.respect || 0) - 10);
      poster({
        de: 'MURMURE', sujet: 'exercice de phishing — ÉCHOUÉ',
        corps: [
          'Tu as envoyé un mot de passe à « netsec-interleur.bi ». Relis ce domaine lentement.',
          'Urgence + menace de suppression + demande d\'identifiants = le trio classique. Le module 16 et le bon sens disent la même chose.',
          '−10 respect. La prochaine fois, lis l\'adresse avant le sujet. (Ici, c\'était nous. Ailleurs, ce sera Tâche-Noire.)'
        ]
      });
      if (g.say) g.say('✉ Tu as rempli le formulaire de « netsec-interleur.bi ». −10 respect. Lis le mail de MURMURE.', 'err');
    }
    return true;
  }

  /* ------------------------------------------------ boucle de monde */
  function boucle() {
    const g = game();
    if (!g) return void setTimeout(boucle, 1000);

    const b = boite();
    if (!b.welcomed) { b.welcomed = true; mailBienvenue(); }

    setInterval(() => {
      if (global.LabyIntro && global.LabyIntro.isOpen()) return;
      // restore() remplace l'objet mail : ne pas conserver une référence vers
      // l'ancienne boîte, sinon les échéances et le phishing se désynchronisent.
      const courant = game();
      if (!courant) return;
      const boiteCourante = boite();
      if (!boiteCourante.welcomed) { boiteCourante.welcomed = true; mailBienvenue(); }
      /* phishing : déclenché à l'entrée APPRENTI, une seule fois */
      if (!boiteCourante.phish && global.LabyProfile && global.LabyProfile.rank() >= 2) mailPhish();
      /* expiration : ignorer le mail pendant 4 h monde = réussite */
      if (boiteCourante.phish && boiteCourante.phish.statut === 'envoye' &&
          (courant.worldMin || 0) >= boiteCourante.phish.creeA + 240) debriefPhish(true);
      peindreBadge();
    }, 1500);
  }

  /* ------------------------------------------------ bus : contrats */
  function embrancherBus() {
    const g = game();
    if (!g || g.__mailWrap) return void setTimeout(embrancherBus, 500);
    g.__mailWrap = true;
    const orig = g.record.bind(g);
    g.record = function (type, data) {
      orig(type, data);
      try {
        if (type === 'contract-accept') mailContrat(data.id, 'accepte');
        if (type === 'contract-done') mailContrat(data.id, 'fait');
      } catch (e) { console.warn('[mail]', e); }
    };
  }

  /* ------------------------------------------------ UI : overlay poste */
  function construire() {
    if ($('mail')) return;
    const ov = el('div', 'ov'); ov.id = 'mail';
    const pan = el('div', 'ml-panel');
    const head = el('div', 'web-head');
    head.appendChild(el('div', 'pf-titre', 'POSTE — boîte de réception'));
    const x = el('button', 'web-nav', '×');
    x.onclick = () => ov.classList.remove('open');
    head.appendChild(x);
    pan.appendChild(head);
    const corps = el('div', 'ml-cols');
    const gauche = el('div', 'ml-list'); gauche.id = 'mlList';
    const droite = el('div', 'ml-read'); droite.id = 'mlRead';
    corps.appendChild(gauche); corps.appendChild(droite);
    pan.appendChild(corps);
    ov.appendChild(pan);
    document.body.appendChild(ov);
  }

  function peindreBadge() {
    const b = $('icoMail');
    if (!b) return;
    const n = nonLus();
    b.textContent = n ? '✉' + n : '✉';
    b.title = n ? `${n} message(s) non lu(s)` : 'Poste — boîte de réception';
  }

  function peindreListe() {
    const liste = $('mlList');
    if (!liste) return;
    liste.innerHTML = '';
    const inbox = boite().inbox.slice().reverse();
    if (!inbox.length) liste.appendChild(el('div', 'web-dim', 'aussi vide que ta réputation — pour l\'instant.'));
    for (const m of inbox) {
      const lig = el('div', 'ml-item' + (m.lu ? '' : ' nonlu'));
      lig.appendChild(el('div', 'ml-de', m.de));
      lig.appendChild(el('div', 'ml-suj', m.sujet));
      lig.appendChild(el('div', 'ml-quand', m.quand));
      lig.onclick = () => { m.lu = true; peindreBadge(); peindreListe(); peindreLecture(m); };
      liste.appendChild(lig);
    }
  }

  function actionPhish() {
    // confirmation d'identifiants = échec, une seule fois (c'est un exercice !)
    if (!debriefPhish(false)) return;
    const r = $('mlRead');
    if (r) {
      r.appendChild(el('div', 'web-sep'));
      r.appendChild(el('div', 'web-p', '… le formulaire se fige. Quelque part, un journal vient d\'écrire ton nom.'));
    }
  }

  function peindreLecture(m) {
    const r = $('mlRead');
    if (!r) return;
    r.innerHTML = '';
    r.appendChild(el('div', 'web-h2', m.sujet));
    r.appendChild(el('div', 'ml-meta', 'de ' + m.de + ' — ' + m.quand));
    for (const p of m.corps || []) r.appendChild(el('div', 'web-p', p));
    for (const a of m.actions || []) {
      const b = el('button', 'web-btn', a.label);
      if (a.kind === 'tableau') b.onclick = () => { $('mail').classList.remove('open'); const c = $('btnContracts'); if (c) c.click(); };
      if (a.kind === 'phish-confirm') {
        b.dataset.phishConfirm = 'true';
        b.disabled = !boite().phish || boite().phish.statut !== 'envoye';
        b.onclick = actionPhish;
      }
      r.appendChild(b);
    }
    if (m.kind === 'phish' && boite().phish && boite().phish.statut !== 'envoye') {
      r.appendChild(el('div', 'web-dim', '(lien mort — l\'exercice est terminé)'));
    }
  }

  function ouvrir() {
    construire();
    $('mail').classList.add('open');
    peindreListe();
    const r = $('mlRead'); if (r) r.innerHTML = '<div class="web-dim">choisis un message à gauche.</div>';
  }

  function boot() {
    boucle();
    embrancherBus();
    const b = $('icoMail');
    if (b) b.onclick = ouvrir;
  }

  global.LabyMail = { open: ouvrir, poster, inbox: () => boite().inbox };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof window !== 'undefined' ? window : globalThis);
