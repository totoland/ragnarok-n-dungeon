// Tiny WebAudio synth, same shape as the sibling projects: no assets, context created on the
// first user gesture. Consumes the same game.events the effects layer does.
//
// Two things every voice has to do, and for a long time none of them did - which was the
// Hunter's lag on the iPad (Loki, session i6h6gs): 59 fps falling to 7 over a minute in one
// room, with the GPU flat, the resolution already at its floor, and the sim at 0.03 ms.
//
// 1. Disconnect when it ends. A node wired to the destination and then left alone is
//    eligible for collection in principle; in WebKit, which is what the iPad and the
//    Capacitor build both run, it stays in the render graph long after it goes silent. A
//    minute in the Fallen Library built 2,028 of them for the Hunter and released none, and
//    the audio thread walked every one of them on every render quantum after that.
// 2. Do not synthesise noise per call. Every hit used to allocate a fresh buffer and fill it
//    with Math.random() on the main thread - 35,000 samples a second in a fight, in the same
//    frame budget as the sim and the draw. One second of noise is made once, and each hit
//    plays a slice of it from a random offset; the gain envelope was already doing the fade.
const MAX_VOICES = 32;       // past this, a new sound is dropped rather than stacked

class Sfx {
  constructor() { this.ctx = null; this.muted = false; this.lastAt = new Map(); this.noiseBuf = null; this.voices = 0; }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) this.ctx = new AC();
  }

  // One second of white noise, made the first time it is needed and kept.
  noiseBuffer() {
    if (this.noiseBuf) return this.noiseBuf;
    const n = this.ctx.sampleRate;
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return (this.noiseBuf = buf);
  }

  // Count a voice in, and take every node it built out of the graph when it ends.
  voice(src, nodes) {
    this.voices++;
    src.onended = () => {
      this.voices--;
      for (const n of nodes) { try { n.disconnect(); } catch { /* already gone */ } }
    };
  }

  toggleMute() { this.muted = !this.muted; return this.muted; }

  tone({ freq, to = freq, type = 'square', dur = 0.06, vol = 0.12, at = 0 }) {
    if (!this.ctx || this.muted || this.voices >= MAX_VOICES) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    const t0 = this.ctx.currentTime + at;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to !== freq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(this.ctx.destination);
    this.voice(osc, [osc, gain]);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  noise({ dur = 0.08, vol = 0.1, at = 0, freq = 1200, q = 0.8, type = 'bandpass' }) {
    if (!this.ctx || this.muted || this.voices >= MAX_VOICES) return;
    const t0 = this.ctx.currentTime + at;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f).connect(gain).connect(this.ctx.destination);
    this.voice(src, [src, f, gain]);
    // A slice of the shared second, from somewhere different each time so two hits in a row
    // are not the same hiss. `dur` bounds it; the gain above does the fade-out.
    const len = Math.min(dur, 0.9);
    src.start(t0, Math.random() * (1 - len), len);
  }

  // rate-limit a voice so a 40-hit combo does not become white noise
  gate(key, minGap) {
    const now = this.ctx ? this.ctx.currentTime : 0;
    if ((this.lastAt.get(key) ?? -1) + minGap > now) return false;
    this.lastAt.set(key, now);
    return true;
  }

  handle(ev) {
    if (!this.ctx) return;
    switch (ev.type) {
      case 'attack':
        if (ev.id.startsWith('slash') || ev.id === 'airSlash') { if (this.gate('swing', 0.05)) this.noise({ dur: 0.12, vol: 0.08, freq: 900, q: 0.6, at: 0.08 }); }
        else if (ev.id.startsWith('shoot') || ev.id === 'airShot' || ev.id === 'doubleStrafe') { this.noise({ dur: 0.07, vol: 0.06, freq: 2400, q: 1.5, at: 0.08 }); this.tone({ freq: 1600, to: 600, type: 'triangle', dur: 0.08, vol: 0.05, at: 0.08 }); }
        else if (ev.id === 'bash') { this.noise({ dur: 0.25, vol: 0.12, freq: 500, q: 0.5, at: 0.2 }); this.tone({ freq: 220, to: 60, type: 'sawtooth', dur: 0.3, vol: 0.12, at: 0.22 }); }
        else if (ev.id === 'magnumBreak') { this.tone({ freq: 160, to: 40, type: 'sawtooth', dur: 0.6, vol: 0.18, at: 0.28 }); this.noise({ dur: 0.5, vol: 0.16, freq: 300, q: 0.3, at: 0.28, type: 'lowpass' }); this.tone({ freq: 880, to: 1760, type: 'square', dur: 0.25, vol: 0.05 }); }
        else if (ev.id === 'quicken') { [660, 880, 1320].forEach((f, i) => this.tone({ freq: f, to: f * 1.5, type: 'sine', dur: 0.22, vol: 0.06, at: i * 0.07 })); this.noise({ dur: 0.35, vol: 0.04, freq: 3000, q: 2, at: 0.1 }); }
        else if (ev.id === 'windWalk') { this.noise({ dur: 0.45, vol: 0.09, freq: 1200, q: 0.4, type: 'bandpass' }); this.tone({ freq: 520, to: 1560, type: 'triangle', dur: 0.3, vol: 0.05, at: 0.05 }); }
        else if (ev.id === 'bowlingBash') { this.tone({ freq: 300, to: 900, type: 'sawtooth', dur: 0.4, vol: 0.1 }); this.noise({ dur: 0.5, vol: 0.1, freq: 700, q: 0.4, at: 0.1 }); }
        else if (ev.id === 'arrowShower') { for (let i = 0; i < 6; i++) this.noise({ dur: 0.08, vol: 0.05, freq: 2200 + i * 200, q: 1.5, at: 0.35 + i * 0.05 }); }
        else if (ev.id === 'blitzBeat') { this.tone({ freq: 1400, to: 2800, type: 'square', dur: 0.3, vol: 0.06 }); this.tone({ freq: 2600, to: 1800, type: 'square', dur: 0.2, vol: 0.05, at: 0.32 }); }
        break;
      case 'hit':
        if (ev.target === 'enemy') {
          if (ev.crit) {
            // Ragnarok's critical: a bright metallic "kshing" - a hard high transient, a pair
            // of detuned partials that ring out, and a thump underneath. Never rate-gated:
            // a critical that goes silent because the combo is busy is the one you notice.
            this.noise({ dur: 0.05, vol: 0.22, freq: 4200, q: 0.6, type: 'highpass' });
            this.tone({ freq: 2620, to: 2380, type: 'sine', dur: 0.30, vol: 0.10 });
            this.tone({ freq: 3930, to: 3560, type: 'sine', dur: 0.24, vol: 0.06 });
            this.tone({ freq: 1310, to: 1180, type: 'triangle', dur: 0.18, vol: 0.05 });
            this.tone({ freq: 190, to: 60, type: 'square', dur: 0.12, vol: 0.10 });
            break;
          }
          if (!this.gate('hit', 0.03)) break;
          this.noise({ dur: 0.09, vol: 0.1, freq: 1100, q: 0.7 });
          this.tone({ freq: 380, to: 90, type: 'square', dur: 0.09, vol: 0.07 });
        } else {
          this.tone({ freq: 240, to: 70, type: 'sawtooth', dur: 0.25, vol: 0.14 });
          this.noise({ dur: 0.2, vol: 0.1, freq: 400, q: 0.5 });
        }
        break;
      case 'kill':
        if (ev.monster === 'poring' || ev.monster === 'lunatic') { this.tone({ freq: 700, to: 1400, type: 'sine', dur: 0.12, vol: 0.08 }); this.noise({ dur: 0.1, vol: 0.06, freq: 1800, q: 1 }); }
        else if (ev.boss) { this.tone({ freq: 120, to: 30, type: 'sawtooth', dur: 1.2, vol: 0.2 }); this.noise({ dur: 1.0, vol: 0.18, freq: 200, q: 0.3, type: 'lowpass' }); }
        else { this.noise({ dur: 0.25, vol: 0.1, freq: 600, q: 0.5 }); this.tone({ freq: 200, to: 60, type: 'triangle', dur: 0.25, vol: 0.06 }); }
        break;
      case 'jump': this.tone({ freq: 300, to: 600, type: 'triangle', dur: 0.1, vol: 0.04 }); break;
      case 'autoBlitz': this.tone({ freq: 2200, to: 3400, type: 'square', dur: 0.14, vol: 0.05 }); this.tone({ freq: 3000, to: 1900, type: 'square', dur: 0.12, vol: 0.04, at: 0.14 }); break;
      case 'drain': [660, 990].forEach((f, i) => this.tone({ freq: f, to: f * 1.25, type: 'sine', dur: 0.18, vol: 0.05, at: i * 0.06 })); break;
      case 'dodge': this.noise({ dur: 0.1, vol: 0.06, freq: 2600, q: 1.2 }); this.tone({ freq: 1800, to: 2600, type: 'sine', dur: 0.08, vol: 0.03 }); break;
      case 'dash': this.noise({ dur: 0.12, vol: 0.06, freq: 1500, q: 0.8 }); break;
      case 'land': if (ev.hard) this.noise({ dur: 0.15, vol: 0.08, freq: 250, q: 0.5 }); break;
      case 'shoot': if (ev.owner === 'enemy') this.noise({ dur: 0.08, vol: 0.05, freq: 1800, q: 1.5 }); break;
      case 'windup':
        if (ev.move === 'slam' || ev.move === 'charge') this.tone({ freq: 90, to: 140, type: 'sawtooth', dur: 0.5, vol: 0.1 });
        else if (ev.monster === 'skeleton' || ev.monster === 'orcLord') this.tone({ freq: 500, to: 800, type: 'triangle', dur: 0.15, vol: 0.05 });
        break;
      case 'enemyAttack':
        if (ev.move === 'slam') { this.tone({ freq: 100, to: 30, type: 'sawtooth', dur: 0.5, vol: 0.18 }); this.noise({ dur: 0.4, vol: 0.14, freq: 250, q: 0.3, type: 'lowpass' }); }
        else if (ev.monster !== 'skelArcher') this.noise({ dur: 0.12, vol: 0.06, freq: 800, q: 0.6 });
        break;
      case 'drop': this.tone({ freq: 900, to: 1500, type: 'sine', dur: 0.08, vol: 0.04 }); break;
      case 'pickup': [880, 1320, 1760].forEach((f, i) => this.tone({ freq: f, type: 'sine', dur: 0.12, vol: 0.06, at: i * 0.05 })); break;
      case 'roomClear': [523, 659, 784, 1046].forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 0.25, vol: 0.08, at: i * 0.1 })); break;
      case 'roomEnter': this.tone({ freq: 196, to: 392, type: 'triangle', dur: 0.3, vol: 0.06 }); break;
      case 'bossAdds': this.tone({ freq: 70, to: 200, type: 'sawtooth', dur: 0.6, vol: 0.12 }); break;
      // A boss drop: a soft bell rolled up an octave, held. Rings out after the boss's death cry.
      case 'itemDrop': [1318, 1568, 2093].forEach((f, i) => this.tone({ freq: f, type: 'sine', dur: 0.5, vol: 0.05, at: i * 0.09 })); break;
      case 'bossDrop': [1046, 1318, 1568, 2093].forEach((f, i) => this.tone({ freq: f, type: 'sine', dur: 0.9, vol: 0.06, at: 0.4 + i * 0.12 })); break;
      // The RO level-up fanfare in spirit: a fast rising run and a held top note.
      case 'levelUp': [659, 784, 988, 1318].forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 0.14, vol: 0.07, at: i * 0.07 })); this.tone({ freq: 1568, type: 'triangle', dur: 0.7, vol: 0.09, at: 0.3 }); this.tone({ freq: 784, type: 'sine', dur: 0.7, vol: 0.05, at: 0.3 }); break;
      case 'won': [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone({ freq: f, type: 'square', dur: 0.4, vol: 0.07, at: i * 0.12 })); break;
      case 'gameOver': [440, 415, 392, 349].forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 0.5, vol: 0.08, at: i * 0.25 })); break;
    }
  }
}

export const sfx = new Sfx();
