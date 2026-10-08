// Anteprima locale senza Ruby/Jekyll: render del template con liquidjs,
// asset statici e reload automatico quando cambia un file.
// Uso: bun run dev   (porta: PORT=4000 di default)
import { Liquid } from "liquidjs";
import { watch } from "node:fs";
import { join, normalize, sep } from "node:path";

const root = normalize(join(import.meta.dir, ".."));
const port = Number(process.env.PORT) || 4000;

// su GitHub Pages site.github.repository_url arriva dal plugin github-metadata;
// qui lo ricaviamo dal remote git, se c'è (serve al bottone "proponi un link")
async function repositoryUrl() {
  try {
    const remote = (await Bun.$`git remote get-url origin`.cwd(root).quiet().text()).trim();
    const m = remote.match(/github\.com[:/](.+?)(?:\.git)?$/);
    return m ? `https://github.com/${m[1]}` : null;
  } catch {
    return null;
  }
}
const repository_url = await repositoryUrl();

const engine = new Liquid({ jekyllInclude: true, cache: false });
engine.registerFilter("relative_url", (s) => s);
engine.registerFilter("slugify", (s) =>
  String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
);

// la pagina chiede ogni 500ms la versione; se cambia, si ricarica
const RELOAD = `<script>(async () => {
  let seen;
  for (;;) {
    try {
      const v = await (await fetch("/__version", { cache: "no-store" })).text();
      if (seen !== undefined && v !== seen) return location.reload();
      seen = v;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
})();</script>`;
let version = Date.now();

async function render() {
  const [tpl, links, config] = await Promise.all(
    ["index.html", "_data/links.yml", "_config.yml"].map((f) => Bun.file(join(root, f)).text()),
  );
  const site = {
    ...Bun.YAML.parse(config),
    data: { links: Bun.YAML.parse(links) ?? [] },
    github: { repository_url },
  };
  const body = tpl.replace(/^---\r?\n[\s\S]*?^---\r?\n/m, "");
  const html = await engine.parseAndRender(body, { site });
  return html.replace("</body>", `${RELOAD}\n</body>`);
}

Bun.serve({
  port,
  async fetch(req) {
    const { pathname } = new URL(req.url);

    if (pathname === "/__version") {
      return new Response(String(version), { headers: { "cache-control": "no-store" } });
    }

    if (pathname === "/" || pathname === "/index.html") {
      try {
        return new Response(await render(), {
          headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
        });
      } catch (err) {
        // YAML o Liquid rotti: mostra l'errore invece di una pagina bianca
        return new Response(`${err.name}: ${err.message}\n\n${RELOAD}`, {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
    }

    const path = normalize(join(root, decodeURIComponent(pathname)));
    if (path.startsWith(join(root, "assets") + sep)) {
      const file = Bun.file(path);
      if (await file.exists()) return new Response(file, { headers: { "cache-control": "no-store" } });
    }
    return new Response("404", { status: 404 });
  },
});

watch(root, { recursive: true }, (_, file) => {
  if (!file || /(^|[\\/])(node_modules|\.git)([\\/]|$)/.test(file)) return;
  version = Date.now();
});

console.log(`~/ioshiro → http://localhost:${port}`);
