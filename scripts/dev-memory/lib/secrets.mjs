// Indicadores simples de segredos e dados pessoais. NÃO substitui revisão humana.
//
// Os padrões procuram VALORES (token, chave, string de conexão com senha), não menções:
// escrever "nunca commite a service_role" num registro é legítimo; colar a chave, não.
// Falso positivo confirmado: acrescente "dev-memory:allow-secret" na mesma linha. A exceção
// fica visível no diff e na revisão do PR.

const ALLOW = "dev-memory:allow-secret";

export const SECRET_PATTERNS = [
  ["chave privada", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["JWT", /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/],
  ["token GitHub", /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,})/],
  ["token Slack", /\bxox[abposr]-[A-Za-z0-9-]{10,}/],
  ["chave AWS", /\bAKIA[0-9A-Z]{16}\b/],
  ["chave Google API", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["chave Stripe", /\b[srp]k_(?:live|test)_[A-Za-z0-9]{10,}/],
  ["chave de provedor de LLM", /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/],
  ["string de conexão com senha", /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s:@/]+:[^\s@/]+@/],
  [
    "credencial atribuída",
    /\b(?:api[_-]?key|secret|token|password|passwd|senha|service_role(?:_key)?)["']?\s*[:=]\s*["']?[A-Za-z0-9_\-/+=.]{16,}/i,
  ],
  ["linha de .env com segredo", /^\s*[A-Z][A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD)[A-Z0-9_]*=\S{8,}/],
  ["CPF (dado pessoal)", /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/],
];

// Avisos (não bloqueiam): podem ser legítimos, mas merecem um olhar.
export const PERSONAL_PATTERNS = [["e-mail (possível dado pessoal)", /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/]];

export function scanText(text) {
  const errors = [];
  const warnings = [];
  text.split("\n").forEach((line, idx) => {
    if (line.includes(ALLOW)) return;
    for (const [name, re] of SECRET_PATTERNS) if (re.test(line)) errors.push({ line: idx + 1, name });
    for (const [name, re] of PERSONAL_PATTERNS) if (re.test(line)) warnings.push({ line: idx + 1, name });
  });
  return { errors, warnings };
}
