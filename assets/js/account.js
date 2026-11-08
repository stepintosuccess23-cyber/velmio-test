/* Shared account menu, popup menus and dialogs for signed-in pages. */
(function () {
  'use strict';

  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function user() {
    try { return JSON.parse(window.localStorage.getItem('vm_user')); } catch (e) { return null; }
  }
  var shell = document.getElementById('shell');
  if (shell && !user()) { window.location.replace(shell.getAttribute('data-signup')); return; }

  function ic(name) {
    return '<svg class="ic" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
  }

  var openMenus = [];
  function closeAll(except) {
    openMenus.slice().forEach(function (m) { if (m !== except) m.close(false); });
  }

  /* Opens on click, closes outside, moves with the arrow keys, and stays on screen. */
  function bindMenu(button, panel) {
    function items() { return $$('a, button:not(:disabled)', panel); }
    var api = {
      close: function (refocus) {
        panel.hidden = true;
        button.setAttribute('aria-expanded', 'false');
        openMenus.splice(openMenus.indexOf(api), 1);
        if (refocus) button.focus();
      }
    };
    function open() {
      closeAll(api);
      panel.hidden = false;
      panel.classList.remove('is-up');
      button.setAttribute('aria-expanded', 'true');
      openMenus.push(api);
      var rect = panel.getBoundingClientRect();
      var above = button.getBoundingClientRect().top;
      if (rect.bottom > window.innerHeight - 8 && above > rect.height) panel.classList.add('is-up');
      var first = items()[0];
      if (first) first.focus({ preventScroll: true });
    }
    button.addEventListener('click', function (e) {
      e.stopPropagation();
      if (panel.hidden) open(); else api.close(true);
    });
    panel.addEventListener('click', function (e) {
      e.stopPropagation();
      if (e.target.closest('a, button')) api.close(false);
    });
    panel.addEventListener('keydown', function (e) {
      var list = items(), at = list.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); list[(at + 1) % list.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); list[(at - 1 + list.length) % list.length].focus(); }
      else if (e.key === 'Home') { e.preventDefault(); list[0].focus(); }
      else if (e.key === 'End') { e.preventDefault(); list[list.length - 1].focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); api.close(true); }
      else if (e.key === 'Tab') { api.close(false); }
    });
    return api;
  }
  document.addEventListener('click', function () { closeAll(null); });

  /* Asks a question, optionally with a text box. Resolves to false or the answer. */
  function ask(options) {
    var box = document.createElement('dialog');
    box.className = 'ui-dialog';
    var text = document.createElement('p');
    text.textContent = options.message;
    box.appendChild(text);
    var input = null;
    if (options.value !== undefined) {
      input = document.createElement('input');
      input.type = 'text';
      input.maxLength = 80;
      input.value = options.value;
      input.setAttribute('aria-label', options.message);
      box.appendChild(input);
    }
    var row = document.createElement('div');
    row.className = 'ui-dialog-actions';
    var no = document.createElement('button');
    no.type = 'button'; no.className = 'ui-btn'; no.textContent = 'Cancel';
    var yes = document.createElement('button');
    yes.type = 'button'; yes.className = 'ui-btn primary'; yes.textContent = options.confirm;
    row.appendChild(no); row.appendChild(yes);
    box.appendChild(row);
    document.body.appendChild(box);
    box.showModal();
    if (input) input.select();
    return new Promise(function (resolve) {
      function done(answer) { box.close(); box.remove(); resolve(answer); }
      no.addEventListener('click', function () { done(false); });
      yes.addEventListener('click', function () {
        if (!input) { done(true); return; }
        var value = input.value.trim();
        if (value) done(value);
      });
      if (input) input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); yes.click(); } });
      box.addEventListener('cancel', function (e) { e.preventDefault(); done(false); });
    });
  }

  function fillAccount() {
    var u = user() || {};
    var email = u.email || '';
    var name = (u.name || '').trim() || email.split('@')[0];
    var initials = name.split(/\s+/).slice(0, 2).map(function (w) { return w.charAt(0); }).join('') || '?';
    $$('[data-avatar]').forEach(function (n) { n.textContent = initials; });
    $$('[data-account-name]').forEach(function (n) { n.textContent = name; });
    $$('[data-account-email]').forEach(function (n) { n.textContent = email; });
  }

  fillAccount();
  $$('[data-account]').forEach(function (wrap) {
    bindMenu(wrap.querySelector('[data-account-btn]'), wrap.querySelector('[data-account-menu]'));
  });
  $$('[data-logout]').forEach(function (b) {
    b.addEventListener('click', function () {
      try { window.localStorage.removeItem('vm_user'); } catch (e) { /* storage blocked */ }
      var root = shell ? shell.getAttribute('data-root') : '../';
      window.location.href = root;
    });
  });

  window.VelmioUI = { ic: ic, bindMenu: bindMenu, ask: ask, fillAccount: fillAccount, user: user };
})();
