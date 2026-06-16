/*
 * vendor-fallback.js
 * Minimal localforage fallback only. No automatic migration, no session repair, no overwriting lastSessionId.
 */
(function () {
    'use strict';
    if (typeof window === 'undefined') return;

    // One small layer helper used by custom sheets/popups. Keep ranges sane:
    // modals live around 60000, transient sheets around 90000. No 1e8 z-index.
    window.__nextOverlayZ = window.__nextOverlayZ || function (step) {
        var base = 90000;
        var cur = Number(window.__uiTopZ || base);
        if (!Number.isFinite(cur) || cur < base || cur > 98000) cur = base;
        window.__uiTopZ = cur + (step || 10);
        return window.__uiTopZ;
    };

    if (window.localforage) return;

    var DB_NAME = 'localforage';
    var STORE_NAME = 'keyvaluepairs';
    var dbPromise = null;

    function hasIDB() { return !!(window.indexedDB && typeof window.indexedDB.open === 'function'); }
    function wrap(value) { return JSON.stringify({ __localforageFallback: true, value: value }); }
    function unwrap(raw) {
        if (raw == null) return null;
        try {
            var p = JSON.parse(raw);
            if (p && p.__localforageFallback === true) return p.value;
            return p;
        } catch (e) { return raw; }
    }
    function openDB() {
        if (!hasIDB()) return Promise.reject(new Error('IndexedDB unavailable'));
        if (dbPromise) return dbPromise;
        dbPromise = new Promise(function (resolve, reject) {
            var req = window.indexedDB.open(DB_NAME);
            req.onupgradeneeded = function () {
                var db = req.result;
                if (db && !db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
            };
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { reject(req.error || new Error('IndexedDB open failed')); };
            req.onblocked = function () { reject(new Error('IndexedDB open blocked')); };
        }).catch(function (err) { dbPromise = null; throw err; });
        return dbPromise;
    }
    function idb(mode, action) {
        return openDB().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx;
                try { tx = db.transaction(STORE_NAME, mode); }
                catch (e) { reject(e); return; }
                var store = tx.objectStore(STORE_NAME);
                var result;
                tx.oncomplete = function () { resolve(result); };
                tx.onerror = function () { reject(tx.error || new Error('IndexedDB transaction failed')); };
                tx.onabort = function () { reject(tx.error || new Error('IndexedDB transaction aborted')); };
                try { action(store, function (v) { result = v; }, reject); }
                catch (e) { reject(e); }
            });
        });
    }
    function lsGet(k) { return Promise.resolve().then(function () { return unwrap(localStorage.getItem(String(k))); }); }
    function lsSet(k, v) { return Promise.resolve().then(function () { localStorage.setItem(String(k), wrap(v)); return v; }); }
    function lsRemove(k) { return Promise.resolve().then(function () { localStorage.removeItem(String(k)); }); }
    function lsKeys() { return Promise.resolve().then(function () { var a=[]; for (var i=0;i<localStorage.length;i++) a.push(localStorage.key(i)); return a; }); }

    window.localforage = {
        INDEXEDDB: 'asyncStorage', WEBSQL: 'webSQLStorage', LOCALSTORAGE: 'localStorageWrapper',
        _driver: hasIDB() ? 'indexedDBFallback' : 'localStorageFallback',
        getItem: function (key) {
            key = String(key);
            return idb('readonly', function (store, done, reject) {
                var r = store.get(key);
                r.onsuccess = function () { r.result === undefined ? lsGet(key).then(done) : done(r.result); };
                r.onerror = function () { reject(r.error); };
            }).catch(function () { return lsGet(key); });
        },
        setItem: function (key, value) {
            key = String(key);
            return idb('readwrite', function (store, done, reject) {
                var r = store.put(value, key);
                r.onsuccess = function () { done(value); };
                r.onerror = function () { reject(r.error); };
            }).then(function () { return value; }).catch(function () { return lsSet(key, value); });
        },
        removeItem: function (key) {
            key = String(key);
            return idb('readwrite', function (store, done, reject) {
                var r = store.delete(key);
                r.onsuccess = function () { done(); };
                r.onerror = function () { reject(r.error); };
            }).catch(function () { return lsRemove(key); });
        },
        clear: function () {
            return idb('readwrite', function (store, done, reject) {
                var r = store.clear();
                r.onsuccess = function () { done(); };
                r.onerror = function () { reject(r.error); };
            }).catch(function () { localStorage.clear(); });
        },
        keys: function () {
            return idb('readonly', function (store, done, reject) {
                if (store.getAllKeys) {
                    var r = store.getAllKeys();
                    r.onsuccess = function () { done((r.result || []).map(String)); };
                    r.onerror = function () { reject(r.error); };
                    return;
                }
                var out = [];
                var c = store.openCursor();
                c.onsuccess = function () { var cur = c.result; if (cur) { out.push(String(cur.key)); cur.continue(); } else done(out); };
                c.onerror = function () { reject(c.error); };
            }).catch(function () { return lsKeys(); });
        },
        length: function () { return this.keys().then(function (k) { return k.length; }); },
        iterate: function (fn) {
            return this.keys().then(function (keys) {
                var chain = Promise.resolve();
                var stop;
                keys.forEach(function (key, idx) {
                    chain = chain.then(function () {
                        if (stop !== undefined) return;
                        return window.localforage.getItem(key).then(function (val) {
                            var r = fn(val, key, idx + 1);
                            if (r !== undefined) stop = r;
                        });
                    });
                });
                return chain.then(function () { return stop; });
            });
        },
        config: function () { return this; }, createInstance: function () { return this; }, ready: function () { return openDB().catch(function () {}); }
    };
    console.warn('[vendor-fallback] localforage CDN 未加载，已启用本地 IndexedDB 兜底。');
})();
