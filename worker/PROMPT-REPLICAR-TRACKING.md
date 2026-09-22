# Prompt: implantar este sistema de rastreamento Meta em outro projeto

Cole o conteúdo deste arquivo inteiro numa sessão nova do Claude Code, dentro do
projeto de destino. Ele é autocontido: traz a arquitetura, o código, as decisões
e — o mais importante — as armadilhas que só aparecem em produção.

Validado em produção em `lp.alineexplicasap.com.br` (LP estática na Vercel,
checkout Hotmart, CAPI em Cloudflare Worker). Primeira venda rastreada a
R$ 10,67 por compra.

---

## INSTRUÇÕES PARA VOCÊ, CLAUDE

Você vai implantar um rastreamento Meta (Pixel + Conversions API) com
deduplicação. Siga a ordem: **diagnóstico → decisões → código → validação**.
Não pule o diagnóstico e não implemente antes de confirmar as decisões com a
pessoa.

### Passo 1 — Diagnóstico (pergunte antes de codar)

1. **Onde o site está hospedado?** Não acredite na resposta sem verificar:
   `curl -sI https://dominio` mostra o servidor real. Isso decide se dá para ter
   endpoint de CAPI no mesmo domínio (first-party, muito melhor) ou se vai ser
   um Worker em domínio separado.
2. **Qual é o domínio exato que recebe o tráfego?** Subdomínio (`lp.site.com`) e
   raiz (`site.com`) são origens diferentes para CORS. Confirme abrindo o link
   que a pessoa usa de verdade.
3. **Qual é o pixel, e existe mais de um?** Peça o ID. Se houver vários, defina
   qual recebe os eventos do funil e qual recebe só PageView.
4. **Onde é o checkout?** Mesma página, plataforma externa (Hotmart, Kiwify,
   Ticto), ou carrinho próprio? Isso define de onde vem o `Purchase`.
5. **Existe formulário ou login na página?** Sem formulário não há e-mail nem
   telefone para Advanced Matching — e não adianta prometer EMQ alto.
6. **Que páginas já têm pixel hoje?** Procure backups e páginas antigas ainda
   publicadas: `grep -rl "fbq(" *.html */*.html`, depois teste cada uma com
   `curl -o /dev/null -w "%{http_code}"`. Página velha publicada com pixel antigo
   contamina todas as métricas e é invisível no diagnóstico do Meta.

### Passo 2 — Hierarquia de eventos (apresente antes de codar)

Para LP de venda direta sem formulário, com checkout externo:

| # | Evento | Gatilho |
|---|---|---|
| 1 | PageView | carga da página, imediato |
| 2 | ViewContent | 25% de scroll ou 10s |
| 3 | AddToWishlist | 50% de scroll ou 30s |
| 4 | AddToCart | clique em CTA que leva à oferta |
| 5 | InitiateCheckout | clique no botão do checkout |
| 6 | Purchase | **plataforma de checkout**, server-side — nunca na página de obrigado |

Adapte: com formulário, entram `Lead` (abriu), `Contact` (nome), `AddToCart`
(e-mail + telefone). Com WhatsApp, `Lead` no clique do botão.

### Passo 3 — Implementação

Copie os dois arquivos do fim deste documento e troque:

- `ENDPOINT_CAPI` → URL do seu Worker (ou `/api/capi` se for first-party)
- `window.AES_TRACK` no `<head>` de cada página → pixel, pixelsExtra, content
  (nome, categoria, id, **valor real do produto**, moeda)
- No Worker: `PIXEL_ID`, `ALLOWED_ORIGINS`, `CAPI_TOKEN` (secret)
- O seletor do checkout: o código detecta `pay.hotmart.com`. Troque pelo domínio
  da sua plataforma.

O `<head>` de cada página fica só com a configuração:

```html
<script>
  window.AES_TRACK = {
    pixel: 'SEU_PIXEL',
    pixelsExtra: [],
    content: { name: 'Produto', category: 'categoria', id: 'sku', value: 197.00, currency: 'BRL' }
  };
</script>
<script src="tracking.js"></script>
```

**Sem `defer`, e antes de qualquer outro script.** O motivo está nas armadilhas.

### Passo 4 — Validação (não declare pronto sem isso)

Teste em navegador real (Playwright/patchright), não só leitura de código:

1. Cookie `_fbp` criado **antes** do `fbq('init')`, no domínio raiz
2. Ordem do boot: `set autoConfig` → `init` → `track PageView`
3. Mesmo `event_id` no Pixel e no payload do CAPI
4. Funil sobe na ordem ao rolar e clicar
5. Link do checkout recebe os parâmetros de origem já no carregamento
6. Zero erros de console, zero requisições falhas
7. `curl` no Worker: origem válida → 200 com `events_received: 1`; origem
   estranha → 403; sem `event_id` → 400
