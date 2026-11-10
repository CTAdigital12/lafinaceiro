// Carrega e descreve os registros de .ai/memory/.

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative, sep, basename } from "node:path";
import { parseRecordText } from "./frontmatter.mjs";

export const MEMORY_DIR = ".ai/memory";

const COMMON = ["id", "type", "title", "status", "created_at", "reviewed_at", "files", "deps", "review_required"];

export const TYPES = {
  decision: {
    prefix: "ADR",
    dir: "decisions",
    statuses: ["proposed", "approved", "superseded", "rejected"],
    required: [...COMMON, "owner", "scope", "related_prs", "supersedes"],
    lists: ["files", "deps", "related_prs", "supersedes"],
  },
  solution: {
    prefix: "SOL",
    dir: "solutions",
    statuses: ["proposed", "verified", "approved", "superseded", "rejected"],
    required: [...COMMON, "scope", "stack", "tags", "related_prs", "related_commits", "confidence"],
    lists: ["files", "deps", "stack", "tags", "related_prs", "related_commits", "supersedes"],
    // Seções que uma solução verified/approved precisa ter preenchidas.
    requiredSections: [
      "Sintoma reproduzível",
      "Erro exato",
      "Causa raiz confirmada",
      "Diagnóstico executado",
      "Correção aplicada",
      "Validação",
    ],
  },
  "known-issue": {
    prefix: "ISSUE",
    dir: "known-issues",
    statuses: ["open", "mitigated", "resolved", "wontfix"],
    required: [...COMMON, "owner", "symptom", "affected_versions", "related_issues"],
    lists: ["files", "deps", "affected_versions", "related_issues", "supersedes"],
  },
};

const TYPE_DIRS = new Set(Object.values(TYPES).map((t) => t.dir));
const RECORD_NAME = /^(ADR|SOL|ISSUE)-/;

// Registros fora de uso: não exigem arquivos existentes nem entram na checagem de obsolescência.
export const INACTIVE = new Set(["superseded", "rejected", "resolved", "wontfix"]);
export const isActive = (r) => !INACTIVE.has(r.data.status);

export const toPosix = (p) => p.split(sep).join("/");

export function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .sort()
    .flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
}

export function parseSections(body) {
  const sections = {};
  let cur = null;
  let fence = false;
  for (const line of body.split("\n")) {
    if (/^\s*```/.test(line)) fence = !fence;
    const m = !fence && line.match(/^##\s+(.+?)\s*$/);
    if (m) {
      cur = m[1];
      sections[cur] = "";
    } else if (cur) sections[cur] += line + "\n";
  }
  return sections;
}

// Vazia = só comentário HTML, só espaços ou só um placeholder "<...>" do template.
export function sectionIsEmpty(text) {
  const t = (text ?? "").replace(/<!--[\s\S]*?-->/g, "").trim();
  return t === "" || /^<[^<>]*>$/.test(t);
}

export function loadRecords(root) {
  const records = [];
  const problems = [];
  for (const abs of walk(join(root, MEMORY_DIR))) {
    if (!abs.endsWith(".md")) continue;
    const rel = toPosix(relative(root, abs));
    const parts = rel.split("/"); // .ai / memory / <dir> / <arquivo>
    const dir = parts.length === 4 ? parts[2] : null;
    const isRecord = RECORD_NAME.test(basename(abs));
    const inTypeDir = dir !== null && TYPE_DIRS.has(dir);
    if (!isRecord && !inTypeDir) continue; // PROJECT.md, INDEX.md, CURRENT_STATE.md...
    if (!isRecord) {
      problems.push({ file: rel, msg: "arquivo em pasta de registros sem prefixo ADR-/SOL-/ISSUE-" });
      continue;
    }
    try {
      const { data, body } = parseRecordText(readFileSync(abs, "utf8"));
      records.push({ path: rel, dir, data, body, sections: parseSections(body) });
    } catch (e) {
      problems.push({ file: rel, msg: e.message });
    }
  }
  return { records, problems };
}

export function idNumber(id) {
  const m = /-(\d+)$/.exec(id ?? "");
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
}
