// Layouts, matching the breakpoints in style.css. "Phone" is anything that isn't a wide landscape screen or a
// tablet standing up (phones turned sideways included).
var MQ = {
  wide: matchMedia('(min-width: 1000px) and (orientation: landscape)'),
  tall: matchMedia('(min-width: 700px) and (orientation: portrait)'),
  touch: matchMedia('(hover: none)'),
  reduce: matchMedia('(prefers-reduced-motion: reduce)')
};
function isPhone() { return !MQ.wide.matches && !MQ.tall.matches; }

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
  // Home page on phones and tablets: the header stays at the top, and the floating double caret moves one
  // painting per press, landing its top edge just under the header:
  //  - a painting nudged only a little under the header (under a fifth of it, at most 96px) comes back into
  //    full view, so a small accidental scroll doesn't skip it;
  //  - otherwise the first painting whose top is below the header moves up to it (so a painting sitting fully
  //    in view mid-screen is the one that moves, not the one after it);
  //  - a painting taller than the screen is shown a screen at a time first;
  //  - at the bottom the carets turn to point up, and a press goes back to the top.
  // Two staggered columns (tablets standing up) have no shared rows, so there it moves one screen at a time.
  // Ordinary scrolling never snaps.
  var btn = document.querySelector('.pgdn'), head = document.querySelector('.top'), grid = document.querySelector('.home .grid');
  if (!btn || !head || !grid) return;
  var staggered = matchMedia('(min-width: 560px) and (orientation: portrait)');
  var tiles = grid.querySelectorAll('.tile'), pending = null, pendingTimer = 0;
  var TOL = 2, NUDGE_SHARE = 0.2, NUDGE_MAX = 96, AT_BOTTOM = 4, TALL_EXTRA = 48, OVERLAP = 0.85;
  btn.hidden = false;
  function maxScroll() { return document.documentElement.scrollHeight - innerHeight; }
  function atBottom() { return scrollY >= maxScroll() - AT_BOTTOM; }
  function nudgeLimit(h) { return Math.min(NUDGE_MAX, h * NUDGE_SHARE); }
  // Where the next press goes, measured from scroll position st (the target of a scroll still under way,
  // so quick repeated presses keep moving forward).
  function target(st) {
    var h = head.offsetHeight, max = maxScroll(), view = innerHeight - h, line = st + h;
    if (staggered.matches) return Math.min(st + view, max);
    var list = [].map.call(tiles, function (el) {
      var r = el.getBoundingClientRect(), top = r.top + scrollY;
      return { top: top, bottom: top + r.height, h: r.height };
    }).sort(function (a, b) { return a.top - b.top; });
    var cover = list.filter(function (t) { return t.top < line - TOL && t.bottom > line + TOL; })[0];
    if (cover && line - cover.top <= nudgeLimit(cover.h)) return cover.top - h;
    var here = cover || list.filter(function (t) { return Math.abs(t.top - line) <= TOL; })[0];
    if (here && here.bottom > st + innerHeight + TALL_EXTRA) return Math.min(st + view * OVERLAP, here.bottom - innerHeight, max);
    var next = list.filter(function (t) { return t.top > line + TOL; })[0];
    return next ? Math.min(next.top - h, max) : max;
  }
  function check() {
    var up = atBottom();
    btn.classList.toggle('up', up);
    btn.setAttribute('aria-label', up ? 'Back to the top' : 'Next painting');
    head.classList.toggle('under', scrollY > 1);
    if (pending !== null && Math.abs(scrollY - pending) < 2) pending = null;
  }
  btn.addEventListener('click', function () {
    var to = pending === null && atBottom() ? 0 : target(pending === null ? scrollY : pending);
    pending = to;
    clearTimeout(pendingTimer);
    pendingTimer = setTimeout(function () { pending = null; }, 1200);
    scrollTo({ top: to, behavior: MQ.reduce.matches ? 'auto' : 'smooth' });
  });
  // A finger or wheel takes over from a scroll the button started.
  ['touchstart', 'wheel'].forEach(function (t) { addEventListener(t, function () { pending = null; }, { passive: true }); });
  addEventListener('scroll', check, { passive: true });
  addEventListener('resize', check);
  check();
})();