8. Gerenciador de Eventos → Testar eventos: cada evento com par
   **Navegador + Servidor** marcado **Deduplicado**

> **Atenção com agentes de navegador:** se você usar patchright, `page.evaluate`
> roda em contexto isolado e **não enxerga `window` da página**. Verifique pelo
> DOM (escreva o log num `<pre>`) e pelos cookies do contexto.

---

## ARMADILHAS — leia antes, cada uma custou tempo

**1. Pixel com lazy-load mata o PageView em tráfego pago.** Carregar o pixel só
após interação ou N segundos é otimização de velocidade que, em campanha paga,
descarta quem entra e sai rápido. Carregue imediato.

**2. `autoConfig` gera lixo.** Ligado (o padrão), ele dispara
`SubscribedButtonClick` em cliques e um **PageView extra sem `event_id`** a cada
mudança de hash na URL. Esse PageView nunca deduplica e infla o denominador de
toda taxa de conversão. Desligue: `fbq('set', 'autoConfig', false, pixelId)`.

**3. Âncoras `#secao` mudam a URL.** Combinado com o item 2, cada clique em
"ver preço" virava um PageView. Role com `scrollIntoView` e `preventDefault`,
sem tocar na URL.

**4. O `_fbp` não existe no boot.** O `fbevents.js` é assíncrono e só cria o
cookie depois de carregar — mas o PageView já foi enviado ao servidor. Resultado
real: `fbp` em 23% dos eventos. Solução: **gerar o `_fbp` você mesmo**, no
formato `fb.1.<timestamp_ms>.<10 dígitos>`, como cookie first-party no domínio
raiz, **antes** do `init`. O Pixel reaproveita e os dois lados mandam o mesmo.

**5. `sendBeacon` com `application/json` falha em cross-origin.** Esse
content-type dispara preflight CORS, e `sendBeacon` não sobrevive a preflight —
falha em silêncio. Use `text/plain;charset=UTF-8` (safelisted) e faça o servidor
dar `JSON.parse` no texto. Melhor ainda: `fetch` com `keepalive`, que devolve
status e permite retry.

**6. Worker em `*.workers.dev` é third-party.** Cookie do site não chega no
header, adblock bloqueia mais, e não dá para gravar cookie de volta. Se o DNS
estiver no Cloudflare, use rota no próprio domínio. Na Vercel/Netlify, um rewrite
para `/api/capi` resolve. **Esta é a melhoria com maior impacto no EMQ.**

**7. CORS por origem exata.** `https://lp.site.com` e `https://site.com` são
origens diferentes. Erramos isso e o CAPI devolveu 403 por um dia inteiro — e
esse período conta contra a cobertura no diagnóstico do Meta.

**8. Variável do Worker não vive no repositório.** Editar `wrangler.toml` não
muda o que está no ar se o Worker foi publicado pelo painel. Toda mudança de
variável tem que ser feita também no dashboard.

**9. Secret do Cloudflare não é recuperável.** Depois de salvo, nem o painel nem
a API devolvem o valor. Guarde o token em `.dev.vars` local (no `.gitignore`)
no momento em que gerar. E gere um token por integração: se um vazar, você
revoga só aquele.

**10. `TEST_EVENT_CODE` esquecido é veneno silencioso.** Enquanto existir, todo
evento real vai para a aba de teste e **não conta como conversão**. Remova
imediatamente após o teste.

**11. Origem padrão `meta` etiqueta tráfego direto como anúncio.** Sem UTM, não
assuma que veio do anúncio. Ordem correta: `utm_source` salvo → `fbclid` →
referrer (`instagram`, `google`) → `direto`.

**12. Aplique a origem no link já no carregamento, não só no clique.** "Abrir em
nova aba", botão do meio e "copiar link" não passam pelo evento de clique.

**13. Janela de atribuição.** Guardar a UTM por 90 dias faz a plataforma de
checkout creditar vendas que o Meta (7 dias de clique) não credita — seus
relatórios divergem e a campanha parece melhor do que é. Alinhe as janelas ou
saiba explicar a diferença.

**14. `Purchase` nunca na página de obrigado.** Boleto e Pix aprovam depois,
refresh conta duas vezes, e quem fecha a aba some. Use a integração nativa da
plataforma (server-side, só em pagamento aprovado).

