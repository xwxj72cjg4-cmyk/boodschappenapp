// Feest bij een goed antwoord: een vlaggetjesslinger, confetti met serpentines en een fanfare.
// Alles wordt in de browser zelf gemaakt (canvas en Web Audio), dus geen bestanden of internet nodig.
(function () {
  "use strict";

  const COLORS = ["#ffcc33", "#ff4f8b", "#34d399", "#8b5cf6", "#60a5fa", "#fff7e6"];
  const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let layer = null;
  let frame = 0;

  // ---------- Geluid ----------
  // De geluiden zelf staan in js/geluiden.js (fanfare, en met publiek bij de winnaar).

  let ctx = null;
  let master = null;

  function audioContext() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) {
      ctx = new AC();
      // Compressor als vangnet, zodat samenvallende klanken niet oversturen.
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -10;
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(comp);
      comp.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function playSound(big) {
    const ac = audioContext();
    if (!ac || !window.Geluiden) return;
    window.Geluiden[big ? "fanfarePubliek" : "fanfare"](ac, master, ac.currentTime + 0.02);
  }

  // ---------- Slinger ----------

  function bunting() {
    const el = document.createElement("div");
    el.className = "bunting";
    const w = window.innerWidth;
    const flags = Math.max(9, Math.min(26, Math.round(w / 70)));
    const sag = Math.min(90, window.innerHeight * 0.09);
    // De lijn: kwadratische boog die in het midden sag/2 pixels doorhangt.
    let html =
      '<svg class="bunting-rope" style="height:' + (sag / 2).toFixed(1) + 'px" viewBox="0 0 100 10" preserveAspectRatio="none">' +
      '<path d="M0,0 Q50,20 100,0" vector-effect="non-scaling-stroke" /></svg>';
    for (let i = 0; i < flags; i++) {
      const x = (i + 0.5) / flags; // 0..1 over de breedte
      const y = sag * 4 * x * (1 - x) * 0.5; // kwadratische boog, gelijk aan de lijn
      const slope = Math.atan((sag * 2 * (1 - 2 * x)) / w) * (180 / Math.PI);
      html +=
        '<i style="left:' + (x * 100).toFixed(2) + "%;top:" + y.toFixed(1) + "px;background:" + COLORS[i % COLORS.length] +
        ";--r:" + slope.toFixed(1) + "deg;animation-delay:" + (i * 0.04).toFixed(2) + 's"></i>';
    }
    el.innerHTML = html;
    return el;
  }

  // ---------- Confetti en serpentines ----------

  function confetti(canvas, big) {
    const c = canvas.getContext("2d");
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = (canvas.width = window.innerWidth * dpr);
    let h = (canvas.height = window.innerHeight * dpr);
    const scale = dpr * Math.max(1, Math.min(2.2, window.innerWidth / 900));
    const pieces = [];
    const count = big ? 220 : 130;
    for (let i = 0; i < count; i++) {
      const fromLeft = i % 2 === 0;
      pieces.push({
        // Twee kanonnen in de onderhoeken die schuin omhoog schieten.
        x: fromLeft ? w * 0.05 : w * 0.95,
        y: h * 0.95,
        vx: (fromLeft ? 1 : -1) * (4 + Math.random() * 9) * scale,
        vy: -(10 + Math.random() * 12) * scale,
        size: (5 + Math.random() * 6) * scale,
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 0.4,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        ribbon: Math.random() < 0.22, // serpentine in plaats van snipper
        phase: Math.random() * Math.PI * 2,
      });
    }
    const start = performance.now();
    const duration = big ? 5200 : 3600;

    function tick(now) {
      const t = now - start;
      c.clearRect(0, 0, w, h);
      const fade = Math.max(0, Math.min(1, (duration - t) / 700));
      c.globalAlpha = fade;
      for (const p of pieces) {
        p.vy += 0.32 * scale; // zwaartekracht
        p.vx *= 0.985;
        p.vy = Math.min(p.vy, (p.ribbon ? 2.2 : 3.4) * scale); // dwarrelen
        p.x += p.vx + Math.sin(t / 300 + p.phase) * 0.8 * scale;
        p.y += p.vy;
        p.rot += p.spin;
        c.fillStyle = p.color;
        c.strokeStyle = p.color;
        if (p.ribbon) {
          // Krullende serpentine: golvende lijn achter het deeltje.
          c.lineWidth = 2.2 * scale;
          c.beginPath();
          for (let k = 0; k < 14; k++) {
            const px = p.x + Math.sin(p.phase + k * 0.7 + t / 180) * 6 * scale;
            const py = p.y - k * 4 * scale;
            if (k === 0) c.moveTo(px, py);
            else c.lineTo(px, py);
          }
          c.stroke();
        } else {
          c.save();
          c.translate(p.x, p.y);
          c.rotate(p.rot);
          c.scale(1, Math.cos(t / 120 + p.phase)); // omdraaien in de lucht
          c.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          c.restore();
        }
      }
      if (t < duration) frame = requestAnimationFrame(tick);
      else stop();
    }
    frame = requestAnimationFrame(tick);
  }

  function stop() {
    cancelAnimationFrame(frame);
    if (layer && layer.parentNode) layer.parentNode.removeChild(layer);
    layer = null;
  }

  function start(opts) {
    opts = opts || {};
    stop();
    if (opts.sound !== false) playSound(opts.big);
    if (reduceMotion) return;
    layer = document.createElement("div");
    layer.className = "feest";
    layer.setAttribute("aria-hidden", "true");
    const canvas = document.createElement("canvas");
    layer.appendChild(canvas);
    layer.appendChild(bunting());
    document.body.appendChild(layer);
    confetti(canvas, opts.big);
  }

  // Geluid moet starten binnen een tik/toetsdruk; dit maakt de geluidschip alvast wakker.
  function unlock() {
    audioContext();
  }

  window.Feest = { start, stop, unlock };
})();
