/*
 * vendor-fallback.js
 * Prevents boot-time crashes when the localforage CDN is blocked.
 * It provides a tiny Promise-based localStorage-backed subset used by this app.
 * When the real localforage loads successfully, this file does nothing.
 */
(function () {
    'use strict';

    if (typeof window === 'undefined' || window.localforage) return;

    function defer(fn) {
        return new Promise(function (resolve, reject) {
            try { resolve(fn()); } catch (err) { reject(err); }
        });
    }

    function serialize(value) {
        return JSON.stringify({ __localforageFallback: true, value: value });
    }

    function deserialize(raw) {
        if (raw == null) return null;
        try {
            var parsed = JSON.parse(raw);
            if (parsed && parsed.__localforageFallback) return parsed.value;
            return parsed;
        } catch (err) {
            return raw;
        }
    }

    window.localforage = {
        _driver: 'localStorageFallback',
        getItem: function (key) {
            return defer(function () { return deserialize(localStorage.getItem(String(key))); });
        },
        setItem: function (key, value) {
            return defer(function () {
                localStorage.setItem(String(key), serialize(value));
                return value;
            });
        },
        removeItem: function (key) {
            return defer(function () {
                localStorage.removeItem(String(key));
                return undefined;
            });
        },
        clear: function () {
            return defer(function () {
                localStorage.clear();
                return undefined;
            });
        },
        keys: function () {
            return defer(function () {
                var out = [];
                for (var i = 0; i < localStorage.length; i++) {
                    out.push(localStorage.key(i));
                }
                return out;
            });
        },
        length: function () {
            return defer(function () { return localStorage.length; });
        },
        iterate: function (iterator) {
            return defer(function () {
                for (var i = 0; i < localStorage.length; i++) {
                    var key = localStorage.key(i);
                    var result = iterator(deserialize(localStorage.getItem(key)), key, i + 1);
                    if (result !== undefined) return result;
                }
                return undefined;
            });
        },
        config: function () { return this; },
        createInstance: function () { return this; },
        ready: function () { return Promise.resolve(); }
    };

    console.warn('[vendor-fallback] localforage CDN 未加载，已启用 localStorage 兜底。大图片/大量数据可能受 localStorage 容量限制。');
})();