**15. Plataforma com CAPI-only não mostra pixel no checkout.** Testamos o
checkout, não vimos pixel nenhum e concluímos que não estava configurado — mas
as compras chegavam normalmente pelo servidor. **Ausência de pixel no navegador
não prova ausência de rastreamento.**

**16. Evento duplicado entre site e plataforma.** Se a plataforma também envia
`InitiateCheckout`, o `event_id` é diferente do seu e conta em dobro. Deixe
`Purchase` e `AddPaymentInfo` para a plataforma, e o resto para o site.

**17. `value` como string e `event_time` em milissegundos.** `"R$ 197,00"` e
`Date.now()` são recusados ou ignorados pelo Meta. Sanitize no servidor: número
com ponto, tempo em segundos, e nunca envie `value: 0` ou `null`.

**18. Diagnóstico do Meta olha os últimos 7 dias.** Correções não aparecem na
hora. E eventos vindos de páginas antigas ou de outros sites com o mesmo pixel
entram na conta — se aparecer um evento que seu código não emite, procure a
origem antes de tentar "corrigir".

**19. Relatório de agente de navegador não é evidência.** Recebemos a afirmação
"o Worker pega o código de teste dinamicamente, não há nada para limpar" de um
agente que nunca abriu o Cloudflare. Confirme você mesmo.

**20. Identidade do comprador vem da plataforma.** E-mail e telefone hasheados
no `Purchase` são o sinal mais forte para Público Semelhante. Sem checkout
próprio, isso só existe pela integração da plataforma — não prometa EMQ alto
antes disso.

---

## REGRAS DE QUALIDADE

- Todo evento com `event_id` único (UUID v4), **idêntico** no Pixel e no CAPI
- `value` + `currency` em todo evento com valor
- `fbp` e `fbc` vão **crus**; `external_id`, `em`, `ph`, geo vão em SHA-256
- Normalização idêntica client/server, senão o hash não casa: e-mail
  `trim + lowercase`; telefone só dígitos com DDI
- Nunca envie parâmetro sem propósito (`device_*`, `event_day`, `tracked_by`)
- Nunca use evento personalizado onde existe um padrão do Meta
- Token nunca no repositório; PII nunca em log, query string ou console
- `external_id` anônimo (UUID em cookie + localStorage) sobe o EMQ sem PII

---

## CHECKLIST DE ENTREGA

- [ ] Diagnóstico feito e hospedagem verificada por `curl`
- [ ] Hierarquia de eventos aprovada pela pessoa
- [ ] Páginas antigas com pixel removidas do deploy
- [ ] `tracking.js` no `<head>` sem `defer`, em todas as páginas
- [ ] Worker publicado, variáveis conferidas, token como secret
- [ ] Testes de navegador passando (os 8 itens do Passo 4)
- [ ] `curl` no Worker: 200 / 403 / 400 corretos
- [ ] Testar eventos: todos deduplicados
- [ ] `TEST_EVENT_CODE` removido
- [ ] Plataforma de checkout configurada para `Purchase` server-side
- [ ] Campanha otimizando por `InitiateCheckout` até haver volume de compras

---

## CÓDIGO 1 — `tracking.js` (raiz do site)

