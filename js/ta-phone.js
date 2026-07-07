/**
 * TA的手机 - 系统自动收藏用户发过的朋友圈和聊天内容
 */
(function() {
    'use strict';

    const STORAGE_KEY = 'ta_phone_collections';
    const CHAT_CHANCE = 0.02;     // 聊天实时收藏概率 2%
    const MOMENTS_CHANCE = 0.10;  // 朋友圈实时收藏概率 10%
    const CHAT_HISTORY_CHANCE = 0.03;    // 历史聊天收藏概率 3%
    const MOMENTS_HISTORY_CHANCE = 0.05; // 历史朋友圈收藏概率 5%

    let collections = { chat: [], moments: [] };
    let chatSortMode = 'collected'; // 'collected' 按收藏时间, 'original-asc' 按发言时间正序, 'original-desc' 按发言时间倒序

    function currentObjectId() {
        return (window.SESSION_ID || location.hash.replace(/^#/, '') || 'default').replace(/[^\w-]/g, '_');
    }

    function scopedMomentsKey(key) {
        return 'moments_' + currentObjectId() + '_' + key;
    }

    function normalizeTimestamp(value) {
        if (value instanceof Date) return value.getTime();
        if (typeof value === 'number') return value;
        if (typeof value === 'string') {
            const n = Number(value);
            if (Number.isFinite(n)) return n;
            const parsed = Date.parse(value);
            if (Number.isFinite(parsed)) return parsed;
        }
        return Date.now();
    }

    // 加载收藏数据
    function loadCollections() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                collections.chat = Array.isArray(parsed.chat) ? parsed.chat : [];
                collections.moments = Array.isArray(parsed.moments) ? parsed.moments : [];
            }
        } catch(e) {}
        if (!Array.isArray(collections.chat)) collections.chat = [];
        if (!Array.isArray(collections.moments)) collections.moments = [];
    }

    // 保存收藏数据
    function saveCollections() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(collections));
        } catch(e) {
            console.warn('[TA的手机] 保存收藏失败:', e);
        }
    }

    function hasCollection(type, content, originalTime, extra) {
        if (!collections[type]) collections[type] = [];
        const t = normalizeTimestamp(originalTime);
        const momentId = extra && extra.momentId !== undefined ? String(extra.momentId) : '';
        return collections[type].some(item => {
            if (momentId && item.momentId !== undefined && String(item.momentId) === momentId) return true;
            return String(item.content || '') === String(content || '') && normalizeTimestamp(item.originalTime) === t;
        });
    }

    // 添加收藏
    function addCollection(type, content, originalTime, extra) {
        content = String(content || '').trim();
        if (!content) return false;
        const ts = normalizeTimestamp(originalTime);
        if (hasCollection(type, content, ts, extra)) return false;
        const item = {
            id: Date.now() + Math.random(),
            content: content,
            originalTime: ts,
            collectedTime: Date.now()
        };
        if (extra) {
            if (extra.msgType) item.msgType = extra.msgType;
            if (extra.shareData) item.shareData = extra.shareData;
            if (extra.momentId !== undefined) item.momentId = extra.momentId;
            if (extra.author) item.author = extra.author;
            if (extra.imagesCount) item.imagesCount = extra.imagesCount;
            if (extra.hasVideo) item.hasVideo = true;
            if (extra.hasSticker) item.hasSticker = true;
            if (extra.linkTitle) item.linkTitle = extra.linkTitle;
        }
        collections[type].unshift(item);
        saveCollections();
        return true;
    }

    // 删除收藏（带确认提示）
    function deleteCollection(type, id) {
        if (!confirm('是否要偷偷取消他的收藏？')) return;
        collections[type] = collections[type].filter(item => item.id !== id);
        saveCollections();
        renderList(type);
    }

    // 尝试收藏聊天消息（返回是否收藏成功）
    function tryCollectChat(text, timestamp, msgRef) {
        if (!text || text.trim().length === 0) return false;
        if (Math.random() < CHAT_CHANCE) {
            var extra = null;
            if (msgRef && typeof msgRef === 'object') {
                msgRef.taPhoneCollected = true;
                if (msgRef.type === 'share' && msgRef.shareData) {
                    extra = { msgType: msgRef.type, shareData: msgRef.shareData };
                }
            }
            addCollection('chat', text.trim(), timestamp, extra);
            return true;
        }
        return false;
    }

    function buildMomentContent(moment, fallbackText) {
        const text = String(fallbackText || (moment && moment.text) || '').trim();
        if (text) return text;
        if (moment && moment.link && moment.link.title) return '【链接：' + moment.link.title + '】';
        if (moment && moment.video) return '【视频朋友圈】' + (moment.video.duration ? ' ' + moment.video.duration : '');
        if (moment && moment.sticker) return '【表情朋友圈】';
        if (moment && Array.isArray(moment.images) && moment.images.length > 0) return '【图片朋友圈】' + moment.images.length + '张';
        return '';
    }

    function isUserMoment(moment) {
        if (!moment || typeof moment !== 'object') return false;
        // 新版自己发布的朋友圈会带 author: 'me'；旧数据可能没有 author，按用户旧数据兼容处理。
        if (moment.author === 'me' || moment.author === 'user') return true;
        if (!moment.author && !moment.authorId) return true;
        return false;
    }

    function getMomentExtra(momentRef) {
        if (!momentRef || typeof momentRef !== 'object') return null;
        return {
            momentId: momentRef.id,
            author: momentRef.author,
            imagesCount: Array.isArray(momentRef.images) ? momentRef.images.length : 0,
            hasVideo: !!momentRef.video,
            hasSticker: !!momentRef.sticker,
            linkTitle: momentRef.link && momentRef.link.title ? momentRef.link.title : ''
        };
    }

    // 尝试收藏朋友圈（返回是否收藏成功）
    function tryCollectMoment(text, timestamp, momentRef) {
        if (momentRef && !isUserMoment(momentRef)) return false;
        const content = buildMomentContent(momentRef, text);
        if (!content) return false;
        const ts = normalizeTimestamp(timestamp || (momentRef && momentRef.time));
        const extra = getMomentExtra(momentRef);
        if (hasCollection('moments', content, ts, extra)) return false;
        if (Math.random() < MOMENTS_CHANCE) {
            const added = addCollection('moments', content, ts, extra);
            // 在原始朋友圈上打标记
            if (added && momentRef && typeof momentRef === 'object') {
                momentRef.taPhoneCollected = true;
            }
            return added;
        }
        return false;
    }

    async function readStoredMoments() {
        if (window.MomentsApp && typeof window.MomentsApp.getMomentsData === 'function') {
            const live = window.MomentsApp.getMomentsData();
            if (Array.isArray(live) && live.length > 0) return live;
        }

        const candidates = [];
        if (typeof localforage !== 'undefined') {
            try { candidates.push(await localforage.getItem(scopedMomentsKey('moments_data_v2'))); } catch(e) {}
            try { candidates.push(await localforage.getItem('moments_data_v2')); } catch(e) {}
        }
        try {
            const scopedRaw = localStorage.getItem(scopedMomentsKey('moments_data'));
            if (scopedRaw) candidates.push(JSON.parse(scopedRaw));
        } catch(e) {}
        try {
            const legacyRaw = localStorage.getItem('moments_data');
            if (legacyRaw) candidates.push(JSON.parse(legacyRaw));
        } catch(e) {}

        for (const item of candidates) {
            if (Array.isArray(item) && item.length > 0) return item;
        }
        return [];
    }

    function scanChatHistory() {
        if (typeof messages === 'undefined' || !Array.isArray(messages)) return 0;
        let count = 0;
        messages.forEach(msg => {
            // 跳过已标记的消息
            if (msg.taPhoneCollected) return;
            if (msg.sender === 'user' && msg.text && String(msg.text).trim()) {
                const text = String(msg.text).trim();
                const ts = normalizeTimestamp(msg.timestamp);
                var extra = null;
                if (msg.type === 'share' && msg.shareData) {
                    extra = { msgType: msg.type, shareData: msg.shareData };
                }
                if (!hasCollection('chat', text, ts, extra) && Math.random() < CHAT_HISTORY_CHANCE) {
                    if (addCollection('chat', text, ts, extra)) {
                        msg.taPhoneCollected = true;
                        count++;
                    }
                }
            }
        });
        return count;
    }

    async function scanMomentsHistory(momentList) {
        const list = Array.isArray(momentList) ? momentList : await readStoredMoments();
        if (!Array.isArray(list) || list.length === 0) return 0;
        let count = 0;
        list.forEach(moment => {
            // 跳过已标记的朋友圈；只收藏用户自己发过的朋友圈
            if (moment.taPhoneCollected || !isUserMoment(moment)) return;
            const content = buildMomentContent(moment);
            if (!content) return;
            const ts = normalizeTimestamp(moment.time || moment.timestamp || moment.id);
            const extra = getMomentExtra(moment);
            if (!hasCollection('moments', content, ts, extra) && Math.random() < MOMENTS_HISTORY_CHANCE) {
                if (addCollection('moments', content, ts, extra)) {
                    moment.taPhoneCollected = true;
                    count++;
                }
            }
        });
        return count;
    }

    // 扫描历史内容（只扫描未标记的消息）
    async function scanHistory() {
        scanChatHistory();
        return scanMomentsHistory();
    }

    // 格式化时间
    function formatTime(timestamp) {
        const date = new Date(timestamp);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hour = String(date.getHours()).padStart(2, '0');
        const minute = String(date.getMinutes()).padStart(2, '0');
        return `${year}-${month}-${day} ${hour}:${minute}`;
    }

    // 渲染列表
    function renderList(type) {
        const listEl = document.getElementById('ta-phone-list');
        if (!listEl) return;

        let items = collections[type];
        if (items.length === 0) {
            listEl.innerHTML = '<div class="ta-phone-empty">TA还没有收藏任何内容...</div>';
            return;
        }

        // 聊天支持排序
        if (type === 'chat' && chatSortMode === 'original-asc') {
            items = [...items].sort((a, b) => (a.originalTime || 0) - (b.originalTime || 0));
        } else if (type === 'chat' && chatSortMode === 'original-desc') {
            items = [...items].sort((a, b) => (b.originalTime || 0) - (a.originalTime || 0));
        } else {
            items = [...items].sort((a, b) => (b.collectedTime || 0) - (a.collectedTime || 0));
        }

        listEl.innerHTML = items.map(item => {
            const meta = `发送于: ${formatTime(item.originalTime)} | 收藏于: ${formatTime(item.collectedTime)}`;
            // 商品消息显示为【商品：xxx】
            var displayText = item.content;
            if (item.msgType === 'share' && item.shareData && item.shareData.name) {
                displayText = '【商品：' + item.shareData.name + '】';
            }
            return `
                <div class="ta-phone-item">
                    <button class="ta-phone-item-delete" onclick="window.TaPhoneApp.deleteCollection('${type}', ${item.id})" title="删除">×</button>
                    <div class="ta-phone-item-time">${formatTime(item.originalTime)}</div>
                    <div class="ta-phone-item-text">${escapeHtml(displayText)}</div>
                    <div class="ta-phone-item-meta">${meta}</div>
                </div>
            `;
        }).join('');
    }

    function setChatSortMode(mode) {
        chatSortMode = mode;
        // 更新按钮样式
        document.querySelectorAll('#ta-phone-sort-bar button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.sort === mode);
        });
        renderList('chat');
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // 渲染礼物柜
    function renderGiftCabinet() {
        const listEl = document.getElementById('ta-phone-list');
        if (!listEl) return;

        // 优先从 ShopApp 获取（IndexedDB 数据）
        let gifts = [];
        if (window.ShopApp && typeof window.ShopApp.getGiftCabinet === 'function') {
            gifts = window.ShopApp.getGiftCabinet();
        }
        // 兜底从 localStorage 读取
        if (!gifts || gifts.length === 0) {
            try {
                const saved = localStorage.getItem('shop_gift_cabinet');
                if (saved) gifts = JSON.parse(saved);
            } catch(e) {}
        }

        if (!gifts || gifts.length === 0) {
            listEl.innerHTML = '<div class="ta-phone-empty">礼物柜还是空的，快去商城给TA买礼物吧~</div>';
            return;
        }

        listEl.innerHTML = gifts.map((item, idx) => {
            const replyPreview = item.replies && item.replies.length > 0
                ? `<div style="margin-top:8px;padding:8px;background:rgba(233,69,96,0.08);border-radius:8px;font-size:0.78rem;color:#c0392b;line-height:1.4;">${item.replies[0].text}</div>`
                : '';
            return `
                <div class="ta-phone-item">
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
                        <span style="font-size:1.5rem;">${item.icon || '📦'}</span>
                        <div style="flex:1;">
                            <div style="font-weight:600;font-size:0.9rem;">${item.name}</div>
                            <div style="font-size:0.72rem;color:var(--text-light);">¥${item.price} x ${item.qty}</div>
                        </div>
                    </div>
                    <div class="ta-phone-item-time">${formatTime(item.time)}</div>
                    ${item.remark ? `<div style="font-size:0.78rem;color:#b37400;margin-top:4px;">备注: ${escapeHtml(item.remark)}</div>` : ''}
                    ${replyPreview}
                    ${item.replies && item.replies.length > 1 ? `<button style="margin-top:8px;background:none;border:none;color:var(--accent-color);font-size:0.75rem;cursor:pointer;" onclick="window.TaPhoneApp.showGiftReplies(${idx})">查看全部回复 (${item.replies.length}条)</button>` : ''}
                </div>
            `;
        }).join('');
    }

    // 显示礼物柜中的回复
    function showGiftReplies(idx) {
        // 隐藏排序栏（礼物柜回复页面不需要）
        const sortBar = document.getElementById('ta-phone-sort-bar');
        if (sortBar) sortBar.style.display = 'none';

        let gifts = [];
        // 优先从 ShopApp 获取（与 renderGiftCabinet 保持一致）
        if (window.ShopApp && typeof window.ShopApp.getGiftCabinet === 'function') {
            gifts = window.ShopApp.getGiftCabinet();
        }
        if (!gifts || gifts.length === 0) {
            try {
                const saved = localStorage.getItem('shop_gift_cabinet');
                if (saved) gifts = JSON.parse(saved);
            } catch(e) {}
        }
        const item = gifts[idx];
        if (!item || !item.replies) return;

        const listEl = document.getElementById('ta-phone-list');
        listEl.innerHTML = `
            <div style="margin-bottom:12px;">
                <button class="ta-phone-back" onclick="window.TaPhoneApp.showTaPhoneTab('gifts')" style="margin-bottom:10px;">← 返回礼物柜</button>
                <div style="display:flex;align-items:center;gap:10px;">
                    <span style="font-size:2rem;">${item.icon || '📦'}</span>
                    <div>
                        <div style="font-weight:700;">${item.name}</div>
                        <div style="font-size:0.8rem;color:var(--text-light);">¥${item.price} x ${item.qty}</div>
                    </div>
                </div>
            </div>
            ${item.replies.map(r => `
                <div style="background:var(--primary-bg);border-radius:10px;padding:12px;margin-bottom:10px;border:1px solid var(--border-color);">
                    <div style="font-size:0.72rem;color:var(--text-light);margin-bottom:6px;">${r.time || ''}</div>
                    <div style="font-size:0.88rem;line-height:1.5;">${r.text || ''}</div>
                    ${r.img ? `<img src="${r.img}" style="max-width:100%;border-radius:8px;margin-top:6px;">` : ''}
                </div>
            `).join('')}
        `;
    }

    // 显示TA的手机弹窗
    function showTaPhone() {
        const container = document.getElementById('ta-phone-container');
        if (!container) return;
        // 确保容器在 body 下
        if (container.parentElement !== document.body) {
            document.body.appendChild(container);
        }
        container.style.display = 'flex';
        showDesktop();
    }

    // 隐藏TA的手机弹窗
    function hideTaPhone() {
        const container = document.getElementById('ta-phone-container');
        if (container) {
            container.style.display = 'none';
        }
        showDesktop();
    }

    // 显示桌面
    function showDesktop() {
        const desktop = document.querySelector('.ta-phone-desktop');
        const content = document.getElementById('ta-phone-content');
        if (desktop) desktop.style.display = 'flex';
        if (content) content.style.display = 'none';
        updateTitle('TA的手机');
    }

    // 一级级返回
    function goBack() {
        const content = document.getElementById('ta-phone-content');
        if (content && content.style.display !== 'none') {
            // 当前在内容列表，返回桌面
            showDesktop();
        } else {
            // 当前在桌面，关闭弹窗
            hideTaPhone();
        }
    }

    // 更新标题
    function updateTitle(text) {
        const titleEl = document.getElementById('ta-phone-header-title');
        if (titleEl) titleEl.textContent = text;
    }

    // 显示标签内容
    function showTaPhoneTab(type) {
        const desktop = document.querySelector('.ta-phone-desktop');
        const content = document.getElementById('ta-phone-content');
        if (desktop) desktop.style.display = 'none';
        if (content) content.style.display = 'flex';

        document.querySelectorAll('.ta-phone-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === type);
        });

        if (type === 'gifts') {
            updateTitle('礼物柜');
            renderGiftCabinet();
            const sortBar = document.getElementById('ta-phone-sort-bar');
            if (sortBar) sortBar.style.display = 'none';
        } else {
            updateTitle(type === 'chat' ? '聊天' : '朋友圈');
            renderList(type);
            if (type === 'moments') {
                scanMomentsHistory().then(function() { renderList('moments'); }).catch(function(e) {
                    console.warn('[TA的手机] 扫描朋友圈历史失败:', e);
                });
            }
            // 聊天页显示排序选项
            const sortBar = document.getElementById('ta-phone-sort-bar');
            if (sortBar) {
                sortBar.style.display = type === 'chat' ? 'flex' : 'none';
            }
        }
    }

    // 动态注入 CSS
    function injectStyles() {
        if (document.getElementById('ta-phone-styles')) return;
        const style = document.createElement('style');
        style.id = 'ta-phone-styles';
        style.textContent = `
            /* 弹窗遮罩 + 居中弹窗 */
            .ta-phone-container {
                position: fixed !important;
                top: 0 !important; left: 0 !important; right: 0 !important; bottom: 0 !important;
                z-index: 90000 !important;
                display: flex;
                align-items: center;
                justify-content: center;
                background: rgba(0,0,0,0.5) !important;
            }
            /* 弹窗卡片 */
            .ta-phone-modal {
                background: var(--primary-bg, #16213e);
                border-radius: 16px;
                width: 320px;
                max-height: 70vh;
                overflow: hidden;
                box-shadow: 0 10px 40px rgba(0,0,0,0.3);
                display: flex;
                flex-direction: column;
            }
            /* 弹窗主体 */
            .ta-phone-header {
                background: var(--primary-bg, #16213e);
                border-radius: 16px 16px 0 0;
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 14px 18px;
                border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.08));
            }
            .ta-phone-back {
                background: none;
                border: none;
                color: var(--accent-color, #e94560);
                font-size: 0.9rem;
                cursor: pointer;
            }
            .ta-phone-title {
                font-weight: 700;
                font-size: 1rem;
                color: var(--text, #e0e0e0);
            }
            /* 桌面区域（弹窗内部） */
            .ta-phone-desktop {
                display: flex;
                justify-content: center;
                align-items: center;
                gap: 36px;
                padding: 50px 20px;
                flex-shrink: 0;
            }
            .ta-phone-app {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 8px;
                cursor: pointer;
            }
            .ta-phone-app:active {
                opacity: 0.7;
            }
            .ta-phone-app-icon {
                width: 56px;
                height: 56px;
                border-radius: 14px;
                display: flex;
                align-items: center;
                justify-content: center;
                background: var(--border-color, rgba(255,255,255,0.08));
                color: var(--text, #e0e0e0);
            }
            .ta-phone-app-icon svg {
                width: 28px;
                height: 28px;
            }
            .ta-phone-app-name {
                font-size: 0.8rem;
                color: var(--text-light, #a0a0a0);
            }
            /* 内容列表区域 */
            .ta-phone-content {
                display: flex;
                flex-direction: column;
                overflow: hidden;
            }
            .ta-phone-tabs {
                display: flex;
                border-bottom: 1px solid var(--border-color, rgba(255,255,255,0.08));
                flex-shrink: 0;
            }
            .ta-phone-tab {
                flex: 1;
                padding: 10px;
                background: none;
                border: none;
                border-bottom: 2px solid transparent;
                color: var(--text-light, #a0a0a0);
                font-size: 0.85rem;
                cursor: pointer;
            }
            .ta-phone-tab.active {
                color: var(--accent-color, #e94560);
                border-bottom-color: var(--accent-color, #e94560);
            }
            .ta-phone-list {
                flex: 1;
                overflow-y: auto;
                padding: 10px;
            }
            .ta-phone-item {
                background: var(--secondary-bg, #1a1a2e);
                border-radius: 10px;
                padding: 12px;
                margin-bottom: 8px;
                position: relative;
            }
            .ta-phone-item-time {
                font-size: 0.72rem;
                color: var(--text-light, #a0a0a0);
                margin-bottom: 4px;
            }
            .ta-phone-item-text {
                font-size: 0.88rem;
                color: #000000;
                line-height: 1.5;
                word-break: break-all;
            }
            html[data-theme="dark"] .ta-phone-item-text {
                color: #ffffff;
            }
            .ta-phone-item-meta {
                font-size: 0.72rem;
                color: var(--text-light, #a0a0a0);
                margin-top: 4px;
            }
            .ta-phone-sort-btn.active {
                border-color: var(--accent-color, #e94560) !important;
                color: var(--accent-color, #e94560) !important;
            }
            .ta-phone-item-delete {
                position: absolute;
                top: 8px;
                right: 8px;
                background: none;
                border: none;
                color: var(--text-light, #a0a0a0);
                font-size: 1.1rem;
                cursor: pointer;
                opacity: 0.5;
                line-height: 1;
            }
            .ta-phone-item-delete:hover {
                opacity: 1;
                color: #ef4444;
            }
            .ta-phone-empty {
                text-align: center;
                padding: 30px;
                color: var(--text-light, #a0a0a0);
                font-size: 0.85rem;
            }
        `;
        document.head.appendChild(style);
    }

    let _historyScanned = false;

    // 初始化
    function init() {
        injectStyles();
        loadCollections();
        if (!_historyScanned) {
            _historyScanned = true;
            setTimeout(scanHistory, 2000);
        }
        if (!window.__taPhoneMomentsBridgeBound) {
            window.__taPhoneMomentsBridgeBound = true;
            window.addEventListener('moments:data-ready', function(e) {
                const list = e && e.detail && Array.isArray(e.detail.moments) ? e.detail.moments : null;
                scanMomentsHistory(list).catch(function(err) { console.warn('[TA的手机] 朋友圈数据就绪扫描失败:', err); });
            });
            window.addEventListener('moments:published', function(e) {
                // 朋友圈发布时 moments.js 已经直接调用 tryCollectMoment；这里仅保留事件监听位，
                // 避免未来别的入口只派事件时断线，但不重复抽概率。
                const moment = e && e.detail && e.detail.moment;
                if (moment && moment.taPhoneCollected) saveCollections();
            });
        }
    }

    // 暴露到全局
    window.TaPhoneApp = {
        init,
        showTaPhone,
        hideTaPhone,
        goBack,
        showDesktop,
        showTaPhoneTab,
        deleteCollection,
        tryCollectChat,
        tryCollectMoment,
        scanHistory,
        scanMomentsHistory,
        showGiftReplies,
        setChatSortMode
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
