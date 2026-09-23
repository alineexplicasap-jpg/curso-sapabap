# CLAUDE.md — Projeto SAP ABAP (Aline Explica SAP)

Este arquivo orienta o Claude Code ao trabalhar neste repositório. Leia antes de qualquer ação.

---

## REGRA CRÍTICA DE ESCOPO (LEIA PRIMEIRO)

**A pasta `C:\Users\agenc\meusprojetos\sapabap` é a ÚNICA pasta autorizada para qualquer trabalho neste projeto.**

### Regras invioláveis

1. **NÃO ler, escrever, editar ou listar** arquivos fora de `C:\Users\agenc\meusprojetos\sapabap`.
2. **NÃO executar comandos** que toquem caminhos externos (ex.: `cd ..`, `ls C:\Users\...`, `Get-ChildItem` em outros diretórios, leitura de `~/.claude/...`, leitura de `C:\tmp`, etc.).
3. **NÃO consultar** repositórios de terceiros, configs globais, pastas de sistema, ou qualquer caminho que não comece com `C:\Users\agenc\meusprojetos\sapabap` (ou seu equivalente POSIX `c:/Users/agenc/meusprojetos/sapabap`).
4. **NÃO criar arquivos auxiliares** em `C:\tmp`, no home do usuário, ou em qualquer outro local fora do projeto.

### Quando uma consulta externa for absolutamente necessária

Se — e somente se — uma tarefa exigir consulta a algo fora desta pasta, o Claude **DEVE**, antes de executar:

1. **Comunicar no chat** de forma explícita, em português, no seguinte formato:
   > ⚠️ **Aviso de escopo:** Vou consultar um caminho fora da pasta autorizada do projeto.
   > **Caminho:** `<caminho completo>`
   > **Motivo:** `<motivo objetivo>`
   > **Aguardando autorização para prosseguir.**
2. **Aguardar aprovação explícita** do usuário antes de executar a leitura/escrita externa.
3. **Nunca** assumir autorização implícita por aprovações anteriores — cada caminho externo precisa de aprovação própria.

### Exceções permitidas (sem aviso)

- Buscas na web (WebSearch / WebFetch) para documentação pública.
- Acesso a CDNs públicas referenciadas pelo `index.html` (unpkg, fonts.googleapis).
- Ferramentas internas do harness que não tocam o filesystem do usuário.

Tudo o mais → **avisar primeiro, agir depois**.

---

## Visão geral do projeto

Landing page do **Curso Prático SAP ABAP** ministrado pela Aline (marca "Aline Explica SAP"). Site institucional/de vendas em português brasileiro, focado em conversão para o curso.

- **Idioma do conteúdo:** pt-BR
- **Público:** profissionais que querem aprender SAP ABAP para subir de salário (R$ 8k–R$ 18k/mês).
- **Domínio externo referenciado:** `alineexplicasap.com.br`

---

## Stack técnica

| Camada | Tecnologia |
|---|---|
| Marcação | HTML5 estático puro |
| Estilização | CSS3 externo em `styles.css` (variáveis CSS, grid, flex, media queries) |
| Interatividade | `<details>`/`<summary>` nativo (FAQ) + `cta-fixa.js` (barra fixa de CTA no mobile, ~18 linhas). **Sem animação de entrada por scroll** — removida em 23/09/2026: 48 blocos nasciam com `opacity:0` e só apareciam via JS, o que deixava a captura do Clarity em branco e a página dependente de JS para ser lida |
| Tipografia | Google Fonts — Plus Jakarta Sans (display) + JetBrains Mono (monospace) |
| Ícones | SVG inline no HTML |
| Build | **Sem build step.** É HTML/CSS + 1 JS vanilla. |
| Pacote | **Sem `package.json`, sem `node_modules`, sem React, sem Babel.** |

> Implicação: não rodar `npm install`, `npm run build`, `vite`, `webpack` ou similares. Servir via servidor estático (`npx http-server`, `npx serve`) — ou abrir `index.html` direto via `file://` (funciona, já que não há fetch de scripts externos).

---

## Estrutura de arquivos

```
sapabap/
├── index.html              → página completa, 12 seções. Hero "otimizada" (mobile: CTA na 1ª tela, logo no canto, sem pilares/pagamento, barra fixa de CTA)
│                            A hero anterior viveu em lp-hero-old/ até 23/09/2026; removida porque duplicava
│                            Clarity e pixel, sujando heatmaps e eventos. Está no git em 5211789.
├── cta-fixa.js             → script vanilla: mostra a barra fixa de CTA (.cta-fixa) depois de 2 telas de rolagem no mobile
├── styles.css              → todo o CSS (tokens em :root, BEM-ish por seção, media queries no fim)
├── tracking.js             → rastreamento Meta (Framework FOP): eventos do funil, UTM persistida, envio ao CAPI
├── worker/                 → Cloudflare Worker do CAPI (capi.js, wrangler.toml, README com o passo a passo)
├── assets/                 → imagens usadas em produção (hero bg, logo, fotos da Aline)
├── research/               → screenshots de templates de referência (não usar em prod)
├── uploads/                → imagens de trabalho / iterações de IA (não usar em prod)
└── CLAUDE.md               → este arquivo
```