(function () {
  // Artwork pages on phones and touch screens: drag the painting sideways to bring in the previous / next one
  // (they wait either side of the frame), or tap a caret. Past a fifth of the width, or with a quick flick,
  // the strip slides the rest of the way and the next page opens; otherwise it springs back.
  // On phones the carets stay hidden: pressing and holding the painting fades them in (.show) until 2.5s after
  // letting go, a quick swipe never shows them, and the first painting opened in a visit shows them briefly.
  // Phones also size the frame to each painting (style.css), so while dragging the frame grows or shrinks
  // toward the incoming painting's size, and by the time the next page opens everything is already where that
  // page puts it: only the words and the wall colour change.
  var frame = document.querySelector('.frame'), track = frame && frame.querySelector('.track'), chips = frame && frame.querySelector('.chips');
  if (!track || !chips) return;
  var HOLD = 330, LINGER = 2500, HINT_AFTER = 450, HINT_FOR = 1400, SLIDE = 300, EASE = 'cubic-bezier(.2,.7,.2,1)', CAPTION_GONE = 0.4, OPEN_KEY = 'pbp-open';
  var start = null, dx = 0, dragging = false, going = false, held = false, holdTimer = 0, hideTimer = 0;
  function arrows(ms) {
    clearTimeout(hideTimer);
    frame.classList.add('show');
    if (ms) hideTimer = setTimeout(function () { frame.classList.remove('show'); }, ms);
  }
  function arrowsOff(ms) { clearTimeout(hideTimer); hideTimer = setTimeout(function () { frame.classList.remove('show'); }, ms); }
  if (isPhone()) {
    var seen = true;
    try { seen = sessionStorage.getItem('pbp-arrows') === '1'; sessionStorage.setItem('pbp-arrows', '1'); } catch (_) {}
    if (!seen) setTimeout(function () { arrows(HINT_FOR); }, HINT_AFTER);
  }
  var sides = track.querySelectorAll('.side'), panel = document.querySelector('.panel'), h0 = 0, settle = 0;
  function hangs() { return isPhone() && sides.length === 2 && panel; }
  // The frame height style.css gives a painting of this shape: the painting at full width plus its margin
  // (the slides' padding) all round, within the room there is and no less than the frame's min-height. The margin
  // and minimum are read from the page, so changing them in style.css keeps swipes landing exactly.
  function frameFor(ar) {
    var main = frame.parentNode, cs = getComputedStyle(main), mat = 2 * parseFloat(getComputedStyle(sides[0]).paddingLeft);
    var room = main.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - (panel.classList.contains('open') ? 0 : panel.offsetHeight);
    return Math.max(parseFloat(getComputedStyle(frame).minHeight) || 0, Math.min(room, (frame.clientWidth - mat) / ar + mat));
  }
  function reshape(x, animate) {
    if (!hangs()) return;
    clearTimeout(settle);
    if (!h0) h0 = frame.offsetHeight;
    var side = x < 0 ? sides[1] : sides[0], t = Math.min(1, Math.abs(x) / frame.clientWidth);
    frame.style.transition = animate ? 'height ' + SLIDE + 'ms ' + EASE : 'none';
    frame.style.height = (x ? h0 + (frameFor(Number(side.getAttribute('data-ar'))) - h0) * t : h0) + 'px';
    // The words belong to the painting leaving, so they fade out (gone CAPTION_GONE of the way across), open or
    // closed; the next page's fade in with that page. The handle and the opened panel itself stay, since the
    // next page has the same ones in the same place.
    // (--words, style.css: the title, date and the handle under them go together.)
    panel.classList.toggle('easing', !!animate);
    if (x) panel.style.setProperty('--words', Math.max(0, 1 - t / CAPTION_GONE));
    else panel.style.removeProperty('--words');
    // Sprung back: hand the height back to the stylesheet.
    if (!x) settle = setTimeout(function () {
      frame.style.height = frame.style.transition = '';
      panel.classList.remove('easing');
      h0 = 0;
    }, animate ? SLIDE : 0);
  }
  function place(x, animate) {
    track.style.transition = animate ? 'transform ' + SLIDE + 'ms ' + EASE : 'none';
    track.style.transform = x ? 'translateX(calc(-100% + ' + x + 'px))' : '';
    reshape(x, animate);
  }
  function go(dir) {
    var a = chips.querySelector('a[rel=' + (dir > 0 ? 'next' : 'prev') + ']');
    if (going || !a) return;
    going = true;
    // Swiping with the details open on a phone keeps them open on the next page (read by the details script),
    // unless that piece is in progress and has none: then they slide closed on the way.
    if (isPhone() && panel && panel.classList.contains('open')) {
      if (a.hasAttribute('data-still')) panel.dispatchEvent(new CustomEvent('pbp-close'));
      else try { sessionStorage.setItem(OPEN_KEY, a.pathname); } catch (_) {}
    }
    if (MQ.reduce.matches) { location.href = a.href; return; }
    place(-dir * frame.clientWidth, true);
    setTimeout(function () { location.href = a.href; }, SLIDE);
  }
  // The painting can always be swiped; on phones the opened details can be too (the caption alone can't).
  // el is whichever of the two the finger started on.
  function down(el, e) {
    dragging = false;
    // Swiping works on phones and on any touch screen (tablets turned sideways); not with a mouse on desktop.
    if ((MQ.wide.matches && !MQ.touch.matches) || going || !e.isPrimary || e.button > 0 || e.target.closest('.chips')) return;
    start = { x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId, el: el };
    dx = 0;
    held = false;
    clearTimeout(holdTimer);
    if (isPhone() && el === frame) holdTimer = setTimeout(function () { held = true; arrows(0); }, HOLD);
  }
  function move(e) {
    if (!start || e.pointerId !== start.id) return;
    var mx = e.clientX - start.x, my = e.clientY - start.y;
    if (!dragging) {
      if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
      clearTimeout(holdTimer);
      if (Math.abs(mx) < 8) return;
      if (Math.abs(my) > Math.abs(mx)) { start = null; if (held) arrowsOff(LINGER); return; }
      dragging = true;
      try { start.el.setPointerCapture(e.pointerId); } catch (_) {}
    }
    dx = mx;
    place(dx, false);
  }
  function up(e) {
    if (!start || e.pointerId !== start.id) return;
    var fast = Math.abs(dx) / Math.max(1, Date.now() - start.t) > 0.5;
    start = null;
    clearTimeout(holdTimer);
    if (held) arrowsOff(LINGER);
    if (!dragging) return;
    if (Math.abs(dx) > frame.clientWidth / 5 || (fast && Math.abs(dx) > 30)) go(dx < 0 ? 1 : -1);
    else place(0, true);
  }
  function cancel() {
    start = null;
    clearTimeout(holdTimer);
    if (held) arrowsOff(LINGER);
    if (dragging) place(0, true);
  }
  frame.addEventListener('pointerdown', function (e) { down(frame, e); });
  if (panel) panel.addEventListener('pointerdown', function (e) { if (isPhone() && panel.classList.contains('open')) down(panel, e); });
  [frame, panel].forEach(function (el) {
    if (!el) return;
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', cancel);
  });
  // A swipe across the details isn't a tap on them (the close caret, say).
  if (panel) panel.addEventListener('click', function (e) { if (dragging) { e.preventDefault(); e.stopPropagation(); } }, true);
  // A long press shows the carets, not the phone's own image menu.
  frame.addEventListener('contextmenu', function (e) { if (isPhone()) e.preventDefault(); });
  frame.addEventListener('dragstart', function (e) { e.preventDefault(); });
  // A drag or a long press isn't a tap: don't open the photo viewer after one.
  frame.addEventListener('click', function (e) {
    if (e.target.closest('.chips')) return;
    if (dragging || held) { e.preventDefault(); e.stopPropagation(); }
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
  // Artwork pages on phones: only a small caption shows under the painting. Tapping it (an invisible button
  // covers it) or pulling it up raises the whole panel over the painting with the full description; the
  // down caret, Escape, a tap outside or a pull down lowers it.
  // (Tablets standing up use the slim bar below instead; wide screens show the whole description.)
  var panel = document.querySelector('.panel'), about = panel && panel.querySelector('.about'), less = panel && panel.querySelector('.less');
  if (!about || !less) return;
  var PULL_OPEN = 24, PULL_CLOSE = 80, FLICK = 0.5, START = 6, CLOSE_SLIDE = 280, phone = isPhone;
  function isOpen() { return panel.classList.contains('open'); }
  // Focus only follows the panel for keyboard users; after a tap or a pull it would leave a focus ring behind.
  function open(on, moveFocus) {
    if (!on) panel.classList.remove('instant');
    // The opened panel floats over the painting, so keep the caption's room below it: the painting stays put.
    if (on && !isOpen()) panel.parentNode.style.setProperty('--cap', panel.offsetHeight + 'px');
    panel.classList.toggle('open', on);
    if (!on) panel.scrollTop = 0;
    about.setAttribute('aria-expanded', String(on));
    less.setAttribute('aria-expanded', String(on));
    if (moveFocus) (on ? less : about).focus({ preventScroll: true });
    else if (panel.contains(document.activeElement)) document.activeElement.blur();
  }
  // A click with no taps behind it (detail 0) came from the keyboard.
  about.addEventListener('click', function (e) { if (phone()) open(true, e.detail === 0); });
  less.addEventListener('click', function (e) { if (phone()) open(false, e.detail === 0); });
  document.addEventListener('keydown', function (e) { if (phone() && e.key === 'Escape' && isOpen() && !document.querySelector('dialog[open]')) open(false, true); });
  document.addEventListener('click', function (e) { if (phone() && isOpen() && !panel.contains(e.target)) open(false, false); });

  // Pull the caption up to open. Pull the opened panel down from its top to close: it follows the finger, and
  // goes past PULL_CLOSE px or with a downward flick; otherwise it springs back. While it's being pulled the page itself
  // doesn't move. (Touch events, not pointer events: those stop the moment the panel starts scrolling.)
  var y0 = null, x0 = 0, t0 = 0, dy = 0, pulling = false;
  function slide(y, animate) {
    panel.style.transition = animate ? 'translate ' + CLOSE_SLIDE + 'ms cubic-bezier(.32,.72,0,1)' : 'none';
    panel.style.translate = y ? '0 ' + y + 'px' : '';
  }
  panel.addEventListener('touchstart', function (e) {
    y0 = phone() ? e.touches[0].clientY : null;
    x0 = e.touches[0].clientX; t0 = Date.now(); dy = 0; pulling = false;
  }, { passive: true });
  panel.addEventListener('touchmove', function (e) {
    if (y0 === null) return;
    dy = e.touches[0].clientY - y0;
    if (!isOpen()) {
      if (dy < -PULL_OPEN) { y0 = null; open(true, false); }
      return;
    }
    if (!pulling) {
      // Sideways is a swipe to the next painting (the swipe script), not a pull.
      if (Math.abs(e.touches[0].clientX - x0) > Math.abs(dy)) { if (Math.abs(dy) > START || Math.abs(e.touches[0].clientX - x0) > START) y0 = null; return; }
      if (dy > START && panel.scrollTop <= 0) pulling = true;
      // Moving up, or the description is scrolled down: let it scroll instead.
      else { if (Math.abs(dy) > START) y0 = null; return; }
    }
    e.preventDefault();
    slide(Math.max(0, dy), false);
  }, { passive: false });
  function release() {
    if (!pulling) { y0 = null; return; }
    pulling = false; y0 = null;
    var flick = dy / Math.max(1, Date.now() - t0) > FLICK && dy > PULL_OPEN;
    // Closing shows the caption straight away, the same as the close caret.
    if (dy > PULL_CLOSE || flick) { slide(0, false); open(false, false); }
    else slide(0, true);
  }
  panel.addEventListener('touchend', release, { passive: true });
  panel.addEventListener('touchcancel', release, { passive: true });

  // Swiping toward a piece with no details: slide them closed along with the swipe.
  panel.addEventListener('pbp-close', function () {
    slide(panel.offsetHeight, true);
    setTimeout(function () { open(false, false); slide(0, false); }, CLOSE_SLIDE);
  });

  // Arrived by swiping with the details open: open them again at once, already up (no rising), so only the
  // words change. The opened panel keeps room for four lines of description (style.css), so it's the same
  // height from piece to piece.
  var carried = false;
  try { carried = sessionStorage.getItem('pbp-open') === location.pathname; sessionStorage.removeItem('pbp-open'); } catch (_) {}
  if (carried && phone()) { panel.classList.add('instant'); open(true, false); }
})();

(function () {
  // Artwork pages on tablets standing up: the painting fills the screen above a slim bar. "About this piece"
  // grows the bar into the full details while the frame above shrinks by the same amount, on the same curve
  // (style.css, via --ph), so the gaps around both never change. The close caret (or Escape) shrinks it back.
  // Open or closed carries over to the next painting, so swiping through keeps the details showing.
  var piece = document.querySelector('main.piece'), panel = piece && piece.querySelector('.panel');
  var about = panel && panel.querySelector('.about'), less = panel && panel.querySelector('.less');
  if (!about || !less) return;
  var tall = MQ.tall, reduce = MQ.reduce;
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
  var reduce = MQ.reduce;
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
  var wide = MQ.wide, MIN = 26;
  function fit() {
    h.style.fontSize = '';
    if (!wide.matches) return;
    var cs = getComputedStyle(h), size = parseFloat(cs.fontSize);
    var pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    h.style.whiteSpace = 'nowrap';
    var need = h.scrollWidth - pad, room = h.clientWidth - pad;
    h.style.whiteSpace = '';
    if (need > room) {
      // Text width doesn't scale exactly with font size (kerning, sub-pixel rounding), so check whether it
      // still wraps onto a second line and nudge it down until it doesn't.
      size = Math.floor(size * room / need * 10) / 10;
      var wraps = function () { return h.getBoundingClientRect().height > parseFloat(getComputedStyle(h).lineHeight) * 1.5; };
      h.style.fontSize = Math.max(MIN, size) + 'px';
      while (size > MIN && wraps()) { size -= 0.2; h.style.fontSize = Math.max(MIN, size) + 'px'; }
    }
  }
  addEventListener('resize', fit);
  if (document.fonts) document.fonts.ready.then(fit);
  fit();
})();
