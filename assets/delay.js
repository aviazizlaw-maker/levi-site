/* Late handover compensation, Sale (Apartments) Law s. 5A. Runs only in the browser. */
(function () {
  var root = document.getElementById('dt'); if (!root) return;
  var L = JSON.parse(document.getElementById('dt-i18n').textContent);
  var f = root.querySelector('form');
  var out = {
    total: root.querySelector('.dt-total'), delay: root.querySelector('.dt-delay'), months: root.querySelector('.dt-months'),
    msg: root.querySelector('.dt-msg'), table: root.querySelector('.dt-table'), body: root.querySelector('.dt-table tbody'), wa: root.querySelector('.dt-wa')
  };
  window.leadSummary = function () { return ''; };
  var nf = new Intl.NumberFormat(L.locale, { maximumFractionDigits: 0 });
  function money(n) { return L.locale === 'he-IL' ? nf.format(n) + ' ₪' : nf.format(n) + ' ₪'; }
  function parse(v) { if (!v) return null; var p = v.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function addMonths(t, k) {
    var d = new Date(t), y = d.getUTCFullYear(), m = d.getUTCMonth() + k, day = d.getUTCDate();
    var last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return Date.UTC(y, m, Math.min(day, last));
  }
  function today() { var n = new Date(); return Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()); }
  var DAY = 864e5;

  function calc() {
    var ver = f.ver.value, due = parse(f.due.value), open = f.open.checked;
    f.act.disabled = open;
    var act = open ? today() : parse(f.act.value), rent = parseFloat(f.rent.value);
    out.table.hidden = true; out.body.innerHTML = '';
    window.leadSummary = function () { return ''; };
    if (due === null || act === null || !(rent > 0)) { show('—', '—', '—', L.m_fill); return; }
    if (act <= due) { show(money(0), '0', '0', L.m_none); return; }
    // whole months and leftover days of delay
    var whole = 0; while (addMonths(due, whole + 1) <= act) whole++;
    var days = Math.round((act - addMonths(due, whole)) / DAY);
    var K = days > 0 ? whole + 1 : whole; // months started (a part of a month counts)
    var mT = whole === 1 ? L.month1 : whole + ' ' + L.months_u, dT = days === 1 ? L.day1 : days + ' ' + L.days_u;
    var delayTxt = (whole ? mT : '') + (whole && days ? L.and : '') + (days ? dT : '');
    var tiers;
    if (ver === 'new') {
      if (act <= addMonths(due, 1)) { show(money(0), delayTxt, '0', L.m_grace_new); return; }
      tiers = [[2, 4, 1, L.tier_new[0]], [5, 10, 1.25, L.tier_new[1]], [11, Infinity, 1.5, L.tier_new[2]]];
    } else {
      if (act - due <= 60 * DAY) { show(money(0), delayTxt, '0', L.m_grace_old); return; }
      tiers = [[1, 8, 1.5, L.tier_old[0]], [9, Infinity, 1.25, L.tier_old[1]]];
    }
    var total = 0, counted = 0, rows = '';
    tiers.forEach(function (t) {
      var n = Math.max(0, Math.min(K, t[1]) - t[0] + 1); if (!n) return;
      var s = n * rent * t[2]; total += s; counted += n;
      rows += '<tr><td>' + t[3] + '</td><td>' + n + '</td><td dir="ltr">×' + t[2] + '</td><td>' + money(s) + '</td></tr>';
    });
    out.body.innerHTML = rows; out.table.hidden = false;
    show(money(total), delayTxt, String(counted), ver === 'new' ? L.m_ok_new : L.m_ok_old);
    var lines = [root.querySelector('.dt-ver input:checked').parentNode.querySelector('b').textContent, f.due.value + ' → ' + (open ? 'open' : f.act.value), 'rent: ' + rent, out.delay.textContent, counted + ' months', money(total)];
    [].forEach.call(out.body.querySelectorAll('tr'), function (tr) { lines.push([].map.call(tr.cells, function (c) { return c.textContent; }).join(' | ')); });
    window.leadSummary = function () { return lines.join('\n'); };
  }
  function show(t, d, m, msg) { out.total.textContent = t; out.delay.textContent = d; out.months.textContent = m; out.msg.textContent = msg; }
  f.addEventListener('input', calc); f.addEventListener('change', calc); calc();
})();
