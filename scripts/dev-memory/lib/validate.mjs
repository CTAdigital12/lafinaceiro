// validate: schema, IDs, status, referências, seções obrigatórias, segredos e links.

import { existsSync, readFileSync } from "node:fs";
import { join, basename, relative } from "node:path";
import { loadRecords, TYPES, MEMORY_DIR, isActive, sectionIsEmpty, walk, toPosix } from "./records.mjs";
import { scanText } from "./secrets.mjs";
import { brokenLinks } from "./links.mjs";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isDate = (v) => typeof v === "string" && DATE.test(v) && new Date(v + "T00:00:00Z").toISOString().startsWith(v);

export function validate(root) {
  const errors = [];
  const warnings = [];
  const err = (file, msg) => errors.push({ file, msg });
  const warn = (file, msg) => warnings.push({ file, msg });

  const { records, problems } = loadRecords(root);
  problems.forEach((p) => err(p.file, p.msg));

  const byId = new Map();
  for (const r of records) {
    const d = r.data;
    const f = r.path;
    const t = TYPES[d.type];
    if (!t) {
      err(f, `type inválido "${d.type}" (use: ${Object.keys(TYPES).join(", ")})`);
      continue;
    }

    for (const k of t.required) if (!Object.hasOwn(d, k)) err(f, `campo obrigatório ausente: ${k}`);

    if (!new RegExp(`^${t.prefix}-\\d{4}$`).test(d.id ?? "")) err(f, `id inválido "${d.id}" (esperado ${t.prefix}-NNNN)`);
    else if (!basename(f).startsWith(d.id + "-")) err(f, `o nome do arquivo deve começar com "${d.id}-"`);
    if (r.dir !== t.dir) err(f, `registro do tipo ${d.type} deve ficar em ${MEMORY_DIR}/${t.dir}/`);

    if (!t.statuses.includes(d.status)) err(f, `status inválido "${d.status}" (use: ${t.statuses.join(", ")})`);
    if (typeof d.title !== "string" || !d.title.trim()) err(f, "title vazio");
    if (!isDate(d.created_at)) err(f, `created_at inválido "${d.created_at}" (use YYYY-MM-DD)`);
    if (d.reviewed_at !== null && d.reviewed_at !== undefined && !isDate(d.reviewed_at))
      err(f, `reviewed_at inválido "${d.reviewed_at}" (use YYYY-MM-DD ou null)`);
    if (Object.hasOwn(d, "review_required") && typeof d.review_required !== "boolean")
      err(f, "review_required deve ser true ou false");
    for (const k of t.lists) if (Object.hasOwn(d, k) && d[k] !== null && !Array.isArray(d[k])) err(f, `${k} deve ser uma lista`);
    if (d.type !== "known-issue" && d.scope && !["project", "organization"].includes(d.scope))
      err(f, `scope inválido "${d.scope}" (use project ou organization)`);

    for (const dep of d.deps ?? []) {
      if (typeof dep !== "object" || typeof dep.name !== "string" || !dep.name.trim())
        err(f, 'cada item de deps precisa de "name:" (e opcionalmente "version:")');
    }

    if (byId.has(d.id)) err(f, `ID duplicado: ${d.id} (também em ${byId.get(d.id).path})`);
    else if (d.id) byId.set(d.id, r);

    // Arquivos referenciados: registros ativos não podem apontar para caminho inexistente.
    if (isActive(r)) {
      for (const p of d.files ?? []) {
        if (typeof p !== "string") err(f, "files deve conter caminhos (texto)");
        else if (!existsSync(join(root, p)))
          err(f, `arquivo referenciado não existe: ${p} (removido ou renomeado? atualize files: ou marque o registro como superseded)`);
      }
    }

    if (d.type === "solution") {
      if (!["low", "medium", "high"].includes(d.confidence)) err(f, `confidence inválido "${d.confidence}" (use low, medium ou high)`);
      if (["verified", "approved"].includes(d.status)) {
        for (const s of t.requiredSections)
          if (sectionIsEmpty(r.sections[s])) err(f, `solução ${d.status} sem a seção preenchida "## ${s}"`);
        if (d.confidence === "low") err(f, `solução ${d.status} não pode ter confidence: low (mantenha proposed até confirmar a causa)`);
      }
    }
    if (d.type === "known-issue" && d.status === "resolved" && sectionIsEmpty(r.sections["Critério de resolução"]))
      err(f, 'problema resolved sem "## Critério de resolução" preenchido');

    if (d.review_required === true) warn(f, "review_required: true — revisão pendente");
  }

  for (const r of records) {
    for (const s of r.data.supersedes ?? []) {
      if (s === r.data.id) err(r.path, "supersedes aponta para o próprio registro");
      else if (!byId.has(s)) err(r.path, `supersedes aponta para ID inexistente: ${s}`);
      else if (byId.get(s).data.status !== "superseded")
        warn(r.path, `substitui ${s}, mas ${s} ainda está com status "${byId.get(s).data.status}"`);
    }
  }

  // Segredos e dados pessoais: todo Markdown da memória (registros, INDEX, CURRENT_STATE...).
  for (const abs of walk(join(root, MEMORY_DIR)).filter((p) => p.endsWith(".md"))) {
    const rel = toPosix(relative(root, abs));
    const { errors: se, warnings: sw } = scanText(readFileSync(abs, "utf8"));
    se.forEach((x) => err(`${rel}:${x.line}`, `possível segredo/dado sensível: ${x.name}`));
    sw.forEach((x) => warn(`${rel}:${x.line}`, x.name));
  }

  const mdUnderAi = walk(join(root, ".ai")).filter((p) => p.endsWith(".md"));
  for (const b of brokenLinks(root, mdUnderAi)) err(`${b.file}:${b.line}`, `link quebrado: ${b.href}`);

  return { errors, warnings, records };
}
