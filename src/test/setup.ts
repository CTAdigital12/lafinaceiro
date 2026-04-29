import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach } from "vitest";
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

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  // Reset entre testes pra isolar persistência
  installStorage();
});
