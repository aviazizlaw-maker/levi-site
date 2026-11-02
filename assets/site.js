/* levi-adv.co.il — interactions; every section still works without JS */
(function () {
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var rtl = document.documentElement.dir === 'rtl';
  var lang = document.documentElement.lang;

  // Header shadow on scroll
  var top = $('.top');
  var onScroll = function () { if (top) top.classList.toggle('scrolled', window.scrollY > 8); };
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();

  // Mobile menu
  var btn = $('.menu-btn'), nav = $('#nav');
  if (btn && nav) {
    btn.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') { nav.classList.remove('open'); btn.setAttribute('aria-expanded', 'false'); }
    });
  }

  // Mobile call bar hidden while hero buttons are visible
  var dock = $('.dock'), heroActions = $('.hero .actions, .page-hero .actions');
  if (dock && heroActions && 'IntersectionObserver' in window) {
    new IntersectionObserver(function (en) { dock.classList.toggle('away', en[0].isIntersecting); }).observe(heroActions);
  }

  // Generic tabs: [role=tablist] with buttons[aria-controls]
  $$('[role="tablist"]').forEach(function (list) {
    var tabs = $$('[role="tab"]', list);
    var select = function (t, focus) {
      tabs.forEach(function (x) {
        var on = x === t;
        x.setAttribute('aria-selected', on ? 'true' : 'false');
        x.tabIndex = on ? 0 : -1;
        var p = document.getElementById(x.getAttribute('aria-controls'));
        if (p) p.hidden = !on;
      });
      if (focus) t.focus();
    };
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { select(t); });
      t.addEventListener('keydown', function (e) {
        var vertical = list.getAttribute('aria-orientation') === 'vertical' && window.innerWidth > 980;
        var next = vertical ? 'ArrowDown' : (rtl ? 'ArrowLeft' : 'ArrowRight');
        var prev = vertical ? 'ArrowUp' : (rtl ? 'ArrowRight' : 'ArrowLeft');
        if (e.key === next) { e.preventDefault(); select(tabs[(i + 1) % tabs.length], true); }
        if (e.key === prev) { e.preventDefault(); select(tabs[(i - 1 + tabs.length) % tabs.length], true); }
      });
    });
  });

  // Price calculator
  var calc = $('.calc');
  if (calc) {
    var range = $('input[type=range]', calc), seg = $$('.seg button', calc);
    var fmt = function (n) { return (lang === 'he' ? '₪' : '') + n.toLocaleString(lang === 'he' ? 'he-IL' : 'fr-FR') + (lang === 'he' ? '' : ' ₪'); };
    var state = { rate: +seg[0].dataset.rate, cap: +seg[0].dataset.cap };
    var render = function () {
      var h = +range.value, raw = h * state.rate, pay = Math.min(raw, state.cap);
      $('.hours b', calc).textContent = h;
      $('.math', calc).textContent = (lang === 'he' ? h + ' שעות × ' + fmt(state.rate) + ' = ' + fmt(raw) : h + ' h × ' + fmt(state.rate) + ' = ' + fmt(raw));
      $('.pay', calc).textContent = fmt(pay);
      $('.meter i', calc).style.width = Math.min(100, raw / state.cap * 100) + '%';
      $('.cap-val', calc).textContent = fmt(state.cap);
      var note = $('.capnote', calc);
      note.hidden = raw <= state.cap;
      if (raw > state.cap) note.textContent = (lang === 'he' ? 'הגעתם לתקרה: חוסכים ' + fmt(raw - state.cap) + '.' : 'Plafond atteint : vous économisez ' + fmt(raw - state.cap) + '.');
    };
    seg.forEach(function (b) {
      b.addEventListener('click', function () {
        seg.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        state = { rate: +b.dataset.rate, cap: +b.dataset.cap };
        range.max = b.dataset.max; if (+range.value > +range.max) range.value = range.max;
        render();
      });
    });
    range.addEventListener('input', render);
    render();
  }

  // Article filter
  var filters = $('.filters');
  if (filters) {
    filters.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      var tag = b.getAttribute('data-tag');
      $$('button', filters).forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      $$('.cards .card').forEach(function (c) {
        c.hidden = tag !== 'all' && (' ' + c.getAttribute('data-tags') + ' ').indexOf(' ' + tag + ' ') === -1;
      });
    });
  }

  // Reviews: arrows, dots, gentle autoplay that stops on interaction
  var track = $('.reviews');
  if (track) {
    var cards = $$('.review', track), dots = $('.dots'), idx = 0, timer = null;
    var go = function (i) {
      idx = (i + cards.length) % cards.length;
      var c = cards[idx];
      track.scrollTo({ left: c.offsetLeft - track.offsetLeft - (rtl ? track.clientWidth - c.clientWidth : 0), behavior: 'smooth' });
      if (dots) $$('button', dots).forEach(function (d, k) { d.setAttribute('aria-current', k === idx ? 'true' : 'false'); });
    };
    if (dots) cards.forEach(function (_, k) {
      var d = document.createElement('button'); d.type = 'button';
      d.setAttribute('aria-label', (lang === 'he' ? 'המלצה ' : 'Avis ') + (k + 1));
      d.setAttribute('aria-current', k === 0 ? 'true' : 'false');
      d.addEventListener('click', function () { stop(); go(k); });
      dots.appendChild(d);
    });
    var stop = function () { if (timer) { clearInterval(timer); timer = null; } };
    $$('.rnav button').forEach(function (b) {
      b.addEventListener('click', function () { stop(); go(idx + (b.dataset.dir === 'next' ? 1 : -1)); });
    });
    ['pointerdown', 'wheel', 'touchstart', 'focusin'].forEach(function (ev) { track.addEventListener(ev, stop, { passive: true }); });
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && 'IntersectionObserver' in window) {
      new IntersectionObserver(function (en) {
        if (en[0].isIntersecting && !timer && !track.dataset.touched) timer = setInterval(function () { go(idx + 1); }, 5500);
        if (!en[0].isIntersecting) stop();
      }).observe(track);
      track.addEventListener('pointerdown', function () { track.dataset.touched = '1'; });
    }
  }

  // WhatsApp composer
  var form = $('.composer form');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = form.elements.name.value.trim(), topic = form.elements.topic.value, msg = form.elements.msg.value.trim();
      var L = { he: ['שלום עו״ד לוי', ', כאן ', 'נושא: '], fr: ['Bonjour Maître Levi', ', ici ', 'Sujet : '], en: ['Hello Adv. Levi', ', this is ', 'Topic: '] }[lang] || ['Hello', ', ', ''];
      var text = L[0] + (name ? L[1] + name : '') + '.\n' + L[2] + topic + (msg ? '\n' + msg : '');
      window.open('https://wa.me/' + form.dataset.wa + '?text=' + encodeURIComponent(text), '_blank', 'noopener');
    });
  }

  // Reading progress
  var bar = $('.progress'), prose = $('.prose');
  if (bar && prose) {
    var upd = function () {
      var r = prose.getBoundingClientRect(), total = Math.max(r.height - window.innerHeight * 0.6, 1);
      bar.style.width = (Math.min(Math.max(-r.top + 120, 0), total) / total * 100) + '%';
    };
    window.addEventListener('scroll', upd, { passive: true }); upd();
  }

  // Scroll reveal
  var els = $$('.reveal');
  if (!('IntersectionObserver' in window)) { els.forEach(function (e) { e.classList.add('in'); }); }
  else {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    els.forEach(function (e) { io.observe(e); });
  }
})();
