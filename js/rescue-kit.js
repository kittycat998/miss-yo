/* rescue-kit.js - 本地数据救援扫描/恢复工具 */
(function(){
  'use strict';
  var PFX = (window.APP_PREFIX || 'CHAT_APP_V3_');
  var KNOWN_SUFFIXES = [
    'chatMessages','chatSettings','backgroundGallery','customReplies','customReplyGroups','customPokes','customPokeGroups','customStatuses','customStatusGroups','customMottos','customIntros','anniversaries','stickerLibrary','myStickerLibrary','customEmojis','kaomojiLibrary','kaomojiGroups','customStickerGroups','partnerPersonas','showPartnerNameInChat','chatBackground','partnerAvatar','myAvatar','myPokes','moyuRecords','moyuLocations','moyuActivities','currentMoyuRecord','moyuUnread','moyuWorkSession','transferData','customVoices','customVoiceGroups','envelopeData','pending_envelope','shopData','giftCabinetData'
  ];
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
    if (s[0] === '{' || s[0] === '[') {
      try { return JSON.parse(s); } catch(e) {}
    }
    return v;
  }
  function groupKey(k){
    if (!k || k.indexOf(PFX) !== 0) return null;
    for (var i=0;i<KNOWN_SUFFIXES.length;i++){
      var suf = '_' + KNOWN_SUFFIXES[i];
      if (k.endsWith(suf)) {
        return { sid: k.slice(PFX.length, -suf.length), suffix: KNOWN_SUFFIXES[i] };
      }
    }
    return null;
  }
  async function collectIDB(){
    var out = {};
    if (!window.localforage || typeof localforage.iterate !== 'function') return out;
    await localforage.iterate(function(value, key){ out[key] = cloneLite(value); });
    return out;
  }
  function collectLS(){
    var out = {};
    try {
      for (var i=0;i<localStorage.length;i++){
        var k = localStorage.key(i);
        out[k] = parseMaybe(localStorage.getItem(k));
      }
    } catch(e) {}
    return out;
  }
  function makeCandidates(idb, ls){
    var groups = {};
    function add(k, v, source){
      var g = groupKey(k);
      if (!g) return;
      if (!groups[g.sid]) groups[g.sid] = { sessionId:g.sid, source:'indexedDB/localStorage', keys:{}, counts:{}, score:0, messagesCount:0, dataKinds:0 };
      groups[g.sid].keys[g.suffix] = { key:k, source:source, value:v };
      var c = countValue(v);
      groups[g.sid].counts[g.suffix] = c;
      if (isNonEmpty(v)) {
        groups[g.sid].dataKinds += 1;
        groups[g.sid].score += c;
      }
      if (g.suffix === 'chatMessages' && Array.isArray(v)) groups[g.sid].messagesCount = v.length;
    }
    Object.keys(idb || {}).forEach(function(k){ add(k, idb[k], 'indexedDB'); });
    Object.keys(ls || {}).forEach(function(k){ add(k, parseMaybe(ls[k]), 'localStorage'); });

    var list = Object.keys(groups).map(function(sid){ return groups[sid]; });

    try {
      var b = ls && ls.BACKUP_V1_critical;
      if (typeof b === 'string') b = JSON.parse(b);
      if (b && Array.isArray(b.messages) && b.messages.length) {
        list.push({
          sessionId: b.sessionId || ('backup_' + Date.now()),
          source: 'BACKUP_V1_critical',
          fromBackup: true,
          backup: b,
          keys: {}, counts: { chatMessages: b.messages.length },
          messagesCount: b.messages.length,
          dataKinds: 1,
          score: b.messages.length
        });
      }
    } catch(e) {}

    list.sort(function(a,b){
      return (b.messagesCount - a.messagesCount) || (b.dataKinds - a.dataKinds) || (b.score - a.score);
    });
    return list.filter(function(c){ return c.messagesCount > 0 || c.dataKinds > 1 || c.score > 0; });
  }
  async function scan(){
    var idb = await collectIDB();
    var ls = collectLS();
    var candidates = makeCandidates(idb, ls);
    var sessionList = null, lastSessionId = null;
    try { sessionList = idb[PFX + 'sessionList'] || ls[PFX + 'sessionList'] || null; } catch(e) {}
    try { lastSessionId = idb[PFX + 'lastSessionId'] || ls[PFX + 'lastSessionId'] || null; } catch(e) {}
    return { appPrefix:PFX, scannedAt:new Date().toISOString(), idbKeys:Object.keys(idb), localStorageKeys:Object.keys(ls), idb:idb, localStorage:ls, sessionList:sessionList, lastSessionId:lastSessionId, candidates:candidates };
  }
  function downloadJSON(obj, name){
    var blob = new Blob([JSON.stringify(obj, null, 2)], {type:'application/json;charset=utf-8'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name || ('zcard-rescue-snapshot-' + new Date().toISOString().slice(0,19).replace(/:/g,'-') + '.json');
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 2000);
  }
  async function restoreCandidate(c){
    if (!window.localforage) throw new Error('localforage 不存在，不能恢复');
    if (!c) {
      var s = await scan();
      c = s.candidates && s.candidates[0];
    }
    if (!c) throw new Error('没有扫到可恢复候选');
    var sid = c.sessionId || ('recovered_' + Date.now());

    if (c.fromBackup && c.backup) {
      await localforage.setItem(PFX + sid + '_chatMessages', c.backup.messages || []);
      if (c.backup.settings) await localforage.setItem(PFX + sid + '_chatSettings', c.backup.settings);
      if (c.backup.anniversaries) await localforage.setItem(PFX + sid + '_anniversaries', c.backup.anniversaries);
    } else {
      var all = await scan();
      var idb = all.idb || {}, ls = all.localStorage || {};
      var writes = [];
      Object.keys(c.keys || {}).forEach(function(suffix){
        var rec = c.keys[suffix];
        if (!rec || rec.source !== 'localStorage') return;
        // localStorage 旧键迁到 indexedDB，同名 indexedDB 已存在则不覆盖。
        var target = PFX + sid + '_' + suffix;
        if (idb[target] === undefined) writes.push(localforage.setItem(target, rec.value));
      });
      if (writes.length) await Promise.allSettled(writes);
    }

    var sessions = [];
    try { sessions = await localforage.getItem(PFX + 'sessionList'); } catch(e) {}
    if (!Array.isArray(sessions)) sessions = [];
    if (!sessions.some(function(x){ return x && x.id === sid; })) {
      sessions.unshift({ id:sid, name:'恢复会话（' + (c.messagesCount || 0) + '条）', createdAt:Date.now() });
    }
    await localforage.setItem(PFX + 'sessionList', sessions);
    await localforage.setItem(PFX + 'lastSessionId', sid);
    try { localStorage.setItem(PFX + 'lastSessionId', sid); } catch(e) {}
    location.hash = sid;
    location.reload();
  }
  async function showPanel(){
    var old = document.getElementById('zcard-rescue-panel');
    if (old) old.remove();
    var panel = document.createElement('div');
    panel.id = 'zcard-rescue-panel';
    panel.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.62);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;';
    panel.innerHTML = '<div style="width:min(92vw,420px);max-height:84vh;overflow:auto;background:#fff;color:#222;border-radius:18px;padding:18px;box-shadow:0 20px 80px rgba(0,0,0,.35);">'
      + '<div style="font-size:18px;font-weight:800;margin-bottom:8px;">本地数据救援</div>'
      + '<div id="zcr-status" style="font-size:13px;line-height:1.6;color:#555;margin-bottom:12px;">正在扫描 IndexedDB / localStorage……</div>'
      + '<div id="zcr-list" style="display:flex;flex-direction:column;gap:8px;margin-bottom:12px;"></div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;">'
      + '<button id="zcr-export" style="flex:1;border:none;border-radius:12px;padding:10px 12px;background:#eee;color:#222;font-weight:700;">先导出快照</button>'
      + '<button id="zcr-restore" style="flex:1;border:none;border-radius:12px;padding:10px 12px;background:#111;color:#fff;font-weight:800;">恢复最大候选</button>'
      + '<button id="zcr-close" style="width:100%;border:none;border-radius:12px;padding:10px 12px;background:#f5f5f5;color:#777;font-weight:700;">关闭</button>'
      + '</div><div style="font-size:12px;color:#999;line-height:1.5;margin-top:10px;">先点“导出快照”最稳。恢复不会清空其它候选，只会把最像旧会话的 session 设回当前。</div></div>';
    document.body.appendChild(panel);
    var result = await scan();
    var status = panel.querySelector('#zcr-status');
    var list = panel.querySelector('#zcr-list');
    if (!result.candidates.length) {
      status.textContent = '没扫到明显候选。若之前点过“重置所有数据”、清站点数据，或换了浏览器/域名，本地可能真的被清掉了。';
    } else {
      status.textContent = '扫到 ' + result.candidates.length + ' 个候选。下面按最可能恢复排序：';
      result.candidates.slice(0,8).forEach(function(c, idx){
        var item = document.createElement('button');
        item.type = 'button';
        item.style.cssText = 'text-align:left;border:1px solid #ddd;border-radius:12px;padding:10px;background:' + (idx===0?'#fff7d6':'#fafafa') + ';color:#222;';
        var kinds = Object.keys(c.counts || {}).filter(function(k){ return c.counts[k] > 0; }).slice(0,6).join(' / ');
        item.innerHTML = '<div style="font-weight:800;font-size:13px;">' + (idx+1) + '. ' + c.sessionId + '</div>'
          + '<div style="font-size:12px;color:#555;margin-top:4px;">消息 ' + (c.messagesCount||0) + ' 条，数据类 ' + (c.dataKinds||0) + ' 个，来源 ' + c.source + '</div>'
          + '<div style="font-size:11px;color:#888;margin-top:3px;">' + kinds + '</div>';
        item.onclick = function(){ if (confirm('恢复这个候选？建议先点“导出快照”。')) restoreCandidate(c).catch(function(e){ alert('恢复失败：' + e.message); }); };
        list.appendChild(item);
      });
    }
    panel.querySelector('#zcr-export').onclick = async function(){ downloadJSON(await scan()); };
    panel.querySelector('#zcr-restore').onclick = async function(){
      var s = await scan();
      var c = s.candidates && s.candidates[0];
      if (!c) return alert('没有可恢复候选');
      if (confirm('恢复排序第一的候选？建议已经先导出快照。')) restoreCandidate(c).catch(function(e){ alert('恢复失败：' + e.message); });
    };
    panel.querySelector('#zcr-close').onclick = function(){ panel.remove(); };
  }
  window.RescueKit = { scan:scan, showPanel:showPanel, exportSnapshot:async function(){ downloadJSON(await scan()); }, restoreBest:async function(){ var s=await scan(); return restoreCandidate(s.candidates[0]); } };
  window.addEventListener('load', function(){
    setTimeout(async function(){
      if (location.search.indexOf('rescue=1') >= 0 || location.hash === '#rescue') { showPanel(); return; }
      try {
        var curEmpty = Array.isArray(window.messages) ? window.messages.length === 0 : (typeof messages !== 'undefined' && Array.isArray(messages) && messages.length === 0);
        if (!curEmpty) return;
        var s = await scan();
        if (s.candidates && s.candidates.length && (s.candidates[0].messagesCount > 0 || s.candidates[0].dataKinds > 3)) {
          var btn = document.createElement('button');
          btn.id = 'zcard-rescue-float';
          btn.textContent = '救数据';
          btn.style.cssText = 'position:fixed;right:14px;bottom:96px;z-index:2147483000;border:none;border-radius:999px;padding:10px 14px;background:#111;color:#fff;font-weight:800;box-shadow:0 8px 24px rgba(0,0,0,.25);';
          btn.onclick = showPanel;
          document.body.appendChild(btn);
        }
      } catch(e) {}
    }, 1800);
  });
})();
