import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MembersSection } from "@/components/settings/MembersSection";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const auth = vi.hoisted(() => ({
  user: { id: "user-1", email: "dono@test.dev" },
}));

const membersHook = vi.hoisted(() => ({
  members: [] as unknown[],
  isLoading: false,
  revokeAccess: { mutate: vi.fn(), isPending: false },
  refetch: vi.fn(),
}));

const invoke = vi.hoisted(() => vi.fn());
const toast = vi.hoisted(() => vi.fn());

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => auth }));
vi.mock("@/hooks/useMembers", () => ({ useMembers: () => membersHook }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke } },
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

beforeEach(() => {
  vi.clearAllMocks();
  invoke.mockResolvedValue({ data: { success: true, id: "acesso-1" }, error: null });
});

const preencherEEnviar = async (email: string) => {
  const user = userEvent.setup();
  await user.type(screen.getByPlaceholderText("email@exemplo.com"), email);
  await user.click(screen.getByRole("button", { name: /adicionar membro/i }));
  return user;
};

describe("MembersSection — confirmação antes de conceder acesso", () => {
  // O ponto de todo o recurso: conceder é silencioso para quem recebe, então
  // um e-mail digitado errado não pode virar acesso concedido sem revisão.
  it("NÃO chama a edge function ao enviar o formulário", async () => {
    render(<MembersSection />);
    await preencherEEnviar("convidado@test.dev");

    expect(await screen.findByText("Conferir o e-mail antes de conceder")).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("mostra o e-mail digitado de volta, para o erro de digitação aparecer", async () => {
    render(<MembersSection />);
    await preencherEEnviar("convidadoo@test.dev");

    expect(await screen.findByText("convidadoo@test.dev")).toBeInTheDocument();
  });

  it("cancelar não concede nada", async () => {
    render(<MembersSection />);
    const user = await preencherEEnviar("convidado@test.dev");

    await user.click(await screen.findByRole("button", { name: /cancelar/i }));

    await waitFor(() =>
      expect(screen.queryByText("Conferir o e-mail antes de conceder")).not.toBeInTheDocument(),
    );
    expect(invoke).not.toHaveBeenCalled();
  });

  it("só chama a edge function depois de confirmar, com o e-mail conferido", async () => {
    render(<MembersSection />);
    const user = await preencherEEnviar("convidado@test.dev");

    await user.click(await screen.findByRole("button", { name: /conceder acesso/i }));

    await waitFor(() => expect(invoke).toHaveBeenCalledTimes(1));
    expect(invoke).toHaveBeenCalledWith("add-member", {
      body: { email: "convidado@test.dev", password: undefined },
    });
  });

  // O campo é `type="email"`, então a validação nativa do navegador barra o
  // submit antes do handler rodar — o `emailSchema.parse` nem é alcançado por
  // este caminho, e quem avisa o usuário é o balão do próprio navegador.
  // O que importa aqui é o resultado: nenhuma confirmação, nenhuma chamada.
  it("e-mail inválido nem chega a abrir a confirmação", async () => {
    render(<MembersSection />);
    await preencherEEnviar("nao-e-email");

    expect(screen.queryByText("Conferir o e-mail antes de conceder")).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("não deixa o dono conceder acesso a si mesmo", async () => {
    render(<MembersSection />);
    await preencherEEnviar("dono@test.dev");

    expect(await screen.findByText("Você não pode adicionar a si mesmo")).toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();
  });
});

/**
 * O que a edge function responde tem que APARECER.
 *
 * Para qualquer status fora do 2xx, o `functions-js` devolve um
 * `FunctionsHttpError` cuja `message` é sempre "Edge Function returned a
 * non-2xx status code" — o texto escrito para a pessoa fica no CORPO. O código
 * fazia `throw new Error(res.error.message)`, então TODOS os avisos do
 * `add-member` eram trocados por essa frase: o pedido de 2FA, a instrução de
 * informar senha para criar a conta, "já tem acesso".
 */
describe("MembersSection — o erro da edge function chega à tela", () => {
  const MENSAGEM_GENERICA = "Edge Function returned a non-2xx status code";

  const respondeComErro = (corpo: unknown, status: number) =>
    invoke.mockResolvedValue({
      data: null,
      error: Object.assign(new Error(MENSAGEM_GENERICA), {
        context: new Response(JSON.stringify(corpo), { status }),
      }),
    });

  const confirmar = async () => {
    render(<MembersSection />);
    const user = await preencherEEnviar("convidado@test.dev");
    await user.click(await screen.findByRole("button", { name: /conceder acesso/i }));
  };

  it("mostra o pedido de 2FA, não a frase genérica", async () => {
    respondeComErro(
      { error: "Esta operação exige autenticação em dois fatores. Saia e entre novamente informando o código do aplicativo." },
      403,
    );

    await confirmar();

    expect(await screen.findByText(/exige autenticação em dois fatores/i)).toBeInTheDocument();
    expect(screen.queryByText(MENSAGEM_GENERICA)).not.toBeInTheDocument();
  });

  it("mostra a instrução de informar senha quando a conta não existe", async () => {
    respondeComErro(
      { error: "Usuário não encontrado. Informe uma senha (mín. 6 caracteres) para criar a conta." },
      404,
    );

    await confirmar();

    expect(await screen.findByText(/Informe uma senha/i)).toBeInTheDocument();
  });

  // Estado novo: a busca em `auth.users` não respondeu. Dizer "não existe"
  // aqui faria a função tentar criar uma conta que talvez exista.
  it("mostra o aviso de que não deu para verificar a conta", async () => {
    respondeComErro(
      { error: "Não foi possível verificar se esta conta já existe. Tente novamente." },
      503,
    );

    await confirmar();

    expect(await screen.findByText(/não foi possível verificar/i)).toBeInTheDocument();
  });

  it("usa um texto de reserva quando a resposta não traz corpo legível", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: Object.assign(new Error(MENSAGEM_GENERICA), {
        context: new Response("<html>502</html>", { status: 502 }),
      }),
    });

    await confirmar();

    expect(await screen.findByText("Não foi possível adicionar o membro")).toBeInTheDocument();
    expect(screen.queryByText(MENSAGEM_GENERICA)).not.toBeInTheDocument();
  });

  it("o caminho feliz continua avisando que o membro entrou", async () => {
    invoke.mockResolvedValue({ data: { success: true, id: "acesso-1", created: false }, error: null });

    await confirmar();

    await waitFor(() => expect(toast).toHaveBeenCalledWith({ title: "Membro adicionado!" }));
    expect(screen.queryByText(MENSAGEM_GENERICA)).not.toBeInTheDocument();
  });
});
