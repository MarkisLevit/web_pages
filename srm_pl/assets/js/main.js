/* =========================================================================
   Fundacja Solid Rock Polska — site behaviour
   Vanilla JS, no dependencies. Every feature degrades gracefully.
   ========================================================================= */
(function () {
  'use strict';

  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------------- nav ----- */
  function nav() {
    var btn = document.querySelector('.burger');
    var menu = document.getElementById('nav');
    if (!btn || !menu) return;

    function open(state) {
      btn.setAttribute('aria-expanded', String(state));
      menu.classList.toggle('open', state);
      document.body.style.overflow = state ? 'hidden' : '';
    }

    btn.addEventListener('click', function () {
      open(btn.getAttribute('aria-expanded') !== 'true');
    });
    menu.addEventListener('click', function (e) {
      if (e.target.closest('a')) open(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && btn.getAttribute('aria-expanded') === 'true') {
        open(false); btn.focus();
      }
    });
    document.addEventListener('click', function (e) {
      if (btn.getAttribute('aria-expanded') !== 'true') return;
      if (!menu.contains(e.target) && !btn.contains(e.target)) open(false);
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth > 980) open(false);
    });
  }

  /* ---------------------------------------------------------- header ----- */
  function header() {
    var h = document.querySelector('.hdr');
    if (!h) return;
    var t = false;
    function up() { h.classList.toggle('stuck', window.scrollY > 8); t = false; }
    window.addEventListener('scroll', function () {
      if (!t) { requestAnimationFrame(up); t = true; }
    }, { passive: true });
    up();
  }

  /* ---------------------------------------------------------- reveal ----- */
  function reveal() {
    var els = document.querySelectorAll('.rv');
    if (!els.length) return;
    if (reduce || !('IntersectionObserver' in window)) {
      els.forEach(function (el) { el.classList.add('in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    els.forEach(function (el) { io.observe(el); });
  }

  /* -------------------------------------------------------- counters ----- */
  // Formats with the page's own locale, so 20371 reads "20 371" in Polish
  // and "20,371" in English without duplicating the markup.
  function counters() {
    var nums = document.querySelectorAll('[data-count]');
    if (!nums.length) return;
    var fmt = new Intl.NumberFormat(document.documentElement.lang || 'pl');

    function put(el, v) {
      var n = el.firstChild;
      if (n && n.nodeType === 3) n.nodeValue = fmt.format(v);
      else el.insertBefore(document.createTextNode(fmt.format(v)), el.firstChild);
    }

    function run(el) {
      var target = parseInt(el.getAttribute('data-count'), 10);
      if (isNaN(target)) return;
      if (reduce) { put(el, target); return; }
      var start = null, dur = 1400;
      function frame(ts) {
        if (start === null) start = ts;
        var p = Math.min((ts - start) / dur, 1);
        put(el, Math.round(target * (p === 1 ? 1 : 1 - Math.pow(2, -10 * p))));
        if (p < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }

    if (!('IntersectionObserver' in window)) {
      nums.forEach(function (el) { put(el, parseInt(el.getAttribute('data-count'), 10)); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { run(e.target); io.unobserve(e.target); }
      });
    }, { threshold: 0.4 });
    nums.forEach(function (el) { put(el, 0); io.observe(el); });
  }

  /* ------------------------------------------------------------ copy ----- */
  function copy() {
    document.querySelectorAll('.copy').forEach(function (btn) {
      var original = btn.textContent;
      btn.addEventListener('click', function () {
        var value = btn.getAttribute('data-copy') || '';
        function done() {
          btn.textContent = btn.getAttribute('data-done') || 'OK';
          btn.classList.add('done');
          setTimeout(function () {
            btn.textContent = original; btn.classList.remove('done');
          }, 1800);
        }
        function fallback() {
          var ta = document.createElement('textarea');
          ta.value = value; ta.setAttribute('readonly', '');
          ta.style.cssText = 'position:absolute;left:-9999px';
          document.body.appendChild(ta); ta.select();
          try { document.execCommand('copy'); done(); } catch (e) { /* no-op */ }
          document.body.removeChild(ta);
        }
        if (navigator.clipboard && window.isSecureContext) {
          navigator.clipboard.writeText(value).then(done).catch(fallback);
        } else { fallback(); }
      });
    });
  }

  /* ------------------------------------------------------------ year ----- */
  function year() {
    document.querySelectorAll('[data-year]').forEach(function (el) {
      el.textContent = String(new Date().getFullYear());
    });
  }

  /* --------------------------------------------------- next Sunday ------- */
  // Shows the date of the coming Sunday next to the service time, so the
  // schedule reads as a real invitation rather than a static opening hour.
  function nextSunday() {
    var els = document.querySelectorAll('[data-next-sunday]');
    if (!els.length) return;
    var d = new Date();
    d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
    var loc = document.documentElement.lang === 'en' ? 'en-GB' : 'pl-PL';
    var txt = d.toLocaleDateString(loc, { day: 'numeric', month: 'long' });
    els.forEach(function (el) { el.textContent = txt; });
  }

  function init() { nav(); header(); reveal(); counters(); copy(); year(); nextSunday(); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
