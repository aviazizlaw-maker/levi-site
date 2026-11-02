/* Sends a tool's result and the visitor's contact details to the lawyer, only after explicit consent. */
(function () {
  document.querySelectorAll('.lb-form').forEach(function (f) {
    var C = JSON.parse(f.dataset.cfg), st = f.querySelector('.lb-status'), btn = f.querySelector('button[type=submit]');
    function say(m, bad) { st.textContent = m; st.classList.toggle('bad', !!bad); }
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var summary = typeof window.leadSummary === 'function' ? window.leadSummary() : '';
      var d = { tool: C.tool, lang: C.lang, name: f.name.value.trim(), phone: f.phone.value.trim(), email: f.email.value.trim(), note: f.note.value, consent: f.consent.checked, website: f.website.value, summary: summary };
      var err = !summary ? 'summary' : d.name.length < 2 ? 'name' : d.phone.replace(/\D/g, '').length < 9 ? 'phone' : !d.consent ? 'consent' : '';
      if (err) { say(C.err[err], true); return; }
      btn.disabled = true; btn.textContent = C.sending; say('');
      fetch(C.api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(d) })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (x) { if (!x.ok || !x.j.ok) { say(C.err[x.j.error] || C.err.net, true); return; } f.hidden = true; f.parentNode.querySelector('.fs-done').hidden = false; })
        .catch(function () { say(C.err.net, true); })
        .then(function () { btn.disabled = false; btn.textContent = C.send; });
    });
  });
})();
