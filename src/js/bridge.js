/* =====================================================================
   bridge.js — pont de persistance : Tauri (SQLite, M5) ou localStorage.
   Chargé EN PREMIER. Utilisé par ui.js quand M5 branchera la sauvegarde
   ; inoffensif en édition web (fallback silencieux, comportement inchangé).
   ===================================================================== */
(function (global) {
  'use strict';

  const core = global.__TAURI__ && global.__TAURI__.core;
  const TAURI = typeof core !== 'undefined';

  async function invoke(cmd, args) {
    if (!TAURI) return null;
    return core.invoke(cmd, args || {});
  }

  global.LabyBridge = {
    /** true dans l'app de bureau (Tauri), false en édition web */
    tauri: TAURI,

    /** Écrit un snapshot ; en web, retourne false (ui.js garde localStorage). */
    async saveWrite(slot, data) {
      if (!TAURI) return false;
      try { await invoke('save_write', { slot, data }); return true; }
      catch (e) { console.warn('save_write:', e); return false; }
    },

    /** Lit un snapshot ; null si absent, false si hors Tauri. */
    async saveRead(slot) {
      if (!TAURI) return false;
      try { return await invoke('save_read', { slot }); }
      catch (e) { console.warn('save_read:', e); return null; }
    },

    /** Liste des slots existants (triés du plus récent au plus ancien). */
    async saveList() {
      if (!TAURI) return [];
      try { return await invoke('save_list'); }
      catch (e) { console.warn('save_list:', e); return []; }
    },

    /** Charge un pack de contenu data-driven (missions, sites, threads…). */
    async contentLoad(pack) {
      if (!TAURI) return false;
      try { return await invoke('content_load', { pack }); }
      catch (e) { console.warn('content_load:', e); return false; }
    },

    async version() {
      if (!TAURI) return 'web';
      try { return await invoke('app_version'); }
      catch (e) { return 'web'; }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
