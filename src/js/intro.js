/* =====================================================================
   Introduction narrative — une entrée originale dans le monde du jeu.
   Le contenu est lisible sans animation, peut être passé ou revu, et ne
   lance jamais une commande à la place du joueur.
   ===================================================================== */
(function (global) {
  'use strict';

  const $ = id => document.getElementById(id);
  const game = () => global.LABYRINTHE && global.LABYRINTHE.game;
  const titres = ['TRANSMISSION', 'TON POSTE', 'PREMIER CONTRAT'];
  let bound = false, onChange = function () {}, pauseAt = null, pausedGame = null, priorFocus = null;

  function state() {
    const g = game();
    if (!g) return null;
    if (!g.intro) g.intro = { terminee: true, etape: 0 };
    return g.intro;
  }
  function isOpen() {
    const overlay = $('introOverlay');
    return !!overlay && !overlay.hidden;
  }
  function clampStep(step) {
    return Math.max(0, Math.min(titres.length - 1, Number.isInteger(step) ? step : 0));
  }

  // Pendant la lecture, ni l'horloge du monde ni les processus ne doivent
  // avancer. Mettre aussi à jour les horodatages réels pour ne pas pénaliser
  // le bonus de rapidité ou terminer une attaque dès la fermeture du dialogue.
  function checkpoint() {
    if (!isOpen() || pauseAt === null) return;
    const now = Date.now(), g = game();
    const delta = Math.max(0, now - pauseAt);
    if (g && g === pausedGame) {
      if (Number.isFinite(g.missionStartedAt)) g.missionStartedAt += delta;
      if (Number.isFinite(g.startedAt)) g.startedAt += delta;
      for (const p of g.processes || []) {
        if (!p.cancelled && Number.isFinite(p.startedAt)) p.startedAt += delta;
      }
      if (g.honeypot && g.honeypot.active && Number.isFinite(g.honeypot.depuis)) g.honeypot.depuis += delta;
      if (g.trace && Number.isFinite(g.trace.startedAt)) g.trace.startedAt += delta;
      if (g._clockLast !== undefined) g._clockLast = now;
      if (g.intro && !g.intro.terminee) g.intro.pauseEnregistreeA = now;
    }
    pauseAt = now;
  }

  function effectiveName() {
    const g = game();
    return (g && g.profile && g.profile.nom) || 'joueur';
  }
  function render(step) {
    step = clampStep(step);
    const name = effectiveName();
    for (const el of document.querySelectorAll('[data-intro-user]')) el.textContent = name + '@poste:~$';
    for (const el of document.querySelectorAll('[data-intro-user-name]')) el.textContent = name;
    for (const page of document.querySelectorAll('[data-intro-page]')) {
      page.hidden = Number(page.dataset.introPage) !== step;
    }
    for (const bar of document.querySelectorAll('[data-intro-indicator]')) {
      bar.classList.toggle('active', Number(bar.dataset.introIndicator) <= step);
    }
    $('introOverlay').setAttribute('aria-labelledby', 'introTitle' + step);
    $('introProgress').textContent = String(step + 1).padStart(2, '0') + ' / 03 · ' + titres[step];
    $('introBack').hidden = step === 0;
    $('introNext').hidden = step === titres.length - 1;
    $('introSolo').hidden = step !== titres.length - 1;
    $('introStart').hidden = step !== titres.length - 1;
    $('introOverlay').querySelector('.intro-content').scrollTop = 0;
  }

  function focusForStep(step) {
    const button = step === titres.length - 1 ? $('introStart') : $('introNext');
    button.focus();
  }

  function show(step, reprise) {
    const g = game(), s = state(), overlay = $('introOverlay');
    if (!g || !s || !overlay) return;
    const now = Date.now();
    if (!isOpen()) priorFocus = document.activeElement;
    // Une introduction non terminée peut être reprise après fermeture de la
    // page : ce temps hors jeu ne compte pas dans la durée de la mission.
    if (reprise && !s.terminee && Number.isFinite(s.pauseEnregistreeA)) {
      const absent = Math.max(0, now - s.pauseEnregistreeA);
      if (Number.isFinite(g.missionStartedAt)) g.missionStartedAt = Math.min(now, g.missionStartedAt + absent);
      if (Number.isFinite(g.startedAt)) g.startedAt = Math.min(now, g.startedAt + absent);
    }
    if (!s.terminee) s.pauseEnregistreeA = now;
    s.etape = clampStep(step);
    pauseAt = now; pausedGame = g;
    if (g._clockLast !== undefined) g._clockLast = now;
    $('app').inert = true;
    overlay.hidden = false;
    render(s.etape);
    focusForStep(s.etape);
  }

  function hideWithoutSaving() {
    const overlay = $('introOverlay');
    if (!overlay || overlay.hidden) return;
    overlay.hidden = true;
    $('app').inert = false;
    pauseAt = null; pausedGame = null;
    const focus = priorFocus && priorFocus.isConnected && typeof priorFocus.focus === 'function' ? priorFocus : $('cmd');
    if (focus && focus !== document.body) focus.focus();
    else $('cmd').focus();
    priorFocus = null;
  }

  function finish(avecGuide) {
    const g = game(), s = state();
    if (!g || !s || !isOpen()) return;
    checkpoint();
    s.terminee = true;
    s.etape = titres.length - 1;
    delete s.pauseEnregistreeA;
    if (typeof avecGuide === 'boolean' && g.tutorial) g.tutorial.hidden = !avecGuide;
    hideWithoutSaving();
    if (global.LabyTutorial) global.LabyTutorial.refresh();
    onChange();
  }

  function change(delta) {
    const s = state();
    if (!s || !isOpen()) return;
    checkpoint();
    s.etape = clampStep(s.etape + delta);
    render(s.etape);
    focusForStep(s.etape);
    onChange();
  }

  function keyboard(event) {
    if (!isOpen()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      finish();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = [...$('introOverlay').querySelectorAll('button:not([hidden]):not([disabled]), .intro-content[tabindex="0"]')]
      .filter(item => item.getClientRects().length);
    if (!items.length) { event.preventDefault(); return; }
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || !$('introOverlay').contains(document.activeElement))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !$('introOverlay').contains(document.activeElement))) {
      event.preventDefault(); first.focus();
    }
  }

  function bind() {
    if (bound || !$('introOverlay')) return;
    bound = true;
    $('introSkip').addEventListener('click', () => finish());
    $('introBack').addEventListener('click', () => change(-1));
    $('introNext').addEventListener('click', () => change(1));
    $('introSolo').addEventListener('click', () => finish(false));
    $('introStart').addEventListener('click', () => finish(true));
    $('icoIntro').addEventListener('click', open);
    document.addEventListener('keydown', keyboard, true);
  }

  function open() {
    bind();
    if (!isOpen()) show(0, false);
  }

  // Après un import, l'état du jeu a changé sous le même objet : reprendre
  // seulement l'introduction de la sauvegarde importée, sans conserver les
  // horodatages de la partie précédente.
  function sync() {
    if (!bound) return;
    const s = state();
    pauseAt = null; pausedGame = null;
    if (s && !s.terminee) show(s.etape, true);
    else hideWithoutSaving();
  }

  function start(options) {
    onChange = options && options.onChange || function () {};
    bind();
    const s = state();
    if (s && !s.terminee) show(s.etape, true);
  }

  global.LabyIntro = { start, open, sync, checkpoint, isOpen, ready: () => bound };
})(typeof window !== 'undefined' ? window : globalThis);
