/* Flight compensation simulator. Rules: Israeli Aviation Services Law 2012 (amounts 2026), EU261/UK261, Montreal 1999.
   Runs in the browser; nothing is sent unless the visitor confirms in the last step. */
(function () {
  var root = document.getElementById('fs'); if (!root) return;
  var L = JSON.parse(document.getElementById('fs-i18n').textContent);
  var f = root.querySelector('form');
  var steps = [].slice.call(root.querySelectorAll('.fs-step'));
  var bar = root.querySelectorAll('.fs-prog li');
  var cur = 0, last = null;

  // ---------- data
  var IL_AMT = [1530, 2450, 3670];              // First Schedule, 2026
  var EU_AMT = [250, 400, 600], UK_AMT = [220, 350, 520];
  var EXEMPT = [['2023-10-07', '2023-11-30'], ['2024-04-12', '2024-04-18'], ['2024-08-03', '2024-08-08'], ['2024-10-01', '2024-10-05']];
  var CLOSED = [['2025-06-13', '2025-06-25'], ['2026-02-28', '2026-04-10']];   // airspace closures (approx.), no s.9A order
  var MISSILE = [['2025-05-04', '2025-05-31']];                                // disputed in case law
  var EU_RULES_UNTIL = '2027-10-22';
  var cities = L.cities;                          // [{id, n, lat, lon, z}] z: il | eu | uk | x
  var byId = {}; cities.forEach(function (c) { byId[c.id] = c; });
  var airlines = L.airlines;                      // [{id, n, z}] z: il | eu | uk | x
  var alById = {}; airlines.forEach(function (a) { alById[a.id] = a; });

  function hav(a, b) {
    var R = 6371, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  function inRange(d, list) { return list.some(function (p) { return d >= p[0] && d <= p[1]; }); }
  function num(name) { var v = parseFloat((f.elements[name] || {}).value); return isNaN(v) ? null : v; }
  function val(name) { var e = f.elements[name]; if (!e) return ''; return e.value || ''; }
  var nf = new Intl.NumberFormat(L.locale, { maximumFractionDigits: 0 });
  function ils(n) { return nf.format(n) + ' ₪'; }
  function eur(n) { return nf.format(n) + ' €'; }
  function gbp(n) { return '£' + nf.format(n); }
  function t(k) { return L.t[k] || k; }

  // ---------- engine
  function compute() {
    var type = val('type'), date = val('date'), pax = Math.max(1, Math.min(9, num('pax') || 1));
    var from = byId[val('from')], to = byId[val('to')], al = alById[val('airline')] || { z: 'x', n: '' };
    var km = null, band = null;
    if (from && to && from.id !== 'other' && to.id !== 'other') km = Math.round(hav(from, to));
    if (km === null) { var b = val('band'); km = b === '0' ? 1500 : b === '1' ? 3000 : b === '2' ? 6000 : null; }
    if (km !== null) band = km <= 2000 ? 0 : km <= 4500 ? 1 : 2;
    var touchesIL = (from && from.z === 'il') || (to && to.z === 'il');
    var today = new Date().toISOString().slice(0, 10);
    var res = { type: type, km: km, pax: pax, il: null, eu: null, mtl: null, rights: [], notes: [], level: 'no' };
    var reason = type === 'cancel' ? val('reason') : type === 'delay' ? val('reason_d') : '';

    // --- Israeli law
    if (touchesIL && type !== 'baggage') {
      var il = { amount: 0, level: 'no', why: [] }, half = false;
      var fourYears = new Date(); fourYears.setFullYear(fourYears.getFullYear() - 4);
      var expired = date && date < fourYears.toISOString().slice(0, 10);
      var compDue = false, assist = [];
      if (type === 'cancel' || (type === 'delay' && (num('dep_delay') || 0) >= 8)) {
        assist = [t('r_assist'), t('r_choice')];
        compDue = true;
        if (type === 'delay') il.why.push(t('w_delay8'));
        if (type === 'cancel') {
          var notice = val('notice'), alt = val('alt'), early = num('alt_early') || 0, late = num('alt_late');
          if (notice === 'n14') { compDue = false; il.why.push(t('w_notice14')); }
          else if (notice === 'n7' && alt !== 'none' && early <= 2 && late !== null && late <= 4) { compDue = false; il.why.push(t('w_notice7')); }
          else if (notice === 'n0' && alt !== 'none' && early <= 1 && late !== null && late <= 2) { compDue = false; il.why.push(t('w_notice0')); }
          if (compDue && alt === 'accepted' && late !== null && late <= [2, 3, 4][band]) { half = true; il.why.push(t('w_half')); }
        }
      } else if (type === 'delay') {
        var dd = num('dep_delay') || 0;
        if (dd >= 5) { assist = [t('r_food'), t('r_choice')]; il.why.push(t('w_delay5')); }
        else if (dd >= 2) { assist = [t('r_food')]; il.why.push(t('w_delay2')); }
        else il.why.push(t('w_delay0'));
      } else if (type === 'denied') {
        var dr = val('denied_reason');
        assist = [t('r_assist'), t('r_choice')];
        if (dr === 'docs') { compDue = false; assist = []; il.why.push(t('w_denied_docs')); }
        else if (dr === 'security' && !f.elements.arrived3h.checked) { compDue = false; assist = []; il.why.push(t('w_denied_sec')); }
        else { compDue = true; il.why.push(t('w_denied')); }
        var lateD = num('alt_late_d');
        if (compDue && val('alt_d') === 'accepted' && lateD !== null && lateD <= [4, 5, 6][band]) { half = true; il.why.push(t('w_half')); }
      } else if (type === 'advanced') {
        var ah = num('adv_hours') || 0, n14 = val('notice_a') === 'n14';
        if (n14) il.why.push(t('w_adv_notice'));
        else if (ah > 8) { compDue = true; assist = [t('r_choice')]; il.why.push(t('w_adv8')); }
        else if (ah > 5) { assist = [t('r_choice')]; il.why.push(t('w_adv5')); }
        else il.why.push(t('w_adv0'));
      } else if (type === 'downgrade') {
        var fc = val('from_class'), tc = val('to_class'), price = num('price') || 0, pct = 0;
        if (fc === 'first' && tc === 'business') pct = 60;
        else if (fc === 'business' && tc === 'economy') pct = band === 2 ? 100 : 80;
        else if (fc === 'first' && tc === 'economy') pct = band === 2 ? 100 : 90;
        il.pct = pct; il.amount = Math.round(price * pct / 100) * pax;
        il.level = pct ? 'yes' : 'no'; il.why.push(t('w_down').replace('{p}', pct));
      }

      // reasons and war periods (cancellations, 8h delays, denied boarding, advancement)
      if (compDue) {
        il.level = 'yes';
        if (date && inRange(date, EXEMPT)) { compDue = false; il.level = 'no'; il.why.push(t('w_exempt')); }
        else if (reason === 'security' && date && inRange(date, CLOSED)) { il.level = 'unlikely'; il.why.push(t('w_closed')); }
        else if (reason === 'security' && date && inRange(date, MISSILE)) { il.level = 'maybe'; il.why.push(t('w_missile')); }
        else if (reason === 'security') { il.level = 'maybe'; il.why.push(t('w_security')); }
        else if (reason === 'weather' || reason === 'strike_other') { il.level = 'maybe'; il.why.push(t('w_weather')); }
        else if (reason === 'strike_airline') { il.level = 'maybe'; il.why.push(t('w_strike')); }
        else if (reason === 'shabbat') { compDue = false; il.level = 'no'; il.why.push(t('w_shabbat')); }
        else if (reason === 'technical') il.why.push(t('w_technical'));
        if (compDue && band !== null) il.amount = IL_AMT[band] / (half ? 2 : 1) * pax;
        if (il.level === 'unlikely') { il.potential = il.amount; il.amount = 0; il.why.push(t('w_potential').replace('{s}', ils(il.potential))); }
        if (!compDue) il.amount = 0;
      }
      if (expired) { il.level = 'no'; il.amount = 0; il.why.unshift(t('w_expired')); }
      il.assist = assist;
      res.il = il;
    }

    // --- EU261 / UK261
    if (from && to && type !== 'baggage' && type !== 'downgrade' && type !== 'advanced' && date && date <= EU_RULES_UNTIL) {
      var eu = null;
      var fromZ = from.z, toZ = to.z, alZ = al.z;
      var euScope = fromZ === 'eu' || (toZ === 'eu' && alZ === 'eu');
      var ukScope = fromZ === 'uk' || (toZ === 'uk' && (alZ === 'uk' || alZ === 'eu'));
      if (euScope || ukScope) {
        var intra = fromZ === 'eu' && toZ === 'eu';
        var ebBand = km <= 1500 ? 0 : (km <= 3500 || intra) ? 1 : 2;
        eu = { regime: euScope ? 'eu' : 'uk', level: 'no', amount: 0, why: [] };
        var due = false;
        if (type === 'delay') {
          var arr = num('arr_delay') || 0;
          if (arr >= 3) { due = true; eu.why.push(t('e_delay3')); } else eu.why.push(t('e_delay_lt3'));
        } else if (type === 'cancel') {
          var nt = val('notice'), a2 = val('alt'), e2 = num('alt_early') || 0, l2 = num('alt_late');
          due = true;
          if (nt === 'n14') { due = false; eu.why.push(t('w_notice14')); }
          else if (nt === 'n7' && a2 !== 'none' && e2 <= 2 && l2 !== null && l2 < 4) { due = false; eu.why.push(t('w_notice7')); }
          else if (nt === 'n0' && a2 !== 'none' && e2 <= 1 && l2 !== null && l2 < 2) { due = false; eu.why.push(t('w_notice0')); }
          if (due && a2 === 'accepted' && l2 !== null && l2 <= [2, 3, 4][ebBand]) eu.half = true;
        } else if (type === 'denied') {
          due = val('denied_reason') === 'overbooking';
          eu.why.push(due ? t('e_denied') : t('e_denied_no'));
        }
        if (due) {
          eu.level = 'yes';
          if (reason === 'security' || reason === 'weather' || reason === 'strike_other') { eu.level = 'maybe'; eu.why.push(t('e_ec')); }
          else if (reason === 'technical' || reason === 'strike_airline') eu.why.push(t('e_not_ec'));
          var base = (euScope ? EU_AMT : UK_AMT)[ebBand];
          eu.amount = base / (eu.half ? 2 : 1) * pax;
          if (eu.half) eu.why.push(t('w_half'));
        }
        if (euScope && fromZ === 'il') eu.why.push(t('e_from_il'));
        res.eu = eu;
      }
    }

    // --- Montreal (baggage)
    if (type === 'baggage') {
      var issue = val('bag_issue'), comp = val('complaint');
      var m = { level: 'maybe', why: [t('m_' + issue)] };
      if (comp === 'no') { m.level = issue === 'lost' ? 'maybe' : 'unlikely'; m.why.push(t('m_late_complaint')); }
      var twoYears = new Date(); twoYears.setFullYear(twoYears.getFullYear() - 2);
      if (date && date < twoYears.toISOString().slice(0, 10)) { m.level = 'no'; m.why.unshift(t('m_expired')); }
      res.mtl = m;
    }

    // overall level
    var order = { yes: 3, maybe: 2, unlikely: 1, no: 0 };
    var best = 'no';
    [res.il, res.eu, res.mtl].forEach(function (x) { if (x && order[x.level] > order[best]) best = x.level; });
    res.level = best;
    if (!touchesIL && !res.eu && type !== 'baggage') res.notes.push(t('n_not_covered'));
    if (res.il && res.eu && res.il.amount && res.eu.amount) res.notes.push(t('n_both'));
    if (date && date > today) res.notes.push(t('n_future'));
    res.notes.push(t('n_general'));
    return res;
  }

  // ---------- rendering
  function verdictText(lv) { return t('v_' + lv); }
  function render(r) {
    var out = root.querySelector('.fs-out');
    var h = '<div class="fs-verdict lv-' + r.level + '"><span>' + t('res_label') + '</span><b>' + verdictText(r.level) + '</b>';
    var sums = [];
    if (r.il && r.il.amount) sums.push(ils(r.il.amount) + ' <small>' + t('src_il') + '</small>');
    if (r.eu && r.eu.amount) sums.push((r.eu.regime === 'eu' ? eur(r.eu.amount) : gbp(r.eu.amount)) + ' <small>' + t(r.eu.regime === 'eu' ? 'src_eu' : 'src_uk') + '</small>');
    if (sums.length) h += '<div class="fs-sum">' + sums.join('<i>' + t('or') + '</i>') + '</div>';
    if (r.pax > 1 && sums.length) h += '<p class="fs-pax">' + t('for_pax').replace('{n}', r.pax) + '</p>';
    h += '</div>';
    function block(title, x, extra) {
      if (!x) return '';
      var s = '<div class="fs-block"><h3>' + title + ' <em class="lv-' + x.level + '">' + verdictText(x.level) + '</em></h3><ul>';
      x.why.forEach(function (w) { s += '<li>' + w + '</li>'; });
      (extra || []).forEach(function (w) { s += '<li class="plus">' + w + '</li>'; });
      return s + '</ul></div>';
    }
    h += block(t('src_il_full'), r.il, r.il ? r.il.assist : []);
    h += block(t(r.eu && r.eu.regime === 'uk' ? 'src_uk_full' : 'src_eu_full'), r.eu);
    h += block(t('src_mtl_full'), r.mtl);
    if (r.km) h += '<p class="fs-km">' + t('km').replace('{k}', nf.format(r.km)) + '</p>';
    h += '<ul class="fs-notes">' + r.notes.map(function (n) { return '<li>' + n + '</li>'; }).join('') + '</ul>';
    out.innerHTML = h;
  }

  function summary(r) {
    var lines = [];
    function lab(name) { var e = f.querySelector('[name="' + name + '"]'); if (!e) return ''; if (e.tagName === 'SELECT') return e.options[e.selectedIndex] ? e.options[e.selectedIndex].text : ''; var c = f.querySelector('[name="' + name + '"]:checked'); if (!c) return e.value; var bb = c.parentNode.querySelector('b'); return (bb || c.parentNode).textContent.trim(); }
    lines.push(t('s_type') + ': ' + lab('type'));
    lines.push(t('s_route') + ': ' + lab('from') + ' → ' + lab('to') + (r.km ? ' (' + nf.format(r.km) + ' km)' : ''));
    lines.push(t('s_date') + ': ' + val('date') + ' | ' + t('s_airline') + ': ' + lab('airline') + ' | ' + t('s_pax') + ': ' + r.pax);
    [].slice.call(f.querySelectorAll('.fs-detail:not([hidden]) [name]')).forEach(function (e) {
      if (e.type === 'radio' && !e.checked) return;
      var lbl = e.closest('label, fieldset'); var q = e.closest('fieldset') ? e.closest('fieldset').querySelector('legend') : null;
      var v = e.type === 'checkbox' ? (e.checked ? '✓' : '✗') : e.type === 'radio' ? e.parentNode.textContent.trim() : e.tagName === 'SELECT' ? e.options[e.selectedIndex].text : e.value;
      var k = q ? q.textContent.trim() : (lbl ? lbl.childNodes[0].textContent.trim() : e.name);
      if (v !== '') lines.push(k + ': ' + v);
    });
    lines.push('');
    lines.push(t('s_result') + ': ' + verdictText(r.level));
    if (r.il) lines.push(t('src_il') + ': ' + (r.il.amount ? ils(r.il.amount) : '0') + ' (' + verdictText(r.il.level) + ')');
    if (r.eu) lines.push(t(r.eu.regime === 'eu' ? 'src_eu' : 'src_uk') + ': ' + (r.eu.amount ? (r.eu.regime === 'eu' ? eur(r.eu.amount) : gbp(r.eu.amount)) : '0') + ' (' + verdictText(r.eu.level) + ')');
    if (r.mtl) lines.push(t('src_mtl_full') + ': ' + verdictText(r.mtl.level));
    return lines.join('\n');
  }

  // ---------- wizard
  function showDetails() {
    var type = val('type');
    [].slice.call(f.querySelectorAll('.fs-detail')).forEach(function (d) {
      var on = d.dataset.for.split(' ').indexOf(type) >= 0; d.hidden = !on;
      [].slice.call(d.querySelectorAll('input,select')).forEach(function (i) { i.disabled = !on; });
    });
    var other = val('from') === 'other' || val('to') === 'other';
    var bandEl = f.querySelector('.fs-band'); bandEl.hidden = !other; bandEl.querySelector('select').disabled = !other;
    f.querySelector('.fs-alt-times').hidden = val('alt') === 'none' || !val('alt');
    var sec = f.querySelector('.fs-arrived'); if (sec) sec.hidden = val('denied_reason') !== 'security';
  }
  function valid(i) {
    var s = steps[i], bad = null;
    [].slice.call(s.querySelectorAll('[required]')).forEach(function (e) {
      if (bad || e.disabled || e.closest('[hidden]')) return;
      if (e.type === 'radio') { if (!f.querySelector('[name="' + e.name + '"]:checked')) bad = e; }
      else if (e.type === 'checkbox') { if (!e.checked) bad = e; }
      else if (!e.value) bad = e;
    });
    var msg = s.querySelector('.fs-err'); if (msg) msg.textContent = bad ? t('err_fill') : '';
    if (bad) { (bad.type === 'radio' ? bad : bad).focus(); }
    return !bad;
  }
  function go(i) {
    cur = Math.max(0, Math.min(steps.length - 1, i));
    steps.forEach(function (s, k) { s.hidden = k !== cur; });
    [].forEach.call(bar, function (li, k) { li.classList.toggle('on', k === cur); li.classList.toggle('done', k < cur); if (k === cur) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current'); });
    if (cur === 3) { last = compute(); render(last); }
    var h = steps[cur].querySelector('h2'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    root.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  root.addEventListener('click', function (e) {
    var b = e.target.closest('[data-go]'); if (!b) return;
    e.preventDefault();
    var d = b.dataset.go;
    if (d === 'next') { if (valid(cur)) go(cur + 1); }
    else if (d === 'back') go(cur - 1);
    else go(+d);
  });
  f.addEventListener('change', showDetails); f.addEventListener('input', showDetails);
  // default date: today
  showDetails(); go(0);

  // ---------- send to the lawyer
  var sendBtn = root.querySelector('.fs-send'), status = root.querySelector('.fs-status');
  function say(m, bad) { status.textContent = m; status.classList.toggle('bad', !!bad); }
  sendBtn.addEventListener('click', function (e) {
    e.preventDefault();
    if (!valid(4)) return;
    var data = { tool: 'flight', lang: L.lang, name: val('c_name').trim(), phone: val('c_phone').trim(), email: val('c_email').trim(), note: val('c_note'), consent: f.elements.c_consent.checked, website: val('website'), summary: summary(last || compute()) };
    sendBtn.disabled = true; var lbl = sendBtn.textContent; sendBtn.textContent = t('sending'); say('');
    fetch(L.api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (x) {
        if (!x.ok || !x.j.ok) { say(t('err_' + x.j.error) !== 'err_' + x.j.error ? t('err_' + x.j.error) : t('err_net'), true); return; }
        root.querySelector('.fs-done').hidden = false; f.querySelector('.fs-lead').hidden = true; say('');
      })
      .catch(function () { say(t('err_net'), true); })
      .then(function () { sendBtn.disabled = false; sendBtn.textContent = lbl; });
  });
  var waBtn = root.querySelector('.fs-wa');
  waBtn.addEventListener('click', function () {
    var text = t('wa_intro') + '\n\n' + summary(last || compute());
    waBtn.href = 'https://wa.me/' + L.wa_num + '?text=' + encodeURIComponent(text);
  });
})();