```javascript
/* ============================================================================
   Tracking Meta — Framework FOP (Funil de Otimizacao de Pixel)
   Aline Explica SAP · vanilla, sem GTM, sem dependencias

   Carregar no <head>, SEM defer, logo depois de definir window.AES_TRACK:
     <script>window.AES_TRACK = { pixel, pixelsExtra, content }</script>
     <script src="tracking.js"></script>

   Funil (LP de venda direta, sem formulario, checkout externo Hotmart):
     1 PageView         carga da pagina
     2 ViewContent      25% de scroll ou 10s
     3 AddToWishlist    50% de scroll ou 30s
     4 AddToCart        clique em CTA que leva a oferta
     5 InitiateCheckout clique no botao do checkout Hotmart
     6 Purchase         Hotmart (integracao nativa server-side) — nao vive aqui

   Todo evento leva: event_id unico (espelhado no CAPI para deduplicacao),
   fonte da visita (meta, instagram, google, direto...) e, quando ha UTM,
   campanha e anuncio. Para a Hotmart vao src, sck, xcod e fbclid.
   Eventos do funil vao so para AES_TRACK.pixel; os
   pixels em AES_TRACK.pixelsExtra recebem apenas o PageView.
   ========================================================================== */
(function () {
  'use strict';

  /* >>> URL do Worker de CAPI. Vazio = CAPI desligado, so o Pixel do navegador roda. <<< */
  var ENDPOINT_CAPI = 'https://capi-aline.aline-explicasap.workers.dev';

  var CFG = window.AES_TRACK;
  if (!CFG || !CFG.pixel) return;

  var PIXEL = CFG.pixel;
  var PIXELS_TODOS = [PIXEL].concat(CFG.pixelsExtra || []);
  var C = CFG.content || {};
  var MOEDA = C.currency || 'BRL';
  var CAPI = CFG.capi || ENDPOINT_CAPI;

  /* ---------- utilidades ------------------------------------------------- */

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'e' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
  }

  function leCookie(nome) {
    var m = document.cookie.match(new RegExp('(?:^|;\\s*)' + nome + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  }

  function guarda(chave, valor, dias) {
    try { localStorage.setItem(chave, valor); } catch (e) { }
    document.cookie = chave + '=' + encodeURIComponent(valor) +
      ';path=/;max-age=' + (dias * 86400) + ';SameSite=Lax';
  }

  function recupera(chave) {
    var v = '';
    try { v = localStorage.getItem(chave) || ''; } catch (e) { }
    return v || leCookie(chave);
  }

  function limpa(s) {
    return String(s).replace(/[^a-zA-Z0-9_~-]/g, '-');
  }

  /* ---------- 1. visitante: external_id anonimo e estavel (180 dias) ------ */

  var UID = recupera('_aes_uid');
  if (!UID) UID = uuid();
  guarda('_aes_uid', UID, 180);
  CFG.uid = UID;

  /* ---------- 2. origem da visita (UTM + fbclid), persistida 90 dias ------ */

  var CHAVES_UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];

  var origem = (function () {
    var q = new URLSearchParams(location.search);
    var novo = {}, achou = false;
    CHAVES_UTM.forEach(function (k) {
      var v = q.get(k);
      if (v) { novo[k] = v; achou = true; }
    });
    var fbclid = q.get('fbclid');
    if (fbclid) { novo.fbclid = fbclid; achou = true; }

    if (achou) {
      novo.ts = Date.now();
      guarda('_aes_src', JSON.stringify(novo), 90);
      return novo;
    }
    try { return JSON.parse(recupera('_aes_src') || '{}'); } catch (e) { return {}; }
  })();

  /* de onde veio esta visita, em ordem de confianca:
       1. utm_source salvo (clique em anuncio nos ultimos 90 dias)
       2. fbclid sem UTM -> veio do Meta mesmo assim
       3. site de onde a pessoa chegou (instagram, google, youtube...)
       4. nada -> direto (digitou o link, bio, WhatsApp) */
  var FONTE = (function () {
    if (origem.utm_source) return limpa(origem.utm_source);
    if (origem.fbclid) return 'meta';
    try {
      var host = document.referrer ? new URL(document.referrer).hostname : '';
      if (host && host !== location.hostname) {
        return limpa(host.replace(/^(www|l|lm|m)\./, '').split('.')[0]);
      }
    } catch (e) { }
    return 'direto';
  })();
  CFG.fonte = FONTE;
  document.documentElement.setAttribute('data-aes-fonte', FONTE);

  /* parametros de origem que vao em TODO evento */
  function paramsOrigem() {
    var p = { fonte: FONTE };
    if (origem.utm_campaign) p.campanha = origem.utm_campaign;
    if (origem.utm_content) p.anuncio = origem.utm_content;
    return p;
  }

  /* ---------- 3. _fbp e _fbc first-party, ANTES do pixel ------------------ */

  /* dominio raiz onde o cookie pega (lp.x.com.br -> x.com.br); vazio em localhost */
  var DOMINIO = (function () {
    var partes = location.hostname.split('.');
    if (partes.length < 2 || /^[0-9.]+$/.test(location.hostname)) return '';
    for (var i = partes.length - 2; i >= 0; i--) {
      var cand = partes.slice(i).join('.');
      document.cookie = '_aes_t=1;domain=' + cand + ';path=/;max-age=60;SameSite=Lax';
      if (leCookie('_aes_t')) {
        document.cookie = '_aes_t=;domain=' + cand + ';path=/;max-age=0';
        return cand;
      }
    }
    return '';
  })();

  function cookieRaiz(nome, valor, dias) {
    document.cookie = nome + '=' + valor + (DOMINIO ? ';domain=' + DOMINIO : '') +
      ';path=/;max-age=' + (dias * 86400) + ';SameSite=Lax';
  }

  /* _fbp: o fbevents.js so cria este cookie depois de carregar (async). O PageView
     sai antes disso e ia ao servidor sem fbp. Gerando aqui, no formato oficial,
     o Pixel reaproveita e client + server mandam o MESMO valor. */
  var FBP = leCookie('_fbp');
  if (!FBP) {
    FBP = 'fb.1.' + Date.now() + '.' + String(Math.floor(Math.random() * 1e10)).padStart(10, '0');
    cookieRaiz('_fbp', FBP, 90);
  }

  /* _fbc: com fbclid na URL, grava agora (o Pixel faria o mesmo); sem fbclid na
     URL mas com um salvo, grava tambem — assim o Pixel do navegador manda fbc
     em retornos diretos, nao so o servidor. */
  var FBC = leCookie('_fbc');
  var fbclidAgora = new URLSearchParams(location.search).get('fbclid');
  if (fbclidAgora) {
    FBC = 'fb.1.' + Date.now() + '.' + fbclidAgora;
    cookieRaiz('_fbc', FBC, 90);
  } else if (!FBC && origem.fbclid) {
    FBC = 'fb.1.' + (origem.ts || Date.now()) + '.' + origem.fbclid;
    cookieRaiz('_fbc', FBC, 90);
  }

  /* ---------- 4. Pixel: snippet oficial + init com Advanced Matching ------ */

  !function (f, b, e, v, n, t, s) {
    if (f.fbq) return; n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments)
    };
    if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0';
    n.queue = []; t = b.createElement(e); t.async = !0;
    t.src = v; s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s)
  }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');

  PIXELS_TODOS.forEach(function (id) {
    /* sem configuracao automatica: evita SubscribedButtonClick e o PageView extra
       que o Pixel dispara sozinho em mudanca de URL. Nao ha formulario na pagina,
       entao a correspondencia automatica nao perde nada. */
    fbq('set', 'autoConfig', false, id);
    fbq('init', id, { external_id: UID });
  });

  /* ---------- 5. envio: Pixel + CAPI com o MESMO event_id ---------------- */

  /* Fila de eventos que nao chegaram ao Worker (rede, adblock, 5xx). Reenviada
     no proximo carregamento. Itens com mais de 24h sao descartados: o Meta so
     deduplica dentro de 48h, depois disso contaria em dobro. */
  var FILA = '_aes_fila';
  function lerFila() { try { return JSON.parse(localStorage.getItem(FILA) || '[]'); } catch (e) { return []; } }
  function salvarFila(f) { try { localStorage.setItem(FILA, JSON.stringify(f.slice(-20))); } catch (e) { } }

  function postar(corpo) {
    /* text/plain evita preflight CORS. keepalive: sobrevive a navegacao. */
    return fetch(CAPI, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(corpo),
      keepalive: true,
      mode: 'cors'
    }).then(function (r) {
      /* 4xx = erro nosso (origem, payload): nao adianta repetir */
      if (r.status >= 500) throw new Error('capi ' + r.status);
      return true;
    });
  }

  function enviaComRetry(corpo, tentativa) {
    return postar(corpo)['catch'](function () {
      if (tentativa < 1) {
        return new Promise(function (ok) { setTimeout(ok, 1500); })
          .then(function () { return enviaComRetry(corpo, tentativa + 1); });
      }
      var f = lerFila(); f.push(corpo); salvarFila(f);
      return false;
    });
  }

  function paraCapi(nome, params, id) {
    if (!CAPI) return;
    var corpo = {
      event_name: nome,
      event_id: id,
      event_time: Math.floor(Date.now() / 1000),
      event_source_url: location.href,
      external_id: UID,
      fbp: FBP,
      fbc: FBC || '',
      custom_data: params || {},
      utm: origem
    };
    try {
      if (window.fetch) { enviaComRetry(corpo, 0); return; }
      if (navigator.sendBeacon) {
        navigator.sendBeacon(CAPI, new Blob([JSON.stringify(corpo)], { type: 'text/plain;charset=UTF-8' }));
      }
    } catch (e) { }
  }

  /* reenvia o que ficou pendente da visita anterior */
  (function () {
    if (!CAPI || !window.fetch) return;
    var pendentes = lerFila();
    if (!pendentes.length) return;
    salvarFila([]);
    var limite = Math.floor(Date.now() / 1000) - 86400;
    pendentes.forEach(function (c) {
      if (c && c.event_time > limite) enviaComRetry(c, 1);
    });
  })();

  /* dispara em um pixel so (o do funil) */
  function dispara(nome, params) {
    var id = uuid();
    fbq('trackSingle', PIXEL, nome, params || {}, { eventID: id });
    paraCapi(nome, params, id);
    return id;
  }

  /* ---------- 6. PageView: em todos os pixels, imediato ------------------- */

  (function () {
    var id = uuid();
    var p = paramsOrigem();
    fbq('track', 'PageView', p, { eventID: id });
    paraCapi('PageView', p, id);
  })();

  /* ---------- 7. parametros de conteudo ---------------------------------- */

  function conteudo() {
    var p = paramsOrigem();
    p.content_name = C.name;
    p.content_category = C.category;
    p.content_type = 'product';
    p.content_ids = [C.id];
    p.value = C.value;
    p.currency = MOEDA;
    return p;
  }

  /* ---------- 8. degraus por scroll / tempo ------------------------------ */

  var feitos = {};
  function umaVez(nome, fn) {
    if (feitos[nome]) return;
    feitos[nome] = true;
    fn();
  }

  var DEGRAUS = [
    { nome: 'ViewContent',   scroll: 25, tempo: 10000 },
    { nome: 'AddToWishlist', scroll: 50, tempo: 30000 }
  ];

  DEGRAUS.forEach(function (d) {
    setTimeout(function () {
      umaVez(d.nome, function () { dispara(d.nome, conteudo()); });
    }, d.tempo);
  });

  function percentualLido() {
    var raiz = document.documentElement;
    var altura = Math.max(document.body.scrollHeight, raiz.scrollHeight) - window.innerHeight;
    if (altura <= 0) return 100;
    return ((window.pageYOffset || raiz.scrollTop) / altura) * 100;
  }

  var agendado = false;
  window.addEventListener('scroll', function () {
    if (agendado) return;
    agendado = true;
    requestAnimationFrame(function () {
      agendado = false;
      var pct = percentualLido();
      DEGRAUS.forEach(function (d) {
        if (pct >= d.scroll) umaVez(d.nome, function () { dispara(d.nome, conteudo()); });
      });
    });
  }, { passive: true });

  /* ---------- 9. cliques: oferta e checkout ------------------------------ */

  /* repassa a origem para a Hotmart (src = fonte, sck = campanha~anuncio, xcod = uid) */
  function comRastreio(url) {
    try {
      var u = new URL(url, location.href);
      if (!u.searchParams.get('src')) u.searchParams.set('src', FONTE);
      /* fbclid junto: se o checkout capturar, o Purchase sai com fbc e a
         ligacao compra -> clique no anuncio fica mais forte */
      if (origem.fbclid && !u.searchParams.get('fbclid')) u.searchParams.set('fbclid', origem.fbclid);
      /* sck = campanha~anuncio (relatorios da Hotmart) */
      if (!u.searchParams.get('sck')) {
        var sck = [origem.utm_campaign, origem.utm_content].filter(Boolean).join('~');
        if (sck) u.searchParams.set('sck', limpa(sck).slice(0, 100));
      }
      /* xcod = id do visitante: a Hotmart devolve no webhook/postback, o que
         permite reconciliar cada venda com a jornada registrada pelo funil */
      if (!u.searchParams.get('xcod')) u.searchParams.set('xcod', UID);
      return u.toString();
    } catch (e) { return url; }
  }

  /* reescreve os links do checkout ja no carregamento: assim a origem vai junto
     tambem em "abrir em nova aba", botao do meio e "copiar link" */
  function marcaLinksCheckout() {
    var links = document.querySelectorAll('a[href*="pay.hotmart.com"]');
    for (var i = 0; i < links.length; i++) links[i].href = comRastreio(links[i].href);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', marcaLinksCheckout);
  } else {
    marcaLinksCheckout();
  }

  document.addEventListener('click', function (ev) {
    var alvo = ev.target;
    if (!alvo || !alvo.closest) return;
    var link = alvo.closest('a[href]');
    if (!link) return;

    var href = link.getAttribute('href') || '';

    if (/pay\.hotmart\.com/i.test(href)) {
      link.href = comRastreio(link.href);
      /* quem vai direto ao checkout (barra fixa) tambem passou pela oferta:
         garante o degrau AddToCart antes do InitiateCheckout, sem duplicar */
      umaVez('AddToCart', function () { dispara('AddToCart', conteudo()); });
      umaVez('InitiateCheckout', function () {
        var p = conteudo();
        p.num_items = 1;
        dispara('InitiateCheckout', p);
      });
      return;
    }

    if (href.charAt(0) === '#' && href.length > 1) {
      /* rola sem mudar o hash: a cada mudanca de URL o Pixel dispara um PageView
         extra, sem event_id, que nunca deduplica e infla o denominador */
      var secao = document.getElementById(href.slice(1));
      if (secao) {
        ev.preventDefault();
        secao.scrollIntoView({ block: 'start' });
      }
      if (/preco|oferta/i.test(href)) {
        umaVez('AddToCart', function () { dispara('AddToCart', conteudo()); });
      }
    }
  }, true);

  /* ---------- 10. api publica (para eventos manuais, se precisar) ---------- */

  window.aesTrack = dispara;

})();
```

