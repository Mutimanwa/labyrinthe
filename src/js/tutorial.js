/* =====================================================================
   Guide initial — accompagne les premières actions sans bloquer le jeu.
   Les étapes avancent sur des actions effectivement réussies ; aucun
   logiciel ni réseau extérieur n'est utilisé. Le guide est facultatif.
   ===================================================================== */
(function (global) {
  'use strict';

  const $ = id => document.getElementById(id);
  const game = () => global.LABYRINTHE && global.LABYRINTHE.game;
  const steps = [
    {
      title: '1 · Trouver ses repères',
      text: 'À droite, le terminal attend tes commandes. Commence par afficher ton dossier courant.',
      command: 'pwd',
      hint: 'Saisis la commande puis appuie sur Entrée.',
      done: (g, cmd, code) => code === 0 && /^pwd\s*$/.test(cmd || '')
    },
    {
      title: '2 · Découvrir le réseau',
      text: 'La carte centrale montre les machines connues. Cherche les voisins de ton poste.',
      command: 'nmap -sn 10.10.0.0/24',
      hint: 'Le scan fait apparaître ACADEMIE sur la carte.',
      done: g => !!(g.world.node('academie') && g.world.node('academie').discovered)
    },
    {
      title: '3 · Ouvrir une session',
      text: 'Connecte-toi au serveur de formation avec SSH. Quand le terminal demande un mot de passe, saisis joueur.',
      command: 'ssh joueur@10.10.0.1',
      hint: 'La connexion et le mot de passe sont entièrement simulés.',
      done: g => g.world.current === 'academie' && g.events.some(e => e.type === 'ssh' && e.target === 'academie')
    },
    {
      title: '4 · Explorer les fichiers',
      text: 'Tu es sur ACADEMIE. Liste les notes disponibles dans le dossier de cours.',
      command: 'ls /home/cours',
      hint: 'ls affiche le contenu d’un dossier.',
      done: (g, cmd, code) => g.world.current === 'academie' && code === 0 && /^ls(?:\s|$)/.test(cmd || '')
    },
    {
      title: '5 · Lire une note',
      text: 'Ouvre la première note pour apprendre à naviguer dans les dossiers.',
      command: 'cat /home/cours/01_navigation.txt',
      hint: 'cat affiche le contenu d’un fichier.',
      done: g => g.events.some(e => e.type === 'read' && (e.paths || []).some(p => /01_navigation\.txt$/.test(p)))
    },
    {
      title: '6 · Valider le contrat',
      text: 'Le panneau CONTRACT suit tes objectifs. Quand la note est lue, valide ta première mission.',
      command: 'valider',
      hint: 'Tu peux aussi utiliser le bouton VALIDER du panneau.',
      done: g => g.completed.has(1)
    }
  ];

  function state() {
    const g = game();
    if (!g) return null;
    if (!g.tutorial) g.tutorial = { step: 0, hidden: false };
    g.tutorial.step = Math.max(0, Math.min(steps.length, Number(g.tutorial.step) || 0));
    return g.tutorial;
  }

  function currentStep() {
    const g = game(), s = state();
    if (!g || !s || s.step >= steps.length) return null;
    const step = steps[s.step];
    if (s.step === 2 && g.pendingSsh && g.pendingSsh.nodeId === 'academie') {
      return Object.assign({}, step, {
        text: 'Le serveur demande le mot de passe du compte de formation.',
        command: 'joueur',
        hint: 'Saisis ce mot de passe fictif puis appuie sur Entrée.'
      });
    }
    return step;
  }

  function render() {
    const s = state(), panel = $('panelTutorial'), button = $('icoTutorial');
    if (!s || !panel) return;
    panel.hidden = !!s.hidden;
    if (button) button.setAttribute('aria-expanded', String(!panel.hidden));
    if (panel.hidden) return;

    const step = currentStep();
    $('tutorialProgress').textContent = step ? (s.step + 1) + '/' + steps.length : 'TERMINÉ';
    $('tutorialTitle').textContent = step ? step.title : 'Premiers pas accomplis';
    $('tutorialText').textContent = step ? step.text : 'Tu sais découvrir une machine, te connecter et lire une note. La suite t’attend dans CONTRACT.';
    $('tutorialCommand').textContent = step ? step.command : '';
    $('tutorialHint').textContent = step ? step.hint : 'Le guide reste disponible avec le bouton ◎ en haut de l’écran.';
    $('tutorialInsert').textContent = step ? 'INSÉRER' : 'REVOIR';
    $('tutorialSkip').textContent = step ? 'PASSER' : 'FERMER';
  }

  function start() {
    if (!state()) return;
    $('icoTutorial').onclick = () => { const s = state(); s.hidden = !s.hidden; render(); };
    $('tutorialSkip').onclick = () => { state().hidden = true; render(); };
    $('tutorialInsert').onclick = () => {
      const step = currentStep();
      if (!step) { state().step = 0; render(); return; }
      const input = $('cmd');
      input.value = step.command;
      input.focus();
    };
    render();
  }

  function check(cmd, code) {
    const g = game(), s = state();
    if (!g || !s || s.hidden) return;
    // Plusieurs étapes peuvent déjà être remplies après une reprise de partie.
    while (s.step < steps.length && steps[s.step].done(g, cmd, code)) s.step++;
    render();
  }

  global.LabyTutorial = { start, check, refresh: render };
})(typeof window !== 'undefined' ? window : globalThis);
