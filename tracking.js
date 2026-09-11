/* ============================================================================
   Tracking Meta — Framework FOP (Funil de Otimizacao de Pixel)
   Aline Explica SAP · vanilla, sem GTM, sem dependencias

   Funil (LP de venda direta, sem formulario, checkout externo Hotmart):
     1 PageView         carga da pagina                   (disparado no <head>)
     2 ViewContent      25% de scroll ou 10s
     3 AddToWishlist    50% de scroll ou 30s
     4 AddToCart        clique em CTA que leva a oferta
     5 InitiateCheckout clique no botao do checkout Hotmart
     6 Purchase         Hotmart (integracao nativa server-side) — nao vive aqui

   Cada evento carrega um event_id unico, espelhado no CAPI para deduplicacao.
   Configuracao por pagina: window.AES_TRACK, definido no <head>.
   ========================================================================== */
(function () {
  'use strict';

  /* >>> URL do Worker de CAPI. Cole aqui depois de publicar o Worker, ex.:
         var ENDPOINT_CAPI = 'https://capi-aline.SEU-USUARIO.workers.dev';
         Enquanto ficar vazio, o CAPI fica desligado e so o Pixel do navegador roda. <<< */
  var ENDPOINT_CAPI = 'https://capi-aline.aline-explicasap.workers.dev';

  var CFG = window.AES_TRACK;
  if (!CFG || !CFG.pixel) return;

  var C = CFG.content || {};
  var MOEDA = C.currency || 'BRL';
  var CAPI = CFG.capi || ENDPOINT_CAPI;

  /* ---------- utilidades ------------------------------------------------- */

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'e' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 12);
  }

  function leCookie(nome) {
    var m = document.cookie.match(new RegExp('(?:^|;\s*)' + nome + '=([^;]*)'));
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

  /* ---------- 1. origem do trafego (UTM + fbclid), persistida 90 dias ----- */

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

  /* ---------- 2. envio: Pixel + CAPI com o MESMO event_id ---------------- */

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
      external_id: CFG.uid,
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

  function dispara(nome, params, idPronto) {
    var id = idPronto || uuid();
    if (typeof window.fbq === 'function') {
      fbq('trackSingle', CFG.pixel, nome, params || {}, { eventID: id });
    }
    paraCapi(nome, params, id);
    return id;
  }

  /* espelha no CAPI o PageView que ja saiu no <head> (mesmo event_id) */
  if (CFG.pvId) paraCapi('PageView', {}, CFG.pvId);

  /* ---------- 3. parametros de conteudo ---------------------------------- */

  function conteudo(comValor) {
    var p = {
      content_name: C.name,
      content_category: C.category,
      content_type: 'product',
      content_ids: [C.id]
    };
    if (comValor) { p.value = C.value; p.currency = MOEDA; }
    return p;
  }

  /* ---------- 4. degraus por scroll / tempo ------------------------------ */

  var feitos = {};
  function umaVez(nome, fn) {
    if (feitos[nome]) return;
    feitos[nome] = true;
    fn();
  }

  var DEGRAUS = [
    { nome: 'ViewContent',   scroll: 25, tempo: 10000, valor: true },
    { nome: 'AddToWishlist', scroll: 50, tempo: 30000, valor: true }
  ];

  DEGRAUS.forEach(function (d) {
    setTimeout(function () {
      umaVez(d.nome, function () { dispara(d.nome, conteudo(d.valor)); });
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
        if (pct >= d.scroll) umaVez(d.nome, function () { dispara(d.nome, conteudo(d.valor)); });
      });
    });
  }, { passive: true });

  /* ---------- 5. cliques: oferta e checkout ------------------------------ */

  function limpa(s) {
    return String(s).replace(/[^a-zA-Z0-9_~-]/g, '-');
  }

  /* de onde veio esta visita, em ordem de confianca:
       1. utm_source salvo (clique em anuncio nos ultimos 90 dias)
       2. fbclid sem UTM -> veio do Meta mesmo assim
       3. site de onde a pessoa chegou (instagram, google, youtube...)
       4. nada -> direto (digitou o link, bio, WhatsApp) */
  function fonteDaVisita() {
    if (origem.utm_source) return origem.utm_source;
    if (origem.fbclid) return 'meta';
    try {
      var host = document.referrer ? new URL(document.referrer).hostname : '';
      if (host && host !== location.hostname) {
        return host.replace(/^(www|l|lm|m)\./, '').split('.')[0];
      }
    } catch (e) { }
    return 'direto';
  }

  /* repassa a origem para a Hotmart (src = fonte, sck = campanha~anuncio~uid) */
  function comRastreio(url) {
    try {
      var u = new URL(url, location.href);
      if (!u.searchParams.get('src')) {
        u.searchParams.set('src', limpa(fonteDaVisita()));
      }
      if (!u.searchParams.get('sck')) {
        var sck = [origem.utm_campaign, origem.utm_content, CFG.uid].filter(Boolean).join('~');
        u.searchParams.set('sck', limpa(sck).slice(0, 100));
      }
      return u.toString();
    } catch (e) { return url; }
  }

  /* reescreve os links do checkout ja no carregamento: assim a origem vai junto
     tambem em "abrir em nova aba", botao do meio e "copiar link", que nao passam
     pelo clique. Deixa a fonte visivel em <html data-aes-fonte> para conferencia. */
  function marcaLinksCheckout() {
    var links = document.querySelectorAll('a[href*="pay.hotmart.com"]');
    for (var i = 0; i < links.length; i++) links[i].href = comRastreio(links[i].href);
    document.documentElement.setAttribute('data-aes-fonte', fonteDaVisita());
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
      umaVez('InitiateCheckout', function () {
        var p = conteudo(true);
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
        umaVez('AddToCart', function () { dispara('AddToCart', conteudo(true)); });
      }
    }
  }, true);

  /* ---------- 6. api publica (para eventos manuais, se precisar) ---------- */

  window.aesTrack = dispara;

})();
