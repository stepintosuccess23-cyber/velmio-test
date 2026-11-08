/* The Velmio chat assistant. Messages go to the Apps Script web app, which holds
   the Claude API key on the server. No key ever reaches this file. */
(function () {
  'use strict';

  var cfg = window.SITE_CONFIG || {};
  var endpoint = (cfg.formEndpoint || '').trim();
  var root = document.getElementById('chat');
  if (!root || !endpoint || cfg.chatEnabled !== true) return;

  var KEY = 'vm_chat';
  var MAX_SENT = 16;
  var loadedAt = Date.now();
  var launch = document.getElementById('chat-launch');
  var panel = document.getElementById('chat-panel');
  var log = document.getElementById('chat-log');
  var starters = document.getElementById('chat-starters');
  var form = document.getElementById('chat-form');
  var input = document.getElementById('chat-input');
  var send = document.getElementById('chat-send');
  var state = load();
  var waiting = false;

  function load() {
    try {
      var saved = JSON.parse(window.sessionStorage.getItem(KEY));
      if (saved && Array.isArray(saved.items)) return saved;
    } catch (e) { /* storage blocked */ }
    return { open: false, items: [] };
  }
  function save() {
    try { window.sessionStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage blocked */ }
  }
  function track(name) { if (window.velmioTrack) window.velmioTrack(name, {}, { once: true }); }

  function scrollDown() { log.scrollTop = log.scrollHeight; }

  function addLinks(pages) {
    if (!pages || !pages.length) return;
    var row = document.createElement('div');
    row.className = 'chat-links';
    pages.forEach(function (page) {
      var link = document.querySelector('#chat-pages [data-page="' + page + '"]');
      if (link) row.appendChild(link.cloneNode(true));
    });
    log.appendChild(row);
  }

  function addBubble(item) {
    if (item.text) {
      var bubble = document.createElement('div');
      bubble.className = 'chat-msg ' + (item.role === 'user' ? 'chat-user' : 'chat-bot');
      bubble.textContent = item.text;
      // Conversation text is the visitor's own wording, so the page translator leaves it alone.
      bubble.setAttribute('translate', 'no');
      // English text inside a right-to-left page keeps its own direction, and the reverse.
      bubble.setAttribute('dir', 'auto');
      log.appendChild(bubble);
    }
    addLinks(item.links);
    scrollDown();
  }

  // Shown only, not kept in the conversation sent to the assistant.
  function addNotice(text, withContact) {
    var bubble = document.createElement('div');
    bubble.className = 'chat-msg chat-bot';
    bubble.textContent = text;
    log.appendChild(bubble);
    if (withContact) addLinks(['contact']);
    scrollDown();
  }

  function setOpen(open) {
    state.open = open;
    save();
    root.classList.toggle('is-open', open);
    panel.hidden = !open;
    launch.setAttribute('aria-expanded', String(open));
    if (open) {
      track('Chat_Open');
      scrollDown();
      // On phones, focusing the box would open the keyboard over the conversation.
      if (window.matchMedia('(hover: hover)').matches) input.focus();
    }
  }

  function resizeInput() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  }

  function setWaiting(on) {
    waiting = on;
    send.disabled = on;
    var typing = document.getElementById('chat-typing');
    if (typing) typing.parentNode.removeChild(typing);
    if (on) {
      var dots = document.createElement('div');
      dots.id = 'chat-typing';
      dots.className = 'chat-msg chat-bot chat-typing';
      dots.setAttribute('role', 'status');
      dots.setAttribute('aria-label', 'Writing a reply…');
      dots.innerHTML = '<i></i><i></i><i></i>';
      log.appendChild(dots);
      scrollDown();
    }
  }

  function conversation() {
    return state.items.slice(-MAX_SENT).map(function (m) { return { role: m.role, content: m.text }; });
  }

  function ask(text) {
    if (waiting) return;
    text = text.trim();
    if (!text) return;
    starters.hidden = true;
    var question = { role: 'user', text: text };
    state.items.push(question);
    save();
    addBubble(question);
    input.value = '';
    resizeInput();
    track('Chat_Message');
    setWaiting(true);

    var data = new URLSearchParams();
    data.set('form', 'chat');
    data.set('messages', JSON.stringify(conversation()));
    data.set('language', window.VelmioI18n ? window.VelmioI18n.lang : 'en');
    data.set('page', window.location.origin + window.location.pathname);
    data.set('elapsed_ms', String(Date.now() - loadedAt));

    var controller = window.AbortController ? new AbortController() : null;
    var timeout = controller ? window.setTimeout(function () { controller.abort(); }, 45000) : 0;

    function fail(message, withContact) {
      window.clearTimeout(timeout);
      setWaiting(false);
      // A question that got no answer shouldn't be sent again with the next one.
      state.items.splice(state.items.indexOf(question), 1);
      save();
      addNotice(message, withContact);
    }

    window.fetch(endpoint, { method: 'POST', body: data, redirect: 'follow', signal: controller ? controller.signal : undefined })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (result) {
        if (!result || result.ok !== true) {
          if (result && result.error === 'rate_limited') fail('I\'m getting a lot of questions right now. Please try again in a minute.', false);
          else fail('I can\'t answer that right now. You can reach the team on our Contact page.', true);
          return;
        }
        window.clearTimeout(timeout);
        setWaiting(false);
        var answer = { role: 'assistant', text: String(result.reply || '').replace(/\*\*/g, ''), links: result.links || [] };
        state.items.push(answer);
        save();
        addBubble(answer);
      })
      .catch(function () { fail('I can\'t answer that right now. You can reach the team on our Contact page.', true); });
  }

  launch.addEventListener('click', function () { setOpen(true); });
  document.getElementById('chat-close').addEventListener('click', function () { setOpen(false); launch.focus(); });
  panel.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { setOpen(false); launch.focus(); }
  });
  form.addEventListener('submit', function (e) { e.preventDefault(); ask(input.value); });
  input.addEventListener('input', resizeInput);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(input.value); }
  });
  Array.prototype.forEach.call(starters.querySelectorAll('button'), function (b) {
    b.addEventListener('click', function () { ask(b.textContent); });
  });

  // On phones the panel fills the screen, so it must get out of the way of the page.
  var isPhone = window.matchMedia('(max-width: 639px)');
  log.addEventListener('click', function (e) {
    if (e.target.closest('.chat-link') && isPhone.matches) setOpen(false);
  });

  state.items.forEach(addBubble);
  starters.hidden = state.items.length > 0;
  root.hidden = false;
  setOpen(state.open && !isPhone.matches);
})();