---

## CÓDIGO 2 — `worker/capi.js` (Cloudflare Worker)

```javascript
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

   O que o Worker aceita no corpo (JSON, text/plain para evitar preflight):
     event_name, event_id, event_time (segundos), event_source_url,
     external_id, fbp, fbc, custom_data, utm,
     em / ph (opcionais, CRUS — hasheados aqui; nunca logados)
   ========================================================================== */

const EVENTOS_PERMITIDOS = new Set([
  'PageView', 'ViewContent', 'AddToWishlist',
  'AddToCart', 'InitiateCheckout', 'Purchase', 'Lead', 'Contact'
]);

/* eventos que devem levar value + currency */
const EVENTOS_COM_VALOR = new Set([
  'ViewContent', 'AddToWishlist', 'AddToCart', 'InitiateCheckout', 'Purchase', 'Lead'
]);

const TENTATIVAS = [0, 1000, 3000]; // ms de espera antes de cada tentativa

export default {
  async fetch(request, env, ctx) {
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
    if (!corpo.event_id) return json({ erro: 'event_id obrigatorio' }, 400, cors);

    const evento = await montaEvento(corpo, request, nome);
    const versao = env.GRAPH_VERSION || 'v21.0';
    const url = `https://graph.facebook.com/${versao}/${env.PIXEL_ID}/events`;

    const carga = { data: [evento], access_token: env.CAPI_TOKEN };
    if (env.TEST_EVENT_CODE) carga.test_event_code = env.TEST_EVENT_CODE;

    /* 1a tentativa em linha: responde ao navegador com o resultado real.
       Se falhar por rede ou 5xx do Meta, as demais rodam em segundo plano
       (waitUntil) sem prender a resposta. */
    const r1 = await enviaAoMeta(url, carga, nome, evento.event_id, 0);
    if (r1.ok) {
      return json({ ok: true, event_name: nome, event_id: evento.event_id, meta: r1.meta }, 200, cors);
    }
    if (!r1.repetir) {
      return json({ ok: false, event_name: nome, event_id: evento.event_id, meta: r1.meta }, 502, cors);
    }
    ctx.waitUntil((async () => {
      for (let i = 1; i < TENTATIVAS.length; i++) {
        await new Promise(ok => setTimeout(ok, TENTATIVAS[i]));
        const r = await enviaAoMeta(url, carga, nome, evento.event_id, i);
        if (r.ok || !r.repetir) return;
      }
    })());
    return json({ ok: false, agendado: true, event_name: nome, event_id: evento.event_id }, 202, cors);
  }
};

