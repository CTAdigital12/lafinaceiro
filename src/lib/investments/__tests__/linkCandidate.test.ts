import { describe, it, expect } from "vitest";
import {
  validateLinkCandidate,
  type LinkCandidate,
} from "../linkCandidate";

const ME = "user-me";
const ACCOUNT = "acc-itau-cc";

const valid: LinkCandidate = {
  id: "tx-1",
  user_id: ME,
  type: "income",
  account_id: ACCOUNT,
};

describe("validateLinkCandidate", () => {
  it("aceita receita do próprio usuário, type=income, account match", () => {
    expect(validateLinkCandidate(valid, ME, ACCOUNT)).toEqual({ ok: true });
  });

  it("rejeita null com reason=missing", () => {
    const out = validateLinkCandidate(null, ME, ACCOUNT);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe("missing");
      expect(out.message).toMatch(/não encontrada/i);
    }
  });

  it("rejeita undefined como missing", () => {
    const out = validateLinkCandidate(undefined, ME, ACCOUNT);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("missing");
  });

  it("bloqueia cross-tenant via shared_access (HEURÍSTICA F / R7 defesa em profundidade)", () => {
    const sharedFromOtherUser: LinkCandidate = {
      ...valid,
      user_id: "user-other",
    };
    const out = validateLinkCandidate(sharedFromOtherUser, ME, ACCOUNT);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.reason).toBe("wrong_owner");
      expect(out.message).toMatch(/não pertence ao seu usuário/i);
    }
  });

  it("rejeita transactions do tipo expense (não-receita)", () => {
    const out = validateLinkCandidate(
      { ...valid, type: "expense" },
      ME,
      ACCOUNT,
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("wrong_type");
  });

  it("rejeita receita em conta diferente da selecionada", () => {
    const out = validateLinkCandidate(
      { ...valid, account_id: "acc-other" },
      ME,
      ACCOUNT,
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("wrong_account");
  });

  it("rejeita receita com account_id null", () => {
    const out = validateLinkCandidate({ ...valid, account_id: null }, ME, ACCOUNT);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("wrong_account");
  });

  it("ordem de checagem: owner antes de type/account (evita vazar info por mensagem)", () => {
    // Se o candidate é de outro user E também tem type errado, a mensagem
    // deve ser sobre owner — não sobre type. Isso evita revelar conteúdo
    // de receita de outro tenant através do erro.
    const out = validateLinkCandidate(
      {
        id: "tx-x",
        user_id: "user-other",
        type: "expense",
        account_id: "acc-other",
      },
      ME,
      ACCOUNT,
    );
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe("wrong_owner");
  });
});
