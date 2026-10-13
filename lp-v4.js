/* LP v4 — interações. Cada bloco é protegido: se algo falhar (ou o navegador do Instagram/Facebook
   não suportar), o resto da página continua funcionando. Sem barra fixa de CTA (removida de propósito). */
(function () {
  function seguro(nome, fn) { try { fn(); } catch (e) { try { console.warn('[lp-v4] ' + nome, e); } catch (_) { } } }
  var reduzMovimento = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  function evento(nome) { try { if (typeof window.clarity === 'function') window.clarity('event', nome); } catch (_) { } }

  /* ---------- carrossel de avaliações ---------- */
  seguro('avaliacoes', function () {
    var track = document.querySelector('.depoimentos__track');
    var controls = document.querySelector('.depoimentos__controls');
    if (!track || !controls) return;
    var cards = Array.prototype.slice.call(track.querySelectorAll('.depoimentos__card'));
    var prev = controls.querySelector('[data-review-prev]');
    var next = controls.querySelector('[data-review-next]');
    var count = controls.querySelector('[data-review-count]');
    if (!cards.length || !prev || !next || !count) return;
    controls.hidden = false;
    var agendado = false;
    function pos(card) { return card.offsetLeft - cards[0].offsetLeft; }
    function atual() {
      var melhor = 0;
      cards.forEach(function (c, i) { if (Math.abs(pos(c) - track.scrollLeft) < Math.abs(pos(cards[melhor]) - track.scrollLeft)) melhor = i; });
      return melhor;
    }
    function atualiza() {
      agendado = false;
      var i = atual();
      var visiveis = cards.filter(function (c) {
        return Math.min(pos(c) + c.offsetWidth, track.scrollLeft + track.clientWidth) - Math.max(pos(c), track.scrollLeft) >= c.offsetWidth / 2;
      });
      var ultimo = visiveis.length ? cards.indexOf(visiveis[visiveis.length - 1]) : i;
      count.textContent = ultimo > i ? (i + 1) + '–' + (ultimo + 1) + ' de ' + cards.length : (i + 1) + ' de ' + cards.length;
      prev.disabled = track.scrollLeft <= 2;
      next.disabled = track.scrollLeft >= track.scrollWidth - track.clientWidth - 2;
    }
    function mover(d) {
      var i = Math.max(0, Math.min(cards.length - 1, atual() + d));
      track.scrollTo({ left: pos(cards[i]), behavior: reduzMovimento.matches ? 'auto' : 'smooth' });
    }
    prev.addEventListener('click', function () { mover(-1); });
    next.addEventListener('click', function () { mover(1); });
    track.addEventListener('keydown', function (e) {
      if (e.target !== track || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
      e.preventDefault(); mover(e.key === 'ArrowRight' ? 1 : -1);
    });
    track.addEventListener('scroll', function () { if (!agendado) { agendado = true; requestAnimationFrame(atualiza); } }, { passive: true });
    if (window.ResizeObserver) new ResizeObserver(atualiza).observe(track);
    atualiza();
  });

  /* ---------- módulos: lista expansível (no computador abre todos de início) ---------- */
  seguro('modulos', function () {
    var itens = Array.prototype.slice.call(document.querySelectorAll('details.aprender__acc'));
    if (!itens.length) return;
    if (window.matchMedia && window.matchMedia('(min-width: 901px)').matches) itens.forEach(function (d) { d.open = true; });
    itens.forEach(function (d) {
      d.addEventListener('toggle', function () { if (d.open) evento('modulo_' + d.getAttribute('data-modulo') + '_aberto'); });
    });
  });

  /* ---------- links âncora: dão um retorno visível ao toque (antes o Clarity os lia como "clique morto") ---------- */
  seguro('ancoras', function () {
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a[href^="#"]') : null;
      if (!a) return;
      var id = a.getAttribute('href').slice(1);
      var alvo = id ? document.getElementById(id) : null;
      if (!alvo) return;
      var marca = alvo.querySelector('.preco__card, h2') || alvo;
      marca.classList.remove('alvo-pulso');
      void marca.offsetWidth;
      marca.classList.add('alvo-pulso');
      setTimeout(function () { marca.classList.remove('alvo-pulso'); }, 1200);
      evento('ancora_' + id);
    }, true);
  });
})();
