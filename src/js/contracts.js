/* =====================================================================
   contracts.js — Contrats data du content/ (T7).
   Charge content/missions/*.json, les affiche dans le tableau des
   contrats existants, écoute le bus d'événements (game.record) et
   récompense automatiquement quand les faits du monde correspondent.
   Le cursus des 16 contrats de campaign.js n'est pas modifié : les
   contrats data vivent à côté, en carrière libre.
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

  const defs = new Map();
  let charge = false;

  async function lireContenu(chemin) {
    if (global.LabyBridge && global.LabyBridge.tauri) {
      const r = await global.LabyBridge.contentLoad(chemin);
      return r ? JSON.parse(r) : null;
    }
    const r = await fetch('content/' + chemin);
    return r.ok ? r.json() : null;
  }

  async function charger() {
    try {
      const manifest = await lireContenu('missions/manifest.json');
      if (!manifest) return;
      for (const f of manifest.missions) {
        const d = await lireContenu('missions/' + f);
        if (d && d.id) defs.set(d.id, d);
      }
      charge = true;
    } catch (e) { console.warn('[contrats] chargement impossible', e); }
  }

  /* ------------------------------------------------ état (persisté en v4) */
  function game() { return global.LABYRINTHE && global.LABYRINTHE.game; }
  function etat() {
    const g = game();
    if (!g.contractsState) g.contractsState = { active: [], done: [] };
    return g.contractsState;
  }

  /* ------------------------------------------------ évaluation des victoires */
  function matchSpec(ev, spec) {
    if (!ev || ev.type !== spec.type) return false;
    for (const k in spec) {
      if (k === 'type') continue;
      const a = spec[k], b = ev[k];
      if (typeof a === 'string' && typeof b === 'string') {
        if (a.toLowerCase() !== b.toLowerCase()) return false;
      } else if (a !== b) return false;
    }
    return true;
  }
  function complet(def) {
    const evs = (game() && game().events) || [];
    return ((def.win && def.win.events) || []).every(sp => evs.some(ev => matchSpec(ev, sp)));
  }

  function resumerSpec(sp) {
    if (sp.type === 'fouine') return `Fouine : « ${sp.q} »`;
    if (sp.type === 'visit') return `Visiter ${sp.target}`;
    if (sp.type === 'whois') return `whois ${sp.target}`;
    return sp.type + (sp.target ? ` ${sp.target}` : '');
  }

  function recompenser(def) {
    const g = game();
    // T17 : si le contrat exige un rapport de pentest, la récompense est bloquée
    // tant que le rapport n’a pas été validé (commande 'rapport soumettre').
    if (def.report_required) {
      const rep = (g.reports || {})[def.id];
      if (!rep || !rep.valide) {
        // laisse le contrat actif et signale au joueur
        if (g.say) {
          g.say('');
          g.say(`⚠ CONTRAT ${def.id} : faits atteints, mais le rapport de pentest est manquant.`, 'warn');
          g.say(`  Ouvrez le gabarit : rapport ${def.id}`, 'dim');
          g.say(`  Remplissez et validez : rapport soumettre ${def.id}`, 'dim');
        }
        return; // pas de récompense
      }
    }
    const r = def.reward || {};
    g.credits = (g.credits || 0) + (r.credits || 0);
    g.sats = (g.sats || 0) + (r.sats || 0);
    g.respect = (g.respect || 0) + (r.respect || 0);
    g.xp = (g.xp || 0) + (r.xp || 0);
    g.record('contract-done', { id: def.id });
    if (g.say) {
      g.say('');
      g.say(`✔ CONTRAT TERMINÉ — ${def.titre} [${def.id}]`, 'ok');
      g.say(`  +${r.credits || 0} crédits${r.sats ? ' · +' + r.sats + ' sats' : ''} · +${r.respect || 0} respect · +${r.xp || 0} xp`, 'dim');
    }
  }

  /* appelé à chaque événement du bus */
  function surEvenement() {
    const s = etat();
    let repeindre = false;
    for (const id of s.active.slice()) {
      if (s.done.includes(id)) continue;
      const def = defs.get(id);
      if (def && complet(def)) {
        s.active = s.active.filter(x => x !== id);
        s.done.push(id);
        recompenser(def);
        repeindre = true;
      }
    }
    if (repeindre) peindre();
  }

  /* embranchement sur le tuyau unique (pattern du wrapping de game.say) */
  function embrancherBus() {
    const g = game();
    if (!g || g.__contractsWrap) return void setTimeout(embrancherBus, 500);
    g.__contractsWrap = true;
    const origRecord = g.record.bind(g);
    g.record = function (type, data) {
      origRecord(type, data);
      try { surEvenement(); } catch (e) { console.warn('[contrats]', e); }
    };
  }

  /* ------------------------------------------------ actions joueur */
  function accepter(id) {
    const g = game();
    const s = etat();
    if (!s.active.includes(id) && !s.done.includes(id)) {
      s.active.push(id);
      g.record('contract-accept', { id });
      if (g.say) g.say(`Contrat accepté : ${defs.get(id).titre} — objectifs affichés au tableau.`, 'ok');
    }
    peindre();
  }

  /* ------------------------------------------------ rendu dans le tableau */
  function carte(def) {
    const s = etat();
    const fait = s.done.includes(def.id);
    const actif = s.active.includes(def.id);
    const c = el('div', 'sd-card' + (fait ? ' sd-fait' : actif ? ' sd-actif' : ''));
    const head = el('div', 'sd-head');
    head.appendChild(el('span', 'sd-titre', (fait ? '✔ ' : '') + def.titre));
    head.appendChild(el('span', 'sd-id', def.id + ' · phase ' + def.phase));
    c.appendChild(head);
    c.appendChild(el('div', 'sd-giver', 'donneur : ' + (def.giver || '?') + (def.type ? ' — ' + def.type : '')));
    c.appendChild(el('div', 'sd-brief', def.brief || ''));
    const specs = (def.win && def.win.events) || [];
    if (specs.length) {
      const ul = el('div', 'sd-specs');
      for (const sp of specs) ul.appendChild(el('div', 'sd-spec', '· ' + resumerSpec(sp)));
      c.appendChild(ul);
    }
    if (def.win && def.win.answer_format) c.appendChild(el('div', 'sd-note', 'À joindre au rapport : ' + def.win.answer_format));
    const r = def.reward || {};
    c.appendChild(el('div', 'sd-reward', `récompense : ${r.credits || 0} cr · ${r.respect || 0} respect · ${r.xp || 0} xp`));
    if (def.report_required) {
      const g = game();
      const rep = (g && g.reports || {})[def.id];
      c.appendChild(el('div', 'sd-note', rep && rep.valide ? 'Rapport validé — récompense débloquée.' : 'Rapport de pentest REQUISE : rapport <id> puis rapport soumettre <id>.'));
    }
    if (!fait && !actif) {
      const b = el('button', 'sd-btn', 'ACCEPTER');
      b.onclick = () => accepter(def.id);
      c.appendChild(b);
    } else if (actif) {
      c.appendChild(el('div', 'sd-statut', 'EN COURS — les faits parlent, pas les promesses.'));
    } else {
      c.appendChild(el('div', 'sd-statut', 'TERMINÉ — récompense versée.'));
    }
    return c;
  }

  function section() {
    const sec = el('div', 'sd-sec'); sec.id = 'sideContracts';
    sec.appendChild(el('div', 'sd-sec-titre', 'WEB — CONTRATS DATA (content/missions)'));
    if (!charge || !defs.size) {
      sec.appendChild(el('div', 'sd-note', 'aucun pack de contrats chargé (content/missions/manifest.json).'));
      return sec;
    }
    for (const def of defs.values()) sec.appendChild(carte(def));
    return sec;
  }

  function peindre() {
    const body = $('contractsBody');
    if (!body) return;
    const vieux = $('sideContracts');
    if (vieux) vieux.remove();
    body.appendChild(section());
  }

  /* Le tableau #contractsBody est reconstruit par ui.js à chaque ouverture :
     on observe et on ré-appose notre section (garde anti-boucle par id). */
  function observer() {
    const body = $('contractsBody');
    if (!body) return void setTimeout(observer, 500);
    new MutationObserver(() => { if (!$('sideContracts')) peindre(); })
      .observe(body, { childList: true });
    peindre();
  }

  function boot() {
    charger().then(() => { embrancherBus(); observer(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  global.LabyContracts = { defs: () => Array.from(defs.values()), etat, peindre };
})(typeof window !== 'undefined' ? window : globalThis);
