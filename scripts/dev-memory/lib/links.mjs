// Links Markdown relativos quebrados (fora de blocos de código).

import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
import { toPosix } from "./records.mjs";

const LINK = /\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

export function brokenLinks(root, files) {
  const out = [];
  for (const abs of files) {
    let fence = false;
    readFileSync(abs, "utf8")
      .split("\n")
      .forEach((line, idx) => {
        if (/^\s*```/.test(line)) fence = !fence;
        if (fence) return;
        for (const [, raw] of line.replace(/`[^`]*`/g, "").matchAll(LINK)) {
          const href = raw.split("#")[0];
          if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href)) continue; // âncora pura, http:, mailto:...
          let target;
          try {
            target = resolve(dirname(abs), decodeURI(href));
          } catch {
            target = resolve(dirname(abs), href);
          }
          if (!existsSync(target)) out.push({ file: toPosix(relative(root, abs)), line: idx + 1, href: raw });
        }
      });
  }
  return out;
}
