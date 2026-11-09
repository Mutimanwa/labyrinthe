/* =====================================================================
   clock.js — Horloge du monde (T6).
   1 seconde réelle = 1 minute monde. Persistée dans game.worldMin (v4).
   Affichée dans la topbar. Brique de base de : forum différé (T10),
   agenda ECHO des PNJ (T13), décroissance des traces (T12).
   ===================================================================== */
(function (global) {
  'use strict';

  const $ = id => document.getElementById(id);
  const EPOCH = Date.UTC(2026, 10, 5, 8, 0, 0);   // 5 nov. 2026, 08:00 monde
  const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const pad = n => String(n).padStart(2, '0');

  function dateMonde(game) {
    return new Date(EPOCH + (game.worldMin || 0) * 60000);
  }
  function fmtMonde(game) {
    const t = dateMonde(game);
    return `${pad(t.getUTCDate())} ${MOIS[t.getUTCMonth()]} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
  }
  function isoMonde(game) { return dateMonde(game).toISOString(); }

  function rendre() {
    const g = global.LABYRINTHE && global.LABYRINTHE.game;
    const c = $('worldClock');
    if (g && c) c.textContent = fmtMonde(g);
  }

  function brancher() {
    const g = global.LABYRINTHE && global.LABYRINTHE.game;
    if (!g || typeof g.tick !== 'function') { console.error('[clock] game indisponible au signal laby:ready'); return; }
    if (g.__clockWrap) return;
    g.__clockWrap = true;
    g._clockLast = Date.now();
    const origTick = g.tick.bind(g);
    g.tick = function (now) {                          // décorateur, pattern programs.js
      now = now || Date.now();
      const dtMs = Math.max(0, now - (this._clockLast || now));
      this._clockLast = now;
      this.worldMin = (this.worldMin || 0) + dtMs / 1000;   // 1 s réelle = 1 min monde
      return origTick(now);
    };
    setInterval(rendre, 500);
    rendre();
  }

  /* API pour quêtes/PNJ datés (T10/T13) : window.LabyClock */
  global.LabyClock = { isoMonde, dateMonde, fmtMonde };

  if (global.LabyPause && global.LabyPause.quandPret) global.LabyPause.quandPret(brancher);
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', brancher);
  else brancher();
})(typeof window !== 'undefined' ? window : globalThis);
