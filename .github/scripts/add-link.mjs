// Legge una issue creata dal form "+ link" e appende la voce a _data/links.yml.
// Uso: node add-link.mjs <file-yaml>   (env: ISSUE_TITLE, ISSUE_BODY, ISSUE_DATE)
import { appendFileSync, readFileSync } from "node:fs";

const NONE = "_No response_";

export function parseForm(body) {
  const fields = {};
  for (const part of body.replace(/\r\n/g, "\n").split(/^### /m).slice(1)) {
    const nl = part.indexOf("\n");
    const label = part.slice(0, nl).trim();
    const value = part.slice(nl + 1).trim();
    fields[label] = value === NONE ? "" : value;
  }
  return fields;
}

// stringa YAML double-quoted: JSON è un sottoinsieme valido
const q = (s) => JSON.stringify(s);

export function toEntry({ title, body, date }) {
  const f = parseForm(body);
  const url = (f.url || "").trim();
  if (!/^https?:\/\/\S+$/i.test(url)) throw new Error(`url non valido: ${q(url)}`);
  const cat = (f.categoria || "inbox").trim().replace(/^\/+|\/+$/g, "").replace(/\s*\/\s*/g, "/").toLowerCase() || "inbox";
  const desc = (f.descrizione || "").replace(/\s+/g, " ").trim();
  const tags = (f.tag || "").split(/[\s,]+/).map((t) => t.replace(/^#/, "").toLowerCase()).filter(Boolean);
  const lines = [
    "",
    `- url: ${q(url)}`,
    `  title: ${q(title.trim() || url)}`,
    `  cat: ${q(cat)}`,
  ];
  if (desc) lines.push(`  desc: ${q(desc)}`);
  if (tags.length) lines.push(`  tags: [${tags.map(q).join(", ")}]`);
  lines.push(`  added: ${date.slice(0, 10)}`, "");
  return { url, cat, text: lines.join("\n") };
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("add-link.mjs")) {
  const file = process.argv[2];
  const { url, cat, text } = toEntry({
    title: process.env.ISSUE_TITLE ?? "",
    body: process.env.ISSUE_BODY ?? "",
    date: process.env.ISSUE_DATE ?? new Date().toISOString(),
  });
  const current = readFileSync(file, "utf8");
  if (current.includes(`url: ${q(url)}`)) {
    console.log(`::notice::già presente: ${url}`);
    process.exit(0);
  }
  appendFileSync(file, (current.endsWith("\n") ? "" : "\n") + text);
  console.log(`aggiunto ${url} → ${cat}`);
}
