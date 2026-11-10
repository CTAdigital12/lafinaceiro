// Leitor de front matter YAML — subconjunto estrito, sem dependências.
//
// Suporta exatamente o que os templates de .ai/templates/ usam:
//   chave: valor            (string, "aspas", 'aspas', null, ~, true, false)
//   chave: []  |  chave: [a, "b"]
//   chave:                  seguido de lista em bloco:
//     - item
//     - name: x             (lista de mapas simples, um nível)
//       version: "^2"
//   # comentários (linha inteira ou após espaço)
// Qualquer outra construção gera FrontMatterError, em vez de ser lida errado em silêncio.

export class FrontMatterError extends Error {}

const KEY = /^([A-Za-z_][\w-]*):(?:\s+(.*))?$/;

export function splitFrontMatter(text) {
  const norm = text.replace(/\r\n/g, "\n");
  if (!norm.startsWith("---\n")) throw new FrontMatterError("front matter ausente (o arquivo deve começar com ---)");
  const close = norm.slice(4).search(/^---\s*$/m);
  if (close === -1) throw new FrontMatterError("front matter sem --- de fechamento");
  const yaml = norm.slice(4, 4 + close);
  const rest = norm.slice(4 + close).replace(/^---\s*(\n|$)/, "");
  return { yaml, body: rest };
}

function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === "#" && (i === 0 || /\s/.test(line[i - 1]))) return line.slice(0, i).trimEnd();
  }
  return line.trimEnd();
}

function splitInline(inner) {
  const parts = [];
  let cur = "";
  let quote = null;
  for (const c of inner) {
    if (quote) {
      cur += c;
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
      cur += c;
    } else if (c === ",") {
      parts.push(cur);
      cur = "";
    } else cur += c;
  }
  parts.push(cur);
  return parts.map((p) => p.trim()).filter((p) => p !== "");
}

function scalar(raw, where) {
  const v = raw.trim();
  if (v === "null" || v === "~") return null;
  if (v === "true") return true;
  if (v === "false") return false;
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1).replace(/\\"/g, '"');
  if (v.length >= 2 && v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
  if (v.startsWith("[")) {
    if (!v.endsWith("]")) throw new FrontMatterError(`${where}: lista inline sem ]`);
    return splitInline(v.slice(1, -1)).map((p) => scalar(p, where));
  }
  if (v.startsWith("{")) throw new FrontMatterError(`${where}: mapa inline não é suportado; use lista em bloco`);
  if (v === "|" || v === ">" || /^[|>][+-]?$/.test(v)) throw new FrontMatterError(`${where}: texto multilinha não é suportado`);
  return v;
}

export function parseYamlSubset(yaml) {
  const lines = yaml.split("\n");
  const out = {};
  let i = 0;
  const where = () => `front matter, linha ${i + 2}`; // +2: linha 1 é o "---"

  while (i < lines.length) {
    const line = stripComment(lines[i]);
    if (!line.trim()) {
      i++;
      continue;
    }
    if (/^\s/.test(line)) throw new FrontMatterError(`${where()}: indentação inesperada`);
    const m = line.match(KEY);
    if (!m) throw new FrontMatterError(`${where()}: esperado "chave: valor"`);
    const [, key, rest = ""] = m;
    if (Object.hasOwn(out, key)) throw new FrontMatterError(`${where()}: chave repetida "${key}"`);

    if (rest.trim() !== "") {
      out[key] = scalar(rest, where());
      i++;
      continue;
    }

    // Lista em bloco (ou valor vazio => null)
    i++;
    const items = [];
    while (i < lines.length) {
      const l = stripComment(lines[i]);
      if (!l.trim()) {
        i++;
        continue;
      }
      if (!/^\s/.test(l)) break;
      const item = l.match(/^(\s+)-\s+(.*)$/);
      if (!item) throw new FrontMatterError(`${where()}: esperado item de lista "- valor"`);
      const indent = item[1].length;
      const content = item[2];
      const kv = /^["']/.test(content) ? null : content.match(KEY);
      i++;
      if (!kv) {
        items.push(scalar(content, where()));
        continue;
      }
      const obj = { [kv[1]]: scalar(kv[2] ?? "", where()) };
      while (i < lines.length) {
        const l2 = stripComment(lines[i]);
        if (!l2.trim()) {
          i++;
          continue;
        }
        const m2 = l2.match(/^(\s+)([A-Za-z_][\w-]*):(?:\s+(.*))?$/);
        if (!m2 || m2[1].length <= indent) break;
        if (Object.hasOwn(obj, m2[2])) throw new FrontMatterError(`${where()}: chave repetida "${m2[2]}"`);
        obj[m2[2]] = scalar(m2[3] ?? "", where());
        i++;
      }
      items.push(obj);
    }
    out[key] = items.length ? items : null;
  }
  return out;
}

export function parseRecordText(text) {
  const { yaml, body } = splitFrontMatter(text);
  return { data: parseYamlSubset(yaml), body };
}
