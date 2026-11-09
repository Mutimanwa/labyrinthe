/* =====================================================================
   echo.js — Bruit, logs écrits, capital trace (T12). Entrée M3.
   Tout ce que tu fais a un écho :
   - chaque événement distant a un SCORE DE BRUIT (bible §7.1)
   - il est ÉCRIT dans /var/log/… de la machine cible (lignes syslog
     réalistes, horodatées en heure monde)
   - le CAPITAL TRACE persiste par machine, décroît lentement (demi-vie
     ≈ 6 h monde), et franchit des seuils : 25 = murmures, 60 = alerte,
     100 = TRACÉ (signalement FAI, Respect −2).
   Actions purement locales (ta machine, le web en lecture) : 0 bruit.
   ===================================================================== */
(function (global) {
  'use strict';

  const MOIS3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MOI_LOCAL = 'joueur';
  const DEMI_VIE_MIN = 360;          // 6 h monde

  /* ------------------------------------------------ score de bruit §7.1 */
  function bruitDe(type, d) {
    switch (type) {
      case 'scan': return 1;
      case 'nmap': {
        let b = d.sS ? 2 : 4;
        if (d.sV) b = 5;
        if (d.allPorts) b *= 2;
        if (d.sU) b += 2;
        return b;
      }
      case 'connect': return 1;
      case 'ssh': return 1;
      case 'hydra': return d.success ? 6 : 15;
      case 'crack': return 8;
      case 'searchsploit': return 1;
      case 'curl': return 1;
      case 'firewall': return 5;
      case 'download': return 2;
      case 'upload': return 2;
      case 'replace': return 3;
      case 'delete': return 3;
      case 'edit': return 2;
      case 'chmod': return 2;
      case 'write': return 2;
      default: return 0;             // read, grep, python, fouine, whois, visit… : silence
    }
  }

  /* événement → machine cible (id) ; null = local/pur web = aucun bruit */
  function cibleDe(type, d, world) {
    const t = d.target || (type === 'connect' ? d.id : null);
    if (t) return t === MOI_LOCAL ? null : t;
    // commandes fs relatives au cwd courant : bruit seulement sur machine distante
    if (['write', 'edit', 'delete', 'chmod', 'replace'].includes(type)) {
      return (world && world.current && world.current !== MOI_LOCAL) ? world.current : null;
    }
    return null;                     // read/grep/python sur place : silence
  }

  /* ------------------------------------------------ lignes syslog réalistes */
  function ts(game) {
    const d = global.LabyClock ? global.LabyClock.dateMonde(game) : new Date();
    return `${MOIS3[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2, ' ')} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')}`;
  }

  function ligneLog(g, node, type, d) {
    const SRC = '10.10.0.5';
    const h = node.name || node.id;
    const t = ts(g);
    const port = 51000 + Math.floor(Math.random() * 900);
    switch (type) {
      case 'nmap': return d.sV
        ? `${t} ${h} sshd[2211]: Connection from ${SRC} port ${port} on ${node.ip} port 22`
        : `${t} ${h} sshd[2211]: Did not receive identification string from ${SRC} port ${port} ssh2`;
      case 'scan': return `${t} ${h} kernel: ICMP echo from ${SRC} (sonde), seq 1`;
      case 'connect': return `${t} ${h} inetd[88]: connection attempt from ${SRC}`;
      case 'ssh': return `${t} ${h} sshd[3341]: Accepted password for ${d.user || 'joueur'} from ${SRC} port ${port} ssh2`;
      case 'hydra': return `${t} ${h} sshd[3350]: Failed password for ${d.user || 'root'} from ${SRC} port ${port} ssh2\n${t} ${h} sshd[3351]: message repeated 214 times: [ Failed password for ${d.user || 'root'} from ${SRC} ]` + (d.success ? `\n${t} ${h} sshd[3352]: Accepted password for ${d.user || 'root'} from ${SRC} port ${port} ssh2` : '');
      case 'crack': return `${t} ${h} kernel: ${d.tool === 'metasploit' ? 'rapport' : 'service'}[4401]: segfault at 0 ip 00000000 sp bfff — exploitation probable depuis ${SRC}`;
      case 'firewall': return `${t} ${h} kernel: [NETFILTER] table flushed by uid 0 (origine ${SRC})`;
      case 'download': return `${t} ${h} sshd[3360]: channel 3: sftp RETR ${d.path || '?'}`;
      case 'upload': return `${t} ${h} sshd[3360]: channel 3: sftp STOR ${d.path || d.dest || '?'}`;
      case 'delete': return `${t} ${h} sudo: joueur : COMMAND=/bin/rm (${(d.count || 1)} élément(s))`;
      case 'replace': case 'edit': return `${t} ${h} audit[913]: file modified: ${d.path || '?'} (uid ${(node.users && node.users.joueur) ? '1000' : '0'})`;
      case 'curl': return `${t} ${h} httpd[5540]: ${SRC} - - "GET ${d.path || '/'} HTTP/1.1" 200 512 "-" "curl/8.x"`;
      case 'searchsploit': return `${t} ${h} cron[77]: analyse de base d'exploits locale (rien de distant)`;
      default: return `${t} ${h} audit[913]: event ${type} from ${SRC}`;
    }
  }

  /* écrire dans le journal de la cible (crée /var/log/auth.log si absent) */
  function ecrireLog(node, ligne) {
    const p = '/var/log/auth.log';
    if (!node.get || !node.files) return;
    if (!node.get('/var')) node.files['/var'] = { type: 'dir', perms: 'drwxr-xr-x', owner: 'root' };
    if (!node.get('/var/log')) node.files['/var/log'] = { type: 'dir', perms: 'drwxr-xr-x', owner: 'root' };
    const f = node.get(p);
    if (f && f.type === 'file') f.content = (f.content || '') + ligne + '\n';
    else node.files[p] = { type: 'file', perms: '-rw-r--r--', owner: 'root', content: ligne + '\n' };
    // borne : 400 lignes max (comme un vrai logrotate, en plus brutal)
    const contenu = node.files[p].content || '';
    const ls = contenu.split('\n');
    if (ls.length > 400) node.files[p].content = ls.slice(-400).join('\n');
  }

  /* ------------------------------------------------ capital trace par machine */
  function echoEtat(g) { if (!g.echo) g.echo = { nodes: {} }; return g.echo; }
  function capi(g, id) {
    const e = echoEtat(g);
    if (!e.nodes[id]) e.nodes[id] = { bruit: 0, signalements: 0, tracee: false };
    return e.nodes[id];
  }

  function seuils(g, id, avant, apres, node) {
    if (apres >= 25 && avant < 25 && g.say) g.say(`— ${node.name || id} enregistre un bruit inhabituel (capital ${Math.round(apres)}/100).`, 'dim');
    if (apres >= 60 && avant < 60 && g.say) g.say(`⚠ Les défenses de ${node.name || id} s'activent. Capital trace ${Math.round(apres)}/100. Ralentis ou disparais un moment.`, 'warn');
    if (apres >= 100 && avant < 100) tracee(g, id, node);
  }

  function tracee(g, id, node) {
    const c = capi(g, id);
    c.tracee = true; c.signalements += 1;
    c.bruit = 40;                                       // détention : le silence recommence à 40
    g.respect = Math.max(0, (g.respect || 0) - 2);
    g.record('trace-capite', { target: id });
    if (g.say) {
      g.say('▓▓ TRACÉ — signature transmise au fournisseur d\'accès.', 'trace');
      g.say(`   ${node.name || id} connaît ton adresse maintenant. −2 respect.`, 'warn');
    }
    if (global.LabyMail) {
      global.LabyMail.poster({
        de: 'noc@umuco-net.bi', sujet: 'Signalement d\'activité — section 8.4',
        corps: [
          `Abonné,`,
          `Nos systèmes ont corrélé une activité de scan/intrusion depuis votre ligne vers ${node.name || id} (${node.ip || '?'}).`,
          `Premier rappel de la section 8.4 de votre contrat. Le deuxième se fera par courrier recommandé, pas par mail.`,
          `— UmucoNet, cellule abus`
        ]
      });
    }
  }

  function appliquer(g, type, d) {
    if (g.traceEnabled === false) return 0;     // mode serein : ECHO se tait (bible §12)
    const id = cibleDe(type, d || {}, g.world);
    if (!id) return 0;
    const b = bruitDe(type, d || {});
    if (!b) return 0;
    const node = g.world && g.world.nodes && g.world.nodes[id];
    const c = capi(g, id);
    const avant = c.bruit;
    c.bruit = Math.min(100, c.bruit + b);
    if (node) {
      ecrireLog(node, ligneLog(g, node, type, d || {}));
      seuils(g, id, avant, c.bruit, node);
    }
    return b;
  }

  /* décroissance : demi-vie 6 h monde (branchée sur game.tick) */
  function decroitre(g, dtMinMonde) {
    const e = echoEtat(g);
    const f = Math.pow(0.5, dtMinMonde / DEMI_VIE_MIN);
    for (const id in e.nodes) e.nodes[id].bruit *= f;
  }

  /* ------------------------------------------------ embranchements */
  function embrancherBus(g) {
    if (g.__echoWrap) return;
    g.__echoWrap = true;
    const origRecord = g.record.bind(g);
    g.record = function (type, data) {
      origRecord(type, data);
      try { appliquer(g, type, data || {}); } catch (e) { console.warn('[echo]', e); }
    };
    const origTick = g.tick ? g.tick.bind(g) : null;
    if (origTick) {
      g._echoMonde = g.worldMin || 0;
      g.tick = function (now) {
        const dt = (this.worldMin || 0) - (this._echoMonde || 0);
        if (dt > 0) { try { decroitre(this, dt); } catch (e) { } this._echoMonde = this.worldMin; }
        return origTick(now);
      };
    }
  }

  /* ------------------------------------------------ commande echo */
  function rapport(g) {
    const e = echoEtat(g);
    const ids = Object.keys(e.nodes);
    if (!ids.length) return 'ECHO — capital trace\n\n  Aucun bruit enregistré. Silence parfait, ou début d\'après-midi.';
    const lignes = ['ECHO — mémoire des machines ((demi-vie ≈ 6 h monde)', ''];
    for (const id of ids) {
      const c = e.nodes[id];
      const n = g.world && g.world.nodes && g.world.nodes[id];
      const v = Math.round(c.bruit);
      const bar = '█'.repeat(Math.round(v / 7)) + '░'.repeat(Math.max(0, 14 - Math.round(v / 7)));
      lignes.push(`  ${(n ? n.name : id).padEnd(22)} [${bar}] ${String(v).padStart(3)}/100${c.tracee ? '  ✗ TRACÉ(x' + c.signalements + ')' : ''}`);
    }
    lignes.push('', '  Les machines se souviennent. Le temps efface — lentement.');
    return lignes.join('\n');
  }

  global.LabyEcho = {
    bruitDe, rapport,
    install: embrancherBus,
    _test: { appliquer, decroitre, ecrireLog, ligneLog }
  };

  if (typeof document !== 'undefined') {
    // Attend la restauration complète de la partie (laby:ready) — jamais
    // d'enchères sur un game à moitié restauré.
    const boot = () => {
      const g = (global.LABYRINTHE && global.LABYRINTHE.game);
      if (!g) { console.error('[echo] game indisponible au signal laby:ready'); return; }
      embrancherBus(g);
    };
    if (global.LabyPause && global.LabyPause.quandPret) global.LabyPause.quandPret(boot);
    else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = global.LabyEcho;
})(typeof window !== 'undefined' ? window : globalThis);