/* ---------- envio ao Meta com log estruturado ---------------------------- */

async function enviaAoMeta(url, carga, nome, eventId, tentativa) {
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(carga)
    });
    const meta = await r.json().catch(() => ({}));
    if (r.ok) return { ok: true, meta };

    /* erro do Meta: loga fbtrace_id e corpo (sem user_data — nunca PII) */
    const err = meta.error || {};
    console.error(JSON.stringify({
      capi: 'erro-graph', tentativa, event_name: nome, event_id: eventId,
      status: r.status, fbtrace_id: err.fbtrace_id || null,
      code: err.code || null, subcode: err.error_subcode || null,
      message: err.message || null
    }));
    /* 4xx = token, pixel ou payload errado: repetir nao resolve */
    return { ok: false, meta, repetir: r.status >= 500 };
  } catch (e) {
    console.error(JSON.stringify({
      capi: 'erro-rede', tentativa, event_name: nome, event_id: eventId, message: String(e)
    }));
    return { ok: false, meta: { error: { message: String(e) } }, repetir: true };
  }
}

/* ---------- montagem do evento ------------------------------------------ */

async function montaEvento(corpo, request, nome) {
  const cf = request.cf || {};

  /* CF-Connecting-IP = IP real do cliente (v4 ou v6, conforme a conexao que o
     navegador abriu). Nunca o IP do Worker. */
  const user_data = {
    client_ip_address: request.headers.get('CF-Connecting-IP') || '',
    client_user_agent: request.headers.get('User-Agent') || ''
  };

  /* fbp e fbc vao CRUS — nunca hasheados */
  if (corpo.fbp) user_data.fbp = String(corpo.fbp);
  if (corpo.fbc) {
    user_data.fbc = String(corpo.fbc);
  } else {
    /* fallback: fbclid na URL do evento */
    const fbclid = fbclidDaUrl(corpo.event_source_url);
    if (fbclid) user_data.fbc = 'fb.1.' + Date.now() + '.' + fbclid;
  }

  /* external_id: hash do mesmo valor cru que o Pixel recebeu no init.
     Normalizacao identica dos dois lados, senao o hash nao casa. */
  if (corpo.external_id) user_data.external_id = [await sha256(normaliza(corpo.external_id))];

  /* em / ph (opcionais): chegam crus por HTTPS, saem hasheados. Normalizacao
     conforme o Meta: email trim+lowercase; telefone so digitos com DDI. */
  const ems = lista(corpo.em).map(normaliza).filter(Boolean);
  if (ems.length) user_data.em = await Promise.all(ems.map(sha256));
  const phs = lista(corpo.ph).map(normalizaTelefone).filter(Boolean);
  if (phs.length) user_data.ph = await Promise.all(phs.map(sha256));

  /* geo pelo IP (Cloudflare) — sinal extra de match, sem PII do usuario */
  if (cf.city) user_data.ct = [await sha256(normaliza(cf.city).replace(/[^a-z]/g, ''))];
  if (cf.regionCode) user_data.st = [await sha256(normaliza(cf.regionCode))];
  if (cf.postalCode) user_data.zp = [await sha256(String(cf.postalCode).replace(/[^0-9]/g, ''))];
  if (cf.country) user_data.country = [await sha256(normaliza(cf.country))];

  const custom = Object.assign({}, corpo.custom_data || {});
  const utm = corpo.utm || {};
  if (utm.utm_campaign && !custom.campanha) custom.campanha = utm.utm_campaign;
  if (utm.utm_content && !custom.anuncio) custom.anuncio = utm.utm_content;

  /* value sempre NUMERO com ponto; currency sempre presente onde ha valor.
     "R$ 197,00" vira 197; lixo vira ausente (nunca 0, null ou ""). */
  if ('value' in custom) {
    const v = paraNumero(custom.value);
    if (v === null || v <= 0) delete custom.value; else custom.value = v;
  }
  if (EVENTOS_COM_VALOR.has(nome) && 'value' in custom && !custom.currency) custom.currency = 'BRL';
  if (custom.currency) custom.currency = String(custom.currency).toUpperCase();

  /* event_time em segundos; se vier em ms, corrige; fora da janela, usa agora */
  let t = Number(corpo.event_time) || 0;
  if (t > 1e12) t = Math.floor(t / 1000);
  const agora = Math.floor(Date.now() / 1000);
  if (!t || t > agora + 60 || t < agora - 7 * 86400) t = agora;

  return {
    event_name: nome,
    event_id: String(corpo.event_id),
    event_time: t,
    event_source_url: String(corpo.event_source_url || ''),
    action_source: 'website',
    user_data,
    custom_data: custom
  };
}

