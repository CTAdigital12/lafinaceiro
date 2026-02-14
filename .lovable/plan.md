

# Corrigir cabeçalho cortado no iPhone da Luísa

## Problema
No iPhone da Luísa, o cabeçalho com "Fevereiro 2026" fica atrás da barra de status do iOS (horário, wifi, bateria). Isso acontece porque o app não respeita a "safe area" do iPhone -- a área reservada para o notch/Dynamic Island.

No seu celular funciona provavelmente porque o modelo é diferente ou o navegador trata a safe area de forma diferente.

## Solução
Adicionar padding superior usando `env(safe-area-inset-top)` do CSS, que é a forma padrão de lidar com notch/Dynamic Island em iPhones. O valor é automaticamente 0 em celulares sem notch, então não vai afetar outros dispositivos.

## O que muda
- O cabeçalho vai ganhar um espaçamento no topo que empurra o conteúdo para baixo do notch
- Em celulares sem notch (ou desktop), nada muda -- o valor é 0

## Seção técnica

### 1. `index.html` -- já possui `viewport-fit=cover` (necessário para safe area funcionar) -- OK

### 2. `src/index.css` -- adicionar regra para safe area no body/html
Adicionar `padding-top: env(safe-area-inset-top)` no body para que todo o conteúdo respeite a safe area.

### 3. `src/components/layout/Header.tsx` -- ajustar posição sticky
Mudar `top-0` para `top-[env(safe-area-inset-top)]` no header sticky, para que ele grude abaixo da safe area e não atrás dela. Alternativamente, adicionar `pt-[env(safe-area-inset-top)]` direto no header.

A abordagem mais limpa: adicionar o padding na tag `<header>` usando um estilo inline `paddingTop: env(safe-area-inset-top)` para que o conteúdo do header fique abaixo do notch, mantendo o background estendido até o topo.

