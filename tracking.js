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

  /* ---------- 3. Pixel: snippet oficial + init com Advanced Matching ------ */

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

  /* ---------- 4. envio: Pixel + CAPI com o MESMO event_id ---------------- */

  function fbc() {
    var c = leCookie('_fbc');
    if (c) return c;
    if (origem.fbclid) return 'fb.1.' + (origem.ts || Date.now()) + '.' + origem.fbclid;
    return '';
  }

  function paraCapi(nome, params, id) {
    if (!CAPI) return;
    var corpo = {
      event_name: nome,
      event_id: id,
      event_time: Math.floor(Date.now() / 1000),
      event_source_url: location.href,
      external_id: UID,
      fbp: leCookie('_fbp'),
      fbc: fbc(),
      custom_data: params || {},
      utm: origem
    };
    var texto = JSON.stringify(corpo);
    /* text/plain evita preflight CORS — sendBeacon nao sobrevive a um preflight */
    try {
      if (navigator.sendBeacon) {
        var ok = navigator.sendBeacon(CAPI, new Blob([texto], { type: 'text/plain;charset=UTF-8' }));
        if (ok) return;
      }
      fetch(CAPI, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: texto,
        keepalive: true,
        mode: 'cors'
      })['catch'](function () { });
    } catch (e) { }
  }

  /* dispara em um pixel so (o do funil) */
  function dispara(nome, params) {
    var id = uuid();
    fbq('trackSingle', PIXEL, nome, params || {}, { eventID: id });
    paraCapi(nome, params, id);
    return id;
  }

  /* ---------- 5. PageView: em todos os pixels, imediato ------------------- */

  (function () {
    var id = uuid();
    var p = paramsOrigem();
    fbq('track', 'PageView', p, { eventID: id });
    paraCapi('PageView', p, id);
  })();

  /* ---------- 6. parametros de conteudo ---------------------------------- */

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

  /* ---------- 7. degraus por scroll / tempo ------------------------------ */

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

  /* ---------- 8. cliques: oferta e checkout ------------------------------ */

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

  /* ---------- 9. api publica (para eventos manuais, se precisar) ---------- */

  window.aesTrack = dispara;

})();
