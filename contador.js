/* Contador regressivo da página de upsell (/up-abap-ia).
   3 minutos a partir da primeira visita; o início fica salvo no navegador,
   então recarregar a página não zera o tempo. Ao chegar em 00:00 o relógio
   para e o bloco ganha a classe .is-esgotado (o CTA continua no ar). */
(function () {
  var DURACAO = 3 * 60;                 /* segundos */
  var CHAVE = '_aes_up_abap_ia_inicio';
  var relogios = document.querySelectorAll('[data-contador-tempo]');
  if (!relogios.length) return;

  var inicio = 0;
  try { inicio = parseInt(localStorage.getItem(CHAVE), 10) || 0; } catch (e) { }
  if (!inicio) {
    inicio = Date.now();
    try { localStorage.setItem(CHAVE, String(inicio)); } catch (e) { }
  }

  function dois(n) { return (n < 10 ? '0' : '') + n; }

  function tique() {
    var passado = Math.floor((Date.now() - inicio) / 1000);
    var resta = Math.max(0, DURACAO - passado);
    var texto = dois(Math.floor(resta / 60)) + ':' + dois(resta % 60);
    for (var i = 0; i < relogios.length; i++) relogios[i].textContent = texto;
    if (resta <= 0) {
      clearInterval(timer);
      var blocos = document.querySelectorAll('[data-contador]');
      for (var j = 0; j < blocos.length; j++) blocos[j].classList.add('is-esgotado');
    }
  }

  var timer = setInterval(tique, 1000);
  tique();
})();
