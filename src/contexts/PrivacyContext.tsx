import { createContext, useContext, useEffect, useState, ReactNode } from "react";

interface PrivacyContextType {
  isHidden: boolean;
  toggle: () => void;
  setHidden: (value: boolean) => void;
}

const PrivacyContext = createContext<PrivacyContextType | undefined>(undefined);

const STORAGE_KEY = "lafinaceiro:privacy-mode";

export function PrivacyProvider({ children }: { children: ReactNode }) {
  const [isHidden, setIsHidden] = useState<boolean>(false);

  // Hidrata do localStorage no mount (SSR-safe)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored === "true") {
        setIsHidden(true);
      } else if (stored === "false") {
        setIsHidden(false);
      }
    } catch {
      // localStorage indisponível (modo privativo, quota etc.) — segue com default
    }
  }, []);

  // Persiste mudanças
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, isHidden ? "true" : "false");
    } catch {
      // Sem persistência se falhar — não quebra a UI
    }
  }, [isHidden]);

  const toggle = () => setIsHidden((prev) => !prev);
  const setHidden = (value: boolean) => setIsHidden(value);

  return (
    <PrivacyContext.Provider value={{ isHidden, toggle, setHidden }}>
      {children}
    </PrivacyContext.Provider>
  );
}

export function usePrivacyMode() {
  const context = useContext(PrivacyContext);
  if (context === undefined) {
    throw new Error("usePrivacyMode must be used within PrivacyProvider");
  }
  return context;
}
