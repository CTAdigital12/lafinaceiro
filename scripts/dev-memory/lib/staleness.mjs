// check-staleness: relaciona o diff (base...HEAD ou árvore de trabalho) com files:/deps: dos
// registros. Só SINALIZA revisão; nunca altera nem invalida a memória.
//
// Reconhecimento (auditável no histórico do Git):
// - o próprio registro foi alterado no mesmo diff; ou
// - um commit do intervalo tem o trailer "Memory-Reviewed: <IDs> <motivo>".
// Ausência de memória numa mudança: aviso, salvo trailer "No-Memory-Change: <motivo>".

import { execFileSync } from "node:child_process";
import { basename } from "node:path";
import { loadRecords, isActive, MEMORY_DIR } from "./records.mjs";

const MEMORY_PREFIX = MEMORY_DIR + "/";

const MANIFESTS = new Set([
  "package.json", "package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock",
  "deno.json", "deno.lock", "pyproject.toml", "poetry.lock", "Pipfile", "Pipfile.lock", "uv.lock",
  "go.mod", "go.sum", "Cargo.toml", "Cargo.lock", "Gemfile", "Gemfile.lock",
  "composer.json", "composer.lock", "pom.xml", "build.gradle", "build.gradle.kts",
]);
export const isManifest = (p) => MANIFESTS.has(basename(p)) || /^requirements.*\.txt$/.test(basename(p));

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const depRegex = (name) => new RegExp(`(^|[^A-Za-z0-9_.-])${escapeRe(name)}([^A-Za-z0-9_.-]|$)`);

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
}

export function parseNameStatus(z) {
  const t = z.split("\0").filter((x) => x !== "");
  const out = [];
  for (let i = 0; i < t.length; ) {
    const code = t[i++];
    const kind = code[0];
    if (kind === "R" || kind === "C") out.push({ status: kind, from: t[i++], path: t[i++] });
    else out.push({ status: kind, path: t[i++] });
  }
  return out;
}

const matches = (entry, p) => !!p && (entry === p || p.startsWith(entry.endsWith("/") ? entry : entry + "/"));
const DESCR = { M: "alterado", A: "adicionado", D: "removido", T: "com tipo alterado", C: "copiado" };

export function checkStaleness(root, { base = "main", head = null } = {}) {
  let mergeBase;
  try {
    mergeBase = git(root, ["merge-base", base, head ?? "HEAD"]).trim();
  } catch {
    throw new Error(`não foi possível calcular o merge-base entre "${base}" e "${head ?? "HEAD"}" (a base existe? em CI, use fetch-depth: 0)`);
  }
  const range = head ? [mergeBase, head] : [mergeBase]; // sem head: compara com a árvore de trabalho
  const changes = parseNameStatus(git(root, ["diff", "--name-status", "-M", "-z", ...range]));
  if (!head) {
    for (const p of git(root, ["ls-files", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean))
      changes.push({ status: "A", path: p });
  }

  const log = git(root, ["log", "--format=%B%x00", `${mergeBase}..${head ?? "HEAD"}`]);
  const reviewed = new Set();
  for (const m of log.matchAll(/^Memory-Reviewed:\s*(.+)$/gim))
    for (const id of m[1].matchAll(/\b(?:ADR|SOL|ISSUE)-\d{4}\b/g)) reviewed.add(id[0]);
  const noMemoryDeclared = /^No-Memory-Change:\s*\S/im.test(log);

  const { records } = loadRecords(root);
  const active = records.filter(isActive);
  const changedPaths = new Set(changes.flatMap((c) => [c.path, c.from].filter(Boolean)));
  const touched = new Set(records.filter((r) => changedPaths.has(r.path)).map((r) => r.data.id));
  const ack = (id) => (touched.has(id) ? "registro atualizado neste diff" : reviewed.has(id) ? "trailer Memory-Reviewed" : null);

  const findings = [];
  const seen = new Set();
  const add = (f) => {
    const key = [f.kind, f.id, f.path, f.dep].join("|");
    if (seen.has(key)) return;
    seen.add(key);
    findings.push(f);
  };

  for (const c of changes) {
    if (c.path.startsWith(MEMORY_PREFIX) && (!c.from || c.from.startsWith(MEMORY_PREFIX))) continue;
    for (const r of active) {
      for (const entry of r.data.files ?? []) {
        if (typeof entry !== "string") continue;
        if (c.status === "R" && matches(entry, c.from)) {
          add({ kind: "file", id: r.data.id, record: r.path, path: entry, detail: `renomeado para ${c.path} (atualize files:)`, ack: ack(r.data.id) });
        } else if (matches(entry, c.path)) {
          add({ kind: "file", id: r.data.id, record: r.path, path: entry, detail: DESCR[c.status] ?? "alterado", ack: ack(r.data.id) });
        }
      }
    }
  }

  for (const c of changes.filter((c) => isManifest(c.path))) {
    const diff = git(root, ["diff", "-U0", ...range, "--", c.path]);
    const lines = diff.split("\n").filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---)( |$)/.test(l));
    for (const r of active) {
      for (const dep of r.data.deps ?? []) {
        if (!dep?.name) continue;
        const hit = lines.find((l) => depRegex(dep.name).test(l.slice(1)));
        if (hit) add({ kind: "dep", id: r.data.id, record: r.path, path: c.path, dep: dep.name, detail: `linha alterada: ${hit.trim().slice(0, 120)}`, ack: ack(r.data.id) });
      }
    }
  }

  const nonMemory = changes.filter((c) => !c.path.startsWith(MEMORY_PREFIX));
  const memoryTouched = changes.some((c) => c.path.startsWith(MEMORY_PREFIX));
  if (nonMemory.length && !memoryTouched)
    add({ kind: "no-memory", id: null, path: null, detail: `${nonMemory.length} arquivo(s) alterado(s) e nenhuma mudança em ${MEMORY_PREFIX}`, ack: noMemoryDeclared ? "trailer No-Memory-Change" : null });

  return { base, mergeBase, head: head ?? "árvore de trabalho", changes, findings };
}
