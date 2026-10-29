(function () {
  var KEY = 'lastArt', last = null;
  function get() { try { return sessionStorage.getItem(KEY); } catch (e) { return null; } }
  var here = document.body.getAttribute('data-art');
  if (here) { try { sessionStorage.setItem(KEY, here); } catch (e) {} }
  last = get();

  // HOME / close links return to the artwork you were last looking at.
  [].forEach.call(document.querySelectorAll('[data-nav="home"],[data-close]'), function (a) {
    if (last) a.setAttribute('href', last);
  });
  // Mark the current piece in the Gallery grid.
  [].forEach.call(document.querySelectorAll('.tile[data-path]'), function (t) {
    if (t.getAttribute('data-path') === last) t.classList.add('current');
  });

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
