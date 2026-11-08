/* Velmio Studio. Photos and the finished video stay in the browser, and the video
   is rendered here with canvas + MediaRecorder. AI scripts and studio voices go
   through the Apps Script backend, which holds the API keys. */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var root = $('#studio');
  var T = function (s) { return window.VelmioI18n ? window.VelmioI18n.t(s) : s; };
  var LANG = window.VelmioI18n ? window.VelmioI18n.lang : 'en';
  function config() { return window.SITE_CONFIG || {}; }

  var SIZES = [
    { id: '9:16', w: 9, h: 16, label: 'Vertical', use: 'TikTok, Instagram Reels, YouTube Shorts, Stories' },
    { id: '4:5', w: 4, h: 5, label: 'Portrait', use: 'Instagram and Facebook feed' },
    { id: '1:1', w: 1, h: 1, label: 'Square', use: 'Instagram and Facebook feed' },
    { id: '16:9', w: 16, h: 9, label: 'Wide', use: 'YouTube, Facebook, websites' }
  ];
  var RESOLUTIONS = [
    { id: 720, label: '720p', note: 'Faster rendering, smaller file' },
    { id: 1080, label: '1080p', note: 'Sharper quality' }
  ];
  var LENGTHS = [
    { id: 15, note: 'Quick promo' },
    { id: 20, note: 'Short and punchy' },
    { id: 25, note: 'Balanced' },
    { id: 30, note: 'More storytelling' }
  ];
  var MOVES = [['zoom_in', 'Zoom in'], ['zoom_out', 'Zoom out'], ['pan_left', 'Pan left'], ['pan_right', 'Pan right'], ['still', 'Still']];
  var TRANSITIONS = [['fade', 'Fade'], ['cut', 'Cut'], ['slide', 'Slide']];
  var STEPS = ['photos', 'script', 'voice', 'format'];
  var MAX_PHOTOS = 12, MIN_PHOTOS = 3, MAX_BYTES = 20 * 1024 * 1024, MAX_LINE = 70, FADE = 0.45, END_SECONDS = 3, PREVIEW_MAX = 720;

  var POOLS = {
    friendly: ['Made with care, every single day.', 'Come as you are.', 'We can\'t wait to meet you.', 'A little better, every visit.', 'Good things happen here.', 'Your neighbors already know.', 'There\'s always room for one more.', 'Stop by and say hello.'],
    professional: ['Quality you can count on.', 'Experience in every detail.', 'Built around your needs.', 'Trusted by our community.', 'Attention to what matters.', 'Service done right.', 'A standard we keep every day.', 'Let\'s get started.'],
    energetic: ['This is your sign.', 'Don\'t miss this.', 'Big things are happening.', 'See it for yourself.', 'You\'re going to love this.', 'Ready when you are.', 'Bring your friends.', 'Let\'s go.']
  };
  var OPENERS = { friendly: 'Say hello to {b}.', professional: 'Introducing {b}.', energetic: 'Meet {b}.' };
  var TONE_POOL = { professional: 'professional', friendly: 'friendly', luxury: 'professional', energetic: 'energetic', emotional: 'friendly', minimal: 'professional', playful: 'energetic', cinematic: 'professional' };

  var S = {
    step: 'photos', scenes: [], logo: null, business: '', brief: '', cta: '', tone: 'professional', scriptLang: LANG, platform: 'general',
    voice: { kind: 'none', id: '', name: '' }, size: '9:16', res: 1080, length: 20, endLogo: true, source: '',
    activeId: null, nextId: 1, saveState: 'empty', aiBusy: false, voBusy: false, rendering: false, cancel: false, result: null,
    composerOpen: true, premium: { state: 'idle', voices: [] },
    audioMode: 'text_voice', lastVoice: null, voiceRate: 1, voiceVolume: 1, voiceMuted: false, title: ''
  };

  /* ---------- Session ---------- */
  function readUser() {
    try { return { user: JSON.parse(window.localStorage.getItem('vm_user')), ok: true }; }
    catch (e) { return { user: null, ok: false }; }
  }
  var session = readUser();
  if (session.ok && !session.user) { window.location.replace(root.getAttribute('data-signup')); return; }

  function track(name, params) { if (window.velmioTrack) window.velmioTrack(name, params || {}); }
  track('Studio_Open', {});

  function failure(code) { var e = new Error(code); e.code = code; return e; }

  /* A sign-in lasts an hour, so it is renewed quietly before calling the backend. */
  function signInToken() {
    var user = session.user || {};
    if (user.idToken && user.expires > Date.now() + 60000) return Promise.resolve(user.idToken);
    var key = (config().firebaseApiKey || '').trim();
    if (!user.refreshToken || !key) return Promise.reject(failure('auth'));
    var body = new URLSearchParams();
    body.set('grant_type', 'refresh_token');
    body.set('refresh_token', user.refreshToken);
    return window.fetch('https://securetoken.googleapis.com/v1/token?key=' + encodeURIComponent(key), { method: 'POST', body: body })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data.id_token) throw failure('auth');
        user.idToken = data.id_token;
        user.refreshToken = data.refresh_token || user.refreshToken;
        user.expires = Date.now() + (Number(data.expires_in) || 3600) * 1000;
        try { window.localStorage.setItem('vm_user', JSON.stringify(user)); } catch (e) { /* storage blocked */ }
        return user.idToken;
      });
  }

  function backend(form, fields, timeoutMs) {
    var endpoint = (config().formEndpoint || '').trim();
    if (!endpoint) return Promise.reject(failure('ai_off'));
    return signInToken().then(function (token) {
      var data = new URLSearchParams();
      data.set('form', form);
      data.set('token', token);
      Object.keys(fields || {}).forEach(function (k) { data.set(k, fields[k]); });
      var controller = window.AbortController ? new AbortController() : null;
      var timer = controller ? window.setTimeout(function () { controller.abort(); }, timeoutMs || 90000) : 0;
      return window.fetch(endpoint, { method: 'POST', body: data, redirect: 'follow', signal: controller ? controller.signal : undefined })
        .then(function (res) {
          window.clearTimeout(timer);
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return res.json();
        }, function (err) { window.clearTimeout(timer); throw err; });
    }).then(function (result) {
      if (!result || result.ok !== true) throw failure((result && result.error) || 'server');
      return result;
    });
  }

  function backendMessage(err, fallback) {
    switch (err && err.code) {
      case 'ai_off': return 'AI script writing isn\'t connected yet. You can use Draft without AI for now.';
      case 'voice_off': return 'Studio voices aren\'t connected yet. You can use a device voice or no voiceover.';
      case 'auth': return 'Your sign-in has expired. Please log out and log in again.';
      case 'rate_limited': return 'You\'ve reached the limit for now. Please try again later.';
      case 'declined': return 'We couldn\'t write that script. Try changing your idea.';
      case 'duration': return 'Videos can be 30 seconds at most.';
      case 'validation': return 'Please check your details and try again.';
      case 'server': return fallback;
      default: return 'We couldn\'t reach our server. Check your connection and try again.';
    }
  }

  /* ---------- Helpers ---------- */
  function error(message) {
    var n = $('#studio-error');
    n.textContent = message || '';
    n.hidden = !message;
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function trimLine(s) {
    s = s.trim();
    if (s.length <= MAX_LINE) return s;
    return s.slice(0, MAX_LINE).replace(/\s+\S*$/, '').trim();
  }
  function sizeInfo() { return SIZES.filter(function (s) { return s.id === S.size; })[0]; }
  function outputSize() {
    var s = sizeInfo(), shortSide = S.res;
    var w = s.w <= s.h ? shortSide : Math.round(shortSide * s.w / s.h);
    var h = s.w <= s.h ? Math.round(shortSide * s.h / s.w) : shortSide;
    return { w: w - w % 2, h: h - h % 2 };
  }
  function narration(scene) { return (scene.voice || scene.text || '').trim(); }

  // A longer line gets a bigger share of the chosen length, so there's time to read it.
  function wordWeight(line) {
    var words = (line || '').trim().split(/\s+/).filter(Boolean).length;
    return Math.max(2.6, Math.min(5.5, words * 0.4 + 0.9));
  }
  function sceneWeight(scene) { return scene.weight > 0 ? scene.weight : wordWeight(scene.text); }
  function available() { return S.length - END_SECONDS; }

  // The one place scene timing is worked out. Preview, editor and render all use it.
  function timeline() {
    var sum = S.scenes.reduce(function (a, s) { return a + sceneWeight(s); }, 0);
    var t = 0;
    var list = S.scenes.map(function (s, i) {
      var d = sum ? sceneWeight(s) / sum * available() : 0;
      var item = { i: i, scene: s, photo: s.photo, start: t, end: t + d, line: S.audioMode === 'voice' ? '' : (s.text || ''), motion: s.motion, transition: s.transition };
      t += d;
      return item;
    });
    list.push({ end_card: true, start: available(), end: S.length, line: S.cta.trim(), transition: 'fade' });
    return list;
  }
  function secondsOf(scene) {
    var item = timeline().filter(function (x) { return x.scene === scene; })[0];
    return item ? item.end - item.start : 0;
  }
  function setSceneSeconds(scene, value) {
    var n = S.scenes.length;
    var seconds = Math.max(1, Math.min(available() - (n - 1), Number(value) || 1));
    var current = secondsOf(scene);
    var scale = (available() - seconds) / Math.max(0.01, available() - current);
    S.scenes.forEach(function (s) {
      var d = secondsOf(s);
      s._next = s === scene ? seconds : d * scale;
    });
    S.scenes.forEach(function (s) { s.weight = s._next; delete s._next; });
  }

  function speechSeconds(text) {
    var value = String(text || '');
    var wide = (value.match(/[぀-ヿ㐀-鿿]/g) || []).length;
    var words = value.replace(/[぀-ヿ㐀-鿿]/g, ' ').trim().split(/\s+/).filter(Boolean).length;
    return words / 2.5 + wide / 5;
  }
  function narrationBudget() { return available() * 0.92; }
  function narrationTotal() { return S.scenes.reduce(function (a, s) { return a + speechSeconds(narration(s)); }, 0); }
  function voiceOn() { return S.voice.kind !== 'none'; }

  function confirmBox(message, yesLabel) {
    var box = $('#confirm');
    $('#confirm-text').textContent = message;
    $('#confirm-yes').textContent = yesLabel;
    box.showModal();
    return new Promise(function (resolve) {
      function done(answer) {
        $('#confirm-yes').removeEventListener('click', yes);
        $('#confirm-no').removeEventListener('click', no);
        box.removeEventListener('cancel', no);
        box.close();
        resolve(answer);
      }
      function yes() { done(true); }
      function no() { done(false); }
      $('#confirm-yes').addEventListener('click', yes);
      $('#confirm-no').addEventListener('click', no);
      box.addEventListener('cancel', no);
    });
  }
  function hasManualEdits() { return S.scenes.some(function (s) { return s.edited; }); }
  function okToOverwrite() {
    if (!hasManualEdits()) return Promise.resolve(true);
    return confirmBox('This will replace the scenes you edited by hand. Continue?', 'Replace my edits');
  }

  /* ---------- Saving on this device ---------- */
  var DB_NAME = 'velmio-studio', STORE = 'projects', saveTimer = 0;
  function projectKey() { var u = session.user || {}; return u.uid || u.email || 'local'; }
  function openDb() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error('none')); return; }
      var req = window.indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function snapshot() {
    return {
      v: 2, step: S.step === 'generating' || S.step === 'result' ? 'format' : S.step, savedAt: Date.now(),
      audioMode: S.audioMode, lastVoice: S.lastVoice, voiceRate: S.voiceRate, voiceVolume: S.voiceVolume, title: S.title,
      business: S.business, brief: S.brief, cta: S.cta, tone: S.tone, scriptLang: S.scriptLang, platform: S.platform,
      voice: S.voice, size: S.size, res: S.res, length: S.length, endLogo: S.endLogo, source: S.source, nextId: S.nextId,
      logo: S.logo ? { blob: S.logo.blob, name: S.logo.name } : null,
      scenes: S.scenes.map(function (s) {
        return {
          id: s.id, label: s.label, text: s.text, voice: s.voice, weight: s.weight, motion: s.motion, transition: s.transition, edited: s.edited,
          photo: { id: s.photo.id, name: s.photo.name, blob: s.photo.blob },
          audio: s.audio ? { key: s.audio.key, blob: s.audio.blob, seconds: s.audio.seconds } : null
        };
      })
    };
  }
  function writeProject(value) {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readwrite');
        if (value) tx.objectStore(STORE).put(value, projectKey()); else tx.objectStore(STORE).delete(projectKey());
        tx.oncomplete = function () { db.close(); resolve(); };
        tx.onerror = function () { db.close(); reject(tx.error); };
      });
    });
  }
  function readProject() {
    return openDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var req = db.transaction(STORE).objectStore(STORE).get(projectKey());
        req.onsuccess = function () { db.close(); resolve(req.result || null); };
        req.onerror = function () { db.close(); reject(req.error); };
      });
    }).catch(function () { return null; });
  }
  function saveNow() {
    window.clearTimeout(saveTimer);
    S.saveState = 'saving';
    renderFacts();
    return writeProject(snapshot()).then(function () {
      if (S.saveState === 'saving') S.saveState = 'saved';
      renderFacts();
      return true;
    }, function () {
      S.saveState = 'failed';
      renderFacts();
      return false;
    });
  }
  function changed() {
    S.saveState = 'unsaved';
    if (S.result) S.result.stale = true;
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveNow, 700);
    renderFacts();
    renderWarnings();
    refreshPreview();
  }

  /* ---------- Navigation ---------- */
  function validate(step) {
    if (step === 'voice') {
      if (S.audioMode !== 'text' && S.voice.kind === 'none') return 'Choose a narrator, or switch to Text only.';
      if (S.audioMode === 'voice' && S.voice.kind !== 'premium') return 'Voiceover only needs a studio voice, because device voices aren\'t included in downloads.';
    }
    if (step === 'photos' && S.scenes.length < MIN_PHOTOS) return 'Add at least ' + MIN_PHOTOS + ' photos to continue.';
    if (step === 'script') {
      if (!S.business.trim()) return 'Enter your business name.';
      if (!S.cta.trim()) return 'Enter a closing message.';
      if (S.scenes.some(function (s) { return !s.text.trim(); })) return 'Generate your script or add a line for every scene.';
    }
    return '';
  }
  function firstInvalid(upto) {
    for (var i = 0; i < upto; i++) if (validate(STEPS[i])) return STEPS[i];
    return null;
  }
  function closePreviewDrawer() { root.classList.remove('show-preview'); $('#scrim').hidden = true; }
  function show(step) {
    stopPreview();
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    S.step = step;
    error('');
    closePreviewDrawer();
    $$('[data-panel]').forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== step; });
    var index = STEPS.indexOf(step);
    $('#panel-nav').hidden = index < 0;
    $('#studio-side').hidden = index < 0;
    $('#open-preview').hidden = index < 0;
    root.classList.toggle('is-wide', index < 0);
    if (index >= 0) {
      $('#nav-back').hidden = index === 0;
      $('#nav-next').textContent = index === STEPS.length - 1 ? 'Generate My Video' : 'Continue';
      $('#rail-count').textContent = 'Step ' + (index + 1) + ' of ' + STEPS.length;
      $('#rail-bar').style.width = ((index + 1) / STEPS.length * 100) + '%';
    }
    $$('[data-goto]').forEach(function (b, i) {
      b.classList.toggle('is-current', i === index);
      b.classList.toggle('is-done', index < 0 ? step === 'result' : i < index);
      if (i === index) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      b.disabled = S.rendering;
    });
    $('.rail-progress').style.visibility = index < 0 ? 'hidden' : '';
    $('#rail-result').hidden = !S.result || step === 'result' || S.rendering;
    if (step === 'script') { renderComposer(); renderStoryboard(); }
    if (step === 'voice') { renderAudio(); loadPremiumVoices(); }
    if (step === 'format') renderFormat();
    window.scrollTo(0, 0);
    var h = $('[data-panel="' + step + '"] h1');
    if (h) h.focus({ preventScroll: true });
    renderFacts();
    renderWarnings();
    refreshPreview();
  }
  $('#nav-next').addEventListener('click', function () {
    var message = validate(S.step);
    if (message) { error(message); return; }
    var i = STEPS.indexOf(S.step);
    if (i === STEPS.length - 1) { generate(); return; }
    show(STEPS[i + 1]);
  });
  $('#nav-back').addEventListener('click', function () { show(STEPS[Math.max(0, STEPS.indexOf(S.step) - 1)]); });
  $$('[data-goto]').forEach(function (b) {
    b.addEventListener('click', function () {
      var target = b.getAttribute('data-goto');
      var blocker = firstInvalid(STEPS.indexOf(target));
      if (blocker) { show(blocker); error(validate(blocker)); return; }
      show(target);
    });
  });
  $('#rail-result').addEventListener('click', function () { show('result'); renderEditor(); });
  $('#open-preview').addEventListener('click', function () { root.classList.add('show-preview'); $('#scrim').hidden = false; refreshPreview(); });
  $('#close-preview').addEventListener('click', function () { stopPreview(); closePreviewDrawer(); });
  $('#scrim').addEventListener('click', function () { stopPreview(); closePreviewDrawer(); });

  /* ---------- Photos and logo ---------- */
  function loadBlobImage(blob) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(blob);
      var img = new Image();
      img.onload = function () { resolve({ img: img, url: url }); };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('decode')); };
      img.src = url;
    });
  }
  function scaleImage(img, maxSide) {
    var scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * scale));
    c.height = Math.max(1, Math.round(img.naturalHeight * scale));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c;
  }
  function newScene(photo) {
    return { id: 's' + (S.nextId++), photo: photo, label: '', text: '', voice: '', weight: 0, motion: 'zoom_in', transition: 'fade', edited: false, audio: null };
  }
  function makePhoto(blob, name, id) {
    return loadBlobImage(blob).then(function (r) {
      return { id: id || 'p' + (S.nextId++), name: name, blob: blob, url: r.url, canvas: scaleImage(r.img, PREVIEW_MAX) };
    });
  }
  function addFiles(files) {
    var problems = [], chain = Promise.resolve(), before = S.scenes.length;
    Array.prototype.forEach.call(files, function (file) {
      chain = chain.then(function () {
        if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { problems.push(T(file.name + ' isn\'t a JPG, PNG, or WebP.')); return null; }
        if (file.size > MAX_BYTES) { problems.push(T(file.name + ' is larger than 20 MB.')); return null; }
        if (S.scenes.length >= MAX_PHOTOS) { problems.push(T('You can use up to ' + MAX_PHOTOS + ' photos.')); return null; }
        return makePhoto(file, file.name).then(function (photo) {
          var scene = newScene(photo);
          S.scenes.push(scene);
          if (!S.activeId) S.activeId = scene.id;
        }, function () { problems.push(T('We couldn\'t read ' + file.name + '. Remove it or use a JPG or PNG.')); });
      });
    });
    chain.then(function () {
      if (before === 0 && S.scenes.length) logEvent('project');
      if (S.scenes.length > before) logEvent('photos');
      renderPhotos();
      changed();
      error(problems.filter(function (p, i) { return problems.indexOf(p) === i; }).join(' '));
    });
  }
  function moveScene(from, to) {
    if (to < 0 || to >= S.scenes.length || from === to) return;
    S.scenes.splice(to, 0, S.scenes.splice(from, 1)[0]);
    renderPhotos();
    renderStoryboard();
    renderEditor();
    changed();
  }
  function removeScene(i) {
    var gone = S.scenes.splice(i, 1)[0];
    URL.revokeObjectURL(gone.photo.url);
    if (S.activeId === gone.id) S.activeId = S.scenes[0] ? S.scenes[0].id : null;
    renderPhotos();
    renderStoryboard();
    changed();
  }
  function setActive(id) {
    S.activeId = id;
    $$('[data-scene]').forEach(function (n) { n.classList.toggle('is-active', n.getAttribute('data-scene') === id); });
    refreshPreview();
  }
  var dragFrom = -1;
  function renderPhotos() {
    var grid = $('#photo-grid');
    grid.textContent = '';
    S.scenes.forEach(function (s, i) {
      var li = el('li', 'photo' + (S.activeId === s.id ? ' is-active' : ''));
      li.setAttribute('data-scene', s.id);
      li.draggable = true;
      li.addEventListener('dragstart', function (e) { dragFrom = i; e.dataTransfer.effectAllowed = 'move'; });
      li.addEventListener('dragover', function (e) { if (dragFrom >= 0) { e.preventDefault(); li.classList.add('is-target'); } });
      li.addEventListener('dragleave', function () { li.classList.remove('is-target'); });
      li.addEventListener('drop', function (e) {
        if (dragFrom < 0) return;
        e.preventDefault();
        e.stopPropagation();
        var from = dragFrom; dragFrom = -1;
        moveScene(from, i);
      });
      li.addEventListener('dragend', function () { dragFrom = -1; });
      var open = el('button', 'photo-open');
      open.type = 'button';
      open.setAttribute('aria-label', 'Preview photo ' + (i + 1));
      var img = el('img'); img.src = s.photo.url; img.alt = 'Photo ' + (i + 1) + ': ' + s.photo.name;
      open.appendChild(img);
      open.addEventListener('click', function () { setActive(s.id); });
      var tools = el('div', 'photo-tools');
      [['←', 'Move earlier', function () { moveScene(i, i - 1); }, i === 0],
       ['→', 'Move later', function () { moveScene(i, i + 1); }, i === S.scenes.length - 1],
       ['×', 'Remove photo', function () { removeScene(i); }, false]].forEach(function (t) {
        var b = el('button', '', t[0]);
        b.type = 'button'; b.title = t[1]; b.setAttribute('aria-label', t[1] + ' ' + (i + 1));
        b.disabled = t[3];
        b.addEventListener('click', t[2]);
        tools.appendChild(b);
      });
      var grip = el('span', 'photo-grip', '⠿');
      grip.setAttribute('aria-hidden', 'true');
      li.appendChild(open); li.appendChild(el('span', 'photo-num', String(i + 1))); li.appendChild(grip); li.appendChild(tools);
      grid.appendChild(li);
    });
  }
  $('#photo-input').addEventListener('change', function () { addFiles(this.files); this.value = ''; });
  var drop = $('#photo-drop');
  ['dragenter', 'dragover'].forEach(function (n) { drop.addEventListener(n, function (e) { e.preventDefault(); drop.classList.add('is-over'); }); });
  ['dragleave', 'drop'].forEach(function (n) { drop.addEventListener(n, function (e) { e.preventDefault(); drop.classList.remove('is-over'); }); });
  drop.addEventListener('drop', function (e) { addFiles(e.dataTransfer.files); });

  /* An SVG is cleaned before use, so a logo file can't carry scripts or outside links. */
  function cleanSvg(file) {
    return file.text().then(function (text) {
      var doc = new DOMParser().parseFromString(text, 'image/svg+xml');
      var top = doc.documentElement;
      if (doc.querySelector('parsererror') || top.nodeName.toLowerCase() !== 'svg') throw new Error('svg');
      $$('script, foreignObject, iframe, object, embed, animate, animateTransform, set', doc).forEach(function (n) { n.parentNode.removeChild(n); });
      [top].concat($$('*', doc)).forEach(function (n) {
        Array.prototype.slice.call(n.attributes).forEach(function (a) {
          var name = a.name.toLowerCase();
          var isLink = name === 'href' || name === 'xlink:href';
          if (name.indexOf('on') === 0 || (isLink && !/^(#|data:image\/(png|jpe?g|webp);)/i.test(a.value))) n.removeAttribute(a.name);
        });
      });
      return new Blob([new XMLSerializer().serializeToString(doc)], { type: 'image/svg+xml' });
    });
  }
  function applyLogo(logo) {
    if (S.logo) URL.revokeObjectURL(S.logo.url);
    S.logo = logo;
    var slot = $('#logo-slot');
    slot.textContent = '';
    if (logo) { var img = el('img'); img.src = logo.url; img.alt = 'Your logo'; slot.appendChild(img); }
    else slot.appendChild(el('span', '', 'No logo'));
    $('#logo-remove').hidden = !logo;
    $('#logo-choose').textContent = logo ? 'Replace logo' : 'Choose logo';
  }
  function makeLogo(blob, name) {
    return loadBlobImage(blob).then(function (r) {
      if (!r.img.naturalWidth) throw new Error('empty');
      return { blob: blob, name: name, url: r.url, canvas: scaleImage(r.img, 900) };
    });
  }
  $('#logo-input').addEventListener('change', function () {
    var file = this.files[0];
    this.value = '';
    if (!file) return;
    if (!/^image\/(jpeg|png|webp|svg\+xml)$/.test(file.type) || file.size > MAX_BYTES) { error('Use a JPG, PNG, WebP, or SVG logo under 20 MB.'); return; }
    error('');
    (file.type === 'image/svg+xml' ? cleanSvg(file) : Promise.resolve(file))
      .then(function (blob) { return makeLogo(blob, file.name); })
      .then(function (logo) { applyLogo(logo); changed(); })
      .catch(function () { error('Use a JPG, PNG, WebP, or SVG logo under 20 MB.'); });
  });
  $('#logo-remove').addEventListener('click', function () { applyLogo(null); changed(); });

  /* ---------- Script composer ---------- */
  [['business', 'business'], ['brief', 'brief'], ['cta', 'cta'], ['tone', 'tone'], ['script-lang', 'scriptLang'], ['platform', 'platform']].forEach(function (pair) {
    var n = $('#' + pair[0]);
    n.addEventListener(n.tagName === 'SELECT' ? 'change' : 'input', function () {
      S[pair[1]] = n.value;
      if (pair[0] === 'cta') $('#story-cta').value = n.value;
      n.removeAttribute('aria-invalid');
      var err = $('#' + pair[0] + '-error');
      if (err) err.hidden = true;
      changed();
    });
  });
  $('#story-cta').addEventListener('input', function () { S.cta = this.value; $('#cta').value = this.value; changed(); });
  function fillFields() {
    $('#business').value = S.business;
    $('#brief').value = S.brief;
    $('#cta').value = S.cta;
    $('#story-cta').value = S.cta;
    $('#tone').value = S.tone;
    $('#script-lang').value = S.scriptLang;
    $('#platform').value = S.platform;
  }
  function renderComposer() {
    var collapsed = !S.composerOpen && hasScript();
    $('#composer-body').hidden = collapsed;
    $('#composer-summary').hidden = !collapsed;
    if (collapsed) $('#composer-summary-text').textContent = S.brief || S.business;
  }
  $('#composer-open').addEventListener('click', function () { S.composerOpen = true; renderComposer(); });
  function hasScript() { return !!S.source || S.scenes.some(function (s) { return s.text.trim(); }); }

  function fieldError(id, message) {
    var n = $('#' + id), err = $('#' + id + '-error');
    err.textContent = message;
    err.hidden = false;
    n.setAttribute('aria-invalid', 'true');
    n.focus();
  }
  function checkComposer() {
    error('');
    if (S.scenes.length < MIN_PHOTOS) { error('Add at least ' + MIN_PHOTOS + ' photos to continue.'); return false; }
    S.composerOpen = true;
    renderComposer();
    if (!S.business.trim()) { fieldError('business', 'Enter your business or product name.'); return false; }
    if (S.brief.trim().length < 5) { fieldError('brief', 'Describe what your video should show or say.'); return false; }
    return true;
  }
  function draftScript() {
    var business = S.business.trim() || T('your new favorite spot');
    var tone = TONE_POOL[S.tone];
    var pool = POOLS[tone].map(T);
    var sentences = (S.brief.match(/[^.!?\n]+/g) || []).map(trimLine).filter(function (s) { return s.length > 2; });
    S.scenes.forEach(function (s, i) {
      if (i === 0) s.text = T(OPENERS[tone]).replace('{b}', business);
      else if (sentences.length) { var line = sentences.shift(); s.text = /[.!?]$/.test(line) ? line : line + '.'; }
      else s.text = pool.shift() || T(POOLS[tone][i % POOLS[tone].length]);
      s.voice = ''; s.label = ''; s.weight = 0; s.edited = false;
    });
    S.source = 'draft';
  }
  $('#draft-script').addEventListener('click', function () {
    if (S.scenes.length < MIN_PHOTOS) { error('Add at least ' + MIN_PHOTOS + ' photos to continue.'); return; }
    okToOverwrite().then(function (go) {
      if (!go) return;
      error('');
      draftScript();
      S.composerOpen = false;
      setAiState('', '');
      renderComposer();
      renderStoryboard();
      changed();
    });
  });

  /* ---------- AI script ---------- */
  function setAiBusy(on) {
    S.aiBusy = on;
    ['#ai-generate', '#story-regenerate', '#draft-script'].forEach(function (s) { $(s).disabled = on; });
    $$('#quick-actions button, [data-regen], [data-shorten]').forEach(function (b) { b.disabled = on; });
  }
  function setAiState(kind, message, retry) {
    var box = $('#ai-state');
    box.textContent = '';
    box.hidden = !kind;
    box.className = 'ai-state' + (kind === 'error' ? ' is-error' : '');
    box.removeAttribute('role');
    if (kind === 'loading') {
      box.setAttribute('role', 'status');
      var dots = el('div', 'ai-dots');
      dots.appendChild(el('i')); dots.appendChild(el('i')); dots.appendChild(el('i'));
      box.appendChild(dots);
      box.appendChild(el('p', '', message));
    }
    if (kind === 'error') {
      box.setAttribute('role', 'alert');
      box.appendChild(el('p', '', message));
      var again = el('button', 'btn-soft is-small', 'Try again');
      again.type = 'button';
      again.addEventListener('click', retry);
      box.appendChild(again);
    }
  }
  function jobFor(mode, extra) {
    var job = {
      mode: mode, business: S.business, idea: S.brief, cta: S.cta, tone: S.tone, language: S.scriptLang, platform: S.platform, duration: S.length,
      assets: S.scenes.map(function (s) { return { id: s.photo.id }; }),
      current: S.scenes.map(function (s) { return { scene_id: s.id, asset_id: s.photo.id, on_screen_text: s.text, narration: s.voice }; })
    };
    Object.keys(extra || {}).forEach(function (k) { job[k] = extra[k]; });
    return JSON.stringify(job);
  }
  function fillScene(scene, r, keepTiming) {
    scene.text = r.text;
    scene.voice = r.narration;
    scene.label = r.label;
    scene.motion = r.motion;
    scene.transition = r.transition;
    scene.edited = false;
    if (!keepTiming) scene.weight = r.seconds;
  }
  function applyScript(result, mode, sceneId) {
    if (mode === 'scene') {
      var target = S.scenes.filter(function (s) { return s.id === sceneId; })[0];
      if (target) fillScene(target, result.scenes[0], true);
    } else {
      var byAsset = {}, next = [];
      S.scenes.forEach(function (s) { byAsset[s.photo.id] = s; });
      result.scenes.forEach(function (r) {
        var s = byAsset[r.asset_id];
        if (s) { fillScene(s, r, false); next.push(s); delete byAsset[r.asset_id]; }
      });
      S.scenes = next.concat(S.scenes.filter(function (s) { return byAsset[s.photo.id]; }));
      if (!S.cta.trim() && result.cta) { S.cta = result.cta; fillFields(); }
      S.source = 'ai';
      S.composerOpen = false;
    }
  }
  function runAi(mode, extra, loadingText) {
    if (S.aiBusy || !checkComposer()) return;
    var sceneId = extra && extra.scene_id;
    setAiBusy(true);
    setAiState('loading', loadingText);
    backend('studio_script', { job: jobFor(mode, extra) })
      .then(function (result) {
        applyScript(result, mode, sceneId);
        setAiBusy(false);
        setAiState('', '');
        renderComposer();
        renderStoryboard();
        renderPhotos();
        changed();
        track('Script_Generated', { mode: mode });
        logEvent('script');
      })
      .catch(function (err) {
        setAiBusy(false);
        setAiState('error', backendMessage(err, 'We couldn\'t write your script. Please try again.'), function () { runAi(mode, extra, loadingText); });
      });
  }
  var WRITING = 'Creating your promotional script...';
  function runWhole() {
    if (S.aiBusy || !checkComposer()) return;
    okToOverwrite().then(function (go) { if (go) runAi('full', null, WRITING); });
  }
  $('#ai-generate').addEventListener('click', runWhole);
  $('#story-regenerate').addEventListener('click', runWhole);
  function rewrite(instruction) {
    if (S.aiBusy) return;
    okToOverwrite().then(function (go) { if (go) runAi('rewrite', { instruction: instruction }, 'Rewriting your script...'); });
  }
  $$('[data-rewrite]').forEach(function (b) { b.addEventListener('click', function () { rewrite(b.getAttribute('data-rewrite')); }); });
  $$('[data-shorten]').forEach(function (b) {
    b.addEventListener('click', function () {
      if (S.step !== 'script') show('script');
      rewrite('shorter');
    });
  });
  function flashSaved(button) {
    saveNow().then(function (ok) {
      var label = button.textContent;
      button.textContent = ok ? 'Saved' : 'Couldn\'t save';
      window.setTimeout(function () { button.textContent = label; }, 1400);
    });
  }
  $('#story-save').addEventListener('click', function () { flashSaved(this); });

  /* ---------- Storyboard ---------- */
  function selectField(labelText, options, value, onChange) {
    var wrap = el('div');
    var id = 'f' + Math.random().toString(36).slice(2, 9);
    var label = el('label', '', labelText); label.setAttribute('for', id);
    var select = el('select'); select.id = id;
    options.forEach(function (o) { var opt = el('option', '', o[1]); opt.value = o[0]; select.appendChild(opt); });
    select.value = value;
    select.addEventListener('change', function () { onChange(select.value); });
    wrap.appendChild(label); wrap.appendChild(select);
    return wrap;
  }
  function sceneCard(s, i) {
    var li = el('li', 'scene' + (S.activeId === s.id ? ' is-active' : ''));
    li.setAttribute('data-scene', s.id);
    var main = el('div', 'scene-main');
    var thumb = el('button'); thumb.type = 'button'; thumb.setAttribute('aria-label', 'Preview scene ' + (i + 1));
    var img = el('img'); img.src = s.photo.url; img.alt = '';
    thumb.appendChild(img);
    thumb.addEventListener('click', function () { setActive(s.id); });
    var body = el('div');
    var title = el('p', 'scene-title');
    title.appendChild(el('span', '', 'Scene ' + pad(i + 1)));
    if (s.label) { var lab = el('span', '', ' — ' + s.label); lab.setAttribute('translate', 'no'); title.appendChild(lab); }
    var wrap = el('div', 'field');
    var id = 'scene-' + s.id;
    var label = el('label', 'visually-hidden', 'On-screen text for scene ' + (i + 1)); label.setAttribute('for', id);
    var input = el('input'); input.id = id; input.type = 'text'; input.maxLength = MAX_LINE; input.value = s.text;
    input.addEventListener('input', function () { s.text = input.value; s.edited = true; changed(); });
    input.addEventListener('focus', function () { setActive(s.id); });
    wrap.appendChild(label); wrap.appendChild(input);
    body.appendChild(title); body.appendChild(wrap);

    var tools = el('div', 'scene-tools');
    [['↑', 'Move scene earlier', i - 1, i === 0], ['↓', 'Move scene later', i + 1, i === S.scenes.length - 1]].forEach(function (t) {
      var b = el('button', 'icon-btn', t[0]);
      b.type = 'button'; b.setAttribute('aria-label', t[1] + ' ' + (i + 1)); b.disabled = t[3];
      b.addEventListener('click', function () { moveScene(i, t[2]); });
      tools.appendChild(b);
    });
    var swap = el('select'); swap.setAttribute('aria-label', 'Change photo for scene ' + (i + 1));
    var first = el('option', '', 'Change photo'); first.value = ''; swap.appendChild(first);
    S.scenes.forEach(function (other, j) {
      if (j === i) return;
      var opt = el('option', '', 'Swap with scene ' + (j + 1)); opt.value = String(j); swap.appendChild(opt);
    });
    swap.addEventListener('change', function () {
      if (swap.value === '') return;
      var other = S.scenes[Number(swap.value)];
      var held = s.photo; s.photo = other.photo; other.photo = held;
      renderPhotos(); renderStoryboard(); changed();
    });
    tools.appendChild(swap);
    var regen = el('button', 'link-btn', 'Regenerate scene');
    regen.type = 'button'; regen.setAttribute('data-regen', ''); regen.disabled = S.aiBusy;
    regen.addEventListener('click', function () {
      var go = s.edited ? confirmBox('This will replace the scene you edited by hand. Continue?', 'Replace my edits') : Promise.resolve(true);
      go.then(function (yes) { if (yes) runAi('scene', { scene_id: s.id }, 'Rewriting this scene...'); });
    });
    tools.appendChild(regen);
    body.appendChild(tools);
    main.appendChild(thumb); main.appendChild(body);
    li.appendChild(main);

    var more = el('details');
    more.open = !!s._open;
    more.addEventListener('toggle', function () { s._open = more.open; });
    more.appendChild(el('summary', '', 'Voiceover and timing'));
    var inner = el('div', 'scene-more');
    var vWrap = el('div');
    var vId = 'voice-' + s.id;
    var vLabel = el('label', '', 'Voiceover text'); vLabel.setAttribute('for', vId);
    var area = el('textarea'); area.id = vId; area.rows = 2; area.maxLength = 400; area.value = s.voice;
    area.placeholder = T('Leave empty to read the on-screen text.');
    area.addEventListener('input', function () { s.voice = area.value; s.edited = true; changed(); });
    vWrap.appendChild(vLabel); vWrap.appendChild(area);
    inner.appendChild(vWrap);

    var row = el('div', 'scene-more-row');
    var durWrap = el('div');
    var durId = 'dur-' + s.id;
    var durLabel = el('label', '', 'Seconds'); durLabel.setAttribute('for', durId);
    var dur = el('input'); dur.id = durId; dur.type = 'number'; dur.min = '1'; dur.max = String(available()); dur.step = '0.1'; dur.value = (Math.round(secondsOf(s) * 10) / 10).toFixed(1);
    dur.addEventListener('change', function () { setSceneSeconds(s, dur.value); s.edited = true; renderStoryboard(); changed(); });
    durWrap.appendChild(durLabel); durWrap.appendChild(dur);
    row.appendChild(durWrap);
    row.appendChild(selectField('Movement', MOVES, s.motion, function (v) { s.motion = v; s.edited = true; changed(); }));
    row.appendChild(selectField('Transition', TRANSITIONS, s.transition, function (v) { s.transition = v; s.edited = true; changed(); }));
    inner.appendChild(row);
    var listen = el('button', 'link-btn', 'Preview voiceover');
    listen.type = 'button';
    listen.addEventListener('click', function () { previewNarration(s); });
    inner.appendChild(listen);
    more.appendChild(inner);
    li.appendChild(more);
    return li;
  }
  function renderStoryboard() {
    var box = $('#story');
    box.hidden = !hasScript();
    if (box.hidden) return;
    $('#story-title').textContent = S.source === 'ai' ? 'Your AI-Generated Storyboard' : 'Your Storyboard';
    $('#story-cta').value = S.cta;
    var list = $('#scene-list');
    list.textContent = '';
    S.scenes.forEach(function (s, i) { list.appendChild(sceneCard(s, i)); });
  }
  function renderWarnings() {
    var spoken = narrationTotal(), over = (voiceOn() || S.source === 'ai') && hasScript() && spoken > narrationBudget();
    var cutOff = S.scenes.some(function (s) { return audioReady(s) && s.audio.seconds > secondsOf(s) + 0.2; });
    $$('[data-warning]').forEach(function (b) {
      b.hidden = !over && !cutOff;
      if (over) $('p', b).textContent = 'Your narration runs about ' + Math.ceil(spoken) + ' seconds, but this video has room for ' + Math.floor(narrationBudget()) + '.';
      else if (cutOff) $('p', b).textContent = 'Your voiceover is longer than some scenes and will be cut off.';
    });
  }

  /* ---------- Voice ---------- */
  function browserVoice() {
    if (S.voice.kind !== 'browser' || !window.speechSynthesis) return null;
    return window.speechSynthesis.getVoices().filter(function (v) { return v.voiceURI === S.voice.id; })[0] || null;
  }
  function speak(text) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    if (!text) return;
    var u = new SpeechSynthesisUtterance(text);
    var voice = browserVoice();
    if (voice) u.voice = voice; else u.lang = S.scriptLang;
    u.rate = S.voiceRate;
    u.volume = S.voiceMuted ? 0 : S.voiceVolume;
    window.speechSynthesis.speak(u);
  }
  function voiceName(v) { return v.name.replace(/^Microsoft\s+/, '').replace(/\s*-.*$/, ''); }
  function setVoice(kind, id, name) {
    S.voice = { kind: kind, id: id, name: name };
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    renderAudio();
    changed();
  }
  function voiceRow(kind, id, name, detail, onListen, listenLabel) {
    var on = S.voice.kind === kind && S.voice.id === id;
    var row = el('div', 'voice' + (on ? ' is-on' : ''));
    var pick = el('button', 'voice-pick');
    pick.type = 'button';
    pick.setAttribute('role', 'radio');
    pick.setAttribute('aria-checked', String(on));
    pick.appendChild(el('strong', '', name));
    var d = el('span', '', detail);
    d.setAttribute('translate', 'no');
    pick.appendChild(d);
    pick.addEventListener('click', function () { setVoice(kind, id, name); });
    row.appendChild(pick);
    if (onListen) {
      var sample = el('button', 'icon-btn');
      sample.type = 'button';
      sample.innerHTML = window.VelmioUI ? window.VelmioUI.ic('play') : '';
      sample.setAttribute('aria-label', listenLabel);
      sample.addEventListener('click', onListen);
      row.appendChild(sample);
    }
    return row;
  }
  function voiceGroup(title, note) {
    var g = el('div', 'voice-group');
    g.appendChild(el('strong', '', title));
    g.appendChild(el('span', '', note));
    return g;
  }
  var sampleAudio = null;
  function playSample(url) {
    if (sampleAudio) sampleAudio.pause();
    sampleAudio = new Audio(url);
    sampleAudio.play().catch(function () { error('We couldn\'t play that voice sample.'); });
  }
  function renderVoices() {
    var list = $('#voice-list');
    list.textContent = '';

    if (S.premium.voices.length) {
      list.appendChild(voiceGroup('Studio voices', 'Included in your downloaded video.'));
      S.premium.voices.forEach(function (v) {
        var detail = [v.language, v.accent, v.gender, v.style].filter(Boolean).join(' · ');
        list.appendChild(voiceRow('premium', v.id, v.name, detail, v.preview ? function () { playSample(v.preview); } : null, 'Listen to ' + v.name));
      });
    }

    list.appendChild(voiceGroup('Device voices', 'For preview only. These aren\'t included in your downloaded video.'));
    var voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
    var code = S.scriptLang;
    var matching = voices.filter(function (v) { return v.lang.toLowerCase().indexOf(code) === 0; });
    (matching.length ? matching : voices).slice(0, 10).forEach(function (v) {
      var name = voiceName(v);
      list.appendChild(voiceRow('browser', v.voiceURI, name, v.lang, function () {
        var held = S.voice; S.voice = { kind: 'browser', id: v.voiceURI, name: name };
        speak((S.scenes[0] && narration(S.scenes[0])) || T('Your photos deserve to move.'));
        S.voice = held;
      }, 'Listen to ' + name));
    });
    if (!voices.length) list.appendChild(el('p', 'panel-note', 'This browser has no voices available.'));
    if (S.premium.state === 'off') list.appendChild(el('p', 'studio-info', 'Studio voices aren\'t connected yet.'));
    renderVoiceBox();
  }

  /* The audio step: a mode decides whether captions and narration are used. */
  function renderAudio() {
    $$('[data-mode]').forEach(function (b) {
      var on = b.getAttribute('data-mode') === S.audioMode;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-checked', String(on));
    });
    var wantsVoice = S.audioMode !== 'text';
    $('#narrator').hidden = !wantsVoice;
    renderVoices();
    var browser = wantsVoice && S.voice.kind === 'browser';
    var premium = wantsVoice && S.voice.kind === 'premium';
    $('#voice-advanced').hidden = !browser;
    $('#voice-rate').value = String(S.voiceRate);
    $('#voice-volume').value = String(S.voiceVolume);
    $('#mix-voice').value = String(S.voiceVolume);
    $('#mix-voice').disabled = !browser;
    $('#mix-mute').disabled = !browser;
    $('#mix-mute').setAttribute('aria-pressed', String(S.voiceMuted));
    $('#mix-mute').setAttribute('aria-label', S.voiceMuted ? 'Unmute narration' : 'Mute narration');
    $('#track-voice').classList.toggle('is-off', !browser && !premium);
    $('#mix-note').textContent = browser ? 'Device voices are for preview only, so these settings don\'t change your downloaded video.'
      : premium ? 'Studio voices play at full level in your video.' : '';
  }
  function setAudioMode(mode) {
    if (mode === 'text') {
      if (S.voice.kind !== 'none') S.lastVoice = S.voice;
      S.voice = { kind: 'none', id: '', name: '' };
      if (window.speechSynthesis) window.speechSynthesis.cancel();
    } else if (S.voice.kind === 'none' && S.lastVoice) {
      S.voice = S.lastVoice;
    }
    S.audioMode = mode;
    error('');
    renderAudio();
    changed();
  }
  $$('[data-mode]').forEach(function (b) {
    b.addEventListener('click', function () { setAudioMode(b.getAttribute('data-mode')); });
  });
  $('#voice-rate').addEventListener('input', function () { S.voiceRate = Number(this.value); changed(); });
  function setVoiceVolume(value) {
    S.voiceVolume = value;
    $('#voice-volume').value = String(value);
    $('#mix-voice').value = String(value);
    changed();
  }
  $('#voice-volume').addEventListener('input', function () { setVoiceVolume(Number(this.value)); });
  $('#mix-voice').addEventListener('input', function () { setVoiceVolume(Number(this.value)); });
  $('#mix-mute').addEventListener('click', function () { S.voiceMuted = !S.voiceMuted; renderAudio(); });

  function loadPremiumVoices() {
    if (S.premium.state !== 'idle') return;
    S.premium.state = 'loading';
    backend('studio_voices', {}, 30000).then(function (result) {
      S.premium = { state: result.configured ? 'ready' : 'off', voices: result.voices || [] };
      if (S.step === 'voice') renderVoices();
    }).catch(function (err) {
      S.premium = { state: err && err.code && err.code !== 'server' ? 'off' : 'idle', voices: [] };
      if (S.step === 'voice') renderVoices();
    });
  }
  if (window.speechSynthesis) {
    window.speechSynthesis.addEventListener('voiceschanged', function () { if (S.step === 'voice') renderVoices(); renderFacts(); });
  }

  function audioKey(scene) { return S.voice.id + '|' + narration(scene); }
  function audioReady(scene) { return S.voice.kind === 'premium' && !!scene.audio && scene.audio.key === audioKey(scene); }
  function spokenScenes() { return S.scenes.filter(function (s) { return narration(s); }); }
  function voiceoverComplete() { return S.voice.kind === 'premium' && spokenScenes().length > 0 && spokenScenes().every(audioReady); }
  function renderVoiceBox() {
    var box = $('#vo-box');
    box.hidden = S.voice.kind !== 'premium';
    if (box.hidden) return;
    $('#vo-generate').disabled = S.voBusy;
    if (S.voBusy) return;
    var status = $('#vo-status');
    if (!spokenScenes().length) status.textContent = 'Write your script first, then generate the voiceover.';
    else if (voiceoverComplete()) status.textContent = 'Your voiceover is ready. Press play in the preview to hear it.';
    else status.textContent = 'Creates narration for every scene and adds it to your video.';
  }
  function b64Blob(b64, mime) {
    var bin = window.atob(b64), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  var sharedAudio = null;
  function audioContext() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!sharedAudio) sharedAudio = new AC();
    if (sharedAudio.state === 'suspended') sharedAudio.resume();
    return sharedAudio;
  }
  function sceneBuffer(scene) {
    if (scene.audio.buffer) return Promise.resolve(scene.audio.buffer);
    return scene.audio.blob.arrayBuffer()
      .then(function (data) { return audioContext().decodeAudioData(data); })
      .then(function (buffer) { scene.audio.buffer = buffer; scene.audio.seconds = buffer.duration; return buffer; });
  }
  function generateVoiceover(progress) {
    var todo = spokenScenes().filter(function (s) { return !audioReady(s); });
    var chain = Promise.resolve();
    todo.forEach(function (s, i) {
      chain = chain.then(function () {
        progress(i + 1, todo.length);
        var key = audioKey(s);
        return backend('studio_tts', { voice_id: S.voice.id, text: narration(s) }, 60000).then(function (r) {
          s.audio = { key: key, blob: b64Blob(r.audio, r.mime || 'audio/mpeg'), seconds: 0 };
          return sceneBuffer(s);
        });
      });
    });
    return chain.then(fitVoiceover);
  }
  // Scenes grow to fit their narration, and any spare time is shared out evenly.
  function fitVoiceover() {
    var needs = S.scenes.map(function (s) { return audioReady(s) ? Math.max(1, s.audio.seconds + 0.45) : 1.5; });
    var sum = needs.reduce(function (a, b) { return a + b; }, 0);
    var spare = Math.max(0, available() - sum) / S.scenes.length;
    S.scenes.forEach(function (s, i) { s.weight = needs[i] + spare; });
  }
  $('#vo-generate').addEventListener('click', function () {
    if (S.voBusy) return;
    if (!spokenScenes().length) { error('Write your script first, then generate the voiceover.'); return; }
    error('');
    S.voBusy = true;
    renderVoiceBox();
    generateVoiceover(function (n, total) { $('#vo-status').textContent = 'Generating voiceover for scene ' + n + ' of ' + total + '…'; })
      .then(function () { S.voBusy = false; renderVoiceBox(); changed(); logEvent('voice'); })
      .catch(function (err) {
        S.voBusy = false;
        renderVoiceBox();
        error(backendMessage(err, 'We couldn\'t create your voiceover. Please try again.'));
      });
  });
  var narrationSource = null;
  function previewNarration(scene) {
    if (narrationSource) { try { narrationSource.stop(); } catch (e) { /* already ended */ } narrationSource = null; }
    if (audioReady(scene)) {
      sceneBuffer(scene).then(function (buffer) {
        var ctx = audioContext(), src = ctx.createBufferSource();
        src.buffer = buffer; src.connect(ctx.destination); src.start();
        narrationSource = src;
      });
      return;
    }
    speak(narration(scene));
  }

  /* ---------- Format ---------- */
  function renderFormat() {
    var grid = $('#size-grid');
    grid.textContent = '';
    SIZES.forEach(function (s) {
      var b = el('button', 'size' + (S.size === s.id ? ' is-on' : ''));
      b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(S.size === s.id));
      var holder = el('span', 'size-shape');
      var shape = el('i'); shape.style.aspectRatio = s.w + ' / ' + s.h;
      if (s.w >= s.h) shape.style.width = '60px'; else shape.style.height = '62px';
      holder.appendChild(shape);
      b.appendChild(holder); b.appendChild(el('strong', '', s.label + ' ' + s.id)); b.appendChild(el('span', '', s.use));
      b.addEventListener('click', function () { S.size = s.id; renderFormat(); changed(); });
      grid.appendChild(b);
    });
    var lengths = $('#len-row');
    lengths.textContent = '';
    LENGTHS.forEach(function (l) {
      var b = el('button', 'res' + (S.length === l.id ? ' is-on' : ''));
      b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(S.length === l.id));
      b.appendChild(el('strong', '', l.id + ' sec')); b.appendChild(el('span', '', l.note));
      b.addEventListener('click', function () {
        S.length = l.id;
        if (voiceoverComplete()) fitVoiceover();
        renderFormat();
        changed();
      });
      lengths.appendChild(b);
    });
    var perPhoto = S.scenes.length ? available() / S.scenes.length : 0;
    $('#len-note').textContent = !perPhoto ? '' : perPhoto < 2
      ? 'Scenes will be quick with this many photos. Try a longer video.'
      : 'About ' + (Math.round(perPhoto * 10) / 10) + ' seconds per photo';
    var row = $('#res-row');
    row.textContent = '';
    RESOLUTIONS.forEach(function (r) {
      var b = el('button', 'res' + (S.res === r.id ? ' is-on' : ''));
      b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(S.res === r.id));
      var size = sizeWith(r.id);
      b.appendChild(el('strong', '', r.label)); b.appendChild(el('span', '', r.note));
      var dims = el('span', '', size.w + '×' + size.h); dims.setAttribute('translate', 'no');
      b.appendChild(dims);
      b.addEventListener('click', function () { S.res = r.id; renderFormat(); changed(); });
      row.appendChild(b);
    });
  }
  function sizeWith(res) { var held = S.res; S.res = res; var o = outputSize(); S.res = held; return o; }

  /* ---------- Inspector and live preview ---------- */
  function statusText() {
    if (S.rendering) return 'Creating your video';
    if (S.result && !S.result.stale) return 'Video ready';
    if (S.result) return 'Edited since last render';
    if (S.saveState === 'failed') return 'Couldn\'t save';
    if (S.saveState === 'unsaved' || S.saveState === 'saving') return 'Saving…';
    if (S.saveState === 'saved') return 'Saved on this device';
    return 'New project';
  }
  function renderFacts() {
    var s = sizeInfo(), o = outputSize();
    $('#fact-photos').textContent = String(S.scenes.length);
    $('#fact-length').textContent = S.length + ' sec';
    $('#fact-voice').textContent = S.voice.kind === 'none' ? 'None' : S.voice.name;
    $('#fact-aspect').textContent = s.label + ' ' + s.id;
    $('#fact-output').textContent = o.w + '×' + o.h;
    $('#fact-status').textContent = statusText();
  }

  var preview = { playing: false, raf: 0, t: 0, last: 0, draw: null, list: null, sources: [], spoken: -1, pending: false };
  function buildPreview() {
    var s = sizeInfo(), canvas = $('#side-canvas');
    var shortSide = 360;
    var W = s.w <= s.h ? shortSide : Math.round(shortSide * s.w / s.h);
    var H = s.w <= s.h ? Math.round(shortSide * s.h / s.w) : shortSide;
    if (canvas.width !== W) canvas.width = W;
    if (canvas.height !== H) canvas.height = H;
    $('#side-frame').style.aspectRatio = s.w + ' / ' + s.h;
    var images = {};
    S.scenes.forEach(function (x) { images[x.photo.id] = x.photo.canvas; });
    preview.list = timeline();
    preview.draw = makeDrawer(canvas.getContext('2d'), W, H, images, S.logo ? S.logo.canvas : null, preview.list, S.business.trim(), S.endLogo);
  }
  function refreshPreview() {
    if (preview.pending) return;
    preview.pending = true;
    window.setTimeout(function () {
      preview.pending = false;
      var any = S.scenes.length > 0;
      $('#side-canvas').hidden = !any;
      $('#side-empty').hidden = any;
      $('#side-play').hidden = !any;
      if (!any) { $('#side-frame').style.aspectRatio = sizeInfo().w + ' / ' + sizeInfo().h; return; }
      if (preview.playing) return;
      buildPreview();
      var item = preview.list.filter(function (x) { return x.scene && x.scene.id === S.activeId; })[0] || preview.list[0];
      preview.draw(Math.min(item.end - 0.01, item.start + 0.9));
    }, 0);
  }
  function setPlaying(on) {
    preview.playing = on;
    var b = $('#side-play');
    b.setAttribute('aria-pressed', String(on));
    b.setAttribute('aria-label', on ? 'Pause preview' : 'Play preview');
  }
  function stopPreviewSound() {
    preview.sources.forEach(function (src) { try { src.stop(); } catch (e) { /* already ended */ } });
    preview.sources = [];
    if (S.voice.kind === 'browser' && window.speechSynthesis) window.speechSynthesis.cancel();
  }
  function stopPreview() {
    if (!preview.playing) return;
    setPlaying(false);
    window.cancelAnimationFrame(preview.raf);
    stopPreviewSound();
  }
  function startPreview() {
    buildPreview();
    var total = S.length;
    if (preview.t >= total - 0.05) preview.t = 0;
    setPlaying(true);
    preview.last = window.performance.now();
    preview.spoken = -1;
    if (S.voice.kind === 'premium') {
      var ready = S.scenes.filter(audioReady), ctx = audioContext();
      Promise.all(ready.map(sceneBuffer)).then(function () {
        if (!preview.playing) return;
        var base = ctx.currentTime - preview.t + 0.05;
        preview.list.forEach(function (item) {
          if (!item.scene || !audioReady(item.scene) || item.start < preview.t) return;
          var src = ctx.createBufferSource();
          src.buffer = item.scene.audio.buffer;
          src.connect(ctx.destination);
          src.start(base + item.start + 0.15);
          preview.sources.push(src);
        });
      });
    }
    (function step(now) {
      if (!preview.playing) return;
      preview.t += Math.max(0, Math.min(now - preview.last, 100)) / 1000;
      preview.last = now;
      if (preview.t >= total) { preview.t = 0; setPlaying(false); stopPreviewSound(); refreshPreview(); return; }
      preview.draw(preview.t);
      if (S.voice.kind === 'browser') {
        var i = 0; while (i < preview.list.length - 1 && preview.t >= preview.list[i].end) i++;
        if (i !== preview.spoken) {
          preview.spoken = i;
          var item = preview.list[i];
          speak(item.scene ? narration(item.scene) : item.line);
        }
      }
      preview.raf = window.requestAnimationFrame(step);
    })(preview.last);
  }
  $('#side-play').addEventListener('click', function () { if (preview.playing) stopPreview(); else startPreview(); });

  /* ---------- Rendering ---------- */
  function wrapText(ctx, text, maxWidth) {
    var lines = [], line = '';
    text.split(/\s+/).forEach(function (word) {
      var test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = word; } else line = test;
    });
    if (line) lines.push(line);
    return lines;
  }
  function pickMime(withAudio) {
    var list = withAudio
      ? ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1.4d002a,mp4a.40.2', 'video/mp4;codecs=avc1.640028,opus', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
      : ['video/mp4;codecs=avc1.640028', 'video/mp4;codecs=avc1.4d002a', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    return list.filter(function (m) { return window.MediaRecorder.isTypeSupported(m); })[0];
  }
  function clamp01(v) { return Math.max(0, Math.min(1, v)); }
  function ease(v) { return 1 - Math.pow(1 - v, 3); }

  function makeDrawer(ctx, W, H, images, logo, scenes, business, endLogo) {
    var u = Math.min(W, H) / 1080;
    var captionBottom = H > W ? H * 0.18 : H * 0.1;
    var margin = 72 * u;
    var rtl = document.documentElement.dir === 'rtl';
    if (rtl) ctx.direction = 'rtl';

    function photo(scene, t, alpha) {
      var src = images[scene.photo.id];
      var p = clamp01((t - scene.start) / (scene.end - scene.start + FADE));
      var zoom = 1.03, panX = 0, panY = 0;
      if (scene.motion === 'zoom_out') { zoom = 1.15 - 0.12 * p; panX = panY = (p - 0.5) * 0.5; }
      else if (scene.motion === 'pan_left') { zoom = 1.14; panX = (0.5 - p) * 1.4; }
      else if (scene.motion === 'pan_right') { zoom = 1.14; panX = (p - 0.5) * 1.4; }
      else if (scene.motion !== 'still') { zoom = 1.03 + 0.12 * p; panX = panY = (0.5 - p) * 0.5; }
      var base = Math.max(W / src.width, H / src.height) * zoom;
      var dw = src.width * base, dh = src.height * base;
      ctx.globalAlpha = alpha;
      ctx.drawImage(src, (W - dw) / 2 + panX * (dw - W) / 2, (H - dh) / 2 + panY * (dh - H) / 2, dw, dh);

      var g = ctx.createLinearGradient(0, H * 0.45, 0, H);
      g.addColorStop(0, 'rgba(16,20,38,0)');
      g.addColorStop(1, 'rgba(16,20,38,.86)');
      ctx.fillStyle = g;
      ctx.fillRect(0, H * 0.45, W, H * 0.55);

      var size = 64 * u, enter = ease(clamp01((t - scene.start - 0.12) / 0.45));
      ctx.font = '600 ' + size + 'px Sora, "Segoe UI", sans-serif';
      ctx.textBaseline = 'alphabetic';
      ctx.textAlign = rtl ? 'right' : 'left';
      ctx.fillStyle = '#F8F6FF';
      ctx.shadowColor = 'rgba(16,20,38,.55)';
      ctx.shadowBlur = 18 * u;
      ctx.globalAlpha = alpha * enter;
      var lines = wrapText(ctx, scene.line, W - margin * 2);
      var lh = size * 1.2, y = H - captionBottom - (lines.length - 1) * lh + (1 - enter) * 34 * u;
      lines.forEach(function (l, i) { ctx.fillText(l, rtl ? W - margin : margin, y + i * lh); });
      ctx.shadowBlur = 0;

      if (logo) {
        var lh2 = 110 * u, lw = Math.min(logo.width / logo.height * lh2, W * 0.34);
        var lh3 = lw / (logo.width / logo.height);
        ctx.globalAlpha = alpha;
        ctx.drawImage(logo, margin, margin + (H > W ? H * 0.04 : 0), lw, lh3);
      }
      ctx.globalAlpha = 1;
    }

    function endCard(scene, t, alpha) {
      var enter = ease(clamp01((t - scene.start) / 0.6));
      ctx.globalAlpha = alpha;
      var g = ctx.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, Math.max(W, H) * 0.75);
      g.addColorStop(0, '#7861D8');
      g.addColorStop(1, '#242044');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = alpha * enter;
      var cy = H / 2 + (1 - enter) * 30 * u;
      if (logo && endLogo) {
        var h = 220 * u, w = Math.min(logo.width / logo.height * h, W * 0.6);
        var drawnH = w / (logo.width / logo.height);
        ctx.drawImage(logo, (W - w) / 2, cy - 130 * u - drawnH, w, drawnH);
      }
      ctx.fillStyle = '#F8F6FF';
      ctx.font = '700 ' + (84 * u) + 'px Sora, "Segoe UI", sans-serif';
      var nameLines = wrapText(ctx, business, W - margin * 2);
      nameLines.forEach(function (l, i) { ctx.fillText(l, W / 2, cy - 40 * u + (i - nameLines.length + 1) * 96 * u); });
      if (scene.line) {
        ctx.font = '600 ' + (46 * u) + 'px Sora, "Segoe UI", sans-serif';
        var ctaW = ctx.measureText(scene.line).width + 96 * u, ctaH = 104 * u;
        var ctaY = cy + 70 * u;
        ctx.fillStyle = '#BDA8FF';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect((W - ctaW) / 2, ctaY, ctaW, ctaH, ctaH / 2); else ctx.rect((W - ctaW) / 2, ctaY, ctaW, ctaH);
        ctx.fill();
        ctx.fillStyle = '#101426';
        ctx.fillText(scene.line, W / 2, ctaY + ctaH / 2);
      }
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    }

    function drawScene(scene, t, alpha) { (scene.end_card ? endCard : photo)(scene, t, alpha); }

    return function draw(t) {
      var i = 0;
      while (i < scenes.length - 1 && t >= scenes[i].end) i++;
      var scene = scenes[i];
      ctx.fillStyle = '#101426';
      ctx.fillRect(0, 0, W, H);
      var since = t - scene.start;
      if (i > 0 && since < FADE && scene.transition !== 'cut') {
        drawScene(scenes[i - 1], t, 1);
        if (scene.transition === 'slide') {
          ctx.save();
          ctx.translate((rtl ? -1 : 1) * W * (1 - ease(clamp01(since / FADE))), 0);
          drawScene(scene, t, 1);
          ctx.restore();
        } else {
          drawScene(scene, t, since / FADE);
        }
      } else {
        drawScene(scene, t, 1);
      }
    };
  }

  function setProgress(fraction, text) {
    var pct = Math.round(fraction * 100);
    var bar = $('#render-bar');
    bar.setAttribute('aria-valuenow', String(pct));
    $('i', bar).style.width = pct + '%';
    if (text) $('#render-status').textContent = text;
  }
  var JOB_STEPS = [['assets', 'Preparing assets'], ['scenes', 'Building scenes'], ['voice', 'Generating narration'], ['render', 'Rendering video'], ['final', 'Finalizing export']];
  function renderJobSteps(withVoice) {
    var list = $('#job-steps');
    list.textContent = '';
    JOB_STEPS.forEach(function (j) {
      if (j[0] === 'voice' && !withVoice) return;
      var li = el('li', '', j[1]); li.setAttribute('data-job', j[0]);
      list.appendChild(li);
    });
  }
  function setJob(id) {
    var passed = true;
    $$('#job-steps li').forEach(function (li) {
      var current = li.getAttribute('data-job') === id;
      if (current) passed = false;
      li.classList.toggle('is-active', current);
      li.classList.toggle('is-done', passed);
    });
  }
  function fail(message) {
    S.rendering = false;
    show('format');
    error(message);
  }

  function generate() {
    if (S.rendering) return;
    if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
      error('This browser can\'t make videos yet. Please use the latest Chrome, Edge, or Safari.');
      return;
    }
    var blocker = firstInvalid(STEPS.length);
    if (blocker) { var why = validate(blocker); show(blocker); error(why); return; }

    var size = outputSize(), W = size.w, H = size.h;
    var canvas = $('#render-canvas');
    canvas.width = W; canvas.height = H;
    canvas.style.aspectRatio = W + ' / ' + H;
    var wantVoice = S.voice.kind === 'premium' && spokenScenes().length > 0;
    var audioCtx = wantVoice ? audioContext() : null;  // Started by the click, so browsers allow sound.
    S.rendering = true; S.cancel = false;
    renderJobSteps(wantVoice);
    show('generating');
    setJob('assets');
    setProgress(0, 'Preparing your photos…');
    track('Generate_Start', { size: S.size, resolution: S.res, length: S.length });

    var images = {}, logo = null;
    var scenesToLoad = S.scenes.slice();
    var chain = (document.fonts && document.fonts.load ? document.fonts.load('600 40px Sora') : Promise.resolve()).catch(function () {});
    scenesToLoad.forEach(function (s, i) {
      chain = chain.then(function () {
        return loadBlobImage(s.photo.blob).catch(function () { throw new Error('photo:' + s.photo.name); });
      }).then(function (r) {
        // Up to 1.25x the frame, so the slow zoom stays sharp. The photo itself is never altered.
        var scale = Math.min(1, Math.max(W / r.img.naturalWidth, H / r.img.naturalHeight) * 1.25);
        images[s.photo.id] = scaleImage(r.img, Math.max(r.img.naturalWidth, r.img.naturalHeight) * scale);
        URL.revokeObjectURL(r.url);
        setProgress(0.12 * (i + 1) / scenesToLoad.length);
      });
    });
    if (S.logo) chain = chain.then(function () { logo = S.logo.canvas; });

    chain.then(function () {
      if (S.cancel) return null;
      setJob('scenes');
      if (!wantVoice) return null;
      setJob('voice');
      return generateVoiceover(function (n, total) { $('#render-status').textContent = 'Generating voiceover for scene ' + n + ' of ' + total + '…'; })
        .then(function () { return Promise.all(S.scenes.filter(audioReady).map(sceneBuffer)); });
    }).then(function () {
      if (S.cancel) return;
      record(canvas, W, H, images, logo, wantVoice ? audioCtx : null);
    }).catch(function (e) {
      var msg = String(e && e.message || '');
      if (msg.indexOf('photo:') === 0) fail('We couldn\'t read ' + msg.slice(6) + '. Remove it or use a JPG or PNG.');
      else if (e && e.code) fail(backendMessage(e, 'We couldn\'t create your voiceover. Please try again.'));
      else fail('We couldn\'t make your video. Try 720p or fewer photos.');
    });
  }

  function record(canvas, W, H, images, logo, audioCtx) {
    var scenes = timeline();
    var total = S.length;
    var draw = makeDrawer(canvas.getContext('2d'), W, H, images, logo, scenes, S.business.trim(), S.endLogo);
    draw(0);

    var mime = pickMime(!!audioCtx);
    if (!mime) { fail('We couldn\'t make your video. Try 720p or fewer photos.'); return; }
    var stream = canvas.captureStream(30);
    var dest = null;
    if (audioCtx) {
      dest = audioCtx.createMediaStreamDestination();
      dest.stream.getAudioTracks().forEach(function (t) { stream.addTrack(t); });
    }
    var recorder = new window.MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: S.res >= 1080 ? 9000000 : 5000000, audioBitsPerSecond: 128000 });
    var chunks = [], sources = [], stopWatch = 0;
    recorder.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };

    var elapsed = 0, last = window.performance.now(), startedAt = 0, visible = 0;
    function onVisibility() {
      if (recorder.state === 'recording' && document.hidden) { recorder.pause(); if (audioCtx) audioCtx.suspend(); }
      else if (recorder.state === 'paused' && !document.hidden) { last = window.performance.now(); if (audioCtx) audioCtx.resume(); recorder.resume(); }
    }
    document.addEventListener('visibilitychange', onVisibility);
    function cleanUp() {
      window.clearTimeout(stopWatch);
      document.removeEventListener('visibilitychange', onVisibility);
      sources.forEach(function (src) { try { src.stop(); } catch (e) { /* already ended */ } });
      stream.getTracks().forEach(function (t) { t.stop(); });
    }
    recorder.onstop = function () {
      cleanUp();
      if (S.cancel) return;
      finish(new Blob(chunks, { type: mime.split(';')[0] }), mime, W, H, total, !!audioCtx);
    };
    recorder.onerror = function () { cleanUp(); fail('We couldn\'t make your video. Try 720p or fewer photos.'); };
    recorder.start(500);
    setJob('render');
    setProgress(0.15, 'Rendering scene 1 of ' + scenes.length + '…');

    if (audioCtx) {
      startedAt = audioCtx.currentTime + 0.05;
      scenes.forEach(function (item) {
        if (!item.scene || !audioReady(item.scene)) return;
        var src = audioCtx.createBufferSource();
        src.buffer = item.scene.audio.buffer;
        src.connect(dest);
        var room = item.end - item.start;
        src.start(startedAt + item.start + 0.15, 0, Math.max(0.1, room - 0.15 + FADE * 0.5));
        sources.push(src);
      });
    }

    // A timer keeps rendering steady; requestAnimationFrame stalls when the window isn't painted.
    (function frame() {
      if (S.cancel) { recorder.stop(); S.rendering = false; return; }
      if (!document.hidden) {
        var now = window.performance.now();
        var step = Math.max(0, Math.min(now - last, 100)) / 1000;
        visible += step;
        last = now;
        // With a voiceover, the audio clock leads so narration stays in step with the picture.
        elapsed = audioCtx ? Math.max(0, audioCtx.currentTime - startedAt) : elapsed + step;
        draw(Math.min(elapsed, total));
        var n = 0; while (n < scenes.length - 1 && elapsed >= scenes[n].end) n++;
        setProgress(0.15 + 0.8 * Math.min(1, elapsed / total), 'Rendering scene ' + (n + 1) + ' of ' + scenes.length + '…');
        if (visible > total + 60) { S.cancel = true; recorder.stop(); fail('We couldn\'t make your video. Try 720p or fewer photos.'); return; }
      }
      if (elapsed < total) { window.setTimeout(frame, 33); return; }
      setJob('final');
      setProgress(0.97, 'Finishing your file…');
      window.setTimeout(function () { recorder.stop(); }, 250);
      stopWatch = window.setTimeout(function () { cleanUp(); fail('We couldn\'t make your video. Try 720p or fewer photos.'); }, 20000);
    })();
  }

  $('#render-cancel').addEventListener('click', function () {
    S.cancel = true;
    S.rendering = false;
    show('format');
  });

  function finish(blob, mime, W, H, total, hasVoice) {
    S.rendering = false;
    if (S.result) URL.revokeObjectURL(S.result.url);
    var ext = mime.indexOf('mp4') >= 0 ? 'mp4' : 'webm';
    var url = URL.createObjectURL(blob);
    if (S.result && S.result.thumbUrl) URL.revokeObjectURL(S.result.thumbUrl);
    S.result = { url: url, stale: false, ext: ext, W: W, H: H, total: total, createdAt: Date.now(), id: null };
    show('result');

    var video = $('#result-video');
    video.style.aspectRatio = W + ' / ' + H;
    video.src = url;
    var slug = (S.business.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'promo');
    var link = $('#result-download');
    link.href = url;
    link.setAttribute('download', 'velmio-' + slug + '-' + S.size.replace(':', 'x') + '.' + ext);
    $('#result-meta').textContent = W + '×' + H + ' · ' + Math.round(total) + ' seconds · ' + (blob.size / 1048576).toFixed(1) + ' MB · ' + ext.toUpperCase();
    var note = $('#result-voice-note');
    if (hasVoice) note.textContent = 'Your voiceover is included in this video.';
    else if (S.voice.kind === 'browser') note.textContent = 'Press play to hear your voiceover. It plays from your device and isn\'t included in the download.';
    else note.textContent = 'This video has no sound.';
    if (ext === 'webm') note.textContent += ' This browser saves WebM. For Instagram and TikTok, use Chrome, Edge, or Safari to get an MP4.';
    editorScene = S.scenes[0] ? S.scenes[0].id : null;
    $('#editor-note').textContent = '';
    renderEditor();
    renderResultInfo();
    storeVideo(blob, mime, ext, W, H, total, link.getAttribute('download'));
    logEvent('rendered');
    saveNow();
    track('Video_Ready', { size: S.size, resolution: S.res, format: ext, length: S.length });
  }

  /* ---------- Editing after the render ---------- */
  var editorScene = null;
  function renderEditor() {
    if (!S.result) return;
    var line = $('#timeline');
    line.textContent = '';
    var items = timeline().filter(function (x) { return x.scene; });
    items.forEach(function (x, i) {
      var b = el('button', 'tl-item' + (x.scene.id === editorScene ? ' is-active' : ''));
      b.type = 'button';
      b.style.flexGrow = String(Math.max(1, x.end - x.start));
      b.setAttribute('aria-label', 'Edit scene ' + (i + 1));
      var img = el('img'); img.src = x.photo.url; img.alt = '';
      b.appendChild(img);
      var tag = el('span', 'tl-tag tl-time', (Math.round((x.end - x.start) * 10) / 10) + 's'); tag.setAttribute('translate', 'no');
      b.appendChild(tag);
      b.appendChild(el('span', 'tl-tag tl-num', String(i + 1)));
      var cap = el('small', '', x.scene.text); cap.setAttribute('translate', 'no');
      b.appendChild(cap);
      b.addEventListener('click', function () { editorScene = x.scene.id; renderEditor(); });
      line.appendChild(b);
    });
    var at = -1;
    S.scenes.forEach(function (s, i) { if (s.id === editorScene) at = i; });
    if (at < 0 && S.scenes.length) { at = 0; editorScene = S.scenes[0].id; }
    var scene = S.scenes[at];
    var box = $('#timeline-editor');
    box.textContent = '';
    $('#end-logo').checked = S.endLogo;
    $('#end-logo').closest('.check').hidden = !S.logo;
    if (!scene) return;

    var capWrap = el('div');
    var capLabel = el('label', '', 'Caption for scene ' + (at + 1)); capLabel.setAttribute('for', 'edit-caption');
    var cap = el('input'); cap.id = 'edit-caption'; cap.type = 'text'; cap.maxLength = MAX_LINE; cap.value = scene.text;
    cap.addEventListener('input', function () { scene.text = cap.value; scene.edited = true; changed(); });
    capWrap.appendChild(capLabel); capWrap.appendChild(cap);
    box.appendChild(capWrap);

    var row = el('div', 'timeline-row');
    var durWrap = el('div');
    var durLabel = el('label', '', 'Seconds'); durLabel.setAttribute('for', 'edit-seconds');
    var dur = el('input'); dur.id = 'edit-seconds'; dur.type = 'number'; dur.min = '1'; dur.max = String(available()); dur.step = '0.1'; dur.value = (Math.round(secondsOf(scene) * 10) / 10).toFixed(1);
    dur.addEventListener('change', function () { setSceneSeconds(scene, dur.value); scene.edited = true; renderEditor(); changed(); });
    durWrap.appendChild(durLabel); durWrap.appendChild(dur);
    row.appendChild(durWrap);
    row.appendChild(selectField('Transition', TRANSITIONS, scene.transition, function (v) { scene.transition = v; scene.edited = true; changed(); }));
    row.appendChild(selectField('Movement', MOVES, scene.motion, function (v) { scene.motion = v; scene.edited = true; changed(); }));
    box.appendChild(row);

    var tools = el('div', 'timeline-tools');
    [['↑', 'Move scene earlier', at - 1, at === 0], ['↓', 'Move scene later', at + 1, at === S.scenes.length - 1]].forEach(function (t) {
      var b = el('button', 'icon-btn', t[0]);
      b.type = 'button'; b.setAttribute('aria-label', t[1] + ' ' + (at + 1)); b.disabled = t[3];
      b.addEventListener('click', function () { moveScene(at, t[2]); });
      tools.appendChild(b);
    });
    var replace = el('label', 'btn-soft is-small');
    replace.tabIndex = 0;
    var file = el('input', 'visually-hidden'); file.type = 'file'; file.accept = 'image/jpeg,image/png,image/webp';
    file.addEventListener('change', function () {
      var f = file.files[0];
      if (!f) return;
      if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { error(T(f.name + ' isn\'t a JPG, PNG, or WebP.')); return; }
      if (f.size > MAX_BYTES) { error(T(f.name + ' is larger than 20 MB.')); return; }
      makePhoto(f, f.name).then(function (photo) {
        URL.revokeObjectURL(scene.photo.url);
        scene.photo = photo;
        error('');
        renderPhotos(); renderEditor(); changed();
      }, function () { error(T('We couldn\'t read ' + f.name + '. Remove it or use a JPG or PNG.')); });
    });
    replace.appendChild(file);
    replace.appendChild(el('span', '', 'Replace photo'));
    tools.appendChild(replace);
    box.appendChild(tools);
  }
  $('#end-logo').addEventListener('change', function () { S.endLogo = this.checked; changed(); });
  $('#result-save').addEventListener('click', function () { flashSaved(this); });
  $('#result-render').addEventListener('click', function () { $('#result-video').pause(); generate(); });
  $('#result-download').addEventListener('click', function () { track('Video_Download', { size: S.size }); logEvent('downloaded'); });
  $('#result-edit').addEventListener('click', function () { $('#result-video').pause(); show('script'); });
  $('#result-new').addEventListener('click', function () {
    confirmBox('Start a new video? Your current project will be cleared.', 'Start new').then(function (go) {
      if (!go) return;
      $('#result-video').pause();
      S.scenes.forEach(function (s) { URL.revokeObjectURL(s.photo.url); });
      if (S.result) URL.revokeObjectURL(S.result.url);
      S.scenes = []; S.result = null; S.source = ''; S.brief = ''; S.title = ''; S.activeId = null; S.composerOpen = true; S.saveState = 'empty';
      applyLogo(null);
      fillFields();
      renderPhotos();
      writeProject(null).catch(function () {});
      show('photos');
    });
  });

  /* ---------- Result details and the on-device library ---------- */
  var MODE_NAMES = { text: 'Text only', voice: 'Voiceover only', text_voice: 'Text + Voiceover' };
  function projectTitle() { return (S.title || S.business || '').trim() || T('Untitled project'); }
  function logEvent(type) { if (window.VelmioLibrary) window.VelmioLibrary.log(type, projectTitle()); }
  function renderResultInfo() {
    if (!S.result) return;
    $('#r-title').textContent = projectTitle();
    $('#r-created').textContent = new Date(S.result.createdAt).toLocaleString(LANG, { dateStyle: 'medium', timeStyle: 'short' });
    $('#r-duration').textContent = Math.round(S.result.total) + ' sec';
    $('#r-aspect').textContent = sizeInfo().label + ' ' + S.size;
    $('#r-resolution').textContent = S.result.W + '×' + S.result.H;
    $('#r-mode').textContent = MODE_NAMES[S.audioMode];
    $('#r-status').textContent = 'Completed';
  }
  function makeThumb(W, H) {
    return new Promise(function (resolve) {
      var first = S.scenes[0];
      if (!first) { resolve(null); return; }
      var c = document.createElement('canvas');
      c.width = 480;
      c.height = Math.round(480 * H / W);
      var src = first.photo.canvas, scale = Math.max(c.width / src.width, c.height / src.height);
      c.getContext('2d').drawImage(src, (c.width - src.width * scale) / 2, (c.height - src.height * scale) / 2, src.width * scale, src.height * scale);
      c.toBlob(resolve, 'image/jpeg', 0.8);
    });
  }
  function storeVideo(blob, mime, ext, W, H, total, filename) {
    if (!window.VelmioLibrary) return;
    var made = S.result;
    makeThumb(W, H).then(function (thumb) {
      return window.VelmioLibrary.addVideo({
        title: projectTitle(), projectTitle: projectTitle(), blob: blob, mime: mime, ext: ext, thumb: thumb, filename: filename,
        duration: Math.round(total), aspect: S.size, resolution: W + '×' + H, mode: S.audioMode, createdAt: made.createdAt, status: 'completed'
      });
    }).then(function (saved) {
      made.id = saved.id;
    }).catch(function () {
      $('#editor-note').textContent = 'We couldn\'t save this video to My Videos. Download it to keep it.';
    });
  }
  $('#result-rename').addEventListener('click', function () {
    window.VelmioUI.ask({ message: 'Project name', value: projectTitle(), confirm: 'Save' }).then(function (name) {
      if (!name) return;
      S.title = name;
      renderResultInfo();
      if (S.result && S.result.id) window.VelmioLibrary.update(S.result.id, { title: name, projectTitle: name });
      saveNow();
    });
  });
  $('#result-delete').addEventListener('click', function () {
    window.VelmioUI.ask({ message: 'Delete this video? This can\'t be undone.', confirm: 'Delete' }).then(function (yes) {
      if (!yes || !S.result) return;
      $('#result-video').pause();
      if (S.result.id) window.VelmioLibrary.remove(S.result.id);
      URL.revokeObjectURL(S.result.url);
      S.result = null;
      show('format');
    });
  });

  /* ---------- Start ---------- */
  function applyPreferences() {
    var p = {};
    try { p = JSON.parse(window.localStorage.getItem('vm_prefs')) || {}; } catch (e) { /* storage blocked */ }
    if (SIZES.some(function (s) { return s.id === p.size; })) S.size = p.size;
    if (LENGTHS.some(function (l) { return l.id === p.length; })) S.length = p.length;
    if (p.lang) S.scriptLang = p.lang;
    if (MODE_NAMES[p.mode]) S.audioMode = p.mode;
  }
  function restore(saved) {
    if (!saved || saved.v !== 2) { applyPreferences(); return Promise.resolve(); }
    ['business', 'brief', 'cta', 'tone', 'scriptLang', 'platform', 'voice', 'size', 'res', 'length', 'endLogo', 'source', 'nextId', 'audioMode', 'lastVoice', 'voiceRate', 'voiceVolume', 'title'].forEach(function (k) {
      if (saved[k] !== undefined) S[k] = saved[k];
    });
    if (!saved.audioMode) S.audioMode = S.voice.kind === 'none' ? 'text' : 'text_voice';
    if (LENGTHS.every(function (l) { return l.id !== S.length; })) S.length = 20;
    var loaded = [];
    return saved.scenes.reduce(function (chain, s) {
      return chain.then(function () {
        return makePhoto(s.photo.blob, s.photo.name, s.photo.id).then(function (photo) {
          loaded.push({ id: s.id, photo: photo, label: s.label, text: s.text, voice: s.voice, weight: s.weight, motion: s.motion, transition: s.transition, edited: s.edited, audio: s.audio });
        }, function () { /* an unreadable photo is left out */ });
      });
    }, Promise.resolve()).then(function () {
      S.scenes = loaded;
      S.activeId = loaded[0] ? loaded[0].id : null;
      S.composerOpen = !hasScript();
      S.saveState = 'saved';
      return saved.logo ? makeLogo(saved.logo.blob, saved.logo.name).then(applyLogo, function () {}) : null;
    }).then(function () { return saved.step; });
  }

  readProject().then(restore).then(function (step) {
    fillFields();
    renderPhotos();
    var target = STEPS.indexOf(step) >= 0 ? step : 'photos';
    show(firstInvalid(STEPS.indexOf(target)) || target);
  }, function () {
    fillFields();
    renderPhotos();
    show('photos');
  });
})();
