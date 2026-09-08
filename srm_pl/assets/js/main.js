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

  /* ------------------------------------------------------------ news ----- */
  // One JSON file (assets/data/news.json) feeds three things: the compact
  // digest on the "what we do" page, the full blog page, and the weekly rhythm
  // with its live dates. A future Telegram scraper edits that file and nothing
  // else. Every string is inserted with textContent, so nothing in the data can
  // inject markup. If the fetch fails, the static fallback already in the page
  // stays put.
  var NEWS_STR = {
    pl: {
      next: 'Najbliższe spotkania', feed: 'Prosto z kanału',
      today: 'dziś', tomorrow: 'jutro',
      past: 'Za nami', planned: 'Zaplanowane', note: 'Warto wiedzieć',
      more: 'Zobacz post', source: 'Źródło: nasz kanał na Telegramie · aktualizacja ',
      follow: 'Obserwuj kanał', all: 'Wszystkie aktualności',
      photos: 'Zdjęcia', close: 'Zamknij', prev: 'Poprzednie', nextPhoto: 'Następne',
      of: 'z'
    },
    en: {
      next: 'Coming up', feed: 'Straight from the channel',
      today: 'today', tomorrow: 'tomorrow',
      past: 'Happened', planned: 'Planned', note: 'Good to know',
      more: 'See the post', source: 'Source: our Telegram channel · updated ',
      follow: 'Follow the channel', all: 'All news',
      photos: 'Photos', close: 'Close', prev: 'Previous', nextPhoto: 'Next',
      of: 'of'
    }
  };

  function newsKit(host) {
    var lang = document.documentElement.lang === 'en' ? 'en' : 'pl';
    var url = host.getAttribute('data-news') || host.getAttribute('data-blog');
    // "../assets/data/news.json" -> "../" so images resolve from /en/ too.
    var prefix = url.replace(/assets\/data\/news\.json$/, '');

    function el(tag, cls, text) {
      var n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text != null) n.textContent = text;
      return n;
    }

    // 'YYYY-MM-DD' as local midnight; new Date(iso) reads it as UTC and slips a
    // day back for anyone west of Greenwich.
    function parse(iso) {
      var q = String(iso).split('-');
      return new Date(+q[0], (+q[1]) - 1, +q[2]);
    }

    function midnight(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

    return {
      lang: lang, url: url, prefix: prefix, s: NEWS_STR[lang],
      loc: lang === 'en' ? 'en-GB' : 'pl-PL',
      el: el, parse: parse, midnight: midnight,

      // Next time a weekly slot comes round, skipping today's if it has passed.
      slot: function (weekday, time) {
        var hm = String(time).split(':');
        var d = new Date();
        d.setDate(d.getDate() + ((weekday - d.getDay() + 7) % 7));
        d.setHours(+hm[0], +hm[1] || 0, 0, 0);
        if (d.getTime() < Date.now()) d.setDate(d.getDate() + 7);
        return d;
      },

      dayLabel: function (d) {
        var diff = Math.round((midnight(d) - midnight(new Date())) / 86400000);
        if (diff === 0) return NEWS_STR[lang].today;
        if (diff === 1) return NEWS_STR[lang].tomorrow;
        return d.toLocaleDateString(this.loc, { weekday: 'long', day: 'numeric', month: 'long' });
      },

      // Sorted newest first; undated standing notes sink to the bottom.
      rows: function (data) {
        var today = midnight(new Date());
        return (data.items || []).map(function (it) {
          var at = it.date ? parse(it.date) : null;
          return {
            it: it, at: at,
            kind: it.kind || (at && at > today ? 'planned' : 'past'),
            sort: at ? at.getTime() : -Infinity
          };
        }).sort(function (a, b) { return b.sort - a.sort; });
      },

      // "12–13 września 2026" for a range, "30 sierpnia 2026" for a single day.
      dateLine: function (row) {
        if (!row.at) return '';
        var opts = { day: 'numeric', month: 'long', year: 'numeric' };
        var endIso = row.it.dateEnd;
        if (!endIso) return row.at.toLocaleDateString(this.loc, opts);
        var end = parse(endIso);
        if (end.getMonth() === row.at.getMonth() && end.getFullYear() === row.at.getFullYear()) {
          return row.at.toLocaleDateString(this.loc, { day: 'numeric' }) + '–' +
                 end.toLocaleDateString(this.loc, opts);
        }
        return row.at.toLocaleDateString(this.loc, opts) + ' – ' +
               end.toLocaleDateString(this.loc, opts);
      },

      // eager: the lead picture of a post is main content, so it should not
      // wait on the lazy-load heuristic the way a thumbnail can.
      photo: function (data, ph, cls, eager) {
        var img = el('img', cls || null);
        img.src = this.prefix + (data.imageBase || 'assets/img/news/') + ph.src + '.webp';
        img.alt = ph[lang] || '';
        if (ph.w) img.width = ph.w;
        if (ph.h) img.height = ph.h;
        img.loading = eager ? 'eager' : 'lazy';
        img.decoding = eager ? 'sync' : 'async';
        return img;
      },

      load: function (done) {
        fetch(this.url, { credentials: 'same-origin' })
          .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
          .then(done)
          .catch(function () { /* the fallback markup is already on the page */ });
      }
    };
  }

  /* --------------------------------------------------------- news digest -- */
  function news() {
    var host = document.querySelector('[data-news]');
    if (!host) return;
    var k = newsKit(host), el = k.el, s = k.s;

    function rhythmCol(data) {
      var box = el('div', 'news__col');
      box.appendChild(el('p', 'news__kicker', s.next));

      var list = el('ol', 'rhythm');
      (data.rhythm || [])
        .map(function (r) { return { r: r, at: k.slot(r.weekday, r.time) }; })
        .sort(function (a, b) { return a.at - b.at; })
        .forEach(function (entry, i) {
          var copy = entry.r[k.lang] || {};
          var li = el('li', 'rhythm__item' + (i === 0 ? ' rhythm__item--soon' : ''));
          var when = el('p', 'rhythm__when');
          when.appendChild(el('span', 'rhythm__day', k.dayLabel(entry.at)));
          when.appendChild(el('span', 'rhythm__time', entry.r.time));
          li.appendChild(when);
          li.appendChild(el('p', 'rhythm__name', copy.name || ''));
          if (copy.note) li.appendChild(el('p', 'rhythm__note', copy.note));
          list.appendChild(li);
        });
      box.appendChild(list);

      var place = (data.place || {})[k.lang];
      if (place) box.appendChild(el('p', 'rhythm__where', place));
      return box;
    }

    function feedCol(data) {
      var box = el('div', 'news__col');
      box.appendChild(el('p', 'news__kicker', s.feed));
      var list = el('ol', 'feed');

      k.rows(data).slice(0, 4).forEach(function (row) {
        var copy = row.it[k.lang] || {};
        var photos = row.it.photos || [];
        var li = el('li', 'feed__item' + (row.at ? '' : ' feed__item--note'));

        if (row.at) {
          var when = el('div', 'feed__when');
          when.appendChild(el('b', null, row.at.toLocaleDateString(k.loc, { day: 'numeric' })));
          when.appendChild(el('span', null, row.at.toLocaleDateString(k.loc, { month: 'short' })));
          li.appendChild(when);
        }

        var body = el('div', 'feed__body');
        body.appendChild(el('span', 'tag' + (row.kind === 'planned' ? ' tag--gold' : ''),
                            s[row.kind] || s.past));
        body.appendChild(el('h3', null, copy.title || ''));
        if (copy.lead) body.appendChild(el('p', null, copy.lead));
        li.appendChild(body);

        // A single thumbnail is enough here; the blog page carries the album.
        if (photos.length) {
          var fig = el('div', 'feed__thumb');
          fig.appendChild(k.photo(data, photos[0]));
          li.appendChild(fig);
          li.className += ' feed__item--photo';
        }
        list.appendChild(li);
      });

      box.appendChild(list);
      return box;
    }

    function foot(data) {
      var p = el('p', 'news__foot');
      var when = data.updated
        ? k.parse(data.updated).toLocaleDateString(k.loc, { day: 'numeric', month: 'long', year: 'numeric' })
        : '';
      p.appendChild(el('span', null, s.source + when));

      var row = el('span', 'news__foot-acts');
      var blog = host.getAttribute('data-news-page');
      if (blog) {
        var b = el('a', 'btn btn--primary btn--sm', s.all);
        b.href = blog;
        row.appendChild(b);
      }
      if (data.channel) {
        var a = el('a', 'btn btn--outline btn--sm', s.follow);
        a.href = data.channel;
        a.rel = 'noopener';
        row.appendChild(a);
      }
      p.appendChild(row);
      return p;
    }

    k.load(function (data) {
      var grid = el('div', 'news__grid');
      grid.appendChild(rhythmCol(data));
      grid.appendChild(feedCol(data));
      host.textContent = '';
      host.appendChild(grid);
      host.appendChild(foot(data));
    });
  }

  /* ----------------------------------------------------------- blog page -- */
  function blog() {
    var host = document.querySelector('[data-blog]');
    if (!host) return;
    var k = newsKit(host), el = k.el, s = k.s;

    function gallery(data, photos, title) {
      var fig = el('div', 'post__media');
      var main = el('figure', 'post__shot');
      main.appendChild(k.photo(data, photos[0], null, true));
      fig.appendChild(main);

      if (photos.length > 1) {
        var strip = el('div', 'post__thumbs');
        photos.slice(1).forEach(function (ph) {
          var b = el('button', 'post__thumb');
          b.type = 'button';
          b.setAttribute('aria-label', s.photos + ': ' + (ph[k.lang] || title));
          b.appendChild(k.photo(data, ph));
          strip.appendChild(b);
        });
        fig.appendChild(strip);
      }
      return fig;
    }

    function post(data, row, i) {
      var copy = row.it[k.lang] || {};
      var photos = row.it.photos || [];
      var art = el('article', 'post rv' + (photos.length ? '' : ' post--text'));
      if (i === 0 && photos.length) art.className += ' post--lead';
      if (row.it.id) art.id = row.it.id;

      if (photos.length) art.appendChild(gallery(data, photos, copy.title || ''));

      var body = el('div', 'post__body');
      var meta = el('p', 'post__meta');
      meta.appendChild(el('span', 'tag' + (row.kind === 'planned' ? ' tag--gold' : ''),
                          s[row.kind] || s.past));
      var line = k.dateLine(row);
      if (line) {
        var t = el('time', 'post__date', line);
        if (row.it.date) t.dateTime = row.it.date;
        meta.appendChild(t);
      }
      body.appendChild(meta);

      body.appendChild(el('h2', 'post__title', copy.title || ''));
      if (copy.lead) body.appendChild(el('p', 'post__lead', copy.lead));
      (copy.body || []).forEach(function (para) {
        body.appendChild(el('p', null, para));
      });

      var where = (row.it.where || {})[k.lang];
      var hours = (row.it.hours || {})[k.lang];
      if (where || hours) {
        var w = el('p', 'post__where');
        if (where) w.appendChild(el('span', 'post__where-place', where));
        if (hours) w.appendChild(el('span', 'post__where-time', hours));
        body.appendChild(w);
      }

      if ((copy.facts || []).length) {
        var ul = el('ul', 'post__facts');
        copy.facts.forEach(function (f) { ul.appendChild(el('li', null, f)); });
        body.appendChild(ul);
      }

      if (row.it.link) {
        var a = el('a', 'arrow post__link', s.more + ' →');
        a.href = row.it.link;
        a.rel = 'noopener';
        body.appendChild(a);
      }

      art.appendChild(body);
      return art;
    }

    k.load(function (data) {
      var wrap = el('div', 'posts');
      k.rows(data).forEach(function (row, i) { wrap.appendChild(post(data, row, i)); });
      host.textContent = '';
      host.appendChild(wrap);

      var foot = el('p', 'news__foot');
      var when = data.updated
        ? k.parse(data.updated).toLocaleDateString(k.loc, { day: 'numeric', month: 'long', year: 'numeric' })
        : '';
      foot.appendChild(el('span', null, s.source + when));
      if (data.channel) {
        var a = el('a', 'btn btn--outline btn--sm', s.follow);
        a.href = data.channel;
        a.rel = 'noopener';
        foot.appendChild(a);
      }
      host.appendChild(foot);

      lightbox(host, s);

      // Posts are rendered after load, so the browser has already given up on
      // any #post-id in the URL. Honour it now that the target exists.
      if (location.hash.length > 1) {
        var target = document.getElementById(location.hash.slice(1));
        if (target) target.scrollIntoView({ block: 'start' });
      }

      // The posts arrive after reveal() has already run, so opt them in now.
      if (reduce || !('IntersectionObserver' in window)) {
        host.querySelectorAll('.rv').forEach(function (n) { n.classList.add('in'); });
      } else {
        var io = new IntersectionObserver(function (es) {
          es.forEach(function (e) {
            if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
          });
        }, { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
        host.querySelectorAll('.rv').forEach(function (n) { io.observe(n); });
      }
    });
  }

  /* ----------------------------------------------------------- lightbox -- */
  // <dialog> gives focus trapping, Esc and the backdrop for free, so this only
  // has to move between the photos of one post.
  function lightbox(host, s) {
    var shots = [].slice.call(host.querySelectorAll('.post__shot img, .post__thumb img'));
    if (!shots.length || !window.HTMLDialogElement) return;

    var dlg = document.createElement('dialog');
    dlg.className = 'lb';
    var img = document.createElement('img');
    img.className = 'lb__img';
    var cap = document.createElement('p');
    cap.className = 'lb__cap';
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'lb__x';
    close.setAttribute('aria-label', s.close);
    close.textContent = '×';
    var prev = document.createElement('button');
    prev.type = 'button';
    prev.className = 'lb__nav lb__nav--prev';
    prev.setAttribute('aria-label', s.prev);
    prev.textContent = '‹';
    var next = document.createElement('button');
    next.type = 'button';
    next.className = 'lb__nav lb__nav--next';
    next.setAttribute('aria-label', s.nextPhoto);
    next.textContent = '›';
    dlg.appendChild(close);
    dlg.appendChild(prev);
    dlg.appendChild(img);
    dlg.appendChild(next);
    dlg.appendChild(cap);
    document.body.appendChild(dlg);

    var group = [], at = 0;

    function show(i) {
      at = (i + group.length) % group.length;
      var src = group[at];
      img.src = src.currentSrc || src.src;
      img.alt = src.alt || '';
      cap.textContent = (src.alt || '') +
        (group.length > 1 ? '  (' + (at + 1) + ' ' + s.of + ' ' + group.length + ')' : '');
      var many = group.length > 1;
      prev.hidden = !many;
      next.hidden = !many;
    }

    shots.forEach(function (im) {
      var open = function (e) {
        e.preventDefault();
        var art = im.closest('.post');
        group = [].slice.call(art.querySelectorAll('.post__shot img, .post__thumb img'));
        show(group.indexOf(im));
        dlg.showModal();
      };
      var btn = im.closest('.post__thumb');
      if (btn) { btn.addEventListener('click', open); return; }
      im.style.cursor = 'zoom-in';
      im.addEventListener('click', open);
    });

    close.addEventListener('click', function () { dlg.close(); });
    prev.addEventListener('click', function () { show(at - 1); });
    next.addEventListener('click', function () { show(at + 1); });
    dlg.addEventListener('click', function (e) {
      // Clicking the backdrop closes; clicking the picture or a control does not.
      if (e.target === dlg) dlg.close();
    });
    dlg.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowLeft') { e.preventDefault(); show(at - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); show(at + 1); }
    });
  }

  function init() {
    nav(); header(); reveal(); counters(); copy(); year(); nextSunday();
    news(); blog();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
