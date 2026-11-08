/* Dashboard pages. Everything shown here comes from what is actually stored in this browser. */
(function () {
  'use strict';

  var shell = document.getElementById('shell');
  if (!shell || !window.VelmioUI) return;
  var UI = window.VelmioUI, Lib = window.VelmioLibrary;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var root = shell.getAttribute('data-root');
  var pageId = shell.getAttribute('data-page');
  var LANG = window.VelmioI18n ? window.VelmioI18n.lang : 'en';
  var T = function (s) { return window.VelmioI18n ? window.VelmioI18n.t(s) : s; };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function dated(ts) { return new Date(ts).toLocaleDateString(LANG, { year: 'numeric', month: 'short', day: 'numeric' }); }
  function timed(ts) { return new Date(ts).toLocaleString(LANG, { dateStyle: 'medium', timeStyle: 'short' }); }

  /* ---------- Shell ---------- */
  var navLink = $('[data-nav="' + pageId + '"]');
  if (navLink) navLink.setAttribute('aria-current', 'page');
  var toggle = $('#side-toggle'), scrim = $('#shell-scrim');
  function setSide(open) {
    shell.classList.toggle('is-open', open);
    scrim.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }
  toggle.addEventListener('click', function () { setSide(!shell.classList.contains('is-open')); });
  scrim.addEventListener('click', function () { setSide(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && shell.classList.contains('is-open')) { setSide(false); toggle.focus(); }
  });

  /* ---------- Shared pieces ---------- */
  function emptyState(title, text, label, href) {
    var box = el('div', 'empty');
    box.innerHTML = '<svg class="art" viewBox="0 0 360 150" aria-hidden="true"><use href="#art-frames"/></svg>';
    box.appendChild(el('strong', '', title));
    box.appendChild(el('p', '', text));
    if (label) {
      var a = el('a', 'ui-btn primary', label);
      a.href = href;
      box.appendChild(a);
    }
    return box;
  }
  function skeletons(area, n) {
    var grid = el('div', 'video-grid');
    for (var i = 0; i < n; i++) grid.appendChild(el('div', 'skel'));
    area.textContent = '';
    area.appendChild(grid);
  }
  function loadError(area) {
    area.textContent = '';
    area.appendChild(emptyState('We couldn\'t load your videos.', 'Your browser may be blocking storage for this site. Try reloading the page.'));
  }
  function menuButton(label, icon, action, danger) {
    var b = el('button');
    b.type = 'button';
    b.setAttribute('role', 'menuitem');
    if (danger) b.className = 'is-danger';
    b.innerHTML = UI.ic(icon);
    b.appendChild(el('span', '', label));
    b.addEventListener('click', action);
    return b;
  }
  function moreMenu(items, label) {
    var wrap = el('div', 'vmenu');
    var btn = el('button', 'icon-btn-plain');
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-label', label);
    btn.innerHTML = UI.ic('dots');
    var panel = el('div', 'menu');
    panel.setAttribute('role', 'menu');
    panel.hidden = true;
    items.forEach(function (i) { panel.appendChild(i); });
    wrap.appendChild(btn); wrap.appendChild(panel);
    UI.bindMenu(btn, panel);
    return wrap;
  }
  function thumbInto(button, blob, title) {
    if (blob) {
      var img = el('img');
      img.src = URL.createObjectURL(blob);
      img.alt = '';
      img.loading = 'lazy';
      button.appendChild(img);
    }
    var play = el('span', 'vplay');
    play.innerHTML = UI.ic('play');
    button.appendChild(play);
    button.setAttribute('aria-label', T('Open') + ': ' + title);
  }
  function statusChip(status) {
    var labels = { completed: 'Completed', draft: 'Draft', processing: 'Processing', failed: 'Failed' };
    return el('span', 'status is-' + status, labels[status] || status);
  }
  function downloadVideo(v) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(v.blob);
    a.download = v.filename || ('velmio-video.' + v.ext);
    document.body.appendChild(a);
    a.click();
    a.remove();
    Lib.log('downloaded', v.title);
  }

  /* ---------- Video cards ---------- */
  var refresh = function () {};
  function openPlayer(v) {
    var box = el('dialog', 'player-dialog');
    var head = el('div', 'player-head');
    var title = el('strong', '', v.title); title.setAttribute('translate', 'no');
    var close = el('button', 'icon-btn-plain');
    close.type = 'button'; close.setAttribute('aria-label', 'Close'); close.innerHTML = UI.ic('x');
    head.appendChild(title); head.appendChild(close);
    var video = el('video');
    var url = URL.createObjectURL(v.blob);
    video.src = url; video.controls = true; video.playsInline = true;
    var foot = el('div', 'player-foot');
    var meta = el('p', '', v.duration + ' sec · ' + v.aspect + ' · ' + v.resolution);
    var dl = el('button', 'ui-btn primary');
    dl.type = 'button'; dl.innerHTML = UI.ic('download');
    dl.appendChild(el('span', '', 'Download video'));
    dl.addEventListener('click', function () { downloadVideo(v); });
    foot.appendChild(meta); foot.appendChild(dl);
    box.appendChild(head); box.appendChild(video); box.appendChild(foot);
    function done() { video.pause(); URL.revokeObjectURL(url); box.close(); box.remove(); }
    close.addEventListener('click', done);
    box.addEventListener('cancel', function (e) { e.preventDefault(); done(); });
    document.body.appendChild(box);
    box.showModal();
  }
  function renameVideo(v) {
    UI.ask({ message: 'Project name', value: v.title, confirm: 'Save' }).then(function (name) {
      if (name) Lib.update(v.id, { title: name }).then(refresh);
    });
  }
  function deleteVideo(v) {
    UI.ask({ message: 'Delete this video? This can\'t be undone.', confirm: 'Delete' }).then(function (yes) {
      if (yes) Lib.remove(v.id).then(refresh);
    });
  }
  function videoCard(v) {
    var card = el('article', 'vcard');
    var thumb = el('button', 'vthumb');
    thumb.type = 'button';
    thumbInto(thumb, v.thumb, v.title);
    thumb.addEventListener('click', function () { openPlayer(v); });
    var body = el('div', 'vbody');
    var text = el('div', 'vtext');
    var name = el('strong', '', v.title); name.setAttribute('translate', 'no');
    text.appendChild(name);
    text.appendChild(el('p', 'vmeta', v.duration + ' sec · ' + v.aspect + ' · ' + dated(v.createdAt)));
    text.appendChild(statusChip(v.status));
    body.appendChild(text);
    var editLink = el('a');
    editLink.href = root + 'app/';
    editLink.setAttribute('role', 'menuitem');
    editLink.innerHTML = UI.ic('pencil');
    editLink.appendChild(el('span', '', 'Edit'));
    body.appendChild(moreMenu([
      menuButton('Open', 'play', function () { openPlayer(v); }),
      editLink,
      menuButton('Download', 'download', function () { downloadVideo(v); }),
      menuButton('Rename', 'pencil', function () { renameVideo(v); }),
      menuButton('Duplicate', 'copy', function () { Lib.duplicate(v.id, T(v.title + ' copy')).then(refresh); }),
      menuButton('Delete', 'trash', function () { deleteVideo(v); }, true)
    ], 'More actions'));
    card.appendChild(thumb);
    card.appendChild(body);
    return card;
  }
  function grid(list, isList) {
    var g = el('div', 'video-grid' + (isList ? ' is-list' : ''));
    list.forEach(function (v) { g.appendChild(videoCard(v)); });
    return g;
  }
  function firstVideoEmpty() {
    return emptyState('Your next great video starts here.', 'Upload a few photos and let Velmio help bring your idea to life.', 'Create your first video', root + 'app/');
  }

  /* ---------- Overview ---------- */
  function initDashboard() {
    var area = $('#video-area');
    refresh = function () {
      skeletons(area, 3);
      Promise.all([Lib.videos(), Lib.project().catch(function () { return null; })]).then(function (data) {
        var videos = data[0].sort(function (a, b) { return b.createdAt - a.createdAt; });
        $('#stat-videos').textContent = String(videos.length);
        $('#stat-projects').textContent = data[1] && data[1].scenes && data[1].scenes.length ? '1' : '0';
        $('#stat-ready').textContent = String(videos.filter(function (v) { return v.status === 'completed'; }).length);
        area.textContent = '';
        area.appendChild(videos.length ? grid(videos.slice(0, 6)) : firstVideoEmpty());
      }).catch(function () { loadError(area); });
    };
    refresh();
  }

  /* ---------- My Videos ---------- */
  function initVideos() {
    var area = $('#video-area'), all = [], isList = false;
    function paint() {
      var q = $('#v-search').value.trim().toLowerCase(), status = $('#v-status').value, dir = $('#v-sort').value === 'old' ? 1 : -1;
      var list = all.filter(function (v) { return (!status || v.status === status) && (!q || v.title.toLowerCase().indexOf(q) !== -1); })
        .sort(function (a, b) { return (a.createdAt - b.createdAt) * dir; });
      area.textContent = '';
      if (!all.length) area.appendChild(firstVideoEmpty());
      else if (!list.length) area.appendChild(emptyState('No videos match your search.', 'Try a different search or filter.'));
      else area.appendChild(grid(list, isList));
    }
    refresh = function () {
      skeletons(area, 3);
      Lib.videos().then(function (rows) { all = rows; paint(); }).catch(function () { loadError(area); });
    };
    ['v-search', 'v-status', 'v-sort'].forEach(function (id) { $('#' + id).addEventListener('input', paint); });
    function setView(list) {
      isList = list;
      $('#v-grid').setAttribute('aria-pressed', String(!list));
      $('#v-list').setAttribute('aria-pressed', String(list));
      paint();
    }
    $('#v-grid').addEventListener('click', function () { setView(false); });
    $('#v-list').addEventListener('click', function () { setView(true); });
    refresh();
  }

  /* ---------- Projects ---------- */
  var STEP_NAMES = { photos: 'Photos & Logo', script: 'AI Script', voice: 'Voiceover & Audio', format: 'Length & Size' };
  function initProjects() {
    var area = $('#project-area');
    refresh = function () {
      skeletons(area, 1);
      Promise.all([Lib.project(), Lib.videos().catch(function () { return []; })]).then(function (data) {
        var p = data[0];
        area.textContent = '';
        if (!p || !p.scenes || !p.scenes.length) {
          area.appendChild(emptyState('No projects yet', 'Start a video and your work will be saved here.', 'Create new video', root + 'app/'));
          return;
        }
        var title = p.title || p.business || T('Untitled project');
        var finished = data[1].some(function (v) { return v.projectTitle === title; });
        var g = el('div', 'video-grid');
        var card = el('article', 'vcard pcard');
        var cover = el('a', 'vthumb');
        cover.href = root + 'app/';
        cover.setAttribute('aria-label', 'Continue editing');
        card.appendChild(el('span', 'pcard-tag', 'Project'));
        var img = el('img'); img.src = URL.createObjectURL(p.scenes[0].photo.blob); img.alt = '';
        cover.appendChild(img);
        card.appendChild(cover);
        var body = el('div', 'vbody');
        var text = el('div', 'vtext');
        var name = el('strong', '', title); name.setAttribute('translate', 'no');
        text.appendChild(name);
        if (p.savedAt) text.appendChild(el('p', 'vmeta', T('Last edited ' + dated(p.savedAt))));
        text.appendChild(el('p', 'vmeta', T(p.scenes.length + ' photos')));
        text.appendChild(el('p', 'vmeta', STEP_NAMES[p.step] || ''));
        text.appendChild(statusChip(finished ? 'completed' : 'draft'));
        body.appendChild(text);
        var dup = menuButton('Duplicate', 'copy', function () {});
        dup.disabled = true;
        dup.appendChild(el('span', 'soon', 'Coming soon'));
        body.appendChild(moreMenu([
          menuButton('Rename', 'pencil', function () {
            UI.ask({ message: 'Project name', value: title, confirm: 'Save' }).then(function (n) {
              if (!n) return;
              p.title = n;
              Lib.saveProject(p).then(refresh);
            });
          }),
          dup,
          menuButton('Delete', 'trash', function () {
            UI.ask({ message: 'Delete this project? This can\'t be undone.', confirm: 'Delete' }).then(function (yes) {
              if (yes) Lib.deleteProject().then(refresh);
            });
          }, true)
        ], 'More actions'));
        card.appendChild(body);
        var actions = el('div', 'pcard-actions');
        var go = el('a', 'ui-btn primary', 'Continue editing');
        go.href = root + 'app/';
        actions.appendChild(go);
        card.appendChild(actions);
        g.appendChild(card);
        area.appendChild(g);
      }).catch(function () { loadError(area); });
    };
    refresh();
  }

  /* ---------- History ---------- */
  var EVENTS = {
    project: ['Project created', 'folder'], photos: ['Photos uploaded', 'image'], script: ['Script generated', 'spark-line'],
    voice: ['Voiceover generated', 'mic'], rendered: ['Video rendered', 'film'], downloaded: ['Video downloaded', 'download'], updated: ['Project updated', 'pencil']
  };
  function initHistory() {
    var area = $('#history-area');
    Lib.events().then(function (rows) {
      area.textContent = '';
      if (!rows.length) { area.appendChild(emptyState('No activity yet', 'Your created videos and changes will appear here.', 'Create new video', root + 'app/')); return; }
      var list = el('ul', 'feed');
      rows.sort(function (a, b) { return b.at - a.at; }).slice(0, 100).forEach(function (r) {
        var info = EVENTS[r.type] || [r.type, 'clock'];
        var li = el('li');
        var icon = el('span', 'feed-ic'); icon.innerHTML = UI.ic(info[1]);
        var text = el('div', 'feed-text');
        text.appendChild(el('strong', '', info[0]));
        if (r.project) { var p = el('span', '', r.project); p.setAttribute('translate', 'no'); text.appendChild(p); }
        li.appendChild(icon); li.appendChild(text); li.appendChild(el('time', '', timed(r.at)));
        list.appendChild(li);
      });
      area.appendChild(list);
    }).catch(function () { loadError(area); });
  }

  /* ---------- Brand kit: a live preview only; nothing here is stored ---------- */
  function initBrand() {
    function paint() {
      var box = $('#b-preview');
      box.style.background = 'linear-gradient(150deg,' + $('#b-primary').value + ',' + $('#b-secondary').value + ')';
      box.style.fontFamily = $('#b-font').value;
      $('#b-preview-name').textContent = $('#b-name').value.trim() || T('Your brand');
      $('#b-preview-close').textContent = $('#b-close').value.trim() || T('Your closing message');
    }
    ['b-name', 'b-primary', 'b-secondary', 'b-font', 'b-close'].forEach(function (id) { $('#' + id).addEventListener('input', paint); });
    $('#b-logo').addEventListener('change', function () {
      var f = this.files[0], img = $('#b-preview-logo');
      img.hidden = !f;
      if (f) img.src = URL.createObjectURL(f);
    });
    paint();
  }

  /* ---------- Settings ---------- */
  function initSettings() {
    function showTab(name) {
      if (!$('[data-tab="' + name + '"]')) name = 'profile';
      $$('[data-tab]').forEach(function (b) { b.setAttribute('aria-selected', String(b.getAttribute('data-tab') === name)); });
      $$('.tab-panel').forEach(function (p) { p.hidden = p.getAttribute('data-panel') !== name; });
    }
    $$('[data-tab]').forEach(function (b) {
      b.addEventListener('click', function () { showTab(b.getAttribute('data-tab')); window.history.replaceState(null, '', '#' + b.getAttribute('data-tab')); });
    });
    window.addEventListener('hashchange', function () { showTab(window.location.hash.slice(1)); });
    showTab(window.location.hash.slice(1) || 'profile');

    var u = UI.user() || {};
    $('#s-name').value = u.name || '';
    $('#s-email').value = u.email || '';
    $('#s-save-profile').addEventListener('click', function () {
      var now = UI.user() || {};
      now.name = $('#s-name').value.trim();
      try { window.localStorage.setItem('vm_user', JSON.stringify(now)); } catch (e) { /* storage blocked */ }
      UI.fillAccount();
      $('#s-profile-note').textContent = 'Saved on this device';
    });

    var prefs = {};
    try { prefs = JSON.parse(window.localStorage.getItem('vm_prefs')) || {}; } catch (e) { /* storage blocked */ }
    var fields = { 'p-size': ['size', '9:16'], 'p-length': ['length', '20'], 'p-lang': ['lang', LANG], 'p-mode': ['mode', 'text_voice'] };
    Object.keys(fields).forEach(function (id) {
      var f = fields[id], node = $('#' + id);
      node.value = prefs[f[0]] != null ? String(prefs[f[0]]) : f[1];
      node.addEventListener('change', function () {
        prefs[f[0]] = f[0] === 'length' ? Number(node.value) : node.value;
        try { window.localStorage.setItem('vm_prefs', JSON.stringify(prefs)); } catch (e) { /* storage blocked */ }
        $('#p-note').textContent = 'Saved on this device';
      });
    });
    var theme = $('#p-theme');
    theme.value = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    theme.addEventListener('change', function () {
      if (theme.value === 'light') document.documentElement.setAttribute('data-theme', 'light');
      else document.documentElement.removeAttribute('data-theme');
      try { window.localStorage.setItem('vm_theme', theme.value); } catch (e) { /* storage blocked */ }
      $('#p-note').textContent = 'Saved on this device';
    });
  }

  ({ dashboard: initDashboard, videos: initVideos, projects: initProjects, history: initHistory, brand: initBrand, settings: initSettings }[pageId] || function () {})();
})();
