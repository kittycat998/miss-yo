/*
 * vendor-fallback.js
 * Prevents boot-time crashes when the localforage CDN is blocked.
 * Provides a tiny Promise-based IndexedDB-backed subset used by this app.
 * If IndexedDB is unavailable, it falls back to localStorage as a last resort.
 */
(function () {
    'use strict';

    if (typeof window === 'undefined') return;

    var DB_NAME = 'localforage';
    var LEGACY_DB_NAME = 'CHAT_APP_LOCALFORAGE_FALLBACK';
    var STORE_NAME = 'keyvaluepairs';
    var legacyMigrationStarted = false;

    function migrateLocalStorageFallback() {
        try {
            if (!window.localforage || !window.localforage.getItem || !window.localforage.setItem) return;
            var keys = [];
            for (var i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
            keys.forEach(function (key) {
                if (!key) return;
                var raw = localStorage.getItem(key);
                if (!raw || raw.indexOf('__localforageFallback') === -1) return;
                var parsed;
                try { parsed = JSON.parse(raw); } catch (_) { return; }
                if (!parsed || parsed.__localforageFallback !== true || !Object.prototype.hasOwnProperty.call(parsed, 'value')) return;
                window.localforage.getItem(key).then(function (existing) {
                    if (existing === null || existing === undefined) return window.localforage.setItem(key, parsed.value);
                }).catch(function () {});
            });
        } catch (e) {}
    }

    function migrateLegacyIndexedDbFallback() {
        try {
            if (legacyMigrationStarted) return;
            if (!window.indexedDB || !window.localforage || !window.localforage.getItem || !window.localforage.setItem) return;
            legacyMigrationStarted = true;

            var shouldOpenLegacy = Promise.resolve(true);
            if (typeof window.indexedDB.databases === 'function') {
                shouldOpenLegacy = window.indexedDB.databases().then(function (dbs) {
                    return (dbs || []).some(function (db) { return db && db.name === LEGACY_DB_NAME; });
                }).catch(function () { return true; });
            }

            shouldOpenLegacy.then(function (exists) {
                if (!exists) return [];
                return new Promise(function (resolve) {
                    var created = false;
                    var req;
                    try { req = window.indexedDB.open(LEGACY_DB_NAME, 1); }
                    catch (err) { resolve([]); return; }
                    req.onupgradeneeded = function () {
                        created = true;
                        try {
                            var db = req.result;
                            if (db && !db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
                        } catch (e) {}
                    };
                    req.onerror = function () { resolve([]); };
                    req.onblocked = function () { resolve([]); };
                    req.onsuccess = function () {
                        var db = req.result;
                        if (created || !db || !db.objectStoreNames.contains(STORE_NAME)) {
                            try { if (db) db.close(); } catch (_) {}
                            resolve([]);
                            return;
                        }
                        var out = [];
                        try {
                            var tx = db.transaction(STORE_NAME, 'readonly');
                            var store = tx.objectStore(STORE_NAME);
                            var cursorReq = store.openCursor();
                            cursorReq.onsuccess = function () {
                                var cursor = cursorReq.result;
                                if (!cursor) return;
                                out.push({ key: String(cursor.key), value: cursor.value });
                                cursor.continue();
                            };
                            cursorReq.onerror = function () {};
                            tx.oncomplete = function () { try { db.close(); } catch (_) {} resolve(out); };
                            tx.onerror = function () { try { db.close(); } catch (_) {} resolve(out); };
                            tx.onabort = function () { try { db.close(); } catch (_) {} resolve(out); };
                        } catch (err) {
                            try { db.close(); } catch (_) {}
                            resolve([]);
                        }
                    };
                });
            }).then(function (entries) {
                if (!entries || !entries.length) return;
                entries.forEach(function (entry) {
                    window.localforage.getItem(entry.key).then(function (existing) {
                        if (existing === null || existing === undefined) return window.localforage.setItem(entry.key, entry.value);
                    }).catch(function () {});
                });
                console.warn('[vendor-fallback] 已尝试迁移旧 IndexedDB 兜底仓库数据:', entries.length);
            }).catch(function () {});
        } catch (e) {}
    }

    if (window.localforage) {
        setTimeout(function () {
            migrateLocalStorageFallback();
            migrateLegacyIndexedDbFallback();
        }, 1200);
        return;
    }

    var dbPromise = null;

    function hasIDB() {
        return !!(window.indexedDB && typeof window.indexedDB.open === 'function');
    }

    function openDB() {
        if (!hasIDB()) return Promise.reject(new Error('IndexedDB unavailable'));
        if (dbPromise) return dbPromise;
        dbPromise = new Promise(function (resolve, reject) {
            var req = window.indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = function () {
                var db = req.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
            };
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { reject(req.error || new Error('IndexedDB open failed')); };
            req.onblocked = function () { reject(new Error('IndexedDB open blocked')); };
        }).catch(function (err) {
            dbPromise = null;
            throw err;
        });
        return dbPromise;
    }

    function idbRequest(mode, action) {
        return openDB().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx;
                try {
                    tx = db.transaction(STORE_NAME, mode);
                } catch (err) {
                    reject(err);
                    return;
                }
                var store = tx.objectStore(STORE_NAME);
                var settled = false;
                var result;
                function done(value) {
                    settled = true;
                    result = value;
                }
                tx.oncomplete = function () { resolve(result); };
                tx.onerror = function () { reject(tx.error || new Error('IndexedDB transaction failed')); };
                tx.onabort = function () { reject(tx.error || new Error('IndexedDB transaction aborted')); };
                try {
                    action(store, done, reject);
                    if (!settled && mode === 'readonly') result = undefined;
                } catch (err) {
                    reject(err);
                }
            });
        });
    }

    function lsSerialize(value) {
        return JSON.stringify({ __localforageFallback: true, value: value });
    }

    function lsDeserialize(raw) {
        if (raw == null) return null;
        try {
            var parsed = JSON.parse(raw);
            if (parsed && parsed.__localforageFallback) return parsed.value;
            return parsed;
        } catch (err) {
            return raw;
        }
    }

    function lsGet(key) {
        return Promise.resolve().then(function () { return lsDeserialize(localStorage.getItem(String(key))); });
    }

    function lsSet(key, value) {
        return Promise.resolve().then(function () {
            localStorage.setItem(String(key), lsSerialize(value));
            return value;
        });
    }

    function lsRemove(key) {
        return Promise.resolve().then(function () {
            localStorage.removeItem(String(key));
            return undefined;
        });
    }

    function lsKeys() {
        return Promise.resolve().then(function () {
            var out = [];
            for (var i = 0; i < localStorage.length; i++) out.push(localStorage.key(i));
            return out;
        });
    }

    window.localforage = {
        INDEXEDDB: 'asyncStorage',
        WEBSQL: 'webSQLStorage',
        LOCALSTORAGE: 'localStorageWrapper',
        _driver: hasIDB() ? 'indexedDBFallback' : 'localStorageFallback',
        getItem: function (key) {
            key = String(key);
            return idbRequest('readonly', function (store, done, reject) {
                var req = store.get(key);
                req.onsuccess = function () {
                    var val = req.result;
                    if (val === undefined) {
                        lsGet(key).then(done).catch(function () { done(null); });
                    } else {
                        done(val);
                    }
                };
                req.onerror = function () { reject(req.error); };
            }).catch(function () { return lsGet(key); });
        },
        setItem: function (key, value) {
            key = String(key);
            return idbRequest('readwrite', function (store, done, reject) {
                var req = store.put(value, key);
                req.onsuccess = function () { done(value); };
                req.onerror = function () { reject(req.error); };
            }).then(function () { return value; }).catch(function () { return lsSet(key, value); });
        },
        removeItem: function (key) {
            key = String(key);
            return idbRequest('readwrite', function (store, done, reject) {
                var req = store.delete(key);
                req.onsuccess = function () { done(undefined); };
                req.onerror = function () { reject(req.error); };
            }).catch(function () { return lsRemove(key); });
        },
        clear: function () {
            return idbRequest('readwrite', function (store, done, reject) {
                var req = store.clear();
                req.onsuccess = function () { done(undefined); };
                req.onerror = function () { reject(req.error); };
            }).catch(function () {
                localStorage.clear();
                return undefined;
            });
        },
        keys: function () {
            return idbRequest('readonly', function (store, done, reject) {
                if (store.getAllKeys) {
                    var req = store.getAllKeys();
                    req.onsuccess = function () { done((req.result || []).map(String)); };
                    req.onerror = function () { reject(req.error); };
                    return;
                }
                var out = [];
                var cursorReq = store.openCursor();
                cursorReq.onsuccess = function () {
                    var cursor = cursorReq.result;
                    if (cursor) { out.push(String(cursor.key)); cursor.continue(); }
                    else done(out);
                };
                cursorReq.onerror = function () { reject(cursorReq.error); };
            }).catch(function () { return lsKeys(); });
        },
        length: function () {
            return this.keys().then(function (keys) { return keys.length; });
        },
        iterate: function (iterator) {
            return idbRequest('readonly', function (store, done, reject) {
                var i = 0;
                var cursorReq = store.openCursor();
                cursorReq.onsuccess = function () {
                    var cursor = cursorReq.result;
                    if (!cursor) { done(undefined); return; }
                    i += 1;
                    var result = iterator(cursor.value, String(cursor.key), i);
                    if (result !== undefined) done(result);
                    else cursor.continue();
                };
                cursorReq.onerror = function () { reject(cursorReq.error); };
            }).catch(function () {
                return lsKeys().then(function (keys) {
                    for (var i = 0; i < keys.length; i++) {
                        var key = keys[i];
                        var result = iterator(lsDeserialize(localStorage.getItem(key)), key, i + 1);
                        if (result !== undefined) return result;
                    }
                    return undefined;
                });
            });
        },
        config: function () { return this; },
        createInstance: function () { return this; },
        ready: function () { return openDB().catch(function () { return undefined; }); }
    };

    setTimeout(function () {
        migrateLocalStorageFallback();
        migrateLegacyIndexedDbFallback();
    }, 0);
    console.warn('[vendor-fallback] localforage CDN 未加载，已启用 IndexedDB 兜底。');
})();
