/*
 * Runtime du labo web : seul le moteur QuickJS, compilé en WebAssembly,
 * exécute le code de l'apprenti. Il ne reçoit ni objets du navigateur, ni
 * réseau, ni système de fichiers ; les deux seules fonctions hôtes écrivent
 * dans la sortie et interrogent l'API fictive en mémoire.
 *
 * Le bundle src/js/quickjs-runtime.js est nécessaire pour l'édition statique
 * et le monofichier hors ligne. Le reconstruire avec npm run build:sandbox.
 */
import { newQuickJSWASMModuleFromVariant } from 'quickjs-emscripten-core';
import variant from '@jitl/quickjs-singlefile-browser-release-sync';

let modulePromise;
function getModule() {
  if (!modulePromise) {
    modulePromise = newQuickJSWASMModuleFromVariant(variant).catch(error => {
      modulePromise = null;
      throw error;
    });
  }
  return modulePromise;
}

function errorText(error) {
  if (!error) return 'Erreur inconnue';
  if (typeof error === 'string') return error;
  const name = error.name || 'Error';
  return name + ': ' + (error.message || String(error));
}

async function run(code, api, limits, shims) {
  const output = [];
  const calls = [];
  const maxLines = limits.maxLines || 400;
  const maxFetch = limits.maxFetch || 40;
  const timeout = Math.max(50, Math.min(Number(limits.timeout) || 4000, 10000));
  const apiBase = limits.apiBase || 'http://10.10.5.10:3000';
  let quickjs;
  try {
    quickjs = await getModule();
  } catch (error) {
    return { ok: false, output: '', calls, error: 'Moteur JavaScript indisponible : ' + errorText(error) };
  }

  const runtime = quickjs.newRuntime();
  runtime.setMemoryLimit(32 * 1024 * 1024);
  runtime.setMaxStackSize(1024 * 1024);
  const deadline = Date.now() + timeout;
  let timedOut = false;
  runtime.setInterruptHandler(() => {
    if (Date.now() > deadline) timedOut = true;
    return timedOut;
  });
  const vm = runtime.newContext();
  let promise;
  try {
    const log = vm.newFunction('__labyLog', (line) => {
      if (output.length < maxLines) output.push(vm.getString(line).slice(0, 4000));
    });
    vm.setProp(vm.global, '__labyLog', log);
    log.dispose();

    const request = vm.newFunction('__labyRequest', (urlHandle, optionsHandle) => {
      let response;
      try {
        if (calls.length >= maxFetch) throw new Error(`trop d'appels fetch (${maxFetch} max)`);
        const base = new URL(apiBase);
        const url = new URL(vm.getString(urlHandle), base);
        if (url.origin !== base.origin) throw new Error('seule l’API simulée est accessible');
        const options = JSON.parse(vm.getString(optionsHandle) || '{}');
        const method = String(options.method || 'GET').toUpperCase();
        response = api.handle(method, url.href, options);
        const call = { url: url.href, method, status: response.status };
        if (response.body && typeof response.body.total === 'number') call.total = response.body.total;
        if (url.pathname === '/api/users' && method === 'GET' && response.status === 200 &&
            response.body && Array.isArray(response.body.data)) {
          // Les validateurs React comparent l'affichage aux données effectivement
          // retournées, sans enregistrer les en-têtes ni les jetons.
          call.names = response.body.data.map(user => String(user.name));
        }
        if (url.pathname === '/api/users' && method === 'POST' && response.status === 201 &&
            response.body && response.body.data && Number.isInteger(response.body.data.id)) {
          call.createdId = response.body.data.id;
        }
        calls.push(call);
      } catch (error) {
        response = { __labyError: error && error.message ? error.message : String(error) };
      }
      return vm.newString(JSON.stringify(response));
    });
    vm.setProp(vm.global, '__labyRequest', request);
    request.dispose();

    // Ces objets vivent dans QuickJS, jamais dans le contexte de la page.
    // Même globalThis.fetch ou Function('return globalThis') restent confinés.
    const prelude = `
      const apiBase = ${JSON.stringify(apiBase)};
      function __format(value) {
        if (typeof value === 'string') return value;
        try { const text = JSON.stringify(value); return text === undefined ? String(value) : text; }
        catch (_) { return String(value); }
      }
      const console = {
        log: (...args) => __labyLog(args.map(__format).join(' ')),
        info: (...args) => __labyLog(args.map(__format).join(' ')),
        warn: (...args) => __labyLog('[warn] ' + args.map(__format).join(' ')),
        error: (...args) => __labyLog('[error] ' + args.map(__format).join(' ')),
        table: value => __labyLog(__format(value))
      };
      async function fetch(url, options) {
        const r = JSON.parse(__labyRequest(String(url), JSON.stringify(options || {})));
        if (r.__labyError) throw new TypeError(r.__labyError);
        return {
          ok: r.status >= 200 && r.status < 300,
          status: r.status,
          statusText: r.statusText || '',
          headers: { get: key => r.headers[String(key).toLowerCase()] ?? null },
          json: async () => r.body,
          text: async () => typeof r.body === 'string' ? r.body : JSON.stringify(r.body)
        };
      }
      globalThis.console = console;
      globalThis.fetch = fetch;
      ${shims}
      (async () => {\n${code}\n})()
    `;

    const evaluated = vm.evalCode(prelude, 'programme-joueur.js');
    if (evaluated.error) {
      const error = vm.dump(evaluated.error);
      evaluated.error.dispose();
      return { ok: false, output: output.join('\n'), calls, error: errorText(error) };
    }
    promise = evaluated.value;
    let jobs = 0;
    while (true) {
      const state = vm.getPromiseState(promise);
      if (state.type === 'fulfilled') {
        const value = vm.dump(state.value);
        state.value.dispose();
        if (value !== undefined && output.length < maxLines) {
          let text;
          try { text = typeof value === 'string' ? value : JSON.stringify(value); }
          catch (_) { text = String(value); }
          output.push('→ ' + String(text).slice(0, 4000));
        }
        return { ok: true, output: output.join('\n'), calls };
      }
      if (state.type === 'rejected') {
        const error = vm.dump(state.error);
        state.error.dispose();
        return {
          ok: false, output: output.join('\n'), calls,
          error: timedOut ? `TimeoutError: exécution interrompue après ${timeout} ms` : errorText(error)
        };
      }
      if (Date.now() > deadline || jobs >= 100000) {
        return { ok: false, output: output.join('\n'), calls, error: `TimeoutError: exécution interrompue après ${timeout} ms` };
      }
      const result = runtime.executePendingJobs(100);
      if (result.error) {
        const error = vm.dump(result.error);
        result.error.dispose();
        return {
          ok: false, output: output.join('\n'), calls,
          error: timedOut ? `TimeoutError: exécution interrompue après ${timeout} ms` : errorText(error)
        };
      }
      jobs += result.value;
      if (!result.value) {
        return { ok: false, output: output.join('\n'), calls, error: 'Promesse non résolue : aucune opération simulée en attente.' };
      }
    }
  } catch (error) {
    return {
      ok: false, output: output.join('\n'), calls,
      error: timedOut ? `TimeoutError: exécution interrompue après ${timeout} ms` : errorText(error)
    };
  } finally {
    if (promise) promise.dispose();
    vm.dispose();
    runtime.dispose();
  }
}

const sandbox = { run };
globalThis.LabySandbox = sandbox;
if (typeof module !== 'undefined' && module.exports) module.exports = sandbox;
