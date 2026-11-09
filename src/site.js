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
  // Artwork pages on phones and touch screens: drag the painting sideways to bring in the previous / next one
  // (they wait either side of the frame), or tap a caret. Past a fifth of the width, or with a quick flick,
  // the strip slides the rest of the way and the next page opens; otherwise it springs back.
  var frame = document.querySelector('.frame'), track = frame && frame.querySelector('.track'), chips = frame && frame.querySelector('.chips');
  if (!track || !chips) return;
  var narrow = matchMedia('not all and (min-width: 1000px) and (orientation: landscape), (hover: none)'), reduce = matchMedia('(prefers-reduced-motion: reduce)');
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
    go(a.getAttribute('rel') === 'next' ? 1 : -1);
  });
  // Coming back via the browser's Back button can restore the page mid-slide, so reset it.
  addEventListener('pageshow', function () {
    going = false;
    place(0, false);
  });
})();

(function () {
  // Artwork pages on phones: the description stops after four lines with "…" and a down caret.
  // Tapping it raises the whole panel over the painting to show everything; the up caret (or Escape) lowers it.
  // (Tablets standing up use the slim bar below instead; wide screens show the whole description.)
  var panel = document.querySelector('.panel'), more = panel && panel.querySelector('.more'), less = panel && panel.querySelector('.less');
  if (!more || !less) return;
  var text = panel.querySelector('.desc-text'), narrow = matchMedia('not all and (min-width: 1000px) and (orientation: landscape)');
  var tall = matchMedia('(min-width: 700px) and (orientation: portrait)');
  function phone() { return narrow.matches && !tall.matches; }
  function fit() {
    panel.classList.remove('clamp');
    if (!phone() || panel.classList.contains('open')) return;
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
  less.addEventListener('click', function () { if (phone()) open(false); });
  document.addEventListener('keydown', function (e) { if (phone() && e.key === 'Escape' && panel.classList.contains('open')) open(false); });
  document.addEventListener('click', function (e) { if (phone() && panel.classList.contains('open') && !panel.contains(e.target)) open(false); });
  addEventListener('resize', fit);
  if (document.fonts) document.fonts.ready.then(fit);
  fit();
})();

(function () {
  // Artwork pages on tablets standing up: the painting fills the screen above a slim bar. "About this piece"
  // grows the bar into the full details while the frame above shrinks by the same amount, on the same curve
  // (style.css, via --ph), so the gaps around both never change. The close caret (or Escape) shrinks it back.
  // Open or closed carries over to the next painting, so swiping through keeps the details showing.
  var piece = document.querySelector('main.piece'), panel = piece && piece.querySelector('.panel');
  var about = panel && panel.querySelector('.about'), less = panel && panel.querySelector('.less');
  if (!about || !less) return;
  var tall = matchMedia('(min-width: 700px) and (orientation: portrait)'), reduce = matchMedia('(prefers-reduced-motion: reduce)');
  var KEY = 'pbp-details', bar = 84, timer = 0, first = true;
  function remember(on) { try { if (on) sessionStorage.setItem(KEY, '1'); else sessionStorage.removeItem(KEY); } catch (_) {} }
  function remembered() { try { return sessionStorage.getItem(KEY) === '1'; } catch (_) { return false; } }
  function isOpen() { return panel.classList.contains('open'); }
  // Never taller than leaves the painting 320px; a longer description scrolls inside the panel.
  function fullHeight() { return Math.max(bar, Math.min(panel.scrollHeight, innerHeight - 88 - 24 - 320)); }
  function set(on, animate) {
    clearTimeout(timer);
    piece.classList.toggle('anim', animate && !reduce.matches);
    if (on) {
      panel.classList.add('full');
      piece.style.setProperty('--ph', fullHeight() + 'px');
      panel.classList.add('open');
    } else {
      panel.classList.remove('open');
      panel.scrollTop = 0;
      piece.style.setProperty('--ph', bar + 'px');
      timer = setTimeout(function () { if (!isOpen()) panel.classList.remove('full'); }, animate && !reduce.matches ? 500 : 0);
    }
    about.setAttribute('aria-expanded', String(on));
    less.setAttribute('aria-expanded', String(on));
  }
  // Measure the slim bar (taller on extra-photo pages, which add a "Return to" link), then size both.
  function layout() {
    clearTimeout(timer);
    piece.classList.remove('anim');
    if (!tall.matches) {
      panel.classList.remove('full');
      piece.style.removeProperty('--ph');
      return;
    }
    var on = isOpen() || (first && remembered());
    first = false;
    panel.classList.remove('open', 'full');
    piece.style.setProperty('--ph', '0px');
    bar = Math.max(84, panel.scrollHeight);
    if (on) set(true, false);
    else piece.style.setProperty('--ph', bar + 'px');
  }
  about.addEventListener('click', function () {
    if (!tall.matches) return;
    set(true, true);
    remember(true);
    less.focus({ preventScroll: true });
  });
  less.addEventListener('click', function () {
    if (!tall.matches) return;
    set(false, true);
    remember(false);
    about.focus({ preventScroll: true });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape' || !tall.matches || !isOpen() || document.querySelector('dialog[open]')) return;
    set(false, true);
    remember(false);
    about.focus({ preventScroll: true });
  });
  addEventListener('resize', layout);
  if (document.fonts) document.fonts.ready.then(layout);
  layout();
})();

(function () {
  // Home page on wide touch screens (tablets turned sideways): the round double carets either side move the
  // strip one screen at a time, and each fades out at its end.
  var grid = document.querySelector('.home .grid'), btns = document.querySelectorAll('.spage');
  if (!grid || !btns.length) return;
  var reduce = matchMedia('(prefers-reduced-motion: reduce)');
  function check() {
    var max = grid.scrollWidth - grid.clientWidth;
    [].forEach.call(btns, function (b) {
      var done = b.getAttribute('data-dir') === '1' ? grid.scrollLeft >= max - 4 : grid.scrollLeft <= 4;
      b.classList.toggle('done', done);
      b.tabIndex = done ? -1 : 0;
    });
  }
  [].forEach.call(btns, function (b) {
    b.hidden = false;
    b.addEventListener('click', function () {
      grid.scrollBy({ left: Number(b.getAttribute('data-dir')) * grid.clientWidth, behavior: reduce.matches ? 'auto' : 'smooth' });
    });
  });
  grid.addEventListener('scroll', check, { passive: true });
  addEventListener('resize', check);
  check();
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

(function () {
  // Artwork pages on desktop: a title too long for one line in the side panel shrinks just enough to fit,
  // down to 26px (below that it wraps). Measured in the browser, so it works for any title.
  var h = document.querySelector('.piece h1');
  if (!h) return;
  var wide = matchMedia('(min-width: 1000px) and (orientation: landscape)'), MIN = 26;
  function fit() {
    h.style.fontSize = '';
    if (!wide.matches) return;
    var cs = getComputedStyle(h), size = parseFloat(cs.fontSize);
    var pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    h.style.whiteSpace = 'nowrap';
    var need = h.scrollWidth - pad, room = h.clientWidth - pad;
    h.style.whiteSpace = '';
    if (need > room) h.style.fontSize = Math.max(MIN, Math.floor(size * room / need * 10) / 10) + 'px';
  }
  addEventListener('resize', fit);
  if (document.fonts) document.fonts.ready.then(fit);
  fit();
})();
