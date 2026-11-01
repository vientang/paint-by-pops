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
  // Home page on phones and tablets: the floating double caret scrolls down one screen per press,
  // and fades out once the bottom is in view. Ordinary scrolling never snaps.
  var btn = document.querySelector('.pgdn');
  if (!btn) return;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)');
  btn.hidden = false;
  function check() {
    var done = innerHeight + scrollY >= document.documentElement.scrollHeight - 4;
    btn.classList.toggle('done', done);
    btn.tabIndex = done ? -1 : 0;
  }
  btn.addEventListener('click', function () { scrollBy({ top: innerHeight, behavior: reduce.matches ? 'auto' : 'smooth' }); });
  addEventListener('scroll', check, { passive: true });
  addEventListener('resize', check);
  check();
})();

(function () {
  // Artwork pages on phones and tablets: drag the painting sideways to bring in the previous / next one
  // (they wait either side of the frame), or tap a caret. Past a fifth of the width, or with a quick flick,
  // the strip slides the rest of the way and the next page opens; otherwise it springs back.
  var frame = document.querySelector('.frame'), track = frame && frame.querySelector('.track'), chips = frame && frame.querySelector('.chips');
  if (!track || !chips) return;
  var narrow = matchMedia('(max-width: 999px)'), reduce = matchMedia('(prefers-reduced-motion: reduce)');
  var start = null, dx = 0, dragging = false, going = false;
  function place(x, animate) {
    track.style.transition = animate ? 'transform .3s cubic-bezier(.2,.7,.2,1)' : 'none';
    track.style.transform = x ? 'translateX(calc(-100% + ' + x + 'px))' : '';
  }
  function go(dir) {
    var a = chips.querySelector('a[rel=' + (dir > 0 ? 'next' : 'prev') + ']');
    if (going || !a) return;
    going = true;
    if (reduce.matches) { location.href = a.href; return; }
    place(-dir * frame.clientWidth, true);
    setTimeout(function () { location.href = a.href; }, 300);
  }
  frame.addEventListener('pointerdown', function (e) {
    dragging = false;
    if (!narrow.matches || going || !e.isPrimary || e.button > 0 || e.target.closest('.chips')) return;
    start = { x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId };
    dx = 0;
  });
  frame.addEventListener('pointermove', function (e) {
    if (!start || e.pointerId !== start.id) return;
    var mx = e.clientX - start.x, my = e.clientY - start.y;
    if (!dragging) {
      if (Math.abs(mx) < 8) return;
      if (Math.abs(my) > Math.abs(mx)) { start = null; return; }
      dragging = true;
      try { frame.setPointerCapture(e.pointerId); } catch (_) {}
    }
    dx = mx;
    place(dx, false);
  });
  frame.addEventListener('pointerup', function (e) {
    if (!start || e.pointerId !== start.id) return;
    var fast = Math.abs(dx) / Math.max(1, Date.now() - start.t) > 0.5;
    start = null;
    if (!dragging) return;
    if (Math.abs(dx) > frame.clientWidth / 5 || (fast && Math.abs(dx) > 30)) go(dx < 0 ? 1 : -1);
    else place(0, true);
  });
  frame.addEventListener('pointercancel', function () { start = null; if (dragging) place(0, true); });
  frame.addEventListener('dragstart', function (e) { e.preventDefault(); });
  // A drag isn't a tap: don't open the photo viewer after one.
  frame.addEventListener('click', function (e) {
    if (dragging) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  chips.addEventListener('click', function (e) {
    var a = e.target.closest('a');
    if (!a) return;
    e.preventDefault();
    a.classList.add('pressed');
    go(a.getAttribute('rel') === 'next' ? 1 : -1);
  });
  // Coming back via the browser's Back button can restore the page mid-slide, so reset it.
  addEventListener('pageshow', function () {
    going = false;
    place(0, false);
    [].forEach.call(chips.querySelectorAll('.pressed'), function (b) { b.classList.remove('pressed'); });
  });
})();

(function () {
  // Artwork pages on phones and tablets: the description stops after three lines with "…" and a down caret.
  // Tapping it raises the whole panel over the painting to show everything; the up caret (or Escape) lowers it.
  var panel = document.querySelector('.panel'), more = panel && panel.querySelector('.more'), less = panel && panel.querySelector('.less');
  if (!more || !less) return;
  var text = panel.querySelector('.desc-text'), narrow = matchMedia('(max-width: 999px)');
  function fit() {
    panel.classList.remove('clamp');
    if (!narrow.matches || panel.classList.contains('open')) return;
    panel.classList.add('clamp');
    if (text.scrollHeight <= text.clientHeight + 1) panel.classList.remove('clamp');
  }
  function open(on) {
    panel.classList.toggle('open', on);
    more.setAttribute('aria-expanded', String(on));
    fit();
    (on ? less : more).focus();
  }
  more.addEventListener('click', function () { open(true); });
  less.addEventListener('click', function () { open(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && panel.classList.contains('open')) open(false); });
  document.addEventListener('click', function (e) { if (panel.classList.contains('open') && !panel.contains(e.target)) open(false); });
  addEventListener('resize', fit);
  if (document.fonts) document.fonts.ready.then(fit);
  fit();
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
