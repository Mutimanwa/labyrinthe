/* =====================================================================
   AUDIO — sons synthétisés par la Web Audio API.
   Aucun fichier externe : le jeu reste un HTML unique, hors ligne.
   Le contexte n'est créé qu'au premier geste de l'utilisateur,
   comme l'exigent les navigateurs (politique autoplay).
   ===================================================================== */
(function (global) {
  'use strict';

  const Audio2 = {
    ctx: null,
    master: null,
    enabled: true,
    volume: 0.35,
    hum: null,
    alarmTimer: null,

    // -------------------------------------------------- initialisation
    init() {
      if (this.ctx) return true;
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return false;
      try {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(this.ctx.destination);
        return true;
      } catch (e) { return false; }
    },

    resume() {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => { });
    },

    setVolume(v) {
      this.volume = Math.max(0, Math.min(1, v));
      if (this.master) this.master.gain.value = this.volume;
    },

    // -------------------------------------------------- primitives
    // Une note simple avec enveloppe, pour éviter les clics.
    tone(freq, dur, type, gain, delay) {
      if (!this.enabled || !this.init()) return;
      this.resume();
      const t0 = this.ctx.currentTime + (delay || 0);
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type || 'square';
      osc.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(gain === undefined ? 0.3 : gain, t0 + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g); g.connect(this.master);
      osc.start(t0); osc.stop(t0 + dur + 0.02);
    },

    // Bruit blanc filtré : frappes, disque, souffle.
    noise(dur, cutoff, gain, delay) {
      if (!this.enabled || !this.init()) return;
      this.resume();
      const t0 = this.ctx.currentTime + (delay || 0);
      const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'bandpass';
      filt.frequency.value = cutoff || 1800;
      filt.Q.value = 0.8;
      const g = this.ctx.createGain();
      g.gain.value = gain === undefined ? 0.25 : gain;
      src.connect(filt); filt.connect(g); g.connect(this.master);
      src.start(t0);
    },

    // Balayage de fréquence : connexion, scan, alarme.
    sweep(f1, f2, dur, type, gain) {
      if (!this.enabled || !this.init()) return;
      this.resume();
      const t0 = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type || 'sawtooth';
      osc.frequency.setValueAtTime(f1, t0);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t0 + dur);
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(gain === undefined ? 0.18 : gain, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g); g.connect(this.master);
      osc.start(t0); osc.stop(t0 + dur + 0.02);
    },

    // -------------------------------------------------- effets du jeu
    key() { this.noise(0.03, 2400 + Math.random() * 900, 0.10); },
    enter() { this.tone(880, 0.05, 'square', 0.10); },
    ok() { this.tone(660, 0.07, 'square', 0.16); this.tone(990, 0.10, 'square', 0.14, 0.06); },
    err() { this.tone(180, 0.16, 'sawtooth', 0.18); this.tone(120, 0.20, 'sawtooth', 0.14, 0.05); },
    connect() { this.sweep(300, 1400, 0.22, 'square', 0.13); this.tone(1200, 0.06, 'sine', 0.12, 0.2); },
    disconnect() { this.sweep(1200, 260, 0.18, 'square', 0.11); },
    scan() { for (let i = 0; i < 4; i++) this.tone(500 + i * 180, 0.04, 'square', 0.07, i * 0.05); },
    progress() { this.tone(1400, 0.03, 'sine', 0.07); },
    found() { [784, 988, 1319].forEach((f, i) => this.tone(f, 0.14, 'square', 0.16, i * 0.09)); },
    contract() {
      [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.20, i * 0.11));
      this.noise(0.3, 600, 0.06, 0.42);
    },
    denied() { this.tone(140, 0.3, 'sawtooth', 0.2); this.tone(90, 0.35, 'square', 0.16, 0.08); },
    traceStart() {
      this.sweep(200, 900, 0.5, 'sawtooth', 0.2);
      this.startAlarm();
    },
    startAlarm() {
      this.stopAlarm();
      if (!this.enabled) return;
      // Deux bips descendants répétés : la tension du compte à rebours.
      this.alarmTimer = setInterval(() => {
        this.tone(760, 0.10, 'square', 0.11);
        this.tone(560, 0.12, 'square', 0.10, 0.13);
      }, 1600);
    },
    stopAlarm() {
      if (this.alarmTimer) { clearInterval(this.alarmTimer); this.alarmTimer = null; }
    },
    traced() {
      this.stopAlarm();
      this.sweep(900, 60, 0.9, 'sawtooth', 0.26);
      this.noise(0.7, 300, 0.16, 0.1);
    },
    // Fond sonore : léger souffle de machine, très discret.
    startHum() {
      if (!this.enabled || !this.init() || this.hum) return;
      this.resume();
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const filt = this.ctx.createBiquadFilter();
      osc.type = 'sawtooth';
      osc.frequency.value = 55;
      filt.type = 'lowpass';
      filt.frequency.value = 180;
      g.gain.value = 0.018;
      osc.connect(filt); filt.connect(g); g.connect(this.master);
      osc.start();
      this.hum = { osc, g };
    },
    stopHum() {
      if (this.hum) { try { this.hum.osc.stop(); } catch (e) { } this.hum = null; }
    },

    setEnabled(on) {
      this.enabled = !!on;
      if (!on) { this.stopAlarm(); this.stopHum(); }
      else this.startHum();
    },

    // -------------------------------------------------- branchement
    install(game) {
      const self = this;
      game.audio = this;
      const cmds = game.shell.commands;

      cmds.son = function (a) {
        const sub = (a[0] || '').toLowerCase();
        if (sub === 'off' || sub === 'muet') {
          self.setEnabled(false); game.soundEnabled = false;
          return { out: 'Son désactivé.', code: 0 };
        }
        if (sub === 'on') {
          self.setEnabled(true); game.soundEnabled = true; self.ok();
          return { out: 'Son activé.', code: 0 };
        }
        if (sub === 'volume') {
          const v = parseFloat(a[1]);
          if (isNaN(v)) return { out: 'usage: son volume <0 à 100>', code: 1 };
          self.setVolume(v / 100); game.soundVolume = self.volume;
          self.ok();
          return { out: `Volume : ${Math.round(self.volume * 100)} %`, code: 0 };
        }
        if (sub === 'test') {
          self.init(); self.resume();
          self.connect();
          setTimeout(() => self.scan(), 350);
          setTimeout(() => self.found(), 800);
          setTimeout(() => self.contract(), 1300);
          return { out: 'Test audio : connexion, scan, réussite, contrat.', code: 0 };
        }
        return {
          out: `SON — synthèse Web Audio, aucun fichier externe

  son on            activer
  son off           couper
  son volume <0-100>  régler
  son test          écouter les effets

  État : ${self.enabled ? 'activé' : 'désactivé'} · volume ${Math.round(self.volume * 100)} %

Les sons sont générés en direct par le navigateur. C'est pourquoi
le jeu reste un fichier unique, sans téléchargement.`, code: 0
        };
      };

      // Restaurer les préférences si une sauvegarde les contient.
      if (game.soundEnabled === false) self.setEnabled(false);
      if (typeof game.soundVolume === 'number') self.setVolume(game.soundVolume);
      return game;
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Audio2;
  global.GameAudio = Audio2;
})(typeof window !== 'undefined' ? window : globalThis);
