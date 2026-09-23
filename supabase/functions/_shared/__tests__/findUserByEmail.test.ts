import { describe, it, expect, vi } from "vitest";
import {
  findUserByEmail,
  sameEmail,
  type AuthUserLike,
  type ListUsersPage,
} from "../findUserByEmail.ts";

const user = (id: string, email: string): AuthUserLike => ({ id, email });

/** Listagem paginada sobre uma lista fixa, como o GoTrue faria. */
const listagemDe = (users: AuthUserLike[]): ListUsersPage =>
  vi.fn(async (page: number, perPage: number) => ({
    users: users.slice((page - 1) * perPage, page * perPage),
  }));

describe("sameEmail", () => {
  it.each([
    ["igual", "a@b.com", "a@b.com"],
    ["caixa diferente", "A@B.com", "a@b.com"],
    ["espaços nas pontas", "  a@b.com ", "a@b.com"],
  ])("considera iguais: %s", (_caso, a, b) => {
    expect(sameEmail(a, b)).toBe(true);
  });

  it.each([
    ["e-mails diferentes", "a@b.com", "c@d.com"],
    ["um nulo", null, "a@b.com"],
    ["outro indefinido", "a@b.com", undefined],
    ["ambos vazios", "", ""],
  ])("não considera iguais: %s", (_caso, a, b) => {
    expect(sameEmail(a, b)).toBe(false);
  });
});

describe("findUserByEmail", () => {
  it("acha a conta que existe", async () => {
    const lista = listagemDe([user("u1", "eu@casa.com"), user("u2", "outro@casa.com")]);

    expect(await findUserByEmail("outro@casa.com", lista)).toEqual({
      status: "found",
      user: user("u2", "outro@casa.com"),
    });
  });

  it("acha ignorando caixa e espaços, como o GoTrue guarda", async () => {
    const lista = listagemDe([user("u1", "eu@casa.com")]);

    const resultado = await findUserByEmail("  EU@Casa.com  ", lista);

    expect(resultado).toEqual({ status: "found", user: user("u1", "eu@casa.com") });
  });

  it("diz not_found quando a conta realmente não existe", async () => {
    const lista = listagemDe([user("u1", "eu@casa.com")]);

    expect(await findUserByEmail("ninguem@casa.com", lista)).toEqual({ status: "not_found" });
  });

  it("atravessa as páginas até achar", async () => {
    const muitos = Array.from({ length: 7 }, (_, i) => user(`u${i}`, `pessoa${i}@casa.com`));
    const lista = listagemDe(muitos);

    const resultado = await findUserByEmail("pessoa6@casa.com", lista, { perPage: 3 });

    expect(resultado).toEqual({ status: "found", user: user("u6", "pessoa6@casa.com") });
    expect(lista).toHaveBeenCalledTimes(3);
  });

  it("para na primeira página incompleta, sem pedir páginas à toa", async () => {
    const lista = listagemDe([user("u1", "eu@casa.com"), user("u2", "outro@casa.com")]);

    await findUserByEmail("ninguem@casa.com", lista, { perPage: 3 });

    expect(lista).toHaveBeenCalledTimes(1);
  });

  it("não para numa página CHEIA que não tinha o e-mail", async () => {
    const lista = listagemDe([
      user("u1", "a@casa.com"),
      user("u2", "b@casa.com"),
      user("u3", "alvo@casa.com"),
    ]);

    expect(await findUserByEmail("alvo@casa.com", lista, { perPage: 2 })).toEqual({
      status: "found",
      user: user("u3", "alvo@casa.com"),
    });
  });

  // O ponto do módulo. Devolver `not_found` aqui reabriria o defeito de
  // 22/09/2026: a função tentaria CRIAR uma conta que já existe e o
  // `createUser` falharia com uma mensagem que não aponta para a causa.
  it("erro de listagem vira failed, NUNCA not_found", async () => {
    const lista: ListUsersPage = async () => ({ users: [], error: new Error("service unavailable") });

    expect(await findUserByEmail("alguem@casa.com", lista)).toEqual({
      status: "failed",
      reason: "service unavailable",
    });
  });

  it("exceção na listagem também vira failed", async () => {
    const lista: ListUsersPage = async () => {
      throw new Error("conexão caiu");
    };

    expect(await findUserByEmail("alguem@casa.com", lista)).toEqual({
      status: "failed",
      reason: "conexão caiu",
    });
  });

  it("estourar o teto de páginas é failed, não not_found", async () => {
    // Listagem defeituosa: devolve página SEMPRE cheia, então nunca termina.
    const lista: ListUsersPage = vi.fn(async (_page, perPage) => ({
      users: Array.from({ length: perPage }, (_, i) => user(`x${i}`, `x${i}@casa.com`)),
    }));

    const resultado = await findUserByEmail("alvo@casa.com", lista, { perPage: 2, maxPages: 3 });

    expect(resultado.status).toBe("failed");
    expect(lista).toHaveBeenCalledTimes(3);
  });

  it.each([
    ["vazio", ""],
    ["só espaços", "   "],
  ])("e-mail %s é failed, sem consultar a listagem", async (_caso, email) => {
    const lista = listagemDe([user("u1", "eu@casa.com")]);

    expect((await findUserByEmail(email, lista)).status).toBe("failed");
    expect(lista).not.toHaveBeenCalled();
  });

  it("pede as páginas na ordem, a partir da 1 como o GoTrue espera", async () => {
    const chamadas: number[] = [];
    const lista: ListUsersPage = async (page, perPage) => {
      chamadas.push(page);
      return { users: page < 3 ? Array.from({ length: perPage }, (_, i) => user(`u${page}${i}`, `u${page}${i}@casa.com`)) : [] };
    };

    await findUserByEmail("ninguem@casa.com", lista, { perPage: 2 });

    expect(chamadas).toEqual([1, 2, 3]);
  });
});
