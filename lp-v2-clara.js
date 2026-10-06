/* Interações específicas da versão clara. */
(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const track = document.querySelector('.depoimentos__track');
  if (track) {
    const cards = [...track.querySelectorAll('.depoimentos__card')];
    const controls = document.querySelector('.depoimentos__controls');
    const prev = controls.querySelector('[data-review-prev]');
    const next = controls.querySelector('[data-review-next]');
    const count = controls.querySelector('[data-review-count]');
    controls.hidden = false;
    let scheduled = false;
    const offset = (card) => card.offsetLeft - cards[0].offsetLeft;
    const current = () => cards.reduce((best, card, index) =>
      Math.abs(offset(card) - track.scrollLeft) < Math.abs(offset(cards[best]) - track.scrollLeft) ? index : best, 0);
    const update = () => {
      scheduled = false;
      const index = current();
      const visible = cards.filter(card => Math.min(offset(card) + card.offsetWidth, track.scrollLeft + track.clientWidth) - Math.max(offset(card), track.scrollLeft) >= card.offsetWidth / 2);
      const last = cards.indexOf(visible[visible.length - 1]);
      count.textContent = last > index ? `${index + 1}–${last + 1} de ${cards.length}` : `${index + 1} de ${cards.length}`;
      prev.disabled = track.scrollLeft <= 2;
      next.disabled = track.scrollLeft >= track.scrollWidth - track.clientWidth - 2;
    };
    const move = (direction) => {
      const index = Math.max(0, Math.min(cards.length - 1, current() + direction));
      track.scrollTo({ left: offset(cards[index]), behavior: reducedMotion.matches ? 'instant' : 'smooth' });
    };
    prev.addEventListener('click', () => move(-1));
    next.addEventListener('click', () => move(1));
    track.addEventListener('keydown', event => {
      if (event.target !== track || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      move(event.key === 'ArrowRight' ? 1 : -1);
    });
    track.addEventListener('scroll', () => {
      if (!scheduled) { scheduled = true; requestAnimationFrame(update); }
    }, { passive: true });
    new ResizeObserver(update).observe(track);
    update();
  }

  const bar = document.querySelector('.cta-fixa');
  const hero = document.querySelector('.hero');
  const offer = document.querySelector('.preco__card');
  const footer = document.querySelector('.footer-bar');
  if (!bar || !hero || !offer || !footer) return;
  const mobile = window.matchMedia('(max-width: 900px)');
  const visibleSections = new Set();
  const updateBar = () => {
    const show = mobile.matches && hero.getBoundingClientRect().bottom <= 0 && !visibleSections.has(offer) && !visibleSections.has(footer);
    bar.classList.toggle('is-visible', show);
    bar.setAttribute('aria-hidden', String(!show));
    bar.inert = !show;
  };
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => entry.isIntersecting ? visibleSections.add(entry.target) : visibleSections.delete(entry.target));
    updateBar();
  });
  [hero, offer, footer].forEach(element => observer.observe(element));
  mobile.addEventListener('change', updateBar);
  updateBar();
})();
