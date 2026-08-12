import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeEach } from "vitest";
import { cleanup } from "@testing-library/react";

/**
 * Polyfill de localStorage compatível com Web Storage API.
 *
 * Necessário porque o Node 25+ expõe um `localStorage` global nativo com
 * superfície mínima (sem `clear`), e o jsdom 29 não sobrescreve esse global.
 * Reinstanciamos pra cada teste pra garantir isolamento.
 */
class MemoryStorage implements Storage {
  private store = new Map<string, string>();

  get length(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  setItem(key: string, value: string): void {
    this.store.set(key, String(value));
  }
}

const installStorage = () => {
  Object.defineProperty(window, "localStorage", {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
  Object.defineProperty(window, "sessionStorage", {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
};

// Instala antes de qualquer teste rodar
installStorage();

/**
 * Polyfills necessários para componentes de UI em jsdom.
 *
 * ResizeObserver é usado pelo `input-otp` (e por vários componentes shadcn).
 * matchMedia é usado por `useIsMobile` (`src/hooks/use-mobile.tsx`) e por
 * temas/Sonner. Stubs no-op são suficientes para testes — o comportamento
 * real é coberto por testes E2E (manuais via `docs/2fa-test-plan.md`).
 */
class NoopResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (typeof globalThis.ResizeObserver === "undefined") {
  (globalThis as unknown as { ResizeObserver: typeof NoopResizeObserver })
    .ResizeObserver = NoopResizeObserver;
}

if (typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// input-otp uses elementFromPoint inside an internal setInterval. jsdom does
// not implement it; polyfill no-op to avoid "uncaught exception" warnings
// once the test has finished.
if (typeof document.elementFromPoint !== "function") {
  document.elementFromPoint = () => null;
}

// O cmdk (usado pelo <Command>, base dos comboboxes de categoria, conta e
// cartão) chama scrollIntoView ao montar a lista. jsdom não implementa, e sem
// isso qualquer teste que abra um desses seletores quebra no mount.
if (typeof Element.prototype.scrollIntoView !== "function") {
  Element.prototype.scrollIntoView = () => {};
}

afterEach(() => {
  cleanup();
});

/**
 * Drena timers órfãos antes do ambiente do arquivo ser destruído.
 *
 * O input-otp agenda o MESMO callback três vezes — `setTimeout(r, 0)`,
 * `(r, 10)` e `(r, 50)` — e esse callback chama setState. Ele não cancela
 * nenhum dos três ao desmontar, então, se o arquivo de teste termina antes
 * dos 50ms, os pendentes disparam depois do teardown e estouram
 * "ReferenceError: window is not defined".
 *
 * O vitest conta isso como erro não capturado e sai com código 1 mesmo com
 * todos os testes passando — foi assim que o CI derrubou o PR #57 exibindo
 * "250 passed / 2 errors". Localmente não reproduz: depende de a máquina ser
 * rápida o bastante para o arquivo acabar dentro da janela de 50ms.
 *
 * Esperar aqui (uma vez por arquivo, não por teste) deixa os três dispararem
 * enquanto o `window` ainda existe. Depois do cleanup o componente já está
 * desmontado, então o setState é inócuo.
 */
afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 60));
});

beforeEach(() => {
  // Reset entre testes pra isolar persistência
  installStorage();
});
