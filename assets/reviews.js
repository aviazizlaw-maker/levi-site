/* Client reviews: list from api/review.php, and the review form. */
(function () {
  var cfg = document.getElementById('rv-i18n'); if (!cfg) return;
  var L = JSON.parse(cfg.textContent);
  var df = new Intl.DateTimeFormat(L.locale, { month: 'long', year: 'numeric' });

  function card(r) {
    var f = document.createElement('figure'); f.className = 'review rv-card';
    var s = document.createElement('span'); s.className = 'stars'; s.setAttribute('aria-label', r.rating + '/5');
    s.textContent = '★★★★★'.slice(0, r.rating) ; var e = document.createElement('span'); e.className = 'off'; e.textContent = '★★★★★'.slice(r.rating); s.appendChild(e);
    var q = document.createElement('blockquote'); var p = document.createElement('p'); p.dir = 'auto'; p.textContent = r.text; q.appendChild(p);
    var c = document.createElement('figcaption'); var b = document.createElement('b'); b.dir = 'auto'; b.textContent = r.name; c.appendChild(b);
    var d = new Date(r.date + 'T12:00:00'); if (!isNaN(d)) c.appendChild(document.createTextNode(df.format(d)));
    f.appendChild(s); f.appendChild(q); f.appendChild(c); return f;
  }
  var lists = document.querySelectorAll('.rv-list');
  function render(items) {
    lists.forEach(function (el) {
      var lim = +el.dataset.limit || 6; el.innerHTML = '';
      if (!items.length) { var p = document.createElement('p'); p.className = 'rv-empty'; p.textContent = L.empty; el.appendChild(p); return; }
      items.slice(0, lim).forEach(function (r) { el.appendChild(card(r)); });
    });
  }
  var cache = [];
  if (lists.length) fetch(L.api, { cache: 'no-store' }).then(function (r) { return r.json(); })
    .then(function (j) { cache = j.reviews || []; render(cache); }).catch(function () { lists.forEach(function (el) { el.closest('.rv-home') && (el.closest('.rv-home').hidden = true); }); });

  var form = document.querySelector('.rv-form'); if (!form) return;
  var status = form.querySelector('.rv-status'), btn = form.querySelector('button[type=submit]'), count = form.querySelector('.rv-count');
  form.text.addEventListener('input', function () { count.textContent = form.text.value.length + '/800'; });
  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var rating = (form.querySelector('input[name=rating]:checked') || {}).value;
    var data = { name: form.name.value.trim(), text: form.text.value.trim(), rating: +rating || 0, consent: form.consent.checked, website: form.website.value, lang: L.lang };
    var err = !data.rating ? 'rating' : data.name.length < 2 ? 'name' : data.text.length < 10 ? 'text' : !data.consent ? 'consent' : '';
    if (err) { say(L.err[err], true); return; }
    btn.disabled = true; btn.textContent = L.sending; say('', false);
    fetch(L.api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (!x.ok || !x.j.ok) { say(L.err[x.j.error] || L.err.net, true); return; }
        say(L.ok, false); form.reset(); count.textContent = '0/800';
        if (x.j.review) { cache.unshift(x.j.review); render(cache); }
      })
      .catch(function () { say(L.err.net, true); })
      .then(function () { btn.disabled = false; btn.textContent = L.send; });
  });
  function say(t, bad) { status.textContent = t; status.classList.toggle('bad', !!bad); }
})();
