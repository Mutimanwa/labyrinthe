/* =====================================================================
   pause.js — Pause globale unique.
   La simulation s'arrête dès que le joueur ne peut pas agir (écran de
   configuration de la station, introduction narrative…). Chaque module
   pose une raison nommée ; la boucle d'horloge (ui.js) et les
   ordonnanceurs internes (PNJ, forum, mail, badge profil) la
   respectent. Les raisons sont nommées pour rester lisibles en cas de
   double pause oubliée.
   ===================================================================== */
(function (global) {
  'use strict';

  const raisons = new Set();

  function poser(raison) { raisons.add(raison || 'pause'); }
  function lever(raison) {
    if (raison) raisons.delete(raison);
    else raisons.clear();
  }
  function active() { return raisons.size > 0; }
  function liste() { return Array.from(raisons); }

  /* Exécute fn dès que la partie est restaurée (événement « laby:ready »,
     dispatché en fin de boot() une fois la sauvegarde rechargée ou une
     nouvelle partie ouverte). Si le chargement est tardif — script empilé
     après le boot — fn part immédiatement. Évite la course
     DOMContentLoaded → game non encore restauré. */
  function quandPret(fn) {
    if (global.LabyReady) { fn(); return; }
    if (typeof document === 'undefined') return;
    const handler = () => { document.removeEventListener('laby:ready', handler); fn(); };
    document.addEventListener('laby:ready', handler);
  }

  global.LabyPause = { poser, lever, active, liste, quandPret };
})(typeof window !== 'undefined' ? window : globalThis);
