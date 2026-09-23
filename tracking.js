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
     - Rolagem        marcos de 20/40/60/70/80/90/100% (evento personalizado,
                      um so nome, com o percentual em custom_data.percentual)
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

  /* evento personalizado (nao existe padrao do Meta equivalente).
     Por padrao vai so pelo navegador: rolagem nao e conversao, nao precisa da
     resiliencia do servidor, e evita 7 chamadas extras ao Worker por visita.
     Para espelhar no CAPI, troque ROLAGEM_NO_CAPI para true. */
  var ROLAGEM_NO_CAPI = false;
  function disparaCustom(nome, params) {
    var id = uuid();
    fbq('trackSingleCustom', PIXEL, nome, params || {}, { eventID: id });
    if (ROLAGEM_NO_CAPI) paraCapi(nome, params, id);
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
    if (maiorMarco) p.rolagem = maiorMarco;   /* quanto leu ate aqui */
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
    if (altura <= 0) return 100;                       /* cabe na tela: leu tudo */
    var pct = ((window.pageYOffset || raiz.scrollTop) / altura) * 100;
    return Math.max(0, Math.min(100, Math.round(pct)));
  }

  /* Marcos de profundidade de leitura. Um unico evento "Rolagem" com o
     percentual como parametro, em vez de 7 eventos distintos: o Meta so
     prioriza 8 eventos por dominio (usuarios iOS), e esses lugares tem que
     sobrar para Purchase e InitiateCheckout. Publico por faixa sai filtrando
     o parametro percentual. */
  var MARCOS = [20, 40, 60, 70, 80, 90, 100];
  var maiorMarco = 0;

  function marcaRolagem(pct) {
    for (var i = 0; i < MARCOS.length; i++) {
      var m = MARCOS[i];
      if (pct < m) break;
      umaVez('rolagem' + m, function (marco) {
        return function () {
          maiorMarco = marco;
          var p = paramsOrigem();
          p.percentual = marco;
          p.content_name = C.name;
          p.content_category = C.category;
          disparaCustom('Rolagem', p);
        };
      }(m));
    }
  }

  var agendado = false;
  function verificaScroll() {
    var pct = percentualLido();
    marcaRolagem(pct);                 /* antes dos degraus: assim ViewContent
                                          e os demais ja saem com o marco atual */
    DEGRAUS.forEach(function (d) {
      if (pct >= d.scroll) umaVez(d.nome, function () { dispara(d.nome, conteudo()); });
    });
  }

  window.addEventListener('scroll', function () {
    if (agendado) return;
    agendado = true;
    requestAnimationFrame(function () {
      agendado = false;
      verificaScroll();
    });
  }, { passive: true });

  /* pagina curta (sem barra de rolagem): a pessoa ja viu tudo */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(verificaScroll, 1200); });
  } else {
    setTimeout(verificaScroll, 1200);
  }

  /* ---------- 9. cliques: oferta e checkout ------------------------------ */

  /* repassa a origem para a Hotmart (src = fonte, sck = campanha~anuncio, xcod = uid, utm_* inteiros) */
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
      /* utm_* originais, inteiros: a Hotmart le direto da URL do checkout e
         mostra no relatorio de vendas. Vem da origem salva (ultimo clique em
         anuncio), entao acompanha a pessoa mesmo em retorno direto. */
      CHAVES_UTM.forEach(function (k) {
        if (origem[k] && !u.searchParams.get(k)) u.searchParams.set(k, origem[k]);
      });
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
