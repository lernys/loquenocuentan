// Filtro por observación en las páginas de partido y de tema. Sin JavaScript, la página se lee entera.
document.querySelectorAll('[data-filter]').forEach(function (bar) {
  bar.hidden = false;
  var items = [].slice.call(document.querySelectorAll('.item[data-f]'));
  var blocks = [].slice.call(document.querySelectorAll('.block'));
  var clear = document.createElement('button');
  clear.type = 'button'; clear.className = 'clear'; clear.textContent = 'Quitar filtro'; clear.hidden = true;
  bar.appendChild(clear);
  function apply(f) {
    bar.querySelectorAll('.chip').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.f === f)); });
    items.forEach(function (it) { it.hidden = !!f && it.dataset.f.split(' ').indexOf(f) < 0; });
    blocks.forEach(function (bl) { bl.hidden = !!f && !bl.querySelector('.item:not([hidden])'); });
    clear.hidden = !f;
  }
  bar.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b === clear) return apply(null);
    apply(b.getAttribute('aria-pressed') === 'true' ? null : b.dataset.f);
  });
});
