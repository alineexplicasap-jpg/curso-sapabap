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
  'AddToCart', 'InitiateCheckout', 'Purchase', 'Lead', 'Contact', 'Rolagem'
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
