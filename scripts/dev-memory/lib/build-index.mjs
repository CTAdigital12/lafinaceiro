// build-index: gera .ai/memory/INDEX.md de forma determinística.
// Sem data de geração nem nada que dependa do ambiente: mesma memória => mesmo arquivo.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { loadRecords, MEMORY_DIR, idNumber } from "./records.mjs";

export const INDEX_PATH = `${MEMORY_DIR}/INDEX.md`;

const cell = (v) =>
  v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0)
    ? "—"
    : String(Array.isArray(v) ? v.join(", ") : v)
        .replace(/\|/g, "\\|")
        .replace(/\s*\n\s*/g, " ");

const SECTIONS = [
  {
    type: "decision",
    title: "Decisões (ADR)",
    empty: "_Nenhuma decisão registrada._",
    cols: ["Título", "Status", "Arquivos", "Revisada"],
    row: (d) => [d.title, d.status, d.files, d.reviewed_at],
  },
  {
    type: "solution",
    title: "Soluções (SOL)",
    empty: "_Nenhuma solução registrada._",
    cols: ["Título", "Status", "Confiança", "Stack", "Tags", "Arquivos", "Revisada"],
    row: (d) => [d.title, d.status, d.confidence, d.stack, d.tags, d.files, d.reviewed_at],
  },
  {
    type: "known-issue",
    title: "Problemas conhecidos (ISSUE)",
    empty: "_Nenhum problema conhecido registrado._",
    cols: ["Título", "Status", "Sintoma", "Arquivos", "Revisada"],
    row: (d) => [d.title, d.status, d.symptom, d.files, d.reviewed_at],
  },
];

export function renderIndex(records, { hasProject = true, hasState = true } = {}) {
  const out = [
    "# Índice de memória técnica",
    "",
    "> **Gerado por `node scripts/dev-memory/cli.mjs build-index`. Não edite à mão.**",
    "> Registros `rejected` não são indexados. Registros são evidência histórica:",
    "> confira código, versões e testes antes de aplicar.",
    "",
  ];
  const ctx = [hasProject && "Contexto do projeto: [PROJECT.md](PROJECT.md)", hasState && "Estado atual: [CURRENT_STATE.md](CURRENT_STATE.md)"].filter(Boolean);
  if (ctx.length) out.push(ctx.join(" · "), "");

  for (const s of SECTIONS) {
    const rows = records
      .filter((r) => r.data.type === s.type && r.data.status !== "rejected")
      .sort((a, b) => idNumber(a.data.id) - idNumber(b.data.id) || a.path.localeCompare(b.path));
    out.push(`## ${s.title}`, "");
    if (!rows.length) {
      out.push(s.empty, "");
      continue;
    }
    out.push(`| ID | ${s.cols.join(" | ")} |`, `|${"---|".repeat(s.cols.length + 1)}`);
    for (const r of rows) {
      const link = `[${r.data.id}](${r.dir}/${basename(r.path)})`;
      out.push(`| ${link} | ${s.row(r.data).map(cell).join(" | ")} |`);
    }
    out.push("");
  }
  return out.join("\n").replace(/\n+$/, "\n");
}

export function buildIndex(root, { check = false } = {}) {
  const { records, problems } = loadRecords(root);
  if (problems.length) return { ok: false, problems };
  const content = renderIndex(records, {
    hasProject: existsSync(join(root, MEMORY_DIR, "PROJECT.md")),
    hasState: existsSync(join(root, MEMORY_DIR, "CURRENT_STATE.md")),
  });
  const target = join(root, INDEX_PATH);
  const current = existsSync(target) ? readFileSync(target, "utf8") : null;
  const upToDate = current === content;
  if (!check && !upToDate) writeFileSync(target, content);
  return { ok: true, upToDate, written: !check && !upToDate, count: records.filter((r) => r.data.status !== "rejected").length };
}
