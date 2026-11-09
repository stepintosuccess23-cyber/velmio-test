(function () {
  'use strict';

  var cfg = window.SITE_CONFIG || {};
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var store = {
    get: function (k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } },
    sessionGet: function (k) { try { return window.sessionStorage.getItem(k); } catch (e) { return null; } },
    sessionSet: function (k, v) { try { window.sessionStorage.setItem(k, v); } catch (e) { /* storage blocked */ } }
  };

  /* ---------- Analytics with consent ---------- */
  var CONSENT_KEY = 'vm_consent';
  var ids = {
    gtm: /^GTM-[A-Z0-9]+$/.test(cfg.gtmId || '') ? cfg.gtmId : '',
    pixel: /^\d{5,20}$/.test(cfg.metaPixelId || '') ? cfg.metaPixelId : '',
    ga4: /^G-[A-Z0-9]+$/.test(cfg.ga4Id || '') ? cfg.ga4Id : ''
  };
  var hasTracking = !!(ids.gtm || ids.pixel || ids.ga4);
  var analyticsReady = false;
  var analyticsDenied = false;
  var queue = [];
  var firedOnce = {};
  var META_STANDARD = { PageView: 1, ViewContent: 1, Lead: 1, InitiateCheckout: 1, Purchase: 1 };
  var GA4_NAMES = {
    ViewContent: 'view_content', LeadFormStart: 'lead_form_start', Lead: 'generate_lead',
    InitiateCheckout: 'begin_checkout', Purchase: 'purchase', CTA_Click: 'cta_click', Demo_Play: 'demo_play', Pricing_View: 'pricing_view',
    Studio_Open: 'studio_open', Generate_Start: 'generate_start', Video_Ready: 'video_ready', Video_Download: 'video_download', Script_Generated: 'script_generated', Contact_Submit: 'contact_submit', Chat_Open: 'chat_open', Chat_Message: 'chat_message'
  };

  function addScript(src) {
    var s = document.createElement('script');
    s.async = true;
    s.src = src;
    document.head.appendChild(s);
  }

  function loadAnalytics() {
    if (analyticsReady || !hasTracking) return;
    analyticsReady = true;
    window.dataLayer = window.dataLayer || [];
    if (ids.gtm) {
      window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
      addScript('https://www.googletagmanager.com/gtm.js?id=' + ids.gtm);
    } else {
      if (ids.ga4) {
        window.gtag = function () { window.dataLayer.push(arguments); };
        window.gtag('js', new Date());
        window.gtag('config', ids.ga4);
        addScript('https://www.googletagmanager.com/gtag/js?id=' + ids.ga4);
      }
      if (ids.pixel) {
        /* Meta Pixel base code */
        var n = window.fbq = function () {
          if (n.callMethod) n.callMethod.apply(n, arguments); else n.queue.push(arguments);
        };
        if (!window._fbq) window._fbq = n;
        n.push = n; n.loaded = true; n.version = '2.0'; n.queue = [];
        addScript('https://connect.facebook.net/en_US/fbevents.js');
        window.fbq('init', ids.pixel);
      }
    }
    var pending = queue;
    queue = [];
    pending.forEach(function (e) { send(e.name, e.params, e.eventId); });
  }

  function send(name, params, eventId) {
    if (ids.gtm) {
      var push = { event: name, event_id: eventId || undefined };
      Object.keys(params).forEach(function (k) { push[k] = params[k]; });
      window.dataLayer.push(push);
      return;
    }
    if (window.fbq) {
      window.fbq(META_STANDARD[name] ? 'track' : 'trackCustom', name, params, eventId ? { eventID: eventId } : undefined);
    }
    // GA4 records page_view itself through gtag('config').
    if (window.gtag && GA4_NAMES[name]) window.gtag('event', GA4_NAMES[name], params);
  }

  function track(name, params, opts) {
    opts = opts || {};
    params = params || {};
    var onceKey = opts.once ? name + ':' + (opts.key || '') : null;
    if (onceKey) {
      if (firedOnce[onceKey]) return;
      firedOnce[onceKey] = true;
    }
    if (!hasTracking || analyticsDenied) return;
    if (analyticsReady) send(name, params, opts.eventId);
    else queue.push({ name: name, params: params, eventId: opts.eventId });
  }

  function initConsent() {
    var banner = $('#cookie-banner');
    var settings = $('[data-cookie-settings]');
    if (!hasTracking) return;

    function decide(choice) {
      store.set(CONSENT_KEY, choice);
      banner.hidden = true;
      updateSticky();
      if (choice === 'granted') {
        analyticsDenied = false;
        loadAnalytics();
      } else if (analyticsReady) {
        // Scripts already running can only be removed by a fresh page load.
        window.location.reload();
      } else {
        analyticsDenied = true;
        queue = [];
      }
    }

    if (cfg.requireConsent === false) { loadAnalytics(); return; }

    if (settings) settings.hidden = false;
    if (settings) settings.addEventListener('click', function () { banner.hidden = false; updateSticky(); });
    $$('[data-consent]', banner).forEach(function (b) {
      b.addEventListener('click', function () { decide(b.getAttribute('data-consent')); });
    });

    var saved = store.get(CONSENT_KEY);
    if (saved === 'granted') loadAnalytics();
    else if (saved === 'denied') analyticsDenied = true;
    else banner.hidden = false;
  }

  /* ---------- Editable contact details ---------- */
  function initContact() {
    var email = (cfg.contactEmail || '').trim();
    var phone = (cfg.contactPhone || '').trim();
    function fill(type, value, href) {
      $$('[data-contact="' + type + '"]').forEach(function (a) { a.textContent = value; a.href = href; });
      $$('[data-contact-row="' + type + '"]').forEach(function (r) { r.hidden = false; });
    }
    if (email) fill('email', email, 'mailto:' + email);
    if (phone) fill('phone', phone, 'tel:' + phone.replace(/[^\d+]/g, ''));
  }

  /* ---------- Navigation ---------- */
  function initNav() {
    var wrap = $('[data-nav]');
    var burger = $('[data-nav-burger]');
    if (!wrap || !burger) return;
    var onScroll = function () { wrap.classList.toggle('is-stuck', window.scrollY > 24); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();

    function setOpen(open) {
      wrap.classList.toggle('is-open', open);
      burger.setAttribute('aria-expanded', String(open));
      burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    }
    burger.addEventListener('click', function () { setOpen(!wrap.classList.contains('is-open')); });
    $$('#nav-links a').forEach(function (a) { a.addEventListener('click', function () { setOpen(false); }); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && wrap.classList.contains('is-open')) { setOpen(false); burger.focus(); }
    });
    document.addEventListener('click', function (e) {
      if (wrap.classList.contains('is-open') && !wrap.contains(e.target)) setOpen(false);
    });
  }

  /* ---------- Scroll reveal ---------- */
  function initReveal() {
    if (!document.documentElement.classList.contains('motion')) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    $$('.reveal').forEach(function (el) { io.observe(el); });
  }

  /* ---------- Players ---------- */
  var players = [];

  function formatTime(ms) {
    var s = Math.floor(ms / 1000);
    return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
  }

  function createPlayer(el) {
    var id = el.getAttribute('data-player');
    var video = $('video', el);
    var toggle = $('[data-player-toggle]', el);
    var fill = $('[data-player-fill]', el);
    var timeEl = $('[data-player-time]', el);
    var label = el.getAttribute('aria-label');
    var api = { id: id, el: el, playing: false, userPaused: false, play: play, pause: pause };

    var slides = $$('.player-slide', el);
    var slideMs = parseInt(el.getAttribute('data-slide-ms'), 10) || 2400;
    var total = slides.length * slideMs;
    var index = 0, elapsed = 0, last = 0, raf = 0;

    function loadSlide(i) {
      var img = slides[i] && $('img[data-src]', slides[i]);
      if (img) { img.src = img.getAttribute('data-src'); img.removeAttribute('data-src'); }
    }

    function showSlide(i) {
      slides[index].classList.remove('is-on');
      index = i;
      slides[index].classList.add('is-on');
      loadSlide((index + 1) % slides.length);
      el.dispatchEvent(new CustomEvent('slidechange', { detail: { index: index, line: slides[index].getAttribute('data-line') } }));
    }

    function paint() {
      fill.style.transform = 'scaleX(' + (elapsed / total) + ')';
      timeEl.textContent = formatTime(elapsed);
    }

    function tick(now) {
      // A frame's timestamp can be slightly earlier than the moment play started.
      elapsed = (elapsed + Math.max(0, Math.min(now - last, 100))) % total;
      last = now;
      var next = Math.floor(elapsed / slideMs);
      if (next !== index) showSlide(next);
      paint();
      raf = window.requestAnimationFrame(tick);
    }

    function setMuted(on) {
      var button = $('[data-player-mute]', el);
      video.muted = on;
      button.setAttribute('aria-pressed', String(!on));
      button.setAttribute('aria-label', on ? 'Turn sound on' : 'Turn sound off');
    }

    function setState(playing) {
      api.playing = playing;
      el.classList.toggle('is-playing', playing);
      toggle.setAttribute('aria-label', (playing ? 'Pause ' : 'Play ') + label);
      el.dispatchEvent(new CustomEvent('playstate', { detail: { playing: playing } }));
    }

    function play() {
      if (api.playing) return;
      players.forEach(function (p) { if (p !== api) p.pause(); });
      setState(true);
      track('Demo_Play', { player: id }, { once: true, key: id });
      if (video) {
        var attempt = video.play();
        if (attempt && attempt.catch) attempt.catch(function () { setState(false); });
        return;
      }
      loadSlide(index);
      loadSlide((index + 1) % slides.length);
      last = window.performance.now();
      raf = window.requestAnimationFrame(tick);
    }

    function pause() {
      if (!api.playing) return;
      setState(false);
      if (video) video.pause();
      else window.cancelAnimationFrame(raf);
    }

    if (video) {
      video.addEventListener('timeupdate', function () {
        if (video.duration) fill.style.transform = 'scaleX(' + (video.currentTime / video.duration) + ')';
        timeEl.textContent = formatTime(video.currentTime * 1000);
      });
      var mute = $('[data-player-mute]', el);
      if (mute) mute.addEventListener('click', function () { setMuted(!video.muted); });
    }

    toggle.addEventListener('click', function () {
      if (api.playing) { api.userPaused = true; pause(); }
      else {
        api.userPaused = false;
        // Someone who presses play on an example wants to hear it.
        if (video && el.getAttribute('data-autoplay') !== 'true') setMuted(false);
        play();
      }
    });

    var auto = el.getAttribute('data-autoplay') === 'true' && !reducedMotion;
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        var visible = entries[entries.length - 1].isIntersecting;
        if (!visible) pause();
        else if (auto && !api.userPaused) play();
      }, { threshold: 0.35 }).observe(el);
    }

    players.push(api);
    return api;
  }

  function initPlayers() {
    $$('[data-player]').forEach(createPlayer);

    var demo = $('[data-demo]');
    if (!demo) return;
    var demoPlayer = players.filter(function (p) { return p.id === 'demo'; })[0];
    var thumbs = $$('.demo-thumb', demo);

    demoPlayer.el.addEventListener('slidechange', function (e) {
      thumbs.forEach(function (t, i) { t.classList.toggle('is-on', i === e.detail.index); });
    });
    demoPlayer.el.addEventListener('playstate', function (e) {
      demo.classList.toggle('is-playing', e.detail.playing);
    });

    // The panel settles from a slight tilt as it scrolls into full view.
    if (document.documentElement.classList.contains('motion')) {
      new IntersectionObserver(function (entries) {
        if (entries[entries.length - 1].isIntersecting) demo.classList.add('is-settled');
      }, { threshold: 0.5 }).observe(demo);
    }
  }

  /* ---------- Conversion helpers ---------- */
  var updateSticky = function () {};

  function initSticky() {
    var bar = $('[data-sticky-cta]');
    var hero = $('#hero-cta');
    var lead = $('.final');
    if (!bar || !hero || !lead || !('IntersectionObserver' in window)) return;
    var heroVisible = true, leadVisible = false, orderVisible = false;
    updateSticky = function () {
      var banner = $('#cookie-banner');
      bar.hidden = heroVisible || leadVisible || orderVisible || (banner && !banner.hidden);
    };
    new IntersectionObserver(function (e) { orderVisible = e[e.length - 1].isIntersecting; updateSticky(); }).observe($('#start'));
    new IntersectionObserver(function (e) { heroVisible = e[e.length - 1].isIntersecting; updateSticky(); }).observe(hero);
    new IntersectionObserver(function (e) { leadVisible = e[e.length - 1].isIntersecting; updateSticky(); }).observe(lead);
  }

  function initCTAs() {
    $$('[data-cta]').forEach(function (a) {
      a.addEventListener('click', function () {
        track('CTA_Click', { placement: a.getAttribute('data-cta') });
      });
    });
  }

  function initViewEvents() {
    if (!('IntersectionObserver' in window)) return;
    [['#demo', 'ViewContent', { content_name: 'demo' }], ['#pricing', 'Pricing_View', {}]].forEach(function (cfgRow) {
      var el = $(cfgRow[0]);
      if (!el) return;
      var io = new IntersectionObserver(function (e) {
        if (e[0].isIntersecting) { track(cfgRow[1], cfgRow[2], { once: true }); io.disconnect(); }
      }, { threshold: 0.1 });
      io.observe(el);
    });
  }

  /* ---------- First-touch campaign attribution ---------- */
  var ATTR_KEY = 'vm_attribution';
  var ATTR_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid'];
  var ATTR_MAX_AGE = 90 * 24 * 60 * 60 * 1000;

  function captureAttribution() {
    var params = new URLSearchParams(window.location.search);
    var current = { landing_page: window.location.origin + window.location.pathname, ts: Date.now() };
    var hasCampaign = false;
    ATTR_FIELDS.forEach(function (k) {
      var v = params.get(k);
      if (v) { current[k] = v.slice(0, 200); hasCampaign = true; }
    });
    var saved = null;
    try { saved = JSON.parse(store.get(ATTR_KEY)); } catch (e) { saved = null; }
    var valid = saved && saved.ts && Date.now() - saved.ts < ATTR_MAX_AGE;
    // Keep the first campaign that brought this visitor here.
    if (valid && (saved.hasCampaign || !hasCampaign)) return saved;
    current.hasCampaign = hasCampaign;
    store.set(ATTR_KEY, JSON.stringify(current));
    return current;
  }

  /* ---------- Order: details and files, package, payment ---------- */
  var pageLoadedAt = Date.now();

  function initOrderForm(attribution) {
    var form = $('#order-form');
    if (!form) return;
    var MAX_FILE = 10 * 1024 * 1024;
    var PRICES = { single: 120, double: 199 };
    var progress = $('#ob-progress'), review = $('#ob-review'), payment = $('#ob-payment'), done = $('#ob-done');
    var submit = $('#ob-submit'), formError = $('#ob-error'), payButton = $('#ob-pay'), payError = $('#ob-pay-error');
    var label = submit.textContent, payLabel = payButton.textContent;
    var order = null, busy = false, analysis = null, needDetails = false;
    var EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/svg+xml': 'svg' };
    var uploads = [
      { id: 'o-logo', base: 'logo', max: 1 },
      { id: 'o-photos', base: 'business', max: 6 },
      { id: 'o-products', base: 'product', max: 6 }
    ];
    var rules = [
      { id: 'o-name', test: function (v) { return v.length >= 2; }, msg: 'Enter your full name.' },
      { id: 'o-business', test: function (v) { return v.length >= 2; }, msg: 'Enter your business name.' },
      { id: 'o-website', test: function (v) { return /^(https?:\/\/)?[^\s.]+\.[^\s]{2,}$/i.test(v); }, msg: 'Enter your website address, like yourbusiness.com.' },
      { id: 'o-category', test: function (v) { return v.length > 0; }, msg: 'Choose a business category.' },
      { id: 'o-email', test: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }, msg: 'Enter a valid email address, like you@business.com.' },
      { id: 'o-phone', test: function (v) { return /^\+?[\d\s().-]{7,24}$/.test(v); }, msg: 'Enter a phone or WhatsApp number.' }
    ];

    function value(id) { return document.getElementById(id).value.trim(); }
    function setStep(n) { $$('.ob-steps li').forEach(function (li, i) { li.classList.toggle('is-on', i <= n); }); }
    // 'instant' because the page's smooth scrolling is too slow for a jump this long.
    function showCard() { $('.ob-card').scrollIntoView({ behavior: 'instant', block: 'start' }); }
    function showError(rule, message) {
      var input = document.getElementById(rule.id), error = document.getElementById(rule.id + '-error');
      error.textContent = message || '';
      error.hidden = !message;
      if (message) { input.setAttribute('aria-invalid', 'true'); input.setAttribute('aria-describedby', error.id); }
      else { input.removeAttribute('aria-invalid'); input.removeAttribute('aria-describedby'); }
    }
    function send(data, ms) {
      var endpoint = (cfg.formEndpoint || '').trim();
      if (!endpoint) return Promise.reject(new Error('unavailable'));
      var controller = window.AbortController ? new AbortController() : null;
      var timeout = controller ? window.setTimeout(function () { controller.abort(); }, ms || 30000) : 0;
      return window.fetch(endpoint, { method: 'POST', body: data, redirect: 'follow', signal: controller ? controller.signal : undefined })
        .then(function (res) { window.clearTimeout(timeout); return res.json(); }, function (err) { window.clearTimeout(timeout); throw err; });
    }
    function failure(message) { var e = new Error('order'); e.shown = message; return e; }
    function problem(result) {
      if (result && result.error === 'validation') return 'Please check your details and try again.';
      if (result && result.error === 'rate_limited') return 'You\'ve reached the limit for now. Please try again later.';
      return 'We couldn\'t save your details. Please try again.';
    }
    function offline(err) {
      return err && err.message === 'unavailable' ? 'Orders can\'t be sent right now. Please try again a little later.' : 'We couldn\'t reach our server. Check your connection and try again.';
    }
    function setProgress(fraction, text) {
      var percent = Math.round(fraction * 100);
      $('#ob-percent').textContent = percent + '%';
      $('#ob-bar i').style.width = percent + '%';
      $('#ob-bar').setAttribute('aria-valuenow', String(percent));
      if (text) $('#ob-status').textContent = text;
    }
    function orderFields(name) {
      var data = new URLSearchParams();
      data.set('form', name);
      data.set('order_id', order.id);
      data.set('token', order.token);
      return data;
    }

    /* Files */
    function filesProblem(item) {
      var files = Array.prototype.slice.call(document.getElementById(item.id).files);
      if (files.length > item.max) return 'You can add up to 6 images in each box.';
      var bad = files.some(function (f) { return !EXT[f.type] || (f.type === 'image/svg+xml' && item.base !== 'logo') || f.size > MAX_FILE; });
      return bad ? 'Use JPG, PNG, or WebP images under 10 MB.' : '';
    }
    uploads.forEach(function (item) {
      var input = document.getElementById(item.id), count = $('[data-file-count="' + item.id + '"]');
      input.addEventListener('change', function () {
        var message = filesProblem(item), error = document.getElementById(item.id + '-error');
        error.textContent = message;
        error.hidden = !message;
        count.textContent = input.files.length ? input.files.length + ' selected' : 'No file chosen';
      });
    });
    function toBase64(file) {
      return new Promise(function (resolve, reject) {
        var reader = new FileReader();
        reader.onload = function () { resolve(String(reader.result).split(',')[1]); };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }
    function chosenFiles() {
      var list = [];
      uploads.forEach(function (item) {
        Array.prototype.slice.call(document.getElementById(item.id).files).forEach(function (file, i) {
          var number = i + 1 < 10 ? '0' + (i + 1) : String(i + 1);
          list.push({ file: file, name: (item.base === 'logo' ? 'logo' : item.base + '-' + number) + '.' + EXT[file.type] });
        });
      });
      return list;
    }

    /* Steps */
    function startOrder() {
      if (order) return Promise.resolve();
      var data = new URLSearchParams();
      data.set('form', 'order_start');
      [['full_name', 'o-name'], ['business', 'o-business'], ['website', 'o-website'], ['category', 'o-category'], ['email', 'o-email'], ['phone', 'o-phone'],
       ['description', 'o-description'], ['instagram', 'o-instagram'], ['facebook', 'o-facebook'], ['language', 'o-language'], ['audience', 'o-audience'], ['objective', 'o-objective']
      ].forEach(function (pair) { data.set(pair[0], value(pair[1])); });
      data.set('company', $('#o-company').value);
      data.set('consent', 'yes');
      ATTR_FIELDS.forEach(function (k) { if (attribution[k]) data.set(k, attribution[k]); });
      data.set('landing_page', attribution.landing_page || window.location.href);
      data.set('elapsed_ms', String(Date.now() - pageLoadedAt));
      return send(data).then(function (result) {
        if (!result || result.ok !== true || !result.order_id) throw failure(problem(result));
        order = { id: result.order_id, token: result.token, email: value('o-email').toLowerCase(), ai: !!result.ai };
        if (result.lead_created) track('Lead', { content_name: 'order_form' }, { once: true, eventId: result.order_id });
      });
    }
    function uploadFiles() {
      var list = chosenFiles();
      return list.reduce(function (chain, item, i) {
        return chain.then(function () {
          setProgress(i / list.length, 'Uploading file ' + (i + 1) + ' of ' + list.length + '…');
          return toBase64(item.file).then(function (content) {
            var data = orderFields('order_file');
            data.set('name', item.name);
            data.set('mime', item.file.type);
            data.set('data', content);
            return send(data, 120000);
          }).then(function (result) {
            if (!result || result.ok !== true) throw failure(problem(result));
            setProgress((i + 1) / list.length);
          });
        });
      }, Promise.resolve());
    }
    function analyze() {
      if (!order.ai) return Promise.resolve();
      setProgress(1, 'Understanding your business…');
      return send(orderFields('order_analyze'), 90000).then(function (result) {
        analysis = (result && result.analysis) || null;
        needDetails = !!(result && result.need_details);
      }, function () { /* the order continues without it */ });
    }
    function fillAnalysis() {
      $('#ob-analysis').hidden = !analysis;
      $('#ob-need-details').hidden = !needDetails;
      if (!analysis) return;
      $('#ob-a-business').textContent = analysis.business;
      $('#ob-a-audience').textContent = analysis.audience;
      $('#ob-a-opportunity').textContent = analysis.opportunity;
      $('#ob-a-concept').textContent = analysis.concept;
      var list = $('#ob-a-found');
      list.textContent = '';
      (analysis.discoveries || []).forEach(function (line) {
        var li = document.createElement('li');
        li.textContent = line;
        list.appendChild(li);
      });
    }
    function showReview() {
      form.hidden = true;
      progress.hidden = true;
      review.hidden = false;
      busy = false;
      setStep(1);
      fillAnalysis();
      showCard();
    }
    function showDone() {
      form.hidden = true;
      progress.hidden = true;
      review.hidden = true;
      payment.hidden = true;
      done.hidden = false;
      setStep(3);
      $('#ob-order-id').textContent = order.id;
      $('#ob-sent').textContent = 'We\'ve sent a confirmation to ' + order.email + '.';
      $('h3', done).focus({ preventScroll: true });
      showCard();
    }
    function selectedPlan() { return $('#ob-plan-double').checked ? 'double' : 'single'; }
    function payFailed(message) {
      busy = false;
      payButton.disabled = false;
      payButton.textContent = payLabel;
      payError.textContent = message;
      payError.hidden = false;
    }

    rules.forEach(function (rule) {
      var input = document.getElementById(rule.id);
      input.addEventListener('input', function () { if (input.getAttribute('aria-invalid') && rule.test(input.value.trim())) showError(rule, ''); });
    });
    form.addEventListener('focusin', function () { track('LeadFormStart', {}, { once: true }); }, { once: true });
    $$('[data-pick-plan]').forEach(function (link) {
      link.addEventListener('click', function () { $('#ob-plan-' + link.getAttribute('data-pick-plan')).checked = true; });
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (busy) return;
      formError.hidden = true;
      var firstBad = null;
      rules.forEach(function (rule) {
        var input = document.getElementById(rule.id), ok = rule.test(input.value.trim());
        showError(rule, ok ? '' : rule.msg);
        if (!ok && !firstBad) firstBad = input;
      });
      uploads.forEach(function (item) {
        var message = filesProblem(item), error = document.getElementById(item.id + '-error');
        error.textContent = message;
        error.hidden = !message;
        if (message && !firstBad) firstBad = document.getElementById(item.id);
      });
      if (firstBad) { firstBad.focus(); return; }

      busy = true;
      submit.disabled = true;
      form.hidden = true;
      progress.hidden = false;
      setProgress(0, 'Saving your details…');
      startOrder().then(uploadFiles).then(analyze).then(showReview).catch(function (err) {
        busy = false;
        submit.disabled = false;
        submit.textContent = label;
        progress.hidden = true;
        form.hidden = false;
        formError.textContent = err && err.shown ? err.shown : offline(err);
        formError.hidden = false;
      });
    });

    /* The payment page is a test: card details stay in this page and are never sent or saved. */
    var TEST_CARD = '4242424242424242';
    var billingRules = [
      { id: 'b-name', test: function (v) { return v.length >= 2; }, msg: 'Enter the billing name.' },
      { id: 'b-address', test: function (v) { return v.length >= 3; }, msg: 'Enter your street address.' },
      { id: 'b-city', test: function (v) { return v.length > 0; }, msg: 'Enter your city.' },
      { id: 'b-postal', test: function (v) { return v.length > 0; }, msg: 'Enter your postal code.' },
      { id: 'b-country', test: function (v) { return v.length > 1; }, msg: 'Enter your country.' }
    ];
    function expiryOk(v) {
      var m = v.match(/^(\d{2})\/(\d{2})$/);
      if (!m || Number(m[1]) < 1 || Number(m[1]) > 12) return false;
      var now = new Date();
      var year = 2000 + Number(m[2]);
      return year > now.getFullYear() || (year === now.getFullYear() && Number(m[1]) >= now.getMonth() + 1);
    }
    var cardRules = [
      { id: 'c-number', test: function (v) { return v.replace(/\s/g, '') === TEST_CARD; }, msg: 'This is a test page. Use the test card number 4242 4242 4242 4242.' },
      { id: 'c-expiry', test: expiryOk, msg: 'Enter a valid expiry date, like 12/30.' },
      { id: 'c-cvc', test: function (v) { return /^\d{3,4}$/.test(v); }, msg: 'Enter the 3 or 4 digit security code.' }
    ];
    function clearCard() { cardRules.forEach(function (rule) { document.getElementById(rule.id).value = ''; showError(rule, ''); }); }
    billingRules.concat(cardRules).forEach(function (rule) {
      var input = document.getElementById(rule.id);
      input.addEventListener('input', function () { if (input.getAttribute('aria-invalid') && rule.test(input.value.trim())) showError(rule, ''); });
    });
    $('#c-number').addEventListener('input', function () {
      this.value = this.value.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ');
    });
    $('#c-expiry').addEventListener('input', function () {
      var digits = this.value.replace(/\D/g, '').slice(0, 4);
      this.value = digits.length > 2 ? digits.slice(0, 2) + '/' + digits.slice(2) : digits;
    });
    $('#c-cvc').addEventListener('input', function () { this.value = this.value.replace(/\D/g, '').slice(0, 4); });
    $('#ob-test-card').addEventListener('click', function () {
      var next = String((new Date().getFullYear() + 2) % 100);
      $('#c-number').value = '4242 4242 4242 4242';
      $('#c-expiry').value = '12/' + (next.length < 2 ? '0' + next : next);
      $('#c-cvc').value = '123';
      cardRules.forEach(function (rule) { showError(rule, ''); });
    });

    function showPayment() {
      order.plan = selectedPlan();
      review.hidden = true;
      payment.hidden = false;
      setStep(2);
      $$('[data-sum-plan]').forEach(function (n) { n.hidden = n.getAttribute('data-sum-plan') !== order.plan; });
      payLabel = 'Pay $' + PRICES[order.plan];
      payButton.textContent = payLabel;
      if (!$('#b-name').value) $('#b-name').value = value('o-name');
      track('InitiateCheckout', { value: PRICES[order.plan], currency: 'USD', content_name: order.plan }, { once: true, key: order.id });
      showCard();
    }
    $('#ob-to-pay').addEventListener('click', function () { if (order) showPayment(); });
    $('#ob-back').addEventListener('click', function () {
      if (busy) return;
      clearCard();
      payError.hidden = true;
      payment.hidden = true;
      review.hidden = false;
      setStep(1);
      showCard();
    });

    payButton.addEventListener('click', function () {
      if (busy || !order) return;
      payError.hidden = true;
      var firstBad = null;
      billingRules.concat(cardRules).forEach(function (rule) {
        var input = document.getElementById(rule.id), ok = rule.test(input.value.trim());
        showError(rule, ok ? '' : rule.msg);
        if (!ok && !firstBad) firstBad = input;
      });
      if (!cardRules[0].test($('#c-number').value)) $('#c-number').value = '';
      if (firstBad) { firstBad.focus(); return; }

      busy = true;
      payButton.disabled = true;
      payButton.textContent = 'Processing your payment…';
      var data = orderFields('order_paid');
      data.set('plan', order.plan);
      data.set('billing_name', value('b-name'));
      data.set('billing_address', value('b-address'));
      data.set('billing_city', value('b-city'));
      data.set('billing_region', value('b-region'));
      data.set('billing_postal', value('b-postal'));
      data.set('billing_country', value('b-country'));
      send(data).then(function (result) {
        if (!result || result.ok !== true) { payFailed(problem(result)); return; }
        busy = false;
        clearCard();
        showDone();
      }, function (err) { payFailed(offline(err)); });
    });
  }

  /* ---------- Contact form ---------- */
  function initContactForm() {
    var form = $('#contact-form');
    if (!form) return;
    var done = $('#contact-done');
    var submit = $('#contact-submit');
    var formError = $('#contact-error');
    var submitLabel = submit.textContent;
    var submitting = false;
    var rules = [
      { id: 'contact-name', test: function (v) { return v.length >= 2; }, msg: 'Enter your full name.' },
      { id: 'contact-email', test: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }, msg: 'Enter a valid email address, like you@business.com.' },
      { id: 'contact-message', test: function (v) { return v.length >= 2; }, msg: 'Enter your message.' }
    ];

    function setError(rule, message) {
      var input = document.getElementById(rule.id);
      var error = document.getElementById(rule.id + '-error');
      error.textContent = message || '';
      error.hidden = !message;
      if (message) {
        input.setAttribute('aria-invalid', 'true');
        input.setAttribute('aria-describedby', error.id);
      } else {
        input.removeAttribute('aria-invalid');
        input.removeAttribute('aria-describedby');
      }
    }
    function showError(message) { formError.textContent = message; formError.hidden = false; }
    function setSubmitting(state) {
      submitting = state;
      submit.disabled = state;
      submit.textContent = state ? 'Sending…' : submitLabel;
    }

    rules.forEach(function (rule) {
      var input = document.getElementById(rule.id);
      input.addEventListener('input', function () {
        if (input.getAttribute('aria-invalid') && rule.test(input.value.trim())) setError(rule, '');
      });
    });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (submitting) return;
      formError.hidden = true;
      var firstBad = null;
      rules.forEach(function (rule) {
        var input = document.getElementById(rule.id);
        var ok = rule.test(input.value.trim());
        setError(rule, ok ? '' : rule.msg);
        if (!ok && !firstBad) firstBad = input;
      });
      if (firstBad) { firstBad.focus(); return; }

      var endpoint = (window.SITE_CONFIG || {}).formEndpoint;
      if (!endpoint) {
        window.console.warn('SITE_CONFIG.formEndpoint is empty. Add it in assets/js/config.js to receive messages.');
        showError('Messages can\'t be sent right now. Please try again a little later.');
        return;
      }

      var address = $('#contact-email').value.trim().toLowerCase();
      var data = new URLSearchParams();
      data.set('form', 'contact');
      data.set('full_name', $('#contact-name').value.trim());
      data.set('email', address);
      var topic = $('#contact-topic');
      data.set('message', (topic ? '[' + topic.value + '] ' : '') + $('#contact-message').value.trim());
      data.set('company', $('#contact-company').value);
      data.set('language', window.VelmioI18n ? window.VelmioI18n.lang : 'en');
      data.set('page', window.location.origin + window.location.pathname);
      data.set('elapsed_ms', String(Date.now() - pageLoadedAt));

      setSubmitting(true);
      var controller = window.AbortController ? new AbortController() : null;
      var timeout = controller ? window.setTimeout(function () { controller.abort(); }, 20000) : 0;
      window.fetch(endpoint, { method: 'POST', body: data, redirect: 'follow', signal: controller ? controller.signal : undefined })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        })
        .then(function (result) {
          window.clearTimeout(timeout);
          if (!result || result.ok !== true) {
            setSubmitting(false);
            showError(result && result.error === 'validation' ? 'Please check your details and try again.' : 'We couldn\'t send your message. Please try again.');
            return;
          }
          $('#contact-done-title').textContent = 'Thanks. We got your message.';
          $('#contact-done-body').textContent = 'We\'ll reply to ' + address + ' as soon as we can.';
          $('#contact-title').hidden = true;
          form.hidden = true;
          done.hidden = false;
          done.focus();
          track('Contact_Submit', {}, { once: true });
        })
        .catch(function () {
          window.clearTimeout(timeout);
          setSubmitting(false);
          showError('We couldn\'t reach our server. Check your connection and try again.');
        });
    });
  }

  /* ---------- Light and dark mode ---------- */
  function initTheme() {
    var rootEl = document.documentElement;
    var meta = $('meta[name="theme-color"]');
    var toggles = $$('[data-theme-toggle]');
    function isLight() { return rootEl.getAttribute('data-theme') === 'light'; }
    function refresh() {
      if (meta) meta.setAttribute('content', isLight() ? '#F7F5FD' : '#101426');
      toggles.forEach(function (b) { b.setAttribute('aria-label', isLight() ? 'Switch to dark mode' : 'Switch to light mode'); });
    }
    toggles.forEach(function (b) {
      b.addEventListener('click', function () {
        if (isLight()) rootEl.removeAttribute('data-theme'); else rootEl.setAttribute('data-theme', 'light');
        store.set('vm_theme', isLight() ? 'light' : 'dark');
        refresh();
      });
    });
    refresh();
  }

  /* ---------- Signed-in shortcuts in the public navigation ---------- */
  /* ---------- Start ---------- */
  window.velmioTrack = track;
  initTheme();
  initContact();
  initNav();
  initReveal();
  initPlayers();
  initSticky();
  initCTAs();
  initViewEvents();
  var firstTouch = captureAttribution();
  initOrderForm(firstTouch);
  initContactForm();
  initConsent();
  track('PageView', {}, { once: true });
})();
