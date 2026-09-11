# Prompt para o agente do Chrome (tela do Cloudflare)

Copie **tudo que está dentro do bloco abaixo** e cole no plugin, com o
dashboard do Cloudflare já aberto e logado.

> **Não coloque o token do Meta neste prompt.** O agente vai criar o campo
> `CAPI_TOKEN` como *Secret* e parar para você digitar o valor. Token colado em
> prompt fica salvo no histórico da extensão.

---

```
Você está no dashboard do Cloudflare (dash.cloudflare.com), já logado. Preciso que você
crie e publique um Worker. Siga na ordem e me diga o resultado de cada etapa.

CONTEXTO: este Worker recebe eventos do meu site e reenvia ao Meta (Conversions API).
Ele é o servidor de rastreamento das minhas campanhas.

ETAPA 1 — Criar o Worker
1. No menu lateral, abra "Compute (Workers)" ou "Workers & Pages" (o nome varia).
2. Clique em "Create" / "Create Worker" / "Create application" e escolha começar do
   template "Hello World" (Worker simples, NÃO Pages, NÃO template com banco).
3. No nome do Worker, digite exatamente: capi-aline
4. Clique em "Deploy" para criar. Ignore a URL por enquanto.

ETAPA 2 — Colar o código
5. Clique em "Edit code" (ou "Continue to project" e depois "Edit code").
6. No editor, abra o arquivo principal (worker.js ou index.js).
7. Apague TODO o conteúdo existente do arquivo.
8. Cole exatamente o código que está no final destas instruções, entre as marcas
   ===INICIO DO CODIGO=== e ===FIM DO CODIGO=== (não copie as marcas).
9. Clique em "Deploy" / "Save and Deploy" e confirme.
10. Me diga se apareceu algum erro de sintaxe.

ETAPA 3 — Variáveis de ambiente
11. Volte para o Worker (botão de voltar / nome "capi-aline" no topo).
12. Abra "Settings" e depois "Variables and Secrets" (pode aparecer como
    "Variables" ou "Environment variables").
13. Adicione estas TRÊS variáveis do tipo texto (Text / Plaintext), uma por vez,
    clicando em "Add variable" e depois em "Deploy"/"Save" no final:

    Nome: PIXEL_ID
    Valor: 564676471958688

    Nome: GRAPH_VERSION
    Valor: v21.0

    Nome: ALLOWED_ORIGINS
    Valor: https://lp.alineexplicasap.com.br,https://alineexplicasap.com.br,https://www.alineexplicasap.com.br,http://localhost:1922

14. Agora adicione uma QUARTA variável, mas do tipo SECRET (marque a opção
    "Secret" / "Encrypt"):

    Nome: CAPI_TOKEN
    Valor: PARE AQUI. Não invente nem preencha este valor. Deixe o campo aberto,
           me avise que chegou nesta etapa e espere eu digitar o token.

15. Depois que eu digitar o token, clique em "Deploy" / "Save" para aplicar.

ETAPA 4 — Me devolver a URL
16. Volte para a página inicial do Worker e copie a URL pública dele, no formato
    https://capi-aline.ALGUMACOISA.workers.dev
17. Me mostre essa URL completa em texto, e confirme que o status do Worker está
    como "Active" / "Deployed".

REGRAS:
- Não altere nenhuma outra configuração da conta Cloudflare.
- Não apague nem edite outros Workers, domínios, DNS ou páginas.
- Não crie banco de dados, KV, R2, filas ou qualquer recurso pago.
- Se alguma tela estiver diferente do que descrevi, me descreva o que está vendo
  em vez de tentar adivinhar o caminho.
- Se pedir plano pago em algum momento, pare e me avise.

===INICIO DO CODIGO===
/* ============================================================================
   CAPI Worker — Conversions API do Meta (Cloudflare Worker)
   Aline Explica SAP

   Recebe os eventos que o tracking.js manda do navegador e reenvia ao Meta
   pelo servidor, com o MESMO event_id do Pixel. O Meta deduplica sozinho:
   se os dois chegarem, conta uma vez; se o navegador for bloqueado por
   adblock ou iOS, o servidor garante o evento.

   Variaveis de ambiente (configurar no painel do Cloudflare ou no wrangler):
     PIXEL_ID         564676471958688
     CAPI_TOKEN       token de acesso do pixel  (SECRET — nunca no repositorio)
     ALLOWED_ORIGINS  dominios autorizados, separados por virgula
     GRAPH_VERSION    versao da Graph API (opcional, padrao v21.0)
     TEST_EVENT_CODE  codigo de teste do Gerenciador de Eventos (opcional)
   ========================================================================== */

const EVENTOS_PERMITIDOS = new Set([
  'PageView', 'ViewContent', 'AddToWishlist',
  'AddToCart', 'InitiateCheckout', 'Purchase', 'Lead', 'Contact'
]);

export default {
  async fetch(request, env) {
    const origem = request.headers.get('Origin') || '';
    const cors = montaCors(origem, env);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return json({ erro: 'metodo nao permitido' }, 405, cors);
    if (!cors['Access-Control-Allow-Origin']) return json({ erro: 'origem nao autorizada' }, 403, {});

    let corpo;
    try {
      corpo = JSON.parse(await request.text());
    } catch (e) {
      return json({ erro: 'json invalido' }, 400, cors);
    }

    const nome = String(corpo.event_name || '');
    if (!EVENTOS_PERMITIDOS.has(nome)) return json({ erro: 'evento nao permitido' }, 400, cors);

    const evento = await montaEvento(corpo, request, nome);
    const versao = env.GRAPH_VERSION || 'v21.0';
    const url = `https://graph.facebook.com/${versao}/${env.PIXEL_ID}/events`;

    const carga = { data: [evento], access_token: env.CAPI_TOKEN };
    if (env.TEST_EVENT_CODE) carga.test_event_code = env.TEST_EVENT_CODE;

    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(carga)
      });
      const resposta = await r.json();
      return json({ ok: r.ok, event_name: nome, event_id: evento.event_id, meta: resposta }, r.ok ? 200 : 502, cors);
    } catch (e) {
      return json({ erro: 'falha ao falar com o Meta', detalhe: String(e) }, 502, cors);
    }
  }
};

