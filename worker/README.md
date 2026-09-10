# CAPI Worker — rastreamento server-side do Meta

Este Worker recebe os eventos que o `tracking.js` dispara no navegador e reenvia
ao Meta **pelo servidor**, usando o mesmo `event_id`. O Meta deduplica sozinho:

- os dois chegaram → conta **uma** conversão;
- o navegador foi bloqueado (adblock, iOS, aba fechada) → o servidor garante o evento.

---

## 1. Pegar o token do CAPI

1. Gerenciador de Eventos → escolha o pixel **564676471958688**
2. Configurações → **Conversions API** → *Gerar token de acesso*
3. Copie o token. **Ele não entra neste repositório em hipótese alguma.**

## 2. Publicar o Worker

Dentro da pasta `worker/`:

```bash
npx wrangler login
npx wrangler secret put CAPI_TOKEN      # cole o token quando pedir
npx wrangler deploy
```

O deploy imprime a URL final, algo como
`https://capi-aline.SEU-USUARIO.workers.dev`.

> Sem terminal? Dá para colar o conteúdo de `capi.js` direto em
> Cloudflare → Workers & Pages → Create Worker, e cadastrar as variáveis
> em Settings → Variables (marque `CAPI_TOKEN` como **Secret**).

## 3. Ligar o site no Worker

Abra `tracking.js` na raiz do projeto e preencha a constante do topo:

```js
var ENDPOINT_CAPI = 'https://capi-aline.SEU-USUARIO.workers.dev';
```

Enquanto ela estiver vazia, o CAPI fica desligado e só o Pixel do navegador roda —
o site não quebra.

## 4. Testar antes de subir campanha

1. Gerenciador de Eventos → **Testar eventos** → copie o código `TESTxxxxx`
2. `npx wrangler secret put TEST_EVENT_CODE` e cole o código
3. Abra o site, role a página, clique no botão de compra
4. Na tela de teste devem aparecer, em pares (Navegador + Servidor) marcados
   como **Deduplicado**: `PageView`, `ViewContent`, `AddToWishlist`,
   `AddToCart`, `InitiateCheckout`
5. Terminado o teste: `npx wrangler secret delete TEST_EVENT_CODE`

> Se o `TEST_EVENT_CODE` ficar cadastrado, os eventos continuam indo para a aba
> de teste e **não** contam como conversão real. Sempre apague ao terminar.

---

## Variáveis

| Nome | Onde | Valor |
|---|---|---|
| `PIXEL_ID` | `wrangler.toml` | `564676471958688` |
| `ALLOWED_ORIGINS` | `wrangler.toml` | domínios autorizados, separados por vírgula |
| `GRAPH_VERSION` | `wrangler.toml` | `v21.0` |
| `CAPI_TOKEN` | **secret** | token do Gerenciador de Eventos |
| `TEST_EVENT_CODE` | **secret**, temporário | só durante o teste |

## Quando o DNS estiver no Cloudflare

Hoje o endpoint é `*.workers.dev` — domínio diferente do site, então adblocks
bloqueiam com mais facilidade. No dia em que o domínio apontar para o
Cloudflare, crie uma rota `alineexplicasap.com.br/api/capi*` para este Worker e
troque o `ENDPOINT_CAPI` para `https://alineexplicasap.com.br/api/capi`.
Vira first-party: menos bloqueio e EMQ melhor.