### Seções (na ordem em que aparecem em `index.html`)

1. `.hero` — topo com logo, badge, headline, pilares, CTA, formas de pagamento
2. `.problema` — 4 dores + bridge (você hoje → você depois)
3. `.depoimentos` — 3 cards de aluno
4. `.paraquem` — 2 perfis (funcional / dev iniciante)
5. `.metodo` — 6 pilares do método
6. `.aprender` — 6 módulos do curso + CTA
7. `.bonus` — 4 bônus
8. `.preco` — lista de itens + card de oferta com preço
9. `.garantia` — selo de 7 dias
10. `.faq` — accordion com 13 perguntas (HTML `<details>`)
11. `.sobre` — bio da Aline + stats
12. `.footer-bar` + `.footer-stripe`

### Convenções

- **Naming CSS**: `bloco__elemento` (BEM simplificado). Modificadores como `.cta.green`, `.eyebrow.gold`, `.problema__pill.right`.
- **Tokens** em `:root` no topo de `styles.css`. Use `var(--token)` em vez de hardcoded.
- **Ícones**: SVG inline diretamente no HTML. Para reuso, copie o trecho `<svg>...</svg>` ou crie classe utilitária.
- **FAQ**: usa `<details><summary>` nativo. Os ícones `+`/`-` alternam via CSS (`.faq__item[open] .faq__plus { display:none }`).
- **Assets de produção** vivem em `assets/`. `research/` e `uploads/` são para referência humana — **não linkar nesses caminhos no HTML**.
- **Responsivo**: ponto de quebra principal em 900px (containers viram 1 coluna). Hero pillars quebram em 780px. Cards 4-col viram 2-col em 980px e 1-col em 560px.

---

## Paleta e tokens de design

Definidos em `index.html` (`:root`). Usar via `var(--token)`:

- Backgrounds: `--bg-deep` `#060d1a`, `--bg-dark` `#0a1628`, `--bg-darker` `#050a14`
- Azuis/teais: `--teal-1` `#0a1530`, `--teal-2` `#1e3a8a`, `--teal-3` `#1e40af`, `--cyan` `#2563eb`, `--cyan-glow` `#3b82f6`
- Dourado: `--gold` `#f4b740`, `--gold-2` `#ffd166`
- Tinta: `--ink` `#06091a`
- Linhas: `--line` `rgba(255,255,255,.08)`, `--line-strong` `rgba(255,255,255,.16)`
- Texto suave: `--muted` `rgba(255,255,255,.7)`, `--muted-2` `rgba(255,255,255,.55)`

Classes utilitárias: `.cta` (+ `.green`, `.gold`), `.chip`, `.eyebrow` (+ `.gold`, `.dark`), `.container`, `.h1` `.h2` `.h3`, `.display`, `.mono`.

---

## Fluxo de trabalho recomendado

