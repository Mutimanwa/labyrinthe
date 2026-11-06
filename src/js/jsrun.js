/* =====================================================================
   JSRUN — exécute réellement le JavaScript / TypeScript de l'apprenti.

   - stripTypes : retire les annotations TypeScript (le navigateur ne
     comprend pas les types ; c'est exactement ce que fait `tsc`, en
     version pédagogique).
   - Le code tourne dans QuickJS/WASM, avec limites de temps et de mémoire.
     Aucun objet du navigateur, shell ni réseau réel n'est exposé.
   - fetch() est un pont asynchrone vers l'ApiServer fictif : l'apprenti
     utilise await, headers et codes de statut dans le monde simulé.
   ===================================================================== */
(function (global) {
  'use strict';

  // -------------------------------------------------- TypeScript → JavaScript
  // On retire les types sans chercher à les vérifier : l'objectif est
  // d'exécuter du .ts/.tsx écrit par un débutant, pas de refaire tsc.
  function stripTypes(src) {
    let s = src;
    const strings = [];
    // Protéger chaînes et commentaires pour ne pas les abîmer.
    s = s.replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\/\/[^\n]*|\/\*[\s\S]*?\*\/)/g,
      (m) => { strings.push(m); return `\u0000${strings.length - 1}\u0000`; });

    // interface X { ... } : appariement d'accolades, pas un regex gourmand
    // (un regex non-greedy jusqu'à "\n}" effacerait aussi la fonction suivante).
    const removeBlock = (text, re) => {
      let m;
      while ((m = re.exec(text)) !== null) {
        const open = text.indexOf('{', m.index);
        if (open < 0) break;
        let depth = 0, i = open;
        for (; i < text.length; i++) {
          if (text[i] === '{') depth++;
          else if (text[i] === '}') { depth--; if (depth === 0) break; }
        }
        text = text.slice(0, m.index) + text.slice(i + 1);
        re.lastIndex = 0;
      }
      return text;
    };
    s = removeBlock(s, /\binterface\s+\w+\s*(?:extends\s+[\w.,\s<>]+)?\{/g);
    // type X = { ... };  puis  type X = union;
    s = removeBlock(s, /\btype\s+\w+\s*(?:<[^>]*>)?\s*=\s*\{/g);
    s = s.replace(/;\s*(?=\s|$)/g, (m, off) => m); // no-op, garde la lisibilité
    s = s.replace(/\btype\s+\w+\s*(?:<[^>]*>)?\s*=[^;\n]*;/g, '');
    // annotation par type objet inline :  const x: {a: string} =  →  const x =
    s = s.replace(/(\b(?:const|let|var)\s+[\w$]+)\s*:\s*\{[^{}]*\}\s*(?==)/g, '$1 ');
    // import type ... / export type ...
    s = s.replace(/^\s*(?:import|export)\s+type\s[^\n;]*;?/gm, '');
    // export / import classiques → on les retire, le bac à sable fournit tout
    s = s.replace(/^\s*import\s[^\n;]*from\s*[^\n;]*;?/gm, '');
    s = s.replace(/^\s*import\s*["'][^"']*["'];?/gm, '');
    s = s.replace(/\bexport\s+default\s+/g, '');
    s = s.replace(/\bexport\s+(?=(?:async\s+)?(?:function|const|let|var|class))/g, '');
    // génériques d'appel et de déclaration
    s = s.replace(/\b(useState|useRef|useMemo|useCallback|fetch|Array|Promise|Map|Set)\s*<[^<>()]*>\s*\(/g, '$1(');
    s = s.replace(/\bfunction\s+(\w+)\s*<[^>]*>/g, 'function $1');
    // annotations de retour et de paramètre : ): Type {  →  ) {
    s = s.replace(/\)\s*:\s*(?:Promise\s*<[^>]*>|[A-Za-z_$][\w$]*(?:\[\])?(?:\s*\|\s*[A-Za-z_$][\w$]*(?:\[\])?)*)\s*(?=\{|=>|;)/g, ') ');
    // annotations de variables : const x: Type =  →  const x =
    s = s.replace(/(\b(?:const|let|var)\s+[\w$]+)\s*:\s*[A-Za-z_$][\w$<>\[\],\s|]*?\s*(?==)/g, '$1 ');
    // paramètres typés dans les fonctions fléchées et classiques
    s = s.replace(/([(,]\s*)([\w$]+)\s*\??\s*:\s*(?:[A-Za-z_$][\w$]*(?:<[^>]*>)?(?:\[\])?(?:\s*\|\s*[A-Za-z_$][\w$]*(?:\[\])?)*)\s*(?=[,)])/g, '$1$2 ');
    // as Type  /  as const
    s = s.replace(/\s+as\s+(?:const|[A-Za-z_$][\w$<>\[\]]*)/g, '');
    // opérateur non-null  x!.y  →  x.y
    s = s.replace(/([\w$)\]])!(?=[.\[;,)])/g, '$1');
    // modificateurs de classe
    s = s.replace(/\b(?:public|private|protected|readonly)\s+(?=[\w$])/g, '');
    // déclaration "declare"
    s = s.replace(/^\s*declare\s[^\n]*/gm, '');

    s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => strings[Number(i)]);
    return s;
  }

  // -------------------------------------------------- garde-fou de boucle
  // Utilisé seulement sur le chemin de repli, où l'on ne peut pas tuer
  // le fil d'exécution. On injecte un appel qui lève après N itérations.
  function guardLoops(src) {
    return src.replace(/\b(for|while)\s*\(([^;{]*(?:;[^;{]*){0,2})\)\s*\{/g,
      (m) => m + '__guard();');
  }


  // -------------------------------------------------- shims fournis au code
  // API réelles de React et de Next.js, en version minimale exécutable.
  const SHIMS = `
    const React = {
      createElement(type, props, ...children) {
        return { type, props: Object.assign({}, props, { children: children.flat(Infinity) }) };
      },
      Fragment: 'Fragment'
    };
    function esc(s) {
      return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    const VOID = new Set(['br','hr','img','input','meta','link']);
    function renderToStaticMarkup(el) {
      if (el === null || el === undefined || el === false) return '';
      if (Array.isArray(el)) return el.map(renderToStaticMarkup).join('');
      if (typeof el !== 'object') return esc(el);
      if (typeof el.type === 'function') return renderToStaticMarkup(el.type(el.props || {}));
      if (el.type === 'Fragment') return renderToStaticMarkup(el.props.children);
      const p = el.props || {};
      let attrs = '';
      for (const k in p) {
        if (k === 'children' || k === 'key' || k.startsWith('on')) continue;
        const name = k === 'className' ? 'class' : k === 'htmlFor' ? 'for' : k;
        attrs += ' ' + name + '="' + esc(p[k]) + '"';
      }
      if (VOID.has(el.type)) return '<' + el.type + attrs + '/>';
      return '<' + el.type + attrs + '>' + renderToStaticMarkup(p.children) + '</' + el.type + '>';
    }
    class Response {
      constructor(body, init) {
        init = init || {};
        this._body = body;
        this.status = init.status === undefined ? 200 : init.status;
        this.headers = new Map(Object.entries(init.headers || {}).map(([k,v]) => [k.toLowerCase(), String(v)]));
        this.ok = this.status >= 200 && this.status < 300;
      }
      static json(data, init) {
        const h = Object.assign({ 'content-type': 'application/json' }, (init && init.headers) || {});
        return new Response(JSON.stringify(data), Object.assign({}, init, { headers: h }));
      }
      async json() { return typeof this._body === 'string' ? JSON.parse(this._body) : this._body; }
      async text() { return typeof this._body === 'string' ? this._body : JSON.stringify(this._body); }
    }
  `;

  const DEFAULTS = { timeout: 4000, maxSteps: 2000000, maxFetch: 40, maxLines: 400 };

  async function run(source, api, opts) {
    opts = opts || {};
    const limits = Object.assign({}, DEFAULTS, opts);
    const apiBase = opts.apiBase || 'http://10.10.5.10:3000';
    let code;
    try { code = stripTypes(String(source)); }
    catch (e) { return { ok: false, output: '', calls: [], error: 'SyntaxError: types non reconnus — ' + e.message }; }
    if (!code.trim()) return { ok: false, output: '', calls: [], error: 'fichier vide' };

    // Pas de repli sur new Function : il exposerait le navigateur et le réseau.
    let sandbox = global.LabySandbox;
    if (!sandbox && typeof require === 'function') {
      require('./quickjs-runtime.js');
      sandbox = global.LabySandbox;
    }
    if (!sandbox) return { ok: false, output: '', calls: [], error: 'Moteur JavaScript isolé indisponible.' };
    try {
      return await sandbox.run(code, api, Object.assign({}, limits, { apiBase }), SHIMS);
    } catch (e) {
      return { ok: false, output: '', calls: [], error: 'Erreur du moteur isolé : ' + (e && e.message || e) };
    }
  }

  const mod = { run, stripTypes, guardLoops, DEFAULTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = mod;
  global.JsRun = mod;
})(typeof window !== 'undefined' ? window : globalThis);
