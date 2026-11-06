/* =====================================================================
   py.js — Interpréteur Python (sous-ensemble pédagogique)
   Tokeniseur avec INDENT/DEDENT, parser, évaluateur.
   Aucune dépendance. Testable sous Node.
   ===================================================================== */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------- ERREURS
  class PyError extends Error {
    constructor(kind, msg, line) {
      super(msg);
      this.pyKind = kind;
      this.pyLine = line;
    }
  }
  const err = (kind, msg, line) => { throw new PyError(kind, msg, line); };

  // ---------------------------------------------------------------- VALEURS
  class PyList { constructor(items) { this.items = items || []; } }
  class PyDict { constructor(map) { this.map = map || new Map(); } }
  class PyTuple { constructor(items) { this.items = items || []; } }
  class PyFunc {
    constructor(name, params, body, closure) {
      this.name = name; this.params = params; this.body = body; this.closure = closure;
    }
  }
  class PyBuiltin { constructor(name, fn) { this.name = name; this.fn = fn; } }
  class PyBreak {}
  class PyContinue {}
  class PyReturn { constructor(v) { this.value = v; } }

  const isNum = v => typeof v === 'number';
  const isStr = v => typeof v === 'string';
  const isBool = v => typeof v === 'boolean';

  function truthy(v) {
    if (v === null || v === undefined) return false;
    if (isBool(v)) return v;
    if (isNum(v)) return v !== 0;
    if (isStr(v)) return v.length > 0;
    if (v instanceof PyList || v instanceof PyTuple) return v.items.length > 0;
    if (v instanceof PyDict) return v.map.size > 0;
    return true;
  }

  function typeName(v) {
    if (v === null || v === undefined) return 'NoneType';
    if (isBool(v)) return 'bool';
    if (isNum(v)) return Number.isInteger(v) ? 'int' : 'float';
    if (isStr(v)) return 'str';
    if (v instanceof PyList) return 'list';
    if (v instanceof PyTuple) return 'tuple';
    if (v instanceof PyDict) return 'dict';
    if (v instanceof PyFunc || v instanceof PyBuiltin) return 'function';
    return 'object';
  }

  function repr(v) {
    if (v === null || v === undefined) return 'None';
    if (isBool(v)) return v ? 'True' : 'False';
    if (isStr(v)) return "'" + v.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
    if (v instanceof PyList) return '[' + v.items.map(repr).join(', ') + ']';
    if (v instanceof PyTuple) {
      const inner = v.items.map(repr).join(', ');
      return '(' + inner + (v.items.length === 1 ? ',' : '') + ')';
    }
    if (v instanceof PyDict) {
      return '{' + [...v.map.entries()].map(([k, x]) => repr(k) + ': ' + repr(x)).join(', ') + '}';
    }
    if (v instanceof PyFunc) return '<function ' + v.name + '>';
    if (v instanceof PyBuiltin) return '<built-in function ' + v.name + '>';
    return String(v);
  }

  function str(v) {
    if (v === null || v === undefined) return 'None';
    if (isBool(v)) return v ? 'True' : 'False';
    if (isStr(v)) return v;
    if (v instanceof PyList) return '[' + v.items.map(repr).join(', ') + ']';
    if (v instanceof PyTuple) {
      const inner = v.items.map(repr).join(', ');
      return '(' + inner + (v.items.length === 1 ? ',' : '') + ')';
    }
    if (v instanceof PyDict) {
      return '{' + [...v.map.entries()].map(([k, x]) => repr(k) + ': ' + repr(x)).join(', ') + '}';
    }
    if (isNum(v)) return fmtNum(v);
    return repr(v);
  }

  function fmtNum(n) {
    if (Number.isInteger(n)) return String(n);
    return String(parseFloat(n.toPrecision(12)));
  }

  function pyEq(a, b) {
    if (a instanceof PyList && b instanceof PyList) {
      return a.items.length === b.items.length && a.items.every((x, i) => pyEq(x, b.items[i]));
    }
    if (a instanceof PyTuple && b instanceof PyTuple) {
      return a.items.length === b.items.length && a.items.every((x, i) => pyEq(x, b.items[i]));
    }
    if (a instanceof PyDict && b instanceof PyDict) {
      if (a.map.size !== b.map.size) return false;
      for (const [k, v] of a.map) {
        if (!b.map.has(k) || !pyEq(v, b.map.get(k))) return false;
      }
      return true;
    }
    return a === b;
  }

  // ---------------------------------------------------------------- TOKENS
  const KEYWORDS = new Set([
    'False', 'None', 'True', 'and', 'as', 'assert', 'break', 'class', 'continue',
    'def', 'del', 'elif', 'else', 'except', 'finally', 'for', 'from', 'global',
    'if', 'import', 'in', 'is', 'lambda', 'nonlocal', 'not', 'or', 'pass',
    'raise', 'return', 'try', 'while', 'with', 'yield'
  ]);

  function tokenize(src) {
    const lines = src.replace(/\r\n?/g, '\n').split('\n');
    const tokens = [];
    const indents = [0];
    let lineNo = 0;
    let bracketDepth = 0;
    let pendingJoin = false;

    for (let raw of lines) {
      lineNo++;
      // retirer commentaires hors chaîne
      let line = '';
      let quote = null;
      for (let i = 0; i < raw.length; i++) {
        const c = raw[i];
        if (quote) {
          line += c;
          if (c === '\\') { if (i + 1 < raw.length) { line += raw[++i]; } continue; }
          if (c === quote) quote = null;
        } else {
          if (c === '"' || c === "'") { quote = c; line += c; continue; }
          if (c === '#') break;
          line += c;
        }
      }
      if (bracketDepth === 0 && !pendingJoin) {
        if (line.trim() === '') continue;
        const ws = line.match(/^[ \t]*/)[0];
        let level = 0;
        for (const ch of ws) level += ch === '\t' ? 8 : 1;
        const cur = indents[indents.length - 1];
        if (level > cur) {
          indents.push(level);
          tokens.push({ t: 'INDENT', v: level, line: lineNo });
        } else if (level < cur) {
          while (indents.length > 1 && indents[indents.length - 1] > level) {
            indents.pop();
            tokens.push({ t: 'DEDENT', v: indents[indents.length - 1], line: lineNo });
          }
          if (indents[indents.length - 1] !== level) {
            err('IndentationError', 'unindent does not match any outer indentation level', lineNo);
          }
        }
      }
      pendingJoin = /\\\s*$/.test(line);
      if (pendingJoin) line = line.replace(/\\\s*$/, '');

      let i = 0;
      const body = line.replace(/^[ \t]+/, '');
      while (i < body.length) {
        const c = body[i];
        if (c === ' ' || c === '\t') { i++; continue; }

        // chaînes
        if (c === '"' || c === "'") {
          const q = c; let j = i + 1; let out = '';
          while (j < body.length && body[j] !== q) {
            if (body[j] === '\\' && j + 1 < body.length) {
              const n = body[j + 1];
              out += n === 'n' ? '\n' : n === 't' ? '\t' : n === 'r' ? '\r'
                : n === '\\' ? '\\' : n === q ? q : n;
              j += 2;
            } else { out += body[j++]; }
          }
          if (j >= body.length) err('SyntaxError', 'unterminated string literal', lineNo);
          tokens.push({ t: 'STRING', v: out, line: lineNo });
          i = j + 1; continue;
        }
        // f-strings
        if ((c === 'f' || c === 'F') && (body[i + 1] === '"' || body[i + 1] === "'")) {
          const q = body[i + 1]; let j = i + 2; let out = '';
          while (j < body.length && body[j] !== q) {
            if (body[j] === '\\' && j + 1 < body.length) {
              const n = body[j + 1];
              out += n === 'n' ? '\n' : n === 't' ? '\t' : n;
              j += 2;
            } else { out += body[j++]; }
          }
          if (j >= body.length) err('SyntaxError', 'unterminated f-string literal', lineNo);
          tokens.push({ t: 'FSTRING', v: out, line: lineNo });
          i = j + 1; continue;
        }
        // nombres
        if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(body[i + 1] || ''))) {
          let j = i;
          while (j < body.length && /[0-9._]/.test(body[j])) j++;
          if (body[j] === 'e' || body[j] === 'E') {
            j++;
            if (body[j] === '+' || body[j] === '-') j++;
            while (j < body.length && /[0-9]/.test(body[j])) j++;
          }
          const text = body.slice(i, j).replace(/_/g, '');
          tokens.push({ t: 'NUMBER', v: parseFloat(text), line: lineNo });
          i = j; continue;
        }
        // identifiants
        if (/[A-Za-z_]/.test(c)) {
          let j = i;
          while (j < body.length && /[A-Za-z0-9_]/.test(body[j])) j++;
          const word = body.slice(i, j);
          tokens.push({ t: KEYWORDS.has(word) ? 'KW' : 'NAME', v: word, line: lineNo });
          i = j; continue;
        }
        // opérateurs
        const three = body.substr(i, 3);
        const two = body.substr(i, 2);
        if (['**=', '//=', '...'].includes(three)) {
          tokens.push({ t: 'OP', v: three, line: lineNo }); i += 3; continue;
        }
        if (['==', '!=', '<=', '>=', '**', '//', '+=', '-=', '*=', '/=', '%=', '->'].includes(two)) {
          tokens.push({ t: 'OP', v: two, line: lineNo }); i += 2; continue;
        }
        if ('+-*/%=<>(),[]{}:.'.includes(c)) {
          if ('([{'.includes(c)) bracketDepth++;
          if (')]}'.includes(c)) bracketDepth--;
          tokens.push({ t: 'OP', v: c, line: lineNo }); i++; continue;
        }
        err('SyntaxError', "invalid character '" + c + "'", lineNo);
      }
      if (bracketDepth === 0 && !pendingJoin && body.trim() !== '') {
        tokens.push({ t: 'NEWLINE', v: '\n', line: lineNo });
      }
    }
    while (indents.length > 1) {
      indents.pop();
      tokens.push({ t: 'DEDENT', v: indents[indents.length - 1], line: lineNo });
    }
    tokens.push({ t: 'EOF', v: null, line: lineNo });
    return tokens;
  }

  // ---------------------------------------------------------------- PARSER
  function parse(tokens) {
    let pos = 0;
    const peek = (k = 0) => tokens[Math.min(pos + k, tokens.length - 1)];
    const at = (t, v) => {
      const tk = peek();
      return tk.t === t && (v === undefined || tk.v === v);
    };
    const next = () => tokens[pos++];
    const expect = (t, v) => {
      if (!at(t, v)) {
        const tk = peek();
        err('SyntaxError',
          'expected ' + (v !== undefined ? "'" + v + "'" : t) +
          " but got '" + (tk.v === null ? 'end of file' : tk.v) + "'", tk.line);
      }
      return next();
    };
    const skipNL = () => { while (at('NEWLINE')) next(); };

    function parseBlock() {
      expect('OP', ':');
      if (at('NEWLINE')) {
        skipNL();
        expect('INDENT');
        const stmts = [];
        skipNL();
        while (!at('DEDENT') && !at('EOF')) {
          stmts.push(parseStatement());
          skipNL();
        }
        if (at('DEDENT')) next();
        if (!stmts.length) err('IndentationError', 'expected an indented block', peek().line);
        return stmts;
      }
      // bloc sur une ligne
      const stmts = [parseStatement()];
      while (at('OP', ';')) { next(); if (!at('NEWLINE')) stmts.push(parseStatement()); }
      return stmts;
    }

    function parseStatement() {
      const tk = peek();
      const line = tk.line;

      if (at('KW', 'pass')) { next(); return { k: 'Pass', line }; }
      if (at('KW', 'break')) { next(); return { k: 'Break', line }; }
      if (at('KW', 'continue')) { next(); return { k: 'Continue', line }; }

      if (at('KW', 'return')) {
        next();
        if (at('NEWLINE') || at('EOF') || at('DEDENT')) return { k: 'Return', value: null, line };
        return { k: 'Return', value: parseExprList(), line };
      }

      if (at('KW', 'if')) {
        next();
        const cond = parseExpr();
        const body = parseBlock();
        skipNL();
        let orelse = null;
        if (at('KW', 'elif')) {
          orelse = [parseStatement()];
        } else if (at('KW', 'else')) {
          next();
          orelse = parseBlock();
        }
        return { k: 'If', cond, body, orelse, line };
      }

      if (at('KW', 'while')) {
        next();
        const cond = parseExpr();
        const body = parseBlock();
        return { k: 'While', cond, body, line };
      }

      if (at('KW', 'for')) {
        next();
        const targets = [expect('NAME').v];
        while (at('OP', ',')) { next(); targets.push(expect('NAME').v); }
        expect('KW', 'in');
        const iter = parseExprList();
        const body = parseBlock();
        return { k: 'For', targets, iter, body, line };
      }

      if (at('KW', 'def')) {
        next();
        const name = expect('NAME').v;
        expect('OP', '(');
        const params = [];
        if (!at('OP', ')')) {
          do {
            const p = { name: expect('NAME').v, def: null };
            if (at('OP', '=')) { next(); p.def = parseExpr(); }
            params.push(p);
          } while (at('OP', ',') && (next(), !at('OP', ')')));
        }
        expect('OP', ')');
        const body = parseBlock();
        return { k: 'Def', name, params, body, line };
      }

      // expression ou affectation
      const first = parseExprList();
      if (at('OP', '=')) {
        const targets = [first];
        while (at('OP', '=')) {
          next();
          const v = parseExprList();
          targets.push(v);
        }
        const value = targets.pop();
        return { k: 'Assign', targets, value, line };
      }
      const aug = ['+=', '-=', '*=', '/=', '%=', '**=', '//='];
      for (const op of aug) {
        if (at('OP', op)) {
          next();
          return { k: 'AugAssign', target: first, op: op.slice(0, -1), value: parseExprList(), line };
        }
      }
      return { k: 'Expr', value: first, line };
    }

    function parseExprList() {
      const first = parseExpr();
      if (at('OP', ',')) {
        const items = [first];
        while (at('OP', ',')) {
          next();
          if (at('NEWLINE') || at('EOF') || at('OP', '=') || at('OP', ')') || at('OP', ']')) break;
          items.push(parseExpr());
        }
        return { k: 'Tuple', items, line: first.line };
      }
      return first;
    }

    // précédence croissante
    // expression conditionnelle : valeur_si_vrai if cond else valeur_sinon
    function parseExpr() {
      const value = parseOr();
      if (at('KW', 'if')) {
        const line = next().line;
        const cond = parseOr();
        expect('KW', 'else');
        const orelse = parseExpr();
        return { k: 'Cond', cond, then: value, orelse, line };
      }
      return value;
    }

    function parseOr() {
      let left = parseAnd();
      while (at('KW', 'or')) { const line = next().line; left = { k: 'Bool', op: 'or', left, right: parseAnd(), line }; }
      return left;
    }
    function parseAnd() {
      let left = parseNot();
      while (at('KW', 'and')) { const line = next().line; left = { k: 'Bool', op: 'and', left, right: parseNot(), line }; }
      return left;
    }
    function parseNot() {
      if (at('KW', 'not')) { const line = next().line; return { k: 'Not', value: parseNot(), line }; }
      return parseCompare();
    }
    function parseCompare() {
      let left = parseArith();
      const ops = [];
      const rights = [];
      for (;;) {
        let op = null;
        if (at('OP', '==')) op = '==';
        else if (at('OP', '!=')) op = '!=';
        else if (at('OP', '<')) op = '<';
        else if (at('OP', '>')) op = '>';
        else if (at('OP', '<=')) op = '<=';
        else if (at('OP', '>=')) op = '>=';
        else if (at('KW', 'in')) op = 'in';
        else if (at('KW', 'not') && peek(1).t === 'KW' && peek(1).v === 'in') { next(); op = 'not in'; }
        else if (at('KW', 'is')) {
          op = 'is';
          next();
          if (at('KW', 'not')) { next(); op = 'is not'; }
          ops.push(op); rights.push(parseArith()); continue;
        }
        if (!op) break;
        next();
        ops.push(op);
        rights.push(parseArith());
      }
      if (!ops.length) return left;
      return { k: 'Compare', left, ops, rights, line: left.line };
    }
    function parseArith() {
      let left = parseTerm();
      while (at('OP', '+') || at('OP', '-')) {
        const tk = next();
        left = { k: 'Bin', op: tk.v, left, right: parseTerm(), line: tk.line };
      }
      return left;
    }
    function parseTerm() {
      let left = parseUnary();
      while (at('OP', '*') || at('OP', '/') || at('OP', '%') || at('OP', '//')) {
        const tk = next();
        left = { k: 'Bin', op: tk.v, left, right: parseUnary(), line: tk.line };
      }
      return left;
    }
    function parseUnary() {
      if (at('OP', '-')) { const tk = next(); return { k: 'Neg', value: parseUnary(), line: tk.line }; }
      if (at('OP', '+')) { next(); return parseUnary(); }
      return parsePower();
    }
    function parsePower() {
      const base = parsePostfix();
      if (at('OP', '**')) { const tk = next(); return { k: 'Bin', op: '**', left: base, right: parseUnary(), line: tk.line }; }
      return base;
    }
    function parsePostfix() {
      let node = parseAtom();
      for (;;) {
        if (at('OP', '(')) {
          const line = next().line;
          const args = [];
          const kwargs = [];
          if (!at('OP', ')')) {
            do {
              if (at('NAME') && peek(1).t === 'OP' && peek(1).v === '=') {
                const name = next().v; next();
                kwargs.push({ name, value: parseExpr() });
              } else {
                args.push(parseExpr());
              }
            } while (at('OP', ',') && (next(), !at('OP', ')')));
          }
          expect('OP', ')');
          node = { k: 'Call', func: node, args, kwargs, line };
        } else if (at('OP', '[')) {
          const line = next().line;
          let lo = null, hi = null, step = null, slice = false;
          if (!at('OP', ':')) lo = parseExpr();
          if (at('OP', ':')) {
            next(); slice = true;
            if (!at('OP', ']') && !at('OP', ':')) hi = parseExpr();
            if (at('OP', ':')) { next(); if (!at('OP', ']')) step = parseExpr(); }
          }
          expect('OP', ']');
          node = slice ? { k: 'Slice', obj: node, lo, hi, step, line }
            : { k: 'Index', obj: node, index: lo, line };
        } else if (at('OP', '.')) {
          next();
          const name = expect('NAME').v;
          node = { k: 'Attr', obj: node, name, line: node.line };
        } else break;
      }
      return node;
    }
    function parseAtom() {
      const tk = peek();
      if (at('NUMBER')) { next(); return { k: 'Num', value: tk.v, line: tk.line }; }
      if (at('STRING')) {
        next();
        let value = tk.v;
        while (at('STRING')) value += next().v;
        return { k: 'Str', value, line: tk.line };
      }
      if (at('FSTRING')) { next(); return { k: 'FStr', value: tk.v, line: tk.line }; }
      if (at('KW', 'True')) { next(); return { k: 'BoolLit', value: true, line: tk.line }; }
      if (at('KW', 'False')) { next(); return { k: 'BoolLit', value: false, line: tk.line }; }
      if (at('KW', 'None')) { next(); return { k: 'NoneLit', line: tk.line }; }
      if (at('NAME')) { next(); return { k: 'Name', name: tk.v, line: tk.line }; }
      if (at('OP', '(')) {
        next();
        if (at('OP', ')')) { next(); return { k: 'Tuple', items: [], line: tk.line }; }
        const e = parseExprList();
        expect('OP', ')');
        return e;
      }
      if (at('OP', '[')) {
        next();
        // compréhension de liste : [expr for x in iterable (if cond)]
        if (!at('OP', ']')) {
          const firstExpr = parseExpr();
          if (at('KW', 'for')) {
            next();
            const targets = [expect('NAME').v];
            while (at('OP', ',')) { next(); targets.push(expect('NAME').v); }
            expect('KW', 'in');
            const iter = parseOr();
            let cond = null;
            if (at('KW', 'if')) { next(); cond = parseOr(); }
            expect('OP', ']');
            return { k: 'Comprehension', expr: firstExpr, targets, iter, cond, line: tk.line };
          }
          const items = [firstExpr];
          while (at('OP', ',')) {
            next();
            if (at('OP', ']')) break;
            items.push(parseExpr());
          }
          expect('OP', ']');
          return { k: 'List', items, line: tk.line };
        }
        expect('OP', ']');
        return { k: 'List', items: [], line: tk.line };
      }
      if (at('OP', '{')) {
        next();
        const pairs = [];
        if (!at('OP', '}')) {
          do {
            const key = parseExpr();
            expect('OP', ':');
            pairs.push([key, parseExpr()]);
          } while (at('OP', ',') && (next(), !at('OP', '}')));
        }
        expect('OP', '}');
        return { k: 'Dict', pairs, line: tk.line };
      }
      err('SyntaxError', "unexpected token '" + (tk.v === null ? 'end of file' : tk.v) + "'", tk.line);
    }

    const body = [];
    skipNL();
    while (!at('EOF')) {
      body.push(parseStatement());
      skipNL();
    }
    return { k: 'Module', body };
  }

  // ---------------------------------------------------------------- ENV
  class Env {
    constructor(parent) { this.vars = new Map(); this.parent = parent || null; }
    get(name) {
      let e = this;
      while (e) { if (e.vars.has(name)) return e.vars.get(name); e = e.parent; }
      return undefined;
    }
    has(name) {
      let e = this;
      while (e) { if (e.vars.has(name)) return true; e = e.parent; }
      return false;
    }
    set(name, v) { this.vars.set(name, v); }
    setGlobal(name, v) {
      let e = this;
      while (e.parent) e = e.parent;
      e.vars.set(name, v);
    }
  }

  // ---------------------------------------------------------------- BUILTINS
  function makeBuiltins(io) {
    const B = {};
    const def = (n, f) => { B[n] = new PyBuiltin(n, f); };

    def('print', (args, kw) => {
      const sep = kw.sep !== undefined ? str(kw.sep) : ' ';
      const end = kw.end !== undefined ? str(kw.end) : '\n';
      io.write(args.map(str).join(sep) + end);
      return null;
    });
    def('len', a => {
      const v = a[0];
      if (isStr(v)) return v.length;
      if (v instanceof PyList || v instanceof PyTuple) return v.items.length;
      if (v instanceof PyDict) return v.map.size;
      err('TypeError', "object of type '" + typeName(v) + "' has no len()");
    });
    def('range', a => {
      let start = 0, stop, step = 1;
      if (a.length === 1) stop = a[0];
      else if (a.length === 2) { start = a[0]; stop = a[1]; }
      else { start = a[0]; stop = a[1]; step = a[2]; }
      if (!isNum(start) || !isNum(stop) || !isNum(step)) {
        err('TypeError', 'range() integer arguments expected');
      }
      if (step === 0) err('ValueError', 'range() arg 3 must not be zero');
      const out = [];
      if (step > 0) for (let i = start; i < stop; i += step) out.push(i);
      else for (let i = start; i > stop; i += step) out.push(i);
      if (out.length > 200000) err('ValueError', 'range() too large');
      return new PyList(out);
    });
    def('int', a => {
      if (!a.length) return 0;
      const v = a[0];
      if (isNum(v)) return Math.trunc(v);
      if (isBool(v)) return v ? 1 : 0;
      if (isStr(v)) {
        const t = v.trim();
        if (!/^[+-]?[0-9]+$/.test(t)) {
          const radix = a[1];
          if (radix !== undefined) {
            const n = parseInt(t, radix);
            if (isNaN(n)) err('ValueError', "invalid literal for int() with base " + radix + ": '" + v + "'");
            return n;
          }
          err('ValueError', "invalid literal for int() with base 10: '" + v + "'");
        }
        return parseInt(t, 10);
      }
      err('TypeError', "int() argument must be a string or a number");
    });
    def('float', a => {
      const v = a[0];
      const n = parseFloat(v);
      if (isNaN(n)) err('ValueError', "could not convert string to float: '" + v + "'");
      return n;
    });
    def('str', a => (a.length ? str(a[0]) : ''));
    def('bool', a => (a.length ? truthy(a[0]) : false));
    def('list', a => {
      if (!a.length) return new PyList([]);
      const v = a[0];
      if (v instanceof PyList) return new PyList(v.items.slice());
      if (v instanceof PyTuple) return new PyList(v.items.slice());
      if (isStr(v)) return new PyList(v.split(''));
      if (v instanceof PyDict) return new PyList([...v.map.keys()]);
      err('TypeError', "'" + typeName(v) + "' object is not iterable");
    });
    def('tuple', a => {
      if (!a.length) return new PyTuple([]);
      const v = a[0];
      if (v instanceof PyList || v instanceof PyTuple) return new PyTuple(v.items.slice());
      if (isStr(v)) return new PyTuple(v.split(''));
      err('TypeError', "'" + typeName(v) + "' object is not iterable");
    });
    def('dict', () => new PyDict());
    def('set', a => {
      const seen = new PyList([]);
      const src = a.length ? a[0] : new PyList([]);
      const items = src instanceof PyList || src instanceof PyTuple ? src.items
        : isStr(src) ? src.split('') : [];
      for (const it of items) if (!seen.items.some(x => pyEq(x, it))) seen.items.push(it);
      return seen;
    });
    def('abs', a => Math.abs(a[0]));
    def('sum', a => {
      const items = a[0] instanceof PyList || a[0] instanceof PyTuple ? a[0].items : [];
      return items.reduce((s, x) => s + x, a[1] || 0);
    });
    def('min', a => {
      const items = a.length === 1 && (a[0] instanceof PyList || a[0] instanceof PyTuple) ? a[0].items : a;
      if (!items.length) err('ValueError', 'min() arg is an empty sequence');
      return items.reduce((m, x) => (x < m ? x : m));
    });
    def('max', a => {
      const items = a.length === 1 && (a[0] instanceof PyList || a[0] instanceof PyTuple) ? a[0].items : a;
      if (!items.length) err('ValueError', 'max() arg is an empty sequence');
      return items.reduce((m, x) => (x > m ? x : m));
    });
    def('round', a => {
      const d = a[1] || 0;
      const f = Math.pow(10, d);
      return Math.round(a[0] * f) / f;
    });
    def('sorted', a => {
      const src = a[0];
      const items = (src instanceof PyList || src instanceof PyTuple) ? src.items.slice()
        : isStr(src) ? src.split('') : [];
      const rev = a[1] === true;
      items.sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
      if (rev) items.reverse();
      return new PyList(items);
    });
    def('reversed', a => {
      const src = a[0];
      const items = (src instanceof PyList || src instanceof PyTuple) ? src.items.slice() : [];
      return new PyList(items.reverse());
    });
    def('enumerate', a => {
      const src = a[0];
      const start = a[1] || 0;
      const items = (src instanceof PyList || src instanceof PyTuple) ? src.items
        : isStr(src) ? src.split('') : [];
      return new PyList(items.map((v, i) => new PyTuple([i + start, v])));
    });
    def('zip', a => {
      const lists = a.map(x => (x instanceof PyList || x instanceof PyTuple) ? x.items : []);
      const n = Math.min(...lists.map(l => l.length));
      const out = [];
      for (let i = 0; i < n; i++) out.push(new PyTuple(lists.map(l => l[i])));
      return new PyList(out);
    });
    def('type', a => '<class \'' + typeName(a[0]) + '\'>');
    def('isinstance', a => {
      const map = { int: 'int', float: 'float', str: 'str', list: 'list', dict: 'dict', bool: 'bool', tuple: 'tuple' };
      const t = a[1] instanceof PyBuiltin ? a[1].name : String(a[1]);
      return typeName(a[0]) === (map[t] || t);
    });
    def('chr', a => String.fromCharCode(a[0]));
    def('ord', a => {
      if (!isStr(a[0]) || a[0].length !== 1) err('TypeError', 'ord() expected a character');
      return a[0].charCodeAt(0);
    });
    def('hex', a => '0x' + (a[0] >>> 0).toString(16));
    def('bin', a => '0b' + (a[0] >>> 0).toString(2));
    def('any', a => {
      const items = a[0] instanceof PyList || a[0] instanceof PyTuple ? a[0].items : [];
      return items.some(truthy);
    });
    def('all', a => {
      const items = a[0] instanceof PyList || a[0] instanceof PyTuple ? a[0].items : [];
      return items.every(truthy);
    });
    def('input', a => {
      if (a.length) io.write(str(a[0]));
      return io.read ? io.read() : '';
    });
    return B;
  }

  // ---------------------------------------------------------------- MÉTHODES
  function callMethod(obj, name, args, line) {
    if (isStr(obj)) {
      switch (name) {
        case 'upper': return obj.toUpperCase();
        case 'lower': return obj.toLowerCase();
        case 'strip': return obj.trim();
        case 'lstrip': return obj.replace(/^\s+/, '');
        case 'rstrip': return obj.replace(/\s+$/, '');
        case 'split': {
          if (!args.length) return new PyList(obj.trim().split(/\s+/).filter(x => x !== ''));
          return new PyList(obj.split(str(args[0])));
        }
        case 'join': {
          const src = args[0];
          const items = (src instanceof PyList || src instanceof PyTuple) ? src.items : [];
          return items.map(str).join(obj);
        }
        case 'replace': return obj.split(str(args[0])).join(str(args[1]));
        case 'startswith': return obj.startsWith(str(args[0]));
        case 'endswith': return obj.endsWith(str(args[0]));
        case 'find': return obj.indexOf(str(args[0]));
        case 'index': {
          const i = obj.indexOf(str(args[0]));
          if (i < 0) err('ValueError', 'substring not found', line);
          return i;
        }
        case 'count': return obj.split(str(args[0])).length - 1;
        case 'isdigit': return obj.length > 0 && /^[0-9]+$/.test(obj);
        case 'isalpha': return obj.length > 0 && /^[A-Za-z]+$/.test(obj);
        case 'title': return obj.replace(/\w\S*/g, t => t[0].toUpperCase() + t.slice(1).toLowerCase());
        case 'zfill': return obj.padStart(args[0], '0');
        case 'format': {
          let i = 0;
          return obj.replace(/\{\}/g, () => str(args[i++]));
        }
      }
      err('AttributeError', "'str' object has no attribute '" + name + "'", line);
    }
    if (obj instanceof PyList) {
      switch (name) {
        case 'append': obj.items.push(args[0]); return null;
        case 'extend': {
          const src = args[0];
          const items = (src instanceof PyList || src instanceof PyTuple) ? src.items : [];
          obj.items.push(...items); return null;
        }
        case 'pop': {
          if (!obj.items.length) err('IndexError', 'pop from empty list', line);
          const i = args.length ? args[0] : obj.items.length - 1;
          if (i < 0 || i >= obj.items.length) err('IndexError', 'pop index out of range', line);
          return obj.items.splice(i, 1)[0];
        }
        case 'insert': obj.items.splice(args[0], 0, args[1]); return null;
        case 'remove': {
          const i = obj.items.findIndex(x => pyEq(x, args[0]));
          if (i < 0) err('ValueError', 'list.remove(x): x not in list', line);
          obj.items.splice(i, 1); return null;
        }
        case 'index': {
          const i = obj.items.findIndex(x => pyEq(x, args[0]));
          if (i < 0) err('ValueError', str(args[0]) + ' is not in list', line);
          return i;
        }
        case 'count': return obj.items.filter(x => pyEq(x, args[0])).length;
        case 'sort': obj.items.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)); return null;
        case 'reverse': obj.items.reverse(); return null;
        case 'copy': return new PyList(obj.items.slice());
        case 'clear': obj.items.length = 0; return null;
      }
      err('AttributeError', "'list' object has no attribute '" + name + "'", line);
    }
    if (obj instanceof PyDict) {
      switch (name) {
        case 'keys': return new PyList([...obj.map.keys()]);
        case 'values': return new PyList([...obj.map.values()]);
        case 'items': return new PyList([...obj.map.entries()].map(([k, v]) => new PyTuple([k, v])));
        case 'get': return obj.map.has(args[0]) ? obj.map.get(args[0]) : (args.length > 1 ? args[1] : null);
        case 'pop': {
          const v = obj.map.get(args[0]);
          obj.map.delete(args[0]);
          return v === undefined ? (args[1] !== undefined ? args[1] : null) : v;
        }
        case 'clear': obj.map.clear(); return null;
        case 'update': {
          if (args[0] instanceof PyDict) for (const [k, v] of args[0].map) obj.map.set(k, v);
          return null;
        }
      }
      err('AttributeError', "'dict' object has no attribute '" + name + "'", line);
    }
    err('AttributeError', "'" + typeName(obj) + "' object has no attribute '" + name + "'", line);
  }

  // ---------------------------------------------------------------- ÉVAL
  function evaluate(ast, io, limits) {
    const maxSteps = (limits && limits.steps) || 400000;
    const maxOutput = (limits && limits.output) || 100000;
    let steps = 0;
    let outLen = 0;
    const wrappedIo = {
      write(s) {
        outLen += s.length;
        if (outLen > maxOutput) err('RuntimeError', 'too much output (infinite loop?)');
        io.write(s);
      },
      read: io.read
    };
    const globals = new Env(null);
    const builtins = makeBuiltins(wrappedIo);
    for (const k in builtins) globals.set(k, builtins[k]);

    const tick = (line) => {
      if (++steps > maxSteps) err('RuntimeError', 'execution too long (infinite loop?)', line);
    };

    function execBlock(stmts, env) {
      for (const s of stmts) {
        const r = exec(s, env);
        if (r instanceof PyReturn || r instanceof PyBreak || r instanceof PyContinue) return r;
      }
      return null;
    }

    function exec(node, env) {
      tick(node.line);
      switch (node.k) {
        case 'Pass': return null;
        case 'Break': return new PyBreak();
        case 'Continue': return new PyContinue();
        case 'Expr': evalExpr(node.value, env); return null;
        case 'Return': return new PyReturn(node.value ? evalExpr(node.value, env) : null);
        case 'Assign': {
          const v = evalExpr(node.value, env);
          for (const t of node.targets) assign(t, v, env, node.line);
          return null;
        }
        case 'AugAssign': {
          const cur = evalExpr(node.target, env);
          const delta = evalExpr(node.value, env);
          const res = binop(node.op, cur, delta, node.line);
          assign(node.target, res, env, node.line);
          return null;
        }
        case 'If': {
          if (truthy(evalExpr(node.cond, env))) return execBlock(node.body, env);
          if (node.orelse) return execBlock(node.orelse, env);
          return null;
        }
        case 'While': {
          let guard = 0;
          while (truthy(evalExpr(node.cond, env))) {
            tick(node.line);
            if (++guard > 200000) err('RuntimeError', 'too many iterations', node.line);
            const r = execBlock(node.body, env);
            if (r instanceof PyBreak) break;
            if (r instanceof PyReturn) return r;
          }
          return null;
        }
        case 'For': {
          const iterable = evalExpr(node.iter, env);
          let items;
          if (iterable instanceof PyList || iterable instanceof PyTuple) items = iterable.items.slice();
          else if (isStr(iterable)) items = iterable.split('');
          else if (iterable instanceof PyDict) items = [...iterable.map.keys()];
          else err('TypeError', "'" + typeName(iterable) + "' object is not iterable", node.line);
          for (const it of items) {
            tick(node.line);
            if (node.targets.length === 1) {
              assign({ k: 'Name', name: node.targets[0], line: node.line }, it, env, node.line);
            } else {
              const parts = (it instanceof PyTuple || it instanceof PyList) ? it.items : [it];
              node.targets.forEach((tn, i) => {
                assign({ k: 'Name', name: tn, line: node.line }, parts[i], env, node.line);
              });
            }
            const r = execBlock(node.body, env);
            if (r instanceof PyBreak) break;
            if (r instanceof PyReturn) return r;
          }
          return null;
        }
        case 'Def': {
          env.set(node.name, new PyFunc(node.name, node.params, node.body, env));
          return null;
        }
        default:
          err('SyntaxError', 'unsupported statement: ' + node.k, node.line);
      }
    }

    function assign(target, value, env, line) {
      if (target.k === 'Name') { env.set(target.name, value); return; }
      if (target.k === 'Tuple' || target.k === 'List') {
        const parts = (value instanceof PyTuple || value instanceof PyList) ? value.items : null;
        if (!parts || parts.length !== target.items.length) {
          err('ValueError', 'cannot unpack value into ' + target.items.length + ' targets', line);
        }
        target.items.forEach((t, i) => assign(t, parts[i], env, line));
        return;
      }
      if (target.k === 'Index') {
        const obj = evalExpr(target.obj, env);
        const idx = evalExpr(target.index, env);
        if (obj instanceof PyList) {
          let i = idx < 0 ? obj.items.length + idx : idx;
          if (i < 0 || i >= obj.items.length) err('IndexError', 'list assignment index out of range', line);
          obj.items[i] = value; return;
        }
        if (obj instanceof PyDict) { obj.map.set(idx, value); return; }
        if (isStr(obj)) err('TypeError', "'str' object does not support item assignment", line);
        err('TypeError', "'" + typeName(obj) + "' object does not support item assignment", line);
      }
      err('SyntaxError', 'cannot assign to this expression', line);
    }

    function binop(op, a, b, line) {
      if (op === '+') {
        if (isStr(a) && isStr(b)) return a + b;
        if (a instanceof PyList && b instanceof PyList) return new PyList(a.items.concat(b.items));
        if (isStr(a) || isStr(b)) {
          err('TypeError', 'can only concatenate str (not "' + typeName(isStr(a) ? b : a) + '") to str', line);
        }
        return num(a, line) + num(b, line);
      }
      if (op === '-') return num(a, line) - num(b, line);
      if (op === '*') {
        if (isStr(a) && isNum(b)) return a.repeat(Math.max(0, Math.trunc(b)));
        if (isNum(a) && isStr(b)) return b.repeat(Math.max(0, Math.trunc(a)));
        if (a instanceof PyList && isNum(b)) {
          const out = [];
          for (let i = 0; i < Math.trunc(b); i++) out.push(...a.items);
          return new PyList(out);
        }
        return num(a, line) * num(b, line);
      }
      if (op === '/') {
        const d = num(b, line);
        if (d === 0) err('ZeroDivisionError', 'division by zero', line);
        return num(a, line) / d;
      }
      if (op === '//') {
        const d = num(b, line);
        if (d === 0) err('ZeroDivisionError', 'integer division or modulo by zero', line);
        return Math.floor(num(a, line) / d);
      }
      if (op === '%') {
        if (isStr(a)) {
          const vals = b instanceof PyTuple ? b.items : [b];
          let i = 0;
          return a.replace(/%[sdif]/g, m => {
            const v = vals[i++];
            return m === '%d' || m === '%i' ? String(Math.trunc(v)) : str(v);
          });
        }
        const d = num(b, line);
        if (d === 0) err('ZeroDivisionError', 'integer division or modulo by zero', line);
        return ((num(a, line) % d) + d) % d;
      }
      if (op === '**') return Math.pow(num(a, line), num(b, line));
      err('SyntaxError', 'unsupported operator ' + op, line);
    }

    function num(v, line) {
      if (isBool(v)) return v ? 1 : 0;
      if (isNum(v)) return v;
      err('TypeError', "unsupported operand type: '" + typeName(v) + "'", line);
    }

    function evalExpr(node, env) {
      tick(node.line);
      switch (node.k) {
        case 'Num': return node.value;
        case 'Str': return node.value;
        case 'BoolLit': return node.value;
        case 'NoneLit': return null;
        case 'FStr': {
          // f-string : évaluer les {expr}
          let out = '';
          let i = 0;
          while (i < node.value.length) {
            const c = node.value[i];
            if (c === '{') {
              if (node.value[i + 1] === '{') { out += '{'; i += 2; continue; }
              let depth = 1, j = i + 1, expr = '';
              while (j < node.value.length && depth > 0) {
                if (node.value[j] === '{') depth++;
                else if (node.value[j] === '}') { depth--; if (depth === 0) break; }
                expr += node.value[j++];
              }
              let fmt = '';
              const colon = expr.lastIndexOf(':');
              if (colon > 0 && !/[\[\(]/.test(expr.slice(colon))) {
                fmt = expr.slice(colon + 1);
                expr = expr.slice(0, colon);
              }
              const sub = parse(tokenize(expr.trim()));
              let v = null;
              if (sub.body.length) v = evalExpr(sub.body[0].value, env);
              if (/^\.(\d+)f$/.test(fmt)) v = num(v, node.line).toFixed(parseInt(RegExp.$1, 10));
              out += str(v);
              i = j + 1;
            } else if (c === '}' && node.value[i + 1] === '}') { out += '}'; i += 2; }
            else { out += c; i++; }
          }
          return out;
        }
        case 'Name': {
          if (!env.has(node.name)) {
            err('NameError', "name '" + node.name + "' is not defined", node.line);
          }
          return env.get(node.name);
        }
        case 'Cond':
          return truthy(evalExpr(node.cond, env))
            ? evalExpr(node.then, env) : evalExpr(node.orelse, env);
        case 'Comprehension': {
          const iterable = evalExpr(node.iter, env);
          let items;
          if (iterable instanceof PyList || iterable instanceof PyTuple) items = iterable.items;
          else if (isStr(iterable)) items = iterable.split('');
          else if (iterable instanceof PyDict) items = [...iterable.map.keys()];
          else err('TypeError', "'" + typeName(iterable) + "' object is not iterable", node.line);
          const out = [];
          const scope = new Env(env);
          for (const it of items) {
            tick(node.line);
            if (node.targets.length === 1) scope.set(node.targets[0], it);
            else {
              const parts = (it instanceof PyTuple || it instanceof PyList) ? it.items : [it];
              node.targets.forEach((tn, i) => scope.set(tn, parts[i]));
            }
            if (node.cond && !truthy(evalExpr(node.cond, scope))) continue;
            out.push(evalExpr(node.expr, scope));
          }
          return new PyList(out);
        }
        case 'List': return new PyList(node.items.map(x => evalExpr(x, env)));
        case 'Tuple': return new PyTuple(node.items.map(x => evalExpr(x, env)));
        case 'Dict': {
          const d = new PyDict();
          for (const [k, v] of node.pairs) d.map.set(evalExpr(k, env), evalExpr(v, env));
          return d;
        }
        case 'Bin': return binop(node.op, evalExpr(node.left, env), evalExpr(node.right, env), node.line);
        case 'Neg': return -num(evalExpr(node.value, env), node.line);
        case 'Not': return !truthy(evalExpr(node.value, env));
        case 'Bool': {
          const l = evalExpr(node.left, env);
          if (node.op === 'and') return truthy(l) ? evalExpr(node.right, env) : l;
          return truthy(l) ? l : evalExpr(node.right, env);
        }
        case 'Compare': {
          let left = evalExpr(node.left, env);
          for (let i = 0; i < node.ops.length; i++) {
            const right = evalExpr(node.rights[i], env);
            const op = node.ops[i];
            let ok;
            if (op === '==') ok = pyEq(left, right);
            else if (op === '!=') ok = !pyEq(left, right);
            else if (op === 'is') ok = left === right;
            else if (op === 'is not') ok = left !== right;
            else if (op === 'in' || op === 'not in') {
              let found = false;
              if (isStr(right)) found = right.includes(str(left));
              else if (right instanceof PyList || right instanceof PyTuple) found = right.items.some(x => pyEq(x, left));
              else if (right instanceof PyDict) found = right.map.has(left);
              else err('TypeError', "argument of type '" + typeName(right) + "' is not iterable", node.line);
              ok = op === 'in' ? found : !found;
            } else {
              const a = isStr(left) || isStr(right) ? left : num(left, node.line);
              const b = isStr(left) || isStr(right) ? right : num(right, node.line);
              if (op === '<') ok = a < b;
              else if (op === '>') ok = a > b;
              else if (op === '<=') ok = a <= b;
              else ok = a >= b;
            }
            if (!ok) return false;
            left = right;
          }
          return true;
        }
        case 'Index': {
          const obj = evalExpr(node.obj, env);
          const idx = evalExpr(node.index, env);
          if (obj instanceof PyDict) {
            if (!obj.map.has(idx)) err('KeyError', repr(idx), node.line);
            return obj.map.get(idx);
          }
          const seq = isStr(obj) ? obj : (obj instanceof PyList || obj instanceof PyTuple) ? obj.items : null;
          if (seq === null) err('TypeError', "'" + typeName(obj) + "' object is not subscriptable", node.line);
          if (!isNum(idx)) err('TypeError', 'indices must be integers', node.line);
          let i = idx < 0 ? seq.length + idx : idx;
          if (i < 0 || i >= seq.length) {
            err('IndexError', (isStr(obj) ? 'string' : 'list') + ' index out of range', node.line);
          }
          return seq[i];
        }
        case 'Slice': {
          const obj = evalExpr(node.obj, env);
          const seq = isStr(obj) ? obj : (obj instanceof PyList || obj instanceof PyTuple) ? obj.items : null;
          if (seq === null) err('TypeError', "'" + typeName(obj) + "' object is not subscriptable", node.line);
          const n = seq.length;
          const step = node.step ? evalExpr(node.step, env) : 1;
          if (step === 0) err('ValueError', 'slice step cannot be zero', node.line);
          let lo = node.lo ? evalExpr(node.lo, env) : (step > 0 ? 0 : n - 1);
          let hi = node.hi ? evalExpr(node.hi, env) : (step > 0 ? n : -1);
          if (lo < 0) lo += n;
          if (hi < 0 && node.hi) hi += n;
          const out = [];
          if (step > 0) {
            for (let i = Math.max(0, lo); i < Math.min(n, hi); i += step) out.push(seq[i]);
          } else {
            for (let i = Math.min(n - 1, lo); i > Math.max(-1, hi); i += step) out.push(seq[i]);
          }
          if (isStr(obj)) return out.join('');
          return obj instanceof PyTuple ? new PyTuple(out) : new PyList(out);
        }
        case 'Attr': {
          const obj = evalExpr(node.obj, env);
          return { __method: true, obj, name: node.name, line: node.line };
        }
        case 'Call': {
          const fn = evalExpr(node.func, env);
          const args = node.args.map(a => evalExpr(a, env));
          const kw = {};
          for (const p of node.kwargs) kw[p.name] = evalExpr(p.value, env);
          if (fn && fn.__method) {
            return callMethod(fn.obj, fn.name, args, node.line);
          }
          if (fn instanceof PyBuiltin) return fn.fn(args, kw);
          if (fn instanceof PyFunc) {
            const local = new Env(fn.closure);
            fn.params.forEach((p, i) => {
              if (i < args.length) local.set(p.name, args[i]);
              else if (kw[p.name] !== undefined) local.set(p.name, kw[p.name]);
              else if (p.def) local.set(p.name, evalExpr(p.def, fn.closure));
              else err('TypeError', fn.name + "() missing required argument: '" + p.name + "'", node.line);
            });
            const r = execBlock(fn.body, local);
            if (r instanceof PyReturn) return r.value;
            return null;
          }
          err('TypeError', "'" + typeName(fn) + "' object is not callable", node.line);
        }
        default:
          err('SyntaxError', 'unsupported expression: ' + node.k, node.line);
      }
    }

    try {
      execBlock(ast.body, globals);
      return { ok: true, globals };
    } catch (e) {
      if (e instanceof PyError) {
        return { ok: false, kind: e.pyKind, message: e.message, line: e.pyLine };
      }
      if (e instanceof RangeError) {
        return { ok: false, kind: 'RecursionError', message: 'maximum recursion depth exceeded', line: null };
      }
      return { ok: false, kind: 'InternalError', message: String(e.message || e), line: null };
    }
  }

  // ---------------------------------------------------------------- API
  function run(source, options) {
    const opts = options || {};
    let out = '';
    const io = {
      write(s) { out += s; },
      read: opts.read || (() => '')
    };
    let ast;
    try {
      ast = parse(tokenize(source));
    } catch (e) {
      if (e instanceof PyError) {
        return { ok: false, kind: e.pyKind, message: e.message, line: e.pyLine, output: out };
      }
      return { ok: false, kind: 'SyntaxError', message: String(e.message || e), line: null, output: out };
    }
    const res = evaluate(ast, io, opts.limits);
    res.output = out;
    return res;
  }

  const API = { run, tokenize, parse, PyList, PyDict, PyTuple, str, repr, typeName };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  global.PyInterp = API;
})(typeof window !== 'undefined' ? window : globalThis);