1. **Antes de editar:** confirmar que o caminho está dentro de `C:\Users\agenc\meusprojetos\sapabap`.
2. **Ao adicionar seção nova:** colar o `<section>` em `index.html` na posição correta da narrativa de venda; adicionar bloco CSS correspondente em `styles.css` seguindo o padrão `.bloco__elemento`.
3. **Ao adicionar imagem:** colocar em `assets/`, referenciar com caminho relativo (`assets/...`).
4. **Ao testar:** abrir `index.html` em servidor estático (`npx http-server`) ou direto no navegador (file://). Recarregar manualmente.

---

## Rastreamento obrigatório (Microsoft Clarity)

**Toda página HTML nova criada no projeto DEVE obrigatoriamente incluir o script do Microsoft Clarity.**

- Inserir no `<head>`, logo após o `<link rel="stylesheet" href="styles.css">`.
- Usar sempre o mesmo ID do projeto: `x0e1hiz89c`.
- Snippet padrão (não alterar):

```html
<!-- Microsoft Clarity -->
<script type="text/javascript">
  (function(c,l,a,r,i,t,y){
      c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
      t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
      y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
  })(window, document, "clarity", "script", "x0e1hiz89c");
</script>
```

> Páginas já com o script: `index.html`, `obrigado-sapabap.html`. Backups (`*-backup*.html`) não precisam, pois não fazem parte do site no ar.

---

## Rastreamento Meta (Framework FOP)

Tudo vive em `tracking.js` (snippet do pixel, init, PageView, funil, origem,
CAPI), carregado no `<head>` **sem `defer`**, como o `styles.css` — em tráfego
pago, atrasar o pixel perde o PageView de quem entra e sai rápido. O `<head>` de
cada página só define `window.AES_TRACK` (pixel, pixelsExtra, content).

**Pixel dos eventos do funil:** `564676471958688`. O `940802978658042` recebe
só o PageView.

| # | Evento | Gatilho |
|---|---|---|
| 1 | PageView | carga da página |
| 2 | ViewContent | 25% de scroll ou 10s |
| 3 | AddToWishlist | 50% de scroll ou 30s |
| 4 | AddToCart | clique em CTA que leva à oferta (`#preco` / `#oferta`) ou, se pulou a oferta, no próprio clique de checkout (barra fixa) |
| 5 | InitiateCheckout | clique em link `pay.hotmart.com` |
| 6 | Purchase | **integração nativa Hotmart → Meta**, nunca na página de obrigado |
| — | Rolagem | marcos de 20/40/60/70/80/90/100% — evento personalizado, **um só nome**, com o marco em `custom_data.percentual` |

Regras ao mexer nisso:

- Cada evento leva `event_id` único, espelhado no CAPI para o Meta deduplicar.
- `value` + `currency` em todo evento com valor. Os valores ficam em
  `window.AES_TRACK.content` no `<head>` de cada página.
- `_fbp` e `_fbc` vão **crus** ao CAPI; `external_id` e geo vão em SHA-256.
- Nunca enviar parâmetro sem propósito (`device_*`, `event_day`, `tracked_by`).
- `autoConfig` do Pixel fica **desligado** (`fbq('set','autoConfig',false,...)`): a
  configuração automática gera `SubscribedButtonClick` e um PageView extra sem
  `event_id` a cada mudança de hash. Não religar.
- Links `#âncora` rolam via `scrollIntoView` sem mudar a URL (mesmo motivo).
- **Rolagem é um evento só, com o percentual como parâmetro.** Não criar
  `Rolagem20`, `Rolagem40`…: o Meta prioriza no máximo 8 eventos por domínio
  (usuários iOS), e esses lugares têm que sobrar para `Purchase` e
  `InitiateCheckout`. Público por faixa sai filtrando `percentual`.
- Rolagem vai **só pelo navegador** (`ROLAGEM_NO_CAPI = false` em `tracking.js`):
  não é conversão, não precisa da resiliência do servidor, e evita 7 chamadas
  extras ao Worker por visita.
- Os eventos padrão levam `rolagem` = maior marco atingido até ali, então dá
  para ver quanto a pessoa leu antes de clicar em comprar.
- Todo evento leva `fonte` (meta, instagram, google, direto...) e, com UTM,
  `campanha` e `anuncio`. Para a Hotmart vão `src` (fonte), `sck` (campanha~anuncio),
  `xcod` (id do visitante, devolvido no webhook), `fbclid` e os `utm_*` inteiros.
- Ao criar página nova com oferta: copiar o bloco do `<head>`, ajustar
  `content`, e manter `<script src="tracking.js">` **sem defer** (caminho relativo).
- O token do CAPI **nunca** entra no repositório — é secret do Worker.

Publicação e teste do Worker: ver `worker/README.md`.

---

## O que NÃO fazer

- ❌ Não reintroduzir React, Babel, JSX, ou qualquer biblioteca JS sem pedido explícito (o projeto foi explicitamente migrado para HTML/CSS puro).
- ❌ Não introduzir build tools (Vite, Webpack, esbuild, Tailwind CLI, etc.) sem pedido explícito.
- ❌ Não converter para TypeScript.
- ❌ Não adicionar `package.json` / `node_modules`.
- ❌ Não inventar JavaScript próprio — se for necessário interatividade, prefira primeiro a solução em CSS ou HTML nativo (`<details>`, `:target`, `:checked` hack, etc.).
- ❌ Não reintroduzir animação de entrada que esconda conteúdo por padrão (`opacity:0` até o scroll). Conteúdo tem que existir sem JS; o Clarity monta o heatmap sobre uma captura do DOM e fica em branco se os blocos nascem invisíveis.
- ❌ Não tocar conteúdo dentro de `research/` ou `uploads/` (são referências, não produção).
- ❌ Não consultar nada fora desta pasta sem avisar primeiro (ver REGRA CRÍTICA acima).

---

## Idioma de comunicação

Responder ao usuário **em português brasileiro**. Nomes de variáveis, componentes e copy do site também em pt-BR (já é o padrão do projeto).
