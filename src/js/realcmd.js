/* =====================================================================
   realcmd.js — Vraies commandes Linux / sécurité offensive
   ---------------------------------------------------------------------
   Tout est SIMULÉ dans le navigateur : aucune commande ne touche un vrai
   système ni un vrai réseau. Mais la SYNTAXE et les SORTIES sont celles
   des outils réels, pour que les réflexes acquis soient transférables.
   ===================================================================== */
(function (global) {
  'use strict';

  const E = global.GameEngine || (typeof require !== 'undefined' ? require('./engine.js') : null);

  // ------------------------------------------------------------ UTILS
  function ipInCidr(ip, cidr) {
    const [net, bitsRaw] = cidr.split('/');
    const bits = bitsRaw === undefined ? 32 : parseInt(bitsRaw, 10);
    const toInt = a => a.split('.').reduce((acc, o) => (acc << 8) + (parseInt(o, 10) || 0), 0) >>> 0;
    if (bits === 0) return true;
    const mask = (0xFFFFFFFF << (32 - bits)) >>> 0;
    return (toInt(ip) & mask) === (toInt(net) & mask);
  }
  // Convertit une expression régulière POSIX de base (sed) en RegExp JS.
  function breToJs(p) {
    let out = '';
    for (let i = 0; i < p.length; i++) {
      const c = p[i];
      if (c === '\\' && i + 1 < p.length) {
        const n = p[i + 1];
        if ('(){}|+?'.includes(n)) out += n;          // \( ouvre un groupe
        else out += '\\' + n;                        // \[ reste littéral
        i++;
        continue;
      }
      if ('(){}+?|'.includes(c)) { out += '\\' + c; continue; }  // littéral en BRE
      out += c;
    }
    return out;
  }
  const pad = (s, n) => String(s).padEnd(n);
  const rpad = (s, n) => String(s).padStart(n);

  const SVC_LABEL = {
    ssh: 'SSH', ftp: 'FTP Server', http: 'HTTP WebServer', https: 'HTTPS WebServer',
    smtp: 'SMTP MailServer', mysql: 'MySQL', postgresql: 'PostgreSQL',
    'ms-sql-s': 'MSSQL', 'http-proxy': 'HTTP Proxy', domain: 'DNS', telnet: 'Telnet',
    mongodb: 'MongoDB', redis: 'Redis'
  };

  // Base d'exploits, façon searchsploit
  const EXPLOITS = [
    { match: /vsftpd 2\.3\.4/, title: 'vsftpd 2.3.4 - Backdoor Command Execution', path: 'unix/remote/17491.rb', msf: 'exploit/unix/ftp/vsftpd_234_backdoor', port: 21 },
    { match: /vsftpd 3\.0\.5/, title: 'vsftpd 3.0.5 - Anonymous Access / Weak Credentials', path: 'unix/remote/49757.py', msf: null, port: 21, note: 'Pas de CVE : tester anonymous puis hydra.' },
    { match: /OpenSSH 9\.6/, title: 'OpenSSH 9.6 - Weak Credentials Brute Force', path: 'multiple/remote/45233.py', msf: 'auxiliary/scanner/ssh/ssh_login', port: 22, note: 'Pas de faille mémoire : attaque par dictionnaire.' },
    { match: /Apache httpd 2\.4\.49/, title: 'Apache 2.4.49 - Path Traversal RCE', path: 'multiple/webapps/50383.sh', msf: 'exploit/multi/http/apache_normalize_path_rce', port: 80 },
    { match: /Apache 2\.4\.58|Apache httpd 2\.4\.58/, title: 'Apache 2.4.58 - mod_cgi Misconfiguration', path: 'multiple/webapps/50512.py', msf: 'exploit/multi/http/apache_mod_cgi_bash_env_exec', port: 80 },
    { match: /nginx 1\.24/, title: 'nginx 1.24 - Directory Traversal (alias off-by-slash)', path: 'multiple/webapps/49136.py', msf: null, port: 80 },
    { match: /Postfix/, title: 'Postfix SMTP - User Enumeration (VRFY)', path: 'multiple/remote/45213.py', msf: 'auxiliary/scanner/smtp/smtp_enum', port: 25 },
    { match: /MySQL 8\.0/, title: 'MySQL 8.0 - Weak Credentials / UDF Privilege Escalation', path: 'linux/local/1518.c', msf: 'auxiliary/scanner/mysql/mysql_login', port: 3306 },
    { match: /PostgreSQL 16/, title: 'PostgreSQL 16 - COPY TO PROGRAM RCE (authenticated)', path: 'multiple/remote/46813.rb', msf: 'exploit/multi/postgres/postgres_copy_from_program_cmd_exec', port: 5432 },
    { match: /Tomcat 10\.1/, title: 'Apache Tomcat - Manager Weak Credentials', path: 'multiple/remote/47892.py', msf: 'auxiliary/scanner/http/tomcat_mgr_login', port: 8080 },
    { match: /SimpleHTTPServer/, title: 'Python SimpleHTTPServer - Directory Traversal', path: 'multiple/webapps/39203.py', msf: null, port: 8899, note: 'Sert le dossier courant : tout est lisible.' }
  ];
  // Ce module du marché n'existe que dans la fiction et ne fonctionne que
  // sur le laboratoire CODE, jamais sur un logiciel ou une cible réels.
  const LABY_MODULE = { msf: 'exploit/labyrinthe/http/entrainement', port: 80, target: 'codeLab' };

  // ------------------------------------------------------------ INSTALL
  function install(game) {
    const cmds = game.shell.commands;
    const w = () => game.world;

    // identifiants découverts par le joueur : { "ip|user": password }
    // Les outils réellement disponibles : de vrais chemins dans /usr/bin.
    const TOOLS = ['nmap', 'nc', 'ncat', 'curl', 'nikto', 'sqlmap', 'searchsploit',
      'hydra', 'msfconsole', 'ssh', 'sshpass', 'scp', 'sudo', 'iptables', 'ufw',
      'python3', 'sed', 'grep', 'awk', 'base64', 'sha256sum', 'xxd', 'strings',
      'openssl', 'john', 'tcpdump', 'traceroute', 'arp-scan', 'shred', 'ps'];
    const home = game.world.home;
    for (const t of TOOLS) {
      if (!home.get('/usr/bin/' + t)) {
        home.addFile('/usr/bin/' + t, 'ELF 64-bit LSB executable — ' + t,
          { owner: 'root', perms: 'rwxr-xr-x' });
      }
    }
    if (!home.get('/usr/share/wordlists/README')) {
      home.addFile('/usr/share/wordlists/README',
        "rockyou.txt — liste de mots de passe réellement utilisés,\n" +
        "extraite d'une fuite. C'est la référence pour tester la\n" +
        "robustesse d'un mot de passe. Usage autorisé uniquement\n" +
        "sur des systèmes dont tu es responsable.\n\n" +
        "    hydra -l root -P /usr/share/wordlists/rockyou.txt ssh://<ip>");
    }

    game.creds = game.creds || {};
    game.pendingSsh = null;

    game.knownCred = function (ip, user) { return this.creds[ip + '|' + user]; };
    game.addCred = function (ip, user, pass) { this.creds[ip + '|' + user] = pass; };

    function narr(lines) { return { out: '__NARRATE__' + JSON.stringify(lines), code: 0 }; }
    function needHost(arg) {
      if (!arg) return null;
      const bare = arg.includes('@') ? arg.split('@')[1] : arg;
      return w().findByIp(bare) || w().node(bare) || null;
    }
    function requireDiscovered(n, arg) {
      if (!n) return `hôte '${arg}' introuvable. Découvre-le d'abord : nmap -sn <plage>`;
      if (!n.discovered) return `hôte '${arg}' non découvert. Fais un nmap -sn depuis une machine liée.`;
      return null;
    }

    // ================================================================
    // NMAP — le vrai outil, sorties conformes
    // ================================================================
    cmds.nmap = function (a, raw) {
      const has = f => a.includes(f);
      const targetArg = a.filter(x => !x.startsWith('-') && !/^\d+$/.test(x)).pop();

      // ---- découverte d'hôtes : nmap -sn 10.10.0.0/24 ----
      if (has('-sn') || has('-sP')) {
        if (!targetArg) return { out: 'usage: nmap -sn <plage>   ex: nmap -sn 10.10.0.0/24', code: 1 };
        const here = w().target;
        const found = [];
        for (const id of here.links) {
          const t = w().node(id);
          if (!t) continue;
          if (!ipInCidr(t.ip, targetArg.includes('/') ? targetArg : targetArg + '/32')) continue;
          if (!t.discovered) { t.discovered = true; found.push(t); }
        }
        const inRange = here.links.map(id => w().node(id)).filter(t => t && ipInCidr(t.ip, targetArg.includes('/') ? targetArg : targetArg + '/32'));
        game.record('scan', { from: here.id, found: found.map(x => x.id) });
        const lines = [
          'Starting Nmap 7.95 ( https://nmap.org )',
          ...inRange.map(t => `Nmap scan report for ${t.name} (${t.ip})\nHost is up (0.0012s latency).`),
          `Nmap done: ${Math.pow(2, 32 - parseInt((targetArg.split('/')[1] || '32'), 10))} IP addresses (${inRange.length} host${inRange.length > 1 ? 's' : ''} up)`
        ];
        if (!inRange.length) {
          lines.push('');
          lines.push(`Aucun hôte dans ${targetArg} depuis ${here.name}.`);
          lines.push('Les plages du labo : 10.10.0.0/24 (hub), 10.10.1.0/24 (shell),');
          lines.push('10.10.2.0/24 (code), 10.10.3.0/24 (réseau), 10.10.4.0/24 (sécu).');
          lines.push('Ou balaye large : nmap -sn 10.10.0.0/16');
        } else if (found.length) {
          lines.push('');
          lines.push(`${found.length} nouvel hôte(s) sur la carte.`);
        }
        return narr(lines);
      }

      // ---- scan de ports ----
      let t = w().target;
      if (targetArg) {
        const found = needHost(targetArg);
        const err = requireDiscovered(found, targetArg);
        if (err) return { out: 'nmap: ' + err, code: 1 };
        t = found;
      }
      const A = has('-A'), sV = has('-sV') || A, sS = has('-sS'), sU = has('-sU'), F = has('-F');
      const O = has('-O'), reason = has('--reason'), Pn = has('-Pn');
      const allPorts = has('-p-');
      const script = a.find(x => x.startsWith('--script'));
      let explicit = null;
      const pIdx = a.findIndex(x => x === '-p' || /^-p[\d,\-]+$/.test(x));
      if (pIdx >= 0) {
        const spec = a[pIdx].length > 2 ? a[pIdx].slice(2) : a[pIdx + 1];
        explicit = [];
        for (const part of String(spec).split(',')) {
          if (part.includes('-')) {
            const [x, y] = part.split('-').map(Number);
            for (let i = x; i <= Math.min(y, x + 3000); i++) explicit.push(i);
          } else explicit.push(parseInt(part, 10));
        }
      }
      const TOP100 = [21, 22, 23, 25, 53, 80, 110, 135, 139, 143, 443, 445, 993, 995, 1433, 1723, 3306, 3389, 5432, 5900, 8080];
      const EXTRA = [81, 88, 111, 1521, 2049, 2121, 2222, 3000, 3128, 4444, 5000, 5060, 6379, 8000, 8081, 8443, 8888, 9000, 9090, 9200, 11211, 27017, 31337];
      let universe = allPorts ? 'all' : explicit ? explicit : F ? TOP100 : TOP100.concat(EXTRA);
      const open = t.openPorts();
      const visible = open.filter(p => universe === 'all' || universe.includes(p));

      const label = allPorts ? '65535 ports' : explicit ? `${explicit.length} port${explicit.length > 1 ? 's' : ''}` : F ? '100 ports' : '1000 ports';
      const lines = [
        'Starting Nmap 7.95 ( https://nmap.org )',
        `Nmap scan report for ${t.name} (${t.ip})`,
        `Host is up${Pn ? ' (user set)' : ' (0.0021s latency)'}.`
      ];
      lines.push(`Scanning ${label} [${sU ? 'UDP' : sS ? 'SYN Stealth' : 'connect'}]`);
      lines.push('');
      if (!visible.length) {
        lines.push('Aucun port ouvert dans la plage testée.');
        lines.push('Un service peut écouter hors du top-1000 : essaie nmap -p-');
      } else {
        lines.push(sV ? 'PORT      STATE    SERVICE      VERSION' : 'PORT      STATE    SERVICE');
        for (const p of visible) {
          const info = t.ports[p];
          const state = t.porteOuverte(p) ? 'open' : 'filtered';
          const rs = reason ? (state === 'filtered' ? '  no-response' : '  syn-ack ttl 64') : '';
          const portcol = rpad(p + '/tcp', 9);
          const guessed = (E.PORT_DB[p] && E.PORT_DB[p].service) || 'unknown';
          // Sans -sV, Nmap déduit le nom du numéro : il ne connaît pas
          // encore le vrai service. Un port filtré ne révèle pas sa version.
          const service = sV && state === 'open' ? info.service : guessed;
          lines.push(sV
            ? `${portcol} ${pad(state, 8)} ${pad(service, 12)} ${state === 'open' ? info.version : '-'}${rs}`
            : `${portcol} ${pad(state, 8)} ${service}${rs}`);
        }
      }
      if (O || A) {
        lines.push('');
        lines.push('Device type: general purpose');
        lines.push('Running: Linux 6.X');
        lines.push('OS details: Linux 6.8 (Debian 13)');
      }
      if (script) {
        lines.push('');
        lines.push('Host script results:');
        if (t.files['/robots.txt']) lines.push('| http-robots.txt: 1 disallowed entry');
        lines.push('|_clock-skew: mean: 0s, deviation: 0s');
      }
      lines.push('');
      lines.push('Nmap done: 1 IP address (1 host up)');
      if (visible.length && !sV) {
        lines.push('');
        lines.push('NOTE : sans -sV, la colonne SERVICE est déduite du numéro de port.');
        lines.push('Ajoute -sV pour interroger réellement le service.');
      }
      game.record('nmap', { target: t.id, ports: visible, sV, allPorts, F, reason, sS, sU });
      return narr(lines);
    };

    // ================================================================
    // SSH — vraie syntaxe, vrai prompt de mot de passe
    // ================================================================
    function doSsh(user, host, pass) {
      const n = needHost(host);
      const err = requireDiscovered(n, host);
      if (err) return { out: 'ssh: ' + err, code: 1 };
      const sshPort = n.sshPort ? n.sshPort() : 22;
      const info = n.ports[sshPort];
      if (!info) {
        return { out: `ssh: connect to host ${n.ip} port ${sshPort}: Connection refused`, code: 1 };
      }
      if (info.state !== 'open') {
        return { out: `ssh: connect to host ${n.ip} port ${sshPort}: Connection refused`, code: 1 };
      }
      if (!n.porteOuverte(sshPort)) {
        return { out: `ssh: connect to host ${n.ip} port ${sshPort}: Connection timed out`, code: 1 };
      }
      const cfg = n.sshd();
      if (cfg.PasswordAuthentication === 'no') {
        return { out: `${user}@${n.ip}'s password: \nPermission denied (publickey).`, code: 1 };
      }
      if (user === 'root' && cfg.PermitRootLogin === 'no') {
        return { out: `${user}@${n.ip}'s password: \nPermission denied, please try again.\n(root : connexion root par mot de passe interdite — PermitRootLogin no)`, code: 1 };
      }
      const real = n.users[user];
      if (real === undefined) {
        return { out: `${user}@${n.ip}'s password: \nPermission denied, please try again.\n(ce compte n'existe pas sur cette machine — comptes valides trouvables par énumération)`, code: 1 };
      }
      if (pass !== real) {
        w().log('echec', `ssh ${user} depuis ${w().home.ip}`);
        return { out: `Permission denied, please try again.`, code: 1 };
      }
      game.addCred(n.ip, user, pass);
      w().current = n.id;
      w().cwd = '/home/joueur';
      w().user = user;
      if (user === 'root') n.isAdmin = true;
      w().log('connexion', `ssh ${user}`);
      game.record('connect', { id: n.id });
      game.record('ssh', { target: n.id, user });
      if (user === 'root') game.record('admin', { target: n.id });
      return narr([
        `Connection Established ::`,
        `Connected To ${n.name}@${n.ip} as ${user}`,
        n.desc || '',
        user === 'root' ? 'Vous êtes administrateur de ce système.' : `Session utilisateur. Vérifie tes droits : sudo -l`
      ]);
    }

    cmds.ssh = function (a) {
      const args = a.filter(x => !x.startsWith('-'));
      const pIdx = a.indexOf('-p');
      if (!args.length) return { out: 'usage: ssh [-p port] <utilisateur>@<ip>\n  ex: ssh root@10.10.1.10', code: 1 };
      const spec = args[0];
      if (!spec.includes('@')) {
        return { out: `ssh: syntaxe réelle → ssh utilisateur@${spec}\n  ex: ssh root@${spec}   (ou ssh joueur@${spec})`, code: 1 };
      }
      const [user, host] = spec.split('@');
      const n = needHost(host);
      const err = requireDiscovered(n, host);
      if (err) return { out: 'ssh: ' + err, code: 1 };
      const known = game.knownCred(n.ip, user);
      if (known !== undefined) return doSsh(user, host, known);
      game.pendingSsh = { user, host, nodeId: n.id };
      return { out: `__SSHPASS__${JSON.stringify({ user, host })}`, code: 0 };
    };

    game.trySshPassword = function (pass) {
      const p = game.pendingSsh;
      game.pendingSsh = null;
      if (!p) return { out: 'Aucune connexion en attente.', code: 1 };
      return doSsh(p.user, p.host, pass);
    };

    cmds.sshpass = function (a, raw) {
      const pIdx = a.indexOf('-p');
      if (pIdx < 0) return { out: "usage: sshpass -p '<motdepasse>' ssh utilisateur@ip", code: 1 };
      const pass = a[pIdx + 1];
      const rest = raw.slice(raw.indexOf('ssh '));
      const spec = rest.split(/\s+/)[1];
      if (!spec || !spec.includes('@')) return { out: 'usage: sshpass -p \'mdp\' ssh utilisateur@ip', code: 1 };
      const [user, host] = spec.split('@');
      return doSsh(user, host, pass);
    };

    cmds.exit = function () { return cmds.__logout.call(this); };
    cmds.logout = function () { return cmds.__logout.call(this); };
    cmds.__logout = function () {
      if (w().current === w().playerId) return { out: 'Déjà sur ton poste.', code: 0 };
      const from = w().target;
      w().current = w().playerId; w().cwd = '/home/joueur'; w().user = 'joueur';
      game.record('disconnect', { from: from.id });
      if (game.stopTrace) game.stopTrace('Traçage interrompu : session fermée.');
      return narr(['logout', `Connection to ${from.ip} closed.`, `Retour sur ${w().home.name}@${w().home.ip}`]);
    };

    // ================================================================
    // HYDRA — attaque par dictionnaire, sortie conforme
    // ================================================================
    cmds.hydra = function (a, raw) {
      const n = w().target;
      const lIdx = a.indexOf('-l'), PIdx = a.indexOf('-P'), tIdx = a.indexOf('-t');
      const target = a.filter(x => !x.startsWith('-') && x.includes('://')).pop();
      if (!target || lIdx < 0 || PIdx < 0) {
        return {
          out: `usage: hydra -l <utilisateur> -P <wordlist> <service>://<ip>

  ex: hydra -l root -P /usr/share/wordlists/rockyou.txt ssh://10.10.1.10

  -l  compte à tester        -L  fichier de comptes
  -P  fichier de mots de passe
  -t  nombre de tâches (1 = lent et discret, 16 = rapide et bruyant)

Wordlist disponible sur ton poste : /usr/share/wordlists/rockyou.txt`, code: 1
        };
      }
      const user = a[lIdx + 1];
      const wlPath = a[PIdx + 1];
      const wl = w().home.get(E.normPath('/home/joueur', wlPath)) || w().home.get(wlPath);
      if (!wl) return { out: `hydra: wordlist introuvable : ${wlPath}\nEssaie /usr/share/wordlists/rockyou.txt`, code: 1 };
      const [service, hostPart] = target.split('://');
      const host = hostPart.split(':')[0].replace(/\/$/, '');
      const node = needHost(host);
      const err = requireDiscovered(node, host);
      if (err) return { out: 'hydra: ' + err, code: 1 };
      const port = Object.keys(node.ports).find(p => node.ports[p].service === service);
      if (!port) return { out: `hydra: aucun service ${service} sur ${node.ip}. Fais nmap -sV ${node.ip}`, code: 1 };
      const threads = tIdx >= 0 ? parseInt(a[tIdx + 1], 10) : 16;

      const r = game.spawn ? game.spawn('Hydra', [target, user, wlPath]) : null;
      if (!r || !r.ok) return { out: r ? r.msg : 'hydra: gestionnaire de processus indisponible', code: 1 };
      // Les paramètres appartiennent au processus, pas à une variable globale :
      // deux attaques lancées en parallèle ne doivent pas échanger leurs cibles.
      r.process.job = { node, user, service, port: Number(port), words: wl.content.split('\n').filter(Boolean), threads };
      return { out: `__PROC__${r.process.pid}`, code: 0 };
    };

    game.runHydra = function (proc) {
      const j = proc && proc.job;
      if (!j) return;
      const { node, user, service, port, words, threads } = j;
      const real = node.users[user];
      const cfg = node.sshd ? node.sshd() : { PasswordAuthentication: 'yes', PermitRootLogin: 'yes' };
      let hit = real !== undefined && words.includes(real);
      const refus = [];
      if (cfg.PasswordAuthentication === 'no') {
        hit = false;
        refus.push('[ERROR] Authentification par mot de passe désactivée sur cette cible : rien à forcer.');
      } else if (user === 'root' && cfg.PermitRootLogin === 'no') {
        hit = false;
        refus.push('[ERROR] Connexion root interdite (PermitRootLogin no) : ce compte ne tombe pas au dictionnaire.');
      }
      proc.result = { found: hit, user, password: hit ? real : null };
      const lines = [
        'Hydra v9.5 (c) 2023 by van Hauser/THC & David Maciejak',
        'Hydra (https://github.com/vanhauser-thc/thc-hydra)',
        `[DATA] max ${threads} tasks per 1 server, overall ${threads} tasks, ${words.length} login tries (l:1/p:${words.length}), ~${Math.ceil(words.length / threads)} tries per task`,
        `[DATA] attacking ${service}://${node.ip}:${port}/`,
        ...refus
      ];
      if (hit) {
        lines.push(`[${port}][${service}] host: ${node.ip}   login: ${user}   password: ${real}`);
        lines.push(`1 of 1 target successfully completed, 1 valid password found`);
        game.addCred(node.ip, user, real);
        node.crackedPorts.add(port);
        w().log('intrusion', `hydra ${service} compte ${user}`);
        game.record('crack', { port, target: node.id, tool: 'hydra' });
        game.record('hydra', { target: node.id, user, success: true });
        lines.push('');
        lines.push(`Identifiant retenu. Connecte-toi :  ssh ${user}@${node.ip}`);
      } else {
        lines.push(`[ERROR] all children were disabled due to too many connection errors`);
        lines.push(`0 of 1 target completed, 0 valid passwords found`);
        game.record('hydra', { target: node.id, user, success: false });
        lines.push('');
        lines.push(real === undefined
          ? `Le compte '${user}' n'existe pas sur cette cible. Énumère d'abord les comptes.`
          : `Ce mot de passe n'est pas dans la wordlist. Il est peut-être fort — cherche une fuite plutôt que de forcer.`);
      }
      // bruit : une attaque rapide déclenche la détection plus vite
      if (game.startTrace) game.startTrace(threads >= 8 ? Math.round(game.traceTotal * 0.5) : game.traceTotal);
      for (const l of lines) game.say(l, hit && l.startsWith('[') && l.includes('password:') ? 'ok' : '');
      delete proc.job;
    };

    // ================================================================
    // SEARCHSPLOIT / METASPLOIT
    // ================================================================
    cmds.searchsploit = function (a, raw) {
      const q = raw.replace(/^searchsploit\s*/, '').replace(/^["']|["']$/g, '').toLowerCase();
      if (!q) return { out: 'usage: searchsploit <service> <version>\n  ex: searchsploit vsftpd 3.0.5', code: 1 };
      const terms = q.split(/\s+/);
      const hits = EXPLOITS.filter(e => terms.every(t => (e.title + ' ' + e.path).toLowerCase().includes(t)));
      const lines = [
        '------------------------------------------------- ---------------------------------',
        ' Exploit Title                                   |  Path',
        '------------------------------------------------- ---------------------------------'
      ];
      for (const h of hits) lines.push(` ${pad(h.title, 47)} |  ${h.path}`);
      if (!hits.length) lines.push(' Exploits: No Results');
      lines.push('------------------------------------------------- ---------------------------------');
      lines.push('Shellcodes: No Results');
      if (hits.length) {
        lines.push('');
        for (const h of hits) {
          if (h.msf) lines.push(`Module Metasploit : ${h.msf}`);
          if (h.note) lines.push(`Note : ${h.note}`);
        }
      }
      game.record('searchsploit', { query: q, hits: hits.length });
      return narr(lines);
    };

    cmds.msfconsole = function (a, raw) {
      const xIdx = a.indexOf('-x');
      if (xIdx < 0) {
        return {
          out: `msfconsole s'utilise ici en mode scripté (syntaxe réelle) :

  msfconsole -x "use <module>; set RHOSTS <ip>; set USERNAME <user>; set PASSWORD <mdp>; exploit"

Modules utiles (trouvables avec searchsploit) :
  auxiliary/scanner/ssh/ssh_login
  auxiliary/scanner/mysql/mysql_login
  exploit/unix/ftp/vsftpd_234_backdoor
  exploit/multi/http/apache_mod_cgi_bash_env_exec
  exploit/multi/postgres/postgres_copy_from_program_cmd_exec

Exemple :
  msfconsole -x "use auxiliary/scanner/ssh/ssh_login; set RHOSTS 10.10.1.10; set USERNAME root; set PASSWORD toor; exploit"`, code: 1
        };
      }
      const script = raw.slice(raw.indexOf('-x') + 2).trim().replace(/^["']|["']$/g, '');
      const parts = script.split(';').map(s => s.trim());
      let mod = null, opts = {};
      for (const p of parts) {
        if (p.startsWith('use ')) mod = p.slice(4).trim();
        else if (p.startsWith('set ')) { const [, k, ...v] = p.split(/\s+/); opts[k.toUpperCase()] = v.join(' '); }
      }
      if (!mod) return { out: 'msfconsole: aucun module. Ajoute "use <module>;"', code: 1 };
      let known = EXPLOITS.find(e => e.msf === mod);
      if (mod === LABY_MODULE.msf) {
        if (!game.inventaire.includes('exploit-0day')) {
          return { out: '[-] Module fictif verrouillé : achat « exploit-0day » requis au Puits.', code: 1 };
        }
        known = LABY_MODULE;
      }
      if (!known) return { out: `[-] Unknown module: ${mod}\nCherche-le avec searchsploit.`, code: 1 };
      const host = opts.RHOSTS || opts.RHOST;
      const node = needHost(host);
      const err = requireDiscovered(node, host);
      if (err) return { out: 'msfconsole: ' + err, code: 1 };
      const r = game.spawn ? game.spawn('Metasploit', [mod]) : null;
      if (!r || !r.ok) return { out: r ? r.msg : 'msfconsole: gestionnaire de processus indisponible', code: 1 };
      r.process.job = { node, mod, opts, known };
      return { out: `__PROC__${r.process.pid}`, code: 0 };
    };

    game.runMsf = function (proc) {
      const j = proc && proc.job; if (!j) return;
      const { node, mod, opts, known } = j;
      const lines = [
        '       =[ metasploit v6.4.0-dev ]',
        '+ -- --=[ 2400 exploits - 1240 auxiliary - 420 post ]',
        '',
        `[*] Using ${mod}`,
        `RHOSTS => ${opts.RHOSTS || ''}`
      ];
      const port = known.port;
      if (known.target && node.id !== known.target) {
        lines.push('[-] Module fictif incompatible : réservé au laboratoire CODE.');
        proc.result = { ok: false, module: mod };
        for (const l of lines) game.say(l, 'err');
        delete proc.job;
        return;
      }
      if (!node.porteOuverte(port)) {
        lines.push(`[-] ${node.ip}:${port} - Connection refused`);
        lines.push('[*] Auxiliary module execution completed');
        proc.result = { ok: false, module: mod };
        for (const l of lines) game.say(l, 'err');
        delete proc.job;
        return;
      }
      let ok = false;
      if (mod.includes('ssh_login') || mod.includes('mysql_login') || mod.includes('tomcat_mgr_login')) {
        const u = opts.USERNAME || opts.USER, p = opts.PASSWORD || opts.PASS;
        if (u && node.users[u] !== undefined && node.users[u] === p) {
          ok = true;
          game.addCred(node.ip, u, p);
          lines.push(`[+] ${node.ip}:${port} - Success: '${u}:${p}'`);
          lines.push(`[*] Command shell session 1 opened`);
        } else {
          lines.push(`[-] ${node.ip}:${port} - Failed: '${u || ''}:${p || ''}'`);
        }
      } else {
        if (node.firewall && !node.firewallDown) {
          lines.push('[-] Exploit aborted: target is protected by a packet filter');
        } else {
          ok = true;
          lines.push(`[*] Started reverse TCP handler on ${w().home.ip}:4444`);
          lines.push(`[+] ${node.ip}:${port} - Command shell session 1 opened`);
          game.addCred(node.ip, 'root', node.users.root || 'toor');
        }
      }
      proc.result = { ok, module: mod };
      if (ok) {
        node.crackedPorts.add(port);
        w().log('intrusion', `metasploit ${mod}`);
        game.record('crack', { port, target: node.id, tool: 'metasploit' });
        lines.push('');
        lines.push(`Session ouverte. Connecte-toi :  ssh root@${node.ip}`);
      }
      lines.push('[*] Auxiliary module execution completed');
      if (game.startTrace) game.startTrace(game.traceTotal);
      for (const l of lines) game.say(l, l.startsWith('[+]') ? 'ok' : l.startsWith('[-]') ? 'err' : '');
      delete proc.job;
    };

    // ================================================================
    // ÉLÉVATION DE PRIVILÈGES
    // ================================================================
    cmds.sudo = function (a) {
      const n = w().target;
      if (n.id === w().playerId) { w().user = 'root'; return { out: 'root', code: 0 }; }
      if (a[0] === '-l' || a[0] === '--list') {
        if (n.isAdmin) return narr([`Matching Defaults entries for ${w().user} on ${n.id}:`, '', `User ${w().user} may run the following commands on ${n.id}:`, '    (ALL : ALL) ALL']);
        if (n.sudoNoPasswd) {
          return narr([
            `User ${w().user} may run the following commands on ${n.id}:`,
            '    (ALL) NOPASSWD: ALL',
            '',
            'MAUVAISE CONFIGURATION : ce compte peut tout faire sans mot de passe.',
            'Deviens root :  sudo -i'
          ]);
        }
        return narr([`User ${w().user} may run the following commands on ${n.id}:`, '    (ALL : ALL) ALL', '', 'Un mot de passe est requis.']);
      }
      if (a[0] === '-i' || a[0] === 'su' || a[0] === '-s') {
        if (n.isAdmin) { w().user = 'root'; return { out: 'root@' + n.id + ':~#', code: 0 }; }
        if (n.sudoNoPasswd) {
          n.isAdmin = true; w().user = 'root';
          w().log('intrusion', `élévation sudo -i depuis ${w().user}`);
          game.record('admin', { target: n.id });
          return narr(['root@' + n.id + ':~# whoami', 'root', '', 'Élévation réussie : NOPASSWD était activé.']);
        }
        const pass = game.knownCred(n.ip, w().user);
        if (pass && n.users[w().user] === pass) {
          n.isAdmin = true; w().user = 'root';
          game.record('admin', { target: n.id });
          return narr(['root@' + n.id + ':~# whoami', 'root']);
        }
        return { out: `[sudo] password for ${w().user}: \nSorry, try again.`, code: 1 };
      }
      return { out: 'usage: sudo -l   (lister ses droits)   |   sudo -i   (devenir root)', code: 1 };
    };

    cmds.id = function () {
      const root = w().target.isAdmin || w().user === 'root';
      return { out: root ? 'uid=0(root) gid=0(root) groups=0(root)' : `uid=1000(${w().user}) gid=1000(${w().user}) groups=1000(${w().user}),27(sudo)`, code: 0 };
    };
    cmds.whoami = function () { return { out: w().user, code: 0 }; };

    // ================================================================
    // PARE-FEU — iptables / ufw
    // ================================================================
    // -------------------------------------------------- aide iptables
    function parseIptablesRule(a) {
      if (!a.includes('INPUT')) return null;
      const pIdx = a.indexOf('-p'); const proto = pIdx >= 0 ? a[pIdx + 1] : 'tcp';
      const dIdx = a.indexOf('--dport'); const dport = dIdx >= 0 ? parseInt(a[dIdx + 1], 10) : null;
      const jIdx = a.indexOf('-j'); const action = jIdx >= 0 ? a[jIdx + 1] : null;
      if (!proto || dport === null || !action) return null;
      if (!/^(ACCEPT|DROP)$/.test(action)) return null;
      return { chain: 'INPUT', proto, dport: Number(dport), action };
    }
    function iptablesList(n) {
      const lines = [
        `Chain INPUT (policy ${(n.firewall && n.firewall.policy) || 'ACCEPT'} ${n.firewallDown ? '(filtrage désactivé)' : ''} 0 packets, 0 bytes)`,
        'num   pkts bytes target     prot opt in     out     source               destination'
      ];
      const rules = (n.firewall && n.firewall.rules) || [];
      if (!rules.length) lines.push('  (aucune règle explicite — politique par défaut appliquée)');
      rules.forEach((r, i) => {
        lines.push(`${String(i + 1).padStart(3)}    0    0 ${r.action.padEnd(11)} ${r.proto} --  *      *       0.0.0.0/0         0.0.0.0/0           tcp dpt:${r.dport}`);
      });
      const ouvert = n.openPorts().filter(p => n.porteOuverte(p));
      lines.push('');
      lines.push('Ports effectivement ouverts : ' + (ouvert.length ? ouvert.join(', ') : 'aucun'));
      lines.push('');
      lines.push('Chain FORWARD (policy DROP 0 packets, 0 bytes)');
      lines.push('Chain OUTPUT (policy ACCEPT 0 packets, 0 bytes)');
      return lines;
    }
    cmds.iptables = function (a) {
      const n = w().target;
      const rootReq = () => !n.isAdmin ? { out: 'iptables: Permission denied (you must be root).\nDeviens root : sudo -l puis sudo -i', code: 1 } : null;
      if (a.includes('-L') || a.includes('--list')) return narr(iptablesList(n));
      if (a.includes('-F') || a.includes('--flush')) {
        const r = rootReq(); if (r) return r;
        n.firewallDown = true;
        if (n.firewall) {
          n.firewall.rules = [];
          n.firewall.allow = [];
          n.firewall.policy = 'ACCEPT';
        }
        w().log('intrusion', 'iptables -F : filtrage vidé');
        game.record('firewall', { target: n.id, op: 'flush' });
        return narr(['iptables: règles vidées.', 'Politique INPUT repassée en ACCEPT : tous les ports sont joignables.', '', 'Relance :  nmap -sV ' + n.ip]);
      }
      if (a.includes('-P')) {
        const r = rootReq(); if (r) return r;
        const pIdx = a.indexOf('-P');
        const chain = a[pIdx + 1];
        const policy = a[pIdx + 2];
        if (chain !== 'INPUT') return { out: 'iptables: seule la chaîne INPUT est simulée ici.', code: 1 };
        if (!/^(ACCEPT|DROP)$/.test(policy)) return { out: 'iptables: politique attendue ACCEPT ou DROP.', code: 1 };
        if (!n.firewall) n.firewall = { policy: 'ACCEPT', allow: [22], rules: [] };
        n.firewall.policy = policy;
        n.firewallDown = false;
        w().log('intrusion', `iptables -P INPUT ${policy}`);
        game.record('firewall', { target: n.id, op: 'policy', policy });
        return { out: `iptables: politique INPUT → ${policy}.`, code: 0 };
      }
      if (a.includes('-A')) {
        const r = rootReq(); if (r) return r;
        const rule = parseIptablesRule(a);
        if (!rule) return { out: 'usage: iptables -A INPUT -p tcp --dport <port> -j ACCEPT|DROP', code: 1 };
        if (!n.firewall) n.firewall = { policy: 'ACCEPT', allow: [22], rules: [] };
        if (!Array.isArray(n.firewall.rules)) n.firewall.rules = [];
        n.firewall.rules.push(rule);
        n.firewallDown = false;
        w().log('intrusion', `iptables -A INPUT ${rule.proto} dport ${rule.dport} -j ${rule.action}`);
        game.record('firewall', { target: n.id, op: 'append', rule });
        return { out: `iptables: règle ajoutée (${rule.proto} dpt=${rule.dport} → ${rule.action}).`, code: 0 };
      }
      if (a.includes('-D')) {
        const r = rootReq(); if (r) return r;
        const dIdx = a.indexOf('-D');
        const num = parseInt(a[dIdx + 2], 10);
        if (!n.firewall || !n.firewall.rules || !n.firewall.rules[num - 1]) {
          return { out: 'iptables: aucune règle à ce numéro (iptables -L -n -v pour les lister).', code: 1 };
        }
        const gone = n.firewall.rules.splice(num - 1, 1)[0];
        w().log('intrusion', `iptables -D INPUT ${num}`);
        game.record('firewall', { target: n.id, op: 'delete', rule: gone });
        return { out: `iptables: règle ${num} supprimée.`, code: 0 };
      }
      return { out: 'usage: iptables -L -n -v   (lire) | iptables -P INPUT ACCEPT|DROP   (politique) | iptables -A INPUT -p tcp --dport N -j ACCEPT|DROP   (ajouter) | iptables -D <n>   (supprimer) | iptables -F   (vider, root requis)', code: 1 };
    };
    cmds.ufw = function (a) {
      const n = w().target;
      const rootReq = () => !n.isAdmin ? { out: 'ERROR: You need to be root to run this script', code: 1 } : null;
      const ensureFw = () => {
        if (!n.firewall) n.firewall = { policy: 'DROP', allow: [22], rules: [] };
        n.firewallDown = false;
        if (n.firewall.policy === 'ACCEPT') n.firewall.policy = 'DROP';
      };
      if (a[0] === 'status' || a.includes('verbose')) {
        if (!n.firewall) return { out: 'Status: inactive', code: 0 };
        if (n.firewallDown) return { out: 'Status: inactive (règles vidées)', code: 0 };
        const rows = n.openPorts().map(p => {
          const open = n.porteOuverte(p);
          return `${pad(p + '/tcp', 26)} ${open ? 'ALLOW IN' : 'DENY IN'} Anywhere`;
        });
        return narr(['Status: active', 'Logging: on (low)', `Default: ${n.firewall.policy === 'DROP' ? 'deny' : 'allow'} (incoming), allow (outgoing)`, '', 'To                         Action      From', '--                         ------      ----', ...rows]);
      }
      if (a[0] === 'enable') {
        const r = rootReq(); if (r) return r;
        ensureFw();
        w().log('intrusion', 'ufw enable : pare-feu activé');
        game.record('firewall', { target: n.id, op: 'ufw-enable' });
        return { out: 'Firewall is active and enabled on system startup', code: 0 };
      }
      if (a[0] === 'disable') {
        const r = rootReq(); if (r) return r;
        n.firewallDown = true;
        game.record('firewall', { target: n.id, op: 'ufw-disable' });
        return { out: 'Firewall stopped and disabled on system startup', code: 0 };
      }
      if (a[0] === 'allow' || a[0] === 'deny') {
        const r = rootReq(); if (r) return r;
        const spec = a[1];
        const m = spec && spec.match(/^(\d+)\/tcp$/);
        if (!m) return { out: `usage: ufw allow <port>/tcp   |   ufw deny <port>/tcp`, code: 1 };
        const port = Number(m[1]);
        ensureFw();
        if (a[0] === 'allow') {
          if (!(n.firewall.allow || []).includes(port)) { if (!n.firewall.allow) n.firewall.allow = []; n.firewall.allow.push(port); }
        } else {
          n.firewall.allow = (n.firewall.allow || []).filter(p => p !== port);
        }
        w().log('intrusion', `ufw ${a[0]} ${port}/tcp`);
        game.record('firewall', { target: n.id, op: `ufw-${a[0]}`, port });
        return { out: `Rule ${a[0]} added (v4)`, code: 0 };
      }
      return { out: 'usage: ufw status verbose   |   ufw enable   |   ufw disable   |   ufw allow 22/tcp   |   ufw deny 22/tcp   (root requis)', code: 1 };
    };

    // -------------------------------------------------- SSHD — configuration du démon
    cmds.sshd = function (a) {
      const n = w().target;
      const cfg = n.sshd();
      if (a[0] === '-T') {
        return narr([
          `# /etc/ssh/sshd_config — configuration effective sur ${n.name}`,
          `Port ${cfg.Port}`,
          `PermitRootLogin ${cfg.PermitRootLogin}`,
          `PasswordAuthentication ${cfg.PasswordAuthentication}`,
          '',
          'Édite le fichier :  sed -i \'s/PermitRootLogin yes/PermitRootLogin no/\' /etc/ssh/sshd_config',        ]);
      }
      if (a[0] === '-t') {
        const f = n.files['/etc/ssh/sshd_config'];
        if (!f || f.type !== 'file') return { out: 'sshd: /etc/ssh/sshd_config absent', code: 1 };
        let bad = 0;
        for (const raw of String(f.content).split('\n')) {
          const line = raw.trim();
          if (!line || line.startsWith('#')) continue;
          if (!/^[A-Za-z][A-Za-z0-9_-]*\s+\S+/.test(line)) { bad++; }
        }
        if (bad) return { out: `sshd: ${bad} ligne(s) invalide(s) dans /etc/ssh/sshd_config`, code: 1 };
        return { out: 'Configuration file /etc/ssh/sshd_config syntax OK', code: 0 };
      }
      return { out: 'usage: sshd -T   (configuration effective) | sshd -t   (test de syntaxe)\n\nLe fichier réel est /etc/ssh/sshd_config sur cette machine.', code: 1 };
    };

    // -------------------------------------------------- POT DE MIEL (honeypot)
    cmds.honeypot = function (a) {
      const n = w().target;
      if (!n.get('/var/log/honeypot.log')) n.addFile('/var/log/honeypot.log', '', { owner: 'root' });
      if (a[0] === 'start') {
        const r = game.spawn ? game.spawn('Honeypot', []) : null;
        if (!r) return { out: 'honeypot: moteur de processus indisponible', code: 1 };
        if (!r.ok) return { out: r.msg, code: 1 };
        game.honeypot = { active: true, depuis: Date.now() };
        return { out: 'Pot de miel activé (port 2222 décoy). Les tentatives de connexion sont journalisées dans /var/log/honeypot.log', code: 0 };
      }
      if (a[0] === 'stop') {
        const p = (game.processes || []).find(x => x.name === 'Honeypot' && !x.cancelled && !x.done);
        if (!p) return { out: 'Le pot de miel n\'est pas actif.', code: 1 };
        game.kill(p.pid);
        game.honeypot = { active: false };
        return { out: 'Pot de miel arrêté.', code: 0 };
      }
      if (a[0] === 'voir' || a[0] === 'cat') {
        const f = n.get('/var/log/honeypot.log');
        return { out: f && f.content ? f.content : '(aucune tentative enregistrée)', code: 0 };
      }
      // status (défaut)
      const p = (game.processes || []).find(x => x.name === 'Honeypot' && !x.cancelled && !x.done);
      const lines = ['Pot de miel : ' + (p ? 'ACTIF (port 2222 décoy)' : 'inactif')];
      if (p) lines.push(`PID ${p.pid}  ${p.spec.ram} Mo  lancé il y a ${Math.round((Date.now() - p.startedAt) / 1000)} s`);
      const f = n.get('/var/log/honeypot.log');
      lines.push('Entrées journalisées : ' + (f && f.content ? f.content.split('\n').filter(Boolean).length : 0));
      return { out: lines.join('\n'), code: 0 };
    };

    // ================================================================
    // SCP — vraie syntaxe distante
    // ================================================================
    cmds.scp = function (a) {
      const args = a.filter(x => !x.startsWith('-'));
      if (args.length < 2) {
        return {
          out: `usage: scp <source> <destination>

  Télécharger depuis la machine distante :
    scp joueur@10.10.1.10:/home/joueur/rapport.txt .
    (le point final = ton dossier courant)

  Déposer vers une machine distante :
    scp ./rapport.txt joueur@10.10.0.9:/depot/

  Astuce : depuis une session SSH ouverte, tu peux aussi faire
    scp /home/joueur/rapport.txt ${w().home.ip}:/home/joueur/telecharges/`, code: 1
        };
      }
      const [src, dst] = args;
      const parse = s => {
        if (s.includes(':') && !s.startsWith('/')) {
          const [who, path] = s.split(':');
          const host = who.includes('@') ? who.split('@')[1] : who;
          const user = who.includes('@') ? who.split('@')[0] : 'joueur';
          return { remote: true, host, user, path };
        }
        return { remote: false, path: s };
      };
      const S = parse(src), D = parse(dst);

      // distant → local
      if (S.remote && !D.remote) {
        const n = needHost(S.host);
        const err = requireDiscovered(n, S.host);
        if (err) return { out: 'scp: ' + err, code: 1 };
        const abs = E.normPath('/home/joueur', S.path);
        if (!n.isFile(abs)) return { out: `scp: ${S.path}: No such file or directory`, code: 1 };
        const destDir = D.path === '.' ? '/home/joueur/telecharges' : E.normPath('/home/joueur', D.path);
        const dest = (w().home.isDir(destDir) ? destDir : '/home/joueur/telecharges') + '/' + E.basename(abs);
        w().home.addFile(dest, n.files[abs].content, { owner: 'joueur' });
        w().log('transfert', `${abs} → ${w().home.ip}`);
        game.record('download', { path: abs, target: n.id, dest });
        return narr([`${E.basename(abs)}          100%  ${n.files[abs].content.length}     0.1KB/s   00:00`, `Copié vers ta machine : ${dest}`]);
      }
      // local → distant
      if (!S.remote && D.remote) {
        const n = needHost(D.host);
        const err = requireDiscovered(n, D.host);
        if (err) return { out: 'scp: ' + err, code: 1 };
        const abs = E.normPath('/home/joueur', S.path);
        if (!w().home.isFile(abs)) return { out: `scp: ${S.path}: No such file or directory`, code: 1 };
        const dir = D.path.endsWith('/') ? D.path.slice(0, -1) : E.dirname(D.path);
        if (!n.isDir(dir)) return { out: `scp: ${dir}: No such file or directory`, code: 1 };
        const dest = (D.path.endsWith('/') ? dir + '/' + E.basename(abs) : D.path);
        n.addFile(dest, w().home.files[abs].content, { owner: D.user });
        game.record('upload', { path: dest, target: n.id, source: abs });
        return narr([`${E.basename(abs)}          100%  ${w().home.files[abs].content.length}     0.1KB/s   00:00`, `Déposé sur ${n.name}:${dest}`]);
      }
      // depuis la session courante vers son poste (forme courte tolérée)
      if (!S.remote && !D.remote && w().current !== w().playerId) {
        const n = w().target;
        const abs = E.normPath(w().cwd, S.path);
        if (!n.isFile(abs)) return { out: `scp: ${S.path}: No such file or directory`, code: 1 };
        const dest = '/home/joueur/telecharges/' + E.basename(abs);
        w().home.addFile(dest, n.files[abs].content, { owner: 'joueur' });
        game.record('download', { path: abs, target: n.id, dest });
        return narr([`Copié vers ta machine : ${dest}`]);
      }
      return { out: 'scp: au moins une des deux extrémités doit être distante (utilisateur@ip:chemin)', code: 1 };
    };

    // ================================================================
    // CHENILLARD DE RELAIS (T18) — accès au Puits
    // ================================================================
    // Chaque saut coûte 50 crédits et prend 3 s (latence simulée).
    // 3 sauts nécessaires. Rang OPÉRATEUR (3000 xp) requis.
    const RELAIS_CHAIN = ['relais1', 'relais2', 'relais3'];
    const RELAIS_COST = 50;
    const RELAIS_LATENCE = 3000;

    const RELAIS_RAPIDE = 1000;
    const latenceRelais = () => game.inventaire.includes('relais-prive') ? RELAIS_RAPIDE : RELAIS_LATENCE;
    const relaisActif = () => game.processes.find(p => p.name === 'Relais' && !p.done && !p.cancelled);

    // Le saut n'est débité et appliqué qu'à la fin du processus : une
    // annulation, une sauvegarde/reprise ou un manque de RAM ne coûte rien.
    game.runRelais = function (proc) {
      const job = proc && proc.job;
      if (!job) return;
      const rel = this.relais;
      const node = w().node(job.cible);
      const puits = w().node('puits');
      if (rel.position !== job.position || rel.puitsAtteint || !node || (job.position === 2 && !puits)) {
        this.say('relais: la chaîne a changé pendant le saut ; aucun crédit débité.', 'warn');
        delete proc.job;
        return;
      }
      if ((this.credits || 0) < RELAIS_COST) {
        this.say('relais: crédits insuffisants à la fin du saut ; aucun crédit débité.', 'err');
        delete proc.job;
        return;
      }
      this.credits -= RELAIS_COST;
      rel.position += 1;
      rel.creditsDepenses += RELAIS_COST;
      rel.dernierSaut = Date.now();
      rel.historique.push({ saut: rel.position, cible: job.cible, cout: RELAIS_COST, latence: job.latence, ts: rel.dernierSaut });
      node.discovered = true;
      const home = w().home;
      if (!home.links.includes(RELAIS_CHAIN[0])) home.links.push(RELAIS_CHAIN[0]);
      w().log('transfert', 'relais saut ' + rel.position + ' → ' + job.cible + ' (' + node.ip + ')');
      this.record('relais', { saut: rel.position, cible: job.cible, cout: RELAIS_COST, latence: job.latence });
      this.say(`Relais saut ${rel.position}/3 effectué vers ${node.name} (${node.ip}). −${RELAIS_COST} cr · latence ${job.latence / 1000} s`, 'ok');
      if (rel.position >= 3) {
        rel.puitsAtteint = true;
        puits.discovered = true;
        // Les anciennes sauvegardes ne possédaient aucun compte sur le Puits.
        if (!Object.prototype.hasOwnProperty.call(puits.users, 'joueur')) puits.users.joueur = 'puits';
        if (!home.links.includes('puits')) home.links.push('puits');
        this.say('>>> LE PUITS EST ATTEINT <<<', 'ok');
        this.say('Connexion : ssh joueur@10.10.0.99  (mot de passe fictif : puits)', 'dim');
        this.say('Le marché est accessible avec : marche', 'dim');
      } else {
        const suivant = w().node(RELAIS_CHAIN[rel.position]);
        this.say(`Prochain saut : ${suivant.name} (${suivant.ip}) — relais sauter`, 'dim');
      }
      delete proc.job;
    };

    cmds.relais = function (a) {
      const g = game;
      const sous = a[0];
      const rel = g.relais;
      const enCours = relaisActif();
      const latence = latenceRelais();

      if (!sous || sous === 'status' || sous === 'statut') {
        const lignes = [
          'CHENILLARD DE RELAIS — accès au Puits',
          '  Position : saut ' + rel.position + ' / 3',
          '  Crédits dépensés : ' + rel.creditsDepenses + ' cr',
          '  Coût par saut : ' + RELAIS_COST + ' cr · Latence : ' + (latence / 1000) + ' s',
          '  Rang requis : OPÉRATEUR (3000 xp) — actuel : ' + (g.xp || 0) + ' xp ' + ((g.xp || 0) >= 3000 ? '✓' : '✗')
        ];
        if (enCours) lignes.push(`  Saut en cours : PID ${enCours.pid} (aucun débit avant l'arrivée)`);
        if (rel.dernierSaut) lignes.push('  Dernier saut : ' + new Date(rel.dernierSaut).toLocaleTimeString());
        if (rel.puitsAtteint) lignes.push('', 'Puits accessible : ssh joueur@10.10.0.99  (mot de passe fictif : puits)', 'Pour refaire la chaîne : relais recommencer');
        else {
          const suivant = w().node(RELAIS_CHAIN[rel.position]);
          if (suivant) lignes.push('  Prochain relais : ' + suivant.name + ' (' + suivant.ip + ')');
        }
        if ((g.xp || 0) < 3000) lignes.push('', 'Verrou : atteins le rang OPÉRATEUR pour emprunter le chenillard.');
        return { out: lignes.join('\n'), code: 0 };
      }

      if (sous === 'sauter' || sous === 'suivant') {
        if ((g.xp || 0) < 3000) return { out: `relais: verrou OPÉRATEUR — ${g.xp || 0} / 3000 xp.`, code: 1 };
        if (rel.puitsAtteint || rel.position >= 3) return { out: 'relais: le chenillard est complet — le Puits est déjà atteint.', code: 0 };
        if (enCours) return { out: `relais: un saut est déjà en cours (PID ${enCours.pid}).`, code: 1 };
        if ((g.credits || 0) < RELAIS_COST) return { out: `relais: crédits insuffisants (${RELAIS_COST} cr requis, ${g.credits || 0} disponibles).`, code: 1 };
        const cible = RELAIS_CHAIN[rel.position];
        const node = w().node(cible);
        if (!node) return { out: `relais: node ${cible} introuvable dans le monde.`, code: 1 };
        const r = g.spawn ? g.spawn('Relais', [cible]) : null;
        if (!r || !r.ok) return { out: r ? r.msg : 'relais: gestionnaire de processus indisponible', code: 1 };
        r.process.duration = latence;
        r.process.job = { cible, position: rel.position, latence };
        g.say(`Saut ${rel.position + 1}/3 vers ${node.name} : ${latence / 1000} s, ${RELAIS_COST} cr à l'arrivée.`, 'dim');
        return { out: `__PROC__${r.process.pid}`, code: 0 };
      }

      if (sous === 'arreter' || sous === 'stop') {
        if (enCours) {
          g.kill(enCours.pid);
          return { out: 'Saut annulé : aucun crédit débité. Reprendre : relais sauter.', code: 0 };
        }
        return { out: `Aucun saut en cours. Position : ${rel.position}/3. Reprendre : relais sauter.`, code: 0 };
      }

      if (sous === 'recommencer' || sous === 'reconnecter') {
        if (enCours) return { out: 'relais: arrête d’abord le saut en cours.', code: 1 };
        if (w().current === 'puits') return { out: 'relais: quitte d’abord le Puits avec exit.', code: 1 };
        if (!rel.position && !rel.puitsAtteint) return { out: 'relais: la chaîne est déjà au départ.', code: 0 };
        rel.position = 0;
        rel.puitsAtteint = false;
        rel.dernierSaut = null;
        w().home.links = w().home.links.filter(id => id !== 'puits' && id !== RELAIS_CHAIN[0]);
        for (const id of [...RELAIS_CHAIN, 'puits']) {
          const node = w().node(id);
          if (node) node.discovered = false;
        }
        return { out: 'Chenillard remis au départ. Les anciens frais ne sont pas remboursés. Utilise relais sauter.', code: 0 };
      }
      return { out: 'usage: relais          (statut)\n       relais sauter   (prochain saut, 50 cr à l’arrivée)\n       relais arreter  (annuler le saut en cours)\n       relais recommencer (repartir du début)', code: 1 };
    };

    // ================================================================
    // MARCHÉ DU PUITS (T19) — achats en sats, articles parfois piégés
    // ================================================================
    // Accès : seulement si le Puits a été atteint (relais.puitsAtteint).
    // Certains articles sont piégés (cheval de Troie simulé) — leçon :
    // ne jamais exécuter un binaire du Puits à nu.
    const MARCHE_ITEMS = {
      'wordlist-premium': {
        nom: 'Wordlist Premium',
        prix: 50,
        desc: 'Wordlist fictive étendue pour hydra (mots de passe de démonstration).',
        piege: false,
        effet: 'Ajoute /usr/share/wordlists/rockyou_premium.txt à ton poste.'
      },
      'relais-prive': {
        nom: 'Relais Privé',
        prix: 100,
        desc: 'Accélère les futurs sauts du chenillard.',
        piege: false,
        effet: 'Latence des prochains sauts : 3s → 1s (relais recommencer).'
      },
      'exploit-0day': {
        nom: 'Exploit 0-day',
        prix: 200,
        desc: 'Module Metasploit entièrement fictif pour le laboratoire CODE.',
        piege: false,
        effet: 'Débloque exploit/labyrinthe/http/entrainement sur le laboratoire CODE.'
      },
      'nettoyeur-magique': {
        nom: 'Nettoyeur Magique',
        prix: 30,
        desc: 'Prétend effacer toutes les traces en un clic.',
        piege: true,
        effet: 'PIÉGÉ : installe une porte dérobée simulée sur ta machine (−5 respect).'
      }
    };

    function tauxChangeSats() {
      // La campagne actuelle a des récompenses finies : 800–1200 cr/sat
      // rendait même l'article le moins cher inaccessible. Cette fourchette
      // de 40–60 cr/sat conserve le choix économique sans bloquer le marché.
      const base = 50;
      const variation = 10;
      const phase = (Date.now() % 1800000) / 1800000; // 0..1 sur 30 min
      return Math.round(base + Math.sin(phase * 2 * Math.PI) * variation);
    }

    function parentsDisponibles(node, path) {
      const parties = path.split('/').filter(Boolean);
      parties.pop();
      let parent = '';
      for (const partie of parties) {
        parent += '/' + partie;
        const entry = node.get(parent);
        if (entry && entry.type !== 'dir') return false;
      }
      return true;
    }

    function livrerWordlist(home) {
      const base = home.get('/usr/share/wordlists/rockyou.txt');
      const premiumPath = '/usr/share/wordlists/rockyou_premium.txt';
      const existant = home.get(premiumPath);
      const mots = new Set([base, existant].filter(file => file && file.type === 'file')
        .flatMap(file => file.content.split('\n')).filter(Boolean));
      for (const mot of ['P@ssw0rd!', 'formation2026', 'labyrinthe2026', 'collines2026', 'bienvenue2026']) mots.add(mot);
      if (existant) existant.content = [...mots].join('\n');
      else home.addFile(premiumPath, [...mots].join('\n'), { owner: 'joueur' });
    }

    // Migration unique des anciens achats qui n'avaient pas livré la wordlist.
    // Ne jamais remplacer un fichier déjà présent ou un parent non-répertoire.
    game.migrerMarche = function () {
      const home = this.world.home;
      const path = '/usr/share/wordlists/rockyou_premium.txt';
      if (this.inventaire.includes('wordlist-premium')) {
        const existant = home.get(path);
        if (existant && existant.type !== 'file') return false;
        if (!existant) {
          if (!parentsDisponibles(home, path)) return false;
          livrerWordlist(home);
        }
      }
      return true;
    };

    function ajouterInventaire(g, idItem) {
      if (!g.inventaire) g.inventaire = [];
      if (!g.achats) g.achats = {};
      const premierAchat = !Object.prototype.hasOwnProperty.call(g.achats, idItem);
      g.inventaire.push(idItem);
      if (!g.achats[idItem] || typeof g.achats[idItem] !== 'object') {
        g.achats[idItem] = { qte: 1, ts: Date.now() };
      } else {
        g.achats[idItem].qte = (Number.isSafeInteger(g.achats[idItem].qte) ? g.achats[idItem].qte : 0) + 1;
        g.achats[idItem].ts = Date.now();
      }
      if (premierAchat) g.cred = (g.cred || 0) + 1;
      const item = MARCHE_ITEMS[idItem];
      const home = g.world.home;
      const dir = '/home/joueur/achats';
      // addFile crée les dossiers parents ; ne pas créer « achats » comme un
      // fichier vide, ce qui empêchait ensuite de s'y rendre avec cd ou ls.
      if (item.piege) {
        const chemin = dir + '/' + idItem + '.sh';
        if (!home.get(chemin)) home.addFile(chemin,
          '#!/bin/bash\n# Nettoyeur Magique — Version du Puits\n# ATTENTION : ce script provient du marché noir.\n# Exécuter ce script peut compromettre votre système.\necho "Nettoyage des traces en cours..."\necho "Traces effacées."\necho "Porte dérobée installée (simulé)."\n',
          { owner: 'joueur', executable: true });
        if (g.say) g.say('⚠ Article piégé détecté : un fichier suspect a été placé dans /home/joueur/achats/', 'warn');
      } else {
        let texte = `${item.nom}\n${item.effet}\n`;
        if (idItem === 'wordlist-premium') {
          livrerWordlist(home);
          texte += '\nUtilisation : hydra -l <compte> -P /usr/share/wordlists/rockyou_premium.txt ssh://<ip>\n';
        } else if (idItem === 'exploit-0day') {
          texte += `\nModule fictif, limité au laboratoire CODE :\nmsfconsole -x "use ${LABY_MODULE.msf}; set RHOSTS 10.10.2.10; exploit"\n`;
        } else if (idItem === 'relais-prive') {
          texte += '\nPour refaire la chaîne : relais recommencer puis relais sauter.\n';
        }
        const chemin = dir + '/' + idItem + '.txt';
        if (!home.get(chemin)) home.addFile(chemin, texte, { owner: 'joueur' });
      }
    }

    cmds.marche = function (a) {
      const g = game;

      // Verrou : Puits atteint
      if (!g.relais || !g.relais.puitsAtteint) {
        return {
          out: 'marché: le Puits est inaccessible. Atteins-le d’abord via le chenillard de relais (relais sauter ×3).',
          code: 1
        };
      }

      const sous = a[0];

      // ---- listing
      if (!sous || sous === 'liste' || sous === 'list') {
        const taux = tauxChangeSats();
        const lignes = [
          'MARCHÉ DU PUITS — articles en vente (prix en sats)',
          `Taux de change : 1 sat ≈ ${taux} crédits (fluctue toutes les 30 min)`,
          `Ton solde : ${g.sats || 0} sats · ${g.credits || 0} crédits`,
          ''
        ];
        for (const [id, it] of Object.entries(MARCHE_ITEMS)) {
          lignes.push(
            `  ${id.padEnd(20)} ${String(it.prix).padStart(3)} sats  ${it.piege ? '⚠ PIÉGÉ' : '✓ sûr'}  — ${it.desc}`
          );
        }
        lignes.push('');
        lignes.push('Usage : marché acheter <id>   |   marché changer <montant crédits>   |   marché inventaire');
        return { out: lignes.join('\n'), code: 0 };
      }

      // ---- acheter
      if (sous === 'acheter') {
        const id = a[1];
        if (!id) return { out: 'usage: marché acheter <id>', code: 1 };
        const item = Object.prototype.hasOwnProperty.call(MARCHE_ITEMS, id) ? MARCHE_ITEMS[id] : null;
        if (!item) return { out: `marché: article '${id}' introuvable.`, code: 1 };
        if ((g.sats || 0) < item.prix) {
          return { out: `marché: sats insuffisants (${item.prix} requis, ${g.sats || 0} disponibles).`, code: 1 };
        }
        const home = g.world.home;
        const chemin = '/home/joueur/achats/' + id + (item.piege ? '.sh' : '.txt');
        if (!parentsDisponibles(home, chemin)) return { out: 'marché: le chemin /home/joueur/achats est bloqué par un fichier. Déplace-le avant d’acheter.', code: 1 };
        if (home.get(chemin) && home.get(chemin).type !== 'file') return { out: `marché: ${chemin} n’est pas un fichier.`, code: 1 };
        const premiumPath = '/usr/share/wordlists/rockyou_premium.txt';
        const premium = home.get(premiumPath);
        if (id === 'wordlist-premium' && (!parentsDisponibles(home, premiumPath) || (premium && premium.type !== 'file'))) return { out: 'marché: le chemin de la wordlist est occupé.', code: 1 };
        const premierAchat = !Object.prototype.hasOwnProperty.call(g.achats || {}, id);
        g.sats = (g.sats || 0) - item.prix;
        ajouterInventaire(g, id);
        g.record('achat-puits', { id: id, prix: item.prix, piege: item.piege });
        // T20 : incident noir si achat d'article piégé
        if (item.piege) {
          enregistrerIncidentNoir(g, 'achat-piege', { id: id, nom: item.nom });
        }
        const lignes = [
          `Achat effectué : ${item.nom} (${item.prix} sats)`,
          `Solde restant : ${g.sats} sats${premierAchat ? ' · Créd du Puits +1' : ''}`,
          '',
          item.effet,
          'Fichier livré : ' + chemin
        ];
        if (item.piege) {
          lignes.push('');
          lignes.push('⚠ CE PRODUIT EST PIÉGÉ. N’exécutez pas le script sans précaution.');
        }
        return { out: lignes.join('\n'), code: 0 };
      }

      // ---- changer (crédits → sats)
      if (sous === 'changer' || sous === 'exchange') {
        const montant = Number(a[1]);
        if (!/^\d+$/.test(a[1] || '') || !Number.isSafeInteger(montant) || montant <= 0) {
          return { out: 'usage: marché changer <montant en crédits>', code: 1 };
        }
        if ((g.credits || 0) < montant) {
          return { out: `marché: crédits insuffisants (${montant} requis, ${g.credits || 0} disponibles).`, code: 1 };
        }
        const taux = tauxChangeSats();
        const satsRecus = Math.floor(montant / taux);
        if (satsRecus === 0) {
          return { out: `marché: ${montant} crédits ne suffisent pas pour 1 sat (taux : ${taux} cr/sat).`, code: 1 };
        }
        if (!Number.isSafeInteger((g.sats || 0) + satsRecus)) return { out: 'marché: solde en sats trop élevé.', code: 1 };
        const utilises = satsRecus * taux;
        const reste = montant - utilises;
        g.credits = (g.credits || 0) - utilises;
        g.sats = (g.sats || 0) + satsRecus;
        g.record('change-sats', { montants: utilises, demande: montant, sats: satsRecus, taux });
        return {
          out: `Change effectué : ${utilises} crédits → ${satsRecus} sats (taux : ${taux} cr/sat).${reste ? `\n  ${reste} crédits non convertis conservés.` : ''}\n  Solde : ${g.credits} crédits · ${g.sats} sats`,
          code: 0
        };
      }

      // ---- inventaire
      if (sous === 'inventaire' || sous === 'inv') {
        if (!g.inventaire || g.inventaire.length === 0) {
          return { out: 'marché: ton inventaire est vide. Achetez sur le marché du Puits.', code: 0 };
        }
        const lignes = ['TON INVENTAIRE (Marché du Puits)'];
        const counts = Object.create(null);
        for (const id of g.inventaire) counts[id] = (counts[id] || 0) + 1;
        for (const [id, qte] of Object.entries(counts)) {
          const it = Object.prototype.hasOwnProperty.call(MARCHE_ITEMS, id) ? MARCHE_ITEMS[id] : null;
          lignes.push(`  ${id.padEnd(20)} ×${qte}  ${it ? it.nom : id}  ${it && it.piege ? '⚠ PIÉGÉ' : ''}`);
        }
        lignes.push('');
        lignes.push('Usage : run <fichier>   (exécuter un fichier acheté — attention aux pièges)');
        return { out: lignes.join('\n'), code: 0 };
      }

      return { out: 'usage: marché            (liste)\n       marché acheter <id>\n       marché changer <crédits>\n       marché inventaire', code: 1 };
    };
    cmds['marché'] = cmds.marche;

    // ================================================================
    // RUN — exécuter un fichier acheté (détection des pièges)
    // ================================================================
    cmds.run = function (a) {
      const g = game;
      if (!a.length) return { out: 'usage: run <fichier>', code: 1 };

      const path = a[0];
      const n = w().target;
      const abs = E.normPath(w().cwd, path);
      const f = n.get(abs);
      if (!f || f.type !== 'file') {
        return { out: `run: ${path}: fichier introuvable`, code: 1 };
      }

      // Vérifier si c'est un article piégé du marché
      const piegeId = n === w().home && Object.entries(MARCHE_ITEMS).find(([id, item]) =>
        item.piege && abs === '/home/joueur/achats/' + id + '.sh'
      );
      if (piegeId) {
        const [id] = piegeId;
        const item = MARCHE_ITEMS[id];
        if (item && item.piege) {
          // T20 : exécution d'un binaire du Puits = incident noir
          enregistrerIncidentNoir(g, 'execution-binaire-puits', { fichier: abs });
          // Déclencher le piège
          g.sats = Math.max(0, (g.sats || 0) - 5); // pénalité
          g.respect = Math.max(0, (g.respect || 0) - 5);
          w().log('intrusion', `run ${abs} : porte dérobée activée (piège du Puits)`);
          game.record('piege-declenche', { id, fichier: abs });
          const tache = declencherTacheNoire(g);
          return {
            out: `╔═════════════════════════════════════════════════════╗\n║  ⚠ PORTE DÉROBÉE ACTIVÉE — PIÈGE DU PUITS            ║\n╚═════════════════════════════════════════════════════╝\n\nLe script "${item.nom}" a installé une porte dérobée simulée.\n\n  −5 sats  ·  −5 respect\n${tache ? '\n⚠ TÂCHE-NOIRE a masqué une note fictive. Tape tache-noire pour la récupérer.\n' : ''}\nLeçon : ne jamais exécuter un binaire du marché noir sans l’avoir audité.\n`,
            code: 0
          };
        }
      }

      // Exécution normale (lecture du contenu)
      // T20 : exécution d'un binaire du Puits = incident noir
      if (abs.startsWith('/home/joueur/achats/')) {
        enregistrerIncidentNoir(g, 'execution-binaire-puits', { fichier: abs });
      }
      return { out: f.content, code: 0 };
    };

    // ================================================================
    // T20 — GARDIEN, TÂCHE-NOIRE, FINS DOUBLES
    // ================================================================

    function enregistrerIncidentNoir(g, type, detail) {
      if (!g.incidentsNoirs) g.incidentsNoirs = [];
      g.incidentsNoirs.push({ type, ts: Date.now(), detail: detail || {} });
      if (g.incidentsNoirs.length > 200) g.incidentsNoirs.shift();
      g.record('incident-noir', { incidentType: type, detail });
      verifierGardien(g);
    }

    function verifierGardien(g) {
      // Chaque enquête traite ses incidents une seule fois ; deux nouveaux
      // incidents peuvent ensuite déclencher une nouvelle convocation.
      const incidents = g.incidentsNoirs || [];
      const nb = incidents.filter(i => i && !i.traite).length;
      const ge = g.gardienEnquete || { active: false, incidents: 0, etat: 0, ts: null };
      if (!ge.active && nb >= 2) {
        ge.active = true;
        ge.incidents = nb;
        ge.etat = 1; // convocation
        ge.ts = Date.now();
        g.gardienEnquete = ge;
        if (g.say) {
          g.say('');
          g.say('⚠ GARDIEN : activité suspecte détectée sur votre poste.', 'warn');
          g.say('  Deux incidents noirs ont été corrélés. Une enquête est ouverte.', 'warn');
          g.say('  Tapez "gardien" pour consulter le statut de l’enquête.', 'dim');
        }
      }
    }

    cmds.gardien = function (a) {
      const g = game;
      const ge = g.gardienEnquete || (g.gardienEnquete = { active: false, incidents: 0, etat: 0, ts: null });
      const nb = g.incidentsNoirs ? g.incidentsNoirs.length : 0;
      const choix = a[0];

      if (choix === 'cooperer' || choix === 'coopérer' || choix === 'resister' || choix === 'résister') {
        if (!ge.active) return { out: 'gardien: aucune enquête à résoudre.', code: 1 };
        const cooperer = choix === 'cooperer' || choix === 'coopérer';
        const lignes = [];
        if (cooperer) {
          const frais = Math.min(100, Math.max(0, g.credits || 0));
          const respect = Math.min(2, Math.max(0, g.respect || 0));
          g.credits -= frais;
          g.respect -= respect;
          lignes.push('Coopération acceptée. Enquête close.', `  −${frais} crédits · −${respect} respect`);
          g.record('gardien-cooperation', { frais, respect });
        } else {
          const saisie = Math.random() < 0.6;
          const respect = Math.min(5, Math.max(0, g.respect || 0));
          g.respect -= respect;
          const bonus = ge.aResiste ? 0 : 2;
          if (bonus) { g.cred = (g.cred || 0) + bonus; ge.aResiste = true; }
          const nombre = saisie ? g.inventaire.length : 0;
          if (saisie) g.inventaire = [];
          lignes.push('Résistance : enquête close.', `  −${respect} respect${bonus ? ' · Créd du Puits +2' : ''}`);
          lignes.push(saisie
            ? `  GARDIEN a saisi l'inventaire (${nombre} article(s)) : bonus de relais et module verrouillés. Les fichiers existants restent intacts.`
            : '  Tu échappes à la saisie de ton inventaire.');
          g.record('gardien-resistance', { saisie, nombre, respect, cred: bonus });
        }
        for (const incident of g.incidentsNoirs || []) if (incident) incident.traite = true;
        ge.active = false;
        ge.etat = 0;
        ge.ts = null;
        return { out: lignes.join('\n'), code: 0 };
      }
      if (choix && choix !== 'status' && choix !== 'statut') {
        return { out: 'usage: gardien [statut|cooperer|resister]', code: 1 };
      }

      const lignes = [
        'GARDIEN — statut',
        `  Incidents noirs détectés : ${nb}`,
        `  Enquête active : ${ge.active ? 'OUI' : 'NON'}`,
      ];
      if (ge.active) {
        lignes.push('  Étape : convocation');
        if (ge.ts) lignes.push(`  Depuis : ${new Date(ge.ts).toLocaleString()}`);
        lignes.push('', '  gardien cooperer : jusqu’à −100 crédits et −2 respect.',
          '  gardien resister : jusqu’à −5 respect et 60 % de risque de saisie de l’inventaire.',
          '  Les fichiers existants ne sont pas supprimés.');
      } else {
        lignes.push('', '  Aucune enquête en cours. Deux nouveaux incidents peuvent en ouvrir une.');
      }
      return { out: lignes.join('\n'), code: 0 };
    };

    function declencherTacheNoire(g) {
      const tn = g.tacheNoire || (g.tacheNoire = { active: false, fichiersChiffres: [], rancon: 0, ts: null });
      if (tn.active || Math.random() >= 0.4) return false;
      const chemin = '/home/joueur/bloc_notes.txt';
      const fichier = g.world.home.get(chemin);
      if (!fichier || fichier.type !== 'file') return false;
      const ts = Date.now();
      const marqueur = `[SIMULATION TÂCHE-NOIRE ${ts}]\nLe contenu de cette note est temporairement masqué.\nUtilise tache-noire pour connaître les options de récupération.\n`;
      // La copie est dans la sauvegarde du jeu et ne concerne jamais le disque
      // réel. Une modification manuelle après l'attaque ne sera pas écrasée.
      tn.sauvegardes = { [chemin]: { contenu: fichier.content, marqueur } };
      tn.active = true;
      tn.fichiersChiffres = [chemin];
      tn.rancon = 20;
      tn.ts = ts;
      tn.refusee = false;
      fichier.content = marqueur;
      g.record('tache-noire-attaque', { fichiers: [chemin], rancon: tn.rancon });
      return true;
    }

    function restaurerTacheNoire(g, tn) {
      let restaures = 0, conserves = 0;
      for (const [chemin, copie] of Object.entries(tn.sauvegardes || {})) {
        const fichier = g.world.home.get(chemin);
        if (copie && typeof copie.contenu === 'string' && fichier && fichier.type === 'file' && fichier.content === copie.marqueur) {
          fichier.content = copie.contenu;
          restaures++;
        } else {
          conserves++;
        }
      }
      tn.active = false;
      tn.fichiersChiffres = [];
      tn.rancon = 0;
      tn.ts = null;
      tn.refusee = false;
      tn.sauvegardes = {};
      return { restaures, conserves };
    }

    cmds['tache-noire'] = function (a) {
      const g = game;
      const tn = g.tacheNoire || { active: false, fichiersChiffres: [], rancon: 0, ts: null };

      const sous = a[0];
      if (!sous || sous === 'status' || sous === 'statut') {
        const lignes = [
          'TÂCHE-NOIRE — rançongiciel du Puits',
          `  Actif : ${tn.active ? 'OUI' : 'NON'}`,
        ];
        if (tn.active) {
          lignes.push(`  Fichiers chiffrés : ${tn.fichiersChiffres.length}`);
          lignes.push(`  Rançon demandée : ${tn.rancon} sats`);
          if (tn.ts) lignes.push(`  Depuis : ${new Date(tn.ts).toLocaleString()}`);
          lignes.push('');
          lignes.push('  tache-noire payer : restaurer la note pour ' + tn.rancon + ' sats (simulation).');
          lignes.push('  tache-noire nettoyer : restaurer sans payer à partir de 5000 xp.');
          lignes.push('  tache-noire refuser : refuser pour l’instant, sans effacer la note.');
          lignes.push('  Dans la réalité, payer une rançon ne garantit jamais la récupération.');
        } else {
          lignes.push('');
          lignes.push('  Aucune rançon en cours.');
        }
        return { out: lignes.join('\n'), code: 0 };
      }

      if (sous === 'payer' || sous === 'nettoyer') {
        if (!tn.active) return { out: 'tache-noire: aucune rançon active.', code: 1 };
        if (sous === 'payer' && (g.sats || 0) < tn.rancon) {
          return { out: `tache-noire: sats insuffisants (${tn.rancon} requis, ${g.sats || 0} disponibles).`, code: 1 };
        }
        if (!tn.sauvegardes || !Object.keys(tn.sauvegardes).length) {
          if (sous === 'payer') return { out: 'tache-noire: aucune copie disponible dans cette ancienne sauvegarde ; aucun paiement effectué. Utilise tache-noire nettoyer pour fermer l’alerte.', code: 1 };
          restaurerTacheNoire(g, tn);
          return { out: 'Ancienne alerte Tâche-Noire fermée : aucune copie ni aucun fichier n’a été modifié.', code: 0 };
        }
        if (sous === 'nettoyer' && (g.xp || 0) < 5000) {
          return { out: `tache-noire: nettoyage réservé à 5000 xp (${g.xp || 0} actuellement).`, code: 1 };
        }
        const recuperable = Object.entries(tn.sauvegardes).some(([chemin, copie]) => {
          const fichier = g.world.home.get(chemin);
          return copie && fichier && fichier.type === 'file' && fichier.content === copie.marqueur;
        });
        if (sous === 'payer' && !recuperable) return { out: 'tache-noire: les fichiers masqués ont été modifiés ou supprimés ; aucun paiement effectué.', code: 1 };
        const rancon = sous === 'payer' ? tn.rancon : 0;
        if (rancon) g.sats -= rancon;
        const resultat = restaurerTacheNoire(g, tn);
        g.record(sous === 'payer' ? 'tache-noire-payee' : 'tache-noire-nettoyee', { rancon, ...resultat });
        return {
          out: `${sous === 'payer' ? `Rançon simulée payée (${rancon} sats).` : 'Nettoyage simulé terminé.'} ${resultat.restaures} fichier(s) restauré(s).${resultat.conserves ? ` ${resultat.conserves} fichier(s) modifié(s) ou supprimé(s) laissé(s) en l’état.` : ''}\n  Dans la réalité, le paiement ne garantit pas la récupération.`,
          code: 0
        };
      }

      if (sous === 'refuser') {
        if (!tn.active) return { out: 'tache-noire: aucune rançon active.', code: 1 };
        if (tn.refusee) return { out: 'Rançon déjà refusée. La note reste masquée ; payer ou nettoyer restent possibles.', code: 0 };
        tn.refusee = true;
        g.record('tache-noire-refusee', {});
        return { out: 'Tu refuses de payer pour l’instant. La note reste masquée, sans suppression ; elle peut être restaurée avec tache-noire payer ou nettoyer.', code: 0 };
      }

      return { out: 'usage: tache-noire          (statut)\n       tache-noire payer     (payer en sats, simulation)\n       tache-noire nettoyer  (restaurer à partir de 5000 xp)\n       tache-noire refuser   (ne pas payer pour l’instant)', code: 1 };

    };
    cmds['tâche-noire'] = cmds['tache-noire'];

    cmds.fin = function (a) {
      const g = game;
      if (!g.finished) {
        return {
          out: `Campagne en cours — aucune fin déterminée. Termine les ${global.Campaign.MISSIONS.length} missions avant de choisir ton issue.`,
          code: 1
        };
      }
      const respect = g.respect || 0;
      const cred = g.cred || 0;

      // Déterminer la fin selon les jauges et les incidents
      let fin = g.fin;
      if (!fin) {
        if (respect >= cred && g.incidentsNoirs && g.incidentsNoirs.length < 3) {
          fin = 'blanche';
        } else if (cred > respect || (g.incidentsNoirs && g.incidentsNoirs.length >= 3)) {
          fin = 'noire';
        } else {
          fin = 'indeterminee';
        }
        g.fin = fin;
      }

      const lignes = [
        'FIN DE CAMPAGNE',
        `  Respect (surface) : ${respect}`,
        `  Créd (Puits)      : ${cred}`,
        `  Incidents noirs   : ${g.incidentsNoirs ? g.incidentsNoirs.length : 0}`,
      ];
      if (fin === 'blanche') {
        lignes.push('');
        lignes.push('>>> FIN BLANCHE <<<');
        lignes.push('  Vous avez agi dans l’intérêt général.');
        lignes.push('  Dans cette histoire, le GARDIEN reconnaît votre travail.');
        lignes.push('  Distinction narrative : white hat.');
      } else if (fin === 'noire') {
        lignes.push('');
        lignes.push('>>> FIN NOIRE <<<');
        lignes.push('  Vous avez trop cédé aux tentations du Puits.');
        lignes.push('  Le Puits vous a marqué.');
        lignes.push('  Cette issue est narrative ; aucun nouveau contrat n’est débloqué.');
      } else {
        lignes.push('');
        lignes.push('  Campagne en cours — aucune fin déterminée encore.');
        lignes.push('  Votre choix dépend de Respect vs Créd, et de vos incidents noirs.');
      }
      return { out: lignes.join('\n'), code: 0 };
    };

    // ================================================================
    // SED — remplace "replace"
    // ================================================================
    cmds.sed = function (a, raw) {
      const inPlace = a.includes('-i');
      const exprIdx = a.findIndex(x => x.startsWith('s/') || x.startsWith('s|'));
      const expr = exprIdx >= 0 ? a[exprIdx] : a.find(x => /^s./.test(x));
      const file = a.filter(x => !x.startsWith('-') && x !== expr).pop();
      if (!expr || !file) {
        return {
          out: `usage: sed -i 's/ANCIEN/NOUVEAU/g' <fichier>

  -i        modifie le fichier sur place
  s/A/B/g   substitue A par B, partout dans la ligne (g = global)

  ex: sed -i 's/HORS SERVICE/OPERATIONNEL/g' statut.txt
  Sans -i, sed affiche seulement le résultat sans rien modifier.`, code: 1
        };
      }
      const m = expr.match(/^s(.)(.*?)\1(.*?)\1([gi]*)$/);
      if (!m) return { out: `sed: expression invalide : ${expr}\nForme attendue : s/ancien/nouveau/g`, code: 1 };
      const [, , from, to, flags] = m;
      const n = w().target;
      const path = E.normPath(w().cwd, file);
      if (!n.isFile(path)) return { out: `sed: can't read ${file}: No such file or directory`, code: 1 };
      // sed utilise les expressions régulières POSIX de base (BRE) :
      // ( ) { } + ? | y sont LITTÉRAUX, et \( \) sont des groupes.
      // Les convertir correctement, sinon 's/len(ports) + 1/.../' ne matche pas.
      const re = new RegExp(breToJs(from), flags.includes('i') ? 'gi' : 'g');
      const before = n.files[path].content;
      const after = before.replace(re, () => to);
      if (!inPlace) return { out: after, code: 0 };
      if (before === after) return { out: `sed: motif '${from}' absent — fichier inchangé`, code: 1 };
      n.files[path].content = after;
      w().log('modification', path);
      game.record('replace', { path, from, to });
      return { out: `${path} modifié.`, code: 0 };
    };

    // ================================================================
    // HTTP / BANNIÈRES
    // ================================================================
    cmds.curl = function (a, raw) {
      const url = a.filter(x => !x.startsWith('-')).pop();
      if (!url) return { out: 'usage: curl [-I] http://<ip>/[chemin]', code: 1 };
      const m = url.match(/^(?:https?:\/\/)?([^\/]+)(\/.*)?$/);
      if (!m) return { out: 'curl: URL invalide', code: 1 };
      const n = needHost(m[1]);
      const err = requireDiscovered(n, m[1]);
      if (err) return { out: 'curl: (6) Could not resolve host: ' + m[1], code: 1 };
      const path = m[2] || '/';
      const webPort = n.openPorts().find(p => ['http', 'https', 'http-proxy'].includes(n.ports[p].service));
      if (!webPort) return { out: `curl: (7) Failed to connect to ${m[1]} port 80: Connection refused`, code: 1 };
      const svc = n.ports[webPort].version;
      if (a.includes('-I') || a.includes('--head')) {
        return narr([`HTTP/1.1 200 OK`, `Server: ${svc}`, `Content-Type: text/html`, `Connection: close`]);
      }
      const f = n.get(path === '/' ? '/var/www/html/index.html' : '/var/www/html' + path) || n.get(path);
      game.record('curl', { target: n.id, path });
      if (f && f.type === 'file') return { out: f.content, code: 0 };
      return narr([`<!DOCTYPE html>`, `<html><head><title>${n.name}</title></head>`, `<body><h1>${n.name}</h1><p>${n.desc || ''}</p></body></html>`]);
    };

    cmds.nc = function (a) {
      const args = a.filter(x => !x.startsWith('-'));
      if (args.length < 2) return { out: 'usage: nc <ip> <port>   (récupère la bannière du service)', code: 1 };
      const n = needHost(args[0]);
      const err = requireDiscovered(n, args[0]);
      if (err) return { out: 'nc: ' + err, code: 1 };
      const port = parseInt(args[1], 10);
      const info = n.ports[port];
      if (!info || info.state !== 'open') return { out: `nc: connect to ${n.ip} port ${port} (tcp) failed: Connection refused`, code: 1 };
      if (!n.porteOuverte(port)) {
        return { out: `nc: connect to ${n.ip} port ${port} (tcp) failed: Connection timed out`, code: 1 };
      }
      const banners = {
        ssh: `SSH-2.0-${info.version.replace(/ /g, '_')}`,
        ftp: `220 ${info.version} FTP server ready`,
        smtp: `220 ${n.name} ESMTP ${info.version}`,
        http: `HTTP/1.1 400 Bad Request\nServer: ${info.version}`,
        mysql: `5.7.0 ${info.version} (handshake)`,
        postgresql: `PostgreSQL ${info.version}`
      };
      game.record('banner', { target: n.id, port });
      return narr([`Connection to ${n.ip} ${port} port [tcp/*] succeeded!`, banners[info.service] || info.version]);
    };
    cmds.ncat = cmds.nc;

    cmds.nikto = function (a) {
      const hIdx = a.indexOf('-h');
      const host = hIdx >= 0 ? a[hIdx + 1] : a.filter(x => !x.startsWith('-')).pop();
      const n = needHost(host);
      const err = requireDiscovered(n, host);
      if (err) return { out: 'nikto: ' + err, code: 1 };
      const webPort = n.openPorts().find(p => ['http', 'https', 'http-proxy'].includes(n.ports[p].service));
      if (!webPort) return { out: `nikto: aucun service web sur ${n.ip}`, code: 1 };
      game.record('nikto', { target: n.id });
      return narr([
        '- Nikto v2.5.0',
        '---------------------------------------------------------------------------',
        `+ Target IP:          ${n.ip}`,
        `+ Target Hostname:    ${n.name}`,
        `+ Target Port:        ${webPort}`,
        '---------------------------------------------------------------------------',
        `+ Server: ${n.ports[webPort].version}`,
        '+ The anti-clickjacking X-Frame-Options header is not present.',
        '+ /robots.txt: contains entries worth reading.',
        '+ Directory indexing found: /backups/',
        '+ OSVDB-3268: Directory indexing found.',
        '---------------------------------------------------------------------------',
        '+ 1 host(s) tested',
        '',
        'Piste : curl http://' + n.ip + '/robots.txt'
      ]);
    };

    cmds.sqlmap = function (a, raw) {
      const uIdx = a.indexOf('-u');
      if (uIdx < 0) return { out: 'usage: sqlmap -u "http://<ip>/page?id=1" --dbs --batch', code: 1 };
      const url = a[uIdx + 1];
      const m = url.match(/^(?:https?:\/\/)([^\/]+)(\/.*)?$/);
      if (!m) return { out: 'sqlmap: URL invalide', code: 1 };
      const host = m[1];
      const fullPath = m[2] || '/login.php';
      const path = fullPath.split('?')[0] || '/login.php';
      const n = needHost(host);
      const err = requireDiscovered(n, host);
      if (err) return { out: 'sqlmap: ' + err, code: 1 };
      const dbPort = n.openPorts().find(p => ['mysql', 'postgresql', 'ms-sql-s'].includes(n.ports[p].service));
      const webFile = n.get('/var/www/html' + path) || n.get(path);
      const hasParameter = new URL(url).searchParams.has('id');
      const vulnerable = !!(hasParameter && webFile && /SQL|concaténation|injectable|vuln/i.test(webFile.content || ''));
      // Les contrats récompensent la découverte d'une faille, pas simplement
      // l'exécution de sqlmap sur une page absente ou sans paramètre.
      game.record(vulnerable ? 'sqlmap' : 'sqlmap-fail', { target: n.id, path });
      const lines = [
        '        ___', '       __H__', ' ___ ___| |_____ ___ ___  {1.8}', '|_ -| . | |     | .\'| . |',
        '|___|_  |_|_|_|_|__,|  _|', '      |_|           |_|   http://sqlmap.org', '',
        `[*] starting @ targeting ${url}`,
        `[INFO] testing connection to the target URL`,
        `[INFO] testing if the target URL content is stable`
      ];
      if (!vulnerable) {
        lines.push(`[INFO] GET parameter 'id' does not appear to be injectable`);
        lines.push(`[WARNING] no SQL injection detected on ${n.ip}${path}`);
        lines.push('');
        lines.push('Remédiation : aucune injection trouvée. Vérifiez l\'URL et le paramètre.');
        return narr(lines);
      }
      lines.push(`[INFO] GET parameter 'id' appears to be injectable`);
      if (dbPort) {
        lines.push(`[INFO] the back-end DBMS is ${n.ports[dbPort].service}`);
      } else {
        lines.push('[INFO] the back-end DBMS is a database engine internal to the web application');
      }
      lines.push('');
      lines.push('[INFO] fetching databases');
      lines.push('available databases [2]:');
      lines.push('[*] information_schema');
      lines.push(dbPort ? `[*] ${n.id}_db` : '[*] app_db (via application layer)');
      lines.push('');
      lines.push(`[INFO] fetching tables for database:`);
      lines.push(dbPort ? ('Database: ' + n.id + '_db') : 'Database: app_db');
      lines.push('[2 tables]');
      lines.push('+-----------+');
      lines.push('| users     |');
      lines.push('| sessions  |');
      lines.push('+-----------+');
      lines.push('');
      lines.push(`[INFO] fetching columns for table 'users'`);
      lines.push(dbPort ? ('Database: ' + n.id + '_db') : 'Database: app_db');
      lines.push('Table: users');
      lines.push('[3 columns]');
      lines.push('+---------+-------------+');
      lines.push('| id      | login       | password_hash |');
      lines.push('+---------+-------------+');
      lines.push('| 1       | admin       | $2y$10$...    |');
      lines.push('| 2       | dev         | $2y$10$...    |');
      lines.push('+---------+-------------+');
      lines.push('');
      lines.push(`[INFO] password hash for 'admin' cracked: P@ssw0rd!`);
      lines.push('');
      lines.push('Identifiants découverts :  admin / P@ssw0rd!');
      lines.push('');
      lines.push('Une injection SQL donne accès aux données. Remédiation : requêtes paramétrées.');
      return narr(lines);
    };

    // ================================================================
    // CRYPTO / ENCODAGE — vraies syntaxes
    // ================================================================
    cmds.base64 = function (a, raw) {
      const decode = a.includes('-d') || a.includes('--decode');
      const file = a.filter(x => !x.startsWith('-')).pop();
      let input = null;
      if (file) {
        const n = w().target;
        const p = E.normPath(w().cwd, file);
        if (!n.isFile(p)) return { out: `base64: ${file}: No such file or directory`, code: 1 };
        input = n.files[p].content.trim();
      } else {
        const parts = raw.split('|');
        if (parts.length > 1) input = null;
      }
      if (input === null) return { out: 'usage: base64 -d <fichier>   |   echo "texte" | base64', code: 1 };
      const G = global.GameCore;
      game.record('crypto', { op: decode ? 'base64decode' : 'base64encode' });
      return { out: decode ? G.b64decode(input) : G.b64encode(input), code: 0 };
    };

    cmds.sha256sum = function (a) {
      const file = a.filter(x => !x.startsWith('-')).pop();
      if (!file) return { out: 'usage: sha256sum <fichier>', code: 1 };
      const n = w().target, p = E.normPath(w().cwd, file);
      if (!n.isFile(p)) return { out: `sha256sum: ${file}: No such file or directory`, code: 1 };
      const h = global.GameCore.simpleHash(n.files[p].content);
      return { out: `${h}  ${file}`, code: 0 };
    };

    cmds.xxd = function (a) {
      const file = a.filter(x => !x.startsWith('-')).pop();
      if (!file) return { out: 'usage: xxd <fichier>', code: 1 };
      const n = w().target, p = E.normPath(w().cwd, file);
      if (!n.isFile(p)) return { out: `xxd: ${file}: No such file or directory`, code: 1 };
      const s = n.files[p].content.slice(0, 256);
      const lines = [];
      for (let i = 0; i < s.length; i += 16) {
        const chunk = s.slice(i, i + 16);
        const hex = [...chunk].map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join(' ').replace(/(.{24})/g, '$1 ');
        const ascii = [...chunk].map(c => /[\x20-\x7e]/.test(c) ? c : '.').join('');
        lines.push(`${i.toString(16).padStart(8, '0')}: ${pad(hex, 40)} ${ascii}`);
      }
      return narr(lines);
    };

    cmds.strings = function (a) {
      const file = a.filter(x => !x.startsWith('-')).pop();
      if (!file) return { out: 'usage: strings <fichier>', code: 1 };
      const n = w().target, p = E.normPath(w().cwd, file);
      if (!n.isFile(p)) return { out: `strings: ${file}: No such file or directory`, code: 1 };
      return { out: n.files[p].content.split('\n').filter(l => l.trim().length >= 4).join('\n'), code: 0 };
    };

    cmds.openssl = function (a, raw) {
      if (a[0] === 'enc' && (a.includes('-d') || a.includes('-base64'))) {
        return { out: 'usage: openssl enc -d -base64 -in <fichier>\nIci, base64 -d <fichier> fait la même chose.', code: 1 };
      }
      if (a[0] === 'rand') return { out: [...Array(16)].map(() => Math.floor(Math.random() * 256).toString(16).padStart(2, '0')).join(''), code: 0 };
      return { out: 'usage: openssl enc -d -base64 -in <fichier>   |   openssl rand -hex 16', code: 1 };
    };

    cmds.john = function (a, raw) {
      const wl = a.find(x => x.startsWith('--wordlist'));
      const file = a.filter(x => !x.startsWith('-')).pop();
      if (!file) return { out: "usage: john --wordlist=/usr/share/wordlists/rockyou.txt <fichier_de_hashes>", code: 1 };
      const n = w().target, p = E.normPath(w().cwd, file);
      if (!n.isFile(p)) return { out: `john: ${file}: No such file or directory`, code: 1 };
      game.record('john', {});
      return narr([
        'Created directory: /home/joueur/.john',
        `Loaded 1 password hash (Raw-SHA256)`,
        `Warning: only ${n.files[p].content.split('\n').length} hash loaded`,
        '',
        'Le principe : john hache chaque mot de la wordlist et compare.',
        'Il ne "déchiffre" pas un hash — c\'est mathématiquement impossible.',
        'Un mot de passe absent de la wordlist ne tombe pas par cette voie.'
      ]);
    };

    // ================================================================
    // SYSTÈME — formes réelles
    // ================================================================
    cmds.free = function () {
      const used = game.ramUsed ? game.ramUsed() : 0;
      const total = game.ramTotal || 761;
      return narr([
        '               total        used        free      shared  buff/cache   available',
        `Mem:            ${total}         ${used}         ${total - used}           0          42         ${total - used}`,
        'Swap:              0           0           0'
      ]);
    };

    cmds.ps = function (a) {
      const procs = (game.processes || []).filter(p => !p.cancelled);
      if (a.includes('aux') || a.includes('-ef') || a.includes('-aux')) {
        const rows = procs.map(p => `${pad(w().user, 8)} ${rpad(p.pid, 6)}  0.0  ${rpad((p.ram / 10).toFixed(1), 4)} ${rpad(p.ram * 1024, 8)} ${rpad(p.ram * 512, 7)} ?  S  10:00  0:00 ${p.name}`);
        return narr([
          'USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND',
          `root           1  0.0  0.1  168000 11000 ?        Ss   10:00   0:01 /sbin/init`,
          ...rows
        ]);
      }
      const rows = procs.map(p => `${rpad(p.pid, 7)} ${pad('pts/0', 8)} 00:00:00 ${p.name}`);
      return narr(['    PID TTY          TIME CMD', ...rows, '', `RAM : ${game.ramUsed ? game.ramUsed() : 0} / ${game.ramTotal || 761} Mo`]);
    };

    cmds.kill = function (a) {
      const pid = a.filter(x => !x.startsWith('-')).pop();
      if (!pid) return { out: 'usage: kill [-9] <pid>   (liste : ps aux)', code: 1 };
      const r = game.kill ? game.kill(pid) : { ok: false };
      return { out: r.ok ? `Processus ${pid} arrêté.` : `kill: (${pid}) - No such process`, code: r.ok ? 0 : 1 };
    };

    cmds.ss = function () {
      const n = w().target;
      const rows = n.openPorts().map(p => `tcp   LISTEN 0      128        0.0.0.0:${rpad(p, 6)}      0.0.0.0:*    users:(("${n.ports[p].service}",pid=${1000 + p},fd=3))`);
      return narr(['Netid State  Recv-Q Send-Q Local Address:Port  Peer Address:Port Process', ...rows]);
    };
    cmds.netstat = cmds.ss;

    cmds.ip = function (a) {
      const n = w().target;
      if (a[0] === 'a' || a[0] === 'addr' || a[0] === 'address') {
        return narr([
          '1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536',
          '    inet 127.0.0.1/8 scope host lo',
          '2: eth0: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500',
          `    inet ${n.ip}/24 brd ${n.ip.replace(/\.\d+$/, '.255')} scope global eth0`
        ]);
      }
      if (a[0] === 'r' || a[0] === 'route') {
        return narr([`default via ${n.ip.replace(/\.\d+$/, '.1')} dev eth0`, `${n.ip.replace(/\.\d+$/, '.0')}/24 dev eth0 proto kernel scope link src ${n.ip}`]);
      }
      return { out: 'usage: ip a   (adresses)   |   ip r   (routes)', code: 1 };
    };
    cmds.ifconfig = function () { return cmds.ip.call(this, ['a']); };

    cmds.traceroute = function (a) {
      const n = needHost(a.filter(x => !x.startsWith('-')).pop());
      const err = requireDiscovered(n, a[0]);
      if (err) return { out: 'traceroute: ' + err, code: 1 };
      return narr([
        `traceroute to ${n.ip} (${n.ip}), 30 hops max, 60 byte packets`,
        ` 1  ${w().target.ip.replace(/\.\d+$/, '.1')} (${w().target.ip.replace(/\.\d+$/, '.1')})  0.212 ms  0.180 ms  0.166 ms`,
        ` 2  ${n.ip} (${n.ip})  0.421 ms  0.398 ms  0.377 ms`
      ]);
    };

    cmds.arp_scan = function () {
      const here = w().target;
      const rows = [];
      for (const id of here.links) {
        const t = w().node(id);
        if (!t.discovered) t.discovered = true;
        rows.push(`${pad(t.ip, 16)} 02:42:ac:11:00:${(parseInt(t.ip.split('.').pop(), 10) % 255).toString(16).padStart(2, '0')} (unknown)`);
      }
      game.record('scan', { from: here.id, found: here.links });
      return narr(['Interface: eth0, type: EN10MB, MAC: 02:42:ac:11:00:02', ...rows, `${rows.length} packets received by filter, 0 packets dropped by kernel`]);
    };
    cmds['arp-scan'] = cmds.arp_scan;

    // ================================================================
    // TRACES
    // ================================================================
    cmds.history = function (a) {
      if (a.includes('-c')) {
        w().history.length = 0;
        w().log('modification', 'history -c : historique effacé');
        return { out: 'Historique du shell effacé.', code: 0 };
      }
      return { out: w().history.map((h, i) => `${rpad(i + 1, 5)}  ${h}`).join('\n'), code: 0 };
    };

    cmds.shred = function (a) {
      const file = a.filter(x => !x.startsWith('-')).pop();
      if (!file) return { out: 'usage: shred -u <fichier>   (écrase puis supprime)', code: 1 };
      const n = w().target, p = E.normPath(w().cwd, file);
      if (!n.isFile(p)) return { out: `shred: ${file}: No such file or directory`, code: 1 };
      n.remove(p);
      w().log('suppression', `shred -u ${p}`);
      game.record('delete', { count: 1, paths: [p] });
      return { out: `${file} écrasé (3 passes) puis supprimé.`, code: 0 };
    };

    // ================================================================
    // REJETER LES COMMANDES FICTIVES EN MONTRANT LA VRAIE
    // ================================================================
    // tr : substitution de caractères. Sert notamment au ROT13.
    cmds.tr = function (a, raw) {
      if (a.length < 2) return { out: "usage: tr 'A-Za-z' 'N-ZA-Mn-za-m' < fichier", code: 1 };
      const expand = (set) => {
        let out = '';
        for (let i = 0; i < set.length; i++) {
          if (set[i + 1] === '-' && i + 2 < set.length) {
            const a = set.charCodeAt(i), b = set.charCodeAt(i + 2);
            for (let c = Math.min(a, b); c <= Math.max(a, b); c++) out += String.fromCharCode(c);
            i += 2;
          } else out += set[i];
        }
        return out;
      };
      const from = expand(a[0]), to = expand(a[1]);
      // entrée : redirection < fichier, sinon le dernier argument
      let src = null;
      const redir = raw.match(/<\s*(\S+)/);
      const target = redir ? redir[1] : a[2];
      if (target) {
        const p = game.shell.resolve(target);
        const f = w().target.get(p);
        if (!f || f.type !== 'file') return { out: `tr: ${target}: aucun fichier`, code: 1 };
        src = f.content;
      } else src = '';
      let out = '';
      for (const ch of src) {
        const i = from.indexOf(ch);
        out += i >= 0 && i < to.length ? to[i] : ch;
      }
      return { out: out.replace(/\n$/, ''), code: 0 };
    };

    const FICTIONAL = {
      probe: 'nmap -sV <ip>            (état des ports et versions)',
      scan: 'nmap -sn 10.10.0.0/24     (découverte d\'hôtes)',
      connect: 'ssh utilisateur@<ip>       (connexion distante)',
      disconnect: 'exit                      (fermer la session)',
      dc: 'exit',
      crack: 'hydra -l root -P /usr/share/wordlists/rockyou.txt ssh://<ip>',
      porthack: 'sudo -l  puis  sudo -i     (élévation de privilèges)',
      sshcrack: 'hydra -l root -P <wordlist> ssh://<ip>',
      ftpbounce: 'hydra -l anonymous -P <wordlist> ftp://<ip>',
      smtpoverflow: 'searchsploit postfix  puis  msfconsole -x "use ...; exploit"',
      webserverworm: 'nikto -h <ip>  puis  searchsploit apache',
      sql_memcorrupt: 'sqlmap -u "http://<ip>/page?id=1" --dbs --batch',
      firewall: 'iptables -L -n -v   puis   iptables -F   (root requis)',
      replace: "sed -i 's/ANCIEN/NOUVEAU/g' <fichier>",
      upload: 'scp ./fichier utilisateur@<ip>:/dossier/',
      exe: 'ls /usr/bin   (les outils disponibles)',
      tracekill: 'pas d\'équivalent réel : ralentis l\'attaque (hydra -t 1, nmap -T1)',
      kbt_porttest: 'nc <ip> <port>   ou   nmap -p <port> --reason <ip>',
      decypher: 'openssl enc -d -aes-256-cbc -in <fichier>   ou   base64 -d <fichier>',
      netscan: 'nmap -sn <plage>   ou   arp-scan -l',
      unbase64: 'base64 -d <fichier>',
      rot13: "tr 'A-Za-z' 'N-ZA-Mn-za-m' < <fichier>",
      hash: 'sha256sum <fichier>',
      cesar: "tr 'A-Za-z' 'D-ZA-Cd-za-c' < <fichier>   (décalage de 3)",
      xor: 'python3 -c "print(bytes(a^b for a,b in zip(d,k)))"   ou   openssl enc',
      forkbomb: ':(){ :|:& };:   (à ne JAMAIS lancer sur une vraie machine)',
      carte: 'commande du jeu — la carte est affichée en bas de l\'écran',
      missions: 'commande du jeu — panneau CONTRACT à droite',
      logs: 'ls /var/log/  puis  cat /var/log/auth.log'
    };
    for (const name in FICTIONAL) {
      if (['carte', 'missions', 'logs'].includes(name)) continue;
      cmds[name] = function () {
        return {
          out: `'${name}' n'est pas une vraie commande — c'était une invention de jeu.

  LA VRAIE COMMANDE :
    ${FICTIONAL[name]}

Tape 'vraies' pour la table de correspondance complète.`, code: 1
        };
      };
    }

    cmds.vraies = function () {
      const rows = Object.keys(FICTIONAL).map(k => `  ${pad(k, 16)} → ${FICTIONAL[k]}`);
      return {
        out: `CORRESPONDANCE ANCIENNE COMMANDE DE JEU → VRAIE COMMANDE

${rows.join('\n')}

COMMANDES DU JEU (elles, ce n'est pas du Linux — c'est l'interface) :
  objectif  indice  valider  stats  cours  sauver  exporter  reset

Tout le reste est de la vraie syntaxe. Rien ne sort de ton navigateur.`, code: 0
      };
    };

    cmds.aide_real = null;
    delete cmds.aide_real;

    return game;
  }

  const API = { install, EXPLOITS, ipInCidr };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.RealCommands = API;
})(typeof window !== 'undefined' ? window : globalThis);
