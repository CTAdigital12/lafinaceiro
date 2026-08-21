import { describe, it, expect } from "vitest";
import { decodeJwtPayload, readAal } from "../jwt.ts";

// Monta um JWT sintético. A assinatura é irrelevante: estes helpers só rodam
// DEPOIS de `getUser()`/`verify_jwt` terem validado a assinatura de verdade.
function makeJwt(payload: Record<string, unknown>): string {
  const b64url = (o: unknown) =>
    btoa(JSON.stringify(o)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url(payload)}.assinatura-falsa`;
}

describe("decodeJwtPayload", () => {
  it("lê o payload de um JWT bem formado", () => {
    expect(decodeJwtPayload(makeJwt({ sub: "u1", aal: "aal2" }))).toEqual({
      sub: "u1",
      aal: "aal2",
    });
  });

  it("decodifica base64url sem padding (- e _ no lugar de + e /)", () => {
    // `~~~??` força os caracteres que diferenciam base64url de base64.
    const payload = { sub: "u1", nome: "~~~??" };
    expect(decodeJwtPayload(makeJwt(payload))).toEqual(payload);
  });

  // Todo caso ruim precisa virar null: é isso que faz o add-member responder
  // 403 em vez de conceder acesso.
  it.each([
    ["string vazia", ""],
    ["sem pontos", "naoehumjwt"],
    ["só o header", "eyJhbGciOiJIUzI1NiJ9"],
    ["payload que não é base64", "a.@@@nao-e-base64@@@.c"],
    ["payload que não é JSON", `a.${btoa("isto nao e json")}.c`],
  ])("devolve null para %s", (_caso, jwt) => {
    expect(decodeJwtPayload(jwt)).toBeNull();
  });
});

describe("readAal", () => {
  it("devolve a claim aal quando ela é string", () => {
    expect(readAal(makeJwt({ aal: "aal2" }))).toBe("aal2");
    expect(readAal(makeJwt({ aal: "aal1" }))).toBe("aal1");
  });

  // Estes são os casos que não podem devolver "aal2" por acidente: quem chama
  // compara `readAal(jwt) !== "aal2"`, então null sempre reprova.
  it.each([
    ["claim ausente", makeJwt({ sub: "u1" })],
    ["claim nula", makeJwt({ aal: null })],
    ["claim numérica", makeJwt({ aal: 2 })],
    ["claim objeto", makeJwt({ aal: { nivel: "aal2" } })],
    ["jwt malformado", "lixo"],
  ])("devolve null para %s", (_caso, jwt) => {
    expect(readAal(jwt)).toBeNull();
  });
});
