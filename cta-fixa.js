/* Barra fixa de CTA (só nesta variante): aparece depois que o usuário
   passa da segunda dobra (2x a altura da tela) e some se voltar ao topo. */
(function () {
  var barra = document.querySelector('.cta-fixa');
  if (!barra) return;
  var agendado = false;
  function checa() {
    agendado = false;
    var passou = window.scrollY >= window.innerHeight * 2;
    barra.classList.toggle('is-visible', passou);
  }
  window.addEventListener('scroll', function () {
    if (agendado) return;
    agendado = true;
    requestAnimationFrame(checa);
  }, { passive: true });
  checa();
})();
