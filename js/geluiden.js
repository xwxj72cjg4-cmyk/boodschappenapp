// Feestgeluiden voor een goed antwoord, gemaakt met Web Audio (geen bestanden nodig, werkt offline).
// Gekozen uit de proefpagina: fanfare bij een goed antwoord, fanfare met publiek bij de winnaar.
// Elk geluid: function (ac, out, t) — speelt af op AudioContext ac, naar node out, vanaf tijd t.
(function () {
  "use strict";

  // ---------- Bouwstenen ----------

  function noiseBuffer(ac, seconds) {
    const b = ac.createBuffer(1, Math.floor(ac.sampleRate * seconds), ac.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  function envelope(gain, t, attack, peak, hold, release) {
    gain.setValueAtTime(0.0001, t);
    gain.linearRampToValueAtTime(peak, t + attack);
    gain.setValueAtTime(peak, t + attack + hold);
    gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
  }

  function noise(ac, out, t, dur, type, freq, q, vol) {
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer(ac, dur + 0.05);
    const f = ac.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ac.createGain();
    envelope(g.gain, t, 0.003, vol, 0, dur);
    src.connect(f);
    f.connect(g);
    g.connect(out);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  // Koperblazer: drie licht ontstemde zaagtanden door een filter dat bij de aanzet opengaat.
  function brass(ac, out, freq, t, dur, vol) {
    const f = ac.createBiquadFilter();
    f.type = "lowpass";
    f.Q.value = 1.5;
    f.frequency.setValueAtTime(freq * 1.2, t);
    f.frequency.linearRampToValueAtTime(freq * 7, t + 0.05);
    f.frequency.exponentialRampToValueAtTime(freq * 3.5, t + Math.max(0.1, dur));
    const g = ac.createGain();
    envelope(g.gain, t, 0.025, vol, Math.max(0, dur - 0.08), 0.12);
    f.connect(g);
    g.connect(out);
    let lfo = null;
    if (dur > 0.4) {
      lfo = ac.createOscillator();
      lfo.frequency.value = 5.5;
      const depth = ac.createGain();
      depth.gain.setValueAtTime(0, t);
      depth.gain.linearRampToValueAtTime(9, t + 0.35); // vibrato komt er langzaam in
      lfo.connect(depth);
      lfo.start(t);
      lfo.stop(t + dur + 0.2);
      lfo.depth = depth;
    }
    [-6, 0, 6].forEach((det) => {
      const o = ac.createOscillator();
      o.type = "sawtooth";
      o.frequency.value = freq;
      o.detune.value = det;
      if (lfo) lfo.depth.connect(o.detune);
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.2);
    });
  }

  function timpani(ac, out, t, freq, vol) {
    const o = ac.createOscillator();
    o.frequency.setValueAtTime(freq * 1.6, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.08);
    const g = ac.createGain();
    envelope(g.gain, t, 0.004, vol, 0, 0.9);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + 1);
    noise(ac, out, t, 0.05, "lowpass", 900, 0.7, vol * 0.4);
  }

  function cymbal(ac, out, t, vol) {
    noise(ac, out, t, 1.6, "highpass", 6000, 0.5, vol);
    noise(ac, out, t, 0.6, "bandpass", 3200, 0.8, vol * 0.5);
  }

  // Applaus: honderden korte klapjes (gefilterde ruis), eerst aanzwellend en dan wegstervend.
  let applauseCache = null;
  function applauseBuffer(ac, seconds) {
    if (applauseCache && applauseCache.sampleRate === ac.sampleRate) return applauseCache;
    const rate = ac.sampleRate;
    const length = Math.floor(rate * seconds);
    const buffer = ac.createBuffer(2, length, rate);
    const ch = [buffer.getChannelData(0), buffer.getChannelData(1)];
    const claps = Math.floor(seconds * 140);
    for (let c = 0; c < claps; c++) {
      const tt = Math.pow(Math.random(), 1.4) * (seconds - 0.15);
      const start = Math.floor(tt * rate);
      const dur = Math.floor(rate * (0.006 + Math.random() * 0.01));
      const gain = (0.3 + Math.random() * 0.4) * Math.max(0.1, 1 - tt / seconds);
      const pan = Math.random();
      let prev = 0;
      for (let i = 0; i < dur && start + i < length; i++) {
        const raw = Math.random() * 2 - 1;
        const hp = raw - prev * 0.6; // eenvoudige hoogdoorlaat: klap klinkt droger
        prev = raw;
        const v = hp * gain * Math.exp(-i / (dur / 3.5));
        ch[0][start + i] += v * (1.1 - pan * 0.7);
        ch[1][start + i] += v * (0.4 + pan * 0.7);
      }
    }
    applauseCache = buffer;
    return buffer;
  }

  function applause(ac, out, t, vol, seconds) {
    const src = ac.createBufferSource();
    src.buffer = applauseBuffer(ac, seconds || 3);
    const bp = ac.createBiquadFilter();
    bp.type = "peaking";
    bp.frequency.value = 2000;
    bp.gain.value = 5;
    bp.Q.value = 0.8;
    const hp = ac.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 450;
    const g = ac.createGain();
    g.gain.value = vol;
    src.connect(hp);
    hp.connect(bp);
    bp.connect(g);
    g.connect(out);
    src.start(t);
  }

  // Gejuich "woo!": zaagtand met stijgende toonhoogte door twee klinkerfilters.
  function cheer(ac, out, t, vol) {
    [[290, 0], [340, 0.07], [250, 0.13], [380, 0.2]].forEach(([base, delay]) => {
      const s = t + delay;
      const o = ac.createOscillator();
      o.type = "sawtooth";
      o.frequency.setValueAtTime(base, s);
      o.frequency.exponentialRampToValueAtTime(base * 1.9, s + 0.28);
      o.frequency.exponentialRampToValueAtTime(base * 1.6, s + 0.8);
      const vib = ac.createOscillator();
      vib.frequency.value = 6 + Math.random() * 2;
      const vd = ac.createGain();
      vd.gain.value = 15;
      vib.connect(vd);
      vd.connect(o.detune);
      const g = ac.createGain();
      envelope(g.gain, s, 0.08, vol, 0.45, 0.35);
      [[350, 6], [900, 8]].forEach(([fq, q]) => {
        const f = ac.createBiquadFilter();
        f.type = "bandpass";
        f.frequency.setValueAtTime(fq, s);
        f.frequency.linearRampToValueAtTime(fq * 1.8, s + 0.3); // "oe" → "aa"
        f.Q.value = q;
        o.connect(f);
        f.connect(g);
      });
      g.connect(out);
      o.start(s);
      vib.start(s);
      o.stop(s + 1);
      vib.stop(s + 1);
    });
  }

  // ---------- De geluiden ----------

  const C5 = 523.25, E5 = 659.25, G5 = 783.99, G4 = 392;

  const sounds = {
    // Goed antwoord: trompetten met pauken en bekken, ta-ta-ta-taaa!
    fanfare(ac, out, t) {
      timpani(ac, out, t, 98, 0.5);
      const seq = [[G4, 0, 0.11], [C5, 0.13, 0.11], [E5, 0.26, 0.11], [G5, 0.39, 0.28], [E5, 0.72, 0.11], [G5, 0.86, 1.1]];
      seq.forEach(([f, d, len]) => brass(ac, out, f, t + d, len, 0.09));
      brass(ac, out, E5, t + 0.86, 1.1, 0.06); // samenklank op de laatste noot
      brass(ac, out, C5, t + 0.86, 1.1, 0.05);
      timpani(ac, out, t + 0.86, 98, 0.6);
      cymbal(ac, out, t + 0.86, 0.12);
      return 2.3;
    },

    // Winnaar: de fanfare met gejuich en applaus erachteraan.
    fanfarePubliek(ac, out, t) {
      sounds.fanfare(ac, out, t);
      cheer(ac, out, t + 0.9, 0.07);
      applause(ac, out, t + 0.9, 0.6, 3);
      return 4;
    },
  };

  window.Geluiden = sounds;
})();
