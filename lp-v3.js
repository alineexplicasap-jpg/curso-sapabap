/* Interações da LP v3. Cada bloco é independente e protegido: se um elemento não existir
   (ou o navegador do Instagram/Facebook não suportar algo), os outros continuam funcionando. */
(function () {
  function seguro(nome, fn) { try { fn(); } catch (e) { try { console.warn('[lp-v3] ' + nome, e); } catch (_) { } } }
  var reduzMovimento = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

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

  /* ---------- barra fixa de CTA (celular): aparece depois do topo e some na oferta e no rodapé ---------- */
  seguro('barra', function () {
    var barra = document.querySelector('.cta-fixa');
    var topo = document.querySelector('.hero');
    var oferta = document.querySelector('.preco__card');
    var rodape = document.querySelector('.footer-bar');
    if (!barra || !topo || !oferta || !rodape) return;
    var mq = window.matchMedia('(max-width: 900px)');
    var vistas = [];
    function atualiza() {
      var mostrar = mq.matches && topo.getBoundingClientRect().bottom <= 0 && vistas.indexOf(oferta) < 0 && vistas.indexOf(rodape) < 0;
      barra.classList.toggle('is-visible', mostrar);
      barra.setAttribute('aria-hidden', String(!mostrar));
      if ('inert' in barra) barra.inert = !mostrar;
    }
    if (window.IntersectionObserver) {
      var obs = new IntersectionObserver(function (entradas) {
        entradas.forEach(function (e) {
          var i = vistas.indexOf(e.target);
          if (e.isIntersecting && i < 0) vistas.push(e.target);
          if (!e.isIntersecting && i >= 0) vistas.splice(i, 1);
        });
        atualiza();
      });
      [topo, oferta, rodape].forEach(function (el) { obs.observe(el); });
    }
    window.addEventListener('scroll', function () { requestAnimationFrame(atualiza); }, { passive: true });
    if (mq.addEventListener) mq.addEventListener('change', atualiza); else if (mq.addListener) mq.addListener(atualiza);
    atualiza();
  });
})();
