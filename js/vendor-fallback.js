/*
 * vendor-fallback.js
 * Minimal localforage fallback only. Uses the same IndexedDB database/store as the real localforage config,
 * and migrates the older fallback DB so CDN/no-CDN launches do not split data into two worlds.
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

    var PRIMARY_DB_NAME = 'ChatApp_V3';
    var PRIMARY_STORE_NAME = 'chat_data';
    var LEGACY_DB_NAME = 'localforage';
    var LEGACY_STORE_NAME = 'keyvaluepairs';

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

    function openNamedDB(dbName, storeName) {
        if (!hasIDB()) return Promise.reject(new Error('IndexedDB unavailable'));
        return new Promise(function (resolve, reject) {
            var req = window.indexedDB.open(dbName);
            req.onupgradeneeded = function () {
                var db = req.result;
                if (db && !db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName);
            };
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { reject(req.error || new Error('IndexedDB open failed: ' + dbName)); };
            req.onblocked = function () { reject(new Error('IndexedDB open blocked: ' + dbName)); };
        });
    }

    function idbNamed(dbName, storeName, mode, action) {
        return openNamedDB(dbName, storeName).then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx;
                try { tx = db.transaction(storeName, mode); }
                catch (e) { try { db.close(); } catch (_) {} reject(e); return; }
                var store = tx.objectStore(storeName);
                var result;
                tx.oncomplete = function () { try { db.close(); } catch (_) {} resolve(result); };
                tx.onerror = function () { try { db.close(); } catch (_) {} reject(tx.error || new Error('IndexedDB transaction failed')); };
                tx.onabort = function () { try { db.close(); } catch (_) {} reject(tx.error || new Error('IndexedDB transaction aborted')); };
                try { action(store, function (v) { result = v; }, reject); }
                catch (e) { reject(e); }
            });
        });
    }

    function idbGet(dbName, storeName, key) {
        return idbNamed(dbName, storeName, 'readonly', function (store, done, reject) {
            var r = store.get(key);
            r.onsuccess = function () { done(r.result === undefined ? undefined : r.result); };
            r.onerror = function () { reject(r.error); };
        });
    }

    function idbSet(dbName, storeName, key, value) {
        return idbNamed(dbName, storeName, 'readwrite', function (store, done, reject) {
            var r = store.put(value, key);
            r.onsuccess = function () { done(value); };
            r.onerror = function () { reject(r.error); };
        }).then(function () { return value; });
    }

    function idbRemove(dbName, storeName, key) {
        return idbNamed(dbName, storeName, 'readwrite', function (store, done, reject) {
            var r = store.delete(key);
            r.onsuccess = function () { done(); };
            r.onerror = function () { reject(r.error); };
        });
    }

    function idbClear(dbName, storeName) {
        return idbNamed(dbName, storeName, 'readwrite', function (store, done, reject) {
            var r = store.clear();
            r.onsuccess = function () { done(); };
            r.onerror = function () { reject(r.error); };
        });
    }

    function idbKeys(dbName, storeName) {
        return idbNamed(dbName, storeName, 'readonly', function (store, done, reject) {
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
        });
    }

    function lsGet(k) { return Promise.resolve().then(function () { return unwrap(localStorage.getItem(String(k))); }); }
    function lsSet(k, v) { return Promise.resolve().then(function () { localStorage.setItem(String(k), wrap(v)); return v; }); }
    function lsRemove(k) { return Promise.resolve().then(function () { localStorage.removeItem(String(k)); }); }
    function lsKeys() { return Promise.resolve().then(function () { var a=[]; for (var i=0;i<localStorage.length;i++) a.push(localStorage.key(i)); return a; }); }

    function installLegacyBridgeForRealLocalForage() {
        var lf = window.localforage;
        if (!lf || lf.__chatAppLegacyFallbackBridge) return;
        lf.__chatAppLegacyFallbackBridge = true;
        var originalGetItem = lf.getItem.bind(lf);
        var originalSetItem = lf.setItem.bind(lf);
        var originalRemoveItem = lf.removeItem ? lf.removeItem.bind(lf) : null;
        var originalClear = lf.clear ? lf.clear.bind(lf) : null;
        var originalKeys = lf.keys ? lf.keys.bind(lf) : null;

        lf.getItem = function (key) {
            key = String(key);
            return Promise.resolve(originalGetItem(key)).then(function (value) {
                if (value !== null && value !== undefined) return value;
                return idbGet(LEGACY_DB_NAME, LEGACY_STORE_NAME, key).then(function (legacyValue) {
                    if (legacyValue === undefined) return value;
                    originalSetItem(key, legacyValue).catch(function () {});
                    return legacyValue;
                }).catch(function () { return value; });
            });
        };

        if (originalKeys) {
            lf.keys = function () {
                return Promise.resolve(originalKeys()).then(function (primaryKeys) {
                    return idbKeys(LEGACY_DB_NAME, LEGACY_STORE_NAME).then(function (legacyKeys) {
                        var seen = Object.create(null);
                        return (primaryKeys || []).concat(legacyKeys || []).filter(function (k) {
                            if (seen[k]) return false;
                            seen[k] = true;
                            return true;
                        });
                    }).catch(function () { return primaryKeys || []; });
                });
            };
        }

        if (originalRemoveItem) {
            lf.removeItem = function (key) {
                key = String(key);
                return Promise.resolve(originalRemoveItem(key)).then(function (ret) {
                    return idbRemove(LEGACY_DB_NAME, LEGACY_STORE_NAME, key).catch(function () {}).then(function () { return ret; });
                });
            };
        }

        if (originalClear) {
            lf.clear = function () {
                return Promise.resolve(originalClear()).then(function (ret) {
                    return idbClear(LEGACY_DB_NAME, LEGACY_STORE_NAME).catch(function () {}).then(function () { return ret; });
                });
            };
        }
    }

    function migrateLegacyFallbackToConfiguredLocalforage() {
        if (!hasIDB() || !window.localforage || window.__legacyFallbackMigrationStarted) return;
        window.__legacyFallbackMigrationStarted = true;
        var run = function () {
            var lf = window.localforage;
            Promise.resolve(lf.ready ? lf.ready() : null).then(function () {
                return idbKeys(LEGACY_DB_NAME, LEGACY_STORE_NAME);
            }).then(function (keys) {
                if (!keys || !keys.length) return;
                var chain = Promise.resolve();
                keys.forEach(function (key) {
                    chain = chain.then(function () {
                        return idbGet(LEGACY_DB_NAME, LEGACY_STORE_NAME, key).then(function (legacyValue) {
                            if (legacyValue === undefined) return;
                            return Promise.resolve(lf.getItem(key)).then(function (currentValue) {
                                if (currentValue === null || currentValue === undefined) {
                                    return lf.setItem(key, legacyValue);
                                }
                            });
                        });
                    });
                });
                return chain.then(function () {
                    try { console.warn('[vendor-fallback] 已检查旧 fallback IndexedDB，缺失数据已迁移到 ChatApp_V3/chat_data。'); } catch (_) {}
                });
            }).catch(function (e) {
                try { console.warn('[vendor-fallback] 旧 fallback 数据迁移跳过:', e); } catch (_) {}
            });
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run, { once: true });
        else setTimeout(run, 0);
    }

    // CDN 正常加载时，仍然做一次旧 fallback DB -> 官方 localforage DB 的迁移。
    if (window.localforage) {
        installLegacyBridgeForRealLocalForage();
        migrateLegacyFallbackToConfiguredLocalforage();
        return;
    }

    var dbPromise = null;
    function openDB() {
        if (dbPromise) return dbPromise;
        dbPromise = openNamedDB(PRIMARY_DB_NAME, PRIMARY_STORE_NAME).catch(function (err) { dbPromise = null; throw err; });
        return dbPromise;
    }
    function idb(mode, action) {
        return openDB().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx;
                try { tx = db.transaction(PRIMARY_STORE_NAME, mode); }
                catch (e) { reject(e); return; }
                var store = tx.objectStore(PRIMARY_STORE_NAME);
                var result;
                tx.oncomplete = function () { resolve(result); };
                tx.onerror = function () { reject(tx.error || new Error('IndexedDB transaction failed')); };
                tx.onabort = function () { reject(tx.error || new Error('IndexedDB transaction aborted')); };
                try { action(store, function (v) { result = v; }, reject); }
                catch (e) { reject(e); }
            });
        });
    }

    function getLegacyFallbackItem(key) {
        return idbGet(LEGACY_DB_NAME, LEGACY_STORE_NAME, key).then(function (value) {
            if (value === undefined) return undefined;
            // Opportunistically copy it into the primary DB used by real localforage.
            idbSet(PRIMARY_DB_NAME, PRIMARY_STORE_NAME, key, value).catch(function () {});
            return value;
        }).catch(function () { return undefined; });
    }

    window.localforage = {
        INDEXEDDB: 'asyncStorage', WEBSQL: 'webSQLStorage', LOCALSTORAGE: 'localStorageWrapper',
        _driver: hasIDB() ? 'indexedDBFallback' : 'localStorageFallback',
        getItem: function (key) {
            key = String(key);
            return idb('readonly', function (store, done, reject) {
                var r = store.get(key);
                r.onsuccess = function () { done(r.result === undefined ? undefined : r.result); };
                r.onerror = function () { reject(r.error); };
            }).then(function (value) {
                if (value !== undefined) return value;
                return getLegacyFallbackItem(key).then(function (legacyValue) {
                    if (legacyValue !== undefined) return legacyValue;
                    return lsGet(key);
                });
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
            }).then(function () { return idbRemove(LEGACY_DB_NAME, LEGACY_STORE_NAME, key).catch(function () {}); }).catch(function () { return lsRemove(key); });
        },
        clear: function () {
            return idbClear(PRIMARY_DB_NAME, PRIMARY_STORE_NAME)
                .then(function () { return idbClear(LEGACY_DB_NAME, LEGACY_STORE_NAME).catch(function () {}); })
                .catch(function () { localStorage.clear(); });
        },
        keys: function () {
            return idbKeys(PRIMARY_DB_NAME, PRIMARY_STORE_NAME).then(function (primaryKeys) {
                return idbKeys(LEGACY_DB_NAME, LEGACY_STORE_NAME).then(function (legacyKeys) {
                    var seen = Object.create(null);
                    return (primaryKeys || []).concat(legacyKeys || []).filter(function (k) {
                        if (seen[k]) return false;
                        seen[k] = true;
                        return true;
                    });
                }).catch(function () { return primaryKeys || []; });
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
    console.warn('[vendor-fallback] localforage CDN 未加载，已启用同库 IndexedDB 兜底。');
})();
