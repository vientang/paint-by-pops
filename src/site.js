(function () {
  // Home page on desktop: a mouse wheel scrolls the sideways strip of paintings (trackpads already can).
  var grid = document.querySelector('.home .grid');
  if (!grid) return;
  grid.addEventListener('wheel', function (e) {
    if (grid.scrollWidth <= grid.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    e.preventDefault();
    grid.scrollLeft += e.deltaY;
  }, { passive: false });
})();

(function () {
  // Left / right arrow keys work like the caret buttons (artwork pages only, since only they have a pager).
  var pager = document.querySelector('.pager');
  if (!pager) return;
  document.addEventListener('keydown', function (e) {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (document.querySelector('dialog[open]') || (e.target.closest && e.target.closest('input,textarea,select,[contenteditable]'))) return;
    var rel = { ArrowLeft: 'prev', ArrowRight: 'next' }[e.key];
    var a = rel && pager.querySelector('a[rel=' + rel + ']');
    if (!a) return;
    e.preventDefault();
    if (pager.classList.contains('going')) return;
    // Flash the matching caret briefly so the key press reads as a button press, then go.
    pager.classList.add('going');
    a.classList.add('pressed');
    setTimeout(function () { location.href = a.href; }, 150);
  });
  // Coming back via the browser's Back button can restore the page mid-flash, so reset it.
  window.addEventListener('pageshow', function () {
    pager.classList.remove('going');
    [].forEach.call(pager.querySelectorAll('.pressed'), function (b) { b.classList.remove('pressed'); });
  });
})();

(function () {
  // Full-screen photo viewer (without JavaScript the photo just opens as a link).
  var dlg = document.getElementById('viewer');
  if (!dlg || !dlg.showModal) return;
  var img = dlg.querySelector('img'), box = dlg.querySelector('.vscroll'), hint = dlg.querySelector('[data-hint]');
  function setZoom(on) {
    box.classList.toggle('zoom', on);
    hint.textContent = on ? 'Tap photo to zoom out' : 'Tap photo to zoom in';
    if (on) { box.scrollLeft = (box.scrollWidth - box.clientWidth) / 2; box.scrollTop = (box.scrollHeight - box.clientHeight) / 2; }
  }
  [].forEach.call(document.querySelectorAll('a.photo'), function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      img.alt = a.querySelector('img').alt || '';
      img.src = a.getAttribute('data-large');
      setZoom(false);
      dlg.showModal();
    });
  });
  img.addEventListener('click', function () { setZoom(!box.classList.contains('zoom')); });
  dlg.querySelector('[data-vclose]').addEventListener('click', function () { dlg.close(); });
  dlg.addEventListener('close', function () { img.removeAttribute('src'); });
})();
