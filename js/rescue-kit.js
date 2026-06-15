/* rescue-kit.js - 深度本地数据救援扫描/恢复工具（手机可点版） */
(function(){
  'use strict';

  var PFX = (window.APP_PREFIX || 'CHAT_APP_V3_');
  var KNOWN_SUFFIXES = [
    'chatMessages','chatSettings','backgroundGallery','customReplies','customReplyGroups','customPokes','customPokeGroups','customStatuses','customStatusGroups','customMottos','customIntros','anniversaries','stickerLibrary','myStickerLibrary','customEmojis','kaomojiLibrary','kaomojiGroups','customStickerGroups','partnerPersonas','showPartnerNameInChat','chatBackground','partnerAvatar','myAvatar','myPokes','moyuRecords','moyuLocations','moyuActivities','currentMoyuRecord','moyuUnread','moyuWorkSession','transferData','customVoices','customVoiceGroups','envelopeData','pending_envelope','shopData','giftCabinetData','customThemes','themeSchemes'
  ];
  var MAX_DEEP_NODES = 3500;

  function cloneLite(v){
    try { return JSON.parse(JSON.stringify(v)); } catch(e){ return v; }
  }
  function countValue(v){
    if (Array.isArray(v)) return v.length;
    if (v && typeof v === 'object') return Object.keys(v).length;
    if (typeof v === 'string') return v.length ? 1 : 0;
    return v ? 1 : 0;
  }
  function isNonEmpty(v){ return countValue(v) > 0; }
  function parseMaybe(v){
    if (typeof v !== 'string') return v;
    var s = v.trim();
    if (!s) return v;
    if (s.charCodeAt(0) === 0xFEFF) s = s.slice(1).trim();
    if (s[0] === '{' || s[0] === '[') {
      try { return JSON.parse(s); } catch(e) {}
    }
    return v;
  }
  function esc(s){
    return String(s == null ? '' : s).replace(/[&<>"']/g, function(ch){
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch];
    });
  }
  function groupKey(k){
    if (!k || typeof k !== 'string' || k.indexOf(PFX) !== 0) return null;
    for (var i=0;i<KNOWN_SUFFIXES.length;i++){
      var suf = '_' + KNOWN_SUFFIXES[i];
      if (k.endsWith(suf)) {
        return { sid: k.slice(PFX.length, -suf.length), suffix: KNOWN_SUFFIXES[i] };
      }
    }
    return null;
  }
  function looksLikeMessage(obj){
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return 0;
    var score = 0;
    if ('id' in obj) score += 0.5;
    if ('sender' in obj || 'role' in obj || 'from' in obj || 'isUser' in obj || 'isMe' in obj) score += 1.2;
    if ('text' in obj || 'content' in obj || 'message' in obj || 'html' in obj || 'image' in obj || 'audio' in obj || 'video' in obj || 'file' in obj || 'redPacket' in obj || 'transfer' in obj || 'shareData' in obj) score += 1.5;
    if ('timestamp' in obj || 'time' in obj || 'createdAt' in obj || 'date' in obj) score += 1;
    if ('type' in obj || 'status' in obj || 'replyTo' in obj) score += 0.7;
    return score;
  }
  function looksLikeMessagesArray(arr){
    if (!Array.isArray(arr) || arr.length === 0) return false;
    var sample = arr.filter(function(x){ return x && typeof x === 'object' && !Array.isArray(x); }).slice(0, 30);
    if (!sample.length) return false;
    var total = 0, strong = 0;
    sample.forEach(function(x){ var s = looksLikeMessage(x); total += s; if (s >= 2.5) strong += 1; });
    // 聊天消息通常同时有 sender/text/timestamp/type 中的几项；避免把普通字卡库误判成消息。
    return strong >= Math.max(1, Math.ceil(sample.length * 0.35)) && (total / sample.length) >= 2.15;
  }
  function summarizeValue(v){
    if (Array.isArray(v)) return { kind:'array', count:v.length };
    if (v && typeof v === 'object') return { kind:'object', count:Object.keys(v).length };
    if (typeof v === 'string') return { kind:'string', count:v.length };
    return { kind:typeof v, count:countValue(v) };
  }

  async function collectLocalForageRecords(){
    var records = [];
    if (!window.localforage || typeof localforage.iterate !== 'function') return records;
    try {
      await localforage.iterate(function(value, key){
        records.push({ source:'localforage', key:key, value:cloneLite(value), path:'localforage:' + key });
      });
    } catch(e) {
      records.push({ source:'localforage-error', key:'localforage.iterate', value:String(e && e.message || e), path:'localforage:error' });
    }
    return records;
  }
  function collectLocalStorageRecords(){
    var records = [];
    try {
      for (var i=0;i<localStorage.length;i++){
        var k = localStorage.key(i);
        records.push({ source:'localStorage', key:k, value:parseMaybe(localStorage.getItem(k)), path:'localStorage:' + k });
      }
    } catch(e) {
      records.push({ source:'localStorage-error', key:'localStorage', value:String(e && e.message || e), path:'localStorage:error' });
    }
    return records;
  }
  function readStore(db, storeName){
    return new Promise(function(resolve){
      var out = [];
      var tx;
      try { tx = db.transaction(storeName, 'readonly'); } catch(e){ resolve(out); return; }
      var st = tx.objectStore(storeName);
      var req;
      try { req = st.openCursor(); } catch(e2){ resolve(out); return; }
      req.onsuccess = function(ev){
        var cursor = ev.target.result;
        if (!cursor) return;
        out.push({ key:cursor.key, value:cloneLite(cursor.value) });
        cursor.continue();
      };
      req.onerror = function(){ resolve(out); };
      tx.oncomplete = function(){ resolve(out); };
      tx.onerror = function(){ resolve(out); };
      tx.onabort = function(){ resolve(out); };
    });
  }
  function openDBReadonly(name){
    return new Promise(function(resolve){
      if (!name || !window.indexedDB) return resolve(null);
      var req;
      try { req = indexedDB.open(name); } catch(e){ return resolve(null); }
      var created = false;
      req.onupgradeneeded = function(){
        created = true;
        try { req.transaction.abort(); } catch(e) {}
      };
      req.onerror = function(){ resolve(null); };
      req.onsuccess = function(){
        var db = req.result;
        if (created) { try { db.close(); } catch(e) {} resolve(null); return; }
        resolve(db);
      };
      req.onblocked = function(){ resolve(null); };
    });
  }
  async function collectNativeIDBRecords(){
    var records = [], dbNames = [], usedDatabasesAPI = false;
    if (!window.indexedDB) return { records:records, dbNames:dbNames, usedDatabasesAPI:false };
    try {
      if (typeof indexedDB.databases === 'function') {
        usedDatabasesAPI = true;
        var dbs = await indexedDB.databases();
        dbNames = (dbs || []).map(function(d){ return d && d.name; }).filter(Boolean);
      }
    } catch(e) {}
    // Safari 老版本可能没有 indexedDB.databases()；这种情况下 localforage.iterate 已经覆盖主库，避免乱创建新库。
    for (var i=0;i<dbNames.length;i++){
      var name = dbNames[i];
      var db = await openDBReadonly(name);
      if (!db) continue;
      var stores = [];
      try { stores = Array.prototype.slice.call(db.objectStoreNames || []); } catch(e2) {}
      for (var j=0;j<stores.length;j++){
        var store = stores[j];
        var rows = await readStore(db, store);
        rows.forEach(function(r){
          records.push({ source:'indexedDB', db:name, store:store, key:r.key, value:r.value, path:'indexedDB:' + name + '/' + store + ':' + String(r.key) });
        });
      }
      try { db.close(); } catch(e3) {}
    }
    return { records:records, dbNames:dbNames, usedDatabasesAPI:usedDatabasesAPI };
  }

  function buildKnownGroups(records){
    var groups = {};
    function add(rec){
      var g = groupKey(String(rec.key));
      if (!g) return;
      if (!groups[g.sid]) groups[g.sid] = { type:'known-session', sessionId:g.sid, source:'标准键', keys:{}, counts:{}, score:0, messagesCount:0, dataKinds:0 };
      var prev = groups[g.sid].keys[g.suffix];
      // 同一个键可能被 localforage 和 native IDB 扫到两次，优先保留非空。
      if (prev && isNonEmpty(prev.value) && !isNonEmpty(rec.value)) return;
      groups[g.sid].keys[g.suffix] = rec;
      var c = countValue(rec.value);
      groups[g.sid].counts[g.suffix] = c;
      if (isNonEmpty(rec.value)) { groups[g.sid].dataKinds += 1; groups[g.sid].score += c; }
      if (g.suffix === 'chatMessages' && Array.isArray(rec.value)) groups[g.sid].messagesCount = rec.value.length;
    }
    records.forEach(add);
    return Object.keys(groups).map(function(k){ return groups[k]; });
  }
  function addBackupCandidates(records, list){
    records.forEach(function(rec){
      var k = String(rec.key || '');
      var v = rec.value;
      if (k !== 'BACKUP_V1_critical' && k.indexOf('BACKUP_V1_critical') === -1) return;
      if (typeof v === 'string') v = parseMaybe(v);
      if (v && Array.isArray(v.messages) && v.messages.length) {
        list.push({
          type:'critical-backup', sessionId:v.sessionId || ('backup_' + Date.now()), source:rec.source + ' 备份', fromBackup:true, backup:v,
          keys:{}, counts:{ chatMessages:v.messages.length }, messagesCount:v.messages.length, dataKinds:1, score:v.messages.length,
          path:rec.path
        });
      }
    });
  }
  function scanObjectForMessageArrays(root, basePath, out){
    var seen = typeof WeakSet !== 'undefined' ? new WeakSet() : null;
    var nodes = 0;
    function walk(v, path, depth){
      if (++nodes > MAX_DEEP_NODES) return;
      if (v == null || depth > 7) return;
      if (typeof v === 'string') {
        var parsed = parseMaybe(v);
        if (parsed !== v) walk(parsed, path + '→json', depth + 1);
        return;
      }
      if (typeof v !== 'object') return;
      if (seen) { if (seen.has(v)) return; seen.add(v); }
      if (Array.isArray(v)) {
        if (looksLikeMessagesArray(v)) {
          out.push({ array:v, path:path, count:v.length });
        }
        // 消息数组本身就够了，不继续深入每条消息，省性能。
        if (v.length > 80 && looksLikeMessagesArray(v)) return;
        for (var i=0;i<Math.min(v.length, 120);i++) walk(v[i], path + '[' + i + ']', depth + 1);
        return;
      }
      if (v.messages && Array.isArray(v.messages) && looksLikeMessagesArray(v.messages)) {
        out.push({ array:v.messages, path:path + '.messages', count:v.messages.length });
      }
      // 全量备份对象里可能套着 localforage 字典。
      if (v.localforage && typeof v.localforage === 'object') walk(v.localforage, path + '.localforage', depth + 1);
      if (v.indexedDB && typeof v.indexedDB === 'object') walk(v.indexedDB, path + '.indexedDB', depth + 1);
      var keys = Object.keys(v).slice(0, 180);
      keys.forEach(function(k){ walk(v[k], path + '.' + k, depth + 1); });
    }
    walk(root, basePath, 0);
  }
  function buildRawMessageCandidates(records){
    var found = [];
    records.forEach(function(rec){ scanObjectForMessageArrays(rec.value, rec.path || String(rec.key), found); });
    // 去重：同样长度 + 首尾 id/text 差不多的数组只保留一个。
    var seen = {}, list = [];
    found.forEach(function(f){
      var a = f.array || [];
      var first = a[0] || {}, last = a[a.length-1] || {};
      var sig = [a.length, first.id || first.timestamp || first.text || '', last.id || last.timestamp || last.text || ''].join('|');
      if (seen[sig]) return;
      seen[sig] = true;
      list.push({
        type:'raw-messages', sessionId:'deep_' + Date.now() + '_' + list.length,
        source:'深扫消息数组', rawMessages:cloneLite(a), path:f.path,
        keys:{}, counts:{ chatMessages:a.length }, messagesCount:a.length, dataKinds:1, score:a.length
      });
    });
    return list;
  }
  function makeCandidates(records){
    var list = buildKnownGroups(records);
    addBackupCandidates(records, list);
    list = list.concat(buildRawMessageCandidates(records));
    list.sort(function(a,b){
      return (b.messagesCount - a.messagesCount) || (b.dataKinds - a.dataKinds) || (b.score - a.score);
    });
    return list.filter(function(c){ return c.messagesCount > 0 || c.dataKinds > 0 || c.score > 0; });
  }

  async function scan(){
    var lf = await collectLocalForageRecords();
    var ls = collectLocalStorageRecords();
    var native = await collectNativeIDBRecords();
    var records = lf.concat(ls).concat(native.records || []);
    var candidates = makeCandidates(records);
    var summaries = records.map(function(r){ var s = summarizeValue(r.value); return { source:r.source, db:r.db, store:r.store, key:String(r.key), path:r.path, kind:s.kind, count:s.count }; });
    var sessionList = null, lastSessionId = null;
    records.forEach(function(r){
      if (String(r.key) === PFX + 'sessionList') sessionList = r.value;
      if (String(r.key) === PFX + 'lastSessionId') lastSessionId = r.value;
    });
    return {
      appPrefix:PFX,
      scannedAt:new Date().toISOString(),
      usedNativeDatabaseList:!!native.usedDatabasesAPI,
      nativeDatabaseNames:native.dbNames || [],
      localforageKeyCount:lf.length,
      localStorageKeyCount:ls.length,
      nativeIDBRecordCount:(native.records || []).length,
      summaries:summaries,
      records:records,
      sessionList:sessionList,
      lastSessionId:lastSessionId,
      candidates:candidates
    };
  }
  function downloadJSON(obj, name){
    var blob = new Blob([JSON.stringify(obj, null, 2)], {type:'application/json;charset=utf-8'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name || ('zcard-deep-rescue-snapshot-' + new Date().toISOString().slice(0,19).replace(/:/g,'-') + '.json');
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 2000);
  }
  async function restoreCandidate(c){
    if (!window.localforage) throw new Error('localforage 不存在，不能恢复');
    if (!c) {
      var s0 = await scan();
      c = s0.candidates && s0.candidates[0];
    }
    if (!c) throw new Error('没有扫到可恢复候选');
    var sid = (c.type === 'known-session' && c.sessionId) ? c.sessionId : ('recovered_' + Date.now());

    if (c.fromBackup && c.backup) {
      await localforage.setItem(PFX + sid + '_chatMessages', c.backup.messages || []);
      if (c.backup.settings) await localforage.setItem(PFX + sid + '_chatSettings', c.backup.settings);
      if (c.backup.anniversaries) await localforage.setItem(PFX + sid + '_anniversaries', c.backup.anniversaries);
    } else if (c.type === 'raw-messages' && Array.isArray(c.rawMessages)) {
      await localforage.setItem(PFX + sid + '_chatMessages', c.rawMessages);
    } else {
      var writes = [];
      Object.keys(c.keys || {}).forEach(function(suffix){
        var rec = c.keys[suffix];
        if (!rec) return;
        var target = PFX + sid + '_' + suffix;
        writes.push(localforage.setItem(target, rec.value));
      });
      if (writes.length) await Promise.allSettled(writes);
    }

    var sessions = [];
    try { sessions = await localforage.getItem(PFX + 'sessionList'); } catch(e) {}
    if (!Array.isArray(sessions)) sessions = [];
    if (!sessions.some(function(x){ return x && x.id === sid; })) {
      sessions.unshift({ id:sid, name:'恢复会话（' + (c.messagesCount || 0) + '条）', createdAt:Date.now(), updatedAt:Date.now() });
    }
    await localforage.setItem(PFX + 'sessionList', sessions);
    await localforage.setItem(PFX + 'lastSessionId', sid);
    try { localStorage.setItem(PFX + 'lastSessionId', sid); } catch(e2) {}
    location.hash = sid;
    location.reload();
  }
  function addFloatingButton(always){
    if (document.getElementById('zcard-rescue-float')) return;
    var btn = document.createElement('button');
    btn.id = 'zcard-rescue-float';
    btn.textContent = '深救数据';
    btn.style.cssText = 'position:fixed;right:14px;bottom:96px;z-index:2147483000;border:none;border-radius:999px;padding:10px 14px;background:#111;color:#fff;font-weight:800;box-shadow:0 8px 24px rgba(0,0,0,.25);font-size:13px;';
    btn.onclick = showPanel;
    document.body.appendChild(btn);
  }
  async function showPanel(){
    var old = document.getElementById('zcard-rescue-panel');
    if (old) old.remove();
    var panel = document.createElement('div');
    panel.id = 'zcard-rescue-panel';
    panel.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.62);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;';
    panel.innerHTML = '<div style="width:min(94vw,440px);max-height:86vh;overflow:auto;background:#fff;color:#222;border-radius:18px;padding:18px;box-shadow:0 20px 80px rgba(0,0,0,.35);">'
      + '<div style="font-size:18px;font-weight:800;margin-bottom:8px;">深度本地数据救援</div>'
      + '<div id="zcr-status" style="font-size:13px;line-height:1.6;color:#555;margin-bottom:12px;">正在深扫 localforage / localStorage / IndexedDB……</div>'
      + '<div id="zcr-list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px;"></div>'
      + '<details style="font-size:12px;color:#666;margin-bottom:12px;"><summary style="font-weight:700;cursor:pointer;">扫描摘要</summary><pre id="zcr-summary" style="white-space:pre-wrap;max-height:160px;overflow:auto;background:#f7f7f7;border-radius:10px;padding:8px;"></pre></details>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;">'
      + '<button id="zcr-export" style="flex:1;border:none;border-radius:12px;padding:10px 12px;background:#eee;color:#222;font-weight:700;">导出深扫快照</button>'
      + '<button id="zcr-restore" style="flex:1;border:none;border-radius:12px;padding:10px 12px;background:#111;color:#fff;font-weight:800;">恢复最大候选</button>'
      + '<button id="zcr-close" style="width:100%;border:none;border-radius:12px;padding:10px 12px;background:#f5f5f5;color:#777;font-weight:700;">关闭</button>'
      + '</div><div style="font-size:12px;color:#999;line-height:1.5;margin-top:10px;">先导出快照最稳。深扫会找所有库里长得像聊天记录的数组；如果这里仍然 0 条，基本只剩旧入口/旧浏览器/旧备份文件这三条路。</div></div>';
    document.body.appendChild(panel);
    var result = await scan();
    var status = panel.querySelector('#zcr-status');
    var list = panel.querySelector('#zcr-list');
    var summary = panel.querySelector('#zcr-summary');
    summary.textContent = 'localforage 键数：' + result.localforageKeyCount + '\n'
      + 'localStorage 键数：' + result.localStorageKeyCount + '\n'
      + '原生 IndexedDB 记录数：' + result.nativeIDBRecordCount + '\n'
      + '可枚举数据库：' + (result.usedNativeDatabaseList ? (result.nativeDatabaseNames.join(', ') || '无') : '当前浏览器不支持 indexedDB.databases()，已用 localforage 主库兜底') + '\n'
      + '候选数：' + result.candidates.length + '\n'
      + 'lastSessionId：' + (result.lastSessionId || '无') + '\n'
      + 'sessionList：' + (Array.isArray(result.sessionList) ? result.sessionList.length + ' 个' : (result.sessionList ? '存在但不是数组' : '无'));
    if (!result.candidates.length) {
      status.textContent = '深扫没找到任何聊天消息候选。若同一个手机桌面入口下仍是这个结果，旧消息很可能已被清空/覆盖，或在另一个入口的独立存储里。';
    } else {
      status.textContent = '扫到 ' + result.candidates.length + ' 个候选。下面按最可能恢复排序：';
      result.candidates.slice(0,10).forEach(function(c, idx){
        var item = document.createElement('button');
        item.type = 'button';
        item.style.cssText = 'text-align:left;border:1px solid #ddd;border-radius:12px;padding:10px;background:' + (idx===0?'#fff7d6':'#fafafa') + ';color:#222;';
        var kinds = Object.keys(c.counts || {}).filter(function(k){ return c.counts[k] > 0; }).slice(0,7).join(' / ');
        item.innerHTML = '<div style="font-weight:800;font-size:13px;word-break:break-all;">' + (idx+1) + '. ' + esc(c.sessionId) + '</div>'
          + '<div style="font-size:12px;color:#555;margin-top:4px;">消息 ' + (c.messagesCount||0) + ' 条，数据类 ' + (c.dataKinds||0) + ' 个，来源 ' + esc(c.source || c.type) + '</div>'
          + '<div style="font-size:11px;color:#888;margin-top:3px;word-break:break-all;">' + esc(kinds || c.path || '') + '</div>';
        item.onclick = function(){ if (confirm('恢复这个候选？建议先点“导出深扫快照”。')) restoreCandidate(c).catch(function(e){ alert('恢复失败：' + e.message); }); };
        list.appendChild(item);
      });
    }
    panel.querySelector('#zcr-export').onclick = async function(){ downloadJSON(await scan()); };
    panel.querySelector('#zcr-restore').onclick = async function(){
      var s = await scan();
      var c = s.candidates && s.candidates[0];
      if (!c) return alert('没有可恢复候选');
      if (confirm('恢复排序第一的候选？建议已经先导出深扫快照。')) restoreCandidate(c).catch(function(e){ alert('恢复失败：' + e.message); });
    };
    panel.querySelector('#zcr-close').onclick = function(){ panel.remove(); };
  }

  window.RescueKit = {
    scan:scan,
    showPanel:showPanel,
    exportSnapshot:async function(){ downloadJSON(await scan()); },
    restoreBest:async function(){ var s=await scan(); return restoreCandidate(s.candidates[0]); }
  };

  window.addEventListener('load', function(){
    setTimeout(async function(){
      if (location.search.indexOf('rescue=1') >= 0 || location.hash === '#rescue') { showPanel(); return; }
      // 手机桌面没控制台，空会话时始终给一个入口；非空时不打扰。
      try {
        var curEmpty = Array.isArray(window.messages) ? window.messages.length === 0 : (typeof messages !== 'undefined' && Array.isArray(messages) && messages.length === 0);
        if (curEmpty) addFloatingButton(true);
      } catch(e) { addFloatingButton(true); }
    }, 1500);
  });
})();
