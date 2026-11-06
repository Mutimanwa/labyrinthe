/* =====================================================================
   API SERVER — un vrai serveur REST, simulé dans le navigateur.

   Il implémente la sémantique HTTP réelle : codes de statut, en-têtes,
   authentification par Bearer token, JSON, query strings, CORS.
   Le code de l'apprenti appelle fetch() dessus pour de vrai.

   Rien ne sort du navigateur : la « socket » est un appel de fonction.
   ===================================================================== */
(function (global) {
  'use strict';

  const USERS = [
    { id: 1, name: 'Aline Nkurunziza', email: 'aline@academie.bi', role: 'admin', city: 'Bujumbura' },
    { id: 2, name: 'Eric Bizimana', email: 'eric@academie.bi', role: 'user', city: 'Gitega' },
    { id: 3, name: 'Chantal Irakoze', email: 'chantal@academie.bi', role: 'user', city: 'Ngozi' },
    { id: 4, name: 'Didier Hakizimana', email: 'didier@academie.bi', role: 'moderator', city: 'Rumonge' },
    { id: 5, name: 'Esther Niyonkuru', email: 'esther@academie.bi', role: 'user', city: 'Kayanza' }
  ];
  const POSTS = [
    { id: 1, userId: 1, title: 'Configurer un pare-feu', tags: ['reseau', 'securite'] },
    { id: 2, userId: 2, title: 'Lire un journal SSH', tags: ['shell'] },
    { id: 3, userId: 2, title: 'Comprendre nmap -sV', tags: ['reseau'] },
    { id: 4, userId: 3, title: 'Base64 n’est pas un chiffrement', tags: ['securite'] },
    { id: 5, userId: 1, title: 'Pivoter entre deux segments', tags: ['reseau'] },
    { id: 6, userId: 4, title: 'Écrire une fonction Python', tags: ['code'] }
  ];
  const TOKENS = {
    'dev-token-2026': { userId: 2, role: 'user' },
    'admin-token-2026': { userId: 1, role: 'admin' }
  };
  const CREDS = { 'eric@academie.bi': 'motdepasse123', 'aline@academie.bi': 'Adm1n!2026' };

  function ApiServer() {
    this.users = JSON.parse(JSON.stringify(USERS));
    this.posts = JSON.parse(JSON.stringify(POSTS));
    this.calls = [];
    this.startedAt = Date.now();
    this.nextId = 6;
    this.requireAuth = true;
  }

  ApiServer.prototype.reset = function () {
    this.users = JSON.parse(JSON.stringify(USERS));
    this.posts = JSON.parse(JSON.stringify(POSTS));
    this.calls = [];
    this.nextId = 6;
  };

  // Réponse HTTP : status, headers, body JSON.
  function reply(status, body, headers) {
    const h = Object.assign({
      'content-type': 'application/json; charset=utf-8',
      'x-powered-by': 'Next.js',
      'access-control-allow-origin': '*'
    }, headers || {});
    return { status, headers: h, body };
  }

  ApiServer.prototype.handle = function (method, url, options) {
    options = options || {};
    method = (method || 'GET').toUpperCase();
    const headers = {};
    for (const k in (options.headers || {})) headers[String(k).toLowerCase()] = String(options.headers[k]);

    let u;
    try { u = new URL(url, 'http://10.10.5.10:3000'); }
    catch (e) { return reply(400, { error: 'URL invalide' }); }
    const path = u.pathname.replace(/\/+$/, '') || '/';
    const q = u.searchParams;

    let body = null;
    if (options.body !== undefined && options.body !== null) {
      if (typeof options.body === 'string') {
        try { body = JSON.parse(options.body); } catch (e) { body = options.body; }
      } else body = options.body;
    }

    this.calls.push({ method, path, query: Object.fromEntries(q), headers, body, at: Date.now() });

    // Le serveur refuse les requêtes d'une autre origine sans CORS : ici ouvert.
    if (method === 'OPTIONS') return reply(204, null, { 'access-control-allow-methods': 'GET,POST,PUT,DELETE' });

    const auth = headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : null;
    const session = token ? TOKENS[token] : null;

    // -------------------------------------------------- routes
    if (path === '/api/health' && method === 'GET') {
      return reply(200, {
        status: 'ok',
        service: 'academie-api',
        version: '1.4.0',
        uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000)
      });
    }

    if (path === '/api/auth/login' && method === 'POST') {
      const email = body && body.email, password = body && body.password;
      if (!email || !password) return reply(400, { error: 'email et password requis' });
      if (CREDS[email] !== password) return reply(401, { error: 'identifiants invalides' });
      const user = this.users.find(x => x.email === email);
      const tok = user.role === 'admin' ? 'admin-token-2026' : 'dev-token-2026';
      return reply(200, { token: tok, user: { id: user.id, name: user.name, role: user.role } });
    }

    if (path === '/api/users' && method === 'GET') {
      if (this.requireAuth && !session) {
        return reply(401, { error: 'authentification requise', hint: 'Authorization: Bearer <token>' });
      }
      let list = this.users;
      const city = q.get('city');
      const role = q.get('role');
      if (city) list = list.filter(x => x.city.toLowerCase() === city.toLowerCase());
      if (role) list = list.filter(x => x.role === role);
      const limit = parseInt(q.get('limit') || '', 10);
      if (!isNaN(limit)) list = list.slice(0, limit);
      return reply(200, { data: list, total: list.length });
    }

    if (path === '/api/users' && method === 'POST') {
      if (!session) return reply(401, { error: 'authentification requise' });
      if (!body || !body.name || !body.email) return reply(400, { error: 'name et email requis' });
      if (this.users.some(x => x.email === body.email)) return reply(409, { error: 'email déjà utilisé' });
      const user = {
        id: this.nextId++, name: body.name, email: body.email,
        role: body.role || 'user', city: body.city || 'Inconnue'
      };
      this.users.push(user);
      return reply(201, { data: user }, { location: '/api/users/' + user.id });
    }

    let m = path.match(/^\/api\/users\/(\d+)$/);
    if (m && method === 'GET') {
      if (!session) return reply(401, { error: 'authentification requise' });
      const user = this.users.find(x => x.id === Number(m[1]));
      if (!user) return reply(404, { error: 'utilisateur introuvable' });
      return reply(200, { data: user });
    }
    if (m && method === 'DELETE') {
      if (!session) return reply(401, { error: 'authentification requise' });
      if (session.role !== 'admin') return reply(403, { error: 'rôle admin requis' });
      const i = this.users.findIndex(x => x.id === Number(m[1]));
      if (i < 0) return reply(404, { error: 'utilisateur introuvable' });
      this.users.splice(i, 1);
      return reply(204, null);
    }

    if (path === '/api/posts' && method === 'GET') {
      let list = this.posts;
      const uid = q.get('userId');
      const tag = q.get('tag');
      if (uid) list = list.filter(x => x.userId === Number(uid));
      if (tag) list = list.filter(x => x.tags.includes(tag));
      return reply(200, { data: list, total: list.length });
    }

    if (path === '/api/admin/stats' && method === 'GET') {
      if (!session) return reply(401, { error: 'authentification requise' });
      if (session.role !== 'admin') return reply(403, { error: 'rôle admin requis' });
      return reply(200, {
        users: this.users.length,
        posts: this.posts.length,
        admins: this.users.filter(x => x.role === 'admin').length,
        cities: [...new Set(this.users.map(x => x.city))].sort()
      });
    }

    if (path === '/api/slow' && method === 'GET') {
      return reply(200, { status: 'ok', delayed: true });
    }

    return reply(404, { error: 'route inconnue', path, method });
  };

  // Documentation consultable depuis le terminal : curl http://ip:3000/api
  ApiServer.prototype.routes = function () {
    return [
      ['GET', '/api/health', 'public', 'état du service'],
      ['POST', '/api/auth/login', 'public', '{email,password} → {token,user}'],
      ['GET', '/api/users', 'Bearer', 'liste ; filtres ?city= ?role= ?limit='],
      ['POST', '/api/users', 'Bearer', '{name,email,role?,city?} → 201'],
      ['GET', '/api/users/:id', 'Bearer', 'un utilisateur'],
      ['DELETE', '/api/users/:id', 'admin', 'supprime → 204'],
      ['GET', '/api/posts', 'public', 'filtres ?userId= ?tag='],
      ['GET', '/api/admin/stats', 'admin', 'statistiques agrégées']
    ];
  };

  ApiServer.prototype.credentials = function () {
    return Object.keys(CREDS).map(e => ({ email: e, password: CREDS[e] }));
  };
  ApiServer.prototype.tokens = function () { return Object.assign({}, TOKENS); };

  const mod = { ApiServer, USERS, POSTS, TOKENS, CREDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  global.ApiServerMod = mod;
})(typeof window !== 'undefined' ? window : globalThis);
