/* Identifiants locaux du jeu : aucune requête réseau et aucun mot de passe
   en clair dans la sauvegarde. Le verrouillage ne chiffre pas cette dernière. */
import { pbkdf2Async } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha256';

const ROUNDS = 210000;
const NAME = /^[a-z][a-z0-9_-]{1,23}$/;
const HEX_SALT = /^[0-9a-f]{32}$/;
const HEX_HASH = /^[0-9a-f]{64}$/;
const ALGO = 'pbkdf2-sha256-v1';

function validName(name) {
  return typeof name === 'string' && NAME.test(name) && name !== 'root';
}
function validStored(account) {
  if (!account || typeof account !== 'object' || Array.isArray(account)) return false;
  if (account.legacy === true) return account.nom === 'joueur' && Object.keys(account).every(k => k === 'legacy' || k === 'nom');
  return validName(account.nom) && account.algo === ALGO && account.iterations === ROUNDS &&
    typeof account.salt === 'string' && HEX_SALT.test(account.salt) &&
    typeof account.hash === 'string' && HEX_HASH.test(account.hash) &&
    Object.keys(account).every(k => ['nom', 'algo', 'iterations', 'salt', 'hash'].includes(k));
}
function toHex(bytes) { return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join(''); }
function fromHex(hex) {
  if (!HEX_SALT.test(hex)) throw new Error('Sel du profil invalide.');
  return Uint8Array.from(hex.match(/../g), h => parseInt(h, 16));
}
async function derive(password, salt, forceFallback = false) {
  if (typeof password !== 'string' || password.length > 128 || !(salt instanceof Uint8Array) || salt.length !== 16) {
    throw new Error('Identifiants invalides.');
  }
  const bytes = new TextEncoder().encode(password);
  const crypto = globalThis.crypto;
  if (!forceFallback && crypto && crypto.subtle) {
    const key = await crypto.subtle.importKey('raw', bytes, 'PBKDF2', false, ['deriveBits']);
    const result = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ROUNDS }, key, 256);
    return new Uint8Array(result);
  }
  // Compatibilité avec les WebViews et origines où SubtleCrypto n'est pas
  // disponible : même PBKDF2-SHA-256, calculé localement et sans réseau.
  return pbkdf2Async(sha256, bytes, salt, { c: ROUNDS, dkLen: 32, asyncTick: 8 });
}
async function create(name, password) {
  if (!validName(name)) throw new Error('Nom d’utilisateur invalide.');
  if (typeof password !== 'string' || password.length < 4 || password.length > 128) {
    throw new Error('Le mot de passe fictif doit contenir entre 4 et 128 caractères.');
  }
  if (!globalThis.crypto || typeof globalThis.crypto.getRandomValues !== 'function') {
    throw new Error('Générateur aléatoire indisponible dans ce navigateur.');
  }
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt);
  return { nom: name, algo: ALGO, iterations: ROUNDS, salt: toHex(salt), hash: toHex(hash) };
}
async function verify(account, password) {
  if (!validStored(account) || account.legacy) return false;
  const result = await derive(password, fromHex(account.salt));
  const actual = toHex(result), expected = account.hash;
  let difference = 0;
  for (let i = 0; i < actual.length; i++) difference |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return difference === 0;
}
const api = { validName, validStored, create, verify, derive, rounds: ROUNDS };
globalThis.LabyCredentials = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
