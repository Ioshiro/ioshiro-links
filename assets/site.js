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
  line: rgb("--line"),
  amber: rgb("--amber"),
  amber2: rgb("--amber-2"),
  teal: rgb("--teal"),
  teal2: rgb("--teal-2"),
};

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

// ── canvas dithered: px = dimensione del pixel logico
function setup(canvas, px) {
  const ctx = canvas.getContext("2d");
  let img = null, w = 0, h = 0;
  const fit = () => {
    const r = canvas.getBoundingClientRect();
    w = Math.max(1, Math.round(r.width / px));
    h = Math.max(1, Math.round(r.height / px));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      img = ctx.createImageData(w, h);
    }
  };
  fit();
  return {
    fit,
    get w() { return w; },
    get h() { return h; },
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

// loop a bassa frequenza, attivo solo quando visibile
function loop(el, fps, draw) {
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
    else draw(0);
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

// ── 2. firma di categoria: skyline a tutta larghezza seminata dal nome, riflessa in una pozzanghera
for (const canvas of document.querySelectorAll('[data-dither="sig"]')) {
  const seed = hash(canvas.dataset.seed || "");
  const sky = noise1(seed);
  const neon = noise1(seed ^ 0x9e3779b9, 32);
  const warm = seed % 2 === 0;
  const lit = warm ? C.amber : C.teal;
  const lit2 = warm ? C.amber2 : C.teal2;
  const g = setup(canvas, 2);
  let born = -1;
  const draw = (t) => {
    // draw(0) = fuori vista o motion ridotto: la rivelazione parte al primo frame animato
    if (born < 0 && t > 0) born = t;
    const reveal = reduced.matches ? 1.2 : born < 0 ? 0 : Math.min(1.2, (t - born) * 1.5);
    const mid = Math.floor(g.h * 0.64);
    g.paint((x, y) => {
      const u = x / g.w;
      if (u > reveal) return null;
      // si spegne solo nell'ultimo quarto, verso destra
      const fade = u < 0.75 ? 1 : 1 - (u - 0.75) / 0.25;
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
  const sync = loop(canvas, 8, draw);
  new ResizeObserver(() => { g.fit(); sync(); }).observe(canvas);
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
