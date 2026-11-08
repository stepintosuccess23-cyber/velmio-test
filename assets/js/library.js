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

  window.VelmioLibrary = {
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
