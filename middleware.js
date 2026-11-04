/* Visitante de fora do Brasil que abre a home vai para /lp-dl (oferta em dólar).
   Roda na Vercel antes da página carregar: não pisca e o pixel só conta um PageView.
   - País vem do cabeçalho x-vercel-ip-country. Sem país conhecido, não redireciona.
   - Robôs (revisão de anúncio da Meta, Google etc.) não são redirecionados.
   - Teste: ?pais=US simula outro país; ?pais=BR força a home em reais.
   - Mantém UTMs e fbclid na URL de destino. */

export const config = { matcher: '/' };

const ROBO = /bot|crawl|spider|facebookexternalhit|facebot|meta-externalagent|lighthouse|headless/i;

export default function middleware(request) {
  try {
    const url = new URL(request.url);
    const forcado = (url.searchParams.get('pais') || '').toUpperCase();
    if (!forcado && ROBO.test(request.headers.get('user-agent') || '')) return;

    const pais = forcado || (request.headers.get('x-vercel-ip-country') || '').toUpperCase();
    if (!pais || pais === 'BR') return;

    url.pathname = '/lp-dl';
    url.searchParams.delete('pais');
    return Response.redirect(url.toString(), 302);
  } catch (_) {
    return; // qualquer erro: segue para a home normal
  }
}
