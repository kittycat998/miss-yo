/*
 * vendor-fallback.js
 * Prevents boot-time crashes when the localforage CDN is blocked.
 * Provides a tiny Promise-based IndexedDB-backed subset used by this app.
 * Also repairs/migrates data from earlier fallback stores BEFORE app boot reads sessions.
 */
(function () {
    'use strict';

    if (typeof window === 'undefined') return;

    var CURRENT_DB_NAME = 'localforage';
    var LEGACY_DB_NAME = 'CHAT_APP_LOCALFORAGE_FALLBACK';
    var STORE_NAME = 'keyvaluepairs';
    var repairPromise = null;
    var fallbackDbPromise = null;

    function hasIDB() {
        return !!(window.indexedDB && typeof window.indexedDB.open === 'function');
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

    function normalizeEntries(entries) {
        var out = {};
        (entries || []).forEach(function (entry) {
            if (!entry || entry.key === null || entry.key === undefined) return;
            out[String(entry.key)] = entry.value;
        });
        return out;
    }

    function openReadOnlyDb(dbName) {
        return new Promise(function (resolve) {
            if (!hasIDB()) { resolve(null); return; }
            var created = false;
            var req;
            try { req = window.indexedDB.open(dbName); }
            catch (err) { resolve(null); return; }
            req.onupgradeneeded = function () {
                created = true;
                try {
                    var db = req.result;
                    if (db && !db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
                } catch (e) {}
            };
            req.onerror = function () { resolve(null); };
            req.onblocked = function () { resolve(null); };
            req.onsuccess = function () {
                var db = req.result;
                if (created || !db || !db.objectStoreNames.contains(STORE_NAME)) {
                    try { if (db) db.close(); } catch (_) {}
                    resolve(null);
                    return;
                }
                resolve(db);
            };
        });
    }

    function readDbEntries(dbName) {
        return openReadOnlyDb(dbName).then(function (db) {
            if (!db) return [];
            return new Promise(function (resolve) {
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
            });
        }).catch(function () { return []; });
    }

    function readLocalStorageFallbackEntries() {
        var out = [];
        try {
            for (var i = 0; i < localStorage.length; i++) {
                var key = localStorage.key(i);
                if (!key) continue;
                var raw = localStorage.getItem(key);
                if (!raw || raw.indexOf('__localforageFallback') === -1) continue;
                var parsed;
                try { parsed = JSON.parse(raw); } catch (_) { continue; }
                if (!parsed || parsed.__localforageFallback !== true || !Object.prototype.hasOwnProperty.call(parsed, 'value')) continue;
                out.push({ key: String(key), value: parsed.value });
            }
        } catch (e) {}
        return Promise.resolve(out);
    }

    function currentKeys() {
        try {
            if (window.localforage && typeof window.localforage.keys === 'function') {
                return window.localforage.keys().catch(function () { return []; });
            }
        } catch (e) {}
        return Promise.resolve([]);
    }

    function currentGet(key) {
        try {
            if (window.localforage && typeof window.localforage.getItem === 'function') {
                return window.localforage.getItem(key).catch(function () { return null; });
            }
        } catch (e) {}
        return Promise.resolve(null);
    }

    function currentSet(key, value) {
        try {
            if (window.localforage && typeof window.localforage.setItem === 'function') {
                return window.localforage.setItem(key, value).then(function () { return true; }).catch(function () { return false; });
            }
        } catch (e) {}
        return Promise.resolve(false);
    }

    function isEmptyValue(value) {
        if (value === null || value === undefined) return true;
        if (typeof value === 'string') return value.trim() === '';
        if (Array.isArray(value)) return value.length === 0;
        if (typeof value === 'object') return Object.keys(value).length === 0;
        return false;
    }

    function valueScore(value) {
        if (value === null || value === undefined) return 0;
        if (Array.isArray(value)) return value.length * 20;
        if (typeof value === 'string') {
            if (!value) return 0;
            if (/^data:image\//i.test(value)) return 5000 + Math.min(value.length / 1000, 5000);
            if (/^https?:\/\//i.test(value)) return 100;
            return Math.min(value.length, 2000);
        }
        if (typeof value === 'object') {
            var s = Object.keys(value).length * 5;
            if (value.myAvatar || value.partnerAvatar) s += 2000;
            if (value.customBubbleCss || value.customGlobalCss || value.customFontUrl) s += 1500;
            if (value.bubbleStyle && value.bubbleStyle !== 'standard') s += 500;
            if (value.myAvatarFrame || value.partnerAvatarFrame) s += 500;
            if (value.name || value.avatar || value.signature) s += 300;
            return s;
        }
        return 1;
    }

    function isSessionListKey(key) {
        return /CHAT_APP_V\d+_sessionList$/.test(key) || /sessionList$/.test(key);
    }

    function isLastSessionKey(key) {
        return /CHAT_APP_V\d+_lastSessionId$/.test(key) || /lastSessionId$/.test(key);
    }

    function sessionListScore(list, entryMap) {
        if (!Array.isArray(list) || !list.length) return 0;
        var score = list.length * 100;
        list.forEach(function (s) {
            var id = s && s.id ? String(s.id) : '';
            if (!id) return;
            Object.keys(entryMap || {}).forEach(function (k) {
                if (k.indexOf('_' + id + '_') === -1) return;
                score += 5 + valueScore(entryMap[k]);
            });
        });
        return score;
    }

    function looksMediaOrProfileKey(key) {
        return /avatar|profile_|chatSettings|chatBackground|background|bg_|home_page_bg|home_card_bg|moments_partner_avatar|bubble|customThemes|themeSchemes|moyuActivities|moyuLocations|customReplies|stickerLibrary|kaomoji|customPokes|customStatuses|myPokes|customVoices/i.test(key || '');
    }

    function shouldUseLegacy(key, legacyVal, currentVal, legacyMap, currentMap) {
        if (legacyVal === null || legacyVal === undefined) return false;
        if (currentVal === null || currentVal === undefined) return true;
        if (isSessionListKey(key)) {
            return sessionListScore(legacyVal, legacyMap) > sessionListScore(currentVal, currentMap);
        }
        if (isLastSessionKey(key)) {
            return true;
        }
        if (isEmptyValue(currentVal) && !isEmptyValue(legacyVal)) return true;
        if (looksMediaOrProfileKey(key) && valueScore(legacyVal) > valueScore(currentVal) + 50) return true;
        return false;
    }

    function mergeSettingsIfSafer(key, legacyVal, currentVal) {
        if (!/chatSettings$/.test(key)) return null;
        if (!legacyVal || typeof legacyVal !== 'object' || Array.isArray(legacyVal)) return null;
        if (!currentVal || typeof currentVal !== 'object' || Array.isArray(currentVal)) return legacyVal;
        var merged = Object.assign({}, currentVal);
        var changed = false;
        Object.keys(legacyVal).forEach(function (k) {
            var lv = legacyVal[k];
            var cv = merged[k];
            if (!isEmptyValue(lv) && (isEmptyValue(cv) || valueScore(lv) > valueScore(cv) + 50 || /Avatar|avatar|Bubble|bubble|Frame|frame|Theme|theme|Css|css|Font|font|Color|color/.test(k))) {
                merged[k] = lv;
                changed = true;
            }
        });
        return changed ? merged : null;
    }

    function collectCurrentMap(keys) {
        keys = keys || [];
        return Promise.all(keys.map(function (key) {
            return currentGet(key).then(function (value) { return { key: key, value: value }; });
        })).then(normalizeEntries).catch(function () { return {}; });
    }

    function runStorageRepairNow() {
        if (repairPromise) return repairPromise;
        repairPromise = Promise.all([
            readDbEntries(LEGACY_DB_NAME),
            readLocalStorageFallbackEntries(),
            currentKeys()
        ]).then(function (parts) {
            var legacyMap = normalizeEntries([].concat(parts[0] || [], parts[1] || []));
            var keys = parts[2] || [];
            return collectCurrentMap(keys).then(function (currentMap) {
                var legacyKeys = Object.keys(legacyMap);
                if (!legacyKeys.length) return { migrated: 0, legacy: 0 };
                var migrated = 0;
                var tasks = legacyKeys.map(function (key) {
                    var legacyVal = legacyMap[key];
                    var currentVal = Object.prototype.hasOwnProperty.call(currentMap, key) ? currentMap[key] : null;
                    var mergedSettings = mergeSettingsIfSafer(key, legacyVal, currentVal);
                    if (mergedSettings) {
                        migrated += 1;
                        currentMap[key] = mergedSettings;
                        return currentSet(key, mergedSettings);
                    }
                    if (shouldUseLegacy(key, legacyVal, currentVal, legacyMap, currentMap)) {
                        migrated += 1;
                        currentMap[key] = legacyVal;
                        return currentSet(key, legacyVal);
                    }
                    return Promise.resolve(false);
                });
                return Promise.all(tasks).then(function () {
                    if (migrated) console.warn('[vendor-fallback] 启动前已修复/迁移旧仓库数据:', migrated);
                    return { migrated: migrated, legacy: legacyKeys.length };
                });
            });
        }).catch(function (err) {
            console.warn('[vendor-fallback] 启动前旧仓库迁移失败:', err);
            return { migrated: 0, legacy: 0, error: true };
        });
        return repairPromise;
    }

    window.__runStorageRepairNow = runStorageRepairNow;

    function openFallbackDB() {
        if (!hasIDB()) return Promise.reject(new Error('IndexedDB unavailable'));
        if (fallbackDbPromise) return fallbackDbPromise;
        fallbackDbPromise = new Promise(function (resolve, reject) {
            var req = window.indexedDB.open(CURRENT_DB_NAME);
            req.onupgradeneeded = function () {
                var db = req.result;
                if (db && !db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
            };
            req.onsuccess = function () { resolve(req.result); };
            req.onerror = function () { reject(req.error || new Error('IndexedDB open failed')); };
            req.onblocked = function () { reject(new Error('IndexedDB open blocked')); };
        }).catch(function (err) {
            fallbackDbPromise = null;
            throw err;
        });
        return fallbackDbPromise;
    }

    function idbRequest(mode, action) {
        return openFallbackDB().then(function (db) {
            return new Promise(function (resolve, reject) {
                var tx;
                try { tx = db.transaction(STORE_NAME, mode); }
                catch (err) { reject(err); return; }
                var store = tx.objectStore(STORE_NAME);
                var settled = false;
                var result;
                function done(value) { settled = true; result = value; }
                tx.oncomplete = function () { resolve(result); };
                tx.onerror = function () { reject(tx.error || new Error('IndexedDB transaction failed')); };
                tx.onabort = function () { reject(tx.error || new Error('IndexedDB transaction aborted')); };
                try {
                    action(store, done, reject);
                    if (!settled && mode === 'readonly') result = undefined;
                } catch (err) { reject(err); }
            });
        });
    }

    function lsGet(key) {
        return Promise.resolve().then(function () { return lsDeserialize(localStorage.getItem(String(key))); });
    }
    function lsSet(key, value) {
        return Promise.resolve().then(function () { localStorage.setItem(String(key), lsSerialize(value)); return value; });
    }
    function lsRemove(key) {
        return Promise.resolve().then(function () { localStorage.removeItem(String(key)); return undefined; });
    }
    function lsKeys() {
        return Promise.resolve().then(function () {
            var out = [];
            for (var i = 0; i < localStorage.length; i++) out.push(localStorage.key(i));
            return out;
        });
    }

    if (!window.localforage) {
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
                        if (val === undefined) lsGet(key).then(done).catch(function () { done(null); });
                        else done(val);
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
                }).catch(function () { localStorage.clear(); return undefined; });
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
            length: function () { return this.keys().then(function (keys) { return keys.length; }); },
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
            ready: function () { return openFallbackDB().catch(function () { return undefined; }); }
        };
        console.warn('[vendor-fallback] localforage CDN 未加载，已启用 IndexedDB 兜底。');
    }

    // 非阻塞兜底；真正的阻塞调用在 app.js 初始化前执行。
    setTimeout(runStorageRepairNow, 0);
})();
