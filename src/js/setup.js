/* =====================================================================
   setup.js — Configuration de la station avant la première session.
   Trois écrans : formulaire → confirmation → journal de démarrage,
   plus l’écran de déverrouillage des sessions suivantes.

   Le mot de passe n'est JAMAIS conservé en clair : seulement un
   vérificateur PBKDF2-SHA-256 salé (voir js/credentials.js). Ce verrou
   est fictif et LOCAL — il ne chiffre pas la sauvegarde. Aucune donnée
   ne quitte la machine.
   ===================================================================== */
(function (global) {
  'use strict';

  const $ = id => document.getElementById(id);
  const NAME = /^[a-z][a-z0-9_-]{1,23}$/;
  const APP = () => $('app');

  const state = { open: false, stage: 'form', resolve: null, config: null, attempts: 0, priorFocus: null, bootTimer: null, bootDone: null };

  function showStage(name) {
    state.stage = name;
    const overlay = $('setup');
    overlay.dataset.stage = name;
    for (const stage of overlay.querySelectorAll('[data-setup-stage]')) {
      stage.hidden = stage.dataset.setupStage !== name;
    }
    $('setupSub').textContent = name === 'unlock' ? 'SESSION VERROUILLÉE' : 'ENREGISTREMENT DE LA STATION';
    const first = overlay.querySelector('[data-setup-stage]:not([hidden]) input, [data-setup-stage]:not([hidden]) button');
    if (first) first.focus();
  }

  function isOpen() { return state.open; }

  function setError(id, message) {
    const box = $(id);
    if (!message) { box.hidden = true; box.textContent = ''; return; }
    box.hidden = false;
    box.textContent = message;
  }

  async function busy(button, label, work) {
    const previous = button.textContent;
    button.disabled = true;
    button.textContent = label;
    try { return await work(); }
    finally { button.disabled = false; button.textContent = previous; }
  }

  function focusables() {
    const overlay = $('setup');
    return [...overlay.querySelectorAll('input, button')].filter(el => !el.disabled && el.offsetParent !== null);
  }

  function trapTab(e) {
    if (e.key !== 'Tab' || !state.open) return;
    const items = focusables();
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function onKeydown(e) {
    if (!state.open) return;
    if (e.key === 'Tab') return trapTab(e);
    if (state.stage === 'boot') { e.preventDefault(); finishBoot(); return; }
    // Aucun Échap qui contournerait l'enregistrement ; sur la confirmation,
    // Échap renvoie simplement au formulaire.
    if (e.key === 'Escape' && state.stage === 'confirm') { e.preventDefault(); showStage('form'); return; }
    if (e.key === 'Escape') e.preventDefault();
    if (e.key === 'Enter' && state.stage === 'confirm') {
      e.preventDefault();
      $('setupConfirm').click();
    }
  }

  // -------------------------------------------------- JOURNAL DE BOOT
  // Séquence entièrement originale à LABYRINTHE : rien n’est repris du
  // texte de démarrage d’un jeu existant. « <name> » = utilisateur courant.
  const BOOT_LINES = [
    { t: 'LYB-OS 1.0.0 « Fil d’Ariane » — noyau pédagogique #1 SMP x86_64', d: 0 },
    { t: 'lby-cpu    : 6 × LABY-ZEN 3.60 GHz · virt 16 Go · horloge stable', d: 130 },
    { t: 'lby-mem    : 761 Mo — test mémoire … 761 Mo sans erreur     [ OK ]', d: 190 },
    { t: 'lby-acpi   : table d’événements reconstruite · 0 défaut signé [ OK ]', d: 150 },
    { t: 'lby-iommu  : canaux DMA isolés — sortie réseau verrouillée   [ OK ]', d: 160 },
    { t: 'lby-net    : 10.10.0.0/24 — lien eth0 monté (simulé)         [ OK ]', d: 170 },
    { t: 'lby-ssh    : démon pédagogique à l’écoute sur 0.0.0.0:22     [ OK ]', d: 180 },
    { t: 'lby-storage: /dev/laby0 → / (lecture-écriture) · journal rejoué 14 blocs', d: 150 },
    { t: 'lby-mount  : /home/joueur … image héritée de la formation    [ OK ]', d: 150 },
    { t: 'lby-crypto : mémoire de session effacée · aucun secret consigné', d: 160 },
    { t: 'lby-profile: <name> (uid=1000) — vérificateur PBKDF2-SHA-256 chargé', d: 210 },
    { t: 'lby-contracts: tableau LOCAL synchronisé · 1er dossier « terrain » en attente', d: 170 },
    { t: 'lby-echo   : sentinelle en veille — ici, la mémoire est longue', d: 170 },
    { t: 'lby-telemetry: désactivée — ce noyau ne rend compte à personne', d: 160 },
    { t: 'lby-netns  : 0 paquet émis vers l’extérieur · sandbox étanche', d: 150 },
    { t: 'lby-check  : intégrité du poste … RAS', d: 140 },
    { t: '', d: 90 },
    { t: 'Démarrage terminé en 1.84 s — bienvenue, <name>.', d: 210 },
    { t: 'Le terrain t’attend. Tape « objectif » une fois sur le poste.', d: 180 }
  ];

  function printBoot(name) {
    const log = $('setupBootLog');
    const fill = $('setupBootMeterFill');
    log.textContent = '';
    if (fill) fill.style.width = '0%';
    let elapsed = 0;
    state.bootDone = null;
    return new Promise(resolve => {
      state.bootDone = resolve;
      BOOT_LINES.forEach((line, index) => {
        elapsed += line.d;
        state.bootTimer = setTimeout(() => {
          log.textContent += line.t.replace('<name>', name) + '\n';
          log.scrollTop = log.scrollHeight;
          if (fill) fill.style.width = Math.round(((index + 1) / BOOT_LINES.length) * 100) + '%';
          if (line === BOOT_LINES[BOOT_LINES.length - 1]) {
            state.bootTimer = setTimeout(finishBoot, 700);
          }
        }, elapsed);
      });
    });
  }

  function finishBoot() {
    if (state.bootTimer) { clearTimeout(state.bootTimer); state.bootTimer = null; }
    const done = state.bootDone;
    state.bootDone = null;
    if (done) done();
  }

  // -------------------------------------------------- OUVERTURE
  function open(config) {
    state.config = config;
    state.attempts = 0;
    state.priorFocus = document.activeElement;
    const overlay = $('setup');
    if (!overlay) throw new Error('Écran de configuration introuvable.');
    state.open = true;
    if (global.LabyPause) global.LabyPause.poser('setup');
    if (APP()) APP().inert = true;
    overlay.hidden = false;
    document.addEventListener('keydown', onKeydown, true);
    if (config.mode === 'unlock') {
      $('setupUnlockName').textContent = (config.profile && config.profile.nom) || 'joueur';
      $('setupUnlockPass').value = '';
      setError('setupUnlockError', '');
      $('setupForgot').setAttribute('aria-expanded', 'false');
      $('setupWipeZone').hidden = true;
      $('setupWipeConfirm').value = '';
      $('setupWipeBtn').disabled = true;
      showStage('unlock');
    } else {
      $('setupName').value = config.suggestedName || '';
      $('setupPass').value = '';
      $('setupPass2').value = '';
      setError('setupError', '');
      showStage('form');
    }
    return new Promise(resolve => { state.resolve = resolve; });
  }

  function close(result) {
    state.open = false;
    if (global.LabyPause) global.LabyPause.lever('setup');
    const overlay = $('setup');
    overlay.hidden = true;
    if (APP()) APP().inert = false;
    document.removeEventListener('keydown', onKeydown, true);
    const resolve = state.resolve;
    state.resolve = null;
    const focus = state.priorFocus && state.priorFocus.isConnected ? state.priorFocus : $('cmd');
    if (focus && typeof focus.focus === 'function') focus.focus();
    state.priorFocus = null;
    if (resolve) resolve(result);
  }

  // -------------------------------------------------- CÂBLAGE
  function wire() {
    const form = $('setupForm');
    form.addEventListener('submit', e => {
      e.preventDefault();
      const name = $('setupName').value.trim();
      const pass = $('setupPass').value;
      const pass2 = $('setupPass2').value;
      if (!NAME.test(name) || name === 'root') {
        return setError('setupError', 'Nom invalide : 2–24 caractères, minuscules, chiffres, « - » ou « _ » ; il doit commencer par une lettre et ne pas être « root ».');
      }
      if (pass.length < 4) return setError('setupError', 'Le mot de passe fictif doit contenir au moins 4 caractères.');
      if (pass !== pass2) return setError('setupError', 'Les deux mots de passe ne correspondent pas.');
      setError('setupError', '');
      $('setupRecapName').textContent = name;
      $('setupRecapPass').textContent = '•'.repeat(Math.min(pass.length, 24));
      showStage('confirm');
    });

    $('setupEdit').addEventListener('click', () => showStage('form'));

    $('setupConfirm').addEventListener('click', async () => {
      const name = $('setupName').value.trim();
      const pass = $('setupPass').value;
      const result = await busy($('setupConfirm'), 'ENREGISTREMENT…', async () => {
        if (typeof state.config.onCreate !== 'function') return { ok: false, error: 'Création du profil indisponible.' };
        return state.config.onCreate(name, pass);
      });
      if (!result || !result.ok) {
        showStage('form');
        setError('setupError', (result && result.error) || 'Le profil n’a pas pu être créé.');
        return;
      }
      // Journal de démarrage, puis fermeture.
      showStage('boot');
      await printBoot(name);
      close('done');
    });

    const bootStage = document.querySelector('[data-setup-stage="boot"]');
    bootStage.addEventListener('click', finishBoot);

    const unlockForm = $('setupUnlockForm');
    unlockForm.addEventListener('submit', async e => {
      e.preventDefault();
      const pass = $('setupUnlockPass').value;
      const ok = await busy($('setupUnlockBtn'), 'VÉRIFICATION…', async () => {
        if (typeof state.config.onUnlock !== 'function') return false;
        return !!(await state.config.onUnlock(pass));
      });
      if (ok) {
        showStage('boot');
        await printBoot((state.config.profile && state.config.profile.nom) || 'joueur');
        close('done');
        return;
      }
      state.attempts += 1;
      $('setupUnlockPass').value = '';
      setError('setupUnlockError', state.attempts >= 3
        ? `Mot de passe refusé (essai ${state.attempts}). Si tu l’as oublié, aucun secours n’existe : seule une remise à zéro ouvre une nouvelle partie.`
        : `Mot de passe refusé (essai ${state.attempts}).`);
      $('setupUnlockPass').focus();
    });

    $('setupForgot').addEventListener('click', () => {
      const zone = $('setupWipeZone');
      const openZone = zone.hidden;
      zone.hidden = !openZone;
      $('setupForgot').setAttribute('aria-expanded', String(openZone));
      if (openZone) $('setupWipeConfirm').focus();
    });
    $('setupWipeConfirm').addEventListener('input', e => {
      $('setupWipeBtn').disabled = e.target.value.trim().toUpperCase() !== 'EFFACER';
    });
    $('setupWipeBtn').addEventListener('click', async () => {
      if (typeof state.config.onWipe === 'function') await state.config.onWipe();
      close('wiped');
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();

  function run(config) {
    if (state.open) return Promise.resolve('done');
    return open(config);
  }

  global.LabySetup = { run, isOpen };
})(typeof window !== 'undefined' ? window : globalThis);
