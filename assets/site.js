// ~/ioshiro — dithering ordinato (Bayer 8×8) su canvas + filtro link.
// Niente dipendenze. Le animazioni si fermano fuori schermo e con prefers-reduced-motion.

const BAYER8 = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26,
  12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
  3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25,
  15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
].map((v) => (v + 0.5) / 64);

const threshold = (x, y) => BAYER8[(y & 7) * 8 + (x & 7)];

const css = getComputedStyle(document.documentElement);
const rgb = (name) => {
  const hex = css.getPropertyValue(name).trim().slice(1);
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
};
const C = {
  night: rgb("--night-1"),
  night3: rgb("--night-3"),
  line: rgb("--line"),
  ink2: rgb("--ink-2"),
  ink3: rgb("--ink-3"),
  amber: rgb("--amber"),
  amber2: rgb("--amber-2"),
  teal: rgb("--teal"),
  teal2: rgb("--teal-2"),
  orchid: rgb("--orchid"),
  orchid2: rgb("--orchid-2"),
};
// stessi colori come stringa CSS, per le superfici disegnate a tracciati (dot matrix)
const cssCache = new Map();
const S = (c, a = 1) => {
  const k = `${c}|${a}`;
  let s = cssCache.get(k);
  if (!s) cssCache.set(k, (s = `rgb(${c[0]} ${c[1]} ${c[2]} / ${a})`));
  return s;
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (k) => k * k * (3 - 2 * k);
// le firme si spengono solo nell'ultimo quarto, verso destra
const fadeR = (u) => (u < 0.75 ? 1 : Math.max(0, 1 - (u - 0.75) / 0.25));

const reduced = matchMedia("(prefers-reduced-motion: reduce)");

// ── tile Bayer 4×4 come data URL, usata come mask dal CSS (hover dei link)
{
  const c = document.createElement("canvas");
  c.width = c.height = 4;
  const x = c.getContext("2d");
  const img = x.createImageData(4, 4);
  const b4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  for (let i = 0; i < 16; i++) img.data[i * 4 + 3] = b4[i] < 8 ? 255 : 0;
  x.putImageData(img, 0, 0);
  document.documentElement.style.setProperty("--bayer", `url(${c.toDataURL()})`);
}

// ── rumore deterministico
function hash(str) {
  let h = 2166136261;
  for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function noise1(seed, n = 64) {
  const r = rng(seed);
  const v = Array.from({ length: n }, r);
  return (x) => {
    const i = Math.floor(x), f = x - i, s = f * f * (3 - 2 * f);
    const a = v[((i % n) + n) % n], b = v[(((i + 1) % n) + n) % n];
    return a + (b - a) * s;
  };
}
function noise2(seed) {
  const h = (x, y) => {
    let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + seed) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const sx = smooth(x - xi), sy = smooth(y - yi);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}
// rumore per cella, stabile a parità di k
function cellRand(x, y, k) {
  let n = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(k, 83492791)) | 0;
  n = Math.imul(n ^ (n >>> 15), 2246822519);
  return ((n ^ (n >>> 13)) >>> 0) / 4294967296;
}

// ── font pixel 3×5: solo i glifi che servono alle firme
const GLYPHS = {
  b: "##./#.#/##./#.#/##.", d: "##./#.#/#.#/#.#/##.", h: "#.#/#.#/###/#.#/#.#", i: "###/.#./.#./.#./###",
  k: "#.#/#.#/##./#.#/#.#", o: "###/#.#/#.#/#.#/###", "?": "###/..#/.##/.../.#.", ".": ".../.../.../.../.#.",
};
function bitmap(text, scale = 1) {
  const chars = [...text];
  const w = Math.max(1, (chars.length * 4 - 1) * scale), h = 5 * scale;
  const bits = new Uint8Array(w * h);
  chars.forEach((ch, i) => {
    const rows = GLYPHS[ch]?.split("/");
    if (!rows) return;
    for (let gy = 0; gy < 5; gy++)
      for (let gx = 0; gx < 3; gx++)
        if (rows[gy][gx] === "#")
          for (let sy = 0; sy < scale; sy++)
            for (let sx = 0; sx < scale; sx++) bits[(gy * scale + sy) * w + (i * 4 + gx) * scale + sx] = 1;
  });
  return { w, h, at: (x, y) => x >= 0 && y >= 0 && x < w && y < h && bits[y * w + x] === 1 };
}

// ── canvas dithered: px = dimensione del pixel logico
function setup(canvas, px) {
  const ctx = canvas.getContext("2d");
  let img = null, w = 0, h = 0;
  // true se la griglia è cambiata: chi tiene stato per pixel deve ricostruirlo
  const fit = () => {
    const r = canvas.getBoundingClientRect();
    const nw = Math.max(1, Math.round(r.width / px));
    const nh = Math.max(1, Math.round(r.height / px));
    if (nw === w && nh === h) return false;
    w = canvas.width = nw;
    h = canvas.height = nh;
    img = ctx.createImageData(w, h);
    return true;
  };
  fit();
  return {
    fit,
    get w() { return w; },
    get h() { return h; },
    px,
    paint(fn) {
      const d = img.data;
      d.fill(0);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const c = fn(x, y);
          if (!c) continue;
          const o = (y * w + x) * 4;
          d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = c[3] ?? 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    },
  };
}

// ── dot matrix: celle tonde di `cell` px CSS, disegnate a risoluzione piena.
//    fn(col, row) → [colore CSS, raggio 0..1] | null
function dots(canvas, cell) {
  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, dpr = 0, cols = 0, rows = 0, ox = 0, oy = 0;
  const fit = () => {
    const r = canvas.getBoundingClientRect();
    const d = devicePixelRatio || 1;
    if (r.width === W && r.height === H && d === dpr) return false;
    W = r.width; H = r.height; dpr = d;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cols = Math.max(1, Math.floor(W / cell));
    rows = Math.max(1, Math.floor(H / cell));
    ox = (W - cols * cell) / 2;
    oy = (H - rows * cell) / 2;
    return true;
  };
  fit();
  return {
    fit,
    get w() { return cols; },
    get h() { return rows; },
    paint(fn) {
      ctx.clearRect(0, 0, W, H);
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const c = fn(x, y);
          if (!c) continue;
          ctx.fillStyle = c[0];
          ctx.beginPath();
          ctx.arc(ox + (x + 0.5) * cell, oy + (y + 0.5) * cell, (c[1] * cell) / 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    },
  };
}

// loop a bassa frequenza, attivo solo quando visibile; da fermo disegna la "posa" del pezzo
function loop(el, fps, draw, poster = 0) {
  let raf = 0, last = 0, t0 = performance.now(), on = false;
  const tick = (now) => {
    raf = requestAnimationFrame(tick);
    if (now - last < 1000 / fps) return;
    last = now;
    draw((now - t0) / 1000);
  };
  const sync = () => {
    cancelAnimationFrame(raf);
    if (on && !reduced.matches) raf = requestAnimationFrame(tick);
    else draw(reduced.matches ? poster : 0);
  };
  new IntersectionObserver(([e]) => { on = e.isIntersecting; sync(); }).observe(el);
  reduced.addEventListener("change", sync);
  return sync;
}

// ── 1. scena ↔ pagina: dissolvenza Bayer, con qualche goccia che cade nel buio.
//    data-from="top": il buio sta in alto (la scena che ritorna in fondo alla pagina)
for (const canvas of document.querySelectorAll('[data-dither="fade"]')) {
  const fromTop = canvas.dataset.from === "top";
  const g = setup(canvas, 3);
  const drops = rng(7);
  const cols = Array.from({ length: 400 }, () => ({ s: 0.4 + drops() * 0.8, o: drops() * 40, k: drops() }));
  const draw = (t) => {
    g.paint((x, y) => {
      // smoothstep su [0.04, 0.92]: il lato della pagina è pieno, quindi nessun bordo
      const p = y / (g.h - 1);
      const v = Math.min(1, Math.max(0, ((fromTop ? 1 - p : p) - 0.04) / 0.88));
      const e = v * v * (3 - 2 * v);
      if (e > threshold(x, y)) return C.night;
      const d = cols[x % cols.length];
      if (d.k < 0.06) {
        const head = ((t * 18 * d.s + d.o) % (g.h + 12)) - 6;
        const dy = head - y;
        if (dy >= 0 && dy < 4 && v < 0.85) return [...C.teal, 90 - dy * 20];
      }
      return null;
    });
  };
  const sync = loop(canvas, 12, draw);
  new ResizeObserver(() => { g.fit(); sync(); }).observe(canvas);
}

// ── 2. firme di categoria. Le principali hanno un'animazione a tema, le altre la skyline
//    seminata dal nome. make(g, canvas) → draw(t); rifatta da capo se cambia la griglia.

// skyline riflessa in una pozzanghera, seminata dal nome
function skyline(g, canvas) {
  const seed = hash(canvas.dataset.seed || "");
  const sky = noise1(seed);
  const neon = noise1(seed ^ 0x9e3779b9, 32);
  const warm = seed % 2 === 0;
  const lit = warm ? C.amber : C.teal;
  const lit2 = warm ? C.amber2 : C.teal2;
  let born = -1;
  return (t) => {
    // draw(0) = fuori vista o motion ridotto: la rivelazione parte al primo frame animato
    if (born < 0 && t > 0) born = t;
    const reveal = reduced.matches ? 1.2 : born < 0 ? 0 : Math.min(1.2, (t - born) * 1.5);
    const mid = Math.floor(g.h * 0.64);
    g.paint((x, y) => {
      const u = x / g.w;
      if (u > reveal) return null;
      const fade = fadeR(u);
      // palazzi larghi 4–9 pixel, altezza dal rumore
      const step = Math.floor(x / (4 + Math.floor(sky(x * 0.013) * 6)));
      const top = Math.floor(mid * (0.1 + 0.8 * sky(step * 0.37 + 11)));
      const yy = y <= mid ? y : mid - (y - mid) * 1.8; // riflesso compresso
      if (yy < 0) return null;
      const glowAt = neon(step * 0.5 + t * 0.15);
      if (yy >= top) {
        const win = (x % 3 !== 0) && (Math.floor(yy) % 3 === 1) && glowAt > 0.5;
        if (y > mid) {
          const ripple = Math.sin(y * 1.7 + t * 2.2 + x * 0.05) * 0.5 + 0.5;
          if (win && ripple > 0.35 && fade * 0.55 > threshold(x, y)) return lit2;
          return 0.16 * fade > threshold(x, y) ? C.line : null;
        }
        if (win && fade > threshold(x, y) * 0.9) return lit;
        return 0.6 * fade > threshold(x, y) ? C.line : null;
      }
      // alone dell'insegna sopra i tetti
      const halo = Math.max(0, 1 - (top - yy) / 5) * glowAt * fade * 0.6;
      if (y <= mid && halo > threshold(x, y)) return lit2;
      return null;
    });
  };
}

// dev/: tre pannelli tmux di codice visto da lontano; nel primo qualcuno scrive, gli altri scorrono
function minimap(g) {
  const N = 240, L = 72;
  const map = new Uint8Array(N * L); // 0 vuoto, 1 keyword, 2 stringa, 3 numero, 4 identificatore, 5 commento
  const lens = new Uint16Array(N);
  const r = rng(5);
  let ind = 0;
  for (let n = 0; n < N; n++) {
    if (r() < 0.14) continue; // riga vuota
    ind = clamp(ind + (r() < 0.32 ? 1 : 0) - (r() < 0.3 ? 1 : 0), 0, 5);
    let x = ind * 2;
    const count = 1 + Math.floor(r() * 5);
    for (let j = 0; j < count && x < L; j++) {
      const len = 2 + Math.floor(r() * 8);
      const kind = j === 0 && r() < 0.5 ? 1 : r() < 0.18 ? 2 : r() < 0.1 ? 3 : 4;
      for (let i = 0; i < len && x + i < L; i++) map[n * L + x + i] = kind;
      x += len + 1;
    }
    if (r() < 0.14) {
      const len = 6 + Math.floor(r() * 14);
      for (let i = 0; i < len && x + i < L; i++) map[n * L + x + i] = 5;
      x += len;
    }
    lens[n] = Math.min(L, x);
  }
  // caratteri battuti fino all'inizio di ogni riga, con una pausa a fine riga
  const cum = new Float64Array(N + 1);
  for (let n = 0; n < N; n++) cum[n + 1] = cum[n] + Math.max(4, lens[n]) + 3;
  const KIND = [null, C.amber2, C.teal2, C.teal, C.ink3, C.line];
  const panes = 3, colW = Math.ceil(g.w / panes), rows = Math.floor(g.h / 2);
  const speed = [0, 1.6, 0.7], base = [0, 80, 170];
  return (t) => {
    const typed = (t * 22 + cum[24]) % cum[N]; // parte a pannello già pieno
    let cur = 0;
    while (cum[cur + 1] <= typed) cur++;
    const col = typed - cum[cur];
    const blink = Math.floor(t * 2.5) % 2 === 0;
    g.paint((x, y) => {
      const f = fadeR(x / g.w);
      if (f < 1 && f <= threshold(x, y)) return null;
      const p = Math.floor(x / colW), lx = x - p * colW - 3;
      if (x === p * colW && p > 0) return p === 1 ? C.teal2 : C.line; // bordo del pannello attivo
      if (lx < 0 || lx >= L) return null;
      const row = Math.floor(y / 2);
      let line, limit = L, isCur = false;
      if (p === 0) {
        line = cur - (rows - 1 - row);
        if (line < 0) return null;
        if (line === cur) { limit = col; isCur = true; }
      } else {
        line = (Math.floor(t * speed[p]) + row + base[p]) % N;
      }
      if (isCur && blink && lx === Math.floor(col) && col <= lens[cur] + 1) return C.teal;
      if (y % 2 === 1 || lx >= limit) return null;
      const k = map[line * L + lx];
      if (!k || (k === 4 && threshold(x, y) > 0.7)) return null;
      return isCur && k === 4 ? C.ink2 : KIND[k];
    });
  };
}

// ai/: un passo di diffusione alla volta, dal rumore emerge una scena, resta, torna rumore
function denoise(g) {
  const w = g.w, h = g.h;
  const hz = Math.round(h * 0.62);
  const sky = noise1(21), ridge = noise1(33), ridge2 = noise1(44);
  const scenes = [
    (x, y) => { // luna sul mare
      const mx = w * 0.68, my = h * 0.3, mr = Math.max(3, h * 0.22);
      const d = Math.hypot(x - mx, (y - my) * 1.05);
      if (y < hz) {
        if (d < mr) return [0.95, C.amber];
        if (d < mr + 4) return [0.35 * (1 - (d - mr) / 4), C.amber2];
        return [cellRand(x, y, 1) > 0.985 ? 0.9 : 0.04, C.ink3]; // stelle
      }
      const spread = 2 + (y - hz) * 1.6;
      const col = Math.exp(-(((x - mx) / spread) ** 2));
      const wave = Math.sin(y * 2.3 + x * 0.25) > -0.2 ? 1 : 0.2;
      return col * wave > 0.15 ? [0.75 * col * wave, C.amber2] : [0.1, C.teal2];
    },
    (x, y) => { // città di notte
      const step = Math.floor(x / (4 + Math.floor(sky(x * 0.013) * 6)));
      const roof = Math.floor(hz * (0.15 + 0.8 * sky(step * 0.37 + 11)));
      if (y >= hz) return [y === hz ? 0.5 : 0.08, C.teal2];
      if (y < roof) return [0.02, C.ink3];
      const win = x % 3 !== 0 && y % 3 === 1 && cellRand(x >> 2, y, 5) > 0.45;
      return win ? [0.9, cellRand(step, 0, 9) > 0.5 ? C.amber : C.teal] : [0.32, C.line];
    },
    (x, y) => { // montagne
      const r1 = h * (0.2 + 0.35 * ridge(x * 0.035));
      const r2 = h * (0.45 + 0.3 * ridge2(x * 0.06 + 5));
      if (y > r2) return [0.55 + 0.25 * (y / h), C.teal2];
      if (y > r1) return [0.35 + (y - r1) / h, C.ink3];
      return [cellRand(x, y, 2) > 0.985 ? 0.9 : 0.03, C.ink2];
    },
  ].map((at) => {
    const v = new Float32Array(w * h), c = new Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) [v[y * w + x], c[y * w + x]] = at(x, y);
    return { v, c };
  });
  const P = 8;
  return (t) => {
    const sc = scenes[Math.floor(t / P) % scenes.length];
    const p = (t % P) / P;
    // rumore che cala per il 60% del ciclo, scena piena, poi di nuovo rumore
    const sigma = p < 0.6 ? (1 - p / 0.6) ** 1.6 : p < 0.86 ? 0 : (p - 0.86) / 0.14;
    const frame = Math.floor(t * 10);
    g.paint((x, y) => {
      if (cellRand(x, y, frame) < sigma) {
        const k = cellRand(y, x, frame + 7);
        return k > 0.9 ? C.ink3 : k > 0.7 ? C.line : null;
      }
      const i = y * w + x;
      return sc.v[i] > threshold(x, y) ? sc.c[i] : null;
    });
  };
}

// music/: analizzatore a led su un beat lo-fi a 84 bpm, riflesso sotto
function spectrum(g) {
  const cols = g.w, rows = g.h;
  const split = Math.max(3, Math.round(rows * 0.64));
  const hts = new Float32Array(cols), peaks = new Float32Array(cols), hold = new Float32Array(cols);
  const n = noise1(9, 128), n2 = noise1(10, 64);
  const OFF = S(C.night3), OFF2 = S(C.night3, 0.5), REFL = S(C.teal2, 0.8);
  let lastT = 0;
  return (t) => {
    const dt = clamp(t - lastT, 0, 0.2);
    lastT = t;
    const beat = (t * 84) / 60;
    const kick = Math.exp(-(beat % 1) * 5), hat = Math.exp(-((beat + 0.5) % 1) * 9), snare = Math.exp(-((beat + 1) % 2) * 6);
    for (let c = 0; c < cols; c++) {
      const u = c / cols;
      let v = (0.68 - u * 0.4) * (0.2 + 0.8 * n(c * 0.11 + t * 1.3) ** 1.5);
      v += kick * (1 - u) ** 4 * 0.9 + snare * Math.exp(-(((u - 0.35) / 0.12) ** 2)) * 0.45 + hat * u ** 2 * 0.6;
      v = clamp(v * (0.75 + 0.35 * n2(c * 0.9 + t * 6)), 0, 1);
      hts[c] = v > hts[c] ? v : Math.max(v, hts[c] - dt * 1.5);
      if (hts[c] >= peaks[c]) { peaks[c] = hts[c]; hold[c] = 0; }
      else if ((hold[c] += dt) > 0.35) peaks[c] = Math.max(0, peaks[c] - dt * 0.6);
    }
    g.paint((x, y) => {
      const f = fadeR(x / cols);
      if (y < split) {
        const lvl = split - 1 - y; // 0 = riga più bassa
        if (lvl < Math.round(hts[x] * split)) {
          if (f < 1 && f <= threshold(x, y)) return [OFF, 0.55];
          const k = lvl / split;
          return [S(k > 0.72 ? C.amber2 : k > 0.4 ? C.teal : C.teal2), 0.9];
        }
        if (lvl === Math.round(peaks[x] * split) - 1 && peaks[x] > 0.05) return [S(C.amber, f), 0.9];
        return [OFF, 0.55];
      }
      const rr = y - split;
      const ripple = 0.42 - rr * 0.09 + Math.sin(x * 0.7 + t * 4 + rr) * 0.08;
      if (rr < Math.round(hts[x] * split * 0.7) && ripple * f > threshold(x, y)) return [REFL, 0.7];
      return [OFF2, 0.45];
    });
  };
}

// tools/: ingranaggi al neon che ingranano davvero, una cinghia di pacchetti, la città dietro
//         e tutto riflesso nell'acqua
function gears(g) {
  const mid = Math.floor(g.h * 0.76), cy = mid / 2;
  const k = (mid / 2 - 1.6) / 8; // il più grande (8 denti) tocca quasi il bordo alto
  const gs = [];
  for (const [N, lit, lit2] of [[8, C.amber, C.amber2], [6, C.teal, C.teal2], [8, C.amber, C.amber2]]) {
    const R = N * k, prev = gs.at(-1);
    gs.push({ N, R, lit, lit2, x: prev ? prev.x + prev.R + R + 0.3 : R + 3, rot: 0, on: true });
  }
  const last = gs.at(-1);
  const belt = Math.max(1.5, last.R * 0.45);
  const pulleyX = Math.round(Math.min(g.w * 0.62, last.x + 120));
  const top = Math.floor(cy - belt), bot = Math.floor(cy + belt);
  const sky = noise1(hash("tools")), flick = noise1(99, 64);
  const DIM = new Map([[C.amber, C.amber2], [C.teal, C.teal2]]);
  const EMPTY = [null, 0]; // dentro un ingranaggio: niente, nemmeno la città dietro
  let v = 0, t = 0;
  const profile = (gr, dx, dy) => gr.R + 1.1 * clamp(Math.cos(gr.N * (Math.atan2(dy, dx) - gr.rot)) * 3, -1, 1);
  const inside = (gr, px, py) => {
    const dx = px - gr.x, dy = py - cy, d = Math.hypot(dx, dy);
    return d >= gr.R * 0.3 && d <= profile(gr, dx, dy);
  };
  // (px, py) in pixel logici, anche frazionari (il riflesso campiona fra le righe)
  const at = (px, py) => {
    let halo = 0, hc = null;
    for (const gr of gs) {
      const dx = px - gr.x, dy = py - cy, d = Math.hypot(dx, dy);
      if (d > gr.R + 4) continue;
      if (inside(gr, px, py)) {
        // il tubo è il bordo della sagoma (anche attorno al foro dell'asse); dentro è vuoto
        const edge = !inside(gr, px + 1, py) || !inside(gr, px - 1, py) || !inside(gr, px, py + 1) || !inside(gr, px, py - 1);
        return edge ? [gr.on ? gr.lit : gr.lit2, 1] : EMPTY;
      }
      if (d < gr.R * 0.3) return EMPTY;
      const out = d - profile(gr, dx, dy);
      const hv = (1 - out / 2.5) * (gr.on ? 0.3 : 0.1);
      if (out > 0 && hv > halo) { halo = hv; hc = gr.lit2; }
    }
    const iy = Math.floor(py);
    // puleggia
    const pd = Math.hypot(px - pulleyX, py - cy);
    if (pd < belt + 0.6) {
      if (pd > belt - 0.6) return [C.teal, 1];
      const a = Math.atan2(py - cy, px - pulleyX) - t * 0.9;
      const m = ((a % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2);
      return pd < 0.8 || m < 0.35 ? [C.teal2, 1] : EMPTY;
    }
    if (px > last.x && px < pulleyX) {
      // cinghia: tubo teal spento con impulsi accesi che corrono, sopra verso destra
      if (iy === top || iy === bot) {
        const s = iy === top ? -1 : 1;
        return (((px + s * v) % 7) + 7) % 7 < 2 ? [C.teal, 1] : [C.teal2, 1];
      }
      const bx = (((px - v) % 26) + 26) % 26;
      if (iy < top && iy >= top - 3 && bx >= 8 && bx < 13) {
        const edge = iy === top - 3 || bx < 9 || bx >= 12;
        return edge ? [C.amber, 1] : EMPTY;
      }
    }
    return halo > 0 ? [hc, halo] : null;
  };
  return (tt) => {
    t = tt;
    v = t * belt * 1.8;
    // i denti di uno cadono nei vani del successivo, versi opposti
    gs[0].rot = t * 0.9;
    for (let i = 1; i < gs.length; i++) gs[i].rot = Math.PI - (gs[i - 1].N * gs[i - 1].rot + Math.PI) / gs[i].N;
    gs.forEach((gr, i) => { gr.on = flick(t * 4 + i * 17) > 0.22; });
    g.paint((x, y) => {
      const f = fadeR(x / g.w);
      if (f < 1 && f <= threshold(x, y)) return null;
      if (y < mid) {
        const c = at(x + 0.5, y + 0.5);
        if (c) return c[0] && (c[1] >= 1 || c[1] > threshold(x, y)) ? c[0] : null;
        // città lontana, appena accennata
        const step = Math.floor(x / (4 + Math.floor(sky(x * 0.013) * 6)));
        if (y < Math.floor(mid * (0.15 + 0.7 * sky(step * 0.37 + 11)))) return null;
        if (x % 3 !== 0 && y % 3 === 1 && cellRand(step, y, 3) > 0.86) return C.amber2;
        return 0.2 > threshold(x, y) ? C.line : null;
      }
      if (y === mid) return 0.35 > threshold(x, y) ? C.line : null;
      // riflesso: specchiato, compresso, increspato
      const ry = mid - (y - mid) * 1.7;
      if (ry < 0) return null;
      const c = at(x + 0.5 + Math.sin(y * 1.7 + t * 2.2) * 0.8, ry + 0.5);
      return c && c[0] && c[1] * 0.5 > threshold(x, y) ? DIM.get(c[0]) ?? c[0] : null;
    });
  };
}

// idk/: «boh? idk.» ripetuto in un domain warp: ondeggia, cola, cambia colore scorrendo
function melt(g) {
  const bm = bitmap("boh? idk. ", 2);
  const oy = Math.floor((g.h - bm.h) / 2) - 1;
  const nz = noise2(5);
  const COLS = [[C.amber, C.amber2], [C.orchid, C.orchid2], [C.teal, C.teal2]];
  return (t) => {
    g.paint((x, y) => {
      const sx = x + 1.4 * Math.sin(y * 0.3 + t * 1.3) + t * 9;
      const sy = y - oy + 2.2 * Math.sin(x * 0.08 + t * 1.9) + (nz(x * 0.06, t * 0.4) - 0.5) * 3;
      const tx = ((Math.floor(sx) % bm.w) + bm.w) % bm.w;
      const hue = COLS[((Math.floor((sx / bm.w) * 3 + t * 0.4) % 3) + 3) % 3];
      const ty = Math.floor(sy);
      if (bm.at(tx, ty)) return hue[0];
      // colature sotto i pixel accesi
      const dl = Math.max(0, nz(Math.floor(sx) * 0.35, t * 0.25) - 0.45) * 14;
      for (let k = 1; k <= dl; k++) {
        if (bm.at(tx, ty - k)) return (1 - k / (dl + 1)) * 0.9 > threshold(x, y) ? hue[1] : null;
      }
      return 0.06 + 0.1 * nz(x * 0.05 - t * 0.3, y * 0.2) > threshold(x, y) ? C.night3 : null;
    });
  };
}

// inspo/: una fila di occhi che seguono il puntatore e sbattono le palpebre
let pointer = null;
addEventListener("pointermove", (e) => { pointer = { x: e.clientX, y: e.clientY }; }, { passive: true });
document.addEventListener("pointerleave", () => { pointer = null; });
function eyes(g, canvas) {
  const r = rng(hash("inspo"));
  const IRIS = [C.teal, C.orchid, C.amber, C.orchid];
  const list = [];
  for (let tries = 0; tries < 400 && list.length < g.w / 9; tries++) {
    const rx = 3 + r() * 3.5, ry = Math.min(rx * 0.62, g.h / 2 - 1.5);
    const e = { x: rx + 1 + r() * (g.w - 2 * rx - 2), y: ry + 1.5 + r() * Math.max(0, g.h - 2 * ry - 3), rx, ry };
    if (list.some((o) => Math.abs(o.x - e.x) < o.rx + e.rx + 2 && Math.abs(o.y - e.y) < o.ry + e.ry + 2)) continue;
    Object.assign(e, { ir: Math.max(1.3, ry * 0.75), col: IRIS[Math.floor(r() * IRIS.length)], period: 3 + r() * 6, ph: r() * 10 });
    list.push(e);
  }
  // il puntatore in pixel logici, se è vicino alla striscia; altrimenti un bersaglio che vaga
  const target = (t) => {
    const b = canvas.getBoundingClientRect();
    if (pointer && pointer.y > b.top - 80 && pointer.y < b.bottom + 80) {
      return { x: (pointer.x - b.left) / g.px, y: (pointer.y - b.top) / g.px };
    }
    return { x: g.w / 2 + Math.sin(t * 0.37) * g.w * 0.45, y: g.h / 2 + Math.sin(t * 1.3) * g.h };
  };
  return (t) => {
    const p = target(t);
    for (const e of list) {
      const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
      const k = Math.tanh(d / 25);
      e.ox = (dx / d) * k * (e.rx - e.ir - 0.3);
      e.oy = (dy / d) * k * Math.max(0, e.ry - e.ir * 0.6);
      const lt = (t + e.ph) % e.period;
      e.open = t > 0 && lt < 0.2 ? Math.abs(1 - lt / 0.1) : 1;
      e.pupil = d < 12 ? 0.62 : 0.42;
    }
    g.paint((x, y) => {
      const px = x + 0.5, py = y + 0.5;
      for (const e of list) {
        const dx = px - e.x, dy = py - e.y;
        if (Math.abs(dx) > e.rx || Math.abs(dy) > e.ry + 1) continue;
        const u = dx / e.rx;
        const lim = e.ry * (1 - u * u) ** 0.7 * e.open;
        if (e.open < 0.2) return Math.abs(dy) < 0.6 ? C.ink3 : null;
        if (Math.abs(dy) > lim + 0.8) continue;
        if (Math.abs(dy) > lim - 0.4) return C.ink3; // palpebra
        const di = Math.hypot(dx - e.ox, dy - e.oy);
        if (di < e.ir * e.pupil) return C.night;
        if (di < e.ir) return di < e.ir - 0.9 || 0.6 > threshold(x, y) ? e.col : C.night3;
        return C.ink2;
      }
      return null;
    });
  };
}

// fps bassi come il resto; poster = l'istante mostrato con prefers-reduced-motion
const SIGS = {
  dev: { fps: 12, poster: 14, make: minimap },
  ai: { fps: 10, poster: 5.4, make: denoise },
  music: { fps: 24, poster: 3.1, dots: 4, make: spectrum },
  tools: { fps: 12, poster: 2, make: gears },
  idk: { fps: 12, poster: 3, make: melt },
  inspo: { fps: 15, poster: 1, make: eyes },
};
const SKYLINE = { fps: 8, poster: 0, make: skyline };

for (const canvas of document.querySelectorAll('[data-dither="sig"]')) {
  const sig = SIGS[canvas.dataset.seed] ?? SKYLINE;
  const g = sig.dots ? dots(canvas, sig.dots) : setup(canvas, 2);
  let draw = sig.make(g, canvas);
  const sync = loop(canvas, sig.fps, (t) => draw(t), sig.poster);
  new ResizeObserver(() => {
    if (g.fit()) draw = sig.make(g, canvas);
    sync();
  }).observe(canvas);
}

// ── filtro: testo + categoria
const q = document.getElementById("q");
const catButtons = [...document.querySelectorAll(".cat")];
const blocks = [...document.querySelectorAll(".cat-block")];
const status = document.querySelector(".bar__status");
const empty = document.querySelector(".empty");
let cat = new URLSearchParams(location.search).get("cat") || "";
q.value = new URLSearchParams(location.search).get("q") || "";

function apply() {
  const terms = q.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
  let shown = 0, total = 0;
  for (const b of blocks) {
    const inCat = !cat || b.dataset.cat === cat;
    let blockShown = 0;
    for (const sub of b.querySelectorAll(".sub")) {
      let subShown = 0;
      for (const li of sub.querySelectorAll(".link")) {
        total++;
        const ok = inCat && terms.every((t) => li.dataset.text.includes(t));
        li.hidden = !ok;
        if (ok) subShown++;
      }
      sub.hidden = subShown === 0;
      blockShown += subShown;
    }
    b.hidden = blockShown === 0;
    shown += blockShown;
  }
  for (const btn of catButtons) {
    const on = btn.dataset.cat === cat;
    btn.classList.toggle("is-on", on);
    btn.setAttribute("aria-pressed", String(on));
  }
  empty.hidden = shown !== 0;
  status.textContent = terms.length || cat ? `${shown}/${total} link` : "";

  const params = new URLSearchParams();
  if (cat) params.set("cat", cat);
  if (q.value.trim()) params.set("q", q.value.trim());
  const s = params.toString();
  history.replaceState(null, "", s ? `?${s}` : location.pathname);
}

q.addEventListener("input", apply);
for (const btn of catButtons) {
  btn.addEventListener("click", () => { cat = btn.dataset.cat; apply(); });
}
document.querySelector("[data-reset]").addEventListener("click", () => {
  cat = ""; q.value = ""; apply(); q.focus();
});

// ── densità: compatta (default) o larga; tasto d, ricordata nel browser
const root = document.documentElement;
const densityBtn = document.querySelector("[data-density]");
const densityLabel = densityBtn.querySelector("[data-density-label]");
function renderDensity() {
  const wide = root.classList.contains("is-wide");
  densityBtn.setAttribute("aria-pressed", String(wide));
  densityLabel.textContent = wide ? "larga" : "compatta";
}
function toggleDensity() {
  const wide = root.classList.toggle("is-wide");
  try { localStorage.setItem("ioshiro:density", wide ? "wide" : "compact"); } catch {}
  renderDensity();
}
densityBtn.addEventListener("click", toggleDensity);
renderDensity();

addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const typing = document.activeElement === q;
  if (e.key === "/" && !typing) { e.preventDefault(); q.focus(); q.select(); }
  else if (e.key === "Escape" && typing) { q.value = ""; apply(); q.blur(); }
  else if (e.key === "d" && !typing) toggleDensity();
});
apply();
