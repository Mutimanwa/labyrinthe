/* =====================================================================
   engine.js — Système de fichiers Unix + réseau simulé + shell
   Aucune dépendance. Testable sous Node.
   ===================================================================== */
(function (global) {
  'use strict';

  // ------------------------------------------------------------ HELPERS
  function normPath(cwd, p) {
    if (!p || p === '.') return cwd;
    let base = p.startsWith('/') ? [] : cwd.split('/').filter(Boolean);
    if (p.startsWith('~')) {
      base = ['home', 'joueur'];
      p = p.slice(1);
    }
    for (const part of p.split('/')) {
      if (part === '' || part === '.') continue;
      if (part === '..') base.pop();
      else base.push(part);
    }
    return '/' + base.join('/');
  }

  const basename = p => p.split('/').filter(Boolean).pop() || '/';
  const dirname = p => {
    const parts = p.split('/').filter(Boolean);
    parts.pop();
    return '/' + parts.join('/');
  };

  // ------------------------------------------------------------ NOEUD
  class Node {
    constructor(spec) {
      this.id = spec.id;
      this.name = spec.name || spec.id;
      this.ip = spec.ip;
      this.os = spec.os || 'Linux';
      this.theme = spec.theme || 'cyan';
      this.ports = spec.ports || {};      // {22:{service,version,state}}
      this.firewall = spec.firewall || null;  // {solution, level, allow[]}
      if (this.firewall && !this.firewall.allow) this.firewall.allow = [22];
      this.users = spec.users || { root: 'root' };
      this.adminPass = spec.adminPass || 'admin';
      this.files = {};                   // chemin absolu -> {type,content,perms,owner}
      this.links = spec.links || [];
      this.desc = spec.desc || '';
      this.crackedPorts = new Set();
      this.firewallDown = !spec.firewall;
      this.isAdmin = false;
      this.discovered = false;
      this.logs = [];
      this.loggingDisabled = false;
      // arborescence de base
      for (const d of ['/home', '/home/joueur', '/etc', '/var', '/var/log', '/bin', '/tmp', '/sys']) {
        this.files[d] = { type: 'dir', perms: 'drwxr-xr-x', owner: 'root' };
      }
      if (spec.files) {
        for (const path in spec.files) {
          const f = spec.files[path];
          this.addFile(path, typeof f === 'string' ? f : f.content,
            typeof f === 'object' ? f : {});
        }
      }
    }

    addFile(path, content, opts) {
      opts = opts || {};
      const dir = dirname(path);
      // créer les dossiers parents
      const parts = dir.split('/').filter(Boolean);
      let acc = '';
      for (const p of parts) {
        acc += '/' + p;
        if (!this.files[acc]) {
          this.files[acc] = { type: 'dir', perms: 'drwxr-xr-x', owner: opts.owner || 'root' };
        }
      }
      this.files[path] = {
        type: 'file',
        content: content,
        perms: opts.perms || '-rw-r--r--',
        owner: opts.owner || 'root',
        executable: !!opts.executable
      };
    }

    get(path) { return this.files[path]; }
    isDir(path) { const f = this.files[path]; return f && f.type === 'dir'; }
    isFile(path) { const f = this.files[path]; return f && f.type === 'file'; }

    children(path) {
      const prefix = path === '/' ? '/' : path + '/';
      const out = [];
      for (const p in this.files) {
        if (p === path) continue;
        if (!p.startsWith(prefix)) continue;
        const rest = p.slice(prefix.length);
        if (rest.includes('/')) continue;
        out.push(p);
      }
      return out.sort();
    }

    remove(path) {
      const gone = [];
      for (const p in this.files) {
        if (p === path || p.startsWith(path + '/')) { delete this.files[p]; gone.push(p); }
      }
      return gone;
    }

    openPorts() {
      return Object.keys(this.ports)
        .filter(p => this.ports[p].state === 'open')
        .map(Number).sort((a, b) => a - b);
    }

    canPorthack() {
      const need = this.portsNeeded || 1;
      return this.crackedPorts.size >= need && this.firewallDown;
    }

    // -------------------------------------------------- SSHD (fichier /etc/ssh/sshd_config)
    // Seul ce fichier fait foi pour l'authentification à distance.
    // Éditable par le joueur (sed -i, éditeur, cat > ...).
    sshd() {
      const f = this.files && this.files['/etc/ssh/sshd_config'];
      const cfg = { Port: '22', PermitRootLogin: 'yes', PasswordAuthentication: 'yes' };
      if (f && f.type === 'file' && f.content) {
        for (const raw of String(f.content).split('\n')) {
          const line = raw.trim();
          if (!line || line.startsWith('#')) continue;
          const m = line.match(/^([A-Za-z][A-Za-z0-9_-]*)\s+(.+)$/);
          if (m) cfg[m[1]] = m[2];
        }
      }
      return cfg;
    }

    sshPort() { return Number(this.sshd().Port) || 22; }

    // -------------------------------------------------- PARE-FEU effectif
    // porteOuverte(port) = le port écoute ET n'est pas filtré par le pare-feu.
    // Ordre de priorité : règle explicite iptables > allow[] > politique par défaut.
    // firewallDown = true  → filtrage désactivé, tout est ouvert (état d'usine).
    porteOuverte(port) {
      const info = this.ports[port];
      if (!info || info.state !== 'open') return false;
      if (this.firewallDown) return true;
      const fw = this.firewall || { policy: 'ACCEPT', allow: [22], rules: [] };
      for (const r of (fw.rules || [])) {
        if (r.dport === undefined) continue;
        if (r.dport !== port) continue;
        return r.action === 'ACCEPT';
      }
      if (fw.allow && fw.allow.includes(port)) return true;
      return fw.policy === 'ACCEPT';
    }
  }

  // Découpe une ligne en segments séparés par | > >> HORS des guillemets.
  function splitTopLevel(raw) {
    const out = [];
    let cur = '', quote = null, op = null, esc = false;
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      if (esc) { cur += c; esc = false; continue; }
      if (c === '\\') { cur += c; esc = true; continue; }
      if (quote) {
        cur += c;
        if (c === quote) quote = null;
        continue;
      }
      if (c === '"' || c === "'") { quote = c; cur += c; continue; }
      if (c === '|' || c === '>') {
        let sep = c;
        if (c === '>' && raw[i + 1] === '>') { sep = '>>'; i++; }
        out.push({ op, text: cur.trim() });
        cur = '';
        op = sep;
        continue;
      }
      cur += c;
    }
    out.push({ op, text: cur.trim() });
    return out;
  }

  // ------------------------------------------------------------ MONDE
  const PORT_DB = {
    21: { service: 'ftp', version: 'vsftpd 3.0.5' },
    22: { service: 'ssh', version: 'OpenSSH 9.6p1' },
    23: { service: 'telnet', version: 'Linux telnetd' },
    25: { service: 'smtp', version: 'Postfix smtpd' },
    53: { service: 'domain', version: 'BIND 9.18' },
    80: { service: 'http', version: 'Apache httpd 2.4.58' },
    110: { service: 'pop3', version: 'Dovecot pop3d' },
    143: { service: 'imap', version: 'Dovecot imapd' },
    443: { service: 'https', version: 'nginx 1.24.0' },
    993: { service: 'imaps', version: 'Dovecot imapd' },
    1433: { service: 'ms-sql-s', version: 'Microsoft SQL Server 2019' },
    3306: { service: 'mysql', version: 'MySQL 8.0.36' },
    3389: { service: 'ms-wbt-server', version: 'Microsoft Terminal Services' },
    5432: { service: 'postgresql', version: 'PostgreSQL 16.2' },
    6379: { service: 'redis', version: 'Redis 7.2.4' },
    8080: { service: 'http-proxy', version: 'Apache Tomcat 10.1' },
    8899: { service: 'ospf-lite', version: 'SimpleHTTPServer 0.6 (Python 3.13)' },
    27017: { service: 'mongodb', version: 'MongoDB 7.0.5' }
  };

  // top-100 simplifié, pour reproduire le piège -F vs défaut vs -p-
  const TOP100 = [21, 22, 23, 25, 53, 80, 110, 135, 139, 143, 443, 445, 993, 995,
    1433, 1723, 3306, 3389, 5432, 5900, 8080];
  const TOP1000_EXTRA = [81, 88, 111, 135, 1521, 2049, 2121, 2222, 3000, 3128,
    4444, 5000, 5060, 5432, 5900, 6379, 8000, 8081, 8443, 8888, 9000, 9090,
    9200, 11211, 27017, 31337];

  class World {
    constructor(spec) {
      this.nodes = {};
      this.playerId = spec.playerId || 'joueur';
      for (const s of spec.nodes) {
        const n = new Node(s);
        n.portsNeeded = (s.portsNeeded === undefined) ? 1 : s.portsNeeded;
        this.nodes[n.id] = n;
      }
      this.reset();
    }

    reset() {
      this.current = this.playerId;
      this.connected = false;
      this.cwd = '/home/joueur';
      this.user = 'joueur';
      this.history = [];
      this.flags = new Set();
      this.inventory = [];
      this.trace = null;
      this.startTime = Date.now();
      for (const id in this.nodes) {
        const n = this.nodes[id];
        n.crackedPorts = new Set();
        n.firewallDown = !n.firewall;
        n.isAdmin = false;
        n.discovered = id === this.playerId;
        n.logs = [];
        n.loggingDisabled = false;
      }
      this.nodes[this.playerId].discovered = true;
      this.nodes[this.playerId].isAdmin = true;
    }

    node(id) { return this.nodes[id]; }
    get target() { return this.nodes[this.current]; }
    get home() { return this.nodes[this.playerId]; }

    findByIp(ip) {
      for (const id in this.nodes) if (this.nodes[id].ip === ip) return this.nodes[id];
      return null;
    }

    log(action, detail) {
      const n = this.target;
      const entry = `[${new Date().toISOString().slice(0, 19).replace('T', ' ')}] ${action} ${detail || ''} src=${this.home.ip} user=${this.user}`;
      n.logs.push(entry);
      // Si les journaux ont été effacés, la trace reste en mémoire seulement :
      // sinon l'acte d'effacer recréerait aussitôt le fichier supprimé.
      if (n.loggingDisabled) return;
      const p = '/var/log/actions.log';
      if (!n.files[p]) n.addFile(p, '');
      n.files[p].content += (n.files[p].content ? '\n' : '') + entry;
    }
  }

  // ------------------------------------------------------------ SHELL
  class Shell {
    constructor(world, opts) {
      this.w = world;
      this.py = (opts && opts.py) || global.PyInterp;
      this.onEvent = (opts && opts.onEvent) || function () {};
      // Chaque shell possède SON jeu de commandes, copié depuis le prototype.
      // Sans cette copie, les extensions (programmes, jeu) muteraient le
      // prototype partagé : une seconde partie capturerait comme « commande
      // d'origine » une commande déjà redéfinie, et se rappellerait elle-même.
      this.commands = Object.assign({}, Shell.prototype.commands);
    }

    // Résout un chemin sur la machine courante
    resolve(p) { return normPath(this.w.cwd, p); }

    exec(line) {
      const raw = line.trim();
      if (!raw) return { out: '', code: 0 };
      this.w.history.push(raw);

      // Le code Python est transmis TEL QUEL : un '>' y est une comparaison,
      // pas une redirection. Sans cette exception, `py print(1 > 2)` créerait
      // un fichier nommé "2)" au lieu d'afficher False.
      if (/^(py|python3?\s+-c)(\s|$)/.test(raw)) return this.dispatch(raw);

      // Découpage RESPECTANT LES GUILLEMETS : un '>' ou un '|' à l'intérieur
      // d'une chaîne n'est pas un opérateur shell. Sans cela, une commande
      // comme  replace f.py "a" "x if p > 1024"  serait prise pour une
      // redirection et écrirait un fichier au lieu de modifier le code.
      const segments = splitTopLevel(raw);

      // redirection finale > ou >>
      const last = segments[segments.length - 1];
      if (last.op === '>' || last.op === '>>') {
        const path = this.resolve(last.text);
        const n = this.w.target;
        if (!n.isDir(dirname(path))) {
          return { out: `redirection: ${dirname(path)}: dossier introuvable`, code: 1 };
        }
        const cmdPart = segments.slice(0, -1);
        const r = this.runPipeline(cmdPart);
        if (r.code !== 0) return r;
        if (last.op === '>>') {
          const cur = n.isFile(path) ? n.files[path].content : '';
          n.addFile(path, cur + (cur ? '\n' : '') + r.out, { owner: this.w.user });
        } else {
          n.addFile(path, r.out, { owner: this.w.user });
        }
        this.onEvent('write', { path });
        return { out: '', code: 0 };
      }
      return this.runPipeline(segments);
    }

    runPipeline(segments) {
      let acc = '';
      for (let i = 0; i < segments.length; i++) {
        const text = segments[i].text;
        if (!text) continue;
        const r = i === 0 ? this.dispatch(text) : this.pipeCmd(text, acc);
        if (r.code !== 0 && i === 0) return r;
        acc = r.out;
      }
      return { out: acc, code: 0 };
    }

    pipeCmd(cmd, input) {
      const parts = cmd.split(/\s+/);
      const c = parts[0];
      if (c === 'grep') {
        const invert = parts.includes('-v');
        const nocase = parts.includes('-i');
        const pattern = parts.filter(p => !p.startsWith('-')).slice(1).join(' ');
        if (!pattern) return { out: 'usage: grep [-iv] MOTIF', code: 1 };
        const lines = input.split('\n');
        const re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), nocase ? 'i' : '');
        const kept = lines.filter(l => (invert ? !re.test(l) : re.test(l)));
        return { out: kept.join('\n'), code: 0 };
      }
      if (c === 'wc') {
        const lines = input.split('\n').filter(l => l !== '');
        if (parts.includes('-l')) return { out: String(lines.length), code: 0 };
        if (parts.includes('-w')) return { out: String(input.split(/\s+/).filter(Boolean).length), code: 0 };
        return { out: `${lines.length} ${input.split(/\s+/).filter(Boolean).length} ${input.length}`, code: 0 };
      }
      if (c === 'head') {
        const nIdx = parts.indexOf('-n');
        const count = nIdx >= 0 ? parseInt(parts[nIdx + 1], 10) : 10;
        return { out: input.split('\n').slice(0, count).join('\n'), code: 0 };
      }
      if (c === 'tail') {
        const nIdx = parts.indexOf('-n');
        const count = nIdx >= 0 ? parseInt(parts[nIdx + 1], 10) : 10;
        return { out: input.split('\n').slice(-count).join('\n'), code: 0 };
      }
      if (c === 'sort') {
        return { out: input.split('\n').sort().join('\n'), code: 0 };
      }
      if (c === 'uniq') {
        const lines = input.split('\n');
        return { out: lines.filter((l, i) => i === 0 || l !== lines[i - 1]).join('\n'), code: 0 };
      }
      return { out: `${c}: commande inconnue dans un pipe`, code: 1 };
    }

    dispatch(raw) {
      // tokens en respectant les guillemets
      const tokens = [];
      let cur = '', quote = null;
      for (let i = 0; i < raw.length; i++) {
        const c = raw[i];
        if (quote) {
          if (c === quote) quote = null; else cur += c;
        } else if (c === '"' || c === "'") { quote = c; }
        else if (c === ' ' || c === '\t') { if (cur) { tokens.push(cur); cur = ''; } }
        else cur += c;
      }
      if (cur) tokens.push(cur);
      if (!tokens.length) return { out: '', code: 0 };

      const cmd = tokens[0];
      const args = tokens.slice(1);
      const fn = this.commands[cmd];
      if (!fn) {
        return { out: `${cmd} : commande introuvable. Tape 'help' pour la liste.`, code: 127 };
      }
      try {
        return fn.call(this, args, raw);
      } catch (e) {
        return { out: `${cmd} : ${e.message}`, code: 1 };
      }
    }
  }

  // ------------------------------------------------------------ COMMANDES
  Shell.prototype.commands = {
    help(a) {
      if (a[0]) {
        const h = HELP_DETAIL[a[0]];
        return { out: h || `Pas d'aide détaillée pour '${a[0]}'.`, code: h ? 0 : 1 };
      }
      return {
        out: `VRAIES COMMANDES — syntaxe réelle, exécution simulée

  NAVIGATION     ls -la  cd  pwd  cat  head  tail  tree  find  file
  FICHIERS       touch  mkdir  rm  mv  cp  echo  sed -i  chmod  wc  grep
  FILTRES        cmd | grep MOTIF | wc -l      grep -c  grep -r  sort  uniq
  PYTHON         python3 fichier.py    python3 -c "print(7%3)"
  RÉSEAU         nmap -sn <plage>   nmap -sV -p- <ip>   nc <ip> <port>
                 ip a   ip r   ss -tulpn   ping   traceroute
  SESSION        ssh user@ip   sshpass -p 'mdp' ssh user@ip   exit
  TRANSFERT      scp user@ip:/chemin/fichier .
                 scp ./fichier user@ip:/dossier/
  OSINT          whois <domaine>   (passif — zéro paquet vers la cible)
  RECONNAISSANCE nikto -h <ip>   curl -I http://ip/   searchsploit <service>
  ATTAQUE        hydra -l root -P <wordlist> ssh://<ip>
                 msfconsole -x "use <module>; set RHOSTS <ip>; exploit"
                 sqlmap -u "http://ip/page?id=1" --dbs --batch
  PRIVILÈGES     id   whoami   sudo -l   sudo -i
  PARE-FEU       iptables -L -n -v   iptables -F   ufw status
  CRYPTO         base64 -d <fichier>   sha256sum   xxd   strings   john
  TRACES         cat /var/log/auth.log   history -c   shred -u <fichier>
  SYSTÈME        ps aux   kill -9 <pid>   free -m   uname -a   env   date

  COMMANDES DU JEU (interface, pas du Linux) :
    objectif  indice  valider  stats  cours  editeur  sauver  exporter  profil  mail  echo
    trace on/off   logs   forum   reset   vraies

  'vraies'  → correspondance avec les anciennes commandes fictives
  'help <commande>' → détail.   Ex : help nmap`, code: 0
      };
    },

    ls(a) {
      const long = a.some(x => /^-[la]/.test(x));
      const all = a.some(x => /^-a/.test(x));
      const pathArg = a.find(x => !x.startsWith('-'));
      const path = this.resolve(pathArg || '.');
      const n = this.w.target;
      if (!n.get(path)) return { out: `ls: ${pathArg || '.'}: aucun fichier ou dossier`, code: 1 };
      if (n.isFile(path)) return { out: basename(path), code: 0 };
      const kids = n.children(path);
      if (!kids.length) return { out: '', code: 0 };
      if (long) {
        const rows = kids.map(k => {
          const f = n.files[k];
          const size = f.type === 'dir' ? 4096 : f.content.length;
          return `${f.perms}  ${f.owner.padEnd(8)} ${String(size).padStart(6)}  ${basename(k)}${f.type === 'dir' ? '/' : ''}`;
        });
        return { out: rows.join('\n'), code: 0 };
      }
      const names = kids.map(k => basename(k) + (n.isDir(k) ? '/' : ''));
      return { out: names.join('   '), code: 0 };
    },

    cd(a) {
      const path = this.resolve(a[0] || '~');
      const n = this.w.target;
      if (!n.get(path)) return { out: `cd: ${a[0]}: aucun fichier ou dossier de ce type`, code: 1 };
      if (!n.isDir(path)) return { out: `cd: ${a[0]}: n'est pas un dossier`, code: 1 };
      this.w.cwd = path;
      return { out: '', code: 0 };
    },

    pwd() { return { out: this.w.cwd, code: 0 }; },

    cat(a) {
      if (!a.length) return { out: 'usage: cat <fichier>', code: 1 };
      const outs = [];
      for (const arg of a) {
        const path = this.resolve(arg);
        const n = this.w.target;
        if (!n.get(path)) return { out: `cat: ${arg}: aucun fichier ou dossier`, code: 1 };
        if (n.isDir(path)) return { out: `cat: ${arg}: est un dossier`, code: 1 };
        const f = n.files[path];
        if (f.perms && f.perms[1] !== 'r' && !this.w.target.isAdmin && f.owner !== this.w.user) {
          return { out: `cat: ${arg}: permission refusée`, code: 1 };
        }
        outs.push(f.content);
      }
      this.onEvent('read', { paths: a.map(x => this.resolve(x)) });
      return { out: outs.join('\n'), code: 0 };
    },

    head(a) {
      const nIdx = a.indexOf('-n');
      const count = nIdx >= 0 ? parseInt(a[nIdx + 1], 10) : 10;
      const file = a.filter((x, i) => !x.startsWith('-') && i !== nIdx + 1)[0];
      if (!file) return { out: 'usage: head [-n N] <fichier>', code: 1 };
      const r = this.commands.cat.call(this, [file]);
      if (r.code) return r;
      return { out: r.out.split('\n').slice(0, count).join('\n'), code: 0 };
    },

    tail(a) {
      const nIdx = a.indexOf('-n');
      const count = nIdx >= 0 ? parseInt(a[nIdx + 1], 10) : 10;
      const file = a.filter((x, i) => !x.startsWith('-') && i !== nIdx + 1)[0];
      if (!file) return { out: 'usage: tail [-n N] <fichier>', code: 1 };
      const r = this.commands.cat.call(this, [file]);
      if (r.code) return r;
      return { out: r.out.split('\n').slice(-count).join('\n'), code: 0 };
    },

    touch(a) {
      if (!a.length) return { out: 'usage: touch <fichier>', code: 1 };
      const n = this.w.target;
      for (const arg of a) {
        const p = this.resolve(arg);
        if (!n.get(p)) n.addFile(p, '', { owner: this.w.user });
      }
      this.onEvent('write', { path: this.resolve(a[0]) });
      return { out: '', code: 0 };
    },

    mkdir(a) {
      if (!a.length) return { out: 'usage: mkdir <dossier>', code: 1 };
      const n = this.w.target;
      for (const arg of a) {
        const p = this.resolve(arg);
        if (n.get(p)) return { out: `mkdir: ${arg}: le fichier existe`, code: 1 };
        n.addFile(p + '/.keep', '', { owner: this.w.user });
        delete n.files[p + '/.keep'];
        n.files[p] = { type: 'dir', perms: 'drwxr-xr-x', owner: this.w.user };
      }
      return { out: '', code: 0 };
    },

    rm(a) {
      const recursive = a.some(x => /^-[rf]/.test(x));
      const targets = a.filter(x => !x.startsWith('-'));
      if (!targets.length) return { out: 'usage: rm [-r] <fichier|*>', code: 1 };
      const n = this.w.target;
      let removed = 0;
      for (const arg of targets) {
        if (arg === '*') {
          const kids = n.children(this.w.cwd);
          for (const k of kids) {
            if (n.isDir(k) && !recursive) continue;
            removed += n.remove(k).length;
          }
          continue;
        }
        // joker : rm /var/log/*.log
        if (arg.includes('*')) {
          const abs = this.resolve(arg);
          const rx = new RegExp('^' + abs.replace(/[.]/g, '\\.').replace(/\*/g, '[^/]*') + '$');
          const matches = Object.keys(n.files).filter(p => rx.test(p));
          if (!matches.length) return { out: `rm: ${arg}: aucun fichier correspondant`, code: 1 };
          for (const m of matches) {
            if (m.startsWith('/var/log')) n.loggingDisabled = true;
            removed += n.remove(m).length;
          }
          continue;
        }
        const p = this.resolve(arg);
        if (!n.get(p)) return { out: `rm: ${arg}: aucun fichier ou dossier`, code: 1 };
        if (n.isDir(p) && !recursive) return { out: `rm: ${arg}: est un dossier (utilise -r)`, code: 1 };
        if (p === '/' || p === '/sys') return { out: 'rm: opération refusée sur un dossier système critique', code: 1 };
        removed += n.remove(p).length;
      }
      // Effacer les journaux désactive l'écriture dans /var/log/actions.log.
      // Réaliste : un attaquant neutralise la journalisation.
      if (targets.some(t => { const p = this.resolve(t); return p.startsWith('/var/log') || t === '*'; })) {
        if (this.w.cwd.startsWith('/var/log') || targets.some(t => this.resolve(t).startsWith('/var/log'))) {
          n.loggingDisabled = true;
        }
      }
      this.w.log('suppression', targets.join(' '));
      this.onEvent('delete', { count: removed, paths: targets.map(x => this.resolve(x)) });
      return { out: '', code: 0 };
    },

    mv(a) {
      if (a.length < 2) return { out: 'usage: mv <source> <destination>', code: 1 };
      const n = this.w.target;
      const src = this.resolve(a[0]);
      let dst = this.resolve(a[1]);
      if (!n.get(src)) return { out: `mv: ${a[0]}: aucun fichier ou dossier`, code: 1 };
      if (n.isDir(dst)) dst = dst + '/' + basename(src);
      n.files[dst] = n.files[src];
      delete n.files[src];
      this.onEvent('write', { path: dst });
      return { out: '', code: 0 };
    },

    cp(a) {
      if (a.length < 2) return { out: 'usage: cp <source> <destination>', code: 1 };
      const n = this.w.target;
      const src = this.resolve(a[0]);
      let dst = this.resolve(a[1]);
      if (!n.isFile(src)) return { out: `cp: ${a[0]}: fichier introuvable`, code: 1 };
      if (n.isDir(dst)) dst = dst + '/' + basename(src);
      n.files[dst] = Object.assign({}, n.files[src]);
      this.onEvent('write', { path: dst });
      return { out: '', code: 0 };
    },

    echo(a, raw) {
      // Les opérateurs > >> ont déjà été traités par exec().
      const text = raw.replace(/^echo\s*/, '').replace(/^["']|["']$/g, '');
      return { out: text, code: 0 };
    },


    chmod(a) {
      if (a.length < 2) return { out: 'usage: chmod <mode> <fichier>   Ex: chmod 755 script.py', code: 1 };
      const path = this.resolve(a[1]);
      const n = this.w.target;
      if (!n.get(path)) return { out: `chmod: ${a[1]}: fichier introuvable`, code: 1 };
      const mode = a[0];
      if (!/^[0-7]{3}$/.test(mode)) return { out: 'chmod: mode attendu sur 3 chiffres (ex 755)', code: 1 };
      const map = ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx'];
      const isDir = n.isDir(path);
      n.files[path].perms = (isDir ? 'd' : '-') + mode.split('').map(d => map[parseInt(d, 10)]).join('');
      if (parseInt(mode[0], 10) & 1) n.files[path].executable = true;
      this.onEvent('chmod', { path, mode });
      return { out: '', code: 0 };
    },

    wc(a) {
      const flag = a.find(x => x.startsWith('-'));
      const file = a.find(x => !x.startsWith('-'));
      if (!file) return { out: 'usage: wc [-l|-w|-c] <fichier>', code: 1 };
      const r = this.commands.cat.call(this, [file]);
      if (r.code) return r;
      const lines = r.out.split('\n').filter(l => l !== '').length;
      const words = r.out.split(/\s+/).filter(Boolean).length;
      if (flag === '-l') return { out: `${lines} ${file}`, code: 0 };
      if (flag === '-w') return { out: `${words} ${file}`, code: 0 };
      if (flag === '-c') return { out: `${r.out.length} ${file}`, code: 0 };
      return { out: `${lines} ${words} ${r.out.length} ${file}`, code: 0 };
    },

    grep(a) {
      const flags = a.filter(x => x.startsWith('-'));
      const rest = a.filter(x => !x.startsWith('-'));
      if (rest.length < 2) return { out: 'usage: grep [-in] MOTIF <fichier>', code: 1 };
      const pattern = rest[0];
      if (flags.includes('-r') || flags.includes('-R')) {
        const n = this.w.target;
        const root = this.resolve(rest[1] || '.');
        const rx = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags.includes('-i') ? 'i' : '');
        const hits = [];
        for (const p of Object.keys(n.files).sort()) {
          if (!n.isFile(p)) continue;
          if (p !== root && !p.startsWith(root === '/' ? '/' : root + '/')) continue;
          n.files[p].content.split('\n').forEach((l, i) => {
            if (rx.test(l)) hits.push(`${p}:${i + 1}:${l}`);
          });
        }
        return { out: hits.join('\n'), code: hits.length ? 0 : 1 };
      }
      const r = this.commands.cat.call(this, [rest[1]]);
      if (r.code) return r;
      const re = new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
        flags.includes('-i') ? 'i' : '');
      const lines = r.out.split('\n');
      const out = [];
      lines.forEach((l, i) => {
        const hit = flags.includes('-v') ? !re.test(l) : re.test(l);
        if (hit) out.push(flags.includes('-n') ? `${i + 1}:${l}` : l);
      });
      // -c : compter les lignes correspondantes, comme le vrai grep
      if (flags.includes('-c') || flags.includes('--count')) {
        this.onEvent('grep', { pattern, countMode: true, count: out.length, file: rest[1] });
        return { out: String(out.length), code: out.length ? 0 : 1 };
      }
      return { out: out.join('\n'), code: out.length ? 0 : 1 };
    },

    find(a) {
      const start = this.resolve(a[0] && !a[0].startsWith('-') ? a[0] : '.');
      const nIdx = a.indexOf('-name');
      const pattern = nIdx >= 0 ? a[nIdx + 1] : null;
      const n = this.w.target;
      const re = pattern ? new RegExp('^' + pattern.replace(/[.]/g, '\\.').replace(/\*/g, '.*') + '$') : null;
      const out = [];
      for (const p in n.files) {
        if (p !== start && !p.startsWith(start === '/' ? '/' : start + '/')) continue;
        if (re && !re.test(basename(p))) continue;
        out.push(p);
      }
      return { out: out.sort().join('\n'), code: 0 };
    },

    tree(a) {
      const start = this.resolve(a[0] || '.');
      const n = this.w.target;
      if (!n.get(start)) return { out: `tree: ${a[0] || '.'}: dossier introuvable`, code: 1 };
      const lines = [start];
      const walk = (path, prefix) => {
        const kids = n.children(path);
        kids.forEach((k, i) => {
          const last = i === kids.length - 1;
          lines.push(prefix + (last ? '└── ' : '├── ') + basename(k) + (n.isDir(k) ? '/' : ''));
          if (n.isDir(k)) walk(k, prefix + (last ? '    ' : '│   '));
        });
      };
      walk(start, '');
      return { out: lines.join('\n'), code: 0 };
    },

    // -------------------------------------------------- PROGRAMMATION
    python(a, raw) {
      if (a[0] === '-c') {
        const code = raw.slice(raw.indexOf('-c') + 2).trim().replace(/^["']|["']$/g, '');
        const res = this.py.run(code);
        this.onEvent('python', { path: '-c', ok: res.ok, output: res.output, kind: res.kind });
        return res.ok ? { out: res.output.replace(/\n$/, ''), code: 0 }
          : { out: `${res.kind}: ${res.message}`, code: 1 };
      }
      if (!a.length) {
        return { out: 'usage: python3 <fichier.py>\n       python3 -c "print(2**10)"', code: 1 };
      }
      const path = this.resolve(a[0]);
      const n = this.w.target;
      if (!n.isFile(path)) return { out: `python: ${a[0]}: fichier introuvable`, code: 1 };
      const src = n.files[path].content;
      const res = this.py.run(src);
      this.onEvent('python', { path, ok: res.ok, output: res.output, kind: res.kind });
      if (res.ok) {
        return { out: res.output.replace(/\n$/, ''), code: 0 };
      }
      const loc = res.line ? ` (ligne ${res.line})` : '';
      return {
        out: `${res.output ? res.output.replace(/\n$/, '') + '\n' : ''}Traceback (most recent call last):\n  File "${a[0]}"${loc}\n${res.kind}: ${res.message}`,
        code: 1
      };
    },

    python3(a, raw) { return this.commands.python.call(this, a, raw.replace(/^python3/, 'python')); },

    py(a, raw) {
      const src = raw.replace(/^py\s*/, '');
      if (!src) return { out: 'usage: py <code python>   Ex: py print(2**10)', code: 1 };
      const res = this.py.run(src);
      if (res.ok) {
        this.onEvent('py', { ok: true, output: res.output });
        return { out: res.output.replace(/\n$/, ''), code: 0 };
      }
      this.onEvent('py', { ok: false, kind: res.kind });
      return { out: `${res.kind}: ${res.message}${res.line ? ' (ligne ' + res.line + ')' : ''}`, code: 1 };
    },

    edit(a, raw) {
      // edit fichier.py  — ouvre l'éditeur (géré par l'UI)
      if (!a.length) return { out: 'usage: edit <fichier>', code: 1 };
      const path = this.resolve(a[0]);
      this.onEvent('edit', { path });
      return { out: `__EDIT__${path}`, code: 0 };
    },

    // -------------------------------------------------- RESEAU

    carte() {
      const rows = [];
      for (const id in this.w.nodes) {
        const n = this.w.nodes[id];
        if (!n.discovered) continue;
        const mark = id === this.w.current ? '>' : ' ';
        const admin = n.isAdmin ? '[admin]' : '';
        rows.push(`${mark} ${n.ip.padEnd(16)} ${n.name.padEnd(30)} ${admin}`);
      }
      this.onEvent('map', {});
      return { out: `CARTE RESEAU\n\n${rows.join('\n')}`, code: 0 };
    },





    ping(a) {
      if (!a.length) return { out: 'usage: ping <ip>', code: 1 };
      const t = this.w.findByIp(a[0]);
      if (!t || !t.discovered) return { out: `ping: ${a[0]}: hôte injoignable`, code: 1 };
      return {
        out: `PING ${a[0]} : 56 octets de données\n64 octets de ${a[0]} : icmp_seq=1 ttl=64 temps=0.042 ms\n64 octets de ${a[0]} : icmp_seq=2 ttl=64 temps=0.038 ms\n\n--- statistiques ---\n2 paquets transmis, 2 reçus, 0% de perte`,
        code: 0
      };
    },

    whois(a) {
      // OSINT passif — données du web intérieur (browser.js, registre LabyWeb)
      if (!a.length) return { out: 'usage: whois <domaine>', code: 1 };
      const d = String(a[0]).toLowerCase();
      const W = global.LabyWeb;
      if (!W || !W.whoisOf) {
        return { out: 'whois: le registre ne répond pas encore (web intérieur non chargé — ouvre le navigateur ◈)', code: 1 };
      }
      const info = W.whoisOf(d);
      this.onEvent('whois', { target: d, found: !!info });
      if (!info) {
        return { out: `whois: aucun enregistrement pour ${d}\n(registre NIC-BI — essaie un domaine référencé sur fouine.bi)`, code: 1 };
      }
      return {
        out: [
          `Domain:      ${info.domain}`,
          `Registrar:   ${info.registrar}`,
          `Created:     ${info.created}`,
          `Expires:     ${info.expires || '—'}`,
          `Registrant:  ${info.registrant}`,
          `Admin:       ${info.admin}`,
          `NS:          ${(info.ns || []).join(', ')}`
        ].join('\n'),
        code: 0
      };
    },

    netstat() {
      const n = this.w.target;
      const rows = n.openPorts().map(p =>
        `tcp   0.0.0.0:${String(p).padEnd(6)} 0.0.0.0:*   LISTEN   ${n.ports[p].service}`);
      return { out: `Proto  Adresse locale        Adresse distante  État\n${rows.join('\n')}`, code: 0 };
    },

    ifconfig() {
      const n = this.w.target;
      return {
        out: `eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500
        inet ${n.ip}  netmask 255.255.255.0  broadcast ${n.ip.replace(/\.\d+$/, '.255')}
        ether 02:42:ac:11:00:02  txqueuelen 0  (Ethernet)

lo: flags=73<UP,LOOPBACK,RUNNING>  mtu 65536
        inet 127.0.0.1  netmask 255.0.0.0`, code: 0
      };
    },

    // -------------------------------------------------- INTRUSION




    whoami() { return { out: this.w.user, code: 0 }; },

    scp(a) {
      if (!a.length) return { out: 'usage: scp <fichier>   (copie vers ta machine)', code: 1 };
      const n = this.w.target;
      const path = this.resolve(a[0]);
      if (!n.isFile(path)) return { out: `scp: ${a[0]}: fichier introuvable`, code: 1 };
      if (n.id === this.w.playerId) return { out: 'Tu es déjà sur ta machine.', code: 1 };
      const dest = '/home/joueur/telecharges/' + basename(path);
      this.w.home.addFile(dest, n.files[path].content, { owner: 'joueur' });
      this.w.log('transfert', `${path} → ${this.w.home.ip}`);
      this.onEvent('download', { path, target: n.id, dest });
      return { out: `${basename(path)} copié vers ta machine : ${dest}`, code: 0 };
    },


    // -------------------------------------------------- SYSTEME
    ps() {
      const n = this.w.target;
      const rows = n.openPorts().map((p, i) =>
        `${String(1000 + i * 37).padStart(5)}  ${n.ports[p].service}`);
      return { out: `  PID  COMMANDE\n    1  init\n${rows.join('\n')}`, code: 0 };
    },

    uname() {
      return { out: `${this.w.target.os} ${this.w.target.id} 6.8.0-generic x86_64 GNU/Linux`, code: 0 };
    },

    date() { return { out: new Date().toString(), code: 0 }; },

    env() {
      return {
        out: `USER=${this.w.user}\nHOME=/home/joueur\nPWD=${this.w.cwd}\nSHELL=/bin/bash\nHOSTNAME=${this.w.target.id}\nPATH=/bin:/usr/bin`,
        code: 0
      };
    },

    history() {
      return { out: this.w.history.map((h, i) => `${String(i + 1).padStart(4)}  ${h}`).join('\n'), code: 0 };
    },

    clear() { this.onEvent('clear', {}); return { out: '__CLEAR__', code: 0 }; }
  };

  function parsePorts(spec) {
    if (!spec) return null;
    const out = [];
    for (const part of spec.split(',')) {
      if (part.includes('-')) {
        const [a, b] = part.split('-').map(Number);
        if (!isNaN(a) && !isNaN(b)) {
          for (let i = a; i <= Math.min(b, a + 2000); i++) out.push(i);
        }
      } else {
        const n = parseInt(part, 10);
        if (!isNaN(n)) out.push(n);
      }
    }
    return out.length ? out : null;
  }

  const HELP_DETAIL = {
    ls: "ls [-l] [-a] [dossier]\n  Liste le contenu. -l : détails, -a : tout.",
    cd: "cd <dossier>\n  Change de dossier. 'cd ..' remonte, 'cd /' va à la racine, 'cd ~' au home.",
    cat: "cat <fichier>\n  Affiche le contenu d'un fichier.",
    rm: "rm [-r] <fichier|*>\n  Supprime. -r pour un dossier. '*' pour tout le dossier courant.\n  ATTENTION : irréversible.",
    python3: "python3 <fichier.py>\n  Exécute un vrai programme Python (sous-ensemble pédagogique).\n  Supporte : variables, if/for/while, fonctions, listes, dicts, compréhensions.\n  python3 -c \"print(2**10)\"  évalue une ligne directement.",
    nmap: "nmap [options] [ip]\n  -F          100 ports les plus courants\n  (défaut)    1000 ports\n  -p-         tous les ports\n  -p 22,80    ports précis\n  -sV         détecte les versions de services\n  -sS         scan SYN furtif\n  -sU         scan UDP\n  --reason    explique chaque verdict\n  -Pn         ignore la découverte d'hôte",
    scp: "scp user@ip:/chemin/fichier .\n  Copie depuis le distant vers ton dossier courant.\nscp ./fichier user@ip:/dossier/\n  Copie dans l'autre sens.",
    whois: "whois <domaine>\n  Interroge le registre NIC-BI (web intérieur).\n  Renvoie titulaire, contact admin, serveurs DNS, dates.\n  100 % passif : aucun paquet vers la cible, aucun bruit.",
    ssh: "ssh user@ip\n  Ouvre une session distante. Demande un mot de passe.\n  sshpass -p 'mdp' ssh user@ip  le fournit sur la ligne.\n  exit  ferme la session.",
    hydra: "hydra -l <compte> -P <wordlist> <service>://<ip>\n  Attaque par dictionnaire. -t <n> fixe le parallélisme :\n  plus c'est rapide, plus c'est bruyant.",
    sudo: "sudo -l\n  Liste mes droits.\nsudo -i\n  Ouvre une session root (mot de passe requis si inconnu).",
    iptables: "iptables -L -n -v\n  Affiche les règles de filtrage.\niptables -F\n  Vide toutes les règles. Root requis.",
    sed: "sed -i 's/ANCIEN/NOUVEAU/g' <fichier>\n  Substitution sur place. Sans -i, affiche sans modifier.",
    searchsploit: "searchsploit <service ou version>\n  Cherche un exploit public connu.",
    msfconsole: "msfconsole -x \"use <module>; set RHOSTS <ip>; exploit\"\n  Lance Metasploit en mode non interactif.",
    nikto: "nikto -h <ip>\n  Audit automatisé d'un serveur web.",
    curl: "curl [-I] <url>\n  Récupère une ressource HTTP. -I : les en-têtes seulement.",
    base64: "base64 <fichier>     encoder\nbase64 -d <fichier>  décoder\n  Ce n'est pas du chiffrement : il n'y a pas de clé.",
    grep: "grep [-i] [-n] [-v] [-c] [-r] MOTIF <fichier>\n  Filtre les lignes. -i casse, -n numéros, -v inverse,\n  -c compte, -r récursif.",
    find: "find [dossier] -name <motif>\n  Cherche des fichiers. Ex : find / -name *.log",
    chmod: "chmod <mode> <fichier>\n  Change les permissions. Ex : chmod 755 script.py",
  };

  // Décode un paquet narratif en texte simple (tests, export, repli).
  function narrate(out) {
    if (typeof out === 'string' && out.startsWith('__NARRATE__')) {
      try { return JSON.parse(out.slice('__NARRATE__'.length)).join('\n'); }
      catch (e) { return out; }
    }
    return out;
  }

  const API = { World, Node, Shell, normPath, basename, dirname, PORT_DB, TOP100, narrate };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.GameEngine = API;
})(typeof window !== 'undefined' ? window : globalThis);
