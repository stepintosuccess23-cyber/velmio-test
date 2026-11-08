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
  var META_STANDARD = { PageView: 1, ViewContent: 1, Lead: 1 };
  var GA4_NAMES = {
    ViewContent: 'view_content', LeadFormStart: 'lead_form_start', Lead: 'generate_lead',
    CTA_Click: 'cta_click', Demo_Play: 'demo_play', Pricing_View: 'pricing_view',
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
      if (mute) {
        mute.addEventListener('click', function () {
          video.muted = !video.muted;
          mute.setAttribute('aria-pressed', String(!video.muted));
          mute.setAttribute('aria-label', video.muted ? 'Turn sound on' : 'Turn sound off');
        });
      }
    }

    toggle.addEventListener('click', function () {
      if (api.playing) { api.userPaused = true; pause(); }
      else { api.userPaused = false; play(); }
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
    var heroVisible = true, leadVisible = false;
    updateSticky = function () {
      var banner = $('#cookie-banner');
      bar.hidden = heroVisible || leadVisible || (banner && !banner.hidden);
    };
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

  /* ---------- Sign up / log in ---------- */
  var pageLoadedAt = Date.now();
  var AUTH_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:';

  function initSignup(attribution) {
    var form = $('#signup-form');
    if (!form) return;
    if (store.get('vm_user')) { window.location.replace(form.getAttribute('data-next')); return; }

    var apiKey = (cfg.firebaseApiKey || '').trim();
    var email = $('#email');
    var password = $('#password');
    var submit = $('#auth-submit');
    var formError = $('#auth-error');
    var note = $('#auth-note');
    var eye = $('#auth-eye');
    var googleWrap = $('#auth-google');
    var googleBtn = $('#auth-google-btn');
    var query = new URLSearchParams(window.location.search);
    var mode = 'signup';
    var busy = false;

    var plan = query.get('plan');
    if (plan !== 'single' && plan !== 'monthly') plan = '';
    if (plan) {
      var chip = $('[data-plan-chip="' + plan + '"]');
      if (chip) chip.hidden = false;
    }

    var emailRule = { id: 'email', test: function (v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }, msg: 'Enter a valid email address, like you@business.com.' };
    var passwordRule = {
      id: 'password',
      test: function () { return mode === 'login' ? password.value.length > 0 : password.value.length >= 8; },
      msg: function () { return mode === 'login' ? 'Enter your password.' : 'Enter a password with at least 8 characters.'; }
    };
    function ruleMessage(rule) { return typeof rule.msg === 'function' ? rule.msg() : rule.msg; }

    function setError(id, message) {
      var input = document.getElementById(id);
      var error = document.getElementById(id + '-error');
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

    function showFormError(message) { note.hidden = true; formError.textContent = message; formError.hidden = false; }
    function showNote(message) { formError.hidden = true; note.textContent = message; note.hidden = false; }
    function clearMessages() { formError.hidden = true; note.hidden = true; }
    function unavailableMessage() { return mode === 'login' ? 'Sign-in isn\'t available right now. Please try again a little later.' : 'Sign-up isn\'t available right now. Please try again a little later.'; }

    function setBusy(state) {
      busy = state;
      submit.disabled = state;
      submit.classList.toggle('is-busy', state);
      googleBtn.disabled = state;
    }

    function setMode(next) {
      mode = next === 'login' ? 'login' : 'signup';
      $$('[data-for]').forEach(function (el) { el.hidden = el.getAttribute('data-for') !== mode; });
      password.setAttribute('autocomplete', mode === 'login' ? 'current-password' : 'new-password');
      password.setAttribute('placeholder', mode === 'login' ? 'Your password' : 'At least 8 characters');
      clearMessages();
      setError('email', '');
      setError('password', '');
    }

    /* Passwords go only to Firebase Authentication, never to the form endpoint. */
    function authRequest(method, body) {
      var controller = window.AbortController ? new AbortController() : null;
      var timeout = controller ? window.setTimeout(function () { controller.abort(); }, 20000) : 0;
      return window.fetch(AUTH_URL + method + '?key=' + encodeURIComponent(apiKey), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller ? controller.signal : undefined
      }).then(function (res) {
        return res.json().then(function (data) {
          window.clearTimeout(timeout);
          if (res.ok) return data;
          var failure = new Error('auth');
          failure.code = String((data && data.error && data.error.message) || 'UNKNOWN').split(' ')[0];
          throw failure;
        });
      }, function (err) {
        window.clearTimeout(timeout);
        throw err;
      });
    }

    function authErrorMessage(err) {
      switch (err.code) {
        case undefined: return 'We couldn\'t reach our server. Check your connection and try again.';
        case 'EMAIL_EXISTS': return 'An account with this email already exists. Log in instead.';
        case 'INVALID_LOGIN_CREDENTIALS':
        case 'EMAIL_NOT_FOUND':
        case 'INVALID_PASSWORD': return 'That email or password isn\'t right.';
        case 'TOO_MANY_ATTEMPTS_TRY_LATER': return 'Too many attempts. Please wait a few minutes and try again.';
        case 'USER_DISABLED': return 'This account has been turned off. Contact us for help.';
        case 'WEAK_PASSWORD': return 'Choose a stronger password.';
        default: return unavailableMessage();
      }
    }

    function failAuth(err) {
      setBusy(false);
      if (err.code === 'INVALID_EMAIL' || err.code === 'MISSING_EMAIL') { setError('email', emailRule.msg); email.focus(); return; }
      showFormError(authErrorMessage(err));
    }

    /* Records a new account in the Sheet. The password is never part of this. */
    function saveLead(idToken) {
      var endpoint = (cfg.formEndpoint || '').trim();
      if (!endpoint) {
        window.console.warn('SITE_CONFIG.formEndpoint is empty. Add it in assets/js/config.js to receive sign-ups.');
        return Promise.resolve();
      }
      var data = new URLSearchParams();
      data.set('firebase_token', idToken);
      data.set('company', $('#company').value);
      data.set('consent', 'yes');
      data.set('interest', plan);
      ATTR_FIELDS.forEach(function (k) { if (attribution[k]) data.set(k, attribution[k]); });
      data.set('landing_page', attribution.landing_page || window.location.href);
      data.set('elapsed_ms', String(Date.now() - pageLoadedAt));

      var controller = window.AbortController ? new AbortController() : null;
      var timeout = controller ? window.setTimeout(function () { controller.abort(); }, 12000) : 0;
      return window.fetch(endpoint, { method: 'POST', body: data, redirect: 'follow', signal: controller ? controller.signal : undefined })
        .then(function (res) { return res.json(); })
        .then(function (result) {
          window.clearTimeout(timeout);
          if (result && result.ok === true && result.status === 'created' && !store.sessionGet('vm_lead_sent')) {
            store.sessionSet('vm_lead_sent', '1');
            track('Lead', { content_name: 'signup', plan: plan }, { once: true, eventId: result.id || ('lead-' + Date.now()) });
          }
        });
    }

    /* The account already exists at this point, so a failed Sheet save must not block entry. */
    function enter(account, isNew) {
      store.set('vm_user', JSON.stringify({ email: String(account.email || '').toLowerCase(), name: account.displayName || '', plan: plan, uid: account.localId || '', idToken: account.idToken || '', refreshToken: account.refreshToken || '', expires: Date.now() + (Number(account.expiresIn) || 3600) * 1000 }));
      $('#auth-title').textContent = 'Opening your studio…';
      function go() {
        // A short pause lets the conversion event send before the page changes.
        window.setTimeout(function () { window.location.href = form.getAttribute('data-next'); }, 400);
      }
      if (isNew) saveLead(account.idToken).then(go, go); else go();
    }

    [emailRule, passwordRule].forEach(function (rule) {
      var input = document.getElementById(rule.id);
      input.addEventListener('input', function () {
        if (input.getAttribute('aria-invalid') && rule.test(input.value.trim())) setError(rule.id, '');
      });
    });

    form.addEventListener('focusin', function () { track('LeadFormStart', {}, { once: true }); }, { once: true });

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (busy) return;
      clearMessages();
      var firstBad = null;
      [emailRule, passwordRule].forEach(function (rule) {
        var input = document.getElementById(rule.id);
        var ok = rule.test(input.value.trim());
        setError(rule.id, ok ? '' : ruleMessage(rule));
        if (!ok && !firstBad) firstBad = input;
      });
      if (firstBad) { firstBad.focus(); return; }
      if ($('#company').value) return;
      if (!apiKey) {
        window.console.warn('SITE_CONFIG.firebaseApiKey is empty. Add it in assets/js/config.js to turn on accounts.');
        showFormError(unavailableMessage());
        return;
      }
      var isNew = mode === 'signup';
      setBusy(true);
      authRequest(isNew ? 'signUp' : 'signInWithPassword', {
        email: email.value.trim().toLowerCase(),
        password: password.value,
        returnSecureToken: true
      }).then(function (account) {
        password.value = '';
        enter(account, isNew);
      }).catch(failAuth);
    });

    $$('[data-auth-mode]').forEach(function (b) {
      b.addEventListener('click', function () {
        setMode(b.getAttribute('data-auth-mode'));
        email.focus();
      });
    });

    eye.addEventListener('click', function () {
      var show = password.type === 'password';
      password.type = show ? 'text' : 'password';
      eye.setAttribute('aria-pressed', String(show));
      eye.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });

    $('#auth-forgot').addEventListener('click', function () {
      if (busy) return;
      clearMessages();
      if (!emailRule.test(email.value.trim())) {
        setError('email', 'Enter your email first, then choose Forgot password.');
        email.focus();
        return;
      }
      setError('email', '');
      if (!apiKey) { showFormError(unavailableMessage()); return; }
      setBusy(true);
      authRequest('sendOobCode', { requestType: 'PASSWORD_RESET', email: email.value.trim().toLowerCase() })
        .catch(function (err) { if (err.code !== 'EMAIL_NOT_FOUND') throw err; })
        .then(function () {
          setBusy(false);
          // The same reply either way, so this can't reveal who has an account.
          showNote('If that email has an account, we\'ve sent a link to reset the password.');
        })
        .catch(failAuth);
    });

    /* Google sign-in appears only when it is configured. */
    var clientId = (cfg.googleClientId || '').trim();
    if (apiKey && /\.apps\.googleusercontent\.com$/.test(clientId)) {
      var tokenClient = null;
      var googleFailed = function () {
        setBusy(false);
        showFormError('Google sign-in didn\'t finish. Please try again or use your email.');
      };
      var script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = function () {
        tokenClient = window.google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'openid email profile',
          error_callback: googleFailed,
          callback: function (response) {
            if (!response.access_token) { googleFailed(); return; }
            authRequest('signInWithIdp', {
              postBody: 'access_token=' + encodeURIComponent(response.access_token) + '&providerId=google.com',
              requestUri: window.location.origin,
              returnSecureToken: true
            }).then(function (account) {
              if (account.needConfirmation) {
                setBusy(false);
                showFormError('This email already has a password. Log in with it instead.');
                return;
              }
              enter(account, !!account.isNewUser);
            }).catch(function (err) {
              if (err.code === undefined) failAuth(err); else googleFailed();
            });
          }
        });
        googleWrap.hidden = false;
      };
      document.head.appendChild(script);
      googleBtn.addEventListener('click', function () {
        if (busy || !tokenClient) return;
        clearMessages();
        track('LeadFormStart', {}, { once: true });
        setBusy(true);
        tokenClient.requestAccessToken();
      });
    }

    setMode(query.get('mode'));
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
  function initAccountNav() {
    if (!store.get('vm_user')) return;
    $$('.nav-login, .nav-menu-login').forEach(function (a) {
      a.textContent = 'Dashboard';
      a.href = a.getAttribute('href').replace('signup/?mode=login', 'dashboard/');
    });
    $$('.nav-cta, .nav-menu-cta').forEach(function (a) {
      a.textContent = 'Open Studio';
      a.href = a.getAttribute('href').replace('signup/', 'app/');
    });
  }

  /* ---------- Start ---------- */
  window.velmioTrack = track;
  initAccountNav();
  initTheme();
  initContact();
  initNav();
  initReveal();
  initPlayers();
  initSticky();
  initCTAs();
  initViewEvents();
  initSignup(captureAttribution());
  initContactForm();
  initConsent();
  track('PageView', {}, { once: true });
})();
