/* =========================================================================
   Solid Rock Mission Polska — site behaviour
   Vanilla JS, no dependencies. Progressive enhancement only:
   every feature degrades gracefully if JS is unavailable.
   ========================================================================= */
(function () {
  'use strict';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------------- nav --- */
  function initNav() {
    var toggle = document.querySelector('.nav-toggle');
    var nav = document.getElementById('primary-nav');
    if (!toggle || !nav) return;

    function setOpen(open) {
      toggle.setAttribute('aria-expanded', String(open));
      nav.classList.toggle('is-open', open);
      document.body.style.overflow = open ? 'hidden' : '';
    }

    toggle.addEventListener('click', function () {
      setOpen(toggle.getAttribute('aria-expanded') !== 'true');
    });

    // Close on link click (same-page anchors especially)
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) setOpen(false);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
        setOpen(false);
        toggle.focus();
      }
    });

    document.addEventListener('click', function (e) {
      if (toggle.getAttribute('aria-expanded') !== 'true') return;
      if (!nav.contains(e.target) && !toggle.contains(e.target)) setOpen(false);
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth > 1040) setOpen(false);
    });
  }

  /* ------------------------------------------------------- sticky header --- */
  function initHeader() {
    var header = document.querySelector('.site-header');
    if (!header) return;
    var ticking = false;
    function update() {
      header.classList.toggle('is-stuck', window.scrollY > 8);
      ticking = false;
    }
    window.addEventListener('scroll', function () {
      if (!ticking) { window.requestAnimationFrame(update); ticking = true; }
    }, { passive: true });
    update();
  }

  /* ------------------------------------------------------ scroll reveal --- */
  function initReveal() {
    var items = document.querySelectorAll('.reveal');
    if (!items.length) return;

    if (reduceMotion || !('IntersectionObserver' in window)) {
      items.forEach(function (el) { el.classList.add('is-visible'); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

    items.forEach(function (el) { io.observe(el); });
  }

  /* ---------------------------------------------------------- counters --- */
  // Formats using the page's own locale so 20371 renders as
  // "20 371" in Polish and "20,371" in English.
  function initCounters() {
    var nums = document.querySelectorAll('[data-count]');
    if (!nums.length) return;

    var locale = document.documentElement.lang || 'pl';
    var fmt = new Intl.NumberFormat(locale);

    function render(el, value) {
      el.firstChild && el.firstChild.nodeType === 3
        ? (el.firstChild.nodeValue = fmt.format(value))
        : el.insertBefore(document.createTextNode(fmt.format(value)), el.firstChild);
    }

    function run(el) {
      var target = parseInt(el.getAttribute('data-count'), 10);
      if (isNaN(target)) return;
      if (reduceMotion) { render(el, target); return; }

      var duration = 1500;
      var start = null;
      function frame(ts) {
        if (start === null) start = ts;
        var p = Math.min((ts - start) / duration, 1);
        // easeOutExpo
        var eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
        render(el, Math.round(target * eased));
        if (p < 1) window.requestAnimationFrame(frame);
      }
      window.requestAnimationFrame(frame);
    }

    if (!('IntersectionObserver' in window)) {
      nums.forEach(function (el) { render(el, parseInt(el.getAttribute('data-count'), 10)); });
      return;
    }

    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { run(entry.target); io.unobserve(entry.target); }
      });
    }, { threshold: 0.4 });

    nums.forEach(function (el) { render(el, 0); io.observe(el); });
  }

  /* ------------------------------------------------- copy-to-clipboard --- */
  function initCopy() {
    var buttons = document.querySelectorAll('.copy-btn');
    if (!buttons.length) return;

    buttons.forEach(function (btn) {
      var original = btn.textContent;
      btn.addEventListener('click', function () {
        var value = btn.getAttribute('data-copy') || '';
        var done = function () {
          btn.textContent = btn.getAttribute('data-copied-label') || 'OK';
          btn.classList.add('is-copied');
          window.setTimeout(function () {
            btn.textContent = original;
            btn.classList.remove('is-copied');
          }, 1800);
        };

        if (navigator.clipboard && window.isSecureContext) {
          navigator.clipboard.writeText(value).then(done).catch(fallback);
        } else {
          fallback();
        }

        function fallback() {
          var ta = document.createElement('textarea');
          ta.value = value;
          ta.setAttribute('readonly', '');
          ta.style.cssText = 'position:absolute;left:-9999px';
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand('copy'); done(); } catch (err) { /* no-op */ }
          document.body.removeChild(ta);
        }
      });
    });
  }

  /* ------------------------------------------------------- footer year --- */
  function initYear() {
    document.querySelectorAll('[data-year]').forEach(function (el) {
      el.textContent = String(new Date().getFullYear());
    });
  }

  /* ------------------------------------------- remember language choice --- */
  // Stores the visitor's explicit language pick so the switcher can be
  // highlighted consistently; no automatic redirect (that breaks deep links).
  function initLang() {
    document.querySelectorAll('.lang-switch a').forEach(function (a) {
      a.addEventListener('click', function () {
        try { localStorage.setItem('srm-lang', a.getAttribute('hreflang') || ''); } catch (e) { /* no-op */ }
      });
    });
  }

  /* -------------------------------------------------------------- init --- */
  function init() {
    initNav();
    initHeader();
    initReveal();
    initCounters();
    initCopy();
    initYear();
    initLang();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
