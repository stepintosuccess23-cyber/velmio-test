/* The on-device library behind My Videos and History. Finished videos and activity
   are kept in this browser only, separate from the studio's own project storage. */
(function () {
  'use strict';

  var DB = 'velmio-library', VIDEOS = 'videos', EVENTS = 'events';

  function owner() {
    var u = {};
    try { u = JSON.parse(window.localStorage.getItem('vm_user')) || {}; } catch (e) { /* storage blocked */ }
    return u.uid || u.email || 'local';
  }
  function open() {
    return new Promise(function (resolve, reject) {
      if (!window.indexedDB) { reject(new Error('none')); return; }
      var req = window.indexedDB.open(DB, 1);
      req.onupgradeneeded = function () {
        req.result.createObjectStore(VIDEOS, { keyPath: 'id' });
        req.result.createObjectStore(EVENTS, { keyPath: 'id', autoIncrement: true });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function run(store, mode, work) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(store, mode), result;
        var req = work(tx.objectStore(store));
        if (req) req.onsuccess = function () { result = req.result; };
        tx.oncomplete = function () { db.close(); resolve(result); };
        tx.onerror = tx.onabort = function () { db.close(); reject(tx.error); };
      });
    });
  }
  function all(store) {
    return run(store, 'readonly', function (s) { return s.getAll(); }).then(function (rows) {
      var me = owner();
      return (rows || []).filter(function (r) { return r.owner === me; });
    });
  }
  function newId() { return 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function get(id) { return run(VIDEOS, 'readonly', function (s) { return s.get(id); }); }
  function put(record) { return run(VIDEOS, 'readwrite', function (s) { s.put(record); }).then(function () { return record; }); }

  /* The studio's saved project, read from its existing storage. */
  function studioDb() {
    return new Promise(function (resolve, reject) {
      var req = window.indexedDB.open('velmio-studio', 1);
      req.onupgradeneeded = function () { req.result.createObjectStore('projects'); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }
  function studio(mode, work) {
    return studioDb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction('projects', mode), result;
        var req = work(tx.objectStore('projects'));
        if (req) req.onsuccess = function () { result = req.result; };
        tx.oncomplete = function () { db.close(); resolve(result); };
        tx.onerror = function () { db.close(); reject(tx.error); };
      });
    });
  }

  /* A sign-in lasts an hour, so it is renewed quietly before calling the backend. */
  function freshToken(user) {
    if (user.idToken && user.expires > Date.now() + 60000) return Promise.resolve(user.idToken);
    var key = ((window.SITE_CONFIG || {}).firebaseApiKey || '').trim();
    var expired = new Error('auth');
    expired.code = 'auth';
    if (!user.refreshToken || !key) return Promise.reject(expired);
    var body = new URLSearchParams();
    body.set('grant_type', 'refresh_token');
    body.set('refresh_token', user.refreshToken);
    return window.fetch('https://securetoken.googleapis.com/v1/token?key=' + encodeURIComponent(key), { method: 'POST', body: body })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (!data.id_token) throw expired;
        user.idToken = data.id_token;
        user.refreshToken = data.refresh_token || user.refreshToken;
        user.expires = Date.now() + (Number(data.expires_in) || 3600) * 1000;
        try { window.localStorage.setItem('vm_user', JSON.stringify(user)); } catch (e) { /* storage blocked */ }
        return user.idToken;
      });
  }

  function postForm(fields) {
    var endpoint = ((window.SITE_CONFIG || {}).formEndpoint || '').trim();
    if (!endpoint) return Promise.reject(new Error('unavailable'));
    var data = new URLSearchParams();
    Object.keys(fields).forEach(function (k) { data.set(k, fields[k]); });
    return window.fetch(endpoint, { method: 'POST', body: data, redirect: 'follow' }).then(function (res) { return res.json(); }).then(function (result) {
      if (!result || result.ok !== true) throw new Error((result && result.error) || 'server');
      return result;
    });
  }

  function planRequest(fields) {
    var user = {};
    try { user = JSON.parse(window.localStorage.getItem('vm_user')) || {}; } catch (e) { /* storage blocked */ }
    var who = user.guest ? Promise.resolve({ order_id: user.orderId, token: user.orderToken })
      : freshToken(user).then(function (t) { return { firebase_token: t }; });
    return who.then(function (id) {
      Object.keys(fields).forEach(function (k) { id[k] = fields[k]; });
      return postForm(id);
    });
  }

  var PENDING = 'vm_pending_order';

  window.VelmioLibrary = {
    token: freshToken,
    plan: function () { return planRequest({ form: 'plan_status' }); },
    buyPlan: function (plan) {
      return planRequest({ form: 'plan_buy', plan: plan, elapsed_ms: '9000', return_base: window.location.origin + window.location.pathname }).then(function (result) {
        if (result.url) window.localStorage.setItem(PENDING, JSON.stringify({ id: result.order_id, token: result.token }));
        return result;
      });
    },
    capture: function (paypalOrder) {
      var pending = JSON.parse(window.localStorage.getItem(PENDING) || 'null');
      if (!pending) return Promise.reject(new Error('order'));
      return postForm({ form: 'order_capture', order_id: pending.id, token: pending.token, paypal_order: paypalOrder }).then(function (result) {
        window.localStorage.removeItem(PENDING);
        return result;
      });
    },
    videos: function () { return all(VIDEOS); },
    get: get,
    addVideo: function (record) {
      record.id = newId();
      record.owner = owner();
      return put(record);
    },
    update: function (id, patch) {
      return get(id).then(function (row) {
        if (!row) return null;
        Object.keys(patch).forEach(function (k) { row[k] = patch[k]; });
        return put(row);
      });
    },
    remove: function (id) { return run(VIDEOS, 'readwrite', function (s) { s.delete(id); }); },
    duplicate: function (id, title) {
      return get(id).then(function (row) {
        if (!row) return null;
        row.id = newId();
        row.title = title;
        row.createdAt = Date.now();
        return put(row);
      });
    },
    /* Asks the Google script for finished orders. Returns true when something changed. */
    syncOrders: function () {
      var endpoint = ((window.SITE_CONFIG || {}).formEndpoint || '').trim();
      if (!endpoint) return Promise.resolve(false);
      var user = {};
      try { user = JSON.parse(window.localStorage.getItem('vm_user')) || {}; } catch (e) { /* storage blocked */ }
      return all(VIDEOS).then(function (rows) {
        var waiting = rows.filter(function (v) { return v.status === 'processing' && v.orderId; });
        waiting.forEach(function (v) { if (!v.orderToken && v.orderId === user.orderId) v.orderToken = user.orderToken; });
        var ask = waiting.filter(function (v) { return v.orderToken; }).slice(0, 30);
        if (!ask.length) return false;
        var data = new URLSearchParams();
        data.set('form', 'order_status');
        data.set('orders', JSON.stringify(ask.map(function (v) { return { id: v.orderId, token: v.orderToken }; })));
        return window.fetch(endpoint, { method: 'POST', body: data, redirect: 'follow' })
          .then(function (res) { return res.json(); })
          .then(function (result) {
            var done = ((result && result.orders) || []).filter(function (o) { return o.status === 'completed'; });
            return Promise.all(done.map(function (o) {
              var row = ask.filter(function (v) { return v.orderId === o.id; })[0];
              row.status = 'completed';
              row.videoLink = /^https:\/\//.test(o.link || '') ? o.link : '';
              return put(row);
            })).then(function () { return done.length > 0; });
          });
      }).catch(function () { return false; });
    },
    log: function (type, project) {
      return run(EVENTS, 'readwrite', function (s) { s.add({ owner: owner(), type: type, project: project || '', at: Date.now() }); })
        .catch(function () { /* history is a convenience, never a reason to interrupt work */ });
    },
    events: function () { return all(EVENTS); },
    project: function () { return studio('readonly', function (s) { return s.get(owner()); }); },
    saveProject: function (value) { return studio('readwrite', function (s) { s.put(value, owner()); }); },
    deleteProject: function () { return studio('readwrite', function (s) { s.delete(owner()); }); }
  };
})();