/* ---------- utilidades --------------------------------------------------- */

function lista(v) {
  if (v == null || v === '') return [];
  return Array.isArray(v) ? v.map(String) : [String(v)];
}

function normaliza(v) {
  return String(v).trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/* so digitos, com DDI. Numero brasileiro sem DDI (10 ou 11 digitos) ganha 55. */
function normalizaTelefone(v) {
  let d = String(v).replace(/[^0-9]/g, '');
  if (!d) return '';
  if ((d.length === 10 || d.length === 11) && !d.startsWith('55')) d = '55' + d;
  return d.length >= 8 ? d : '';
}

function paraNumero(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  const s = String(v).replace(/[^0-9,.\-]/g, '');
  if (!s) return null;
  /* "1.397,00" -> 1397.00 ; "197,5" -> 197.5 ; "197.00" -> 197 */
  const n = s.indexOf(',') > -1 ? parseFloat(s.replace(/\./g, '').replace(',', '.')) : parseFloat(s);
  return isFinite(n) ? n : null;
}

function fbclidDaUrl(url) {
  try { return new URL(String(url)).searchParams.get('fbclid') || ''; } catch (e) { return ''; }
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
```

### Variáveis do Worker

| Nome | Tipo | Exemplo |
|---|---|---|
| `PIXEL_ID` | texto | `564676471958688` |
| `GRAPH_VERSION` | texto | `v21.0` |
| `ALLOWED_ORIGINS` | texto | `https://lp.site.com,https://site.com,http://localhost:1922` |
| `CAPI_TOKEN` | **secret** | gerado em Gerenciador de Eventos → pixel → Configurações → Conversions API |
| `TEST_EVENT_CODE` | texto, **temporário** | só durante o teste — remova depois |

Publicação: `npx wrangler secret put CAPI_TOKEN` e `npx wrangler deploy`, ou
cole o código no painel (Workers → Create → Hello World → Edit code).
