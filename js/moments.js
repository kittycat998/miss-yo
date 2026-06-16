/**
 * 朋友圈模块 - Moments Module
 * 与 Home 页头像同步
 */
(function() {
  'use strict';

  // ========== User Config (从 Home 页同步头像) ==========
  const userConfig = {
    name: '我',
    identity: '',
    signature: '生活不止眼前的代码',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=me&backgroundColor=b6e3f4',
    coverImage: 'https://picsum.photos/seed/cover123/800/400'
  };
  const MOMENTS_AVATAR_KEY = 'moments_avatar';
  const MOMENTS_COVER_KEY = 'moments_cover';

  function currentObjectId() {
    return (window.SESSION_ID || location.hash.replace(/^#/, '') || 'default').replace(/[^\w-]/g, '_');
  }

  function scopedMomentsKey(key) {
    return 'moments_' + currentObjectId() + '_' + key;
  }

  function momentsGet(key) {
    const scoped = localStorage.getItem(scopedMomentsKey(key));
    if (scoped !== null) return scoped;
    return localStorage.getItem(key);
  }

  function momentsSet(key, value) {
    localStorage.setItem(scopedMomentsKey(key), value);
  }

  function momentsRemove(key) {
    localStorage.removeItem(scopedMomentsKey(key));
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, s => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[s]));
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function jsString(value) {
    return JSON.stringify(String(value || ''))
      .replace(/</g, '\\u003C')
      .replace(/>/g, '\\u003E')
      .replace(/&/g, '\\u0026')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
  }

  function safeJsArg(value) {
    return escapeAttr(jsString(value));
  }

  function normalizeMomentUrl(value) {
    let url = String(value || '').trim();
    if (!url) return '';
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) url = 'https://' + url;
    try {
      const parsed = new URL(url);
      if (!/^https?:$/i.test(parsed.protocol)) return '';
      return parsed.href;
    } catch(e) {
      return '';
    }
  }

  function getMomentUrlHost(url) {
    try { return new URL(url).hostname.replace(/^www\./, '') || '网页链接'; } catch(e) { return '网页链接'; }
  }

  function isMusicUrl(url) {
    const clean = String(url || '').split('?')[0].split('#')[0].toLowerCase();
    return /\.(mp3|wav|m4a|aac|ogg|oga|flac)$/i.test(clean);
  }

  function isVideoUrl(url) {
    const clean = String(url || '').split('?')[0].split('#')[0].toLowerCase();
    return /\.(mp4|mov|m4v|webm|ogg|ogv)$/i.test(clean);
  }

  function isValidProfileValue(value) {
    return typeof value === 'string'
      && value.trim() !== ''
      && value.trim().toLowerCase() !== 'undefined'
      && value.trim().toLowerCase() !== 'null';
  }

  function isValidAvatar(value) {
    return isValidProfileValue(value)
      && (value.startsWith('data:image/')
        || value.startsWith('http://')
        || value.startsWith('https://')
        || value.startsWith('./')
        || value.startsWith('/')
        || value.startsWith('blob:'));
  }

  function isPersistentAvatar(value) {
    // blob: 只是本次页面临时地址，刷新/重新进桌面网页后一定容易裂开，不能当保存值。
    return isValidProfileValue(value)
      && (value.startsWith('data:image/')
        || value.startsWith('http://')
        || value.startsWith('https://')
        || value.startsWith('./')
        || value.startsWith('/'));
  }

  function safeStorageSet(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch(e) {
      console.warn('localStorage 写入失败，已跳过:', key, e);
      return false;
    }
  }

  function safeHomeSet(key, value) {
    try {
      if (typeof homeSetItem === 'function') homeSetItem(key, value);
      else localStorage.setItem(key, value);
      return true;
    } catch(e) {
      console.warn('Home 设置写入失败，已跳过:', key, e);
      return false;
    }
  }

  async function safeHomeSetLarge(key, value) {
    try {
      if (typeof homeSetLargeItem === 'function') {
        await homeSetLargeItem(key, value);
        return true;
      }
    } catch(e) {
      console.warn('Home 大容量写入失败:', key, e);
    }
    if (typeof localforage !== 'undefined') {
      try {
        await localforage.setItem(typeof homeKey === 'function' ? homeKey(key) : key, value);
        return true;
      } catch(e) {
        console.warn('localforage 写入失败:', key, e);
      }
    }
    return safeHomeSet(key, value);
  }

  function applyMomentsProfile(profile) {
    if (!profile || typeof profile !== 'object') return;
    if (isValidProfileValue(profile.name)) userConfig.name = profile.name.trim();
    if (isValidProfileValue(profile.identity)) userConfig.identity = profile.identity.trim();
    if (isValidProfileValue(profile.signature)) userConfig.signature = profile.signature.replace(/^["']|["']$/g, '');
  }

  function getSavedMomentsProfile() {
    try {
      const saved = momentsGet('moments_profile');
      return saved ? JSON.parse(saved) : null;
    } catch(e) {
      return null;
    }
  }

  function getSavedImageFromLocal(key) {
    try {
      const value = localStorage.getItem(scopedMomentsKey(key)) || localStorage.getItem(key);
      return isPersistentAvatar(value) ? value : null;
    } catch(e) {
      return null;
    }
  }

  async function getSavedImage(key) {
    // 朋友圈头像/背景以 localforage 为准，避免 localStorage 残留旧图覆盖新图。
    if (typeof localforage !== 'undefined') {
      try {
        const value = await localforage.getItem(scopedMomentsKey(key));
        if (isPersistentAvatar(value)) return value;
        const legacyValue = await localforage.getItem(key);
        if (isPersistentAvatar(legacyValue)) return legacyValue;
      } catch(e) {}
    }
    const localValue = getSavedImageFromLocal(key);
    if (localValue) return localValue;
    return null;
  }

  function applyMomentsImagesToDom(container) {
    container = container || document.getElementById('moments-container');
    if (!container) return;
    const avatarEl = container.querySelector('#userAvatar');
    const identityEl = container.querySelector('#userIdentity');
    const coverEl = container.querySelector('#coverArea');
    const avatarPreview = container.querySelector('#beautifyAvatarPreview');
    const coverPreview = container.querySelector('#beautifyCoverPreview');
    if (avatarEl && isValidAvatar(userConfig.avatar)) avatarEl.src = userConfig.avatar;
    if (identityEl) {
      identityEl.textContent = userConfig.identity || '';
      identityEl.style.display = userConfig.identity ? 'inline-flex' : 'none';
    }
    if (coverEl && isValidAvatar(userConfig.coverImage)) coverEl.style.backgroundImage = `url("${userConfig.coverImage}")`;
    if (avatarPreview && isValidAvatar(userConfig.avatar)) avatarPreview.src = userConfig.avatar;
    if (coverPreview && isValidAvatar(userConfig.coverImage)) coverPreview.src = userConfig.coverImage;
  }

  // ========== 从 Home 页同步头像 ==========
  async function syncAvatarFromHome() {
    let avatarUrl = null;
    let userName = null;
    let userIdentity = null;
    let userSignature = null;
    const momentsProfile = getSavedMomentsProfile();

    const lsAvatar = typeof homeGetItem === 'function' ? homeGetItem('home_avatar_me') : localStorage.getItem('home_avatar_me');
    if (isPersistentAvatar(lsAvatar)) avatarUrl = lsAvatar;
    const lsProfile = typeof homeGetItem === 'function' ? homeGetItem('profile_me') : localStorage.getItem('profile_me');
    if (lsProfile) {
      try {
        const profile = JSON.parse(lsProfile);
        if (!userName && isValidProfileValue(profile.name)) userName = profile.name;
        if (!userIdentity && isValidProfileValue(profile.identity)) userIdentity = profile.identity;
        if (!userSignature && isValidProfileValue(profile.signature)) userSignature = profile.signature;
        if (!avatarUrl && isPersistentAvatar(profile.avatar)) avatarUrl = profile.avatar;
      } catch(e) {}
    }

    if (typeof homeGetItem === 'function') {
      const routedAvatar = homeGetItem('home_avatar_me');
      if (!avatarUrl && isPersistentAvatar(routedAvatar)) avatarUrl = routedAvatar;
      if (!userName || !userIdentity || !userSignature || !avatarUrl) {
        const profileStr = homeGetItem('profile_me');
        if (profileStr) {
          try {
            const profile = JSON.parse(profileStr);
            if (!userName && isValidProfileValue(profile.name)) userName = profile.name;
            if (!userIdentity && isValidProfileValue(profile.identity)) userIdentity = profile.identity;
            if (!userSignature && isValidProfileValue(profile.signature)) userSignature = profile.signature;
            if (!avatarUrl && isPersistentAvatar(profile.avatar)) avatarUrl = profile.avatar;
          } catch(e) {}
        }
      }
    }

    if (typeof localforage !== 'undefined') {
      try {
        if (!avatarUrl) {
          var lfAvatar = await localforage.getItem(typeof homeKey === 'function' ? homeKey('home_avatar_me') : 'home_avatar_me');
          if (isValidAvatar(lfAvatar)) avatarUrl = lfAvatar;
        }
        if (!userName || !userIdentity || !userSignature || !avatarUrl) {
          var lfProfile = await localforage.getItem(typeof homeKey === 'function' ? homeKey('profile_me') : 'profile_me');
          if (lfProfile) {
            var profile = JSON.parse(lfProfile);
            if (!userName && isValidProfileValue(profile.name)) userName = profile.name;
            if (!userIdentity && isValidProfileValue(profile.identity)) userIdentity = profile.identity;
            if (!userSignature && isValidProfileValue(profile.signature)) userSignature = profile.signature;
            if (!avatarUrl && isPersistentAvatar(profile.avatar)) avatarUrl = profile.avatar;
          }
        }
      } catch(e) {}
    }

    // 朋友圈里单独上传过头像时，优先使用朋友圈头像，避免被主页旧头像覆盖。
    const momentsAvatar = await getSavedImage(MOMENTS_AVATAR_KEY);
    if (momentsAvatar) avatarUrl = momentsAvatar;

    if (avatarUrl) userConfig.avatar = avatarUrl;

    // 朋友圈昵称/签名优先使用朋友圈个性设置，头像仍跟随主页。
    if (momentsProfile) {
      applyMomentsProfile(momentsProfile);
    } else {
      if (userName) userConfig.name = userName;
      if (userIdentity) userConfig.identity = userIdentity;
      if (userSignature) userConfig.signature = userSignature.replace(/^[\"']|[\"']$/g, '');
    }

    return { avatar: userConfig.avatar, name: userConfig.name, identity: userConfig.identity, signature: userConfig.signature };
  }

  // ========== Sample Data (从 localStorage 恢复，或初始化为空) ==========
  const momentsData = [];
  const MOMENTS_STORAGE_KEY = 'moments_data';
  const MOMENTS_LF_KEY = 'moments_data_v2'; // localforage 主存储

  function _normalizeMomentList(parsed) {
    if (!Array.isArray(parsed)) return [];
    const seen = new Set();
    const list = [];
    parsed.forEach(m => {
      if (!m || !m.id || seen.has(String(m.id))) return;
      seen.add(String(m.id));
      if (!Array.isArray(m.images)) m.images = [];
      if (!Array.isArray(m.likes)) m.likes = [];
      if (!Array.isArray(m.comments)) m.comments = [];
      normalizeMomentComments(m);
      if (!Array.isArray(m.mentions)) m.mentions = [];
      list.push(m);
    });
    return list;
  }

  function loadMomentsFromStorage() {
    try {
      const saved = localStorage.getItem(scopedMomentsKey(MOMENTS_STORAGE_KEY)) || localStorage.getItem(MOMENTS_STORAGE_KEY);
      momentsData.length = 0;
      if (saved) {
        _normalizeMomentList(JSON.parse(saved)).forEach(m => momentsData.push(m));
      }
    } catch(e) {}
  }

  // 异步加载：localforage 优先（容量大、无 5MB 限制），与 localStorage 合并
  async function loadMomentsFromAllStorage() {
    let lsList = [];
    try {
      const saved = localStorage.getItem(scopedMomentsKey(MOMENTS_STORAGE_KEY)) || localStorage.getItem(MOMENTS_STORAGE_KEY);
      if (saved) lsList = _normalizeMomentList(JSON.parse(saved));
    } catch(e) {}

    let lfList = [];
    if (typeof localforage !== 'undefined') {
      try {
        const lfSaved = await localforage.getItem(scopedMomentsKey(MOMENTS_LF_KEY)) || await localforage.getItem(MOMENTS_LF_KEY);
        if (Array.isArray(lfSaved)) lfList = _normalizeMomentList(lfSaved);
      } catch(e) {}
    }

    // 合并：以 id 去重，优先取内容更完整的（图片不是占位符）
    const map = new Map();
    [...lfList, ...lsList].forEach(m => {
      const existing = map.get(String(m.id));
      if (!existing) {
        map.set(String(m.id), m);
      } else {
        // 选择 images 中真实图片更多的版本
        const realCount = (arr) => arr.filter(x => typeof x === 'string' && x !== '[图片]' && !x.startsWith('__IDB_IMG__')).length + arr.filter(x => typeof x === 'string' && x.startsWith('__IDB_IMG__')).length;
        if (realCount(m.images) > realCount(existing.images)) {
          map.set(String(m.id), m);
        }
      }
    });

    momentsData.length = 0;
    Array.from(map.values())
      .sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0))
      .forEach(m => momentsData.push(m));
  }
  loadMomentsFromStorage();

  let partnerMomentTimer = null;

  function clampPercent(value, fallback) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(100, n));
  }

  function randomBetween(min, max) {
    min = Number(min); max = Number(max);
    min = Number.isFinite(min) ? min : 0;
    max = Number.isFinite(max) ? max : min;
    if (min > max) { const t = min; min = max; max = t; }
    return min + Math.random() * (max - min);
  }

  function pickRandom(arr) {
    return Array.isArray(arr) && arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;
  }

  function createCommentId() {
    return 'c_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function ensureCommentId(comment) {
    if (!comment || typeof comment !== 'object') return comment;
    if (!comment.id) comment.id = createCommentId();
    return comment;
  }

  function normalizeMomentComments(moment) {
    if (!moment || typeof moment !== 'object') return;
    if (!Array.isArray(moment.comments)) moment.comments = [];
    const seen = new Set();
    moment.comments.forEach(function(comment) {
      if (!comment || typeof comment !== 'object') return;
      if (!comment.id || seen.has(String(comment.id))) comment.id = createCommentId();
      seen.add(String(comment.id));
    });
  }

  function findCommentById(moment, commentId) {
    if (!moment || !Array.isArray(moment.comments)) return null;
    const wanted = String(commentId || '');
    return moment.comments.find(function(comment) {
      return comment && String(comment.id || '') === wanted;
    }) || null;
  }

  function findCommentIndex(moment, commentId) {
    if (!moment || !Array.isArray(moment.comments)) return -1;
    const wanted = String(commentId || '');
    return moment.comments.findIndex(function(comment) {
      return comment && String(comment.id || '') === wanted;
    });
  }

  function getCommentActionKey(momentId, commentId) {
    return String(momentId) + ':' + String(commentId || '');
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(String(value));
    return String(value).replace(/[^a-zA-Z0-9_-]/g, function(ch) { return '\\' + ch; });
  }

  function getTextPool() {
    const replies = (window._customReplies || []).map(v => String(v || '').trim()).filter(Boolean);
    const kaomoji = (window._kaomojiLibrary || []).map(v => String(v || '').trim()).filter(Boolean);
    const emojis = (window._customEmojis || []).map(v => String(v || '').trim()).filter(Boolean);
    return replies.concat(kaomoji).concat(emojis);
  }

  function buildPartnerCommentText(userComment) {
    const pool = getTextPool();
    let text = pickRandom(pool);
    if (!text) {
      const fallbacks = ['我看到了', '嗯嗯，想和你说这个', '这条我也想回你', '我也这么觉得'];
      text = pickRandom(fallbacks) || '我看到了';
    }
    return text;
  }

  function getStickerPool() {
    if (window._stickerLibrary && Array.isArray(window._stickerLibrary)) return window._stickerLibrary.filter(Boolean);
    if (typeof stickerLibrary !== 'undefined' && Array.isArray(stickerLibrary)) return stickerLibrary.filter(Boolean);
    return [];
  }

  function getMomentsMediaPool(kind) {
    const lib = typeof window.getZCardMediaLibrary === 'function' ? window.getZCardMediaLibrary() : null;
    if (lib && Array.isArray(lib[kind])) return lib[kind].filter(item => item && item.url);
    try {
      const raw = JSON.parse(localStorage.getItem('zcardMediaLibraryV1') || '{}');
      return Array.isArray(raw[kind]) ? raw[kind].filter(item => item && item.url) : [];
    } catch (e) {
      return [];
    }
  }

  function getPartnerPostSettings() {
    return {
      min: Number(momentsGet('moments_partner_post_min') || 600),
      max: Number(momentsGet('moments_partner_post_max') || 1800),
      textMin: Math.max(0, Number(momentsGet('moments_partner_text_min') || 1)),
      textMax: Math.max(0, Number(momentsGet('moments_partner_text_max') || 2)),
      imageChance: clampPercent(momentsGet('moments_partner_image_chance'), 30),
      voiceChance: clampPercent(momentsGet('moments_partner_voice_chance'), 15),
      videoChance: clampPercent(momentsGet('moments_partner_video_chance'), 10)
    };
  }

  // ========== 大文件存储（IndexedDB）- 视频 + 图片 ==========
  // 图片压缩阈值：超过此大小的 base64 存入 IndexedDB
  const IDB_IMAGE_THRESHOLD = 50000; // ~50KB 的 base64 约 37KB 原始数据
  const COMPRESS_MAX_WIDTH = 1200; // 压缩后最大宽度
  const COMPRESS_QUALITY = 0.7; // JPEG 压缩质量

  function openMomentsDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('MomentsVideoDB', 2);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('videos')) db.createObjectStore('videos');
        if (!db.objectStoreNames.contains('images')) db.createObjectStore('images');
      };
      req.onsuccess = e => resolve(e.target.result);
      req.onerror = e => reject(e);
    });
  }

  async function saveVideoToIDB(momentId, videoBase64) {
    try {
      const db = await openMomentsDB();
      const tx = db.transaction('videos', 'readwrite');
      tx.objectStore('videos').put(videoBase64, 'vid_' + momentId);
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } catch(e) { console.warn('视频存储失败:', e); }
  }
  async function getVideoFromIDB(momentId) {
    try {
      const db = await openMomentsDB();
      return new Promise(resolve => {
        const tx = db.transaction('videos', 'readonly');
        const req = tx.objectStore('videos').get('vid_' + momentId);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch(e) { return null; }
  }

  // 图片存入 IndexedDB（key 格式: img_{momentId}_{imageIndex}）
  async function saveImageToIDB(momentId, imageIndex, imageBase64) {
    try {
      const db = await openMomentsDB();
      const tx = db.transaction('images', 'readwrite');
      tx.objectStore('images').put(imageBase64, 'img_' + momentId + '_' + imageIndex);
      await new Promise((resolve, reject) => {
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
    } catch(e) { console.warn('图片存储失败:', e); }
  }
  async function getImageFromIDB(momentId, imageIndex) {
    try {
      const db = await openMomentsDB();
      return new Promise(resolve => {
        const tx = db.transaction('images', 'readonly');
        const req = tx.objectStore('images').get('img_' + momentId + '_' + imageIndex);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      });
    } catch(e) { return null; }
  }

  // 删除某条朋友圈在 IDB 中的所有图片和视频
  async function deleteMomentFromIDB(moment) {
    try {
      const db = await openMomentsDB();
      // 删除视频
      if (moment.video) {
        const tx1 = db.transaction('videos', 'readwrite');
        tx1.objectStore('videos').delete('vid_' + moment.id);
      }
      // 删除图片
      if (moment.images && moment.images.length > 0) {
        const tx2 = db.transaction('images', 'readwrite');
        moment.images.forEach((img, idx) => {
          if (typeof img === 'string' && img.startsWith('__IDB_IMG__')) {
            tx2.objectStore('images').delete('img_' + moment.id + '_' + idx);
          }
        });
      }
    } catch(e) { console.warn('IDB 清理失败:', e); }
  }

  // 压缩图片：缩小尺寸 + 降低质量
  function compressImage(base64, maxWidth, quality) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = function() {
        // 如果图片已经很小，不压缩
        if (img.width <= maxWidth && base64.length < IDB_IMAGE_THRESHOLD) {
          resolve(base64);
          return;
        }
        const ratio = Math.min(maxWidth / img.width, maxWidth / img.height, 1);
        const w = Math.round(img.width * ratio);
        const h = Math.round(img.height * ratio);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = function() { resolve(base64); };
      img.src = base64;
    });
  }

  async function persistMomentsImage(key, imageData, maxWidth, quality) {
    if (!isValidAvatar(imageData) || imageData.startsWith('blob:')) return null;
    const scopedKey = scopedMomentsKey(key);
    let fullData = imageData;
    let compactData = imageData;

    try {
      compactData = await compressImage(imageData, maxWidth, quality);
    } catch(e) {
      compactData = imageData;
    }

    // 先写新图，成功后再清旧图；避免“先删旧图，新图又写失败”导致头像直接裂开。
    let savedLarge = false;
    if (typeof localforage !== 'undefined') {
      try {
        await localforage.setItem(scopedKey, fullData);
        savedLarge = true;
      } catch(e) {
        try {
          await localforage.setItem(scopedKey, compactData);
          fullData = compactData;
          savedLarge = true;
        } catch(e2) {
          console.warn('朋友圈图片保存到 localforage 失败:', key, e2);
        }
      }
    }

    // localStorage 只放压缩图，不能塞原图；PWA 很容易因为 5MB 限额保存失败。
    try {
      safeStorageSet(scopedKey, compactData);
      // 兼容旧全局键：只放小图，避免旧入口读取不到。
      safeStorageSet(key, compactData);
    } catch(e) {
      console.warn('朋友圈图片保存到 localStorage 失败，仅保留 localforage:', key, e);
    }

    return savedLarge ? fullData : compactData;
  }

  // 保存朋友圈数据到 localStorage（视频和大图片存 IndexedDB，localStorage 只保留引用）
  // 同时把完整 dataToSave 备份到 localforage，避免 localStorage 5MB 上限导致丢数据。
  async function saveMomentsToStorage() {
    try {
      const dataToSave = [];
      for (let mi = 0; mi < momentsData.length; mi++) {
        const m = momentsData[mi];
        normalizeMomentComments(m);
        const saved = { ...m, images: [...m.images] };

        // 视频处理：大视频存 IndexedDB
        if (saved.video && saved.video.url && saved.video.url.length > 1000) {
          await saveVideoToIDB(m.id, saved.video.url);
          saved.video = { ...saved.video, url: '__IDB__' + m.id };
        }

        // 图片处理：大图片压缩后存 IndexedDB，localStorage 只保留引用
        for (let ii = 0; ii < saved.images.length; ii++) {
          const img = saved.images[ii];
          if (typeof img === 'string' && img.length > IDB_IMAGE_THRESHOLD && !img.startsWith('__IDB_IMG__')) {
            // 先压缩再存 IDB
            const compressed = await compressImage(img, COMPRESS_MAX_WIDTH, COMPRESS_QUALITY);
            await saveImageToIDB(m.id, ii, compressed);
            saved.images[ii] = '__IDB_IMG__' + m.id + '_' + ii;
          }
        }

        dataToSave.push(saved);
      }

      // 1. 主存储：localforage（IndexedDB，容量大，永久保存完整数据）
      if (typeof localforage !== 'undefined') {
        try {
          await localforage.setItem(scopedMomentsKey(MOMENTS_LF_KEY), dataToSave);
        } catch(e) {
          console.warn('localforage 保存朋友圈失败:', e);
        }
      }

      // 2. 兜底：localStorage（同步、即时可读）
      try {
        localStorage.setItem(scopedMomentsKey(MOMENTS_STORAGE_KEY), JSON.stringify(dataToSave));
      } catch(e) {
        // localStorage 超限时，尝试只保存文本/引用（图片在 IDB 中保留）
        console.warn('localStorage 朋友圈保存超限，降级处理:', e);
        try {
          const lite = dataToSave.map(m => ({
            ...m,
            // 保留 IDB 引用，仅把仍是大 base64 的图片替换为占位
            images: m.images.map(img => {
              if (typeof img !== 'string') return img;
              if (img.startsWith('__IDB_IMG__')) return img;
              if (img.length > 100) return '[图片]';
              return img;
            })
          }));
          localStorage.setItem(scopedMomentsKey(MOMENTS_STORAGE_KEY), JSON.stringify(lite));
        } catch(e2) {
          console.error('localStorage 降级保存仍失败:', e2);
        }
      }
    } catch(e) {
      console.warn('保存朋友圈数据失败:', e);
    }
  }

  // 可提醒的好友列表 - 只包含系统 partner，与 Home 页个人信息绑定
  const friendList = [];

  // 缓存系统（伴侣）信息，避免每次都异步读取
  let cachedPartnerName = '梦角';
  let cachedPartnerAvatar = 'https://api.dicebear.com/7.x/avataaars/svg?seed=partner&backgroundColor=c0aede';

  async function loadPartnerInfo() {
    let partnerName = '梦角';
    let partnerAvatar = 'https://api.dicebear.com/7.x/avataaars/svg?seed=partner&backgroundColor=c0aede';

    try {
      // 1. 从聊天当前会话 settings 获取，确保对象切换后以当前对象为准
      if (window.settings) {
        if (window.settings.partnerName) partnerName = window.settings.partnerName;
        if (isPersistentAvatar(window.settings.partnerAvatar)) partnerAvatar = window.settings.partnerAvatar;
      }

      // 2. 从 Home 当前会话存储读取；若当前会话无数据，homeGetItem 会回退旧全局数据
      if (typeof homeGetItem === 'function') {
        const scopedProfile = homeGetItem('profile_partner');
        if (scopedProfile) {
          const partner = JSON.parse(scopedProfile);
          if (partner.name) partnerName = partner.name;
          if (isPersistentAvatar(partner.avatar)) partnerAvatar = partner.avatar;
        }
        const scopedAvatar = homeGetItem('home_avatar_partner');
        if (isPersistentAvatar(scopedAvatar)) partnerAvatar = scopedAvatar;
      }

      // 3. 兼容旧全局数据：只在 settings/Home 当前会话都没有头像时使用
      if (!window.settings && typeof localforage !== 'undefined') {
        var lfAvatar = await localforage.getItem('home_avatar_partner');
        if (isPersistentAvatar(lfAvatar)) partnerAvatar = lfAvatar;
        var lfProfile = await localforage.getItem('profile_partner');
        if (lfProfile) {
          var profile = JSON.parse(lfProfile);
          if (profile.name) partnerName = profile.name;
          if (isPersistentAvatar(profile.avatar)) partnerAvatar = profile.avatar;
        }
      }
      const momentsPartnerAvatar = await getSavedImage('moments_partner_avatar');
      if (momentsPartnerAvatar) partnerAvatar = momentsPartnerAvatar;
    } catch(e) {}

    cachedPartnerName = partnerName;
    cachedPartnerAvatar = partnerAvatar;
  }

  function getPartnerName() {
    return cachedPartnerName;
  }
  function getPartnerAvatar() {
    return cachedPartnerAvatar;
  }

  function saveMomentsPartnerName(name) {
    const clean = String(name || '').trim();
    if (!clean) return;
    cachedPartnerName = clean;
    try {
      const profileStr = typeof homeGetItem === 'function' ? homeGetItem('profile_partner') : localStorage.getItem('profile_partner');
      const profile = profileStr ? JSON.parse(profileStr) : {};
      profile.name = clean;
      if (profile.avatar && !isPersistentAvatar(profile.avatar)) delete profile.avatar;
      safeHomeSet('profile_partner', JSON.stringify(profile));
      if (window.settings) window.settings.partnerName = clean;
      if (typeof saveData === 'function') saveData();
      if (window.SESSION_ID && Array.isArray(window.sessionList) && typeof localforage !== 'undefined') {
        const currentSession = window.sessionList.find(function(s) { return s.id === window.SESSION_ID; });
        if (currentSession) {
          currentSession.name = clean;
          const appPrefix = typeof APP_PREFIX !== 'undefined' ? APP_PREFIX : 'zcard_';
          localforage.setItem(appPrefix + 'sessionList', window.sessionList).catch(function(){});
        }
      }
      window.dispatchEvent(new CustomEvent('homeGlobalUpdated', { detail: { key: 'profile_partner', value: JSON.stringify(profile) } }));
    } catch(e) {}
  }

  async function saveMomentsPartnerAvatar(avatar) {
    if (!isValidAvatar(avatar) || avatar.startsWith('blob:')) return null;
    let safeAvatar = avatar;
    try {
      safeAvatar = await persistMomentsImage('moments_partner_avatar', avatar, 512, 0.82) || avatar;
    } catch(e) {
      try { safeAvatar = await compressImage(avatar, 512, 0.82); } catch(e2) { safeAvatar = avatar; }
    }
    cachedPartnerAvatar = safeAvatar;
    try {
      const profileStr = typeof homeGetItem === 'function' ? homeGetItem('profile_partner') : localStorage.getItem('profile_partner');
      const profile = profileStr ? JSON.parse(profileStr) : {};
      profile.avatar = safeAvatar;
      if (!isValidProfileValue(profile.name)) profile.name = getPartnerName();
      safeHomeSet('home_avatar_partner', safeAvatar);
      safeHomeSet('profile_partner', JSON.stringify(profile));
      await safeHomeSetLarge('home_avatar_partner', safeAvatar);
      await safeHomeSetLarge('profile_partner', JSON.stringify(profile));
      if (window.settings) window.settings.partnerAvatar = safeAvatar;
      if (typeof saveData === 'function') saveData();
      window.dispatchEvent(new CustomEvent('homeGlobalUpdated', { detail: { key: 'home_avatar_partner', value: safeAvatar } }));
      window.dispatchEvent(new CustomEvent('homeGlobalUpdated', { detail: { key: 'profile_partner', value: JSON.stringify(profile) } }));
      return safeAvatar;
    } catch(e) {
      console.warn('保存对象头像失败:', e);
      return safeAvatar;
    }
  }

  function syncPartnerFriendItem() {
    var partnerItem = momentsFriends.find(function(f) { return f.isPartner; });
    if (!partnerItem) {
      momentsFriends.unshift(getDefaultPartnerFriend()[0]);
      partnerItem = momentsFriends[0];
    }
    partnerItem.name = getPartnerName();
    partnerItem.avatar = getPartnerAvatar();
    saveMomentsFriends();
  }

  async function initFriendList() {
    friendList.length = 0;
    await loadPartnerInfo();
    friendList.push({
      name: cachedPartnerName,
      avatar: cachedPartnerAvatar
    });
  }

  // 发表时临时存储
  let tempMentions = [];
  let tempLocation = '';

  // ========== 初始化用户信息 ==========
  async function initUserInfo() {
    // 每次打开都同步头像，确保与 Home 页保持一致
    await syncAvatarFromHome();
    
    // 恢复封面背景
    try {
      const savedCover = await getSavedImage(MOMENTS_COVER_KEY);
      if (savedCover) {
        userConfig.coverImage = savedCover;
      }
    } catch(e) {}
    
    const container = document.getElementById('moments-container');
    if (!container) return;
    
    const nameEl = container.querySelector('#userName');
    const sigEl = container.querySelector('#userSignature');
    const avatarEl = container.querySelector('#userAvatar');
    const coverEl = container.querySelector('#coverArea');
    
    if (nameEl) nameEl.textContent = userConfig.name;
    if (sigEl) sigEl.textContent = userConfig.signature;
    // 头像与 Home 页使用同一存储变量
    if (avatarEl) avatarEl.src = userConfig.avatar;
    if (coverEl) coverEl.style.backgroundImage = `url(${userConfig.coverImage})`;
  }

  // ========== Render ==========
  async function renderMoments() {
    const container = document.getElementById('moments-container');
    if (!container) return;

    // 每次渲染前同步最新头像（确保与 Home 页保持一致）
    await syncAvatarFromHome();
    // 同步封面背景（用户在朋友圈个性设置中可上传）
    try {
      const savedCover = await getSavedImage(MOMENTS_COVER_KEY);
      if (savedCover) userConfig.coverImage = savedCover;
    } catch(e) {}
    const avatarEl = container.querySelector('#userAvatar');
    const nameEl = container.querySelector('#userName');
    const sigEl = container.querySelector('#userSignature');
    const coverEl = container.querySelector('#coverArea');
    if (avatarEl) avatarEl.src = userConfig.avatar;
    if (nameEl) nameEl.textContent = userConfig.name;
    if (sigEl) sigEl.textContent = userConfig.signature;
    if (coverEl && userConfig.coverImage) coverEl.style.backgroundImage = `url("${userConfig.coverImage}")`;

    const listEl = container.querySelector('#momentsList');
    if (!listEl) return;
    
    if (momentsData.length === 0) {
      listEl.innerHTML = `
        <div class="moments-empty-state" style="text-align:center;padding:60px 20px;color:#999;">
          <div style="font-size:48px;margin-bottom:16px;opacity:0.5;">📝</div>
          <div style="font-size:16px;margin-bottom:8px;">还没有朋友圈动态</div>
          <div style="font-size:13px;color:#ccc;">点击右下角 + 按钮发布第一条吧</div>
        </div>
      `;
      return;
    }

    // 从 IndexedDB 恢复大图片（异步加载）
    await restoreImagesFromIDB();

    // 朋友圈列表重绘前，先把内联评论框移回根容器，避免 innerHTML 清空时把输入框节点一起删掉。
    restoreInlineCommentControls();
    listEl.innerHTML = momentsData.map(m => renderMomentCard(m)).join('');
    setupLongPress();

    // 渲染后重新显示通知（renderMoments 重建 DOM 会销毁通知元素）
    if (momentsNotifications.length > 0) {
      renderMomentsNotificationCard();
    }
  }

  // 从 IndexedDB 恢复所有 __IDB_IMG__ 引用的图片
  async function restoreImagesFromIDB() {
    for (let mi = 0; mi < momentsData.length; mi++) {
      const m = momentsData[mi];
      for (let ii = 0; ii < m.images.length; ii++) {
        const img = m.images[ii];
        if (typeof img === 'string' && img.startsWith('__IDB_IMG__')) {
          // 解析 key: __IDB_IMG__{momentId}_{imageIndex}
          const parts = img.replace('__IDB_IMG__', '').split('_');
          if (parts.length >= 2) {
            const data = await getImageFromIDB(parseInt(parts[0]), parseInt(parts[1]));
            if (data) {
              m.images[ii] = data; // 恢复到内存
            }
          }
        }
      }
      // 恢复视频
      if (m.video && m.video.url && m.video.url.startsWith('__IDB__')) {
        const momentId = parseInt(m.video.url.replace('__IDB__', ''));
        const data = await getVideoFromIDB(momentId);
        if (data) {
          m.video.url = data; // 恢复到内存
        }
      }
    }
  }

  // ========== Time Formatting ==========
  function formatMomentTime(timestamp) {
    // 朋友圈时间改成具体日期时间，避免“刚刚/几小时前”看不出是哪一天发的。
    const raw = (typeof timestamp === 'string' && /^\d+$/.test(timestamp)) ? Number(timestamp) : timestamp;
    if (typeof raw === 'string') return raw;
    const date = new Date(Number(raw));
    if (!Number.isFinite(date.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  let editingCommentMomentId = null;
  let editingCommentId = null;

  function renderMomentCard(m) {
    if (!Array.isArray(m.images)) m.images = [];
    if (!Array.isArray(m.likes)) m.likes = [];
    if (!Array.isArray(m.comments)) m.comments = [];
    normalizeMomentComments(m);
    if (!Array.isArray(m.mentions)) m.mentions = [];
    // 发过的朋友圈头像不再固定吃旧快照：自己的动态跟随当前朋友圈头像，梦角动态跟随当前梦角头像；普通好友仍保留发布时头像。
    let displayAvatar = isValidAvatar(m.avatar) ? m.avatar : userConfig.avatar;
    if (m.author === 'me' && isValidAvatar(userConfig.avatar)) {
      displayAvatar = userConfig.avatar;
    } else if ((m.author === 'partner' || m.authorId === 'partner') && isValidAvatar(getPartnerAvatar())) {
      displayAvatar = getPartnerAvatar();
    }
    const displayNickname = isValidProfileValue(m.nickname) ? m.nickname : userConfig.name;
    const displayIdentity = isValidProfileValue(m.identity) ? m.identity : '';
    const displayText = isValidProfileValue(m.text) ? m.text : '';
    const safeNickname = escapeHtml(displayNickname);
    const safeAvatar = escapeAttr(displayAvatar);
    const safeText = escapeHtml(displayText);
    const momentId = Number(m.id) || 0;

    // 计算媒体总数（图片+视频）
    const mediaItems = [];
    m.images.forEach((img, i) => mediaItems.push({ type: 'image', src: img, index: i }));
    if (m.video) mediaItems.push({ type: 'video', src: m.video.cover, url: m.video.url, duration: m.video.duration });

    const totalMedia = mediaItems.length;
    const gridClass = totalMedia === 1 ? 'cols-1' :
                      totalMedia === 2 ? 'cols-2' : 'cols-3';

    const imagesHtml = totalMedia > 0 ? `
      <div class="nine-grid ${gridClass}">
        ${mediaItems.map((item) => {
          const safeSrc = escapeAttr(item.src || '');
          if (item.type === 'video') {
            return `
              <div class="grid-item video-item" onclick="MomentsApp.playVideo(${momentId})">
                ${safeSrc ? `<img src="${safeSrc}" alt="视频" loading="lazy">` : `<div class="moment-video-placeholder"><i class="fas fa-play"></i></div>`}
                <span class="video-duration">${escapeHtml(item.duration || '')}</span>
              </div>
            `;
          }
          return `
            <div class="grid-item" onclick="MomentsApp.openPreview(${momentId}, ${Number(item.index) || 0})">
              <img src="${safeSrc}" alt="图片" loading="lazy">
            </div>
          `;
        }).join('')}
      </div>
    ` : '';

    const stickerHtml = m.sticker ? `
      <div class="moment-sticker" onclick="MomentsApp.openStickerPreview(${safeJsArg(m.sticker)})">
        <img src="${escapeAttr(m.sticker)}" alt="表情包" loading="lazy">
      </div>
    ` : '';

    const likesHtml = m.likes.length > 0 ? `
      <div class="like-section">
        <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
        <span class="like-names">${m.likes.map(name => escapeHtml(name)).join('，')}</span>
      </div>
    ` : '';

    const commentsHtml = m.comments.length > 0 ? `
      <div class="comment-section">
        ${m.comments.map((c) => {
          ensureCommentId(c);
          const commentId = String(c && c.id ? c.id : createCommentId());
          const commentName = c && c.name ? c.name : '';
          const replyTo = c && c.replyTo ? c.replyTo : '';
          const commentText = c && c.text ? c.text : '';
          const sticker = c && c.sticker ? c.sticker : '';
          const actionKey = getCommentActionKey(momentId, commentId);
          const isEditingComment = editingCommentMomentId === momentId && editingCommentId === commentId;
          if (isEditingComment) {
            return `
              <div class="comment-item comment-editing" data-comment-item data-moment-id="${momentId}" data-comment-id="${escapeAttr(commentId)}" onclick="event.stopPropagation()">
                <div class="comment-edit-title"><span class="comment-name">${escapeHtml(commentName)}</span>${replyTo ? `<span class="reply-arrow">回复</span><span class="reply-to">${escapeHtml(replyTo)}</span>` : ''}</div>
                <textarea class="comment-edit-input" data-comment-edit-input="${escapeAttr(actionKey)}">${escapeHtml(commentText)}</textarea>
                <div class="comment-edit-actions">
                  <button type="button" onclick="event.stopPropagation();MomentsApp.cancelCommentEdit()">取消</button>
                  <button type="button" class="primary" onclick="event.stopPropagation();MomentsApp.saveCommentEdit(${momentId}, ${safeJsArg(commentId)})">保存</button>
                </div>
              </div>
            `;
          }
          return `
            <div class="comment-item" data-comment-item data-moment-id="${momentId}" data-comment-id="${escapeAttr(commentId)}" data-comment-name="${escapeAttr(commentName)}">
              <div class="comment-line"><span class="comment-name">${escapeHtml(commentName)}</span>${replyTo ? `<span class="reply-arrow">回复</span><span class="reply-to">${escapeHtml(replyTo)}</span>` : ''}：<span class="comment-text">${escapeHtml(commentText)}</span>${sticker ? `<img class="comment-sticker-img" src="${escapeAttr(sticker)}" alt="表情包" style="max-width:80px;max-height:80px;border-radius:4px;vertical-align:middle;display:inline-block;margin-left:4px;">` : ''}</div>
              <div class="comment-action-popover" data-comment-menu="${escapeAttr(actionKey)}" onclick="event.stopPropagation()">
                <button type="button" onclick="event.stopPropagation();MomentsApp.closeCommentActionMenus();MomentsApp.replyToComment(${momentId}, ${safeJsArg(commentId)})">回复</button>
                <button type="button" onclick="event.stopPropagation();MomentsApp.closeCommentActionMenus();MomentsApp.editComment(${momentId}, ${safeJsArg(commentId)})">编辑</button>
                <button type="button" class="danger" onclick="event.stopPropagation();MomentsApp.closeCommentActionMenus();MomentsApp.deleteComment(${momentId}, ${safeJsArg(commentId)})">删除</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    ` : '';

    const interactionHtml = (m.likes.length > 0 || m.comments.length > 0) ? `
      <div class="interaction-area">
        <div class="interaction-bubble">
          ${likesHtml}
          ${commentsHtml}
        </div>
      </div>
    ` : '';

    const likedClass = m.likedByMe ? 'liked' : '';
    const collectedClass = m.collected ? 'collected' : '';

    const mentionsHtml = m.mentions && m.mentions.length > 0 ? `
      <div class="moment-mentions">提到了：${m.mentions.map(name => escapeHtml(name)).join('、')}</div>
    ` : '';

    const locationHtml = m.location ? `
      <div class="moment-location">${escapeHtml(m.location)}</div>
    ` : '';

    const linkHtml = m.link && m.link.url ? renderMomentLink(m) : '';
    const voiceHtml = m.voice && m.voice.url ? renderMomentVoice(m) : '';

    return `
      <div class="moment-card" data-moment-id="${momentId}">
        <div class="moment-notification" id="momentNotification-${momentId}" style="display:none;">
          <div class="moment-notification-inner" onclick="MomentsApp.scrollToFirstNotifiedMoment && MomentsApp.scrollToFirstNotifiedMoment()">
            <img class="notification-avatar" src="" alt="">
            <span class="notification-text"></span>
          </div>
        </div>
        <div class="moment-header">
          <img class="moment-avatar" src="${safeAvatar}" alt="${safeNickname}">
          <div class="moment-meta">
            <div class="moment-nickname">${safeNickname}</div>
            ${displayIdentity ? `<div class="moment-identity">${escapeHtml(displayIdentity)}</div>` : ''}
            <div class="moment-time">${escapeHtml(formatMomentTime(m.time))}</div>
          </div>
        </div>
        <div class="moment-content">
          <div class="moment-text ${displayText.length > 80 ? 'collapsed' : ''}" id="mt-${momentId}">${safeText}</div>
          ${displayText.length > 80 ? `<div class="moment-text-expand" onclick="MomentsApp.toggleTextExpand(${momentId})">展开</div>` : ''}
          ${mentionsHtml}
          ${locationHtml}
          ${linkHtml}
          ${imagesHtml}
          ${voiceHtml}
          ${stickerHtml}
        </div>
        <div class="moment-actions">
          <div class="moment-more-wrapper">
            <button class="action-btn moment-more-btn" type="button" data-more-btn="${momentId}" onclick="MomentsApp.toggleMomentManageMenu(${momentId}, event)" title="更多操作">
              <i class="fas fa-ellipsis-h"></i>
            </button>
            <div class="moment-more-menu" data-more-menu="${momentId}">
              <button type="button" onclick="event.stopPropagation();MomentsApp.closeMomentManageMenus();MomentsApp.openEditPanel(${momentId})"><i class="fas fa-pen"></i><span>编辑</span></button>
              <button type="button" class="danger" onclick="event.stopPropagation();MomentsApp.closeMomentManageMenus();MomentsApp.deleteMomentById(${momentId})"><i class="fas fa-trash"></i><span>删除</span></button>
            </div>
          </div>
          <button class="action-btn ${likedClass}" data-like-btn="${momentId}">
            <svg class="heart-icon" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
          </button>
          <button class="action-btn" data-comment-btn="${momentId}">
            <svg class="comment-icon" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z"/></svg>
          </button>
          <button class="action-btn ${collectedClass}" data-collect-btn="${momentId}">
            <svg class="star-icon" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
          </button>
        </div>
        ${interactionHtml}
        <div class="comment-inline-host" data-comment-host="${momentId}"></div>
      </div>
    `;
  }

  function renderMomentLink(m) {
    const link = m.link || {};
    const url = normalizeMomentUrl(link.url);
    if (!url) return '';
    const host = getMomentUrlHost(url);
    const title = escapeHtml(link.title || (isMusicUrl(url) ? '音乐链接' : (isVideoUrl(url) ? '视频链接' : host)));
    const desc = escapeHtml(link.desc || host);
    if (link.type === 'music' || isMusicUrl(url)) {
      return `
        <div class="moment-music-card" data-moment-id="${m.id}" data-music-url="${escapeHtml(url)}" onclick="MomentsApp.toggleMomentMusic(this,event)">
          <button class="moment-music-play" type="button"><i class="fas fa-play"></i></button>
          <div class="moment-music-main">
            <div class="moment-link-title">${title}</div>
            <div class="moment-link-desc">${desc}</div>
          </div>
          <audio preload="none"></audio>
        </div>
      `;
    }
    return `
      <div class="moment-link-card ${isVideoUrl(url) || link.type === 'video' ? 'video-link' : ''}" data-moment-id="${m.id}" data-link-url="${escapeHtml(url)}" onclick="MomentsApp.toggleMomentLinkFrame(this,event)">
        <div class="moment-link-icon"><i class="fas ${isVideoUrl(url) || link.type === 'video' ? 'fa-play' : 'fa-link'}"></i></div>
        <div class="moment-link-main">
          <div class="moment-link-title">${title}</div>
          <div class="moment-link-desc">${desc}</div>
        </div>
      </div>
    `;
  }

  function renderMomentVoice(m) {
    const voice = m.voice || {};
    const title = escapeHtml(voice.name || '语音');
    const url = escapeHtml(voice.url || '');
    return `
      <div class="moment-voice-card" data-voice-url="${url}" onclick="MomentsApp.toggleMomentVoice(this,event)">
        <button class="moment-voice-play" type="button"><i class="fas fa-play"></i></button>
        <div class="moment-voice-main">
          <div class="moment-link-title">${title}</div>
          <div class="moment-link-desc">点击播放语音</div>
        </div>
      </div>
    `;
  }

  // ========== Card Long Press for Edit ==========
  // 旧版长按整条朋友圈会打开编辑面板；编辑/删除已经移动到朋友圈右侧菜单，
  // 这里不再绑定整卡长按，避免和“长按评论操作”抢事件。
  function setupCardLongPress() {}

  // ========== Edit Panel ==========
  let currentEditMomentId = null;
  let editImages = [];
  let editMentions = [];

  function openEditPanel(momentId) {
    currentEditMomentId = momentId;
    const m = momentsData.find(x => x.id === momentId);
    if (!m) return;

    const container = document.getElementById('moments-container');
    if (!container) return;

    container.querySelector('#editTextarea').value = m.text;
    container.querySelector('#editTime').textContent = `发布时间：${m.time}`;
    container.querySelector('#editLikes').textContent = `点赞：${m.likes.length}`;
    container.querySelector('#editComments').textContent = `评论：${m.comments.length}`;

    // 初始化位置和提到的人
    container.querySelector('#editLocationInput').value = m.location || '';
    editMentions = m.mentions ? [...m.mentions] : [];
    renderEditMentions();

    editImages = [...m.images];
    renderEditImages();

    container.querySelector('#editPanel').classList.add('active');
  }

  function renderEditImages() {
    const container = document.getElementById('moments-container');
    if (!container) return;
    
    const body = container.querySelector('#editPanelBody');
    // Remove old image grid if exists
    const old = body.querySelector('.edit-image-grid');
    if (old) old.remove();
    
    const grid = document.createElement('div');
    grid.className = 'edit-image-grid';
    grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:12px;';
    
    grid.innerHTML = editImages.map((img, i) => `
      <div style="position:relative;padding-top:100%;border-radius:4px;overflow:hidden;">
        <img src="${img}" alt="图片" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;">
        <div onclick="MomentsApp.removeEditImage(${i})" style="position:absolute;top:4px;right:4px;width:20px;height:20px;background:rgba(0,0,0,0.5);border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;">
          <svg viewBox="0 0 24 24" style="width:12px;height:12px;fill:#fff;"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </div>
      </div>
    `).join('') + `
      <div onclick="MomentsApp.addEditImage()" style="position:relative;padding-top:100%;border:1px dashed #ccc;border-radius:4px;cursor:pointer;background:#fafafa;">
        <span style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:32px;color:#ccc;">+</span>
      </div>
    `;
    
    body.appendChild(grid);
  }

  function removeEditImage(idx) {
    editImages.splice(idx, 1);
    renderEditImages();
  }

  function addEditImage() {
    const fileInput = document.getElementById('momentsEditPhotoInput');
    if (fileInput) {
      fileInput.value = '';
      fileInput.click();
    }
  }

  function handleEditPhotoUpload(e) {
    const file = e.target.files[0];
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = function(ev) {
      editImages.push(ev.target.result);
      renderEditImages();
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function closeEditPanel() {
    const container = document.getElementById('moments-container');
    if (container) {
      container.querySelector('#editPanel').classList.remove('active');
    }
    currentEditMomentId = null;
  }

  function saveEdit() {
    if (!currentEditMomentId) return;

    const m = momentsData.find(x => x.id === currentEditMomentId);
    if (!m) return;

    const container = document.getElementById('moments-container');
    if (!container) return;

    const editTextarea = container.querySelector('#editTextarea');
    if (editTextarea) m.text = editTextarea.value.trim();
    m.images = [...editImages];

    // 保存位置和提到的人
    m.location = container.querySelector('#editLocationInput').value.trim();
    m.mentions = [...editMentions];

    saveMomentsToStorage();
    renderMoments();
    closeEditPanel();
  }

  async function deleteMoment() {
    if (!currentEditMomentId) return;
    await deleteMomentById(currentEditMomentId, true);
  }

  async function deleteMomentById(momentId, fromEditPanel) {
    const id = Number(momentId);
    if (!id) return;

    if (confirm('确定要删除这条朋友圈吗？')) {
      const idx = momentsData.findIndex(x => Number(x.id) === id);
      if (idx >= 0) {
        const removed = momentsData.splice(idx, 1)[0];
        await deleteMomentFromIDB(removed); // 清理 IDB 中的图片和视频
        await saveMomentsToStorage();
        renderMoments();
        if (typeof showNotification === 'function') showNotification('朋友圈已删除', 'success');
      }
      if (fromEditPanel) closeEditPanel();
    }
  }

  // ========== Edit Panel Helper Functions ==========
  function renderEditMentions() {
    const container = document.getElementById('moments-container');
    if (!container) return;
    
    const display = container.querySelector('#editMentionDisplay');
    if (editMentions.length === 0) {
      display.innerHTML = '<span style="color:#999;">未选择</span>';
    } else {
      display.innerHTML = editMentions.map(name => `<span style="background:#e6f7ed;color:#07c160;padding:2px 8px;border-radius:4px;font-size:13px;">@${name}</span>`).join('');
    }
  }

  function openEditLocationPanel() {
    const container = document.getElementById('moments-container');
    if (!container) return;
    
    const currentLoc = container.querySelector('#editLocationInput').value;
    container.querySelector('#locationInput').value = currentLoc;
    container.querySelector('#locationPanel').classList.add('active');
    // 设置回调函数
    window.locationPanelCallback = (loc) => {
      container.querySelector('#editLocationInput').value = loc;
    };
  }

  function openEditMentionPanel() {
    // 初始化 tempMentions 为当前编辑的值
    tempMentions = [...editMentions];
    const container = document.getElementById('moments-container');
    if (container) {
      container.querySelector('#mentionPanel').classList.add('active');
    }
    renderMentionList();
    // 设置回调函数
    window.mentionPanelCallback = (selected) => {
      editMentions = [...selected];
      renderEditMentions();
    };
  }

  function closeMomentManageMenus() {
    const container = document.getElementById('moments-container');
    if (!container) return;
    container.querySelectorAll('.moment-more-menu.active').forEach(menu => {
      menu.classList.remove('active');
    });
  }

  function toggleMomentManageMenu(momentId, event) {
    if (event) event.stopPropagation();
    const container = document.getElementById('moments-container');
    if (!container) return;
    const id = Number(momentId);
    const menu = container.querySelector(`[data-more-menu="${id}"]`);
    if (!menu) return;
    const shouldOpen = !menu.classList.contains('active');
    closeMomentManageMenus();
    if (shouldOpen) menu.classList.add('active');
  }

  // ========== Long Press Setup ==========
  let longPressTimer = null;
  let currentLongPressTarget = null;

  function setupLongPress() {
    const container = document.getElementById('moments-container');
    if (!container) return;

    container.querySelectorAll('.moment-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (!e.target.closest('.moment-more-wrapper')) {
          closeMomentManageMenus();
        }
        if (!e.target.closest('.comment-action-popover') && !e.target.closest('[data-comment-item]')) {
          closeCommentActionMenus();
        }
      });
    });

    container.querySelectorAll('[data-comment-item]').forEach(item => {
      item.addEventListener('contextmenu', handleCommentItemContextMenu);
      item.addEventListener('touchstart', handleCommentItemLongPressStart, { passive: false });
      item.addEventListener('touchend', handleCommentItemLongPressEnd);
      item.addEventListener('touchmove', handleCommentItemLongPressEnd);
      item.addEventListener('mousedown', handleCommentItemLongPressStart);
      item.addEventListener('mouseup', handleCommentItemLongPressEnd);
      item.addEventListener('mouseleave', handleCommentItemLongPressEnd);
      item.addEventListener('click', (e) => {
        if (e.target.closest('.comment-action-popover') || e.target.closest('.comment-edit-actions') || e.target.closest('.comment-edit-input')) return;
        e.stopPropagation();
        if (!item.dataset.longPressed) {
          const momentId = parseInt(item.dataset.momentId);
          const commentId = item.dataset.commentId;
          replyToComment(momentId, commentId);
        }
        delete item.dataset.longPressed;
      });
    });
    
    container.querySelectorAll('[data-like-btn]').forEach(btn => {
      btn.addEventListener('touchstart', handleLongPressStart);
      btn.addEventListener('touchend', handleLongPressEnd);
      btn.addEventListener('mousedown', handleLongPressStart);
      btn.addEventListener('mouseup', handleLongPressEnd);
      btn.addEventListener('mouseleave', handleLongPressEnd);
      btn.addEventListener('click', (e) => {
        if (!btn.dataset.longPressed) {
          toggleLike(parseInt(btn.dataset.likeBtn));
        }
        delete btn.dataset.longPressed;
      });
    });

    container.querySelectorAll('[data-comment-btn]').forEach(btn => {
      btn.addEventListener('touchstart', handleCommentLongPressStart);
      btn.addEventListener('touchend', handleCommentLongPressEnd);
      btn.addEventListener('mousedown', handleCommentLongPressStart);
      btn.addEventListener('mouseup', handleCommentLongPressEnd);
      btn.addEventListener('mouseleave', handleCommentLongPressEnd);
      btn.addEventListener('click', (e) => {
        if (!btn.dataset.longPressed) {
          toggleComment(parseInt(btn.dataset.commentBtn));
        }
        delete btn.dataset.longPressed;
      });
    });

    container.querySelectorAll('[data-collect-btn]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleCollect(parseInt(btn.dataset.collectBtn));
      });
    });
  }

  function handleLongPressStart(e) {
    e.stopPropagation();
    currentLongPressTarget = e.currentTarget;
    longPressTimer = setTimeout(() => {
      currentLongPressTarget.dataset.longPressed = 'true';
      showLongPressHint();
      setTimeout(() => {
        openCustomLikePanel(parseInt(currentLongPressTarget.dataset.likeBtn));
      }, 300);
    }, 800);
  }

  function handleLongPressEnd(e) {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  function handleCommentLongPressStart(e) {
    e.stopPropagation();
    currentLongPressTarget = e.currentTarget;
    longPressTimer = setTimeout(() => {
      currentLongPressTarget.dataset.longPressed = 'true';
      showLongPressHint();
      setTimeout(() => {
        openCustomCommentPanel(parseInt(currentLongPressTarget.dataset.commentBtn));
      }, 300);
    }, 800);
  }

  function handleCommentLongPressEnd(e) {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  function handleCommentItemContextMenu(e) {
    e.preventDefault();
    e.stopPropagation();
    const item = e.currentTarget;
    openCommentActionMenu(parseInt(item.dataset.momentId), item.dataset.commentId, e);
  }

  function handleCommentItemLongPressStart(e) {
    const item = e.currentTarget;
    if (!item || item.classList.contains('comment-editing')) return;
    if (e.target.closest('.comment-action-popover') || e.target.closest('.comment-edit-input') || e.target.closest('.comment-edit-actions')) return;
    e.stopPropagation();
    currentLongPressTarget = item;
    longPressTimer = setTimeout(function() {
      if (!currentLongPressTarget) return;
      currentLongPressTarget.dataset.longPressed = 'true';
      openCommentActionMenu(parseInt(currentLongPressTarget.dataset.momentId), currentLongPressTarget.dataset.commentId, e);
    }, 650);
  }

  function handleCommentItemLongPressEnd(e) {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  }

  function closeCommentActionMenus() {
    const container = document.getElementById('moments-container');
    if (!container) return;
    container.querySelectorAll('.comment-action-popover.active').forEach(function(menu) {
      menu.classList.remove('active');
    });
    container.querySelectorAll('.comment-item.action-open').forEach(function(item) {
      item.classList.remove('action-open');
    });
  }

  function openCommentActionMenu(momentId, commentId, event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const container = document.getElementById('moments-container');
    if (!container || !commentId) return;
    const key = getCommentActionKey(momentId, commentId);
    const menu = Array.from(container.querySelectorAll('[data-comment-menu]')).find(function(el) {
      return el.dataset.commentMenu === key;
    });
    const item = Array.from(container.querySelectorAll('[data-comment-item]')).find(function(el) {
      return Number(el.dataset.momentId) === Number(momentId) && el.dataset.commentId === String(commentId);
    });
    if (!menu) return;
    const shouldOpen = !menu.classList.contains('active');
    closeCommentActionMenus();
    if (shouldOpen) {
      if (item) item.classList.add('action-open');
      menu.classList.add('active');
    }
  }

  function editComment(momentId, commentId) {
    const m = momentsData.find(x => Number(x.id) === Number(momentId));
    if (!m) return;
    normalizeMomentComments(m);
    const comment = findCommentById(m, commentId);
    if (!comment) return;
    editingCommentMomentId = Number(momentId);
    editingCommentId = String(comment.id);
    closeCommentActionMenus();
    renderMoments();
    setTimeout(function() {
      const container = document.getElementById('moments-container');
      if (!container) return;
      const editKey = getCommentActionKey(momentId, commentId);
      const input = Array.from(container.querySelectorAll('[data-comment-edit-input]')).find(function(el) {
        return el.dataset.commentEditInput === editKey;
      });
      if (input) {
        input.focus();
        input.selectionStart = input.selectionEnd = input.value.length;
      }
    }, 50);
  }

  function cancelCommentEdit() {
    editingCommentMomentId = null;
    editingCommentId = null;
    renderMoments();
  }

  async function saveCommentEdit(momentId, commentId) {
    const container = document.getElementById('moments-container');
    const editKey = getCommentActionKey(momentId, commentId);
    const input = container ? Array.from(container.querySelectorAll('[data-comment-edit-input]')).find(function(el) {
      return el.dataset.commentEditInput === editKey;
    }) : null;
    const newText = input ? input.value.trim() : '';
    const m = momentsData.find(x => Number(x.id) === Number(momentId));
    if (!m) return;
    normalizeMomentComments(m);
    const comment = findCommentById(m, commentId);
    if (!comment) return;
    comment.text = newText;
    comment.editedAt = Date.now();
    editingCommentMomentId = null;
    editingCommentId = null;
    await saveMomentsToStorage();
    await renderMoments();
  }

  async function deleteComment(momentId, commentId) {
    const m = momentsData.find(x => Number(x.id) === Number(momentId));
    if (!m) return;
    normalizeMomentComments(m);
    const idx = findCommentIndex(m, commentId);
    if (idx === -1) return;
    if (!confirm('确定删除这条评论吗？')) return;
    m.comments.splice(idx, 1);
    if (editingCommentMomentId === Number(momentId) && editingCommentId === String(commentId)) {
      editingCommentMomentId = null;
      editingCommentId = null;
    }
    closeCommentActionMenus();
    await saveMomentsToStorage();
    await renderMoments();
  }

  function showLongPressHint() {
    const container = document.getElementById('moments-container');
    if (!container) return;
    
    const hint = container.querySelector('#longPressHint');
    hint.classList.add('active');
    setTimeout(() => {
      hint.classList.remove('active');
    }, 1000);
  }

  // ========== Custom Panel ==========
  let customMomentId = null;
  let customType = 'like';

  async function openCustomLikePanel(momentId) {
    customMomentId = momentId;
    customType = 'like';
    
    const container = document.getElementById('moments-container');
    if (!container) return;
    
    container.querySelector('#customPanelTitle').textContent = '自定义点赞';
    container.querySelector('#customLabel').textContent = '点赞人名称（用逗号分隔）';
    container.querySelector('#customInput').placeholder = '例如：张三, 李四, 王五';
    container.querySelector('#customCommentGroup').style.display = 'none';
    
    const m = momentsData.find(x => x.id === momentId);
    container.querySelector('#customInput').value = m.likes.join(', ');
    
    // 渲染好友列表快捷选择
    await renderCustomFriendsShortcut(container, m.likes);
    
    container.querySelector('#customPanel').classList.add('active');
  }

  async function renderCustomFriendsShortcut(container, currentLikes) {
    var shortcutEl = container.querySelector('#customFriendsShortcut');
    if (!shortcutEl) return;
    
    // 加载好友列表（init 中已初始化，此处为兜底）
    if (momentsFriends.length === 0) await loadMomentsFriends();
    
    if (momentsFriends.length === 0) {
      shortcutEl.innerHTML = '';
      return;
    }
    
    var currentArr = currentLikes || [];
    var allSelected = momentsFriends.length > 0 && momentsFriends.every(function(f) { return currentArr.indexOf(f.name) !== -1; });
    
    var html = '<div class="friends-shortcut-header">';
    html += '<span class="friends-shortcut-title">好友列表</span>';
    html += '<button class="friends-select-all" onclick="MomentsApp.toggleSelectAllFriends(this)">' + (allSelected ? '取消全选' : '全选') + '</button>';
    html += '</div>';
    html += '<div class="friends-shortcut-chips">';
    html += momentsFriends.map(function(f) {
      var isSelected = currentArr.indexOf(f.name) !== -1;
      return '<span class="friend-chip' + (isSelected ? ' selected' : '') + '" data-name="' + f.name + '">' + f.name + '</span>';
    }).join('');
    html += '</div>';
    
    shortcutEl.innerHTML = html;
    
    shortcutEl.querySelectorAll('.friend-chip').forEach(function(chip) {
      chip.addEventListener('click', function() {
        var name = this.getAttribute('data-name');
        var input = container.querySelector('#customInput');
        var names = input.value.split(',').map(function(n) { return n.trim(); }).filter(Boolean);
        var idx = names.indexOf(name);
        if (idx === -1) {
          names.push(name);
          this.classList.add('selected');
        } else {
          names.splice(idx, 1);
          this.classList.remove('selected');
        }
        input.value = names.join(', ');
        // 更新全选按钮状态
        updateSelectAllButton(container);
      });
    });
  }

  function updateSelectAllButton(container) {
    var btn = container.querySelector('.friends-select-all');
    if (!btn) return;
    var input = container.querySelector('#customInput');
    var names = input.value.split(',').map(function(n) { return n.trim(); }).filter(Boolean);
    var allSelected = momentsFriends.length > 0 && momentsFriends.every(function(f) { return names.indexOf(f.name) !== -1; });
    btn.textContent = allSelected ? '取消全选' : '全选';
  }

  function toggleSelectAllFriends(btn) {
    var container = document.getElementById('moments-container');
    if (!container) return;
    var input = container.querySelector('#customInput');
    var chips = container.querySelectorAll('.friend-chip');
    var isAllSelected = btn.textContent === '取消全选';
    
    if (isAllSelected) {
      // 取消全选
      input.value = '';
      chips.forEach(function(chip) { chip.classList.remove('selected'); });
      btn.textContent = '全选';
    } else {
      // 全选
      var allNames = momentsFriends.map(function(f) { return f.name; });
      input.value = allNames.join(', ');
      chips.forEach(function(chip) { chip.classList.add('selected'); });
      btn.textContent = '取消全选';
    }
  }

  function openCustomCommentPanel(momentId) {
    customMomentId = momentId;
    customType = 'comment';
    
    const container = document.getElementById('moments-container');
    if (!container) return;
    
    container.querySelector('#customPanelTitle').textContent = '自定义评论';
    container.querySelector('#customLabel').textContent = '评论人名称';
    container.querySelector('#customInput').placeholder = '例如：李四';
    container.querySelector('#customCommentGroup').style.display = 'block';
    
    container.querySelector('#customInput').value = '';
    container.querySelector('#customCommentInput').value = '';
    
    container.querySelector('#customPanel').classList.add('active');
  }

  function closeCustomPanel() {
    const container = document.getElementById('moments-container');
    if (container) {
      container.querySelector('#customPanel').classList.remove('active');
    }
    customMomentId = null;
  }

  function confirmCustom() {
    if (!customMomentId) return;
    
    const m = momentsData.find(x => x.id === customMomentId);
    if (!m) return;
    
    const container = document.getElementById('moments-container');
    if (!container) return;
    
    if (customType === 'like') {
      const names = container.querySelector('#customInput').value.split(',').map(n => n.trim()).filter(n => n);
      m.likes = names;
      m.likedByMe = names.includes(userConfig.name);
    } else {
      const name = container.querySelector('#customInput').value.trim();
      const text = container.querySelector('#customCommentInput').value.trim();
      if (name && text) {
        m.comments.push({ id: createCommentId(), name, text });
      }
    }
    saveMomentsToStorage();
    renderMoments();
    closeCustomPanel();
  }

  // ========== Collect ==========
  function toggleCollect(momentId) {
    const m = momentsData.find(x => x.id === momentId);
    if (!m) return;
    m.collected = !m.collected;
    saveMomentsToStorage();
    renderMoments();
  }

  // ========== Text Expand/Collapse ==========
  function toggleTextExpand(momentId) {
    const container = document.getElementById('moments-container');
    if (!container) return;
    
    const textEl = container.querySelector('#mt-' + momentId);
    const expandBtn = textEl.nextElementSibling;
    if (textEl.classList.contains('collapsed')) {
      textEl.classList.remove('collapsed');
      expandBtn.textContent = '收起';
    } else {
      textEl.classList.add('collapsed');
      expandBtn.textContent = '展开';
    }
  }

  // ========== Auto Reply (从字卡库/表情包/颜文字随机选取) ==========
  async function triggerAutoReply(momentId) {
    const m = momentsData.find(x => x.id === momentId);
    if (!m) return;

    // 刷新系统（伴侣）信息缓存
    await loadPartnerInfo();

    // 获取字卡库
    const customReplies = (window._customReplies || []).map(r => String(r || '').trim()).filter(Boolean);
    // 获取颜文字库
    const kaomojiLibrary = (window._kaomojiLibrary || []).map(k => String(k || '').trim()).filter(Boolean);
    // 获取自定义表情
    const customEmojis = (window._customEmojis || []).map(e => String(e || '').trim()).filter(Boolean);
    // 获取表情包库
    let _stickerLib = [];
    if (typeof window !== 'undefined' && window._stickerLibrary && Array.isArray(window._stickerLibrary)) {
      _stickerLib = window._stickerLibrary;
    } else if (typeof stickerLibrary !== 'undefined' && Array.isArray(stickerLibrary)) {
      _stickerLib = stickerLibrary;
    }
    const stickerLibraryFiltered = _stickerLib.filter(Boolean);

    const hasTextContent = customReplies.length > 0 || kaomojiLibrary.length > 0 || customEmojis.length > 0;
    const hasStickers = stickerLibraryFiltered.length > 0;

    // 自动互动使用缓存的伴侣（系统）信息
    let replierName = getPartnerName();
    let partnerAvatar = getPartnerAvatar();

    // 即使回复库为空，也按互动设置触发点赞（保证用户发布后必有反馈）
    if (!hasTextContent && !hasStickers) {
      // 仅触发点赞流程
      let didLikeOnly = false;
      if (Math.random() < 0.9) {
        if (isFriendLikeEnabled()) {
          if (momentsFriends.length === 0) await loadMomentsFriends();
          momentsFriends.forEach(function(friend) {
            if (Math.random() < 0.5 && !m.likes.includes(friend.name)) {
              m.likes.push(friend.name);
            }
          });
          if (!m.likes.includes(replierName)) {
            m.likes.push(replierName);
          }
          didLikeOnly = true;
        } else {
          if (!m.likes.includes(replierName)) {
            m.likes.push(replierName);
            didLikeOnly = true;
          }
        }
      }
      await saveMomentsToStorage();
      await renderMoments();
      if (didLikeOnly) {
        showMomentsNotification(replierName, partnerAvatar, 'like', 1, m.id, '', getMomentPreviewImage(m));
      }
      // 提示用户尚未配置文本回复库
      const container = document.getElementById('moments-container');
      if (container) {
        const hint = container.querySelector('#longPressHint');
        if (hint) {
          hint.textContent = '回复库为空，已仅触发点赞，请到字卡库添加内容';
          hint.classList.add('active');
          setTimeout(() => hint.classList.remove('active'), 2000);
        }
      }
      return;
    }

    // 选择回复数量
    var countSetting = getReplyCount();
    const replyCount = countSetting === -1
      ? (Math.random() < 0.7 ? 1 : (Math.random() < 0.9 ? 2 : 3))
      : countSetting;

    for (let i = 0; i < replyCount; i++) {
      // 20% 概率发送表情包（如果有表情包库）
      const sendSticker = hasStickers && Math.random() < 0.2;

      if (sendSticker) {
        const sticker = stickerLibraryFiltered[Math.floor(Math.random() * stickerLibraryFiltered.length)];
        m.comments.push({
          id: createCommentId(),
          name: replierName,
          text: '',
          sticker: sticker
        });
        showMomentsNotification(replierName, partnerAvatar, 'comment', 1, m.id, '[表情包]', getMomentPreviewImage(m));
        continue;
      }

      if (!hasTextContent) continue;

      let replyText = '';

      // 优先从字卡库选取（70%概率），否则从颜文字库选取
      const useKaomoji = customReplies.length === 0 || (kaomojiLibrary.length > 0 && Math.random() < 0.3);
      
      if (useKaomoji && kaomojiLibrary.length > 0) {
        replyText = kaomojiLibrary[Math.floor(Math.random() * kaomojiLibrary.length)];
      } else if (customReplies.length > 0) {
        replyText = customReplies[Math.floor(Math.random() * customReplies.length)];
      }

      if (!replyText) continue;

      // Emoji 混入（20%概率）
      if (customEmojis.length > 0 && Math.random() < 0.2) {
        const emoji = customEmojis[Math.floor(Math.random() * customEmojis.length)];
        replyText = Math.random() < 0.5 ? emoji + ' ' + replyText : replyText + ' ' + emoji;
      }

      // 颜文字混入（如果回复本身不是颜文字，25%概率额外混入）
      if (kaomojiLibrary.length > 0 && !useKaomoji && Math.random() < 0.25) {
        const kaomoji = kaomojiLibrary[Math.floor(Math.random() * kaomojiLibrary.length)];
        replyText = Math.random() < 0.5 ? kaomoji + ' ' + replyText : replyText + ' ' + kaomoji;
      }

      m.comments.push({
        id: createCommentId(),
        name: replierName,
        text: replyText
      });
      showMomentsNotification(replierName, partnerAvatar, 'comment', 1, m.id, replyText, getMomentPreviewImage(m));
    }

    // 自动点赞（80%概率）
    let didLike = false;
    if (Math.random() < 0.8) {
      if (isFriendLikeEnabled()) {
        // 开启好友点赞：从好友列表中完全随机选取（不限数量）
        if (momentsFriends.length === 0) await loadMomentsFriends();
        // 每个好友独立判断是否点赞（50%概率）
        momentsFriends.forEach(function(friend) {
          if (Math.random() < 0.5 && !m.likes.includes(friend.name)) {
            m.likes.push(friend.name);
          }
        });
        // 系统（伴侣）也参与点赞，并标记需要通知
        if (!m.likes.includes(replierName)) {
          m.likes.push(replierName);
        }
        didLike = true;
      } else {
        // 关闭好友点赞：只有系统（伴侣）点赞
        if (!m.likes.includes(replierName)) {
          m.likes.push(replierName);
          didLike = true;
        }
      }
    }

    // 先保存并渲染，确保 DOM 更新后再发送通知
    saveMomentsToStorage();
    renderMoments();

    // 发送点赞通知（只有系统点赞才通知）
    if (didLike) {
      showMomentsNotification(replierName, partnerAvatar, 'like', 1, m.id, '', getMomentPreviewImage(m));
    }

    // 重新渲染通知卡片（确保评论通知也能正确显示）
    renderMomentsNotificationCard();
  }

  function getPostableMomentAuthors() {
    const list = Array.isArray(momentsFriends) && momentsFriends.length ? momentsFriends.slice() : getDefaultPartnerFriend();
    return list.map(function(f) {
      return {
        id: f.id || ('friend_' + String(f.name || 'object')),
        name: f.name || getPartnerName(),
        avatar: f.avatar || (f.isPartner ? getPartnerAvatar() : ('https://api.dicebear.com/7.x/avataaars/svg?seed=' + encodeURIComponent(f.name || 'object') + '&backgroundColor=c0aede')),
        isPartner: !!f.isPartner
      };
    }).filter(function(f) { return isValidProfileValue(f.name); });
  }

  async function pickMomentPostAuthor() {
    await loadMomentsFriends();
    const authors = getPostableMomentAuthors();
    return pickRandom(authors) || getDefaultPartnerFriend()[0];
  }

  async function publishPartnerMoment(author) {
    await loadPartnerInfo();
    if (!author) author = await pickMomentPostAuthor();
    await loadMomentsFromAllStorage();
    const cfg = getPartnerPostSettings();
    const textPool = getTextPool();
    const stickers = getStickerPool();
    const voicePool = getMomentsMediaPool('voice');
    const videoPool = getMomentsMediaPool('video');
    const textCount = Math.max(0, Math.floor(randomBetween(cfg.textMin, cfg.textMax + 0.999)));
    const texts = [];
    for (let i = 0; i < textCount; i++) {
      const t = pickRandom(textPool);
      if (t) texts.push(t);
    }
    if (!texts.length && !stickers.length && !voicePool.length && !videoPool.length) {
      texts.push('今天也想分享一点小心情');
    }

    const images = [];
    const maybeSticker = pickRandom(stickers);
    let sticker = null;
    if (maybeSticker && Math.random() * 100 < cfg.imageChance) {
      if (Math.random() < 0.5) images.push(maybeSticker);
      else sticker = maybeSticker;
    }
    const voiceItem = Math.random() * 100 < cfg.voiceChance ? pickRandom(voicePool) : null;
    const videoItem = Math.random() * 100 < cfg.videoChance ? pickRandom(videoPool) : null;

    const moment = {
      id: Date.now() + Math.floor(Math.random() * 999),
      avatar: author.avatar || getPartnerAvatar(),
      nickname: author.name || getPartnerName(),
      author: author.isPartner ? 'partner' : 'friend',
      authorId: author.id || 'partner',
      time: Date.now(),
      text: texts.join('\n'),
      images,
      sticker,
      voice: voiceItem ? { url: voiceItem.url, name: voiceItem.name || '语音' } : null,
      video: videoItem ? { cover: videoItem.cover || '', url: videoItem.url, duration: videoItem.name || '视频' } : null,
      link: null,
      likes: [],
      likedByMe: false,
      collected: false,
      comments: [],
      mentions: [],
      location: ''
    };

    if (Math.random() < 0.35) {
      const selfComment = pickRandom(textPool) || '记录一下';
      moment.comments.push({ id: createCommentId(), name: author.name || getPartnerName(), text: selfComment });
    }

    momentsData.unshift(moment);
    await saveMomentsToStorage();
    await renderMoments();
    showMomentsNotification(author.name || getPartnerName(), author.avatar || getPartnerAvatar(), 'comment', 1, moment.id, '发布了新动态', getMomentPreviewImage(moment));
    scheduleNextPartnerMoment();
  }

  function scheduleNextPartnerMoment() {
    if (partnerMomentTimer) clearTimeout(partnerMomentTimer);
    const cfg = getPartnerPostSettings();
    const delay = Math.max(5, randomBetween(cfg.min, cfg.max)) * 1000;
    momentsSet('moments_partner_next_post_at', String(Date.now() + delay));
    partnerMomentTimer = setTimeout(() => publishPartnerMoment(), delay);
  }

  function startPartnerMomentScheduler() {
    if (partnerMomentTimer) clearTimeout(partnerMomentTimer);
    const next = Number(momentsGet('moments_partner_next_post_at') || 0);
    if (next && next > Date.now()) {
      partnerMomentTimer = setTimeout(() => publishPartnerMoment(), next - Date.now());
    } else if (next && next <= Date.now()) {
      partnerMomentTimer = setTimeout(() => publishPartnerMoment(), 1000);
    } else {
      scheduleNextPartnerMoment();
    }
  }

  // ========== Like ==========
  function toggleLike(momentId) {
    const m = momentsData.find(x => x.id === momentId);
    if (!m) return;
    const myName = userConfig.name;
    const idx = m.likes.indexOf(myName);
    if (idx >= 0) {
      m.likes.splice(idx, 1);
      m.likedByMe = false;
    } else {
      m.likes.push(myName);
      m.likedByMe = true;
    }
    saveMomentsToStorage();
    renderMoments();
  }

  // ========== Comment Emoji/Sticker Panel ==========
  let commentEmojiPanelOpen = false;
  let commentEmojiTab = 'emoji';
  let pendingCommentSticker = null;

  // ========== Visitor Records ==========
  const VISITOR_STORAGE_KEY = 'moments_visitor_records';
  const VISITOR_LAST_ONLINE_KEY = 'moments_visitor_last_online';
  const VISITOR_LAST_VIEWED_KEY = 'moments_visitor_last_viewed_count';
  const VISITOR_MAX_PER_DAY = 10;

  function visitorGet(key) {
    try {
      const scoped = momentsGet(key);
      if (scoped !== null && scoped !== undefined) return scoped;
      return localStorage.getItem(key);
    } catch (e) {
      try { return localStorage.getItem(key); } catch (_) { return null; }
    }
  }

  function visitorSet(key, value) {
    try { momentsSet(key, value); }
    catch (e) { try { localStorage.setItem(key, value); } catch (_) {} }
  }

  function migrateVisitorLegacyKey(key) {
    try {
      const scoped = momentsGet(key);
      const legacy = localStorage.getItem(key);
      if ((scoped === null || scoped === undefined) && legacy !== null && legacy !== undefined) {
        momentsSet(key, legacy);
      }
    } catch (e) {}
  }

  let visitorRecords = [];
  let visitorUnreadCount = 0;
  let visitorTimerInterval = null;

  function loadVisitorRecords() {
    try {
      migrateVisitorLegacyKey(VISITOR_STORAGE_KEY);
      migrateVisitorLegacyKey(VISITOR_LAST_ONLINE_KEY);
      migrateVisitorLegacyKey(VISITOR_LAST_VIEWED_KEY);
      const data = visitorGet(VISITOR_STORAGE_KEY);
      visitorRecords = data ? JSON.parse(data) : [];
      if (!Array.isArray(visitorRecords)) visitorRecords = [];
      const lastViewed = parseInt(visitorGet(VISITOR_LAST_VIEWED_KEY) || '0');
      visitorUnreadCount = Math.max(0, visitorRecords.length - lastViewed);
    } catch (e) {
      visitorRecords = [];
      visitorUnreadCount = 0;
    }
  }

  function saveVisitorRecords() {
    try {
      visitorSet(VISITOR_STORAGE_KEY, JSON.stringify(visitorRecords));
    } catch (e) { console.warn('保存访客记录失败:', e); }
  }

  function getTodayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function getRecordDateStr(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function getTodayVisitorCount() {
    const today = getTodayStr();
    return visitorRecords.filter(r => getRecordDateStr(r.timestamp) === today).length;
  }

  function generateOneVisitorRecord(timestamp) {
    const ts = timestamp || Date.now();
    visitorRecords.unshift({ id: ts.toString(36) + Math.random().toString(36).substr(2,5), timestamp: ts });
    visitorUnreadCount++;
    saveVisitorRecords();
    updateVisitorBadge();
  }

  function generateOfflineVisitors() {
    const now = Date.now();
    const lastOnline = parseInt(visitorGet(VISITOR_LAST_ONLINE_KEY)) || now;
    visitorSet(VISITOR_LAST_ONLINE_KEY, now.toString());
    if (now - lastOnline < 3600000) return;

    const lastDate = new Date(lastOnline); lastDate.setHours(0,0,0,0);
    const todayDate = new Date(now); todayDate.setHours(0,0,0,0);
    const offlineDays = Math.floor((todayDate - lastDate) / 86400000);
    if (offlineDays <= 0) return;

    for (let i = 0; i < Math.min(offlineDays, 30); i++) {
      if (Math.random() > 0.4) continue;
      const countForDay = Math.floor(Math.random() * 10) + 1;
      const dayStart = new Date(lastOnline);
      dayStart.setDate(dayStart.getDate() + i + 1);
      dayStart.setHours(0,0,0,0);
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23,59,59,999);
      for (let j = 0; j < countForDay; j++) {
        generateOneVisitorRecord(dayStart.getTime() + Math.random() * (dayEnd.getTime() - dayStart.getTime()));
      }
    }
  }

  function startOnlineVisitorTimer() {
    if (visitorTimerInterval) clearInterval(visitorTimerInterval);
    visitorSet(VISITOR_LAST_ONLINE_KEY, Date.now().toString());
    visitorTimerInterval = setInterval(() => {
      if (getTodayVisitorCount() >= VISITOR_MAX_PER_DAY) return;
      if (Math.random() < 0.20) generateOneVisitorRecord(Date.now());
      visitorSet(VISITOR_LAST_ONLINE_KEY, Date.now().toString());
    }, 5 * 60 * 1000);
  }

  function stopOnlineVisitorTimer() {
    if (visitorTimerInterval) { clearInterval(visitorTimerInterval); visitorTimerInterval = null; }
    visitorSet(VISITOR_LAST_ONLINE_KEY, Date.now().toString());
  }

  function updateVisitorBadge() {
    const badge = document.getElementById('visitorBadge');
    if (!badge) return;
    if (visitorUnreadCount > 0) {
      badge.textContent = visitorUnreadCount > 99 ? '99+' : visitorUnreadCount;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }

  function clearVisitorBadge() {
    visitorUnreadCount = 0;
    visitorSet(VISITOR_LAST_VIEWED_KEY, visitorRecords.length.toString());
    const badge = document.getElementById('visitorBadge');
    if (badge) badge.style.display = 'none';
  }

  function calcStreakDays(recordTimestamp) {
    const recordDate = new Date(recordTimestamp);
    recordDate.setHours(0,0,0,0);
    const dateSet = new Set(visitorRecords.map(r => getRecordDateStr(r.timestamp)));
    let streak = 0, checkDate = new Date(recordDate);
    while (dateSet.has(getRecordDateStr(checkDate.getTime()))) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
      if (streak >= 365) break;
    }
    return streak;
  }

  function formatDateGroup(dateStr) {
    const today = getTodayStr();
    const yesterday = (() => { const d = new Date(); d.setDate(d.getDate()-1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
    if (dateStr === today) return '今天';
    if (dateStr === yesterday) return '昨天';
    const parts = dateStr.split('-');
    return `${parseInt(parts[1])}月${parseInt(parts[2])}日`;
  }

  function openVisitorPanel() {
    const container = document.getElementById('moments-container');
    if (!container) return;
    clearVisitorBadge();
    renderVisitorList();
    container.querySelector('#visitorPanel').classList.add('active');
  }

  function closeVisitorPanel() {
    const container = document.getElementById('moments-container');
    if (container) container.querySelector('#visitorPanel').classList.remove('active');
  }

  function renderVisitorList() {
    const container = document.getElementById('moments-container');
    if (!container) return;
    const listEl = container.querySelector('#visitorList');
    const emptyEl = container.querySelector('#visitorEmpty');
    if (!listEl || !emptyEl) return;

    if (visitorRecords.length === 0) {
      listEl.innerHTML = '';
      listEl.style.display = 'none';
      emptyEl.style.display = 'block';
      return;
    }

    emptyEl.style.display = 'none';
    listEl.style.display = 'block';

    // 实时获取梦角最新头像和名字（与点赞通知同步）
    const partnerName = getPartnerName();
    const partnerAvatar = getPartnerAvatar();

    let html = '';
    let currentDate = '';
    visitorRecords.forEach((record) => {
      const dateStr = getRecordDateStr(record.timestamp);
      if (dateStr !== currentDate) {
        currentDate = dateStr;
        html += `<div class="visitor-date-group">${formatDateGroup(dateStr)}</div>`;
      }
      const streak = calcStreakDays(record.timestamp);
      const streakTag = streak >= 2 ? `<span class="visitor-streak-tag">连续来访${streak}天</span>` : '';
      const timeStr = formatMomentTime(record.timestamp);
      html += `
        <div class="visitor-item" data-visitor-id="${record.id}">
          <div class="visitor-item-inner" ontouchstart="MomentsApp._visitorTouchStart(event,'${record.id}')" ontouchmove="MomentsApp._visitorTouchMove(event,'${record.id}')" ontouchend="MomentsApp._visitorTouchEnd(event,'${record.id}')">
            <img class="visitor-avatar" src="${partnerAvatar}" alt="${partnerName}" onerror="this.src='https://api.dicebear.com/7.x/avataaars/svg?seed=partner&backgroundColor=c0aede'">
            <div class="visitor-info">
              <div class="visitor-name">${partnerName}${streakTag}</div>
              <div class="visitor-time">${timeStr}</div>
            </div>
          </div>
          <div class="visitor-delete-btn" onclick="MomentsApp.deleteVisitorRecord('${record.id}')">删除</div>
        </div>
      `;
    });
    listEl.innerHTML = html;
  }

  let _visitorTouchStartX = 0, _visitorTouchStartY = 0, _visitorSwiping = false;

  function _visitorTouchStart(e, recordId) {
    _visitorTouchStartX = e.touches[0].clientX;
    _visitorTouchStartY = e.touches[0].clientY;
    _visitorSwiping = false;
    const container = document.getElementById('moments-container');
    if (container) {
      container.querySelectorAll('.visitor-item-inner.swiped').forEach(el => el.classList.remove('swiped'));
    }
  }

  function _visitorTouchMove(e, recordId) {
    const diffX = e.touches[0].clientX - _visitorTouchStartX;
    const diffY = e.touches[0].clientY - _visitorTouchStartY;
    if (diffX < -10 && Math.abs(diffX) > Math.abs(diffY)) {
      _visitorSwiping = true;
      const item = e.target.closest('.visitor-item');
      if (item) {
        const inner = item.querySelector('.visitor-item-inner');
        if (inner) {
          inner.style.transition = 'none';
          inner.style.transform = `translateX(${Math.max(diffX, -70)}px)`;
        }
      }
    }
  }

  function _visitorTouchEnd(e, recordId) {
    if (!_visitorSwiping) return;
    const item = e.target.closest('.visitor-item');
    if (item) {
      const inner = item.querySelector('.visitor-item-inner');
      if (inner) {
        inner.style.transition = 'transform 0.3s ease';
        const currentTransform = parseFloat((inner.style.transform || '').replace('translateX(','').replace('px)','')) || 0;
        if (currentTransform < -40) { inner.classList.add('swiped'); inner.style.transform = ''; }
        else { inner.classList.remove('swiped'); inner.style.transform = ''; }
      }
    }
    _visitorSwiping = false;
  }

  function deleteVisitorRecord(recordId) {
    visitorRecords = visitorRecords.filter(r => r.id !== recordId);
    saveVisitorRecords();
    renderVisitorList();
    updateVisitorBadge();
  }

  function clearAllVisitors() {
    if (!confirm('确定要清空所有访客记录吗？')) return;
    visitorRecords = [];
    visitorUnreadCount = 0;
    saveVisitorRecords();
    visitorSet(VISITOR_LAST_VIEWED_KEY, '0');
    renderVisitorList();
    updateVisitorBadge();
  }

  // ========== Moments Notifications ==========
  let momentsNotifications = [];
  let momentsBadgeCount = 0;

  function updateMomentsBadge() {
    momentsBadgeCount++;
    // 更新 Home 页朋友圈图标小红点
    const badge = document.getElementById('moments-badge');
    if (badge) {
      badge.textContent = momentsBadgeCount;
      badge.style.display = 'flex';
    }
    // 同时更新底部栏朋友圈图标
    const bottomBadge = document.getElementById('bottom-moments-badge');
    if (bottomBadge) {
      bottomBadge.textContent = momentsBadgeCount;
      bottomBadge.style.display = 'flex';
    }
  }

  function clearMomentsBadge() {
    momentsBadgeCount = 0;
    const badge = document.getElementById('moments-badge');
    if (badge) badge.style.display = 'none';
    const bottomBadge = document.getElementById('bottom-moments-badge');
    if (bottomBadge) bottomBadge.style.display = 'none';
  }

  function getMomentPreviewImage(moment) {
    if (!moment) return '';
    if (moment.images && moment.images.length > 0) return moment.images[0];
    if (moment.sticker) return moment.sticker;
    return '';
  }

  function showMomentsNotification(name, avatar, type = 'comment', count = 1, momentId = null, content = '', previewImage = '') {
    // 添加到通知列表
    momentsNotifications.push({
      name,
      avatar,
      type,
      count,
      time: Date.now(),
      momentId,
      content,
      previewImage
    });

    // 更新小红点
    updateMomentsBadge();

    // 尝试渲染通知卡片（如果朋友圈页面可见）
    const container = document.getElementById('moments-container');
    if (container && container.style.display !== 'none') {
      renderMomentsNotificationCard();
    }
  }

  function renderMomentsNotificationCard() {
    try {
      const container = document.getElementById('moments-container');
      if (!container) return;

      // 累加所有通知的条数
      const totalCount = momentsNotifications.reduce((sum, n) => sum + (n.count || 1), 0);
      const latest = momentsNotifications[momentsNotifications.length - 1];
      if (!latest) return;

      // 找到最新一条朋友圈卡片，将通知渲染到其内部
      const firstCard = container.querySelector('.moment-card');
      if (!firstCard) return;
      const momentId = firstCard.dataset.momentId;
      const notificationWrapper = firstCard.querySelector('.moment-notification');
      const notificationInner = firstCard.querySelector('.moment-notification-inner');
      if (!notificationWrapper || !notificationInner) return;

      const avatar = notificationInner.querySelector('.notification-avatar');
      const text = notificationInner.querySelector('.notification-text');
      if (avatar) {
        // 实时获取系统（伴侣）最新头像，确保跟随 Home 页更新
        var displayAvatar = latest.avatar || '';
        var displayName = latest.name || '';
        // 如果是最新一条系统通知，使用缓存的最新值
        if (latest.name === getPartnerName() || (friendList.length > 0 && latest.name === friendList[0].name)) {
          displayAvatar = getPartnerAvatar();
          displayName = getPartnerName();
        }
        avatar.src = displayAvatar;
        avatar.alt = displayName;
      }
      if (text) text.textContent = totalCount + '条新消息';

      notificationInner.onclick = () => {
        openNotificationDetailPanel();
      };

      notificationWrapper.style.display = 'block';
      notificationInner.classList.add('active');

      // 同时隐藏封面下方的旧通知（如果存在）
      const oldWrapper = container.querySelector('#momentsNotificationWrapper');
      if (oldWrapper) oldWrapper.style.display = 'none';
    } catch (e) {
      console.error('renderMomentsNotificationCard error:', e);
    }
  }

  function hideMomentsNotificationCard() {
    const container = document.getElementById('moments-container');
    if (!container) return;
    
    // 隐藏封面下方的旧通知
    const wrapper = container.querySelector('#momentsNotificationWrapper');
    const card = container.querySelector('#momentsNotificationCard');
    if (wrapper) wrapper.style.display = 'none';
    if (card) card.classList.remove('active');
    
    // 隐藏最新卡片内的通知
    const firstCard = container.querySelector('.moment-card');
    if (firstCard) {
      const notificationWrapper = firstCard.querySelector('.moment-notification');
      const notificationInner = firstCard.querySelector('.moment-notification-inner');
      if (notificationWrapper) notificationWrapper.style.display = 'none';
      if (notificationInner) notificationInner.classList.remove('active');
    }
  }

  function scrollToFirstNotifiedMoment() {
    // 清除通知状态
    momentsNotifications = [];
    hideMomentsNotificationCard();
  }

  // ========== Notification Detail Panel ==========
  function openNotificationDetailPanel() {
    const container = document.getElementById('moments-container');
    if (!container) return;
    const panel = container.querySelector('#notificationDetailPanel');
    if (panel) {
      renderNotificationDetailList();
      panel.classList.add('active');
    }
  }

  function closeNotificationDetailPanel() {
    const container = document.getElementById('moments-container');
    if (!container) return;
    const panel = container.querySelector('#notificationDetailPanel');
    if (panel) {
      panel.classList.remove('active');
    }
    // 关闭面板后清空通知
    momentsNotifications = [];
    hideMomentsNotificationCard();
    clearMomentsBadge();
  }

  function renderNotificationDetailList() {
    const container = document.getElementById('moments-container');
    if (!container) return;
    const body = container.querySelector('#notificationDetailBody');
    if (!body) return;

    if (momentsNotifications.length === 0) {
      body.innerHTML = '<div class="notification-detail-empty">暂无消息</div>';
      return;
    }

    const sorted = [...momentsNotifications].sort((a, b) => b.time - a.time);

    const html = sorted.map(n => {
      const timeStr = formatMomentTime(n.time);
      const isLike = n.type === 'like';

      // 实时获取系统（伴侣）最新头像和昵称
      var displayAvatar = n.avatar || '';
      var displayName = n.name || '';
      if (n.name === getPartnerName() || (friendList.length > 0 && n.name === friendList[0].name)) {
        displayAvatar = getPartnerAvatar();
        displayName = getPartnerName();
      }

      let previewHtml = '';
      // 始终从朋友圈数据中获取预览
      var moment = momentsData.find(function(m) { return m.id === n.momentId; });
      if (n.previewImage) {
        previewHtml = '<img class="detail-preview" src="' + n.previewImage + '" alt="">';
      } else if (moment) {
        if (moment.images && moment.images.length > 0) {
          previewHtml = '<img class="detail-preview" src="' + moment.images[0] + '" alt="">';
        } else if (moment.text) {
          var t = moment.text.length > 8 ? moment.text.substring(0, 8) + '...' : moment.text;
          previewHtml = '<div class="detail-preview-text">' + t + '</div>';
        }
      }

      const actionHtml = isLike
        ? '<div class="detail-action"><svg class="heart-icon" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg></div>'
        : '<div class="detail-action-text">' + (n.content || '') + '</div>';

      return '<div class="notification-detail-item" data-moment-id="' + (n.momentId || '') + '">'
        + '<img class="detail-avatar" src="' + displayAvatar + '" alt="' + displayName + '">'
        + '<div class="detail-content">'
        + '<div class="detail-name">' + displayName + '</div>'
        + actionHtml
        + '<div class="detail-time">' + timeStr + '</div>'
        + '</div>'
        + previewHtml
        + '</div>';
    }).join('');

    body.innerHTML = html;

    body.querySelectorAll('.notification-detail-item').forEach(function(item) {
      item.addEventListener('click', function(e) {
        e.stopPropagation();
        var mid = this.getAttribute('data-moment-id');
        if (mid) {
          handleNotificationItemClick(mid);
        }
      });
    });
  }

  function clearAllNotifications() {
    momentsNotifications = [];
    hideMomentsNotificationCard();
    clearMomentsBadge();
    renderNotificationDetailList();
  }

  function handleNotificationItemClick(momentId) {
    if (!momentId) return;
    closeNotificationDetailPanel();
    setTimeout(function() {
      var card = document.querySelector('.moment-card[data-moment-id="' + momentId + '"]');
      if (!card) {
        card = document.querySelector('.moment-card[data-moment-id="' + Number(momentId) + '"]');
      }
      if (card) {
        // 使用 scrollIntoView 滚动到卡片位置
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // 高亮闪烁效果
        card.style.transition = 'background 0.3s ease';
        card.style.background = 'rgba(87, 107, 149, 0.15)';
        setTimeout(function() { card.style.background = ''; }, 1500);
      }
    }, 100);
  }

  function toggleCommentEmojiPanel() {
    const container = document.getElementById('moments-container');
    if (!container) return;
    
    const panel = container.querySelector('#commentEmojiPanel');
    const toggleBtn = container.querySelector('.emoji-toggle-btn');
    
    commentEmojiPanelOpen = !commentEmojiPanelOpen;
    if (commentEmojiPanelOpen) {
      panel.classList.add('active');
      toggleBtn.classList.add('active');
      renderCommentEmojiContent();
      // 内联评论框已经跟随动态卡片，不再用 fixed bottom 顶键盘，避免 iOS 输入时上方出现大白块。
      requestAnimationFrame(() => {
        const popup = container.querySelector('#commentPopup');
        if (popup && !popup.classList.contains('comment-inline')) {
          popup.style.bottom = panel.offsetHeight + 'px';
        }
      });
    } else {
      panel.classList.remove('active');
      toggleBtn.classList.remove('active');
      const popup = container.querySelector('#commentPopup');
      if (popup && !popup.classList.contains('comment-inline')) popup.style.bottom = '0';
    }
  }

  function closeCommentEmojiPanel() {
    commentEmojiPanelOpen = false;
    const container = document.getElementById('moments-container');
    if (container) {
      container.querySelector('#commentEmojiPanel').classList.remove('active');
      const toggleBtn = container.querySelector('.emoji-toggle-btn');
      if (toggleBtn) toggleBtn.classList.remove('active');
      const popup = container.querySelector('#commentPopup');
      if (popup && !popup.classList.contains('comment-inline')) popup.style.bottom = '0';
    }
  }

  function switchCommentEmojiTab(tab) {
    commentEmojiTab = tab;
    const container = document.getElementById('moments-container');
    if (!container) return;
    
    container.querySelectorAll('.emoji-tab').forEach(t => t.classList.remove('active'));
    container.querySelector(`.emoji-tab[data-tab="${tab}"]`).classList.add('active');
    
    renderCommentEmojiContent();
  }

  function renderCommentEmojiContent() {
    const container = document.getElementById('moments-container');
    if (!container) return;
    
    const body = container.querySelector('#commentEmojiBody');
    let items = [];

    if (commentEmojiTab === 'emoji') {
      body.classList.remove('sticker-mode');
      const customEmojis = (window._customEmojis || []).filter(Boolean);
      if (customEmojis.length === 0) {
        body.innerHTML = '<div class="comment-emoji-empty">暂无自定义表情，请在聊天设置中添加</div>';
        return;
      }
      items = customEmojis.map(e => `<div class="comment-emoji-item" onclick="MomentsApp.insertCommentEmoji('${e.replace(/'/g, "\\'")}')">${e}</div>`);
    } else if (commentEmojiTab === 'kaomoji') {
      body.classList.remove('sticker-mode');
      const kaomojiLibrary = (window._kaomojiLibrary || []).filter(Boolean);
      if (kaomojiLibrary.length === 0) {
        body.innerHTML = '<div class="comment-emoji-empty">暂无颜文字，请在字卡库中添加</div>';
        return;
      }
      items = kaomojiLibrary.map(k => `<div class="comment-emoji-item" onclick="MomentsApp.insertCommentEmoji('${k.replace(/'/g, "\\'")}')">${k}</div>`);
    } else if (commentEmojiTab === 'sticker') {
      body.classList.add('sticker-mode');
      // 从 window._stickerLibrary 读取，如果不存在则尝试全局 stickerLibrary
      let _stickerLib = [];
      if (typeof window !== 'undefined' && window._stickerLibrary && Array.isArray(window._stickerLibrary)) {
        _stickerLib = window._stickerLibrary;
      } else if (typeof stickerLibrary !== 'undefined' && Array.isArray(stickerLibrary)) {
        _stickerLib = stickerLibrary;
      }
      const stickerLibraryFiltered = _stickerLib.filter(Boolean);
      console.log('[Moments] stickerLibrary count:', stickerLibraryFiltered.length, 'raw:', window._stickerLibrary);
      if (stickerLibraryFiltered.length === 0) {
        body.innerHTML = '<div class="comment-emoji-empty">暂无表情包，请在表情包管理中添加</div>';
        return;
      }
      items = stickerLibraryFiltered.map((src, i) => `<div class="comment-emoji-item sticker-item" onclick="MomentsApp.selectCommentSticker(${i})"><img src="${escapeAttr(src)}" alt="表情包"></div>`);
    }

    body.innerHTML = items.join('');
  }

  function insertCommentEmoji(emoji) {
    const container = document.getElementById('moments-container');
    if (!container) return;
    
    const input = container.querySelector('#commentInput');
    if (input) {
      const start = input.selectionStart;
      const end = input.selectionEnd;
      const val = input.value;
      input.value = val.substring(0, start) + emoji + val.substring(end);
      input.focus();
      input.setSelectionRange(start + emoji.length, start + emoji.length);
    }
  }

  function selectCommentSticker(index) {
    let _stickerLib = [];
    if (typeof window !== 'undefined' && window._stickerLibrary && Array.isArray(window._stickerLibrary)) {
      _stickerLib = window._stickerLibrary;
    } else if (typeof stickerLibrary !== 'undefined' && Array.isArray(stickerLibrary)) {
      _stickerLib = stickerLibrary;
    }
    const stickerLibraryFiltered = _stickerLib.filter(Boolean);
    if (index >= 0 && index < stickerLibraryFiltered.length) {
      pendingCommentSticker = stickerLibraryFiltered[index];
      // 显示预览
      showCommentStickerPreview(pendingCommentSticker);
      // 关闭表情面板，用户可以继续输入文字后一起发送
      closeCommentEmojiPanel();
    }
  }

  function showCommentStickerPreview(stickerUrl) {
    const container = document.getElementById('moments-container');
    if (!container) return;
    const preview = container.querySelector('#commentStickerPreview');
    if (preview) {
      preview.querySelector('img').src = stickerUrl;
      preview.classList.add('active');
      preview.style.display = 'flex';
    }
  }

  function removePendingCommentSticker() {
    pendingCommentSticker = null;
    const container = document.getElementById('moments-container');
    if (!container) return;
    const preview = container.querySelector('#commentStickerPreview');
    if (preview) {
      preview.classList.remove('active');
      preview.style.display = 'none';
      preview.querySelector('img').src = '';
    }
  }

  // ========== Inline Comment Controls ==========
  function restoreInlineCommentControls() {
    const container = document.getElementById('moments-container');
    if (!container) return;
    const popup = document.getElementById('commentPopup');
    const emojiPanel = document.getElementById('commentEmojiPanel');
    if (popup && popup.parentElement !== container) container.appendChild(popup);
    if (emojiPanel && emojiPanel.parentElement !== container) container.appendChild(emojiPanel);
    if (popup) {
      popup.classList.remove('comment-inline');
      popup.style.bottom = '';
    }
    if (emojiPanel) {
      emojiPanel.classList.remove('comment-inline');
      emojiPanel.style.bottom = '';
    }
  }

  function attachInlineCommentControls(momentId) {
    const container = document.getElementById('moments-container');
    if (!container) return null;
    const popup = document.getElementById('commentPopup');
    const emojiPanel = document.getElementById('commentEmojiPanel');
    const host = container.querySelector(`[data-comment-host="${momentId}"]`);
    if (!popup || !emojiPanel || !host) return null;

    popup.classList.add('comment-inline');
    emojiPanel.classList.add('comment-inline');
    popup.style.bottom = '';
    emojiPanel.style.bottom = '';
    host.appendChild(popup);
    host.appendChild(emojiPanel);
    return { popup, emojiPanel, host };
  }

  function focusInlineCommentInput(input, host) {
    if (!input) return;
    requestAnimationFrame(() => {
      if (host && typeof host.scrollIntoView === 'function') {
        host.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      setTimeout(() => {
        try {
          input.focus({ preventScroll: true });
        } catch (e) {
          input.focus();
        }
      }, 80);
    });
  }

  // ========== Comment Toggle ==========
  let currentCommentMomentId = null;
  let replyToName = null;

  function toggleComment(momentId) {
    const container = document.getElementById('moments-container');
    if (!container) return;
    
    const popup = container.querySelector('#commentPopup');
    if (popup && currentCommentMomentId === momentId && popup.classList.contains('active')) {
      closeAllPanels();
    } else {
      openComment(momentId);
    }
  }

  function openComment(momentId) {
    currentCommentMomentId = momentId;
    replyToName = null;
    pendingCommentSticker = null;
    commentEmojiPanelOpen = false;
    
    const container = document.getElementById('moments-container');
    if (!container) return;
    const mounted = attachInlineCommentControls(momentId);
    if (!mounted) return;
    const { popup, emojiPanel, host } = mounted;
    const input = popup.querySelector('#commentInput');
    
    popup.classList.add('active');
    input.value = '';
    input.placeholder = '写评论...';
    
    // 隐藏表情包预览
    const stickerPreview = popup.querySelector('#commentStickerPreview');
    if (stickerPreview) {
      stickerPreview.classList.remove('active');
      stickerPreview.style.display = 'none';
      const img = stickerPreview.querySelector('img');
      if (img) img.src = '';
    }
    // 关闭表情面板
    emojiPanel.classList.remove('active');
    const toggleBtn = popup.querySelector('.emoji-toggle-btn');
    if (toggleBtn) toggleBtn.classList.remove('active');
    focusInlineCommentInput(input, host);
  }

  function replyToComment(momentId, commentRef, name) {
    const m = momentsData.find(x => Number(x.id) === Number(momentId));
    if (m) normalizeMomentComments(m);
    let targetName = name || '';
    if (m && !targetName) {
      let targetComment = findCommentById(m, commentRef);
      if (!targetComment && Number.isInteger(Number(commentRef))) {
        targetComment = m.comments[Number(commentRef)];
      }
      targetName = targetComment && targetComment.name ? targetComment.name : '';
    }
    if (!targetName) targetName = 'TA';

    currentCommentMomentId = Number(momentId);
    replyToName = targetName;
    pendingCommentSticker = null;
    commentEmojiPanelOpen = false;
    closeCommentActionMenus();
    
    const container = document.getElementById('moments-container');
    if (!container) return;
    const mounted = attachInlineCommentControls(momentId);
    if (!mounted) return;
    const { popup, emojiPanel, host } = mounted;
    const input = popup.querySelector('#commentInput');
    popup.classList.add('active');
    emojiPanel.classList.remove('active');
    input.value = '';
    input.placeholder = `回复 ${targetName}：`;
    focusInlineCommentInput(input, host);
  }

  function submitComment() {
    const container = document.getElementById('moments-container');
    if (!container) return;
    
    const input = container.querySelector('#commentInput');
    const text = input.value.trim();
    
    // 支持发送表情包
    if (!text && !pendingCommentSticker) return;
    if (!currentCommentMomentId) return;

    const m = momentsData.find(x => x.id === currentCommentMomentId);
    if (m) {
      // 支持文字+表情包同时发送
      const userComment = {
        id: createCommentId(),
        name: userConfig.name,
        text: text,
        sticker: pendingCommentSticker || undefined,
        replyTo: replyToName || undefined,
        time: Date.now()
      };
      m.comments.push(userComment);
      const submittedMomentId = currentCommentMomentId;
      pendingCommentSticker = null;
      saveMomentsToStorage();
      closeCommentEmojiPanel();
      closeAllPanels();
      restoreInlineCommentControls();
      renderMoments();
      scheduleAutoReplyToUserComment(submittedMomentId, userComment);
      return;
    }
    closeCommentEmojiPanel();
    closeAllPanels();
    restoreInlineCommentControls();
  }

  // ========== Search ==========
  function openSearchPanel() {
    const container = document.getElementById('moments-container');
    if (!container) return;
    
    container.querySelector('#searchPanel').classList.add('active');
    container.querySelector('#searchInput').value = '';
    container.querySelector('#searchClear').classList.remove('active');
    container.querySelector('#searchBody').innerHTML = '<div class="search-empty">输入关键词搜索朋友圈内容</div>';
    container.querySelector('#searchInput').focus();
  }

  function closeSearchPanel() {
    const container = document.getElementById('moments-container');
    if (container) {
      container.querySelector('#searchPanel').classList.remove('active');
    }
  }

  // 快捷时间按钮
  function setQuickTime(range) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let fromDate;

    switch (range) {
      case 'today':
        fromDate = today;
        break;
      case 'week':
        fromDate = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        fromDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'year':
        fromDate = new Date(today.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
    }

    const container = document.getElementById('moments-container');
    if (container) {
      container.querySelector('#searchDateFrom').value = formatDateValue(fromDate);
      container.querySelector('#searchDateTo').value = formatDateValue(now);
    }
    handleTimeFilterChange();
  }

  function clearTimeFilter() {
    const container = document.getElementById('moments-container');
    if (container) {
      container.querySelector('#searchDateFrom').value = '';
      container.querySelector('#searchDateTo').value = '';
    }
    handleTimeFilterChange();
  }

  function formatDateValue(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // 时间筛选变化时：先显示该时间段内所有朋友圈
  function handleTimeFilterChange() {
    const container = document.getElementById('moments-container');
    if (!container) return;
    
    const keyword = container.querySelector('#searchInput').value.trim();
    performSearch(keyword);
  }

  // 输入搜索词时：从已有结果中筛选
  function handleSearchInput() {
    const container = document.getElementById('moments-container');
    if (!container) return;
    
    const keyword = container.querySelector('#searchInput').value.trim();
    const clearBtn = container.querySelector('#searchClear');

    if (keyword) {
      clearBtn.classList.add('active');
    } else {
      clearBtn.classList.remove('active');
    }

    performSearch(keyword);
  }

  function performSearch(keyword) {
    const container = document.getElementById('moments-container');
    if (!container) return;
    
    const body = container.querySelector('#searchBody');
    const dateFrom = container.querySelector('#searchDateFrom').value;
    const dateTo = container.querySelector('#searchDateTo').value;

    // 第一步：按时间筛选
    let timeFiltered = momentsData;
    if (dateFrom || dateTo) {
      timeFiltered = momentsData.filter(m => {
        let momentDate = parseTimeString(m.time);
        if (!momentDate) return true;
        if (dateFrom) {
          const from = new Date(dateFrom + 'T00:00:00');
          if (momentDate < from) return false;
        }
        if (dateTo) {
          const to = new Date(dateTo + 'T23:59:59');
          if (momentDate > to) return false;
        }
        return true;
      });
    }

    // 如果没有关键词，直接显示时间筛选结果
    if (!keyword) {
      if (timeFiltered.length === 0) {
        body.innerHTML = '<div class="search-empty">该时间段内没有朋友圈</div>';
        return;
      }
      body.innerHTML = timeFiltered.map(m => renderSearchResultItem(m, '')).join('');
      return;
    }

    // 第二步：从时间筛选结果中按关键词过滤
    const results = timeFiltered.filter(m => {
      const textMatch = m.text.toLowerCase().includes(keyword.toLowerCase());
      const nameMatch = m.nickname.toLowerCase().includes(keyword.toLowerCase());
      const commentMatch = m.comments.some(c =>
        c.text.toLowerCase().includes(keyword.toLowerCase()) ||
        c.name.toLowerCase().includes(keyword.toLowerCase())
      );
      return textMatch || nameMatch || commentMatch;
    });

    if (results.length === 0) {
      body.innerHTML = '<div class="search-empty">没有找到相关内容</div>';
      return;
    }

    body.innerHTML = results.map(m => renderSearchResultItem(m, keyword)).join('');
  }

  function renderSearchResultItem(m, keyword) {
    const text = keyword ? highlightKeyword(m.text, keyword) : m.text;
    const name = keyword ? highlightKeyword(m.nickname, keyword) : m.nickname;
    return `
      <div class="search-result-item" onclick="MomentsApp.scrollToMoment(${m.id})">
        <div class="moment-header">
          <img class="moment-avatar" src="${displayAvatar}" alt="${displayNickname}">
          <div class="moment-meta">
            <div class="moment-nickname">${name}</div>
            <div class="moment-time">${formatMomentTime(m.time)}</div>
          </div>
        </div>
        <div class="moment-content" style="padding-left:52px;margin-bottom:0">
          <div class="moment-text">${text}</div>
        </div>
      </div>
    `;
  }

  function highlightKeyword(text, keyword) {
    if (!keyword) return text;
    const regex = new RegExp(keyword, 'gi');
    return text.replace(regex, match => `<span class="search-highlight">${match}</span>`);
  }

  // 解析时间字符串为日期对象
  function parseTimeString(timeStr) {
    const now = new Date();

    // 处理 "X小时前"、"X分钟前"
    const hourMatch = timeStr.match(/(\d+)小时前/);
    if (hourMatch) {
      const hours = parseInt(hourMatch[1]);
      return new Date(now.getTime() - hours * 60 * 60 * 1000);
    }

    const minMatch = timeStr.match(/(\d+)分钟前/);
    if (minMatch) {
      const mins = parseInt(minMatch[1]);
      return new Date(now.getTime() - mins * 60 * 1000);
    }

    // 处理 "昨天"
    if (timeStr === '昨天') {
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      return yesterday;
    }

    // 处理 "X天前"
    const dayMatch = timeStr.match(/(\d+)天前/);
    if (dayMatch) {
      const days = parseInt(dayMatch[1]);
      return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    }

    // 处理 "X月X日"
    const monthDayMatch = timeStr.match(/(\d+)月(\d+)日/);
    if (monthDayMatch) {
      const month = parseInt(monthDayMatch[1]) - 1;
      const day = parseInt(monthDayMatch[2]);
      return new Date(now.getFullYear(), month, day);
    }

    // 处理完整日期 "2024-01-15" 或 "2024/01/15"
    const fullDateMatch = timeStr.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (fullDateMatch) {
      const year = parseInt(fullDateMatch[1]);
      const month = parseInt(fullDateMatch[2]) - 1;
      const day = parseInt(fullDateMatch[3]);
      return new Date(year, month, day);
    }

    return null;
  }

  function clearSearchInput() {
    const container = document.getElementById('moments-container');
    if (!container) return;
    
    container.querySelector('#searchInput').value = '';
    container.querySelector('#searchDateFrom').value = '';
    container.querySelector('#searchDateTo').value = '';
    container.querySelector('#searchClear').classList.remove('active');
    container.querySelector('#searchBody').innerHTML = '<div class="search-empty">输入关键词搜索朋友圈内容</div>';
    container.querySelector('#searchInput').focus();
  }

  function scrollToMoment(momentId) {
    closeSearchPanel();
    
    const container = document.getElementById('moments-container');
    if (!container) return;
    
    const cards = container.querySelectorAll('.moment-card');
    const idx = momentsData.findIndex(m => m.id === momentId);
    if (idx >= 0 && cards[idx]) {
      cards[idx].scrollIntoView({ behavior: 'smooth', block: 'center' });
      cards[idx].style.background = '#fffbe6';
      setTimeout(() => {
        cards[idx].style.background = '#fff';
      }, 1500);
    }
  }

  // ========== Album Panel ==========
  let albumExpanded = false;

  function openAlbumPanel() {
    const container = document.getElementById('moments-container');
    if (!container) return;
    
    container.querySelector('#albumPanel').classList.add('active');
    albumExpanded = false;
    container.querySelector('#albumExpandBtn').classList.remove('active');
    container.querySelector('#albumDateFrom').value = '';
    container.querySelector('#albumDateTo').value = '';
    renderAlbum();
  }

  function closeAlbumPanel() {
    const container = document.getElementById('moments-container');
    if (container) {
      container.querySelector('#albumPanel').classList.remove('active');
    }
  }

  function toggleAlbumExpand() {
    albumExpanded = !albumExpanded;
    const container = document.getElementById('moments-container');
    if (container) {
      container.querySelector('#albumExpandBtn').classList.toggle('active', albumExpanded);
    }
    renderAlbum();
  }

  function setAlbumQuickTime(range) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let fromDate;
    switch (range) {
      case 'week': fromDate = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000); break;
      case 'month': fromDate = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000); break;
      case 'year': fromDate = new Date(today.getTime() - 365 * 24 * 60 * 60 * 1000); break;
    }
    const y = fromDate.getFullYear();
    const mo = String(fromDate.getMonth() + 1).padStart(2, '0');
    const d = String(fromDate.getDate()).padStart(2, '0');
    
    const container = document.getElementById('moments-container');
    if (container) {
      container.querySelector('#albumDateFrom').value = `${y}-${mo}-${d}`;
      const yn = now.getFullYear();
      const mon = String(now.getMonth() + 1).padStart(2, '0');
      const dn = String(now.getDate()).padStart(2, '0');
      container.querySelector('#albumDateTo').value = `${yn}-${mon}-${dn}`;
    }
    renderAlbum();
  }

  function clearAlbumTimeFilter() {
    const container = document.getElementById('moments-container');
    if (container) {
      container.querySelector('#albumDateFrom').value = '';
      container.querySelector('#albumDateTo').value = '';
    }
    renderAlbum();
  }

  // ========== Collection Panel ==========
  function openCollectionPanel() {
    const container = document.getElementById('moments-container');
    if (!container) return;
    
    container.querySelector('#collectionPanel').classList.add('active');
    renderCollection();
  }

  function closeCollectionPanel() {
    const container = document.getElementById('moments-container');
    if (container) {
      container.querySelector('#collectionPanel').classList.remove('active');
    }
  }

  function renderCollection() {
    const container = document.getElementById('moments-container');
    if (!container) return;
    
    const body = container.querySelector('#collectionBody');
    const collected = momentsData.filter(m => m.collected);

    if (collected.length === 0) {
      body.innerHTML = '<div class="collection-empty">暂无收藏</div>';
      return;
    }

    body.innerHTML = collected.map(m => {
      const imagesHtml = m.images.length > 0 ? `
        <div class="moment-images">
          ${m.images.map((img, idx) => `<img src="${img}" alt="图片" onclick="MomentsApp.openPreview(${m.id}, ${idx}); MomentsApp.closeCollectionPanel();">`).join('')}
        </div>
      ` : '';
      const locationHtml = m.location ? `<div class="moment-location">📍 ${m.location}</div>` : '';
      const mentionsHtml = m.mentions && m.mentions.length > 0 ? `<div class="moment-mentions">提到了：${m.mentions.join('、')}</div>` : '';

      return `
        <div class="collection-item">
          <div class="moment-header">
            <img class="moment-avatar" src="${displayAvatar}" alt="${displayNickname}">
            <div class="moment-meta">
              <div class="moment-nickname">${displayNickname}</div>
              <div class="moment-time">${formatMomentTime(m.time)}</div>
            </div>
          </div>
          <div class="moment-text">${m.text}</div>
          ${imagesHtml}
          ${locationHtml}
          ${mentionsHtml}
        </div>
      `;
    }).join('');
  }

  function renderAlbum() {
    const container = document.getElementById('moments-container');
    if (!container) return;
    
    const body = container.querySelector('#albumBody');
    const dateFrom = container.querySelector('#albumDateFrom').value;
    const dateTo = container.querySelector('#albumDateTo').value;

    // 按时间筛选朋友圈
    let filtered = momentsData;
    if (dateFrom || dateTo) {
      filtered = momentsData.filter(m => {
        let momentDate = parseTimeString(m.time);
        if (!momentDate) return true;
        if (dateFrom) {
          const from = new Date(dateFrom + 'T00:00:00');
          if (momentDate < from) return false;
        }
        if (dateTo) {
          const to = new Date(dateTo + 'T23:59:59');
          if (momentDate > to) return false;
        }
        return true;
      });
    }

    // 收集图片
    const allImages = [];
    filtered.forEach(m => {
      m.images.forEach((img, idx) => {
        allImages.push({ src: img, momentId: m.id, index: idx, nickname: m.nickname, time: m.time, date: parseTimeString(m.time) });
      });
    });

    if (allImages.length === 0) {
      body.innerHTML = '<div class="album-empty">暂无照片</div>';
      return;
    }

    // 全部展开模式：网格排列所有图片
    if (albumExpanded) {
      body.innerHTML = `
        <div class="album-grid">
          ${allImages.map(img => `
            <div class="album-item" onclick="MomentsApp.openPreview(${img.momentId}, ${img.index}); MomentsApp.closeAlbumPanel();">
              <img src="${img.src}" alt="照片">
            </div>
          `).join('')}
        </div>
      `;
      return;
    }

    // 时间轴模式：按日期分组
    const groups = {};
    allImages.forEach(img => {
      let dateKey;
      if (img.date) {
        const y = img.date.getFullYear();
        const mo = String(img.date.getMonth() + 1).padStart(2, '0');
        const d = String(img.date.getDate()).padStart(2, '0');
        dateKey = `${y}-${mo}-${d}`;
      } else {
        dateKey = '未知日期';
      }
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(img);
    });

    // 按日期降序排列
    const sortedKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));

    body.innerHTML = `<div class="album-timeline">
      ${sortedKeys.map(dateKey => {
        const items = groups[dateKey];
        // 按朋友圈分组显示
        const momentGroups = {};
        items.forEach(img => {
          const key = `${img.momentId}`;
          if (!momentGroups[key]) momentGroups[key] = { nickname: img.nickname, time: img.time, images: [] };
          momentGroups[key].images.push(img);
        });

        return `
          <div class="album-timeline-group">
            <div class="album-timeline-date">${dateKey}</div>
            ${Object.values(momentGroups).map(mg => `
              <div class="album-timeline-moment">
                <div class="album-timeline-moment-info">
                  <span class="tl-nickname">${mg.nickname}</span> · ${mg.time}
                </div>
                <div class="album-timeline-grid">
                  ${mg.images.map(img => `
                    <div class="album-item" onclick="MomentsApp.openPreview(${img.momentId}, ${img.index}); MomentsApp.closeAlbumPanel();">
                      <img src="${img.src}" alt="照片">
                    </div>
                  `).join('')}
                </div>
              </div>
            `).join('')}
          </div>
        `;
      }).join('')}
    </div>`;
  }

  // ========== Mention Panel ==========
  function openMentionPanel() {
    const container = document.getElementById('moments-container');
    if (!container) return;
    
    container.querySelector('#mentionPanel').classList.add('active');
    renderMentionList();
  }

  function closeMentionPanel() {
    const container = document.getElementById('moments-container');
    if (container) {
      container.querySelector('#mentionPanel').classList.remove('active');
    }
    window.mentionPanelCallback = null;
  }

  function renderMentionList() {
    const container = document.getElementById('moments-container');
    if (!container) return;
    
    const list = container.querySelector('#mentionList');
    const search = container.querySelector('#mentionSearch').value.toLowerCase();
    
    const filtered = friendList.filter(f => f.name.toLowerCase().includes(search));
    
    list.innerHTML = filtered.map(f => `
      <div class="mention-item ${tempMentions.includes(f.name) ? 'selected' : ''}" onclick="MomentsApp.toggleMention('${f.name}')">
        <img src="${f.avatar}" alt="${f.name}">
        <span>${f.name}</span>
      </div>
    `).join('');
  }

  function filterMentions() {
    renderMentionList();
  }

  function toggleMention(name) {
    const idx = tempMentions.indexOf(name);
    if (idx >= 0) {
      tempMentions.splice(idx, 1);
    } else {
      tempMentions.push(name);
    }
    renderMentionList();
    updateMentionsDisplay();
  }

  function confirmMentions() {
    if (window.mentionPanelCallback) {
      window.mentionPanelCallback([...tempMentions]);
      window.mentionPanelCallback = null;
    } else {
      updateMentionsDisplay();
      savePublishDraft();
    }
    closeMentionPanel();
  }

  function updateMentionsDisplay() {
    const container = document.getElementById('moments-container');
    if (!container) return;
    
    const display = container.querySelector('#publishMentionsDisplay');
    const text = container.querySelector('#mentionsText');
    
    if (tempMentions.length > 0) {
      display.style.display = 'flex';
      text.textContent = `提到了：${tempMentions.join('、')}`;
    } else {
      display.style.display = 'none';
    }
  }

  // ========== Location Panel ==========
  function openLocationPanel() {
    const container = document.getElementById('moments-container');
    if (!container) return;
    
    container.querySelector('#locationPanel').classList.add('active');
    container.querySelector('#locationInput').value = tempLocation;
  }

  function closeLocationPanel() {
    const container = document.getElementById('moments-container');
    if (container) {
      container.querySelector('#locationPanel').classList.remove('active');
    }
    window.locationPanelCallback = null;
  }

  function confirmLocation() {
    const container = document.getElementById('moments-container');
    if (!container) return;
    
    const loc = container.querySelector('#locationInput').value.trim();

    if (window.locationPanelCallback) {
      window.locationPanelCallback(loc);
      window.locationPanelCallback = null;
    } else {
      tempLocation = loc;
      const display = container.querySelector('#locationText');

      if (tempLocation) {
        display.textContent = tempLocation;
        display.style.color = '#576b95';
      } else {
        display.textContent = '所在位置';
        display.style.color = '#576b95';
      }
    }

    savePublishDraft();
    closeLocationPanel();
  }

  // ========== Publish ==========
  let publishPhotoCount = 0;
  let publishPhotoBase64List = [];
  let publishVideo = null;
  let publishSticker = null;
  let publishLink = null;
  const PUBLISH_DRAFT_KEY = 'moments_publish_draft';

  function getPublishTextValue() {
    const container = document.getElementById('moments-container');
    const input = container ? container.querySelector('#publishText') : null;
    return input ? input.value : '';
  }

  function savePublishDraft() {
    try {
      const draft = {
        text: getPublishTextValue(),
        images: [...publishPhotoBase64List],
        video: publishVideo ? { cover: publishVideo.cover, url: publishVideo.url, duration: publishVideo.duration } : null,
        sticker: publishSticker || null,
        link: publishLink ? { ...publishLink } : null,
        mentions: [...tempMentions],
        location: tempLocation || ''
      };
      localStorage.setItem(PUBLISH_DRAFT_KEY, JSON.stringify(draft));
    } catch(e) {
      console.warn('保存朋友圈发布草稿失败:', e);
    }
  }

  function clearPublishDraft() {
    try { localStorage.removeItem(PUBLISH_DRAFT_KEY); } catch(e) {}
  }

  function getPublishDraft() {
    try {
      const saved = localStorage.getItem(PUBLISH_DRAFT_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch(e) {
      return null;
    }
  }

  function resetPublishForm(container) {
    container.querySelector('#publishText').value = '';
    container.querySelector('#mentionsText').textContent = '提醒谁看';
    container.querySelector('#publishMentionsDisplay').style.display = 'none';
    container.querySelector('#locationText').textContent = '所在位置';
    publishPhotoCount = 0;
    publishPhotoBase64List = [];
    publishVideo = null;
    publishSticker = null;
    publishLink = null;
    tempMentions = [];
    tempLocation = '';
    const photosContainer = container.querySelector('#publishPhotos');
    photosContainer.innerHTML = '<div class="add-photo-btn" onclick="MomentsApp.triggerAddPhoto()"></div>';
    container.querySelector('#publishVideoArea').style.display = 'none';
    container.querySelector('#publishStickers').style.display = 'none';
    renderPublishLinkPreview(container);
  }

  function restorePublishDraft(container) {
    const draft = getPublishDraft();
    resetPublishForm(container);
    if (!draft) return;
    container.querySelector('#publishText').value = draft.text || '';
    publishPhotoBase64List = Array.isArray(draft.images) ? draft.images.filter(Boolean) : [];
    publishPhotoCount = publishPhotoBase64List.length;
    publishVideo = draft.video || null;
    publishSticker = draft.sticker || null;
    publishLink = draft.link || null;
    tempMentions = Array.isArray(draft.mentions) ? draft.mentions : [];
    tempLocation = draft.location || '';

    const photosContainer = container.querySelector('#publishPhotos');
    const addBtn = photosContainer.querySelector('.add-photo-btn');
    publishPhotoBase64List.forEach(img => {
      const div = document.createElement('div');
      div.className = 'publish-photo-item';
      div.innerHTML = `
        <img src="${img}" alt="照片">
        <div class="remove-photo" onclick="MomentsApp.removeDemoPhoto(this)">
          <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </div>
      `;
      photosContainer.insertBefore(div, addBtn);
    });
    if (publishPhotoCount >= 9 && addBtn) addBtn.style.display = 'none';
    if (publishVideo) {
      container.querySelector('#publishVideoCover').src = publishVideo.cover || '';
      container.querySelector('#publishVideoDuration').textContent = publishVideo.duration || '';
      container.querySelector('#publishVideoArea').style.display = 'block';
    }
    if (publishSticker) {
      container.querySelector('#publishStickerImg').src = publishSticker;
      container.querySelector('#publishStickers').style.display = 'block';
    }
    updateMentionsDisplay();
    const locationText = container.querySelector('#locationText');
    if (locationText && tempLocation) locationText.textContent = tempLocation;
  }

  function openPublishPanel() {
    const container = document.getElementById('moments-container');
    if (!container) return;
    container.querySelector('#mask').classList.add('active');
    container.querySelector('#publishPanel').classList.add('active');
    restorePublishDraft(container);
    const input = container.querySelector('#publishText');
    if (input && !input.dataset.draftBound) {
      input.dataset.draftBound = 'true';
      input.addEventListener('input', savePublishDraft);
    }
    renderPublishLinkPreview(container);
  }

  function renderPublishLinkPreview(container) {
    container = container || document.getElementById('moments-container');
    if (!container) return;
    const area = container.querySelector('#publishLinkArea');
    if (!area) return;
    if (!publishLink || !publishLink.url) {
      area.style.display = 'none';
      area.innerHTML = '';
      return;
    }
    const title = escapeHtml(publishLink.title || (publishLink.type === 'music' ? '音乐链接' : (publishLink.type === 'video' ? '视频链接' : getMomentUrlHost(publishLink.url))));
    const desc = escapeHtml(publishLink.desc || getMomentUrlHost(publishLink.url));
    area.style.display = 'block';
    area.innerHTML = publishLink.type === 'music' ? `
      <div class="publish-link-preview music">
        <i class="fas fa-music"></i>
        <div><strong>${title}</strong><span>${desc}</span></div>
        <button type="button" onclick="MomentsApp.removePublishLink(event)">×</button>
      </div>
    ` : `
      <div class="publish-link-preview ${publishLink.type === 'video' ? 'video' : ''}">
        <i class="fas ${publishLink.type === 'video' ? 'fa-play' : 'fa-link'}"></i>
        <div><strong>${title}</strong><span>${desc}</span></div>
        <button type="button" onclick="MomentsApp.removePublishLink(event)">×</button>
      </div>
    `;
  }

  function addPublishLink() {
    const rawUrl = prompt('粘贴网页、小红书、音乐或视频 URL 链接：');
    if (rawUrl === null) return;
    const url = normalizeMomentUrl(rawUrl);
    if (!url) {
      const container = document.getElementById('moments-container');
      const hint = container && container.querySelector('#longPressHint');
      if (hint) {
        hint.textContent = '链接格式不正确';
        hint.classList.add('active');
        setTimeout(() => hint.classList.remove('active'), 1800);
      }
      return;
    }
    const music = isMusicUrl(url);
    const video = isVideoUrl(url);
    const defaultTitle = music ? '音乐' : (video ? '视频链接' : getMomentUrlHost(url));
    const title = prompt('编辑链接卡片名称：', defaultTitle) || defaultTitle;
    publishLink = {
      url,
      title: title.trim() || defaultTitle,
      desc: getMomentUrlHost(url),
      type: music ? 'music' : (video ? 'video' : 'web')
    };
    renderPublishLinkPreview();
    savePublishDraft();
  }

  function removePublishLink(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    publishLink = null;
    renderPublishLinkPreview();
    savePublishDraft();
  }

  function triggerAddPhoto() {
    const fileInput = document.getElementById('momentsPhotoInput');
    if (fileInput) {
      fileInput.value = '';
      fileInput.click();
    }
  }

  function handlePhotoUpload(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const container = document.getElementById('moments-container');
    if (!container) return;

    const photosContainer = container.querySelector('#publishPhotos');
    const addBtn = photosContainer.querySelector('.add-photo-btn');

    for (let i = 0; i < files.length; i++) {
      if (publishPhotoCount >= 9) break;
      const file = files[i];
      if (!file.type.startsWith('image/')) continue;

      const reader = new FileReader();
      reader.onload = async function(ev) {
        const base64 = ev.target.result;
        // 压缩图片后再存储，减少 localStorage/IndexedDB 压力
        const compressed = await compressImage(base64, COMPRESS_MAX_WIDTH, COMPRESS_QUALITY);
        publishPhotoBase64List.push(compressed);
        publishPhotoCount++;

        const div = document.createElement('div');
        div.className = 'publish-photo-item';
        div.innerHTML = `
          <img src="${compressed}" alt="照片">
          <div class="remove-photo" onclick="MomentsApp.removeDemoPhoto(this)">
            <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </div>
        `;
        photosContainer.insertBefore(div, addBtn);
        if (publishPhotoCount >= 9 && addBtn) addBtn.style.display = 'none';
        savePublishDraft();
      };
      reader.readAsDataURL(file);
    }

    // 清空 input 以便重复选择同一文件
    e.target.value = '';
  }

  function triggerAddVideo() {
    const fileInput = document.getElementById('momentsVideoInput');
    if (fileInput) {
      fileInput.value = '';
      fileInput.click();
    }
  }

  function handleVideoUpload(e) {
    const file = e.target.files[0];
    if (!file || !file.type.startsWith('video/')) return;

    const container = document.getElementById('moments-container');
    if (!container) return;

    // 用 video 元素获取封面和时长
    const videoUrl = URL.createObjectURL(file);
    const videoEl = document.createElement('video');
    videoEl.preload = 'metadata';
    videoEl.src = videoUrl;

    videoEl.onloadeddata = function() {
      // 生成封面
      const canvas = document.createElement('canvas');
      canvas.width = videoEl.videoWidth || 400;
      canvas.height = videoEl.videoHeight || 300;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
      const coverBase64 = canvas.toDataURL('image/jpeg', 0.7);

      // 计算时长
      const duration = Math.round(videoEl.duration);
      const mins = Math.floor(duration / 60);
      const secs = duration % 60;
      const durationStr = `${mins}:${String(secs).padStart(2, '0')}`;

      // 将视频文件转为 base64 持久化保存
      const reader = new FileReader();
      reader.onload = function(ev) {
        publishVideo = {
          cover: coverBase64,
          url: ev.target.result,
          duration: durationStr,
          file: file
        };

        container.querySelector('#publishVideoCover').src = coverBase64;
        container.querySelector('#publishVideoDuration').textContent = durationStr;
        container.querySelector('#publishVideoArea').style.display = 'block';
        savePublishDraft();
      };
      reader.readAsDataURL(file);
    };

    e.target.value = '';
  }

  function removeDemoPhoto(el) {
    const imgSrc = el.parentElement.querySelector('img').src;
    // 从 base64 列表中移除
    const idx = publishPhotoBase64List.indexOf(imgSrc);
    if (idx >= 0) publishPhotoBase64List.splice(idx, 1);
    el.parentElement.remove();
    publishPhotoCount--;
    
    const container = document.getElementById('moments-container');
    if (!container) return;
    
    const photosContainer = container.querySelector('#publishPhotos');
    const addBtn = photosContainer.querySelector('.add-photo-btn');
    if (addBtn) addBtn.style.display = '';
    savePublishDraft();
  }

  function removePublishVideo() {
    if (publishVideo && publishVideo.url) {
      URL.revokeObjectURL(publishVideo.url);
    }
    publishVideo = null;
    
    const container = document.getElementById('moments-container');
    if (container) {
      container.querySelector('#publishVideoArea').style.display = 'none';
    }
    savePublishDraft();
  }

  // ========== Publish Sticker ==========
  function togglePublishStickerPanel() {
    const container = document.getElementById('moments-container');
    if (!container) return;
    
    const panel = container.querySelector('#publishStickerPanel');
    const body = container.querySelector('#publishStickerBody');
    
    panel.classList.toggle('active');
    
    if (panel.classList.contains('active')) {
      renderPublishStickerBody();
    }
  }

  function closePublishStickerPanel() {
    const container = document.getElementById('moments-container');
    if (container) {
      container.querySelector('#publishStickerPanel').classList.remove('active');
    }
  }

  function renderPublishStickerBody() {
    const container = document.getElementById('moments-container');
    if (!container) return;
    
    const body = container.querySelector('#publishStickerBody');
    let _stickerLib = [];
    if (typeof window !== 'undefined' && window._stickerLibrary && Array.isArray(window._stickerLibrary)) {
      _stickerLib = window._stickerLibrary;
    } else if (typeof stickerLibrary !== 'undefined' && Array.isArray(stickerLibrary)) {
      _stickerLib = stickerLibrary;
    }
    const stickerLibraryFiltered = _stickerLib.filter(Boolean);
    
    if (stickerLibraryFiltered.length === 0) {
      body.innerHTML = '<div class="publish-sticker-empty">暂无表情包，请在表情包管理中添加</div>';
      return;
    }
    
    body.innerHTML = stickerLibraryFiltered.map((s, i) => `
      <div class="publish-sticker-select-item" onclick="MomentsApp.selectPublishSticker(${i})">
        <img src="${s}" alt="表情包">
      </div>
    `).join('');
  }

  function selectPublishSticker(index) {
    let _stickerLib = [];
    if (typeof window !== 'undefined' && window._stickerLibrary && Array.isArray(window._stickerLibrary)) {
      _stickerLib = window._stickerLibrary;
    } else if (typeof stickerLibrary !== 'undefined' && Array.isArray(stickerLibrary)) {
      _stickerLib = stickerLibrary;
    }
    const stickerLibraryFiltered = _stickerLib.filter(Boolean);
    if (index < 0 || index >= stickerLibraryFiltered.length) return;
    
    publishSticker = stickerLibraryFiltered[index];
    
    const container = document.getElementById('moments-container');
    if (container) {
      container.querySelector('#publishStickerImg').src = publishSticker;
      container.querySelector('#publishStickers').style.display = 'block';
    }
    
    savePublishDraft();
    closePublishStickerPanel();
  }

  function removePublishSticker() {
    publishSticker = null;
    const container = document.getElementById('moments-container');
    if (container) {
      container.querySelector('#publishStickers').style.display = 'none';
    }
    savePublishDraft();
  }

  async function publishMoment() {
    const container = document.getElementById('moments-container');
    if (!container) return;
    
    const text = container.querySelector('#publishText').value.trim();
    // 支持纯表情包发布
    if (!text && !publishVideo && !publishSticker && !publishLink && publishPhotoBase64List.length === 0) return;

    const images = [...publishPhotoBase64List];

    const newMoment = {
      id: Date.now(),
      avatar: userConfig.avatar,
      nickname: userConfig.name,
      identity: userConfig.identity || '',
      author: 'me',
      time: Date.now(),
      text: text,
      images: images,
      sticker: publishSticker || null,
      link: publishLink ? { ...publishLink } : null,
      video: publishVideo ? { cover: publishVideo.cover, url: publishVideo.url, duration: publishVideo.duration } : null,
      likes: [],
      likedByMe: false,
      collected: false,
      comments: [],
      mentions: [...tempMentions],
      location: tempLocation
    };

    momentsData.unshift(newMoment);
    await saveMomentsToStorage();
    clearPublishDraft();
    resetPublishForm(container);
    await renderMoments();


    closeAllPanels();
    container.scrollTo({ top: 0, behavior: 'smooth' });

    // 延迟后系统自动评论（在设定时间内随机回复）
    var autoReplyDelay = getInteractionDelay('active') * 1000;
    // 至少 500ms，避免立即触发显得突兀；上限不变（用户已设置）
    if (!Number.isFinite(autoReplyDelay) || autoReplyDelay < 500) autoReplyDelay = 500;
    setTimeout(() => {
      triggerAutoReply(newMoment.id);
    }, autoReplyDelay);
  }

  // ========== Image Preview ==========
  let previewData = { momentId: null, images: [], index: 0 };

  function openPreview(momentId, imgIndex) {
    const m = momentsData.find(x => x.id === momentId);
    if (!m || !m.images.length) return;
    
    previewData = { momentId, images: m.images, index: imgIndex };
    updatePreview();
    
    const container = document.getElementById('moments-container');
    if (container) {
      container.querySelector('#previewOverlay').classList.add('active');
    }
    document.body.style.overflow = 'hidden';
  }

  function openStickerPreview(stickerUrl) {
    const container = document.getElementById('moments-container');
    if (!container) return;
    
    const overlay = container.querySelector('#previewOverlay');
    const img = container.querySelector('#previewImage');
    
    img.src = stickerUrl;
    overlay.classList.add('active');
    
    // 隐藏计数器
    const counter = container.querySelector('#previewCounter');
    if (counter) counter.style.display = 'none';
    
    document.body.style.overflow = 'hidden';
  }

  function updatePreview() {
    const { images, index } = previewData;
    
    const container = document.getElementById('moments-container');
    if (!container) return;
    
    container.querySelector('#previewImage').src = images[index];
    container.querySelector('#previewCounter').textContent = `${index + 1} / ${images.length}`;
  }

  function closePreview() {
    const container = document.getElementById('moments-container');
    if (container) {
      container.querySelector('#previewOverlay').classList.remove('active');
      container.querySelector('#previewContainer').style.display = '';
      container.querySelector('#previewVideoContainer').style.display = 'none';
      container.querySelector('#previewCounter').style.display = '';
    }
    document.body.style.overflow = '';
    videoPlaying = false;
  }

  // ========== Video Play ==========
  let videoPlaying = false;

  async function playVideo(momentId) {
    const m = momentsData.find(x => x.id === momentId);
    if (!m || !m.video) return;

    previewData = { momentId, images: m.images, index: 0 };

    const container = document.getElementById('moments-container');
    if (!container) return;

    // 显示视频播放器
    container.querySelector('#previewContainer').style.display = 'none';
    container.querySelector('#previewVideoContainer').style.display = 'flex';
    container.querySelector('#previewVideoCover').src = m.video.cover;
    container.querySelector('#previewVideoCover').style.display = 'block';
    const videoPlayer = container.querySelector('#previewVideoPlayer');
    if (videoPlayer) {
      // 从 IndexedDB 加载视频数据
      let videoUrl = m.video.url;
      if (videoUrl && videoUrl.startsWith('__IDB__')) {
        const data = await getVideoFromIDB(momentId);
        if (data) {
          videoUrl = data;
          m.video.url = data; // 缓存到内存
        }
      }
      videoPlayer.src = videoUrl;
      videoPlayer.style.display = 'none';
      videoPlayer.pause();
      videoPlayer.currentTime = 0;
    }
    container.querySelector('#previewCounter').style.display = 'none';
    container.querySelector('#previewVideoInfo').textContent = '点击播放 · ' + (m.video.duration || '');
    videoPlaying = false;
    container.querySelector('.preview-video-play').classList.remove('playing');
    container.querySelector('.preview-video-play svg').innerHTML = '<path d="M8 5v14l11-7z"/>';
    container.querySelector('#previewOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function toggleVideoPlay() {
    const container = document.getElementById('moments-container');
    if (!container) return;

    const videoPlayer = container.querySelector('#previewVideoPlayer');
    const coverImg = container.querySelector('#previewVideoCover');
    const playBtn = container.querySelector('.preview-video-play');
    const info = container.querySelector('#previewVideoInfo');

    if (!videoPlayer) return;

    if (videoPlayer.paused || videoPlayer.ended) {
      // 开始播放
      videoPlayer.style.display = 'block';
      if (coverImg) coverImg.style.display = 'none';
      videoPlayer.play().catch(() => {});
      videoPlaying = true;
      playBtn.classList.add('playing');
      playBtn.querySelector('svg').innerHTML = '<path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>';
      info.textContent = '播放中...';
    } else {
      // 暂停
      videoPlayer.pause();
      videoPlaying = false;
      playBtn.classList.remove('playing');
      playBtn.querySelector('svg').innerHTML = '<path d="M8 5v14l11-7z"/>';
      info.textContent = '已暂停 · ' + (previewData && previewData.momentId ? (momentsData.find(x => x.id === previewData.momentId)?.video?.duration || '') : '');
    }

    // 视频结束时重置
    videoPlayer.onended = function() {
      videoPlaying = false;
      playBtn.classList.remove('playing');
      playBtn.querySelector('svg').innerHTML = '<path d="M8 5v14l11-7z"/>';
      info.textContent = '播放结束 · 点击重播';
      if (coverImg) coverImg.style.display = 'block';
      videoPlayer.style.display = 'none';
    };
  }

  let currentMomentMusic = null;

  function toggleMomentVoice(el, event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!el) return;
    const url = el.dataset.voiceUrl || '';
    if (!url) return;
    const icon = el.querySelector('.moment-voice-play i');
    let audio = el._momentVoiceAudio;
    if (!audio) {
      audio = new Audio(url);
      el._momentVoiceAudio = audio;
      audio.onended = () => {
        el.classList.remove('playing');
        if (icon) icon.className = 'fas fa-play';
      };
    }
    if (currentMomentMusic && currentMomentMusic !== audio) {
      try { currentMomentMusic.pause(); } catch(e) {}
    }
    if (audio.paused || audio.ended) {
      currentMomentMusic = audio;
      el.classList.add('playing');
      if (icon) icon.className = 'fas fa-pause';
      audio.play().catch(() => {});
    } else {
      audio.pause();
      el.classList.remove('playing');
      if (icon) icon.className = 'fas fa-play';
    }
  }

  function toggleMomentMusic(el, event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!el) return;
    const url = el.dataset.musicUrl || '';
    if (!url) return;
    const container = document.getElementById('moments-container');
    if (!container) return;
    const existing = container.querySelector('#momentsLinkFloat') || document.getElementById('momentsLinkFloat');
    if (existing && existing.dataset.url === url) {
      existing.classList.add('moments-float-attention');
      setTimeout(() => existing.classList.remove('moments-float-attention'), 450);
      return;
    }
    if (existing) closeMomentFloat(existing);

    const titleEl = el.querySelector('.moment-link-title');
    const title = titleEl ? titleEl.textContent.trim() : '音乐链接';
    const frame = document.createElement('div');
    frame.id = 'momentsLinkFloat';
    frame.className = 'moments-link-float moments-music-float';
    frame.dataset.url = url;
    frame.innerHTML = `
      <div class="moments-link-float-header">
        <span><i class="fas fa-music"></i> ${escapeHtml(title || '音乐链接')}</span>
        <div>
          <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" title="外部打开"><i class="fas fa-external-link-alt"></i></a>
          <button class="moments-link-min-btn" type="button" title="最小化"><i class="fas fa-minus"></i></button>
          <button class="moments-link-size-btn" type="button" title="放大/缩小"><i class="fas fa-expand-alt"></i></button>
          <button class="moments-link-close-btn" type="button" title="关闭"><i class="fas fa-times"></i><span>关闭</span></button>
        </div>
      </div>
      <div class="moments-music-float-body">
        <div class="moments-music-disc"><i class="fas fa-music"></i></div>
        <div class="moments-music-title">${escapeHtml(title || '音乐链接')}</div>
        <audio class="moments-link-audio-player" src="${escapeHtml(url)}" controls autoplay preload="auto"></audio>
      </div>
      <div class="moments-link-tip">音乐浮窗播放中，可点右上角关闭</div>
    `;
    container.appendChild(frame);
    const audio = frame.querySelector('audio');
    currentMomentMusic = audio;
    el.classList.add('playing');
    const icon = el.querySelector('.moment-music-play i');
    if (icon) icon.className = 'fas fa-pause';
    frame.querySelector('.moments-link-close-btn').addEventListener('click', () => {
      closeMomentFloat(frame);
      el.classList.remove('playing');
      if (icon) icon.className = 'fas fa-play';
    });
    bindMomentFloatControls(frame);
    audio.play().catch(() => {});
    audio.onended = () => {
      el.classList.remove('playing');
      if (icon) icon.className = 'fas fa-play';
      if (currentMomentMusic === audio) currentMomentMusic = null;
    };
  }

  function closeMomentFloat(frame) {
    if (!frame) return;
    const media = frame.querySelector('video, audio');
    if (media) {
      try { media.pause(); } catch(e) {}
      media.removeAttribute('src');
      try { media.load(); } catch(e) {}
      if (currentMomentMusic === media) currentMomentMusic = null;
    }
    frame.remove();
  }

  function toggleMomentLinkFrame(el, event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const url = el && (el.dataset.linkUrl || '');
    if (!url) return;
    const container = document.getElementById('moments-container');
    if (!container) return;
    const existing = container.querySelector('#momentsLinkFloat') || document.getElementById('momentsLinkFloat');
    if (existing && existing.dataset.url === url) {
      closeMomentFloat(existing);
      return;
    }
    if (existing) closeMomentFloat(existing);
    const host = getMomentUrlHost(url);
    const video = isVideoUrl(url);
    const frame = document.createElement('div');
    frame.id = 'momentsLinkFloat';
    frame.className = 'moments-link-float' + (video ? ' moments-video-float' : '');
    frame.dataset.url = url;
    frame.innerHTML = `
      <div class="moments-link-float-header">
        <span><i class="fas ${video ? 'fa-play' : 'fa-link'}"></i> ${escapeHtml(video ? '视频链接' : host)}</span>
        <div>
          <a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" title="外部打开"><i class="fas fa-external-link-alt"></i></a>
          <button class="moments-link-min-btn" type="button" title="最小化"><i class="fas fa-minus"></i></button>
          <button class="moments-link-size-btn" type="button" title="放大/缩小"><i class="fas fa-expand-alt"></i></button>
          <button class="moments-link-close-btn" type="button" title="关闭"><i class="fas fa-times"></i><span>关闭</span></button>
        </div>
      </div>
      ${video
        ? `<video class="moments-link-video-player" src="${escapeHtml(url)}" controls playsinline preload="metadata"></video>`
        : `<iframe src="${escapeHtml(url)}" sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer-when-downgrade"></iframe>`
      }
      <div class="moments-link-tip">${video ? '视频浮窗播放中，可点右上角关闭' : '如果页面不显示，请点右上角外部打开'}</div>
    `;
    container.appendChild(frame);
    frame.querySelector('.moments-link-close-btn').addEventListener('click', () => {
      closeMomentFloat(frame);
    });
    bindMomentFloatControls(frame);
  }

  function bindMomentFloatControls(frame) {
    const minBtn = frame.querySelector('.moments-link-min-btn');
    const sizeBtn = frame.querySelector('.moments-link-size-btn');
    if (minBtn) minBtn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      frame.classList.toggle('minimized');
    });
    if (sizeBtn) sizeBtn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      frame.classList.remove('minimized');
      const sizes = ['compact', 'normal', 'large'];
      const current = frame.dataset.size || 'normal';
      const next = sizes[(sizes.indexOf(current) + 1) % sizes.length] || 'normal';
      frame.dataset.size = next;
    });
  }

  function goToMomentDetail() {
    const momentId = previewData.momentId;
    if (!momentId) return;
    closePreview();
    // 关闭所有面板
    closeAlbumPanel();
    closeCollectionPanel();
    closeSearchPanel();
    // 滚动到对应朋友圈并高亮
    scrollToMoment(momentId);
  }

  function prevImage() {
    if (previewData.index > 0) {
      previewData.index--;
      updatePreview();
    }
  }

  function nextImage() {
    if (previewData.index < previewData.images.length - 1) {
      previewData.index++;
      updatePreview();
    }
  }

  // ========== Close Panels ==========
  function closeAllPanels() {
    const container = document.getElementById('moments-container');
    if (!container) return;
    
    container.querySelector('#mask').classList.remove('active');
    container.querySelector('#publishPanel').classList.remove('active');
    const commentPopup = container.querySelector('#commentPopup');
    const commentEmojiPanel = container.querySelector('#commentEmojiPanel');
    if (commentPopup) commentPopup.classList.remove('active');
    if (commentEmojiPanel) commentEmojiPanel.classList.remove('active');
    commentEmojiPanelOpen = false;
    currentCommentMomentId = null;
    container.querySelector('#publishStickerPanel').classList.remove('active');
    container.querySelector('#customPanel').classList.remove('active');
    container.querySelector('#mentionPanel').classList.remove('active');
    container.querySelector('#locationPanel').classList.remove('active');
    container.querySelector('#editPanel').classList.remove('active');
    container.querySelector('#beautifyPanel').classList.remove('active');
    container.querySelector('#visitorPanel').classList.remove('active');
    // 隐藏评论表情包预览
    const stickerPreview = container.querySelector('#commentStickerPreview');
    if (stickerPreview) {
      stickerPreview.classList.remove('active');
      stickerPreview.style.display = 'none';
      const stickerPreviewImg = stickerPreview.querySelector('img');
      if (stickerPreviewImg) stickerPreviewImg.src = '';
    }
    restoreInlineCommentControls();
    currentCommentMomentId = null;
    replyToName = null;
    currentEditMomentId = null;
    pendingCommentSticker = null;
    commentEmojiPanelOpen = false;
  }

  // ========== Beautify Panel ==========
  function openBeautifyPanel() {
    const container = document.getElementById('moments-container');
    if (!container) return;
    
    container.querySelector('#mask').classList.add('active');
    container.querySelector('#beautifyPanel').classList.add('active');
    container.querySelector('#beautifyName').value = userConfig.name;
    const identityInput = container.querySelector('#beautifyIdentity');
    if (identityInput) identityInput.value = userConfig.identity || '';
    const partnerNameInput = container.querySelector('#beautifyPartnerName');
    if (partnerNameInput) partnerNameInput.value = getPartnerName();
    container.querySelector('#beautifySignature').value = userConfig.signature.replace(/^["']|["']$/g, '');
    const partnerAvatarPreview = container.querySelector('#beautifyPartnerAvatarPreview');
    if (partnerAvatarPreview) {
      partnerAvatarPreview.src = getPartnerAvatar();
      partnerAvatarPreview.dataset.base64 = getPartnerAvatar();
      if (isValidAvatar(getPartnerAvatar())) {
        partnerAvatarPreview.classList.add('uploaded');
      } else {
        partnerAvatarPreview.classList.remove('uploaded');
      }
    }
    const avatarPreview = container.querySelector('#beautifyAvatarPreview');
    const safeAvatar = isValidAvatar(userConfig.avatar)
      ? userConfig.avatar
      : 'https://api.dicebear.com/7.x/avataaars/svg?seed=me&backgroundColor=b6e3f4';
    avatarPreview.src = safeAvatar;
    avatarPreview.dataset.base64 = safeAvatar;
    avatarPreview.dataset.uploaded = '0';
    if (isValidAvatar(userConfig.avatar)) {
      avatarPreview.classList.add('uploaded');
    } else {
      avatarPreview.classList.remove('uploaded');
    }
    const coverPreview = container.querySelector('#beautifyCoverPreview');
    coverPreview.src = userConfig.coverImage;
    coverPreview.dataset.base64 = userConfig.coverImage;
    coverPreview.dataset.uploaded = '0';
    if (isValidAvatar(userConfig.coverImage)) {
      coverPreview.classList.add('uploaded');
    } else {
      coverPreview.classList.remove('uploaded');
    }
    renderBeautifyFriendsList();
    // 恢复好友点赞开关状态
    var toggleEl = container.querySelector('#toggleFriendLike');
    if (toggleEl) {
      var friendLikeEnabled = momentsGet('moments_friend_like') === 'true';
      toggleEl.classList.toggle('active', friendLikeEnabled);
    }
    // 恢复互动设置
    var activeMinInput = container.querySelector('#beautifyActiveCommentMin');
    var activeMinUnit = container.querySelector('#beautifyActiveCommentMinUnit');
    var activeMaxInput = container.querySelector('#beautifyActiveCommentMax');
    var activeMaxUnit = container.querySelector('#beautifyActiveCommentMaxUnit');
    var replyMinInput = container.querySelector('#beautifyReplyCommentMin');
    var replyMinUnit = container.querySelector('#beautifyReplyCommentMinUnit');
    var replyMaxInput = container.querySelector('#beautifyReplyCommentMax');
    var replyMaxUnit = container.querySelector('#beautifyReplyCommentMaxUnit');
    var countMinInput = container.querySelector('#beautifyReplyCountMin');
    var countMaxInput = container.querySelector('#beautifyReplyCountMax');
    if (activeMinInput) activeMinInput.value = momentsGet('moments_active_comment_min_value') || '0';
    if (activeMinUnit) activeMinUnit.value = momentsGet('moments_active_comment_min_unit') || 'second';
    if (activeMaxInput) activeMaxInput.value = momentsGet('moments_active_comment_max_value') || (momentsGet('moments_reply_speed') || '5');
    if (activeMaxUnit) activeMaxUnit.value = momentsGet('moments_active_comment_max_unit') || 'second';
    if (replyMinInput) replyMinInput.value = momentsGet('moments_reply_comment_min_value') || '5';
    if (replyMinUnit) replyMinUnit.value = momentsGet('moments_reply_comment_min_unit') || 'second';
    if (replyMaxInput) replyMaxInput.value = momentsGet('moments_reply_comment_max_value') || '15';
    if (replyMaxUnit) replyMaxUnit.value = momentsGet('moments_reply_comment_max_unit') || 'second';
    if (countMinInput) countMinInput.value = momentsGet('moments_reply_count_min') || '';
    if (countMaxInput) countMaxInput.value = momentsGet('moments_reply_count_max') || '';
    const partnerCfg = getPartnerPostSettings();
    const postMinInput = container.querySelector('#beautifyPartnerPostMin');
    const postMaxInput = container.querySelector('#beautifyPartnerPostMax');
    const textMinInput = container.querySelector('#beautifyPartnerTextMin');
    const textMaxInput = container.querySelector('#beautifyPartnerTextMax');
    const imageChanceInput = container.querySelector('#beautifyPartnerImageChance');
    const voiceChanceInput = container.querySelector('#beautifyPartnerVoiceChance');
    const videoChanceInput = container.querySelector('#beautifyPartnerVideoChance');
    if (postMinInput) postMinInput.value = partnerCfg.min;
    if (postMaxInput) postMaxInput.value = partnerCfg.max;
    if (textMinInput) textMinInput.value = partnerCfg.textMin;
    if (textMaxInput) textMaxInput.value = partnerCfg.textMax;
    if (imageChanceInput) imageChanceInput.value = partnerCfg.imageChance;
    if (voiceChanceInput) voiceChanceInput.value = partnerCfg.voiceChance;
    if (videoChanceInput) videoChanceInput.value = partnerCfg.videoChance;
    updateIntervalLabel('active');
    updateIntervalLabel('reply');
    updateCountLabel();
    updatePartnerPostLabel();
  }

  function closeBeautifyPanel() {
    const container = document.getElementById('moments-container');
    if (container) {
      container.querySelector('#mask').classList.remove('active');
      container.querySelector('#beautifyPanel').classList.remove('active');
    }
  }

  // ========== Friends List ==========
  let momentsFriends = [];
  let editingFriendAvatarId = null;

  async function loadMomentsFriends() {
    try {
      // 先刷新伴侣信息缓存
      await loadPartnerInfo();
      let data = null;
      if (typeof localforage !== 'undefined') {
        try {
          data = await localforage.getItem(scopedMomentsKey('moments_friends'));
          if (!data) data = await localforage.getItem('moments_friends');
        } catch(e) {}
      }
      if (!data) data = momentsGet('moments_friends');
      if (data) {
        momentsFriends = Array.isArray(data) ? data : JSON.parse(data);
        // 更新伴侣信息为最新值
        var partnerIdx = momentsFriends.findIndex(function(f) { return f.isPartner; });
        if (partnerIdx >= 0) {
          momentsFriends[partnerIdx].name = getPartnerName();
          momentsFriends[partnerIdx].avatar = getPartnerAvatar();
        } else {
          momentsFriends.unshift(getDefaultPartnerFriend()[0]);
        }
        await saveMomentsFriends();
      } else {
        // 默认包含伴侣
        momentsFriends = getDefaultPartnerFriend();
        await saveMomentsFriends();
      }
    } catch (e) {
      momentsFriends = getDefaultPartnerFriend();
    }
  }

  function getDefaultPartnerFriend() {
    return [{ id: 'partner', name: getPartnerName(), avatar: getPartnerAvatar(), isPartner: true }];
  }

  async function saveMomentsFriends() {
    const cleanList = Array.isArray(momentsFriends) ? momentsFriends : [];
    if (typeof localforage !== 'undefined') {
      try { await localforage.setItem(scopedMomentsKey('moments_friends'), cleanList); } catch(e) { console.warn('朋友圈对象列表 localforage 保存失败:', e); }
    }
    try {
      momentsSet('moments_friends', JSON.stringify(cleanList));
    } catch(e) {
      console.warn('朋友圈对象列表 localStorage 保存失败，仅保留 localforage:', e);
    }
  }

  function renderBeautifyFriendsList() {
    var container = document.getElementById('moments-container');
    if (!container) return;
    var listEl = container.querySelector('#beautifyFriendsList');
    if (!listEl) return;

    if (momentsFriends.length === 0) {
      listEl.innerHTML = '<div style="color:#999;font-size:13px;padding:8px 0;">暂无好友</div>';
      return;
    }

    listEl.innerHTML = momentsFriends.map(function(f) {
      return '<div class="beautify-friend-item">'
        + '<button type="button" class="friend-avatar-btn" onclick="MomentsApp.updateFriendAvatar(\'' + f.id + '\')" title="上传对象头像">'
        + '<img src="' + (f.avatar || getPartnerAvatar()) + '" alt="">'
        + '</button>'
        + '<span class="friend-name">' + (f.name || '') + '</span>'
        + (f.isPartner ? '<span class="friend-tag">伴侣</span>' : '<span class="friend-tag">对象</span>')
        + '<button class="friend-avatar-upload" onclick="MomentsApp.updateFriendAvatar(\'' + f.id + '\')">换头像</button>'
        + (!f.isPartner ? '<button class="friend-remove" onclick="MomentsApp.removeFriend(\'' + f.id + '\')">删除</button>' : '')
        + '</div>';
    }).join('');
  }

  function getUnitMultiplier(unit) {
    if (unit === 'minute') return 60;
    if (unit === 'hour') return 3600;
    return 1;
  }

  function formatSpeed(seconds) {
    seconds = Math.max(0, Math.round(Number(seconds) || 0));
    if (seconds < 60) return seconds + '秒';
    if (seconds < 3600) return Math.round(seconds / 60) + '分钟';
    var h = Math.floor(seconds / 3600);
    var m = Math.round((seconds % 3600) / 60);
    return m > 0 ? h + '小时' + m + '分' : h + '小时';
  }

  function getIntervalInputConfig(type) {
    var isReply = type === 'reply';
    return {
      minInput: isReply ? '#beautifyReplyCommentMin' : '#beautifyActiveCommentMin',
      minUnit: isReply ? '#beautifyReplyCommentMinUnit' : '#beautifyActiveCommentMinUnit',
      maxInput: isReply ? '#beautifyReplyCommentMax' : '#beautifyActiveCommentMax',
      maxUnit: isReply ? '#beautifyReplyCommentMaxUnit' : '#beautifyActiveCommentMaxUnit',
      label: isReply ? '#replyIntervalLabel' : '#activeIntervalLabel',
      minValueKey: isReply ? 'moments_reply_comment_min_value' : 'moments_active_comment_min_value',
      minUnitKey: isReply ? 'moments_reply_comment_min_unit' : 'moments_active_comment_min_unit',
      maxValueKey: isReply ? 'moments_reply_comment_max_value' : 'moments_active_comment_max_value',
      maxUnitKey: isReply ? 'moments_reply_comment_max_unit' : 'moments_active_comment_max_unit',
      minSecondsKey: isReply ? 'moments_reply_comment_min' : 'moments_active_comment_min',
      maxSecondsKey: isReply ? 'moments_reply_comment_max' : 'moments_active_comment_max',
      defaultMin: isReply ? 5 : 0,
      defaultMax: isReply ? 15 : (Number(momentsGet('moments_reply_speed')) || 5)
    };
  }

  function updateIntervalLabel(type) {
    var container = document.getElementById('moments-container');
    if (!container) return;
    var cfg = getIntervalInputConfig(type);
    var minInput = container.querySelector(cfg.minInput);
    var minUnitEl = container.querySelector(cfg.minUnit);
    var maxInput = container.querySelector(cfg.maxInput);
    var maxUnitEl = container.querySelector(cfg.maxUnit);
    var label = container.querySelector(cfg.label);
    if (!minInput || !minUnitEl || !maxInput || !maxUnitEl || !label) return;

    var minValue = Number(minInput.value);
    var maxValue = Number(maxInput.value);
    minValue = Number.isFinite(minValue) ? Math.max(0, minValue) : cfg.defaultMin;
    maxValue = Number.isFinite(maxValue) ? Math.max(0, maxValue) : cfg.defaultMax;
    var minUnit = minUnitEl.value || 'second';
    var maxUnit = maxUnitEl.value || 'second';
    var minSeconds = minValue * getUnitMultiplier(minUnit);
    var maxSeconds = maxValue * getUnitMultiplier(maxUnit);
    if (minSeconds > maxSeconds) {
      var tmpSeconds = minSeconds; minSeconds = maxSeconds; maxSeconds = tmpSeconds;
      var tmpValue = minValue; minValue = maxValue; maxValue = tmpValue;
      var tmpUnit = minUnit; minUnit = maxUnit; maxUnit = tmpUnit;
      minInput.value = String(minValue); maxInput.value = String(maxValue);
      minUnitEl.value = minUnit; maxUnitEl.value = maxUnit;
    }
    label.textContent = minSeconds === maxSeconds ? formatSpeed(minSeconds) : (formatSpeed(minSeconds) + '~' + formatSpeed(maxSeconds));
    momentsSet(cfg.minValueKey, String(minValue));
    momentsSet(cfg.minUnitKey, minUnit);
    momentsSet(cfg.maxValueKey, String(maxValue));
    momentsSet(cfg.maxUnitKey, maxUnit);
    momentsSet(cfg.minSecondsKey, String(minSeconds));
    momentsSet(cfg.maxSecondsKey, String(maxSeconds));
    if (type === 'active') momentsSet('moments_reply_speed', String(maxSeconds));
  }

  function updateSpeedLabel() {
    updateIntervalLabel('active');
  }

  function updateCountLabel() {
    var container = document.getElementById('moments-container');
    if (!container) return;
    var minInput = container.querySelector('#beautifyReplyCountMin');
    var maxInput = container.querySelector('#beautifyReplyCountMax');
    var label = container.querySelector('#countLabel');
    if (!minInput || !maxInput || !label) return;

    var minVal = minInput.value.trim();
    var maxVal = maxInput.value.trim();
    if (!minVal && !maxVal) {
      label.textContent = '随机';
      momentsRemove('moments_reply_count_min');
      momentsRemove('moments_reply_count_max');
      return;
    }

    var min = minVal !== '' ? Math.max(0, Math.min(20, Number(minVal))) : 0;
    var max = maxVal !== '' ? Math.max(0, Math.min(20, Number(maxVal))) : 20;
    if (min > max) { var tmp = min; min = max; max = tmp; }
    label.textContent = min + '~' + max + '条';
    momentsSet('moments_reply_count_min', String(min));
    momentsSet('moments_reply_count_max', String(max));
  }

  function updatePartnerPostLabel() {
    var container = document.getElementById('moments-container');
    if (!container) return;
    var postMin = Math.max(5, Number((container.querySelector('#beautifyPartnerPostMin') || {}).value) || 600);
    var postMax = Math.max(5, Number((container.querySelector('#beautifyPartnerPostMax') || {}).value) || 1800);
    if (postMin > postMax) { var t = postMin; postMin = postMax; postMax = t; }
    var textMin = Math.max(0, Math.min(20, Number((container.querySelector('#beautifyPartnerTextMin') || {}).value) || 0));
    var textMax = Math.max(0, Math.min(20, Number((container.querySelector('#beautifyPartnerTextMax') || {}).value) || 0));
    if (textMin > textMax) { var tt = textMin; textMin = textMax; textMax = tt; }
    var imageChance = clampPercent((container.querySelector('#beautifyPartnerImageChance') || {}).value, 30);
    var voiceChance = clampPercent((container.querySelector('#beautifyPartnerVoiceChance') || {}).value, 15);
    var videoChance = clampPercent((container.querySelector('#beautifyPartnerVideoChance') || {}).value, 10);
    momentsSet('moments_partner_post_min', String(postMin));
    momentsSet('moments_partner_post_max', String(postMax));
    momentsSet('moments_partner_text_min', String(textMin));
    momentsSet('moments_partner_text_max', String(textMax));
    momentsSet('moments_partner_image_chance', String(imageChance));
    momentsSet('moments_partner_voice_chance', String(voiceChance));
    momentsSet('moments_partner_video_chance', String(videoChance));
    var label = container.querySelector('#partnerPostLabel');
    if (label) label.textContent = formatSpeed(postMin) + '~' + formatSpeed(postMax);
    var il = container.querySelector('#partnerImageChanceLabel');
    var vl = container.querySelector('#partnerVoiceChanceLabel');
    var vidl = container.querySelector('#partnerVideoChanceLabel');
    if (il) il.textContent = imageChance + '%';
    if (vl) vl.textContent = voiceChance + '%';
    if (vidl) vidl.textContent = videoChance + '%';
    scheduleNextPartnerMoment();
  }

  function getInteractionDelay(type) {
    var cfg = getIntervalInputConfig(type);
    var minSaved = momentsGet(cfg.minSecondsKey);
    var maxSaved = momentsGet(cfg.maxSecondsKey);
    var min = minSaved !== null ? Number(minSaved) : cfg.defaultMin;
    var max = maxSaved !== null ? Number(maxSaved) : cfg.defaultMax;
    min = Number.isFinite(min) ? Math.max(0, min) : cfg.defaultMin;
    max = Number.isFinite(max) ? Math.max(0, max) : cfg.defaultMax;
    if (min > max) { var tmp = min; min = max; max = tmp; }
    return min === max ? min : min + Math.random() * (max - min);
  }

  function getReplySpeed() {
    return getInteractionDelay('active');
  }

  function getReplyCount() {
    var minSaved = momentsGet('moments_reply_count_min');
    var maxSaved = momentsGet('moments_reply_count_max');
    if (!minSaved && !maxSaved) return -1;
    var min = minSaved ? Number(minSaved) : 0;
    var max = maxSaved ? Number(maxSaved) : 20;
    if (min > max) { var tmp = min; min = max; max = tmp; }
    if (min === max) return min;
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  function scheduleAutoReplyToUserComment(momentId, userComment) {
    if (!momentId) return;
    var delay = getInteractionDelay('reply') * 1000;
    setTimeout(function() {
      respondToUserComment(momentId, userComment);
    }, delay);
  }

  async function respondToUserComment(momentId, userComment) {
    const m = momentsData.find(x => x.id === momentId);
    if (!m || !userComment) return;
    await loadPartnerInfo();
    if (momentsFriends.length === 0) await loadMomentsFriends();
    const objectNames = getPostableMomentAuthors().map(function(f) { return f.name; });
    const momentAuthor = getPostableMomentAuthors().find(function(f) {
      return (m.authorId && f.id === m.authorId) || f.name === m.nickname;
    }) || { name: getPartnerName(), avatar: getPartnerAvatar(), isPartner: true };
    const isObjectMoment = m.author === 'partner' || m.author === 'friend' || objectNames.indexOf(m.nickname) !== -1;
    const isReplyingObject = userComment.replyTo && objectNames.indexOf(userComment.replyTo) !== -1;
    if (!isObjectMoment && !isReplyingObject) return;
    const replyAuthor = isReplyingObject
      ? (getPostableMomentAuthors().find(function(f) { return f.name === userComment.replyTo; }) || momentAuthor)
      : momentAuthor;
    const shouldQuoteUser = isReplyingObject || Math.random() < 0.68;
    const partnerComment = {
      id: createCommentId(),
      name: replyAuthor.name,
      text: buildPartnerCommentText(userComment),
      replyTo: shouldQuoteUser ? userComment.name : undefined,
      time: Date.now()
    };
    m.comments.push(partnerComment);
    if (Math.random() < 0.35) {
      const extraText = buildPartnerCommentText(null);
      if (extraText && extraText !== partnerComment.text) {
        m.comments.push({ id: createCommentId(), name: replyAuthor.name, text: extraText, time: Date.now() + 1 });
      }
    }
    saveMomentsToStorage();
    renderMoments();
    showMomentsNotification(replyAuthor.name, replyAuthor.avatar || getPartnerAvatar(), 'comment', 1, m.id, partnerComment.text, getMomentPreviewImage(m));
    renderMomentsNotificationCard();
  }

  function toggleFriendLikeSwitch() {
    var container = document.getElementById('moments-container');
    if (!container) return;
    var toggleEl = container.querySelector('#toggleFriendLike');
    if (!toggleEl) return;
    var isActive = toggleEl.classList.toggle('active');
    momentsSet('moments_friend_like', isActive ? 'true' : 'false');
  }

  function isFriendLikeEnabled() {
    return momentsGet('moments_friend_like') === 'true';
  }

  function addFriend() {
    var container = document.getElementById('moments-container');
    if (!container) return;
    var input = container.querySelector('#beautifyFriendName');
    var name = input ? input.value.trim() : '';
    if (!name) return;

    // 检查是否已存在
    var exists = momentsFriends.some(function(f) { return f.name === name; });
    if (exists) {
      alert('该对象已存在');
      return;
    }

    momentsFriends.push({
      id: 'friend_' + Date.now(),
      name: name,
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + encodeURIComponent(name) + '&backgroundColor=c0aede',
      isPartner: false
    });
    saveMomentsFriends();
    renderBeautifyFriendsList();
    if (input) input.value = '';
  }

  function removeFriend(friendId) {
    momentsFriends = momentsFriends.filter(function(f) { return f.id !== friendId; });
    saveMomentsFriends();
    renderBeautifyFriendsList();
  }

  function updateFriendAvatar(friendId) {
    editingFriendAvatarId = friendId;
    var container = document.getElementById('moments-container');
    var input = container && container.querySelector('#momentsFriendAvatarInput');
    if (input) input.click();
  }

  function handleFriendAvatarUpload(e) {
    var file = e && e.target && e.target.files && e.target.files[0];
    if (!file || !file.type.startsWith('image/') || !editingFriendAvatarId) return;
    var reader = new FileReader();
    reader.onload = async function(ev) {
      var url = ev.target.result;
      try { url = await compressImage(url, 512, 0.82); } catch(err) {}
      var item = momentsFriends.find(function(f) { return f.id === editingFriendAvatarId; });
      if (item) {
        item.avatar = url;
        if (item.isPartner) {
          const savedPartner = await saveMomentsPartnerAvatar(url);
          if (savedPartner) item.avatar = savedPartner;
        }
        await saveMomentsFriends();
        renderBeautifyFriendsList();
      }
      editingFriendAvatarId = null;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  async function getRandomFriendForLike() {
    if (momentsFriends.length === 0) await loadMomentsFriends();
    if (momentsFriends.length === 0) return null;
    var idx = Math.floor(Math.random() * momentsFriends.length);
    return momentsFriends[idx];
  }

  function updateBeautifyAvatar() {
    const fileInput = document.getElementById('momentsAvatarInput');
    if (fileInput) {
      fileInput.value = '';
      fileInput.click();
    }
  }

  function updateBeautifyPartnerAvatar() {
    const fileInput = document.getElementById('momentsPartnerAvatarInput');
    if (fileInput) {
      fileInput.value = '';
      fileInput.click();
    }
  }

  function handleAvatarUpload(e) {
    const file = e.target.files[0];
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = async function(ev) {
      const rawBase64 = ev.target.result;
      let base64 = rawBase64;
      try { base64 = await compressImage(rawBase64, 512, 0.82); } catch(err) {}
      const container = document.getElementById('moments-container');
      if (container) {
        const preview = container.querySelector('#beautifyAvatarPreview');
        if (preview) {
          preview.src = base64;
          preview.dataset.base64 = base64;
          preview.dataset.uploaded = '1';
          preview.classList.add('uploaded');
        }
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function handlePartnerAvatarUpload(e) {
    const file = e.target.files[0];
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = async function(ev) {
      const rawBase64 = ev.target.result;
      let base64 = rawBase64;
      try { base64 = await compressImage(rawBase64, 512, 0.82); } catch(err) {}
      const container = document.getElementById('moments-container');
      if (container) {
        const preview = container.querySelector('#beautifyPartnerAvatarPreview');
        if (preview) {
          preview.src = base64;
          preview.dataset.base64 = base64;
          preview.dataset.uploaded = '1';
          preview.classList.add('uploaded');
        }
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function updateBeautifyCover() {
    const fileInput = document.getElementById('momentsCoverInput');
    if (fileInput) {
      fileInput.value = '';
      fileInput.click();
    }
  }

  function handleCoverUpload(e) {
    const file = e.target.files[0];
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = function(ev) {
      const base64 = ev.target.result;
      const container = document.getElementById('moments-container');
      if (container) {
        const preview = container.querySelector('#beautifyCoverPreview');
        if (preview) {
          preview.src = base64;
          preview.dataset.base64 = base64;
          preview.dataset.uploaded = '1';
          preview.classList.add('uploaded');
        }
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }



  async function saveBeautify(event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();
    }
    const container = document.getElementById('moments-container');
    if (!container) return;
    const saveBtn = container.querySelector('#momentsBeautifySaveBtn') || container.querySelector('.beautify-header .save-btn');
    if (saveBtn && saveBtn.dataset.saving === '1') return false;
    if (saveBtn) {
      saveBtn.dataset.saving = '1';
      saveBtn.disabled = true;
      saveBtn.textContent = '保存中...';
    }

    try {
      const name = container.querySelector('#beautifyName').value.trim();
      const identity = ((container.querySelector('#beautifyIdentity') || {}).value || '').trim();
      const partnerName = (container.querySelector('#beautifyPartnerName') || {}).value || '';
      const signature = container.querySelector('#beautifySignature').value.trim();
      const avatarPreview = container.querySelector('#beautifyAvatarPreview');
      const partnerAvatarPreview = container.querySelector('#beautifyPartnerAvatarPreview');
      const coverPreview = container.querySelector('#beautifyCoverPreview');
      let avatarChanged = false;
      let coverChanged = false;

      if (name) userConfig.name = name;
      userConfig.identity = identity;
      if (signature) userConfig.signature = signature;
      try {
        momentsSet('moments_profile', JSON.stringify({
          name: userConfig.name,
          identity: userConfig.identity,
          signature: userConfig.signature
        }));
        const profileStr = typeof homeGetItem === 'function' ? homeGetItem('profile_me') : localStorage.getItem('profile_me');
        const profile = profileStr ? JSON.parse(profileStr) : {};
        if (name) profile.name = userConfig.name;
        profile.identity = userConfig.identity;
        if (signature) profile.signature = userConfig.signature;
        if (profile.avatar && !isPersistentAvatar(profile.avatar)) delete profile.avatar;
        safeHomeSet('profile_me', JSON.stringify(profile));
        window.dispatchEvent(new CustomEvent('homeGlobalUpdated', { detail: { key: 'profile_me', value: JSON.stringify(profile) } }));
      } catch(e) {}
      if (partnerName.trim()) {
        saveMomentsPartnerName(partnerName.trim());
      }
      if (partnerAvatarPreview && partnerAvatarPreview.dataset.uploaded === '1' && isValidAvatar(partnerAvatarPreview.dataset.base64)) {
        const savedPartner = await saveMomentsPartnerAvatar(partnerAvatarPreview.dataset.base64);
        if (savedPartner) {
          partnerAvatarPreview.src = savedPartner;
          partnerAvatarPreview.dataset.base64 = savedPartner;
          partnerAvatarPreview.dataset.uploaded = '0';
        }
      }
      syncPartnerFriendItem();
      renderBeautifyFriendsList();

      if (avatarPreview && avatarPreview.dataset.uploaded === '1' && isValidAvatar(avatarPreview.dataset.base64)) {
        const savedAvatar = await persistMomentsImage(MOMENTS_AVATAR_KEY, avatarPreview.dataset.base64, 512, 0.8);
        userConfig.avatar = savedAvatar || avatarPreview.dataset.base64;
        avatarChanged = true;
        safeHomeSet('home_avatar_me', userConfig.avatar);
        await safeHomeSetLarge('home_avatar_me', userConfig.avatar);
        const profileStr = typeof homeGetItem === 'function' ? homeGetItem('profile_me') : localStorage.getItem('profile_me');
        try {
          const profile = profileStr ? JSON.parse(profileStr) : {};
          if (name) profile.name = userConfig.name;
          profile.identity = userConfig.identity;
          if (signature) profile.signature = userConfig.signature;
          profile.avatar = userConfig.avatar;
          safeHomeSet('profile_me', JSON.stringify(profile));
          await safeHomeSetLarge('profile_me', JSON.stringify(profile));
          window.dispatchEvent(new CustomEvent('homeGlobalUpdated', { detail: { key: 'home_avatar_me', value: userConfig.avatar } }));
          window.dispatchEvent(new CustomEvent('homeGlobalUpdated', { detail: { key: 'profile_me', value: JSON.stringify(profile) } }));
        } catch(e) {}
        if (typeof localforage !== 'undefined') {
          try {
            await localforage.setItem(typeof homeKey === 'function' ? homeKey('home_avatar_me') : 'home_avatar_me', userConfig.avatar);
            await localforage.setItem(typeof homeKey === 'function' ? homeKey('profile_me') : 'profile_me', JSON.stringify({ name: userConfig.name, identity: userConfig.identity, signature: userConfig.signature, avatar: userConfig.avatar }));
          } catch(e) {}
        }
        avatarPreview.dataset.uploaded = '0';
      } else {
        await syncAvatarFromHome();
      }
      if (coverPreview && coverPreview.dataset.uploaded === '1' && isValidAvatar(coverPreview.dataset.base64)) {
        const savedCover = await persistMomentsImage(MOMENTS_COVER_KEY, coverPreview.dataset.base64, 1080, 0.7);
        userConfig.coverImage = savedCover || coverPreview.dataset.base64;
        coverChanged = true;
        coverPreview.dataset.uploaded = '0';
      }

      // 先刷新存储中的最新图，再统一更新顶部头像、背景和设置预览图。
      const latestAvatar = await getSavedImage(MOMENTS_AVATAR_KEY);
      const latestCover = await getSavedImage(MOMENTS_COVER_KEY);
      if (latestAvatar) userConfig.avatar = latestAvatar;
      if (latestCover) userConfig.coverImage = latestCover;
      applyMomentsImagesToDom(container);

      await loadMomentsFriends();
      await renderMoments();
      applyMomentsImagesToDom(document.getElementById('moments-container'));

      try {
        if (avatarChanged) window.dispatchEvent(new CustomEvent('homeGlobalUpdated', { detail: { key: 'home_avatar_me', source: 'moments' } }));
      } catch(e) {}

      showBeautifySaveNotification();
      closeBeautifyPanel();
      return false;
    } catch (err) {
      console.error('朋友圈个性设置保存失败:', err);
      const hint = container.querySelector('#longPressHint');
      if (hint) {
        hint.textContent = '保存失败，请重试';
        hint.classList.add('active');
        setTimeout(() => hint.classList.remove('active'), 2000);
      }
      return false;
    } finally {
      if (saveBtn) {
        saveBtn.dataset.saving = '0';
        saveBtn.disabled = false;
        saveBtn.textContent = '保存';
      }
    }
  }

  // ========== 保存成功提示 ==========
  function showBeautifySaveNotification() {
    var container = document.getElementById('moments-container');
    if (!container) return;
    var existing = container.querySelector('.beautify-save-toast');
    if (existing) existing.remove();
    var toast = document.createElement('div');
    toast.className = 'beautify-save-toast';
    toast.innerHTML = '<span style="margin-right:6px;">&#10004;</span>保存成功，朋友圈已更新';
    toast.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(0,0,0,0.75);color:#fff;padding:12px 24px;border-radius:8px;font-size:14px;z-index:999999;pointer-events:none;transition:opacity 0.3s;';
    container.appendChild(toast);
    setTimeout(function() {
      toast.style.opacity = '0';
      setTimeout(function() { toast.remove(); }, 300);
    }, 1800);
  }

  // ========== Virtual Keyboard Adaptation ==========
  function setupVirtualKeyboardAdaptation() {
    const container = document.getElementById('moments-container');
    if (!container) return;
    
    const popup = container.querySelector('#commentPopup');
    const emojiPanel = container.querySelector('#commentEmojiPanel');
    
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => {
        const offset = window.innerHeight - window.visualViewport.height;
        if (offset > 100) {
          // 虚拟键盘弹出
          if (popup && popup.classList.contains('active') && !popup.classList.contains('comment-inline')) {
            popup.style.bottom = offset + 'px';
          }
          if (emojiPanel && emojiPanel.classList.contains('active') && !emojiPanel.classList.contains('comment-inline')) {
            emojiPanel.style.bottom = offset + 'px';
          }
        } else {
          // 虚拟键盘收起。内联评论框不使用 fixed bottom，避免 iOS 留白。
          if (popup && !popup.classList.contains('comment-inline')) popup.style.bottom = '0';
          if (emojiPanel && !emojiPanel.classList.contains('comment-inline')) emojiPanel.style.bottom = '0';
        }
      });
    }
  }

  // ========== Init ==========
  async function init() {
    try {
      // 每次进入朋友圈都从本地存储恢复已发布记录（localforage 优先，确保大数据不丢失）
      loadMomentsFromStorage();
      await loadMomentsFromAllStorage();
      // 同步头像并初始化
      await initUserInfo();
      await loadMomentsFriends();  // 初始化好友列表（包含伴侣和自定义好友）
      await renderMoments();


      
      // 如果有待显示的通知，渲染它们
      if (momentsNotifications.length > 0) {
        renderMomentsNotificationCard();
      }

      // 初始化访客记录系统
      await loadPartnerInfo();
      loadVisitorRecords();
      generateOfflineVisitors();
      startOnlineVisitorTimer();
      updateVisitorBadge();
      startPartnerMomentScheduler();
    } catch (e) {
      console.error('MomentsApp init error:', e);
    }
    
    // 同步日夜模式
    const momentsContainer = document.getElementById('moments-container');
    if (momentsContainer) {
      const savedBg = typeof window.homeGetItem === 'function' ? window.homeGetItem('home_card_bg') : localStorage.getItem('home_card_bg');
      const isDark = savedBg === 'night';
      console.log('[Moments] dark mode sync:', { savedBg, isDark, hasClass: momentsContainer.classList.contains('dark-mode'), homeGetItemExists: typeof window.homeGetItem === 'function' });
      // 直接检查 localStorage 中的所有相关 key
      const allKeys = Object.keys(localStorage).filter(k => k.includes('card_bg'));
      console.log('[Moments] localStorage keys:', allKeys.map(k => ({ key: k, value: localStorage.getItem(k) })));
      momentsContainer.classList.toggle('dark-mode', isDark);
      // 强制应用深色模式样式（调试用）
      if (isDark) {
        momentsContainer.style.background = '#1a1a1a';
        momentsContainer.style.color = '#e0e0e0';
      }
    }
    
    // 设置虚拟键盘适配
    setupVirtualKeyboardAdaptation();
    
    // 监听 Home 页数据更新事件，实时同步头像和昵称
    window.addEventListener('homeGlobalUpdated', async function(e) {
      const key = e.detail.key;
      console.log('[Moments] homeGlobalUpdated received:', key);
      if (key === 'home_avatar_me' || key === 'profile_me') {
        const syncResult = await syncAvatarFromHome();
        console.log('[Moments] syncAvatarFromHome result:', syncResult.name);
        // 更新 DOM 中的头像和昵称
        const container = document.getElementById('moments-container');
        if (container) {
          const avatarEl = container.querySelector('#userAvatar');
          const nameEl = container.querySelector('#userName');
          const identityEl = container.querySelector('#userIdentity');
          const sigEl = container.querySelector('#userSignature');
          console.log('[Moments] Updating DOM, nameEl exists:', !!nameEl, 'userConfig.name:', userConfig.name);
          if (avatarEl) avatarEl.src = userConfig.avatar;
          if (nameEl) nameEl.textContent = userConfig.name;
          if (identityEl) {
            identityEl.textContent = userConfig.identity || '';
            identityEl.style.display = userConfig.identity ? 'inline-flex' : 'none';
          }
          if (sigEl) sigEl.textContent = userConfig.signature;
        }
      }
      // 当 partner 数据变化时，更新好友列表
      if (key === 'home_avatar_partner' || key === 'profile_partner') {
        await loadPartnerInfo();
        syncPartnerFriendItem();
        await initFriendList();
        await renderMoments();
      }
    });

    // 兜底：监听 localStorage 变化（跨页面同步）
    window.addEventListener('storage', async function(e) {
      if (e.key === 'home_avatar_me' || e.key === 'profile_me') {
        await syncAvatarFromHome();
        const container = document.getElementById('moments-container');
        if (container) {
          const avatarEl = container.querySelector('#userAvatar');
          const nameEl = container.querySelector('#userName');
          const identityEl = container.querySelector('#userIdentity');
          const sigEl = container.querySelector('#userSignature');
          if (avatarEl) avatarEl.src = userConfig.avatar;
          if (nameEl) nameEl.textContent = userConfig.name;
          if (identityEl) {
            identityEl.textContent = userConfig.identity || '';
            identityEl.style.display = userConfig.identity ? 'inline-flex' : 'none';
          }
          if (sigEl) sigEl.textContent = userConfig.signature;
        }
      }
      if (e.key === 'home_avatar_partner' || e.key === 'profile_partner') {
        await loadPartnerInfo();
        syncPartnerFriendItem();
        await initFriendList();
        await renderMoments();
      }
    });
    
    // 绑定触摸滑动事件
    const container = document.getElementById('moments-container');
    if (container) {
      const previewEl = container.querySelector('#previewOverlay');
      if (previewEl) {
        let touchStartX = 0;
        previewEl.addEventListener('touchstart', e => {
          touchStartX = e.touches[0].clientX;
        }, { passive: true });
        previewEl.addEventListener('touchend', e => {
          const diff = touchStartX - e.changedTouches[0].clientX;
          if (Math.abs(diff) > 50) {
            if (diff > 0) nextImage();
            else prevImage();
          }
        }, { passive: true });
      }
    }
  }

  // ========== 暴露全局 API ==========
  window.MomentsApp = {
    // 初始化
    init,
    initUserInfo,
    syncAvatarFromHome,
    
    // 渲染
    renderMoments,
    
    // 时间格式化
    formatMomentTime,
    
    // 交互
    toggleTextExpand,
    toggleLike,
    toggleComment,
    toggleCollect,
    replyToComment,
    submitComment,
    toggleCommentEmojiPanel,
    closeCommentEmojiPanel,
    switchCommentEmojiTab,
    insertCommentEmoji,
    selectCommentSticker,
    removePendingCommentSticker,
    triggerAutoReply,
    publishPartnerMoment,
    
    // 通知
    updateMomentsBadge,
    clearMomentsBadge,
    showMomentsNotification,
    hideMomentsNotificationCard,
    scrollToFirstNotifiedMoment,
    renderMomentsNotificationCard,
    openNotificationDetailPanel,
    closeNotificationDetailPanel,
    renderNotificationDetailList,
    clearAllNotifications,
    
    // 搜索
    openSearchPanel,
    closeSearchPanel,
    handleSearchInput,
    clearSearchInput,
    handleTimeFilterChange,
    setQuickTime,
    clearTimeFilter,
    scrollToMoment,
    
    // 相册
    openAlbumPanel,
    closeAlbumPanel,
    toggleAlbumExpand,
    renderAlbum,
    setAlbumQuickTime,
    clearAlbumTimeFilter,
    
    // 收藏
    openCollectionPanel,
    closeCollectionPanel,
    
    // 发布
    openPublishPanel,
    triggerAddPhoto,
    removeDemoPhoto,
    triggerAddVideo,
    removePublishVideo,
    publishMoment,
    handlePhotoUpload,
    handleVideoUpload,
    handleEditPhotoUpload,
    
    // 评论
    openComment,
    editComment,
    saveCommentEdit,
    cancelCommentEdit,
    deleteComment,
    closeCommentActionMenus,
    openCommentActionMenu,
    
    // 自定义
    openCustomLikePanel,
    openCustomCommentPanel,
    closeCustomPanel,
    confirmCustom,
    toggleSelectAllFriends,
    
    // 编辑
    openEditPanel,
    closeEditPanel,
    saveEdit,
    deleteMoment,
    deleteMomentById,
    toggleMomentManageMenu,
    closeMomentManageMenus,
    addEditImage,
    removeEditImage,
    openEditLocationPanel,
    openEditMentionPanel,
    
    // 提醒
    openMentionPanel,
    closeMentionPanel,
    renderMentionList,
    filterMentions,
    toggleMention,
    confirmMentions,
    
    // 位置
    openLocationPanel,
    closeLocationPanel,
    confirmLocation,
    
    // 预览
    openPreview,
    openStickerPreview,
    closePreview,
    prevImage,
    nextImage,
    togglePublishStickerPanel,
    closePublishStickerPanel,
    selectPublishSticker,
    removePublishSticker,
    addPublishLink,
    removePublishLink,
    playVideo,
    toggleVideoPlay,
    toggleMomentVoice,
    toggleMomentMusic,
    toggleMomentLinkFrame,
    goToMomentDetail,
    
    // 面板
    closeAllPanels,
    
    // 个性化
    openBeautifyPanel,
    closeBeautifyPanel,
    updateBeautifyAvatar,
    updateBeautifyPartnerAvatar,
    updateBeautifyCover,
    handleAvatarUpload,
    handlePartnerAvatarUpload,
    handleCoverUpload,
    saveBeautify,
    
    // 好友列表
    toggleFriendLikeSwitch,
    updateIntervalLabel,
    updateSpeedLabel,
    updateCountLabel,
    updatePartnerPostLabel,
    addFriend,
    removeFriend,
    updateFriendAvatar,
    handleFriendAvatarUpload,
    renderBeautifyFriendsList,

    // 访客记录
    openVisitorPanel,
    closeVisitorPanel,
    deleteVisitorRecord,
    clearAllVisitors,
    updateVisitorBadge,
    clearVisitorBadge,
    stopOnlineVisitorTimer,
    _visitorTouchStart,
    _visitorTouchMove,
    _visitorTouchEnd
  };

  // 伴侣动态定时器不依赖手动测试按钮；页面加载后自动按设置间隔运行。
  setTimeout(() => {
    try { startPartnerMomentScheduler(); } catch (e) {}
  }, 1200);

})();