/* ---------- montagem do evento ------------------------------------------ */

async function montaEvento(corpo, request, nome) {
  const cf = request.cf || {};

  const user_data = {
    client_ip_address: request.headers.get('CF-Connecting-IP') || '',
    client_user_agent: request.headers.get('User-Agent') || ''
  };

  /* fbp e fbc vao CRUS — nunca hasheados */
  if (corpo.fbp) user_data.fbp = corpo.fbp;
  if (corpo.fbc) user_data.fbc = corpo.fbc;

  /* external_id: hash do mesmo valor cru que o Pixel recebeu no init.
     Normalizacao identica dos dois lados, senao o hash nao casa. */
  if (corpo.external_id) user_data.external_id = [await sha256(normaliza(corpo.external_id))];

  /* geo pelo IP (Cloudflare) — sinal extra de match, sem PII do usuario */
  if (cf.city) user_data.ct = [await sha256(normaliza(cf.city).replace(/[^a-z]/g, ''))];
  if (cf.regionCode) user_data.st = [await sha256(normaliza(cf.regionCode))];
  if (cf.postalCode) user_data.zp = [await sha256(String(cf.postalCode).replace(/[^0-9]/g, ''))];
  if (cf.country) user_data.country = [await sha256(normaliza(cf.country))];

  const custom = Object.assign({}, corpo.custom_data || {});
  const utm = corpo.utm || {};
  if (utm.utm_campaign) custom.campanha = utm.utm_campaign;
  if (utm.utm_content) custom.anuncio = utm.utm_content;

  return {
    event_name: nome,
    event_id: corpo.event_id,
    event_time: Number(corpo.event_time) || Math.floor(Date.now() / 1000),
    event_source_url: corpo.event_source_url || '',
    action_source: 'website',
    user_data,
    custom_data: custom
  };
}

/* ---------- utilidades --------------------------------------------------- */

function normaliza(v) {
  return String(v).trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

async function sha256(texto) {
  const bytes = new TextEncoder().encode(texto);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function montaCors(origem, env) {
  const lista = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const base = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
  if (lista.includes(origem)) base['Access-Control-Allow-Origin'] = origem;
  return base;
}

function json(dados, status, cors) {
  return new Response(JSON.stringify(dados), {
    status,
    headers: Object.assign({ 'Content-Type': 'application/json' }, cors)
  });
}
===FIM DO CODIGO===
```

---

## Depois que o agente devolver a URL

1. Abra `tracking.js` na raiz do projeto e cole a URL na linha 22:

   ```js
   var ENDPOINT_CAPI = 'https://capi-aline.SEU-USUARIO.workers.dev';
   ```

2. Suba o site e teste pelo Gerenciador de Eventos → **Testar eventos**
   (roteiro completo em `worker/README.md`).

## Onde pegar o token do Meta (antes de começar)

Gerenciador de Eventos → pixel **564676471958688** → Configurações →
**Conversions API** → *Gerar token de acesso*. Deixe copiado antes de rodar o
prompt, porque o agente vai parar esperando você colar.
