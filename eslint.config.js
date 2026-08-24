import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  {
    // `react-refresh/only-export-components` só consegue garantir hot reload
    // quando o arquivo exporta apenas componentes. Estes dois grupos violam
    // isso POR DESENHO, e corrigir no código custaria mais do que o hot
    // reload vale:
    //
    // - `src/components/ui/**` são arquivos do shadcn, copiados como vêm.
    //   Exportar `buttonVariants`/`badgeVariants`/`toggleVariants` ao lado do
    //   componente é o desenho da própria biblioteca. Mexer aqui diverge do
    //   upstream e o próximo `npx shadcn add` desfaz.
    //
    // - `src/contexts/**` põem provider e hook no mesmo arquivo, que é o
    //   idioma padrão do React. Separar o `useAuth` num arquivo próprio
    //   tocaria 47 arquivos de import (useDate 9, usePrivacyMode 8) para
    //   ganhar hot reload em arquivos que quase nunca mudam.
    //
    // O custo que se aceita: editar um destes dá reload completo da página em
    // vez de hot reload. Em componente de tela normal a regra continua valendo
    // — é lá que ela paga.
    files: ["src/components/ui/**/*.{ts,tsx}", "src/contexts/**/*.{ts,tsx}"],
    rules: {
      "react-refresh/only-export-components": "off",
    },
  },
);
