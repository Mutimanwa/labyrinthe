/* =====================================================================
   ui.js — Poste de travail multi-panneaux, langage visuel Hacknet
   ===================================================================== */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x !== undefined) e.textContent = x; return e; };
  const PROG = window.GamePrograms;
  const E = window.GameEngine;

  // -------------------------------------------------- STOCKAGE SÛR
  const Store = (function () {
    let mem = null, usable = false;
    try { const k = '__t'; window.localStorage.setItem(k, '1'); window.localStorage.removeItem(k); usable = true; }
    catch (e) { usable = false; }
    return {
      persistent: usable,
      get(k) { if (usable) { try { return window.localStorage.getItem(k); } catch (e) { } } return mem && mem.k === k ? mem.v : null; },
      set(k, v) { mem = { k, v }; if (usable) { try { window.localStorage.setItem(k, v); return true; } catch (e) { } } return false; },
      del(k) { mem = null; if (usable) { try { window.localStorage.removeItem(k); } catch (e) { } } }
    };
  })();
  const SAVE_KEY = 'labyrinthe.save.v2';
  const SAVE_SLOT = 'main'; // slot SQLite par défaut (Tauri)

  // -------------------------------------------------- STOCKAGE UNIFIÉ (T21)
  // Tauri/SQLite quand disponible (bureau), localStorage sinon (édition web).
  // Migration v2→v3 : au premier boot Tauri, on importe l'ancienne sauvegarde
  // localStorage dans SQLite si aucun slot n'existe encore.
  const SaveStore = (function () {
    let migrated = false;
    // Les écritures et suppressions Tauri doivent rester ordonnées, notamment
    // lorsqu'une sauvegarde automatique précède une remise à zéro.
    let pending = Promise.resolve();
    function enqueue(operation) {
      const result = pending.then(operation, operation);
      pending = result.catch(() => {});
      return result;
    }
    return {
      async get() {
        await pending;
        if (window.LabyBridge && window.LabyBridge.tauri) {
          const data = await window.LabyBridge.saveRead(SAVE_SLOT);
          if (data !== null && data !== false) return data;
          // Migration v2→v3 : importer depuis localStorage si rien dans SQLite
          if (!migrated) {
            migrated = true;
            const legacy = Store.get(SAVE_KEY);
            if (legacy) {
              await window.LabyBridge.saveWrite(SAVE_SLOT, legacy);
              return legacy;
            }
          }
          return null;
        }
        return Store.get(SAVE_KEY);
      },
      set(data) {
        if (!(window.LabyBridge && window.LabyBridge.tauri)) {
          // Écriture synchrone en web, y compris pendant beforeunload.
          return Promise.resolve(Store.set(SAVE_KEY, data));
        }
        return enqueue(() => window.LabyBridge.saveWrite(SAVE_SLOT, data));
      },
      del() {
        if (!(window.LabyBridge && window.LabyBridge.tauri)) {
          Store.del(SAVE_KEY);
          return Promise.resolve(true);
        }
        return enqueue(async () => {
          const deleted = await window.LabyBridge.saveDelete(SAVE_SLOT);
          if (!deleted) return false;
          // Ne pas réimporter une ancienne sauvegarde au redémarrage Tauri.
          Store.del(SAVE_KEY);
          return true;
        });
      },
      async list() {
        if (window.LabyBridge && window.LabyBridge.tauri) {
          return await window.LabyBridge.saveList();
        }
        return Store.persistent ? [SAVE_KEY] : [];
      },
    };
  })();

  let game = null, cmdHistory = [], histIdx = -1, displayMode = 'connect', editorPath = null;
  let editorNode = null, editorOwner = null;
  let resetInProgress = false;

  // -------------------------------------------------- THÈME
  function applyTheme() {
    const t = game.currentTheme();
    const r = document.documentElement.style;
    r.setProperty('--accent', t.accent); r.setProperty('--dim', t.dim);
    r.setProperty('--bg', t.bg); r.setProperty('--panel', t.panel);
    r.setProperty('--line', t.line); r.setProperty('--txt', t.txt);
    r.setProperty('--hot', t.hot);
  }

  // -------------------------------------------------- TERMINAL
  function say(text, cls) {
    const out = $('termOut');
    for (const line of String(text).split('\n')) out.appendChild(el('div', 'l' + (cls ? ' ' + cls : ''), line));
    trimTerm();
  }
  function trimTerm() {
    const out = $('termOut');
    while (out.children.length > 1400) out.removeChild(out.firstChild);
    const s = $('termScroll'); s.scrollTop = s.scrollHeight;
  }
  // Chemin absolu → chemin « ~ » comme un vrai shell.
  function tildePath(p) {
    const u = game.world.user || 'joueur';
    const home = u === 'root' ? '/root' : '/home/' + u;
    if (p === home) return '~';
    if (p.startsWith(home + '/')) return '~' + p.slice(home.length);
    return p || '/';
  }
  // Le prompt exact, calculé à chaque frappe de commande.
  function promptParts() {
    const n = game.world.target;
    const u = game.world.user || 'joueur';
    const path = tildePath(game.world.cwd);
    const style = game.promptStyle || 'demande';
    if (style === 'kali') return { loc: `┌──(${u}㉿${n.ip})-[${path}]`, end: '└─$' };
    if (style === 'simple') return { loc: '', end: n.ip + '@>' };
    return { loc: `(${n.ip}@㉿${u})-[${path}]`, end: '>' };
  }
  function promptString() {
    const p = promptParts();
    return (p.loc ? p.loc + '\n' : '') + p.end + ' ';
  }
  function echoCmd(cmd) {
    const out = $('termOut');
    const p = promptParts();
    if (p.loc) {
      const l1 = el('div', 'cmdline');
      l1.appendChild(el('b', '', p.loc));
      out.appendChild(l1);
    }
    const row = el('div', 'l echo');
    row.appendChild(el('span', 'pr', p.end + ' '));
    row.appendChild(el('span', '', cmd));
    out.appendChild(row);
  }
  function narrate(lines) { for (const l of lines) say(l); }

  function updatePrompt() {
    const n = game.world.target;
    const p = promptParts();
    const loc = $('promptLoc');
    if (loc) {
      loc.textContent = p.loc;
      loc.parentNode.style.display = p.loc ? '' : 'none';
    }
    $('prompt').textContent = p.end;
    $('locName').textContent = n.name + ' @ ' + n.ip;
    $('locHome').textContent = game.world.home.ip;
    const ct = $('creditsTop');
    if (ct) ct.textContent = (game.credits || 0) + ' cr';
  }

  // -------------------------------------------------- PANNEAU DISPLAY
  const COMPUTER_SVG = `<svg class="computer" width="72" height="62" viewBox="0 0 72 62">
    <g fill="none" stroke="currentColor" stroke-width="2">
      <rect x="6" y="4" width="52" height="36"/><rect x="11" y="9" width="42" height="26"/>
      <path d="M22 40v6h20v-6"/><rect x="12" y="46" width="46" height="8"/>
      <path d="M16 50h30"/><path d="M50 50h4"/>
    </g></svg>`;

  function renderDisplay() {
    const n = game.world.target;
    const b = $('displayBody');
    b.innerHTML = '';
    $('displayTag').textContent = displayMode.toUpperCase();

    if (displayMode === 'ports') return renderPorts(b, n);
    if (displayMode === 'files') return renderFiles(b, n);
    if (displayMode === 'logs') return renderLogs(b, n);
    if (displayMode === 'board') return renderBoard(b, n);
    return renderConnect(b, n);
  }

  function renderConnect(b, n) {
    const dv = el('div', 'dv');
    dv.innerHTML = COMPUTER_SVG;
    const t = el('div', 'dv-title');
    t.appendChild(document.createTextNode('Connected to'));
    t.appendChild(el('b', '', n.name));
    dv.appendChild(t);
    dv.appendChild(el('div', 'dv-ip', '@ ' + n.ip));
    const clear = el('div'); clear.style.clear = 'both'; dv.appendChild(clear);
    if (n.isAdmin) dv.appendChild(el('div', 'dv-banner', 'VOUS ÊTES ADMINISTRATEUR DE CE SYSTÈME'));
    if (n.desc) dv.appendChild(el('div', 'dv-pre', n.desc));

    const acts = el('div', 'dv-actions');
    const mk = (label, cmd, danger) => {
      const btn = el('button', danger ? 'danger' : '', label);
      btn.onclick = () => submit(cmd);
      acts.appendChild(btn);
    };
    mk('nmap -sV (analyser)', 'nmap -sV ' + n.ip);
    mk('ls -la (fichiers)', 'ls -la');
    mk('Journaux /var/log', 'logs');
    mk('nmap -sn (découvrir)', 'nmap -sn ' + n.ip.replace(/\.\d+$/, '.0') + '/24');
    mk('iptables -L -n -v', 'iptables -L -n -v');
    if (n.id === 'academie') mk('Notes de cours', 'cours');
    if (!n.isAdmin && n.id !== game.world.playerId) mk('sudo -l (mes droits)', 'sudo -l');
    if (n.id !== game.world.playerId) mk('exit (fermer la session)', 'exit', true);
    dv.appendChild(acts);
    b.appendChild(dv);
  }

  function renderPorts(b, n) {
    const dv = el('div', 'dv');
    dv.appendChild(el('div', 'dv-title', 'Services exposés'));
    dv.appendChild(el('div', 'dv-ip', n.name + ' @' + n.ip));
    const filtered = n.firewall && !n.firewallDown;
    dv.appendChild(el('div', 'dv-note',
      n.openPorts().length + ' port(s) ouvert(s) · ' +
      (filtered ? 'filtrage actif sur ' + (n.firewall.allow || []).length + ' port(s) autorisé(s)'
                : 'aucun filtrage') +
      ' · session : ' + (n.isAdmin ? 'root' : 'utilisateur')));
    if (filtered) dv.appendChild(el('div', 'dv-banner warn', 'PARE-FEU ACTIF — iptables -L -n -v'));
    if (n.firewall && n.firewallDown) dv.appendChild(el('div', 'dv-banner stripe ok', 'RÈGLES VIDÉES — iptables -F appliqué'));
    if (!n.firewall) dv.appendChild(el('div', 'dv-banner stripe', 'AUCUN FILTRAGE DÉTECTÉ'));
    const SVC = { ssh: 'SSH', ftp: 'FTP Server', http: 'HTTP WebServer', https: 'HTTPS WebServer', smtp: 'SMTP MailServer', mysql: 'SQL Server', postgresql: 'SQL Server', 'http-proxy': 'HTTP Proxy' };
    for (const p of n.openPorts()) {
      const info = n.ports[p];
      const opened = n.crackedPorts.has(p);
      const row = el('div', 'portrow' + (opened ? ' open' : ''));
      row.appendChild(el('span', 'pnum', 'Port#: ' + p));
      row.appendChild(el('span', 'psvc', '- ' + (SVC[info.service] || info.service)));
      const lock = el('span', 'lock');
      lock.innerHTML = opened
        ? '<svg width="14" height="16" viewBox="0 0 14 16"><g fill="none" stroke="#7ee2a8" stroke-width="1.6"><rect x="2" y="7" width="10" height="8" fill="#7ee2a8" stroke="none"/><path d="M4.5 7V4.5a2.5 2.5 0 0 1 5 0"/></g></svg>'
        : '<svg width="14" height="16" viewBox="0 0 14 16"><g fill="none" stroke="#f0d0d0" stroke-width="1.6"><rect x="2" y="7" width="10" height="8" fill="#f0d0d0" stroke="none"/><path d="M4.5 7V4.5a2.5 2.5 0 0 1 5 0V7"/></g></svg>';
      row.appendChild(lock);
      row.style.cursor = 'pointer';
      row.title = opened ? 'Service déjà compromis' : 'Cliquer pour lire la bannière du service';
      row.onclick = () => submit('nc ' + n.ip + ' ' + p);
      dv.appendChild(row);
    }
    if (n.isAdmin) dv.appendChild(el('div', 'dv-banner', 'ACCÈS ADMINISTRATEUR OBTENU'));
    const acts = el('div', 'dv-actions');
    const back = el('button', '', '← Retour'); back.onclick = () => { displayMode = 'connect'; renderDisplay(); };
    acts.appendChild(back);
    if (!n.isAdmin && n.id !== game.world.playerId) {
      const ph = el('button', '', 'sudo -i (devenir root)'); ph.onclick = () => submit('sudo -i'); acts.appendChild(ph);
    }
    dv.appendChild(acts);
    b.appendChild(dv);
  }

  function toolFor(service) {
    // Indique le VRAI outil adapté au service, pour l'info-bulle.
    if (service === 'ssh') return 'hydra -l root -P <wordlist> ssh://';
    if (service === 'ftp') return 'hydra -l anonymous -P <wordlist> ftp://';
    if (service === 'smtp') return 'searchsploit postfix';
    if (['http', 'https', 'http-proxy'].includes(service)) return 'nikto -h';
    if (['mysql', 'postgresql', 'ms-sql-s'].includes(service)) return 'sqlmap -u';
    return 'nmap -sV';
  }

  function renderFiles(b, n) {
    const dv = el('div', 'dv');
    dv.appendChild(el('div', 'dv-title', 'Filesystem'));
    dv.appendChild(el('div', 'dv-ip', n.name + ' : ' + game.world.cwd));
    const acts = el('div', 'dv-actions');
    if (game.world.cwd !== '/') {
      const up = el('button', '', '..'); up.onclick = () => submit('cd ..'); acts.appendChild(up);
    }
    for (const p of n.children(game.world.cwd)) {
      const isDir = n.isDir(p);
      const btn = el('button', '', E.basename(p) + (isDir ? '/' : ''));
      btn.onclick = () => submit(isDir ? 'cd ' + p : 'cat ' + p);
      acts.appendChild(btn);
    }
    if (!n.children(game.world.cwd).length) acts.appendChild(el('div', 'dv-pre', '(dossier vide)'));
    dv.appendChild(acts);
    const back = el('button', '', '← Retour'); back.style.marginTop = '8px';
    back.onclick = () => { displayMode = 'connect'; renderDisplay(); };
    dv.appendChild(back);
    b.appendChild(dv);
  }

  function renderLogs(b, n) {
    const dv = el('div', 'dv');
    dv.appendChild(el('div', 'dv-title', 'Journaux'));
    dv.appendChild(el('div', 'dv-ip', n.name + ' : /var/log'));
    const files = Object.keys(n.files).filter(p => p.startsWith('/var/log/') && n.isFile(p));
    if (!files.length) dv.appendChild(el('div', 'dv-pre', 'Aucun journal. Ils ont peut-être été effacés.'));
    for (const f of files) {
      dv.appendChild(el('div', 'dv-sub', E.basename(f)));
      dv.appendChild(el('div', 'dv-pre', n.files[f].content || '(vide)'));
    }
    const acts = el('div', 'dv-actions');
    const back = el('button', '', '← Retour'); back.onclick = () => { displayMode = 'connect'; renderDisplay(); };
    acts.appendChild(back); dv.appendChild(acts);
    b.appendChild(dv);
  }

  function renderBoard(b, n) {
    const dv = el('div', 'dv');
    dv.appendChild(el('div', 'dv-title', '/lab/ — Entraide LABYRINTHE'));
    dv.appendChild(el('div', 'dv-ip', n.name + ' @' + n.ip));
    const posts = [
      ['Anonyme', 'Quelqu\'un sait pourquoi mon nmap affiche ospf-lite sur le port 8899 ?\nC\'est pas un protocole de routage ça ?'],
      ['Anonyme', '> sans -sV la colonne SERVICE est devinée d\'après le numéro\n> ajoute -sV et tu verras le vrai service\nMerci, c\'était exactement ça.', true],
      ['Anonyme', 'Rappel pour les nouveaux : copie la preuve AVANT d\'effacer les logs.\nJ\'ai perdu un contrat comme ça.'],
      ['Anonyme', '> range(len(ports) + 1)\nClassique. L\'index va un cran trop loin. Retire le + 1.']
    ];
    for (const p of posts) {
      const post = el('div', 'post');
      post.appendChild(el('div', 'who', p[0] + '  01/01/1970(Thu)00:00 UTC+0:0'));
      const txt = el('div', 'txt' + (p[2] ? ' gre' : ''), p[1]);
      post.appendChild(txt);
      dv.appendChild(post);
      dv.appendChild(el('div', 'omitted', '[+] 3 réponses omises'));
    }
    const acts = el('div', 'dv-actions');
    const back = el('button', '', '← Quitter le forum'); back.onclick = () => { displayMode = 'connect'; renderDisplay(); };
    acts.appendChild(back); dv.appendChild(acts);
    b.appendChild(dv);
  }

  // -------------------------------------------------- PANNEAUX PROCESSUS
  function renderProcesses() {
    const stack = $('procStack');
    const live = game.processes.filter(p => !p.cancelled);
    // reconstruire seulement si la liste change
    const sig = live.map(p => p.pid).join(',');
    if (stack.dataset.sig !== sig) {
      stack.dataset.sig = sig;
      stack.innerHTML = '';
      for (const p of live) stack.appendChild(buildProcPanel(p));
    }
    for (const p of live) updateProcPanel(p);
    const used = game.ramUsed();
    $('ramUsed').textContent = used + 'mb';
    $('ramTotal').textContent = game.ramTotal;
    $('ramFree').textContent = game.ramFree();
    $('ramProcs').textContent = live.length;
    const pct = Math.round(100 * used / game.ramTotal);
    const bar = $('ramBar');
    bar.firstElementChild.style.width = pct + '%';
    bar.className = 'rambar' + (pct > 85 ? ' hot' : '');
  }

  function buildProcPanel(p) {
    const wrap = el('div', 'proc');
    wrap.dataset.pid = p.pid;
    const head = el('div', 'phead');
    head.appendChild(el('span', '', 'app:' + p.name));
    head.appendChild(el('span', 'sp'));
    head.appendChild(el('span', '', 'PID ' + p.pid));
    head.title = p.name + ' — PID ' + p.pid + ' — ' + p.ram + ' Mo';
    wrap.appendChild(head);
    const body = el('div', 'pbody');
    body.dataset.role = 'body';
    wrap.appendChild(body);
    const btns = el('div', 'btns');
    const kill = el('button', '', 'Close');
    kill.onclick = () => { game.kill(p.pid); renderProcesses(); };
    btns.appendChild(kill);
    if (!p.persistent) {
      const cancel = el('button', '', 'Cancel');
      cancel.onclick = () => { game.kill(p.pid); say(p.name + ' annulé.', 'warn'); renderProcesses(); };
      btns.appendChild(cancel);
    }
    wrap.appendChild(btns);
    return wrap;
  }

  function updateProcPanel(p) {
    const wrap = $('procStack').querySelector('[data-pid="' + p.pid + '"]');
    if (!wrap) return;
    const body = wrap.querySelector('[data-role="body"]');
    body.innerHTML = '';

    if (p.name === 'Clock' || p.name === 'HexClock') {
      const d = new Date();
      const txt = p.name === 'HexClock'
        ? [d.getHours(), d.getMinutes(), d.getSeconds()].map(x => x.toString(16).padStart(2, '0').toUpperCase()).join(':')
        : d.toTimeString().slice(0, 8);
      body.appendChild(el('div', 'clockface', txt));
      return;
    }
    if (p.name === 'ThemeSwitch') {
      body.appendChild(el('div', 'step', 'Thème : ' + game.currentTheme().name));

      return;
    }
    if (p.name === 'Shell' || p.name === 'fork') {
      body.appendChild(el('div', 'step', p.name === 'fork' ? 'fourche active' : 'shell de secours'));
      body.appendChild(el('div', 'step', p.ram + ' Mo occupés'));
      return;
    }
    if (p.done) {
      const verdict = p.name === 'Hydra'
        ? (p.result && p.result.found ? 'MOT DE PASSE TROUVÉ' : 'AUCUN RÉSULTAT')
        : p.name === 'Metasploit' ? (p.result && p.result.ok ? 'SESSION OUVERTE' : 'EXPLOIT ÉCHOUÉ')
        : 'TERMINÉ';
      body.appendChild(el('div', 'bigword', verdict));
      return;
    }

    const steps = p.spec.steps;
    const idx = p.stepIndex();
    steps.forEach((s, i) => {
      const row = el('div', 'step' + (i > idx ? ' pending' : ''));
      row.appendChild(el('span', '', s + '…'));
      row.appendChild(el('b', '', i < idx ? 'COMPLETE' : i === idx ? Math.round(p.progress * 100) + '%' : ''));
      body.appendChild(row);
    });
    const bar = el('div', 'pbar');
    const fill = el('i'); fill.style.width = Math.round(p.progress * 100) + '%';
    bar.appendChild(fill); body.appendChild(bar);

    // grille de force brute pour les outils de cassage
  }

  // -------------------------------------------------- TRACE
  function renderTrace() {
    const A = window.GameAudio;
    if (A) {
      if (game.trace && !A.alarmTimer) A.startAlarm();
      if (!game.trace && A.alarmTimer) A.stopAlarm();
    }
    const p = $('panelTrace');
    if (game.trace) {
      p.className = 'panel active';
      $('traceNum').textContent = Math.max(0, game.trace.remaining).toFixed(2);
      $('traceNote').textContent = game.traceKillActive()
        ? 'Attaque lente en cours. exit annule la détection.'
        : 'hydra -t 1 ralentit la détection. exit annule.';
    } else {
      p.className = 'panel idle';
      $('traceNum').textContent = '--.--';
      $('traceNote').textContent = game.traceEnabled
        ? 'Aucun traçage. trace off pour le mode serein.'
        : 'Traçage désactivé — mode serein.';
    }
  }

  // -------------------------------------------------- NETMAP
  const LAYOUT = {
    joueur: [45, 88], academie: [135, 88], depot: [135, 148],
    shellLab: [240, 22], shellCoffre: [350, 22],
    codeLab: [240, 56], codeBuild: [350, 56],
    netLab: [240, 90], netFw: [350, 90], netProxy: [445, 90], netInterne: [535, 90],
    secLab: [240, 124], secCible: [350, 124], apiLab: [240, 160],
    relais1: [445, 22], relais2: [535, 22], relais3: [625, 22], puits: [635, 90]
  };
  function renderMap() {
    const svg = $('mapSvg'), w = game.world;
    const known = Object.values(w.nodes).filter(n => n.discovered);
    svg.innerHTML = '';
    const NS = 'http://www.w3.org/2000/svg';
    const mk = (t, a) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); return e; };
    const accent = game.currentTheme().accent;
    for (const n of known) {
      const a = LAYOUT[n.id]; if (!a) continue;
      for (const lid of n.links) {
        const t = w.node(lid); if (!t || !t.discovered) continue;
        const b = LAYOUT[lid]; if (!b) continue;
        svg.appendChild(mk('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: accent, 'stroke-opacity': .28, 'stroke-width': 1 }));
      }
    }
    for (const n of known) {
      let pos = LAYOUT[n.id];
      if (!pos) {   // nœud ajouté par un module : position automatique
        const i = Object.keys(w.nodes).indexOf(n.id);
        pos = [45 + (i % 6) * 90, 190 + Math.floor(i / 6) * 38];
        LAYOUT[n.id] = pos;
      }
      const cur = n.id === w.current;
      const traced = game.trace && game.trace.nodeId === n.id;
      const col = traced ? '#ff2d2d' : n.id === w.playerId ? '#22ff66' : n.isAdmin ? accent : '#7d8b96';
      const g = mk('g', { class: 'node' });
      if (cur) g.appendChild(mk('circle', { cx: pos[0], cy: pos[1], r: 11, fill: 'none', stroke: '#ffffff', 'stroke-width': 1.5, 'stroke-opacity': .85 }));
      if (n.firewall && !n.firewallDown) g.appendChild(mk('circle', { cx: pos[0], cy: pos[1], r: 14, fill: 'none', stroke: '#ff2d2d', 'stroke-width': 1, 'stroke-dasharray': '2,2' }));
      g.appendChild(mk('circle', { cx: pos[0], cy: pos[1], r: 7, fill: cur ? col : 'none', stroke: col, 'stroke-width': 2 }));
      g.appendChild(mk('circle', { cx: pos[0], cy: pos[1], r: 3, fill: col }));
      const lab = mk('text', { x: pos[0], y: pos[1] - 13, 'text-anchor': 'middle', fill: col, class: 'nlabel' });
      lab.textContent = n.name.length > 18 ? n.name.slice(0, 17) + '…' : n.name;
      g.appendChild(lab);
      const title = mk('title', {});
      const estRelais = /^relais[123]$/.test(n.id);
      title.textContent = estRelais
        ? `${n.name} — ${n.ip}\nPoint de passage sans shell. Cliquer pour voir le chenillard.`
        : `${n.name} — ${n.ip}\n${n.isAdmin ? 'admin' : 'pas d\'accès'}\nCliquer pour se connecter`;
      g.appendChild(title);
      g.addEventListener('click', () => submit(estRelais ? 'relais' : cur ? 'nmap -sV ' + n.ip : 'ssh joueur@' + n.ip));
      svg.appendChild(g);
    }
    $('mapCount').textContent = known.length + ' / ' + Object.keys(w.nodes).length;
  }

  // -------------------------------------------------- GUIDE CONTEXTUEL
  function renderGuide() {
    const b = $('guideBody');
    b.innerHTML = '';
    const n = game.world.target;
    const items = [];
    const m = game.mission;
    if (m && m.id <= 4) {
      items.push(['Découvre le réseau avec', 'nmap -sn 10.10.0.0/24']);
      items.push(['Connecte-toi avec', 'ssh joueur@<ip>']);
      items.push(['Lis un fichier avec', 'cat <fichier>']);
      items.push(['Copie une preuve avec', 'scp user@ip:/chemin .']);
    } else if (m && m.id <= 8) {
      items.push(['Exécute du code avec', 'python3 <fichier.py>']);
      items.push(['Teste une expression avec', 'python3 -c "print(7 % 3)"']);
      items.push(['Corrige du texte avec', "sed -i 's/ancien/nouveau/g' <f>"]);
      items.push(['Édite avec', 'editeur']);
    } else if (m && m.id <= 12) {
      items.push(['Vois les vrais services avec', 'nmap -sV']);
      items.push(['Cherche un mot de passe faible :', 'hydra -l root -P <wordlist> ssh://<ip>']);
      items.push(['Lis le filtrage avec', 'iptables -L -n -v']);
      items.push(['Deviens root avec', 'sudo -l  puis  sudo -i']);
    } else {
      items.push(['Décode avec', 'base64 -d <fichier>']);
      items.push(['Audite le web avec', 'nikto -h <ip>']);
      items.push(['Compte tes traces avec', 'grep -c intrusion /var/log/actions.log']);
      items.push(['Dépose une preuve avec', 'scp ./f user@ip:/depot/']);
    }
    if ((game.xp || 0) >= 3000) {
      if (!game.relais.puitsAtteint) items.unshift(['Accède au Puits :', 'relais']);
      else items.unshift(['Explore le Puits :', 'marché']);
    }
    if (n.firewall && !n.firewallDown) items.unshift(['Filtrage actif. Une fois root :', 'iptables -F']);
    if (game.trace) items.unshift(['Détection en cours ! Ferme la session :', 'exit']);
    if (game.ramFree() < 200) items.unshift(['Mémoire basse. Libère avec', 'kill -9 <pid>']);
    for (const [txt, code] of items) {
      const d = el('div', 'guide-item');
      d.appendChild(document.createTextNode(txt + ' '));
      d.appendChild(el('code', '', code));
      b.appendChild(d);
    }
  }

  // -------------------------------------------------- MISSION
  function diffBar(d) {
    const w = el('span', 'diff');
    for (let i = 1; i <= 5; i++) w.appendChild(el('span', i <= d ? '' : 'off', '◆'));
    return w;
  }

  function renderMission() {
    const b = $('missionBody'); b.innerHTML = '';
    const m = game.mission;
    const prog = el('div', 'mprogress');
    for (let i = 1; i <= window.Campaign.MISSIONS.length; i++) prog.appendChild(el('i', game.completed.has(i) ? 'done' : (m && m.id === i ? 'cur' : '')));
    b.appendChild(prog);
    if (!m) {
      $('missionTag').textContent = 'TERMINÉ';
      b.appendChild(el('div', 'mt', 'Cursus complet'));
      b.appendChild(el('div', 'mb', window.Campaign.MISSIONS.length + ' contrats sur ' + window.Campaign.MISSIONS.length + '.\n\nCrédits : ' + (game.credits || 0) + '\nTape "stats" pour ton bilan, "contrats" pour la liste.'));
      refreshStatus(); return;
    }
    $('missionTag').textContent = m.id + ' / ' + window.Campaign.MISSIONS.length;

    // En-tête de contrat : client, nature, prime, difficulté.
    const head = el('div', 'chead');
    const r1 = el('div', 'crow');
    r1.appendChild(el('span', 'cl', 'Client'));
    r1.appendChild(el('span', 'cv', m.client || '—'));
    head.appendChild(r1);
    const r2 = el('div', 'crow');
    r2.appendChild(el('span', 'cl', m.kind || 'Contrat'));
    const pay = el('span', 'pay', (m.reward || 0) + ' cr');
    r2.appendChild(pay);
    head.appendChild(r2);
    const r3 = el('div', 'crow');
    r3.appendChild(el('span', 'cl', 'Difficulté'));
    r3.appendChild(diffBar(m.difficulty || 1));
    head.appendChild(r3);
    b.appendChild(head);

    b.appendChild(el('div', 'mm', m.module));
    b.appendChild(el('div', 'mt', m.titre));

    // Objectifs vérifiés en direct sur l'état du monde.
    if (m.objectives && m.objectives.length) {
      const box = el('div', 'objs');
      for (const o of m.objectives) {
        let done = false;
        try { done = !!o.done(game.world, game.shell, game.events, game); } catch (e) { done = false; }
        const row = el('div', 'obj' + (done ? ' done' : ''));
        row.appendChild(el('span', 'box', done ? '✓' : ''));
        row.appendChild(el('span', '', o.label));
        box.appendChild(row);
      }
      b.appendChild(box);
    }

    b.appendChild(el('div', 'mb', m.brief));
    const btns = el('div', 'mbtns');
    const v = el('button', 'pri', 'VALIDER');
    v.onclick = () => { const i = $('answerInput'); submit('valider' + (i && i.value.trim() ? ' ' + i.value.trim() : '')); if (i) i.value = ''; };
    const h = el('button', '', 'INDICE'); h.onclick = () => submit('indice');
    const c = el('button', '', 'COURS'); c.onclick = () => m.cours ? openCourse(m.cours) : openCourseIndex();
    btns.appendChild(v); btns.appendChild(h); btns.appendChild(c);
    b.appendChild(btns);
    const inp = el('input', m.needsAnswer ? '' : 'hidden');
    inp.id = 'answerInput'; inp.placeholder = 'réponse';
    inp.onkeydown = e => { if (e.key === 'Enter') v.click(); };
    b.appendChild(inp);
    const st = el('div', 'mstatus'); st.id = 'missionStatus';
    b.appendChild(st);
    refreshStatus();
  }

  // -------------------------------------------------- TABLEAU DES CONTRATS
  function openContracts() {
    const body = $('contractsBody'); body.innerHTML = '';
    $('cCredits').textContent = game.credits || 0;
    $('cDone').textContent = game.completed.size + ' / ' + window.Campaign.MISSIONS.length;
    for (const m of window.Campaign.MISSIONS) {
      const done = game.completed.has(m.id);
      const cur = game.mission && game.mission.id === m.id;
      const card = el('div', 'ccard' + (done ? ' done' : cur ? ' cur' : ' lock'));
      card.appendChild(el('div', 'ck', String(m.id).padStart(2, '0') + ' · ' + (m.kind || m.module)));
      card.appendChild(el('div', 'ct', m.titre));
      card.appendChild(el('div', 'cc', m.client || '—'));
      const d = el('div', 'crow');
      d.appendChild(el('span', 'cl', m.module));
      d.appendChild(diffBar(m.difficulty || 1));
      card.appendChild(d);
      const f = el('div', 'cf');
      f.appendChild(el('span', 'cp', (m.reward || 0) + ' cr'));
      f.appendChild(el('span', 'cs ' + (done ? 'ok' : cur ? 'now' : 'no'),
        done ? '✓ payé' : cur ? '● en cours' : 'verrouillé'));
      card.appendChild(f);
      if (cur) { card.style.cursor = 'pointer'; card.onclick = closeContracts; }
      body.appendChild(card);
    }
    $('contracts').classList.add('open');
  }
  function closeContracts() { $('contracts').classList.remove('open'); }

  function refreshStatus() {
    const st = $('missionStatus');
    const m = game.mission;
    if (st) {
      if (!m) { st.textContent = `Cursus complet — ${window.Campaign.MISSIONS.length}/${window.Campaign.MISSIONS.length}.`; st.className = 'mstatus ok'; }
      else {
        const r = game.checkMission();
        st.textContent = r.done ? '✓ Objectif atteint — clique VALIDER' : (r.hint || 'En cours…');
        st.className = 'mstatus' + (r.done ? ' ok' : '');
      }
    }
    $('displayTag').textContent = displayMode.toUpperCase();
  }

  // -------------------------------------------------- EXÉCUTION
  function submit(raw, fromInput) {
    const cmd = raw.trim();
    if (!cmd || resetInProgress) return;
    // Le mot de passe SSH est une réponse au prompt, pas une commande :
    // il ne doit ni être affiché ni ajouté à l'historique du terminal.
    if (game.pendingSsh) {
      if (!fromInput) { say('Termine la connexion SSH ou appuie sur Échap pour l’annuler.', 'warn'); return; }
      const res = game.trySshPassword(cmd);
      $('cmd').type = 'text';
      if (res.out && res.out.startsWith('__NARRATE__')) {
        try { narrate(JSON.parse(res.out.slice('__NARRATE__'.length))); } catch (e) { say(res.out); }
      } else if (res.out) say(res.out, res.code === 0 ? '' : 'err');
      updatePrompt();
      return afterCmd('ssh', res.code);
    }
    cmdHistory.push(cmd); histIdx = cmdHistory.length;
    echoCmd(cmd);

    if (cmd === 'exporter') return exportSave();
    if (cmd === 'importer') { if (native()) importNative(); else $('fileInput').click(); return; }
    if (cmd === 'cours') return openCourseIndex();
    if (cmd === 'editeur' || cmd === 'éditeur') return openEditor(null);
    if (/^(editeur|éditeur|edit)\s+/.test(cmd)) return openEditor(cmd.replace(/^(editeur|éditeur|edit)\s+/, '').trim());
    if (cmd === 'reset oui' || cmd === 'reset!') { resetGame(true); return; }
    if (cmd === 'logs' || cmd === 'logview') { displayMode = 'logs'; renderDisplay(); say('Affichage des journaux dans DISPLAY.'); return; }
    if (cmd === 'forum') { displayMode = 'board'; renderDisplay(); say('Forum affiché dans DISPLAY.'); return; }
    if (cmd === 'contrats' || cmd === 'contracts') { openContracts(); say('Tableau des contrats ouvert.'); return; }
    if (cmd === 'intro' || cmd === 'introduction') { if (window.LabyIntro) window.LabyIntro.open(); return; }
    if (cmd === 'profil') { if (window.LabyProfile) { window.LabyProfile.open(); } return; }
    if (cmd === 'mail' || cmd === 'poste') { if (window.LabyMail) { window.LabyMail.open(); } return; }
    if (cmd === 'echo' || cmd === 'bruit') { if (window.LabyEcho) say(window.LabyEcho.rapport(game)); return; }
    if (cmd === 'aide' || cmd === '?') { renderGuide(); say(Object.keys(window.GamePrograms.PROGRAMS).join(', ')); return; }

    const r = game.shell.exec(cmd);
    let out = r.out || '';

    if (out.startsWith('__SSHPASS__')) {
      const d = JSON.parse(out.slice('__SSHPASS__'.length));
      say(`${d.user}@${d.host}'s password: `, 'dim');
      const loc = $('promptLoc'); if (loc) loc.parentNode.style.display = 'none';
      $('prompt').textContent = 'password:';
      $('cmd').type = 'password';
      if (window.LabyTutorial) window.LabyTutorial.refresh();
      return;
    }

    // Exécution asynchrone de code JS/TS : on attend la fin du programme.
    if (out.startsWith('__ASYNC__')) {
      const job = JSON.parse(out.slice('__ASYNC__'.length));
      say('… exécution', 'dim');
      game.runWebFile(job.arg, job.runner).then(res => {
        say(res.out, res.code === 0 ? '' : 'err');
        if (window.GameAudio) res.code === 0 ? window.GameAudio.ok() : window.GameAudio.err();
        afterCmd(job.runner);
        refreshStatus(); renderMission();
      }).catch(e => { say('erreur d\'exécution : ' + e, 'err'); afterCmd(); });
      return;
    }
    if (out.startsWith('__CLEAR__')) { $('termOut').innerHTML = ''; return afterCmd(); }
    if (out.startsWith('__NARRATE__')) {
      try { narrate(JSON.parse(out.slice('__NARRATE__'.length))); } catch (e) { say(out); }
      out = '';
    }
    if (out.startsWith('__PROC__')) { renderProcesses(); return afterCmd(); }
    if (out.startsWith('__MISSION_DONE__')) { missionDone(JSON.parse(out.slice('__MISSION_DONE__'.length))); return afterCmd(); }
    if (out.startsWith('__SAVE__')) {
      SaveStore.set(out.slice('__SAVE__'.length)).then(ok => {
        if (!ok) return say('Sauvegarde impossible sur ce support.', 'err');
        const support = window.LabyBridge && window.LabyBridge.tauri ? 'SQLite' : 'localStorage';
        say(`Partie sauvegardée (${support}).`, 'ok');
      });
      return afterCmd();
    }
    if (out === '__LOAD__') { loadSave(); return afterCmd(); }
    if (out === '__RESET__') { resetGame(); return afterCmd(); }
    if (out.startsWith('__EDIT_HOME__')) { openEditor(out.slice('__EDIT_HOME__'.length), game.world.home); return afterCmd(); }
    if (out.startsWith('__EDIT__')) { openEditor(out.slice('__EDIT__'.length)); return afterCmd(); }
    if (out) say(out, r.code === 0 ? '' : 'err');
    playFor(cmd.split(/\s+/)[0], r.code);
    afterCmd(cmd, r.code);
  }

  function playFor(head, code) {
    const A = window.GameAudio;
    if (!A || !A.enabled) return;
    if (head === 'ssh' || head === 'sshpass') { code === 0 ? A.connect() : A.denied(); return; }
    if (head === 'exit' || head === 'logout') { A.disconnect(); return; }
    if (head === 'nmap' || head === 'arp-scan') { A.scan(); return; }
    if (head === 'hydra' || head === 'msfconsole') { A.progress(); return; }
    if (code !== 0) A.err(); else A.enter();
  }

  function afterCmd(cmd, code) {
    if (window.LabyTutorial) window.LabyTutorial.check(cmd, code);
    if (cmd) {
      const head = cmd.split(/\s+/)[0];
      if (head === 'nmap' || head === 'iptables' || head === 'ufw') displayMode = 'ports';
      else if (head === 'ls' || head === 'cd' || head === 'tree') displayMode = 'files';
      else if (head === 'ssh' || head === 'sshpass' || head === 'exit' || head === 'logout') displayMode = 'connect';
      else if (head === 'sudo' || head === 'hydra' || head === 'msfconsole') displayMode = 'ports';
    }
    applyTheme(); updatePrompt(); renderDisplay(); renderMap();
    renderProcesses(); renderTrace(); renderGuide(); renderMission();
    trimTerm();
  }

  function missionDone(d) {
    say('------------------------------------', 'rule');
    say(`MISSION ${d.id} RÉUSSIE — ${d.titre}`, 'ok big');
    say(`+${d.gained} points${d.speedBonus ? ` (dont ${d.speedBonus} de rapidité)` : ''}   Total : ${d.score} · +${d.xpGained} xp`, 'ok');
    if (d.reward) say(`Prime versée : ${d.reward} crédits   Solde : ${d.credits} cr`, 'ok');
    if (window.GameAudio) window.GameAudio.contract();
    say('------------------------------------', 'rule');
    say(d.debrief, 'debrief');
    if (d.next) say(`→ Contrat suivant : ${d.next.id}. ${d.next.titre} [${d.next.module}]`, 'sect');
    else say('CURSUS COMPLET. Tape fin pour découvrir ton issue.', 'ok big');
    renderMission(); autoSave();
  }

  // -------------------------------------------------- COURS / ÉDITEUR
  const TITLES = {
    '01_navigation': '1. Naviguer dans un shell', '02_fichiers': '2. Manipuler des fichiers',
    '03_filtres': '3. Filtrer et combiner', '04_permissions': '4. Permissions et journaux',
    '05_variables': '5. Variables et types', '06_boucles': '6. Conditions et boucles',
    '07_structures': '7. Listes, dicts, fonctions', '08_debogage': '8. Déboguer',
    '09_ports': '9. Ports et services', '10_parefeu': '10. Pare-feu',
    '11_routage': '11. Routage et pivoting', '12_methodologie': '12. Méthodologie d\'audit',
    '13_chiffrement': '13. Chiffrement, hachage, encodage', '14_traces': '14. Traces et attribution',
    '15_secrets': '15. Chasse aux secrets', '16_ethique': '16. Le cadre légal'
  };
  function openCourse(path) {
    const f = game.world.node('academie').get(path);
    if (!f) { say('Note introuvable : ' + path, 'err'); return; }
    $('readerTitle').textContent = TITLES[path.split('/').pop().replace('.txt', '')] || path;
    $('readerBody').textContent = f.content;
    $('reader').classList.add('open');
    game.record('read', { paths: [path] });
    refreshStatus();
  }
  function openCourseIndex() {
    $('readerTitle').textContent = 'Notes de cours — 16 chapitres';
    const b = $('readerBody'); b.textContent = '';
    const list = el('div', 'course-list');
    for (const k in TITLES) {
      const btn = el('button', 'course-item', TITLES[k]);
      btn.onclick = () => openCourse('/home/cours/' + k + '.txt');
      list.appendChild(btn);
    }
    b.appendChild(list);
    $('reader').classList.add('open');
  }
  function openEditor(path, target) {
    const n = target || game.world.target;
    if (!path) {
      const f = Object.keys(n.files).filter(p => n.isFile(p) && /\.(py|tsx?|jsx?)$/.test(p));
      path = f[0] || '/home/joueur/nouveau.py';
    }
    path = game.shell.resolve(path);
    editorPath = path;
    editorNode = n;
    editorOwner = n === game.world.home ? 'joueur' : game.world.user;
    const f = n.get(path);
    $('editorPath').textContent = n.name + ' : ' + path;
    $('editorText').value = f ? f.content : '';
    $('editorResult').textContent = '';
    $('editor').classList.add('open');
    $('editorText').focus();
  }
  function saveEditor() {
    editorNode.addFile(editorPath, $('editorText').value, { owner: editorOwner });
    game.record('write', { path: editorPath, target: editorNode.id });
    $('editorResult').textContent = 'Enregistré : ' + editorPath;
    $('editorResult').className = 'ed-result ok';
    refreshStatus();
  }
  function runEditor() {
    saveEditor();
    // Un fichier .ts/.tsx/.js part dans le moteur JavaScript, pas Python.
    if (/\.(tsx?|jsx?)$/.test(editorPath)) {
      $('editorResult').textContent = '… exécution';
      $('editorResult').className = 'ed-result';
      game.runWebFile(editorPath, 'tsx').then(res => {
        $('editorResult').textContent = res.out;
        $('editorResult').className = 'ed-result ' + (res.code === 0 ? 'ok' : 'err');
        if (window.GameAudio) res.code === 0 ? window.GameAudio.ok() : window.GameAudio.err();
        refreshStatus(); renderMission();
      }).catch(e => {
        $('editorResult').textContent = 'erreur : ' + e;
        $('editorResult').className = 'ed-result err';
      });
      return;
    }
    const res = window.PyInterp.run($('editorText').value);
    if (res.ok) {
      $('editorResult').textContent = '-- Exécution réussie --\n' + (res.output || '(aucune sortie)');
      $('editorResult').className = 'ed-result ok';
      game.record('python', { path: editorPath, ok: true, output: res.output });
    } else {
      $('editorResult').textContent = `-- ${res.kind} --\n${res.message}${res.line ? '\nligne ' + res.line : ''}` + (res.output ? '\n\nSortie avant l\'erreur :\n' + res.output : '');
      $('editorResult').className = 'ed-result err';
      game.record('python', { path: editorPath, ok: false, kind: res.kind });
    }
    refreshStatus();
  }

  // -------------------------------------------------- SAUVEGARDE
  function autoSave() {
    if (!resetInProgress && game) {
      if (window.LabyIntro) window.LabyIntro.checkpoint();
      SaveStore.set(game.serialize());
    }
  }
  // Dans la coque native Tauri, on écrit un VRAI fichier sur le disque.
  // Dans un navigateur, on retombe sur le téléchargement classique.
  function native() {
    return window.LabyBridge && window.LabyBridge.tauri && window.__TAURI__ && window.__TAURI__.core
      ? window.__TAURI__ : null;
  }
  async function exportNative(data) {
    const T = native();
    try {
      // Le dialogue et l'écriture sont réalisés ensemble côté Rust, sans
      // exposer au jeu une commande d'accès arbitraire au système de fichiers.
      const path = await T.core.invoke('export_save', { contents: data });
      if (!path) { say('Export annulé.'); return true; }
      say('Sauvegarde écrite sur le disque : ' + path, 'ok');
      return true;
    } catch (e) { say('Export natif impossible : ' + e, 'err'); return false; }
  }
  // Une sauvegarde peut être syntaxiquement valide mais contenir un état
  // incohérent. En cas d'échec, rétablir la partie avant l'import.
  function restoreSafely(data) {
    if (window.LabyIntro) window.LabyIntro.checkpoint();
    const previous = game.serialize();
    try {
      game.restore(data);
      $('cmd').type = 'text';
      fullRender();
      if (window.LabyIntro) window.LabyIntro.sync();
    } catch (error) {
      let changed = true;
      try { changed = game.serialize() !== previous; } catch (_) { /* état partiellement restauré */ }
      if (changed) {
        try { game.restore(previous); fullRender(); if (window.LabyIntro) window.LabyIntro.sync(); }
        catch (rollbackError) { throw new Error(error.message + ' (retour à la partie précédente impossible : ' + rollbackError.message + ')'); }
      }
      throw error;
    }
  }

  async function importNative() {
    const T = native();
    try {
      const data = await T.core.invoke('import_save');
      if (data === null) { say('Import annulé.'); return true; }
      restoreSafely(data); say('Sauvegarde importée.', 'ok');
      return true;
    } catch (e) { say('Import natif impossible : ' + e, 'err'); return false; }
  }

  function exportSave() {
    const data = game.serialize();
    if (native()) { exportNative(data); return; }
    try {
      const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
      const a = document.createElement('a');
      a.href = url; a.download = 'labyrinthe-sauvegarde.json';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      say('Sauvegarde exportée : labyrinthe-sauvegarde.json', 'ok');
    } catch (e) { say('Téléchargement indisponible. Copie ce texte :', 'err'); say(data); }
  }
  async function loadSave() {
    const d = await SaveStore.get();
    if (!d) { say('Aucune sauvegarde trouvée.', 'err'); return; }
    try {
      restoreSafely(d);
      const support = window.LabyBridge && window.LabyBridge.tauri ? 'SQLite' : 'localStorage';
      say(`Partie restaurée (${support}).`, 'ok');
    } catch (e) { say('Sauvegarde illisible : ' + e.message, 'err'); }
  }
  async function resetGame(force) {
    // En iframe sandboxée sans allow-modals, confirm() est indisponible :
    // on retombe sur une confirmation tapée plutôt que de planter.
    if (!force) {
      let ok = null;
      try { ok = window.confirm('Recommencer depuis le début ?'); }
      catch (e) { ok = null; }
      if (ok === null) { say('Confirmation indisponible ici. Tape "reset oui" pour confirmer.', 'warn'); return; }
      if (!ok) { say('Annulé.'); return; }
    }
    resetInProgress = true; // beforeunload ne doit pas recréer l'ancienne partie.
    try {
      if (!await SaveStore.del()) {
        resetInProgress = false;
        say('Impossible de supprimer la sauvegarde. La partie actuelle est conservée.', 'err');
        return;
      }
      // Un nouveau document réinitialise proprement horloge, PNJ et abonnements.
      window.location.reload();
    } catch (e) {
      resetInProgress = false;
      say('Remise à zéro impossible : ' + e.message, 'err');
    }
  }
  function fullRender() {
    applyTheme(); updatePrompt(); renderDisplay(); renderMap();
    renderProcesses(); renderTrace(); renderGuide(); renderMission();
    if (window.LabyTutorial) window.LabyTutorial.refresh();
  }

  // -------------------------------------------------- COMPLÉTION
  const COMMANDS = ['help', 'vraies', 'ls', 'cd', 'pwd', 'cat', 'head', 'tail', 'touch', 'mkdir',
    'rm', 'mv', 'cp', 'echo', 'sed', 'chmod', 'wc', 'grep', 'find', 'tree', 'file',
    'python3', 'nmap', 'nc', 'ncat', 'curl', 'nikto', 'sqlmap', 'searchsploit', 'hydra',
    'msfconsole', 'ssh', 'sshpass', 'exit', 'logout', 'scp', 'sudo', 'id', 'whoami',
    'iptables', 'ufw', 'ps', 'kill', 'free', 'ss', 'netstat', 'ip', 'ifconfig', 'ping',
    'traceroute', 'arp-scan', 'uname', 'history', 'shred', 'clear', 'date', 'env',
    'base64', 'sha256sum', 'xxd', 'strings', 'openssl', 'john', 'exe',
    'objectif', 'indice', 'valider', 'stats', 'cours', 'editeur', 'sauver', 'charger',
    'exporter', 'importer', 'reset', 'intro', 'trace', 'logs', 'logview', 'forum', 'sshd', 'honeypot', 'vols', 'rapport', 'soumettre', 'relais', 'marche', 'marché', 'run', 'gardien', 'tache-noire', 'tâche-noire', 'fin'];

  function complete(input) {
    const val = input.value, parts = val.split(/\s+/), box = $('suggest');
    box.innerHTML = '';
    if (!val || parts.length > 2) { box.classList.remove('open'); return; }
    let matches = [];
    if (parts.length === 1) matches = COMMANDS.filter(c => c.startsWith(val)).slice(0, 10);
    else {
      const frag = parts[1];
      const dir = frag.includes('/') ? frag.slice(0, frag.lastIndexOf('/') + 1) : '';
      const base = frag.slice(dir.length);
      const n = game.world.target;
      const abs = E.normPath(game.world.cwd, dir || '.');
      matches = n.children(abs).map(p => E.basename(p) + (n.isDir(p) ? '/' : ''))
        .filter(x => x.startsWith(base)).slice(0, 10).map(x => parts[0] + ' ' + dir + x);
    }
    if (!matches.length) { box.classList.remove('open'); return; }
    for (const m of matches) {
      const b = el('button', 'sug', m);
      b.onclick = () => { input.value = m + (m.endsWith('/') ? '' : ' '); box.classList.remove('open'); input.focus(); };
      box.appendChild(b);
    }
    box.classList.add('open');
  }

  // -------------------------------------------------- DÉMARRAGE
  function newGame() {
    game = new window.GameCore.Game();
    PROG.install(game, {
      traceEnabled: false,
      onChange: () => { },
      onProcessDone: () => { fullRender(); },
      onTraceEnd: () => { fullRender(); }
    });
    window.RealCommands.install(game);
    window.GameAudio.install(game);
    window.WebDev.install(game);
    // Poignée publique : permet de modder et d'inspecter la partie depuis
    // la console du navigateur.  LABYRINTHE.game.world.node('netLab')…
    window.LABYRINTHE = {
      game: game,
      programs: PROG.PROGRAMS,
      themes: PROG.THEMES,
      missions: window.Campaign.MISSIONS,
      render: () => fullRender()
    };
    // router le journal narratif vers le terminal
    const origSay = game.say.bind(game);
    game.say = function (text, cls) { origSay(text, cls); if (String(text).length) say(text, cls); trimTerm(); };
  }

  async function boot(fresh) {
    const saved = fresh ? null : await SaveStore.get();
    let restored = false;
    if (saved) {
      try {
        restoreSafely(saved);
        restored = true;
        say('Partie précédente restaurée. Tape "objectif" pour reprendre.', 'ok'); say('');
      } catch (e) {
        say('Sauvegarde précédente illisible : ' + e.message + '. Une nouvelle partie est ouverte.', 'warn');
      }
    }
    if (!restored) {
      say('====================================', 'rule');
      say('  L A B Y R I N T H E', 'ok big');
      say('  Shell · Python réel · Réseau · Cybersécurité', 'dim');
      say('====================================', 'rule');
      say('');
      say('Tout est simulé dans ton navigateur. Rien ne sort d\'ici.', 'dim');
      say('');
      say('POUR COMMENCER', 'sect');
      say('  objectif      ta première mission');
      say('  cours         les 16 notes de cours');
      say('  exe           les vrais outils disponibles');
      say('  vraies        anciennes commandes fictives → vraies');
      say('  help          toutes les commandes');
      say('');
      say('Le panneau CONTRACT à droite suit ta progression.', 'dim');
      say('trace off  → mode serein, sans compte à rebours.', 'dim');
      say('');
    }
    if (!Store.persistent) {
      say('Stockage local bloqué dans cet aperçu : utilise "exporter".', 'warn');
      say('');
    }
    fullRender();
    if (window.LabyTutorial) window.LabyTutorial.start();
    if (window.LabyIntro) window.LabyIntro.start({ onChange: autoSave });
  }

  async function init() {
    newGame();
    const input = $('cmd');
    input.addEventListener('keydown', e => {
      if (window.GameAudio && window.GameAudio.enabled && e.key.length === 1) window.GameAudio.key();
      if (e.key === 'Enter') {
        e.preventDefault(); $('suggest').classList.remove('open');
        const v = input.value; input.value = ''; submit(v, true);
      } else if (game.pendingSsh) {
        if (e.key === 'Escape') {
          e.preventDefault(); game.pendingSsh = null; input.value = ''; input.type = 'text';
          $('suggest').classList.remove('open'); updatePrompt(); say('Connexion SSH annulée.', 'dim');
          if (window.LabyTutorial) window.LabyTutorial.refresh();
        }
      } else if (e.key === 'ArrowUp') { e.preventDefault(); if (histIdx > 0) input.value = cmdHistory[--histIdx]; }
      else if (e.key === 'ArrowDown') { e.preventDefault(); if (histIdx < cmdHistory.length - 1) input.value = cmdHistory[++histIdx]; else { histIdx = cmdHistory.length; input.value = ''; } }
      else if (e.key === 'Tab') {
        e.preventDefault();
        const f = $('suggest').querySelector('.sug');
        if (f) { input.value = f.textContent + (f.textContent.endsWith('/') ? '' : ' '); $('suggest').classList.remove('open'); }
      } else if (e.key === 'Escape') $('suggest').classList.remove('open');
      else if (e.ctrlKey && e.key === 'l') { e.preventDefault(); $('termOut').innerHTML = ''; }
    });
    input.addEventListener('input', () => {
      if (game.pendingSsh) $('suggest').classList.remove('open');
      else complete(input);
    });
    $('termScroll').addEventListener('click', e => {
      if (window.getSelection().toString()) return;
      if (e.target.tagName !== 'BUTTON') input.focus();
    });
    $('readerClose').onclick = () => $('reader').classList.remove('open');
    $('editorClose').onclick = () => $('editor').classList.remove('open');
    $('editorSave').onclick = saveEditor;
    $('editorRun').onclick = runEditor;
    $('editorText').addEventListener('keydown', e => {
      if (e.key === 'Tab') {
        e.preventDefault(); const t = e.target, s = t.selectionStart;
        t.value = t.value.slice(0, s) + '    ' + t.value.slice(t.selectionEnd);
        t.selectionStart = t.selectionEnd = s + 4;
      }
      if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); runEditor(); }
    });
    $('fileInput').addEventListener('change', e => {
      const f = e.target.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => { try { restoreSafely(String(rd.result)); say('Sauvegarde importée.', 'ok'); } catch (err) { say('Fichier invalide : ' + err.message, 'err'); } };
      rd.readAsText(f); e.target.value = '';
    });
    document.querySelectorAll('[data-cmd]').forEach(b => { b.onclick = () => { submit(b.dataset.cmd); input.focus(); }; });
    $('icoHome').onclick = () => submit('exit');
    const bc = $('btnContracts'); if (bc) bc.onclick = openContracts;
    const cc = $('contractsClose'); if (cc) cc.onclick = closeContracts;
    const cv = $('contracts'); if (cv) cv.onclick = e => { if (e.target === cv) closeContracts(); };
    const snd = $('icoSound');
    if (snd) {
      const sync = () => snd.classList.toggle('off', !(window.GameAudio && window.GameAudio.enabled));
      snd.onclick = () => {
        submit(window.GameAudio && window.GameAudio.enabled ? 'son off' : 'son on');
        sync();
      };
      sync();
    }
    // Le contexte audio ne peut naître qu'après un geste utilisateur.
    const wake = () => {
      const A = window.GameAudio;
      if (A && A.enabled) { A.init(); A.resume(); A.startHum(); }
      document.removeEventListener('pointerdown', wake);
      document.removeEventListener('keydown', wake);
    };
    document.addEventListener('pointerdown', wake);
    document.addEventListener('keydown', wake);
    $('icoNotes').onclick = () => openCourseIndex();
    $('icoSwap').onclick = () => document.body.classList.toggle('swap');
    $('icoSave').onclick = () => submit('sauver');
    $('icoHelp').onclick = () => submit('help');

    // boucle d'horloge : 20 images/seconde
    setInterval(() => {
      const now = Date.now();
      if (window.LabyIntro && window.LabyIntro.isOpen()) {
        if (game._clockLast !== undefined) game._clockLast = now;
        return;
      }
      game.tick(now);
      renderProcesses(); renderTrace();
    }, 50);
    setInterval(autoSave, 30000);
    window.addEventListener('beforeunload', autoSave);

    await boot(false);
    if (!window.LabyIntro || !window.LabyIntro.isOpen()) input.focus();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => init().catch(e => console.error(e)));
  else init().catch(e => console.error(e));
})();
