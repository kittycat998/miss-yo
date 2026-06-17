/*核心应用逻辑：数据加载保存、消息渲染、会话管理等*/

        function clearAllAppData() {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.6);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s ease;';
    overlay.innerHTML = `
        <div style="background:var(--secondary-bg);border-radius:20px;padding:24px;width:88%;max-width:340px;box-shadow:0 20px 60px rgba(0,0,0,0.4);animation:modalContentSlideIn 0.3s ease forwards;">
            <div style="text-align:center;margin-bottom:20px;">
                <div style="width:52px;height:52px;border-radius:50%;background:rgba(255,80,80,0.12);display:flex;align-items:center;justify-content:center;margin:0 auto 12px;">
                    <i class="fas fa-trash-alt" style="color:#ff5050;font-size:20px;"></i>
                </div>
                <div style="font-size:16px;font-weight:700;color:var(--text-primary);margin-bottom:6px;">重置数据</div>
                <div style="font-size:12px;color:var(--text-secondary);">请选择要重置的范围</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:10px;">
                <button id="_reset_current" style="width:100%;padding:12px 16px;border:1px solid var(--border-color);border-radius:12px;background:var(--primary-bg);color:var(--text-primary);font-size:13px;font-weight:600;cursor:pointer;text-align:left;display:flex;align-items:center;gap:10px;transition:all 0.2s;">
                    <i class="fas fa-comment-slash" style="color:var(--accent-color);font-size:15px;width:18px;text-align:center;"></i>
                    <span>仅清除当前会话消息</span>
                </button>
                <button id="_reset_all" style="width:100%;padding:12px 16px;border:1px solid rgba(255,80,80,0.3);border-radius:12px;background:rgba(255,80,80,0.06);color:#ff5050;font-size:13px;font-weight:600;cursor:pointer;text-align:left;display:flex;align-items:center;gap:10px;transition:all 0.2s;">
                    <i class="fas fa-bomb" style="font-size:15px;width:18px;text-align:center;"></i>
                    <span>重置所有数据（完全清空）</span>
                </button>
                <button id="_reset_cancel" style="width:100%;padding:10px 16px;border:none;border-radius:12px;background:none;color:var(--text-secondary);font-size:13px;cursor:pointer;transition:all 0.2s;">取消</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    function closeDialog() { overlay.remove(); }
    overlay.addEventListener('click', e => { if (e.target === overlay) closeDialog(); });
    const _resetCancelBtn = document.getElementById('_reset_cancel');
    const _resetCurrentBtn = document.getElementById('_reset_current');
    const _resetAllBtn = document.getElementById('_reset_all');

    if (_resetCancelBtn) _resetCancelBtn.onclick = closeDialog;

    if (_resetCurrentBtn) _resetCurrentBtn.onclick = () => {
        closeDialog();
        if (confirm('确定要清除当前会话的所有消息吗？此操作无法恢复！')) {
            messages = [];
            window.messages = messages; // 双保险：同步 window 属性
            displayedMessageCount = HISTORY_BATCH_SIZE;

            // 立即清除 localStorage 备份，防止 _tryRecoverFromBackup 在 IndexedDB 写入前恢复旧消息
            try { localStorage.removeItem('BACKUP_V1_critical'); } catch(e) {}
            try { localStorage.removeItem('BACKUP_V1_timestamp'); } catch(e) {}

            // 直接写入 IndexedDB（跳过 500ms 防抖），确保刷新后不恢复
            localforage.setItem(getStorageKey('chatMessages'), []).catch(() => {});

            renderMessages();
            showNotification('当前会话消息已清除', 'success');
        }
    };

    if (_resetAllBtn) _resetAllBtn.onclick = () => {
        closeDialog();
        if (confirm('【高危操作】确定要重置所有数据吗？此操作将清除所有本地数据且无法恢复！')) {
            window._skipBackup = true;
            messages = [];
            settings = {};
            localforage.clear().then(() => {
                localStorage.clear();
                showNotification('所有数据已重置，页面即将刷新', 'info', 2000);
                setTimeout(() => { window.location.href = window.location.pathname + '?reset=' + Date.now(); }, 2000);
            }).catch(e => {
                window._skipBackup = false;
                showNotification('清除数据时发生错误', 'error');
                console.error("清除 localforage 失败:", e);
            });
        }
    };
}

function loadMoreHistory() {
    if (window.__chatLocateWindow) {
        if (typeof showNotification === 'function') showNotification('正在定位查看旧消息，先点“回到最新消息”再加载更多', 'info', 1600);
        return;
    }
    const historyLoader = document.getElementById('history-loader');
    const container = DOMElements && DOMElements.chatContainer;
    const currentOldestMsgIndex = messages.length - displayedMessageCount;

    if (!container) return;
    if (isLoadingHistory) return;

    if (currentOldestMsgIndex <= 0) {
        if (historyLoader) historyLoader.style.display = 'none';
        return;
    }

    isLoadingHistory = true;
    if (historyLoader) historyLoader.style.display = 'flex';

    const visibleWrappers = Array.from(container.querySelectorAll('.message-wrapper'));
    const firstVisible = visibleWrappers.find(function(el) {
        return el.offsetTop + el.offsetHeight >= container.scrollTop;
    }) || visibleWrappers[0] || null;

    const anchorId = firstVisible ? firstVisible.dataset.msgId : null;
    const anchorTop = firstVisible ? firstVisible.getBoundingClientRect().top : 0;

    const prevVisibility = container.style.visibility;
    const prevOverflow = container.style.overflow;
    const prevScrollBehavior = container.style.scrollBehavior;
    const prevOpacity = container.style.opacity;

    container.style.opacity = '0.015';
    container.style.visibility = 'hidden';
    container.style.overflow = 'hidden';
    container.style.scrollBehavior = 'auto';

    setTimeout(() => {
        displayedMessageCount = Math.min(messages.length, displayedMessageCount + HISTORY_BATCH_SIZE);
        renderMessages(true);

        requestAnimationFrame(() => {
            if (anchorId) {
                const newAnchor = container.querySelector('[data-msg-id="' + anchorId + '"]');
                if (newAnchor) {
                    const newTop = newAnchor.getBoundingClientRect().top;
                    container.scrollTop += (newTop - anchorTop);
                }
            }

            requestAnimationFrame(() => {
                container.style.opacity = prevOpacity || '';
                container.style.visibility = prevVisibility || '';
                container.style.overflow = prevOverflow || '';
                container.style.scrollBehavior = prevScrollBehavior || '';

                if (historyLoader) {
                    historyLoader.style.display = (messages.length > displayedMessageCount) ? 'flex' : 'none';
                }
                isLoadingHistory = false;
            });
        });
    }, 120);
}


        function getDefaultSettings() {
            return {
                partnerName: "梦角",
                myName: "我",
                myStatus: "在线",
                partnerStatus: "在线",
                isDarkMode: false,
                colorTheme: "gold",
                soundEnabled: true,
                typingIndicatorEnabled: true,
                readReceiptsEnabled: true,
                replyEnabled: true,
                lastStatusChange: Date.now(),
                nextStatusChange: 1 + Math.random() * 7,
                fontSize: 16,
                bubbleStyle: 'standard',
                messageFontFamily: "'Noto Serif SC', serif",
                messageFontWeight: 400,
                messageLineHeight: 1.5,
                musicPlayerEnabled: false,
                replyDelayMin: 3000,
                replyDelayMax: 7000,
                inChatAvatarEnabled: true,
                inChatAvatarSize: 36,
                inChatAvatarPosition: 'center',
                alwaysShowAvatar: false,
                showPartnerNameInChat: false,
                customFontUrl: "", 
        customBubbleCss: "",
        customGlobalCss: "",
                myAvatarFrame: null, 
                partnerAvatarFrame: null,
                myAvatarShape: 'circle',
                partnerAvatarShape: 'circle',
autoSendEnabled: false,
autoSendInterval: 5,
        moyuAutoGenerateEnabled: false,
        moyuAutoGenerateInterval: 60,
        moyuShowDetail: true,
        // 信封投递设置
        envelopeAutoSendEnabled: false,
        envelopeAutoSendMinVal: 1,
        envelopeAutoSendMinUnit: 'hours',
        envelopeAutoSendMaxVal: 3,
        envelopeAutoSendMaxUnit: 'hours',
        envelopeCustomRuleEnabled: false,
        envelopeReplyMinVal: 10,
        envelopeReplyMinUnit: 'hours',
        envelopeReplyMaxVal: 24,
        envelopeReplyMaxUnit: 'hours',
        envelopeReplyMinSentences: 8,
        envelopeReplyMaxSentences: 12,
        // 主页绑定会话开关（默认关闭）
        homeSessionBindEnabled: false,
        allowReadNoReply: false, 
        readNoReplyChance: 0.2,
        timeFormat: 'HH:mm',
        customSoundUrl: '',
        // 音效：两方分别可选（若对应 URL 为空则使用内置预设）
        mySendSoundPreset: 'tone_low',
        mySendCustomSoundUrl: '',
        partnerMessageSoundPreset: 'tone_low',
        partnerMessageCustomSoundUrl: '',
        myPokeSoundPreset: 'tone_low',
        myPokeCustomSoundUrl: '',
        partnerPokeSoundPreset: 'tone_low',
        partnerPokeCustomSoundUrl: '',
        partnerVoiceChance: 0,
        partnerVideoChance: 0,
        soundVolume: 0.15,
        bottomCollapseMode: false,
        emojiMixEnabled: true,
        kaomojiMixEnabled: true,
        enterKeySendEnabled: false,
        pinyinCardEnabled: false,
        pinyinCardMin: 2,
        pinyinCardMax: 3
            };
        }


        function renderBackgroundGallery() {
            const list = document.getElementById('background-gallery-list');
            if (!list) return;

            list.innerHTML = '';

            
            const addBtn = document.createElement('div');
            addBtn.className = 'bg-item bg-add-btn';
            
            addBtn.innerHTML = '<i class="fas fa-plus"></i><span></span>';
            addBtn.onclick = () => document.getElementById('bg-gallery-input').click();
            list.appendChild(addBtn);

            const currentBg = safeGetItem(getStorageKey('chatBackground'));

            savedBackgrounds.forEach((bg, index) => {
                const item = document.createElement('div');
                let isActive = false;

                if (currentBg && currentBg === bg.value) isActive = true;

                item.className = `bg-item ${isActive ? 'active': ''}`;

                if (bg.type === 'image') {
                    item.innerHTML = `<img src="${bg.value}" loading="lazy" alt="bg">`;
                } else {
                    item.innerHTML = `<div class="bg-color-block" style="background: ${bg.value}"></div>`;
                }

                item.onclick = (e) => {
                    if (e.target.closest('.bg-delete-btn')) return;
                    applyBackground(bg.value);
                    safeSetItem(getStorageKey('chatBackground'), bg.value);
                    localforage.setItem(getStorageKey('chatBackground'), bg.value);
                    renderBackgroundGallery();
                    showNotification('背景已切换', 'success');
                };

                if (bg.id.startsWith('user-')) {
                    const delBtn = document.createElement('div');
                    delBtn.className = 'bg-delete-btn';
                    delBtn.innerHTML = '<i class="fas fa-trash"></i>';
                    delBtn.title = "删除此背景";
                    delBtn.onclick = (e) => {
                        e.stopPropagation();
                        if (confirm('确定删除这张背景图吗？')) {
                            savedBackgrounds.splice(index, 1);
                            saveBackgroundGallery();

                            if (isActive) {
                                removeBackground(); 
                                renderBackgroundGallery();
                            } else {
                                renderBackgroundGallery();
                            }
                        }
                    };
                    item.appendChild(delBtn);
                }

                list.appendChild(item);
            });
        }



        function saveBackgroundGallery() {
    localforage.setItem(getStorageKey('backgroundGallery'), savedBackgrounds);
}


        const applyBackground = (value) => {
            if (!value || typeof value !== 'string') return;
            try {
                if (value.startsWith('linear-gradient') || value.startsWith('#') || value.startsWith('rgb')) {
                    document.documentElement.style.setProperty('--chat-bg-image', value);
                } else {
                    const cssValue = value.startsWith('url(') ? value : `url(${value})`;
                    document.documentElement.style.setProperty('--chat-bg-image', cssValue);
                }
                document.body.classList.add('with-background');
            } catch (e) {
                if (typeof removeBackground === 'function') removeBackground();
            }
        };


const loadData = async () => {
    try {
        settings = getDefaultSettings();

        
        const results = await Promise.allSettled([
            localforage.getItem(getStorageKey('chatSettings')),
            localforage.getItem(getStorageKey('chatMessages')),
            localforage.getItem(getStorageKey('backgroundGallery')),
            localforage.getItem(getStorageKey('customReplies')),
            localforage.getItem(getStorageKey('customPokes')),
            localforage.getItem(getStorageKey('customStatuses')),
            localforage.getItem(getStorageKey('customMottos')),
            localforage.getItem(getStorageKey('customIntros')),
            localforage.getItem(getStorageKey('anniversaries')),
            localforage.getItem(getStorageKey('stickerLibrary')),
            localforage.getItem(`${APP_PREFIX}customThemes`),
            localforage.getItem(getStorageKey('chatBackground')),
            localforage.getItem(getStorageKey('partnerAvatar')),
            localforage.getItem(getStorageKey('myAvatar')),
            localforage.getItem(getStorageKey('partnerPersonas')), 
            localforage.getItem(getStorageKey('showPartnerNameInChat')),
            localforage.getItem(`${APP_PREFIX}themeSchemes`),
            localforage.getItem(getStorageKey('myStickerLibrary')),
            localforage.getItem(getStorageKey('customReplyGroups')),
            localforage.getItem(getStorageKey('customPokeGroups')),
            localforage.getItem(getStorageKey('customStatusGroups'))
        ]);
        const getVal = (index) => results[index].status === 'fulfilled' ? results[index].value : null;
        const safeLfGet = async (baseKey) => {
            const fullKey = getStorageKey(baseKey);
            try {
                const value = await localforage.getItem(fullKey);
                if (value !== null && value !== undefined) return value;
            } catch (e) {
                console.warn('[loadData] localforage 读取失败，尝试 localStorage 兜底:', baseKey, e);
            }
            try {
                const raw = localStorage.getItem(fullKey);
                if (raw === null || raw === undefined) return null;
                try { return JSON.parse(raw); } catch (_) { return raw; }
            } catch (e) {
                return null;
            }
        };

        const savedSettings = getVal(0);
        const savedMessages = getVal(1);
        const savedBgGallery = getVal(2);
        const savedCustomReplies = getVal(3);
        const savedPokes = getVal(4);
        const savedStatuses = getVal(5);
        const savedMottos = getVal(6);
        const savedIntros = getVal(7);
        const savedAnniversaries = getVal(8);
        const savedStickers = getVal(9);
        const savedCustomThemes = getVal(10);
        const savedChatBg = getVal(11);
        const partnerAvatarSrc = getVal(12);
        const myAvatarSrc = getVal(13);
        const savedPartnerPersonas = getVal(14);
        const savedShowNameConfig = getVal(15);
        const savedThemeSchemes = getVal(16);
        const savedMyStickers = getVal(17);
        const savedReplyGroups = getVal(18);
        const savedPokeGroups = getVal(19);
        const savedStatusGroups = getVal(20);

        const savedMyPokes = await safeLfGet('myPokes');
        const savedKaomojiLibrary = await safeLfGet('kaomojiLibrary');
        const savedKaomojiGroups = await safeLfGet('kaomojiGroups');
        const savedStickerGroups = await safeLfGet('customStickerGroups');
        const savedMoyuRecords = await safeLfGet('moyuRecords');
        const savedMoyuLocations = await safeLfGet('moyuLocations');
        const savedMoyuActivities = await safeLfGet('moyuActivities');
        const savedCurrentMoyuRecord = await safeLfGet('currentMoyuRecord');
        const savedMoyuUnread = await safeLfGet('moyuUnread');
        const savedMoyuWorkSession = await safeLfGet('moyuWorkSession');
        const savedTransferData = await safeLfGet('transferData');
        const savedVoices = await safeLfGet('customVoices');
        const savedVoiceGroups = await safeLfGet('customVoiceGroups');

        if (savedPartnerPersonas) partnerPersonas = savedPartnerPersonas;

        if (savedSettings) Object.assign(settings, savedSettings);
        window.settings = settings;

        if (settings.showPartnerNameInChat !== undefined) {
            showPartnerNameInChat = settings.showPartnerNameInChat;
        } else if (savedShowNameConfig !== null) {
            showPartnerNameInChat = savedShowNameConfig;
        }
        document.body.classList.toggle('show-partner-name', showPartnerNameInChat);
        try {
            if (settings.customFontUrl) applyCustomFont(settings.customFontUrl);
            if (settings.customBubbleCss) applyCustomBubbleCss(settings.customBubbleCss);
            if (settings.customGlobalCss) applyGlobalThemeCss(settings.customGlobalCss);
        } catch(e) { console.warn("样式应用失败", e); }
        
        if (savedPokes) customPokes = savedPokes;
        else customPokes = [...CONSTANTS.POKE_ACTIONS];
        if (savedMyPokes && Array.isArray(savedMyPokes)) myPokes = savedMyPokes; else myPokes = [];

        if (savedStatuses) customStatuses = savedStatuses;
        else customStatuses = [...CONSTANTS.PARTNER_STATUSES];

        if (savedMottos) customMottos = savedMottos;
        else customMottos = [...CONSTANTS.HEADER_MOTTOS];
        
        if (savedIntros) customIntros = savedIntros;
        else customIntros = CONSTANTS.WELCOME_ANIMATIONS.map(a => `${a.line1}|${a.line2}`);

        if (savedMessages && Array.isArray(savedMessages) && savedMessages.length > 0) {
            messages = savedMessages.map(m => ({
                ...m, timestamp: new Date(m.timestamp)
            }));
        } else {
            const backup = _tryRecoverFromBackup();
            if (backup && Array.isArray(backup.messages) && backup.messages.length > 0) {
                const timeSince = Math.round((Date.now() - backup.ts) / 60000);
                console.warn(`[loadData] 主存储为空或无消息，正在从备份恢复（备份时间：${timeSince} 分钟前）`);
                messages = backup.messages.map(m => ({
                    ...m, timestamp: new Date(m.timestamp)
                }));
                if (backup.settings) Object.assign(settings, backup.settings);
                if (backup.anniversaries && Array.isArray(backup.anniversaries)) {
                    anniversaries = backup.anniversaries;
                }
                setTimeout(() => saveData(), 1000);
                showNotification(
                    `已从备份恢复 ${messages.length} 条消息${backup._truncated ? '（备份为最近200条）' : ''}`,
                    'warning', 6000
                );
            } else {
                messages = [];
            }
        }

        if (savedBgGallery) {
            savedBackgrounds = savedBgGallery;
        } else {
            savedBackgrounds = [{ id: 'preset-1', type: 'color', value: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)' }];
        }

        if (savedCustomReplies) customReplies = savedCustomReplies;
        if (savedReplyGroups) window.customReplyGroups = savedReplyGroups;
        if (savedPokeGroups) window.customPokeGroups = savedPokeGroups;
        if (savedStatusGroups) window.customStatusGroups = savedStatusGroups;
        if (savedKaomojiLibrary) kaomojiLibrary = savedKaomojiLibrary;
        if (savedKaomojiGroups) window.kaomojiGroups = savedKaomojiGroups;
        if (savedStickerGroups) window.customStickerGroups = savedStickerGroups;
        if (savedMoyuRecords) moyuRecords = savedMoyuRecords;
        if (savedMoyuLocations) moyuLocations = savedMoyuLocations;
        if (savedMoyuActivities) window.moyuActivities = savedMoyuActivities;
        if (savedCurrentMoyuRecord) window.currentMoyuRecord = savedCurrentMoyuRecord;
        if (savedMoyuUnread) {
            moyuUnread = true;
            setTimeout(() => { if (typeof window.setMoyuUnread === 'function') window.setMoyuUnread(); }, 1000);
        }
        if (savedVoices) customVoices = savedVoices;
        if (savedVoiceGroups) window.customVoiceGroups = savedVoiceGroups;
        if (savedMoyuWorkSession) {
            window.moyuWorkSession = savedMoyuWorkSession;
            const now = Date.now();
            if (now >= window.moyuWorkSession.endTime) {
                if (!moyuRecords) moyuRecords = [];
                if (window.currentMoyuRecord) {
                    moyuRecords.push({...window.currentMoyuRecord});
                    localforage.setItem(getStorageKey('moyuRecords'), moyuRecords).catch(() => {});
                }
                window.currentMoyuRecord = null;
                window.moyuWorkSession = null;
                localforage.setItem(getStorageKey('currentMoyuRecord'), null).catch(() => {});
                localforage.setItem(getStorageKey('moyuWorkSession'), null).catch(() => {});
            } else if (typeof scheduleWorkEndCheck === 'function') {
                scheduleWorkEndCheck();
            }
        }
        if (savedTransferData) transferData = savedTransferData;
        if (savedAnniversaries) anniversaries = savedAnniversaries;
        if (savedStickers) stickerLibrary = savedStickers;
        if (savedMyStickers) myStickerLibrary = savedMyStickers;
        if (savedCustomThemes) customThemes = savedCustomThemes;
        if (savedThemeSchemes) themeSchemes = savedThemeSchemes;
        try { const ce = await localforage.getItem(getStorageKey('customEmojis')); if (ce && Array.isArray(ce)) customEmojis = ce; } catch(e) {}
        window._customReplies = customReplies;
        window._stickerLibrary = stickerLibrary;
        window._kaomojiLibrary = kaomojiLibrary;
        window._customEmojis = customEmojis;
        window._CONSTANTS = CONSTANTS;

        if (partnerAvatarSrc) settings.partnerAvatar = partnerAvatarSrc;
        if (myAvatarSrc) settings.myAvatar = myAvatarSrc;

        if (DOMElements && DOMElements.partner && DOMElements.me) {
            updateAvatar(DOMElements.partner.avatar, partnerAvatarSrc);
            updateAvatar(DOMElements.me.avatar, myAvatarSrc);
        }

        if (savedChatBg) {
            applyBackground(savedChatBg);
        } else {
            const lsBg = safeGetItem(getStorageKey('chatBackground'));
            if (lsBg) {
                applyBackground(lsBg);
                localforage.setItem(getStorageKey('chatBackground'), lsBg);
            }
        }

        try { await initMoodData(); } catch(e) { console.warn("心情数据加载失败", e); }
        try { await loadEnvelopeData(); } catch(e) { console.warn("信封数据加载失败", e); }
        
        displayedMessageCount = HISTORY_BATCH_SIZE;
        
        setTimeout(() => {
            if (typeof applyAllAvatarFrames === 'function') applyAllAvatarFrames();
            if (typeof manageAutoSendTimer === 'function') manageAutoSendTimer();
            if (typeof manageMoyuAutoGenerateTimer === 'function') manageMoyuAutoGenerateTimer();
            if (typeof manageEnvelopeAutoSendTimer === 'function') manageEnvelopeAutoSendTimer();
            if (typeof checkEnvelopeStatus === 'function') checkEnvelopeStatus();
            if (typeof updateUI === 'function') updateUI();
            if (typeof window.syncHomePageData === 'function') window.syncHomePageData();
            if (typeof window.initHomePage === 'function') window.initHomePage();
            if (settings.customBubbleCss) {
                try { applyCustomBubbleCss(settings.customBubbleCss); } catch(e) {}
            }
        }, 100);

    } catch (e) {
        console.error("LoadData 内部致命错误:", e);
        settings = getDefaultSettings();
        messages = [];
        updateUI();
    }
};

const LIBRARY_CONFIG = {
    reply: {
        title: "回复库管理",
        tabs: [
            { id: 'custom', name: '主字卡', mode: 'list' },
            { id: 'kaomojis', name: '颜文字', mode: 'list' },
            { id: 'emojis', name: 'Emoji', mode: 'grid' },
            { id: 'stickers', name: '表情库', mode: 'grid' },
            { id: 'voices', name: '语音', mode: 'list' }
        ]
    },
    moyu: {
        title: "摸鱼管理",
        tabs: [
            { id: 'moyu', name: '摸鱼活动', mode: 'list' },
            { id: 'moyuLocations', name: '工作地点', mode: 'list' }
        ]
    },
    atmosphere: {
        title: "氛围感配置",
        tabs: [
            { id: 'pokes', name: '拍一拍', mode: 'list' },
            { id: 'statuses', name: '对方状态', mode: 'list' },
            { id: 'mottos', name: '顶部格言', mode: 'list' },
            { id: 'intros', name: '开场动画', mode: 'list' }
        ]
    }
};
let currentAnnType = 'anniversary'; 

window.openMyStickerSettings = function() {
    const picker = document.getElementById('user-sticker-picker');
    if (picker) picker.classList.remove('active');
    if (typeof currentMajorTab !== 'undefined') {
        currentMajorTab = 'reply';
        currentSubTab = 'stickers';
    }
    var sidebarBtns = document.querySelectorAll('.sidebar-btn');
    sidebarBtns.forEach(function(b) { b.classList.toggle('active', b.dataset.major === 'reply'); });
    if (typeof renderReplyLibrary === 'function') renderReplyLibrary();
    var modal = document.getElementById('custom-replies-modal');
    if (modal && typeof showModal === 'function') showModal(modal);
};

window.switchAnnType = function(type) {
    currentAnnType = type;
    currentAnniversaryType = type; 
    document.querySelectorAll('.ann-type-btn').forEach(btn => {
        if (btn.dataset.type === type) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    const desc = document.getElementById('ann-type-desc');
    if(desc) {
        desc.textContent = type === 'anniversary' 
            ? '计算从过去某一天到现在已经过了多少天 (例如: 相识、恋爱)' 
            : '计算从现在到未来某一天还剩下多少天 (例如: 生日、跨年)';
    }
};

window.deleteAnniversaryItem = function(id) {
    if(confirm("确定要删除这条记录吗？")) {
        anniversaries = anniversaries.filter(a => a.id !== id);
        throttledSaveData(); 
        renderAnniversariesList();
        showNotification('已删除', 'success');
        if (typeof playSound === 'function') playSound('anniversary');
    }
};

const _BACKUP_PREFIX = 'BACKUP_V1_';
function _backupCriticalData() {
    if (window._skipBackup) return;
    try {
        // 保护旧备份：当前页面若已异常变成空消息，不要用空数组覆盖仍有内容的紧急备份。
        if (!Array.isArray(messages) || messages.length === 0) {
            try {
                const oldRaw = localStorage.getItem(_BACKUP_PREFIX + 'critical');
                const oldBackup = oldRaw ? JSON.parse(oldRaw) : null;
                if (oldBackup && Array.isArray(oldBackup.messages) && oldBackup.messages.length > 0) {
                    console.warn('[backup] 当前消息为空，保留已有紧急备份，避免二次覆盖');
                    return;
                }
            } catch(_e) {}
        }
        const backupPayload = {
            ts: Date.now(),
            messages: messages,
            settings: settings,
            sessionId: SESSION_ID,
            anniversaries: anniversaries
        };

        let payloadToStore = backupPayload;
        const msgSizeEstimate = messages.length * 500; 
        if (msgSizeEstimate > 3 * 1024 * 1024) {
            payloadToStore = {
                ...backupPayload,
                messages: messages.slice(-200),
                _truncated: true
            };
        }

        const json = JSON.stringify(payloadToStore);

        if (json.length > 4.5 * 1024 * 1024) {
            const smallerPayload = {
                ...payloadToStore,
                messages: messages.slice(-50),
                _truncated: true
            };
            const smallerJson = JSON.stringify(smallerPayload);
            localStorage.setItem(_BACKUP_PREFIX + 'critical', smallerJson);
        } else {
            localStorage.setItem(_BACKUP_PREFIX + 'critical', json);
        }
        localStorage.setItem(_BACKUP_PREFIX + 'timestamp', String(Date.now()));
    } catch (e) {
        console.warn('localStorage 备份写入失败（可能存储已满）:', e);
    }
}

function _tryRecoverFromBackup() {
    try {
        const raw = localStorage.getItem(_BACKUP_PREFIX + 'critical');
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (e) {
        return null;
    }
}

async function _safeSetPreserveNonEmpty(baseKey, value) {
    const fullKey = getStorageKey(baseKey);
    const allowEmpty = !!(window.__allowEmptyStorageKeys && window.__allowEmptyStorageKeys[baseKey]);
    if (Array.isArray(value) && value.length === 0 && !allowEmpty) {
        try {
            const oldValue = await localforage.getItem(fullKey);
            if (Array.isArray(oldValue) && oldValue.length > 0) {
                console.warn('[saveData] 拦截空数组覆盖非空旧数据:', baseKey, oldValue.length);
                return oldValue;
            }
        } catch(e) {}
    }
    try {
        const ret = await localforage.setItem(fullKey, value);
        if (allowEmpty && window.__allowEmptyStorageKeys) delete window.__allowEmptyStorageKeys[baseKey];
        return ret;
    } catch (e) {
        if (allowEmpty && window.__allowEmptyStorageKeys) delete window.__allowEmptyStorageKeys[baseKey];
        throw e;
    }
}

async function _safeSetChatSettingsPreserveVisuals(value) {
    const fullKey = getStorageKey('chatSettings');
    let next = Object.assign({}, value || {});
    try {
        const old = await localforage.getItem(fullKey);
        if (old && typeof old === 'object') {
            const preserveWhenEmpty = ['customBubbleCss', 'customGlobalCss', 'customFontUrl'];
            preserveWhenEmpty.forEach(function(k) {
                const allowClear = !!(window.__allowEmptySettingsFields && window.__allowEmptySettingsFields[k]);
                if (!allowClear && (next[k] === '' || next[k] === null || next[k] === undefined) && old[k]) next[k] = old[k];
            });
            if ((!next.bubbleStyle || next.bubbleStyle === 'standard') && old.bubbleStyle && old.bubbleStyle !== 'standard' && !window.__bubbleStyleChangedThisSession) {
                next.bubbleStyle = old.bubbleStyle;
            }
            ['messageFontFamily','messageFontWeight','messageLineHeight','fontSize','inChatAvatarEnabled','inChatAvatarSize','inChatAvatarPosition','alwaysShowAvatar','showPartnerNameInChat','myAvatarShape','partnerAvatarShape','myAvatarFrame','partnerAvatarFrame'].forEach(function(k) {
                if ((next[k] === null || next[k] === undefined || next[k] === '') && old[k] !== null && old[k] !== undefined && old[k] !== '') next[k] = old[k];
            });
        }
    } catch(e) {}
    return localforage.setItem(fullKey, next);
}

const saveData = async () => {
    if (!SESSION_ID) {
        console.warn('[saveData] SESSION_ID 尚未初始化，跳过保存以防数据写入临时 key');
        return;
    }

    const promises = [
        { key: 'chatSettings',           val: () => _safeSetChatSettingsPreserveVisuals(settings) },
        { key: 'customReplies',          val: () => _safeSetPreserveNonEmpty('customReplies', customReplies) },
        { key: 'customReplyGroups',      val: () => _safeSetPreserveNonEmpty('customReplyGroups', window.customReplyGroups || []) },
        { key: 'customPokeGroups',        val: () => _safeSetPreserveNonEmpty('customPokeGroups', window.customPokeGroups || []) },
        { key: 'customStatusGroups',      val: () => _safeSetPreserveNonEmpty('customStatusGroups', window.customStatusGroups || []) },
        { key: 'customEmojis',           val: () => _safeSetPreserveNonEmpty('customEmojis', customEmojis) },
        { key: 'kaomojiGroups',           val: () => _safeSetPreserveNonEmpty('kaomojiGroups', window.kaomojiGroups || []) },
        { key: 'customStickerGroups',     val: () => _safeSetPreserveNonEmpty('customStickerGroups', window.customStickerGroups || []) },
        { key: 'customVoices',            val: () => _safeSetPreserveNonEmpty('customVoices', customVoices || []) },
        { key: 'customVoiceGroups',       val: () => _safeSetPreserveNonEmpty('customVoiceGroups', window.customVoiceGroups || []) },
        { key: 'kaomojiLibrary',          val: () => _safeSetPreserveNonEmpty('kaomojiLibrary', kaomojiLibrary || []) },
        { key: 'moyuRecords',             val: () => localforage.setItem(getStorageKey('moyuRecords'), moyuRecords || []) },
        { key: 'moyuLocations',           val: () => _safeSetPreserveNonEmpty('moyuLocations', moyuLocations || []) },
        { key: 'moyuActivities',          val: () => _safeSetPreserveNonEmpty('moyuActivities', window.moyuActivities || []) },
        { key: 'currentMoyuRecord',       val: () => localforage.setItem(getStorageKey('currentMoyuRecord'), window.currentMoyuRecord || null) },
        { key: 'moyuUnread',              val: () => localforage.setItem(getStorageKey('moyuUnread'), moyuUnread || false) },
        { key: 'moyuWorkSession',         val: () => localforage.setItem(getStorageKey('moyuWorkSession'), window.moyuWorkSession || null) },
        { key: 'transferData',            val: () => localforage.setItem(getStorageKey('transferData'), transferData || null) },
        { key: 'myPokes',                 val: () => _safeSetPreserveNonEmpty('myPokes', myPokes || []) },
        { key: 'anniversaries',          val: () => _safeSetPreserveNonEmpty('anniversaries', anniversaries) },
        { key: 'customPokes',            val: () => _safeSetPreserveNonEmpty('customPokes', customPokes) },
        { key: 'customStatuses',         val: () => _safeSetPreserveNonEmpty('customStatuses', customStatuses) },
        { key: 'customMottos',           val: () => _safeSetPreserveNonEmpty('customMottos', customMottos) },
        { key: 'customIntros',           val: () => _safeSetPreserveNonEmpty('customIntros', customIntros) },
        { key: 'stickerLibrary',         val: () => _safeSetPreserveNonEmpty('stickerLibrary', stickerLibrary) },
        { key: 'myStickerLibrary',       val: () => _safeSetPreserveNonEmpty('myStickerLibrary', myStickerLibrary) },
        { key: 'customThemes',           val: () => localforage.setItem(`${APP_PREFIX}customThemes`, customThemes) },
        { key: 'themeSchemes',           val: () => localforage.setItem(`${APP_PREFIX}themeSchemes`, themeSchemes) },
        { key: 'chatMessages',           val: () => _safeSetPreserveNonEmpty('chatMessages', messages) },
    ];

    const partnerAvatarSrc = (() => {
        try {
            const img = DOMElements.partner.avatar.querySelector('img');
            return img ? img.src : null;
        } catch(e) { return null; }
    })();
    const myAvatarSrc = (() => {
        try {
            const img = DOMElements.me.avatar.querySelector('img');
            return img ? img.src : null;
        } catch(e) { return null; }
    })();

    const isPersistableAvatarSrc = (src) => !!(src && typeof src === 'string' && !src.startsWith('blob:'));
    if (isPersistableAvatarSrc(partnerAvatarSrc)) {
        promises.push({ key: 'partnerAvatar', val: () => localforage.setItem(getStorageKey('partnerAvatar'), partnerAvatarSrc) });
    }

    if (isPersistableAvatarSrc(myAvatarSrc)) {
        promises.push({ key: 'myAvatar', val: () => localforage.setItem(getStorageKey('myAvatar'), myAvatarSrc) });
    }

    const results = await Promise.allSettled(promises.map(p => {
        try { return p.val(); }
        catch(e) { return Promise.reject(e); }
    }));

    const failed = [];
    results.forEach((r, i) => {
        if (r.status === 'rejected') {
            failed.push(promises[i].key);
            console.error(`[saveData] 保存失败: ${promises[i].key}`, r.reason);
        }
    });

    if (failed.length > 0) {
        console.warn(`[saveData] ${failed.length} 项写入失败，已触发 localStorage 降级备份`, failed);
    }

    _backupCriticalData();
};
window.saveData = saveData;

        function initializeRandomUI() {


            document.querySelector('.header-motto').textContent = getRandomItem(CONSTANTS.HEADER_MOTTOS);
if (customMottos && customMottos.length > 0) {
    document.querySelector('.header-motto').textContent = getRandomItem(customMottos);
} else {
    document.querySelector('.header-motto').textContent = '';
}
            const placeholder = "";
            DOMElements.messageInput.placeholder = placeholder.length > 20 ? placeholder.substring(0, 20) + "...": placeholder;


            const starsContainer = document.getElementById('stars-container');
            starsContainer.innerHTML = '';
            const starCount = 80;
            for (let i = 0; i < starCount; i++) {
                const star = document.createElement('div');
                star.className = 'star';
                const x = Math.random() * 100;
                const y = Math.random() * 100;
                const size = Math.random() * 2.5 + 0.5;
                const duration = Math.random() * 4 + 2;
                const delay = Math.random() * 6;
                star.style.left = `${x}%`;
                star.style.top = `${y}%`;
                star.style.width = `${size}px`;
                star.style.height = `${size}px`;
                star.style.setProperty('--duration', `${duration}s`);
                star.style.animationDelay = `${delay}s`;
                starsContainer.appendChild(star);
            }
            const particlesContainer = document.getElementById('welcome-particles');
            if (particlesContainer) {
                particlesContainer.innerHTML = '';
                const types = ['petal', 'petal', 'petal', 'sparkle', 'sparkle'];
                for (let i = 0; i < 22; i++) {
                    const p = document.createElement('div');
                    const type = types[i % types.length];
                    p.className = `wp ${type}`;
                    const sz = type === 'petal' ? (Math.random() * 6 + 5) : (Math.random() * 4 + 2);
                    p.style.setProperty('--pSz', sz + 'px');
                    p.style.left = (Math.random() * 100) + '%';
                    p.style.setProperty('--pDur', (Math.random() * 10 + 9) + 's');
                    p.style.setProperty('--pDel', (Math.random() * 8) + 's');
                    p.style.setProperty('--pX1', (Math.random() * 50 - 25) + 'px');
                    p.style.setProperty('--pX2', (Math.random() * 80 - 40) + 'px');
                    p.style.setProperty('--pX3', (Math.random() * 50 - 25) + 'px');
                    particlesContainer.appendChild(p);
                }
            }

            const meteorsContainer = document.getElementById('welcome-meteors');
            if (meteorsContainer) {
                meteorsContainer.innerHTML = '';
                let meteorCount = 0;
                const MAX_METEORS = 12;
                const createMeteor = () => {
                    if (meteorCount >= MAX_METEORS) return;
                    meteorCount++;
                    const m = document.createElement('div');
                    m.className = 'meteor';
                    m.style.left = (Math.random() * 100) + '%';
                    m.style.top = (Math.random() * 35) + '%';
                    const dur = (Math.random() * 0.8 + 0.7);
                    m.style.setProperty('--mDur', dur + 's');
                    m.style.setProperty('--mDel', '0s');
                    m.style.setProperty('--mRot', (25 + Math.random() * 20) + 'deg');
                    meteorsContainer.appendChild(m);
                    setTimeout(() => { m.remove(); meteorCount = Math.max(0, meteorCount - 1); }, (dur + 0.1) * 1000);
                };
                for (let i = 0; i < 8; i++) setTimeout(createMeteor, i * 350);
                const meteorTimer = setInterval(createMeteor, 600);
                setTimeout(() => clearInterval(meteorTimer), 5000);
            }

            const loaderBarEl = document.getElementById('loader-tech-bar');
            if (loaderBarEl) {
                setTimeout(() => loaderBarEl.classList.add('pulsing'), 300);
            }


            const welcomeIcon = getRandomItem(CONSTANTS.WELCOME_ICONS);
document.querySelector('.logo-icon-main').innerHTML = `<i class="${welcomeIcon}"></i>`;

if (customIntros && customIntros.length > 0) {
    const rawIntro = getRandomItem(customIntros);
    const parts = rawIntro.split('|');
    const line1 = parts[0];
    const line2 = parts[1] || ""; 

    const titleEl = document.getElementById('welcome-title-glitch');
    const subEl = document.getElementById('welcome-subtitle-scramble');

    titleEl.classList.remove('playing');
    titleEl.textContent = line1;
    void titleEl.offsetWidth;
    titleEl.classList.add('playing');

    const scrambleText = (element, finalText, duration = 1500) => {
                const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()';
                const length = finalText.length;
                let start = Date.now();

                const interval = setInterval(() => {
                    const now = Date.now();
                    const progress = (now - start) / duration;

                    if (progress >= 1) {
                        element.textContent = finalText;
                        clearInterval(interval);
                        return;
                    }

                    let result = '';

                    const revealIndex = Math.floor(progress * length);

                    for (let i = 0; i < length; i++) {
                        if (i <= revealIndex) {
                            result += finalText[i];
                        } else {

                            result += chars[Math.floor(Math.random() * chars.length)];
                        }
                    }
                    element.textContent = result;
                },
                    40);
            };


          setTimeout(() => {
        scrambleText(subEl, line2, 2000);
    }, 600);
} else {
    document.getElementById('welcome-title-glitch').textContent = "传讯";
    document.getElementById('welcome-subtitle-scramble').textContent = "请在设置中添加开场动画";
}


            const loaderBar = document.getElementById('loader-tech-bar');
            const statusText = document.getElementById('loader-status-text');
            loaderBar.style.width = '0%';
            const loadingPhases = [
                { width: '15%', text: 'INITIALIZING · 初始化中' },
                { width: '40%', text: 'LOADING MEMORIES · 读取记忆' },
                { width: '70%', text: 'BUILDING WORLD · 构建世界' },
                { width: '90%', text: 'ALMOST THERE · 即将完成' },
                { width: '100%', text: 'CONNECTED · 连接成功' }
            ];
            const delays = [100, 700, 1600, 2400, 2900];
            delays.forEach((delay, i) => {
                setTimeout(() => {
                    loaderBar.style.width = loadingPhases[i].width;
                    if (statusText) statusText.textContent = loadingPhases[i].text;
                }, delay);
            });
        }

function manageAutoSendTimer() {
    if (autoSendTimer) {
        clearInterval(autoSendTimer);
        autoSendTimer = null;
    }
    if (settings.autoSendEnabled) {
        const intervalMs = settings.autoSendInterval * 60 * 1000;
        
        autoSendTimer = setInterval(() => {
            if (!document.body.classList.contains('batch-favorite-mode')) {
                simulateReply(); 
            }
        }, intervalMs);
    }
}

let moyuSessionTimer = null; // 工作会话定时器
let moyuMessageTimer = null; // 会话期间消息定时器
let envelopeAutoSendTimer = null; // 时空来信定时器

function manageEnvelopeAutoSendTimer() {
    // 清除现有定时器
    if (envelopeAutoSendTimer) {
        clearTimeout(envelopeAutoSendTimer);
        envelopeAutoSendTimer = null;
    }

    if (!settings.envelopeAutoSendEnabled) return;

    // 计算下次写信时间
    const unitToMs = { minutes: 60 * 1000, hours: 60 * 60 * 1000, days: 24 * 60 * 60 * 1000 };
    const minVal = settings.envelopeAutoSendMinVal || 1;
    const maxVal = settings.envelopeAutoSendMaxVal || 3;
    const minUnit = unitToMs[settings.envelopeAutoSendMinUnit] || unitToMs.hours;
    const maxUnit = unitToMs[settings.envelopeAutoSendMaxUnit] || unitToMs.hours;
    const minMs = minVal * minUnit;
    const maxMs = maxVal * maxUnit;
    const randomMs = Math.random() * (maxMs - minMs) + minMs;

    envelopeAutoSendTimer = setTimeout(() => {
        if (settings.envelopeAutoSendEnabled && typeof generateRandomEnvelopeLetter === 'function') {
            generateRandomEnvelopeLetter();
        }
        manageEnvelopeAutoSendTimer(); // 继续安排下一次
    }, randomMs);
}
window.manageEnvelopeAutoSendTimer = manageEnvelopeAutoSendTimer;

function manageMoyuAutoGenerateTimer() {
    // 清除现有定时器
    if (moyuSessionTimer) {
        clearTimeout(moyuSessionTimer);
        moyuSessionTimer = null;
    }
    if (moyuMessageTimer) {
        clearTimeout(moyuMessageTimer);
        moyuMessageTimer = null;
    }

    if (!settings.moyuAutoGenerateEnabled) return;

    const now = Date.now();

    // 如果有进行中的会话，恢复定时器
    if (window.moyuWorkSession && now < window.moyuWorkSession.endTime) {
        // 会话仍在进行中，安排下一条消息
        scheduleNextMoyuMessage();
        return;
    }

    // 如果有已结束的会话，先保存
    if (window.currentMoyuRecord && window.moyuWorkSession && now >= window.moyuWorkSession.endTime) {
        finishMoyuWorkSession();
    }

    // 没有进行中的会话，随机延迟 0~12 小时后开始新会话
    const nextSessionDelay = Math.floor(Math.random() * 13) * 60 * 60 * 1000; // 0~12小时
    moyuSessionTimer = setTimeout(() => {
        if (settings.moyuAutoGenerateEnabled) {
            generateRandomMoyuRecord();
        }
    }, nextSessionDelay);
}

// 安排下一次消息（会话期间，10-30分钟）
function scheduleNextMoyuMessage() {
    if (moyuMessageTimer) {
        clearTimeout(moyuMessageTimer);
        moyuMessageTimer = null;
    }

    if (!settings.moyuAutoGenerateEnabled || !window.moyuWorkSession) return;

    const now = Date.now();
    // 检查会话是否已结束
    if (now >= window.moyuWorkSession.endTime) {
        finishMoyuWorkSession();
        // 会话结束后，随机延迟2-24小时开始新会话
        const nextSessionDelay = Math.floor(Math.random() * 13) * 60 * 60 * 1000; // 0~12小时
        moyuSessionTimer = setTimeout(() => {
            generateRandomMoyuRecord();
        }, nextSessionDelay);
        return;
    }

    // 随机间隔10-30分钟
    const messageInterval = (Math.floor(Math.random() * 21) + 10) * 60 * 1000;
    // 确保不会超出会话结束时间
    const timeUntilEnd = window.moyuWorkSession.endTime - now;
    const actualInterval = Math.min(messageInterval, timeUntilEnd);

    moyuMessageTimer = setTimeout(() => {
        generateRandomMoyuRecord();
    }, actualInterval);
}

function generateRandomMoyuRecord() {
    const locations = moyuLocations || [];
    const activities = moyuActivities || [];

    // 如果没有数据，不生成
    if (locations.length === 0 || activities.length === 0) return;

    const now = Date.now();
    const today = new Date().toISOString().split('T')[0];

    // 检查是否有活跃的工作会话
    if (window.moyuWorkSession && now < window.moyuWorkSession.endTime) {
        // 在会话期间，合并新活动到当前记录
        const randomActivity = activities[Math.floor(Math.random() * activities.length)];
        window.moyuWorkSession.activities.push({
            content: randomActivity,
            time: now
        });

        // 更新当前记录显示
        window.currentMoyuRecord = {
            id: window.moyuWorkSession.id,
            location: window.moyuWorkSession.location,
            date: today,
            hours: window.moyuWorkSession.totalHours,
            note: window.moyuWorkSession.activities.map(a => `• ${a.content}`).join('\n'),
            isSession: true,
            createdAt: new Date(window.moyuWorkSession.startTime).toISOString()
        };

        // 保存状态
        localforage.setItem(getStorageKey('currentMoyuRecord'), window.currentMoyuRecord).catch(() => {});
        localforage.setItem(getStorageKey('moyuWorkSession'), window.moyuWorkSession).catch(() => {});

        // 刷新界面
        if (typeof window.renderMoyuCurrent === 'function') {
            window.renderMoyuCurrent();
        }

        // 显示新消息通知
        showMoyuNewMessageNotification(randomActivity);

        // 安排下一次消息
        scheduleNextMoyuMessage();
        return;
    }

    // 如果之前有完成的会话，先保存到记录列表
    if (window.currentMoyuRecord && window.moyuWorkSession && now >= window.moyuWorkSession.endTime) {
        if (!moyuRecords) moyuRecords = [];
        moyuRecords.push({
            ...currentMoyuRecord,
            activities: window.moyuWorkSession.activities
        });
        localforage.setItem(getStorageKey('moyuRecords'), moyuRecords).catch(() => {});

        // 显示工作结束提示
        showMoyuWorkEndNotification();
    }

    // 开始新的工作会话
    const randomLocation = locations[Math.floor(Math.random() * locations.length)];
    const randomActivity = activities[Math.floor(Math.random() * activities.length)];
    const workHours = Math.floor(Math.random() * 13); // 0~12小时

    window.moyuWorkSession = {
        id: Date.now(),
        startTime: now,
        endTime: now + (workHours * 60 * 60 * 1000), // 转换为毫秒
        location: randomLocation,
        totalHours: workHours,
        activities: [{
            content: randomActivity,
            time: now
        }]
    };

    window.currentMoyuRecord = {
        id: window.moyuWorkSession.id,
        location: randomLocation,
        date: today,
        hours: workHours,
        note: `• ${randomActivity}`,
        isSession: true,
        createdAt: new Date().toISOString()
    };

    // 保存状态
    localforage.setItem(getStorageKey('currentMoyuRecord'), window.currentMoyuRecord).catch(() => {});
    localforage.setItem(getStorageKey('moyuWorkSession'), window.moyuWorkSession).catch(() => {});

    // 刷新摸鱼小记界面
    if (typeof window.renderMoyuCurrent === 'function') {
        window.renderMoyuCurrent();
    }
    if (typeof window.renderMoyuRecords === 'function') {
        window.renderMoyuRecords();
    }

    // 安排下一次消息（10-30分钟后）
    scheduleNextMoyuMessage();

    // 设置工作结束检测
    scheduleWorkEndCheck();

    // 显示弹窗提示
    showMoyuNotification();
}

// 工作结束检测定时器
let moyuWorkEndTimer = null;

function scheduleWorkEndCheck() {
    if (moyuWorkEndTimer) {
        clearTimeout(moyuWorkEndTimer);
        moyuWorkEndTimer = null;
    }

    if (!window.moyuWorkSession) return;

    const now = Date.now();
    const timeUntilEnd = window.moyuWorkSession.endTime - now;

    if (timeUntilEnd > 0) {
        moyuWorkEndTimer = setTimeout(() => {
            finishMoyuWorkSession();
        }, timeUntilEnd);
    } else {
        finishMoyuWorkSession();
    }
}

// 结束当前工作会话
function finishMoyuWorkSession() {
    if (!window.currentMoyuRecord || !window.moyuWorkSession) return;

    // 保存到记录列表（包含 activities 数组）
    if (!moyuRecords) moyuRecords = [];
    moyuRecords.push({
        ...currentMoyuRecord,
        activities: window.moyuWorkSession.activities
    });

    // 清空当前状态
    window.currentMoyuRecord = null;
    window.moyuWorkSession = null;

    // 保存数据
    localforage.setItem(getStorageKey('moyuRecords'), moyuRecords).catch(() => {});
    localforage.setItem(getStorageKey('currentMoyuRecord'), null).catch(() => {});
    localforage.setItem(getStorageKey('moyuWorkSession'), null).catch(() => {});

    // 刷新界面
    if (typeof window.renderMoyuCurrent === 'function') {
        window.renderMoyuCurrent();
    }
    if (typeof window.renderMoyuRecords === 'function') {
        window.renderMoyuRecords();
    }

    // 显示工作结束提示
    showMoyuWorkEndNotification();

    // 如果功能仍开启，安排下一次工作会话（2-24小时后）
    if (settings.moyuAutoGenerateEnabled) {
        const nextSessionDelay = Math.floor(Math.random() * 13) * 60 * 60 * 1000; // 0~12小时
        moyuSessionTimer = setTimeout(() => {
            generateRandomMoyuRecord();
        }, nextSessionDelay);
    }
}

// 显示新消息通知（会话期间）
function showMoyuNewMessageNotification(activityContent) {
    // 移除已存在的新消息通知
    const existing = document.getElementById('moyu-new-message-notification');
    if (existing) existing.remove();

    const showDetail = settings.moyuShowDetail !== false;
    const detailHtml = showDetail ? `
        <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 10px; padding: 8px; background: var(--primary-bg); border-radius: 8px; line-height: 1.4;">
            ${activityContent}
        </div>
        <div style="font-size: 11px; color: var(--accent-color); margin-bottom: 14px;">
            <i class="fas fa-info-circle" style="margin-right: 4px;"></i>已并入当前工作记录
        </div>
    ` : `
        <div style="font-size: 11px; color: var(--accent-color); margin-bottom: 14px; margin-top: 8px;">
            <i class="fas fa-info-circle" style="margin-right: 4px;"></i>已并入当前工作记录
        </div>
    `;

    const notification = document.createElement('div');
    notification.id = 'moyu-new-message-notification';
    notification.innerHTML = `
        <div style="position: fixed; top: 20px; left: 50%; transform: translateX(-50%); z-index: 10000; background: var(--secondary-bg); border: 1px solid var(--border-color); border-radius: 16px; padding: 16px 20px; box-shadow: 0 8px 32px rgba(0,0,0,0.2); max-width: 360px; font-family: var(--font-family);">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
                <div style="width: 36px; height: 36px; border-radius: 50%; background: rgba(var(--accent-color-rgb), 0.15); display: flex; align-items: center; justify-content: center;">
                    <i class="fas fa-fish" style="color: var(--accent-color); font-size: 16px;"></i>
                </div>
                <div style="flex: 1;">
                    <div style="font-size: 14px; font-weight: 600; color: var(--text-primary);">滴！${settings.partnerName || '梦角'} 发来一条摸鱼信息</div>
                </div>
                <button onclick="window.closeMoyuNewMessageNotification()" style="background: none; border: none; color: var(--text-secondary); cursor: pointer; padding: 4px; font-size: 16px;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            ${detailHtml}
            <div style="display: flex; gap: 10px;">
                <button onclick="window.openMoyuFromNewMessageNotification()" style="flex: 1; padding: 10px 16px; border: none; border-radius: 10px; background: var(--accent-color); color: white; font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--font-family);">
                    <i class="fas fa-check" style="margin-right: 6px;"></i>查看
                </button>
                <button onclick="window.closeMoyuNewMessageNotification()" style="flex: 1; padding: 10px 16px; border: 1px solid var(--border-color); border-radius: 10px; background: transparent; color: var(--text-secondary); font-size: 13px; cursor: pointer; font-family: var(--font-family);">
                    关闭
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(notification);

    // 5秒后自动关闭
    setTimeout(() => {
        const el = document.getElementById('moyu-new-message-notification');
        if (el) el.remove();
    }, 5000);
}

window.closeMoyuNewMessageNotification = function () {
    const notification = document.getElementById('moyu-new-message-notification');
    if (notification) notification.remove();
    window.setMoyuUnread();
};

window.openMoyuFromNewMessageNotification = function () {
    const notification = document.getElementById('moyu-new-message-notification');
    if (notification) notification.remove();
    window.clearMoyuUnread();
    if (typeof window.openMoyuModal === 'function') {
        window.openMoyuModal();
    }
};

// 显示工作结束通知
function showMoyuWorkEndNotification() {
    const notification = document.createElement('div');
    notification.id = 'moyu-work-end-notification';
    notification.innerHTML = `
        <div style="position: fixed; top: 20px; left: 50%; transform: translateX(-50%); z-index: 10000; background: var(--secondary-bg); border: 1px solid var(--border-color); border-radius: 16px; padding: 16px 20px; box-shadow: 0 8px 32px rgba(0,0,0,0.2); max-width: 360px; font-family: var(--font-family);">
            <div style="display: flex; align-items: center; gap: 10px;">
                <div style="width: 36px; height: 36px; border-radius: 50%; background: rgba(var(--accent-color-rgb), 0.15); display: flex; align-items: center; justify-content: center;">
                    <i class="fas fa-check-circle" style="color: var(--accent-color); font-size: 16px;"></i>
                </div>
                <div style="flex: 1;">
                    <div style="font-size: 14px; font-weight: 600; color: var(--text-primary);">${settings.partnerName || '梦角'} 的工作结束啦</div>
                </div>
                <button onclick="document.getElementById('moyu-work-end-notification').remove()" style="background: none; border: none; color: var(--text-secondary); cursor: pointer; padding: 4px; font-size: 16px;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(notification);

    // 3秒后自动关闭
    setTimeout(() => {
        const el = document.getElementById('moyu-work-end-notification');
        if (el) el.remove();
    }, 3000);
}

function showMoyuNotification() {
    // 移除已存在的通知
    const existing = document.getElementById('moyu-notification');
    if (existing) existing.remove();

    const showDetail = settings.moyuShowDetail !== false;
    const session = window.moyuWorkSession;
    const detailHtml = (showDetail && session) ? `
        <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 10px; padding: 8px; background: var(--primary-bg); border-radius: 8px; line-height: 1.4;">
            <div style="font-size: 11px; color: var(--accent-color); margin-bottom: 4px;">
                <i class="fas fa-map-marker-alt" style="margin-right: 4px;"></i>${window.escapeHtml ? window.escapeHtml(session.location) : session.location}
            </div>
            <div style="font-size: 11px; color: var(--text-secondary);">
                <i class="fas fa-clock" style="margin-right: 4px;"></i>预计工作 ${session.totalHours} 小时
            </div>
        </div>
        <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 14px;">是否现在查看？</div>
    ` : `
        <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 14px; margin-top: 8px;">是否现在查看？</div>
    `;

    const notification = document.createElement('div');
    notification.id = 'moyu-notification';
    notification.innerHTML = `
        <div style="position: fixed; top: 20px; left: 50%; transform: translateX(-50%); z-index: 10000; background: var(--secondary-bg); border: 1px solid var(--border-color); border-radius: 16px; padding: 16px 20px; box-shadow: 0 8px 32px rgba(0,0,0,0.2); max-width: 360px; font-family: var(--font-family);">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
                <div style="width: 36px; height: 36px; border-radius: 50%; background: rgba(var(--accent-color-rgb), 0.15); display: flex; align-items: center; justify-content: center;">
                    <i class="fas fa-fish" style="color: var(--accent-color); font-size: 16px;"></i>
                </div>
                <div style="flex: 1;">
                    <div style="font-size: 14px; font-weight: 600; color: var(--text-primary);">${settings.partnerName || '梦角'} 开始工作了，是否前去陪伴？</div>
                </div>
                <button onclick="window.closeMoyuNotificationWithUnread()" style="background: none; border: none; color: var(--text-secondary); cursor: pointer; padding: 4px; font-size: 16px;">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            ${detailHtml}
            <div style="display: flex; gap: 10px;">
                <button onclick="window.openMoyuFromNotification()" style="flex: 1; padding: 10px 16px; border: none; border-radius: 10px; background: var(--accent-color); color: white; font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--font-family);">
                    <i class="fas fa-check" style="margin-right: 6px;"></i>现在去
                </button>
                <button onclick="window.closeMoyuNotificationWithUnread()" style="flex: 1; padding: 10px 16px; border: 1px solid var(--border-color); border-radius: 10px; background: transparent; color: var(--text-secondary); font-size: 13px; cursor: pointer; font-family: var(--font-family);">
                    等会来
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(notification);

    // 5秒后自动关闭并标记未读
    setTimeout(() => {
        if (document.getElementById('moyu-notification')) {
            notification.remove();
            window.setMoyuUnread();
        }
    }, 5000);
}

// 设置摸鱼未读标记
window.setMoyuUnread = function () {
    moyuUnread = true;
    const btn = document.getElementById('moyu-btn');
    if (btn) {
        // 先移除已存在的小红点
        const existingDot = document.getElementById('moyu-unread-dot');
        if (existingDot) existingDot.remove();

        // 创建小红点
        const dot = document.createElement('span');
        dot.id = 'moyu-unread-dot';
        dot.style.cssText = 'position: absolute; top: -4px; right: -4px; width: 10px; height: 10px; background: #ff4757; border-radius: 50%; border: 2px solid #fff; z-index: 100; pointer-events: none; box-shadow: 0 0 4px rgba(255,71,87,0.5);';
        
        // 确保父容器有定位
        const parent = btn.parentElement;
        if (parent) {
            parent.style.position = 'relative';
            parent.appendChild(dot);
            // 根据按钮位置调整小红点位置
            const btnRect = btn.getBoundingClientRect();
            const parentRect = parent.getBoundingClientRect();
            dot.style.top = (btn.offsetTop - 4) + 'px';
            dot.style.right = 'auto';
            dot.style.left = (btn.offsetLeft + btn.offsetWidth - 6) + 'px';
        }
    }

    // 同时显示 Home 页面摸鱼图标的小红点
    const homeMoyuBadge = document.getElementById('moyu-badge');
    if (homeMoyuBadge) homeMoyuBadge.style.display = 'block';

    // 保存未读状态
    try {
        localforage.setItem(getStorageKey('moyuUnread'), true).catch(() => {});
    } catch (e) {}
};

// 清除摸鱼未读标记
window.clearMoyuUnread = function () {
    moyuUnread = false;
    const dot = document.getElementById('moyu-unread-dot');
    if (dot) dot.remove();

    // 同时清除 Home 页面摸鱼图标的小红点
    const homeMoyuBadge = document.getElementById('moyu-badge');
    if (homeMoyuBadge) homeMoyuBadge.style.display = 'none';

    // 保存未读状态
    try {
        localforage.setItem(getStorageKey('moyuUnread'), false).catch(() => {});
    } catch (e) {}
};

// 关闭通知并标记未读
window.closeMoyuNotificationWithUnread = function () {
    const notification = document.getElementById('moyu-notification');
    if (notification) notification.remove();
    window.setMoyuUnread();
};

window.openMoyuFromNotification = function () {
    // 关闭通知
    const notification = document.getElementById('moyu-notification');
    if (notification) notification.remove();

    // 清除未读标记
    window.clearMoyuUnread();

    // 打开摸鱼小记弹窗
    if (typeof window.openMoyuModal === 'function') {
        window.openMoyuModal();
    }
};



        const updateUI = () => {
            const isCustomTheme = settings.colorTheme.startsWith('custom-');
            if (isCustomTheme) {
                const themeId = settings.colorTheme;
                const theme = customThemes.find(t => t.id === themeId);
                if (theme) {
                    applyTheme(theme.colors);
                } else {
                    DOMElements.html.setAttribute('data-color-theme', 'gold');
                }
            } else {
                DOMElements.html.setAttribute('data-color-theme', settings.colorTheme);
                applyTheme(null, true);
            }
            
            if (settings.customThemeColors && Object.keys(settings.customThemeColors).length > 0) {
                for (const [variable, value] of Object.entries(settings.customThemeColors)) {
                    document.documentElement.style.setProperty(variable, value);
                }
            }

            DOMElements.html.setAttribute('data-theme', settings.isDarkMode ? 'dark': 'light');
            DOMElements.themeToggle.innerHTML = settings.isDarkMode ? '<i class="fas fa-sun"></i>': '<i class="fas fa-moon"></i>';
            DOMElements.partner.name.textContent = settings.partnerName;
            DOMElements.me.name.textContent = settings.myName;
            DOMElements.partner.status.textContent = settings.partnerStatus || '在线';
            DOMElements.me.statusText.textContent = settings.myStatus;
            if (typeof window.updateDynamicNames === 'function') window.updateDynamicNames();
            document.documentElement.style.setProperty('--font-size', `${settings.fontSize}px`);
            
            const fontToUse = settings.messageFontFamily || "'Noto Serif SC', serif";
            
            document.documentElement.style.setProperty('--message-font-family', fontToUse);
            document.documentElement.style.setProperty('--font-family', fontToUse);
            document.documentElement.style.setProperty('--message-font-weight', settings.messageFontWeight);
            document.documentElement.style.setProperty('--message-line-height', settings.messageLineHeight);

            document.documentElement.style.setProperty('--in-chat-avatar-size', `${settings.inChatAvatarSize}px`);
            const _alignMap = { 'top': 'flex-start', 'center': 'center', 'bottom': 'flex-end', 'custom': 'flex-start' };
            document.documentElement.style.setProperty('--avatar-align', _alignMap[settings.inChatAvatarPosition || 'center'] || 'center');
            if (settings.inChatAvatarPosition === 'custom' && settings.inChatAvatarCustomOffset !== undefined) {
                document.documentElement.style.setProperty('--avatar-custom-offset', settings.inChatAvatarCustomOffset + 'px');
            }
            document.body.classList.toggle('always-show-avatar', !!settings.alwaysShowAvatar);
            if (typeof _applyCollapseState === 'function') _applyCollapseState(!!settings.bottomCollapseMode);
            document.body.classList.toggle('show-partner-name', !!(settings.showPartnerNameInChat || showPartnerNameInChat));

            document.querySelectorAll('.theme-color-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.theme === settings.colorTheme);
            });


            document.querySelectorAll('[data-bubble-style]').forEach(item => {
                item.classList.toggle('active', item.dataset.bubbleStyle === settings.bubbleStyle);
            });

            const _pillSyncMap = {
                '#reply-toggle': 'replyEnabled',
                '#sound-toggle': 'soundEnabled',
                '#read-receipts-toggle': 'readReceiptsEnabled',
                '#typing-indicator-toggle': 'typingIndicatorEnabled',
                '#read-no-reply-toggle': 'allowReadNoReply',
                '#emoji-mix-toggle': 'emojiMixEnabled',
                '#kaomoji-mix-toggle': 'kaomojiMixEnabled',
                '#auto-send-toggle': 'autoSendEnabled',
                '#moyu-auto-generate-toggle': 'moyuAutoGenerateEnabled',
                '#moyu-show-detail-toggle': 'moyuShowDetail',
                '#envelope-auto-send-toggle': 'envelopeAutoSendEnabled',
                '#envelope-custom-rule-toggle': 'envelopeCustomRuleEnabled',
                '#bottom-collapse-cs-toggle': 'bottomCollapseMode',
                '#enter-key-send-toggle': 'enterKeySendEnabled',
                '#pinyin-card-toggle': 'pinyinCardEnabled'
            };
            for (const [sel, prop] of Object.entries(_pillSyncMap)) {
                const el = document.querySelector(sel);
                if (el) {
                    const val = (prop === 'emojiMixEnabled' || prop === 'kaomojiMixEnabled') ? (settings[prop] !== false) : !!settings[prop];
                    el.classList.toggle('active', val);
                }
            }
            const _immToggle = document.getElementById('immersive-toggle');
            if (_immToggle) _immToggle.classList.toggle('active', document.body.classList.contains('immersive-mode'));

            renderMessages();
        };

        // 暴露 updateUI 到全局，供 home.js 等模块调用
        window.updateUI = updateUI;

        const updateAvatar = (element, src) => {
            if (src) element.innerHTML = `<img src="${src}" alt="avatar">`; else element.innerHTML = `<i class="fas fa-user"></i>`;
        };

        const removeBackground = () => {
            document.documentElement.style.removeProperty('--chat-bg-image');
            document.body.classList.remove('with-background');
            localforage.removeItem(getStorageKey('chatBackground'));
            safeRemoveItem(getStorageKey('chatBackground'));
            showNotification('背景图片已移除', 'success');
        };

        window.scrollToQuotedMessage = function(el) {
            const id = el.getAttribute('data-reply-id');
            if (!id) return;
            const tryScroll = () => {
                const target = document.querySelector(`[data-msg-id="${id}"]`);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    target.classList.add('msg-highlight');
                    setTimeout(() => target.classList.remove('msg-highlight'), 1500);
                    return true;
                }
                return false;
            };
            if (!tryScroll()) {
                const msgIndex = messages.findIndex(m => String(m.id) === String(id));
                if (msgIndex === -1) {
                    if (typeof showNotification === 'function') showNotification('消息可能已被删除', 'info');
                    return;
                }
                const needed = messages.length - msgIndex;
                if (needed > displayedMessageCount) {
                    displayedMessageCount = needed;
                    renderMessages(false);
                    setTimeout(tryScroll, 150);
                } else {
                    if (typeof showNotification === 'function') showNotification('消息可能已被删除', 'info');
                }
            }
        };

function createMessageFragment(msg, prevMsg, nextMsg, lastSenderRef) {
    const fragment = new DocumentFragment();
    const messageDate = new Date(msg.timestamp).toDateString();
    const prevDate = prevMsg ? new Date(prevMsg.timestamp).toDateString() : null;

    if (messageDate !== prevDate) {
        const dateDivider = document.createElement('div');
        dateDivider.className = 'date-divider';
        const today = new Date().toDateString();
        const yesterday = new Date(Date.now() - 86400000).toDateString();
        const displayDate = (messageDate === today) ? '今天' : (messageDate === yesterday) ? '昨天' : new Date(msg.timestamp).toLocaleDateString('zh-CN', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        dateDivider.innerHTML = `<span>${displayDate}</span>`;
        fragment.appendChild(dateDivider);
        lastSenderRef.current = null;
    }

    if (msg.type === 'system') {
        const systemMsgDiv = document.createElement('div');
        systemMsgDiv.className = 'system-message selectable-special-message';
        systemMsgDiv.dataset.id = msg.id;
        systemMsgDiv.dataset.msgId = msg.id;
        systemMsgDiv.innerHTML = msg.text;
        fragment.appendChild(systemMsgDiv);
        lastSenderRef.current = 'system';
        return fragment;
    }

    if (msg.type === 'call-event') {
        const callEvDiv = document.createElement('div');
        callEvDiv.className = 'call-event-message selectable-special-message';
        callEvDiv.dataset.id = msg.id;
        callEvDiv.dataset.msgId = msg.id;
        const icon = msg.callIcon || 'fa-video';
        const isRejected = icon === 'fa-phone-slash';
        const colorClass = isRejected ? 'call-event-pill--rejected' : 'call-event-pill--ended';
        const detail = msg.callDetail ? `<span class="call-event-detail">${msg.callDetail}</span>` : '';
        callEvDiv.innerHTML = `<div class="call-event-pill ${colorClass}"><i class="fas ${icon} call-event-icon"></i><span class="call-event-label">${msg.text.replace(/ · .*/, '')}</span>${detail}<button class="call-event-delete" title="删除" onclick="(function(btn){const id=btn.closest('[data-id]').dataset.id;const idx=messages.findIndex(m=>String(m.id)===String(id));if(idx>-1){messages.splice(idx,1);renderMessages();throttledSaveData();}})(this)"><i class="fas fa-times"></i></button></div>`;
        fragment.appendChild(callEvDiv);
        lastSenderRef.current = 'system';
        return fragment;
    }

    let showTimestamp = true;
    if (settings.timeFormat === 'off') {
        showTimestamp = false;
    } else if (nextMsg) {
        const currentTs = new Date(msg.timestamp).getTime();
        const nextTs = new Date(nextMsg.timestamp).getTime();
        if (nextMsg.sender === msg.sender && nextMsg.type !== 'system' && (nextTs - currentTs < 60000)) {
            showTimestamp = false;
        }
    }

    let isLastInSenderGroup = true;
    if (nextMsg) {
        const currentTs = new Date(msg.timestamp).getTime();
        const nextTs = new Date(nextMsg.timestamp).getTime();
        if (nextMsg.sender === msg.sender && nextMsg.type !== 'system' && (nextTs - currentTs < 60000)) {
            isLastInSenderGroup = false;
        }
    }

    const wrapper = document.createElement('div');
    wrapper.className = `message-wrapper ${msg.sender === 'user' ? 'sent' : 'received'}`;
    wrapper.dataset.id = msg.id;
    wrapper.dataset.msgId = msg.id;

    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'message-avatar';
    if (settings.inChatAvatarPosition === 'custom' && settings.inChatAvatarCustomOffset !== undefined) {
        avatarDiv.style.marginTop = settings.inChatAvatarCustomOffset + 'px';
    }

    const groupMember = (msg.sender !== 'user' && typeof getGroupMemberForMessage === 'function') ? getGroupMemberForMessage(msg.id) : null;

    if (settings.inChatAvatarEnabled) {
        const isSameSenderGroup = groupMember && lastSenderRef.current === 'group_' + (groupMember ? groupMember.name : '');
        const isSameSenderNormal = !groupMember && msg.sender === lastSenderRef.current;
        const shouldHide = !settings.alwaysShowAvatar && (isSameSenderGroup || isSameSenderNormal);
        if (shouldHide) {
            avatarDiv.classList.add('hidden');
        } else if (groupMember) {
            const groupAvatarShape = settings.partnerAvatarShape || 'circle';
            ['circle', 'square', 'pentagon', 'heart'].forEach(s => avatarDiv.classList.remove('shape-' + s));
            if (groupAvatarShape !== 'none') avatarDiv.classList.add('shape-' + groupAvatarShape);
            if (groupMember.avatar) {
                avatarDiv.innerHTML = `<img src="${groupMember.avatar}" style="width:100%;height:100%;object-fit:cover;">`;
            } else {
                const initials = (groupMember.name || '?').charAt(0).toUpperCase();
                avatarDiv.innerHTML = `<div style="width:100%;height:100%;background:var(--accent-color);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;">${initials}</div>`;
            }
        } else {
            const isUser = msg.sender === 'user';
            const avatarElement = isUser ? DOMElements.me.avatar : DOMElements.partner.avatar;
            const frameSettings = isUser ? settings.myAvatarFrame : settings.partnerAvatarFrame;
            const avatarShape = isUser ? (settings.myAvatarShape || 'circle') : (settings.partnerAvatarShape || 'circle');
            avatarDiv.innerHTML = avatarElement.innerHTML;
            applyAvatarFrame(avatarDiv, frameSettings);
            ['circle', 'square', 'pentagon', 'heart'].forEach(s => avatarDiv.classList.remove('shape-' + s));
            if (avatarShape !== 'none') avatarDiv.classList.add('shape-' + avatarShape);
        }
    } else {
        avatarDiv.style.display = 'none';
    }

    // 对方消息头像添加长按艾特功能
    if (msg.sender !== 'user' && settings.inChatAvatarEnabled) {
        (function(avt, grpMem) {
            var lpTimer = null;
            avt.addEventListener('pointerdown', function(e) {
                lpTimer = setTimeout(function() {
                    // 群聊模式下使用群成员角色名，否则使用全局 partner 昵称
                    var name = grpMem ? (grpMem.name || '对方').trim() : (settings.partnerName || '对方').trim();
                    var input = DOMElements.messageInput;
                    if (input) {
                        var start = input.selectionStart;
                        var end = input.selectionEnd;
                        var before = input.value.substring(0, start);
                        var after = input.value.substring(end);
                        input.value = before + '@' + name + ' ' + after;
                        input.focus();
                        var newPos = start + name.length + 2;
                        input.setSelectionRange(newPos, newPos);
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                }, 500);
            });
            avt.addEventListener('pointerup', function() { clearTimeout(lpTimer); });
            avt.addEventListener('pointerleave', function() { clearTimeout(lpTimer); });
            avt.addEventListener('pointercancel', function() { clearTimeout(lpTimer); });
        })(avatarDiv, groupMember);
    }

    wrapper.appendChild(avatarDiv);

    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'message-content-wrapper';

    if (groupMember && groupChatSettings.showName) {
        const nameLabel = document.createElement('div');
        nameLabel.className = 'group-sender-name';
        nameLabel.textContent = groupMember.name;
        const isSameSenderGroupForName = lastSenderRef.current === 'group_' + groupMember.name;
        if (!isSameSenderGroupForName) contentWrapper.appendChild(nameLabel);
    } else if (!groupMember && msg.sender !== 'user' && msg.sender !== null && (settings.showPartnerNameInChat || showPartnerNameInChat)) {
        const isSameSenderForName = lastSenderRef.current === msg.sender;
        if (!isSameSenderForName) {
            const nameLabel = document.createElement('div');
            nameLabel.className = 'group-sender-name';
            nameLabel.textContent = settings.partnerName || msg.sender || '对方';
            contentWrapper.appendChild(nameLabel);
        }
    }

    let messageHTML = '';
    if (msg.replyTo) {
        const repliedText = msg.replyTo.text || (msg.replyTo.image ? '🖼 图片' : '[消息]');
        const repliedSender = msg.replyTo.sender === 'user' ? (settings.myName || '我') : (settings.partnerName || '对方');
        messageHTML += `<div class="reply-indicator" data-reply-id="${msg.replyTo.id || ''}" style="cursor:pointer;" onclick="scrollToQuotedMessage(this)"><span class="reply-indicator-sender">${repliedSender}</span><span class="reply-indicator-text">${repliedText}</span></div>`;
    }

    const isImageOnly = !msg.text && !!msg.image;
    const isRedPacket = msg.type === 'red-packet';
    const isVoiceMedia = msg.type === 'voice' || msg.mediaKind === 'audio';
    const isVideoMedia = msg.type === 'video' || msg.mediaKind === 'video';
    const isLinkCard = msg.type === 'link' || msg.linkUrl;
    const isShopCard = msg.type === 'share' || msg.type === 'pay-request';
    const isMediaMessage = isVoiceMedia || isVideoMedia;
    const escapeMediaText = (value) => String(value || '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
    const renderShopMessageCard = (message) => {
        const data = message.shareData || {};
        const name = escapeMediaText(data.name || message.shopName || '商品');
        const price = data.total || data.price || message.shopPrice || '';
        const icon = escapeMediaText(data.icon || '📦');
        const img = String(data.img || '');
        const isPay = message.type === 'pay-request';
        const tag = escapeMediaText(data.tag || (isPay ? '💝 已帮TA付' : '好物分享'));
        const tagColor = isPay ? 'linear-gradient(135deg,#ff9a56,#ff6b35)' : (data.tagColor || '#ff4757');
        const desc = escapeMediaText(data.desc || (isPay ? '帮我买这个好不好~' : name));
        const thumb = img && img.startsWith('data:image/')
            ? `<img src="${img}" style="width:52px;height:52px;object-fit:cover;border-radius:6px;" alt="${name}">`
            : `<span style="font-size:26px;">${icon}</span>`;
        return `<div class="chat-shop-card" style="background:linear-gradient(135deg,${isPay ? '#fff8f0' : '#fff5f5'},#fff);border:1px solid ${isPay ? '#ffd8b0' : '#ffe0e0'};border-radius:8px;padding:6px 8px;display:flex;gap:6px;align-items:center;width:min(260px, 100%);max-width:100%;box-sizing:border-box;overflow:hidden;">
            <div style="width:52px;height:52px;background:#f0f0f0;border-radius:6px;display:flex;align-items:center;justify-content:center;flex-shrink:0;overflow:hidden;">${thumb}</div>
            <div style="flex:1;min-width:0;line-height:1.2;">
                <div style="font-size:0.72rem;color:#666;">${desc}</div>
                ${isPay ? `<div style="font-size:0.72rem;font-weight:600;color:#333;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${name}</div>` : ''}
                <div style="font-size:0.78rem;color:#ff4757;font-weight:700;">¥${escapeMediaText(price)}</div>
                <span style="display:inline-block;background:${tagColor};color:#fff;font-size:0.55rem;padding:0px 4px;border-radius:6px;margin-top:1px;">${tag}</span>
            </div>
        </div>`;
    };
    let content = msg.text ? `<div>${escapeMediaText(msg.text).replace(/\n/g, '<br>')}</div>` : '';
    if (isRedPacket) {
        content = window.renderRedPacketMessage ? window.renderRedPacketMessage(msg) : '<div style="padding:10px;color:#c4453c;">红包消息</div>';
    } else if (isShopCard) {
        content = renderShopMessageCard(msg);
    } else if (isLinkCard) {
        const linkRawUrl = msg.linkUrl || msg.url || msg.text || '';
        window.__chatLinkUrlStore = window.__chatLinkUrlStore || {};
        window.__chatLinkUrlStore[String(msg.id)] = linkRawUrl;
        let linkHost = '网页链接';
        try { linkHost = new URL(linkRawUrl).hostname.replace(/^www\./, '') || '网页链接'; } catch (e) {}
        const linkTitle = escapeMediaText(msg.linkTitle || msg.title || linkHost || '网页链接');
        const rawDesc = msg.linkDesc || msg.description || linkHost;
        const linkDesc = escapeMediaText(/^https?:\/\//i.test(String(rawDesc || '')) ? linkHost : rawDesc);
        content = `<div class="chat-link-card" data-link-id="${msg.id}" onclick="window.toggleChatLinkFrame && window.toggleChatLinkFrame(this,event)">
            <div class="chat-link-icon"><i class="fas fa-link"></i></div>
            <div class="chat-link-main">
                <div class="chat-link-title">${linkTitle}</div>
                <div class="chat-link-desc">${linkDesc}</div>
                <div class="chat-link-host">${escapeMediaText(linkHost)}</div>
            </div>
            <button class="chat-link-edit" type="button" title="编辑名称" onclick="window.editChatLinkName && window.editChatLinkName(this,event)"><i class="fas fa-pen"></i></button>
        </div>`;
    } else if (isMediaMessage) {
        const mediaRawUrl = msg.mediaUrl || msg.voiceUrl || msg.videoUrl || '';
        if (isVoiceMedia || isVideoMedia) {
            window.__chatMediaUrlStore = window.__chatMediaUrlStore || {};
            window.__chatMediaUrlStore[String(msg.id)] = mediaRawUrl;
        }
        const mediaName = escapeMediaText(msg.mediaName || (isVoiceMedia ? '语音消息' : '视频消息'));
        if (isVoiceMedia) {
            content += `<div class="chat-media-message chat-media-audio" data-media-id="${msg.id}" data-library-id="${escapeMediaText(msg.mediaLibraryId || '')}" onclick="window.playChatVoiceBubble && window.playChatVoiceBubble(this,event)">
                <button class="chat-media-play" type="button" onclick="window.playChatVoiceBubble && window.playChatVoiceBubble(this,event)"><i class="fas fa-play"></i></button>
                <div class="chat-media-info"><div class="chat-media-title">${mediaName}</div><div class="chat-media-wave"><span></span><span></span><span></span><span></span><span></span></div><audio class="chat-audio-player" preload="none"></audio></div>
            </div>`;
        } else {
            content += `<div class="chat-media-message chat-media-video chat-video-direct-card" data-media-id="${msg.id}" data-library-id="${escapeMediaText(msg.mediaLibraryId || '')}" onclick="window.playChatVideoBubble && window.playChatVideoBubble(this,event)">
                <div class="chat-video-placeholder">
                    <button class="chat-media-play chat-video-direct-play" type="button" onclick="window.playChatVideoBubble && window.playChatVideoBubble(this,event)"><i class="fas fa-play"></i></button>
                    <div class="chat-video-hint">点击播放视频</div>
                </div>
                <div class="chat-media-title chat-video-title">${mediaName}</div>
            </div>`;
        }
    } else if (msg.image) content += `<img src="${msg.image}" class="message-image${isImageOnly ? ' message-image-only' : ''}" alt="图片" style="max-width:${isImageOnly ? '100px' : '100px'}; border-radius: 12px;${!isImageOnly ? ' margin-top: 6px;' : ''} cursor: pointer;" onclick="viewImage('${msg.image}')">`;
    messageHTML += content;

    const messageDiv = document.createElement('div');
    if (isRedPacket || isImageOnly) {
        messageDiv.className = `message message-${msg.sender === 'user' ? 'sent' : 'received'} message-image-bubble-none`;
    } else if (isMediaMessage || isLinkCard) {
        messageDiv.className = `message message-${msg.sender === 'user' ? 'sent' : 'received'} ${settings.bubbleStyle} message-media-bubble`;
    } else {
        messageDiv.className = `message message-${msg.sender === 'user' ? 'sent' : 'received'} ${settings.bubbleStyle}`;
    }
    messageDiv.innerHTML = messageHTML;

    // 红包卡片点击事件
    if (isRedPacket) {
        const rpCard = messageDiv.querySelector('.red-packet-card');
        if (rpCard) {
            const rpId = rpCard.dataset.rpId || (msg.redPacket && msg.redPacket.id) || msg.id;
            rpCard.addEventListener('click', function(e) {
                // 多选收藏/截图模式下，红包卡片不要打开领取弹窗，交给外层消息选择逻辑处理。
                // 这样“已退回红包”卡片也能像普通消息一样被选中截图。
                if (window.isScreenshotSelectMode || window.isBatchFavoriteMode || (typeof isBatchFavoriteMode !== 'undefined' && isBatchFavoriteMode)) {
                    return;
                }
                e.stopPropagation();
                if (rpCard.dataset.suppressOpen === '1') {
                    delete rpCard.dataset.suppressOpen;
                    return;
                }
                if (typeof window.showRedPacketReceiveModal === 'function') {
                    window.showRedPacketReceiveModal(rpId);
                }
            });
        }
    }

    let actionsHTML = '';
    if (settings.replyEnabled) actionsHTML += `<button class="meta-action-btn reply-btn" title="回复"><i class="fas fa-reply"></i></button>`;
    const starIcon = msg.favorited ? 'fas fa-star' : 'far fa-star';
    actionsHTML += `<button class="meta-action-btn favorite-action-btn ${msg.favorited ? 'favorited' : ''}" title="${msg.favorited ? '取消收藏' : '收藏'}"><i class="${starIcon}"></i></button>`;
    actionsHTML += `<button class="meta-action-btn screenshot-select-btn" title="多选截图"><i class="fas fa-camera"></i></button>`;
    // 用户发送的消息：5分钟内可撤回。保留截图，不再删撤回。
    if (msg.sender === 'user' && msg.timestamp) {
        var elapsed = Date.now() - new Date(msg.timestamp).getTime();
        if (elapsed <= 5 * 60 * 1000) {
            actionsHTML += `<button class="meta-action-btn recall-btn" title="撤回"><i class="fas fa-undo"></i></button>`;
        }
    }
    actionsHTML += `<button class="meta-action-btn delete-btn" title="删除"><i class="fas fa-trash-alt"></i></button>`;
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'message-meta-actions';
    actionsDiv.innerHTML = actionsHTML;

    // 红包卡片本身要能点击领取，但手机上也要能叫出引用/收藏/截图/删除工具栏。
    // 长按红包卡片只显示工具栏，不触发领取弹窗。
    if (isRedPacket) {
        const rpCardForActions = messageDiv.querySelector('.red-packet-card');
        if (rpCardForActions) {
            let rpPressTimer = null;
            const showRpActions = function(e) {
                if (e) {
                    e.preventDefault();
                    e.stopPropagation();
                }
                rpCardForActions.dataset.suppressOpen = '1';
                contentWrapper.classList.add('show-actions');
            };
            rpCardForActions.addEventListener('contextmenu', showRpActions);
            rpCardForActions.addEventListener('pointerdown', function(e) {
                if (e.pointerType === 'mouse' && e.button !== 0) return;
                clearTimeout(rpPressTimer);
                rpPressTimer = setTimeout(function() { showRpActions(); }, 420);
            });
            ['pointerup', 'pointerleave', 'pointercancel'].forEach(function(evtName) {
                rpCardForActions.addEventListener(evtName, function() { clearTimeout(rpPressTimer); });
            });
        }
    }

    let metaHTML = '';
    if (showTimestamp) {
        const ts = new Date(msg.timestamp);
        let timeStr;
        const fmt = settings.timeFormat || 'HH:mm';
        if (fmt === 'HH:mm:ss') {
            timeStr = ts.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        } else if (fmt === 'h:mm AM/PM') {
            timeStr = ts.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
        } else if (fmt === 'h:mm:ss AM/PM') {
            timeStr = ts.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true });
        } else {
            timeStr = ts.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
        }
        metaHTML += `<div class="timestamp">${timeStr}</div>`;
    }

    if (msg.sender === 'user' && settings.readReceiptsEnabled && isLastInSenderGroup) {
        const rrStyle = settings.readReceiptStyle || 'icon';
        if (rrStyle === 'text') {
            if (msg.status === 'read') {
                metaHTML += `<div class="read-receipt read" style="font-size:9px;letter-spacing:0.3px;font-weight:500;">已读</div>`;
            } else {
                metaHTML += `<div class="read-receipt" style="font-size:9px;letter-spacing:0.3px;opacity:0.5;">未读</div>`;
            }
        } else {
            const statusIcon = msg.status === 'read' ? 'fa-check-double' : 'fa-check';
            metaHTML += `<div class="read-receipt ${msg.status === 'read' ? 'read' : ''}"><i class="fas ${statusIcon}"></i></div>`;
        }
    }

    if (metaHTML !== '') {
        const metaDiv = document.createElement('div');
        metaDiv.className = 'message-meta';
        if (!showTimestamp && !metaHTML.includes('timestamp')) {
            metaDiv.style.height = 'auto';
            metaDiv.style.marginTop = '2px';
            if (settings.inChatAvatarPosition !== 'top') {
                avatarDiv.style.marginBottom = '18px';
            }
        } else {
            if (settings.inChatAvatarPosition !== 'top') {
                avatarDiv.style.marginBottom = '26px';
            }
        }
        metaDiv.innerHTML = metaHTML;
        // 功能栏绑定在消息头部（messageDiv 之前）
        contentWrapper.append(messageDiv, actionsDiv, metaDiv);
    } else {
        // 功能栏绑定在消息头部（messageDiv 之前）
        contentWrapper.append(messageDiv, actionsDiv);
    }
    wrapper.appendChild(contentWrapper);
    fragment.appendChild(wrapper);

    lastSenderRef.current = groupMember ? ('group_' + groupMember.name) : msg.sender;
    return fragment;
}

function _updateReadReceiptsDOM() {
    const container = DOMElements.chatContainer;
    const rrStyle = settings.readReceiptStyle || 'icon';
    container.querySelectorAll('.message-wrapper.sent').forEach(wrapper => {
        const receiptEl = wrapper.querySelector('.read-receipt');
        if (!receiptEl) return;
        const msgId = wrapper.dataset.msgId || wrapper.dataset.id;
        const msg = messages.find(m => String(m.id) === String(msgId));
        if (!msg || msg.status !== 'read') return;
        if (rrStyle === 'text') {
            receiptEl.classList.add('read');
            receiptEl.textContent = '已读';
            receiptEl.style.opacity = '1';
        } else {
            receiptEl.classList.add('read');
            const icon = receiptEl.querySelector('i');
            if (icon) icon.className = 'fas fa-check-double';
        }
    });
}

function renderMessages(preserveScroll = false) {
    const container = DOMElements.chatContainer;
    const totalMessages = messages.length;
    let startIndex = Math.max(0, totalMessages - displayedMessageCount);
    let endIndex = totalMessages;
    const locateWindow = window.__chatLocateWindow;
    const locating = !!(locateWindow && typeof locateWindow.start === 'number' && typeof locateWindow.end === 'number');

    if (locating) {
        startIndex = Math.max(0, Math.min(totalMessages, locateWindow.start));
        endIndex = Math.max(startIndex, Math.min(totalMessages, locateWindow.end));
    }

    const msgsToRender = messages.slice(startIndex, endIndex);

    const historyLoader = document.getElementById('history-loader');
    if (historyLoader) {
        historyLoader.style.display = (!locating && startIndex > 0) ? 'flex' : 'none';
    }

    DOMElements.emptyState.style.display = totalMessages === 0 ? 'flex' : 'none';

    const oldScrollHeight = container.scrollHeight;
    const oldScrollTop = container.scrollTop;
    const suppressAutoScroll = !!window.__suppressNextRenderAutoScroll;
    window.__suppressNextRenderAutoScroll = false;
    
    container.innerHTML = '';

    const fragment = new DocumentFragment();
    
    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    fragment.appendChild(spacer);

    if (locating) {
        const topNotice = document.createElement('div');
        topNotice.className = 'message-locate-notice';
        topNotice.style.cssText = 'align-self:center;margin:8px auto 10px;padding:6px 10px;border-radius:999px;background:rgba(var(--accent-color-rgb,180,140,100),0.10);color:var(--text-secondary);font-size:11px;line-height:1.4;max-width:86%;text-align:center;';
        topNotice.innerHTML = '已定位到搜索结果附近，只渲染附近消息，避免长记录卡顿 · <button type="button" onclick="window.exitMessageLocateMode&&window.exitMessageLocateMode()" style="border:none;background:none;color:var(--accent-color);font-size:11px;font-weight:700;padding:0;">回到最新消息</button>';
        fragment.appendChild(topNotice);
    }

    let lastSenderRef = { current: null };
    msgsToRender.forEach((msg, i) => {
        const prevMsg = i > 0 ? msgsToRender[i - 1] : (startIndex > 0 ? messages[startIndex - 1] : null);
        const nextMsg = i < msgsToRender.length - 1 ? msgsToRender[i + 1] : null;
        const msgFragment = createMessageFragment(msg, prevMsg, nextMsg, lastSenderRef);
        fragment.appendChild(msgFragment);
    });

    if (locating) {
        const bottomNotice = document.createElement('div');
        bottomNotice.className = 'message-locate-notice-bottom';
        bottomNotice.style.cssText = 'align-self:center;margin:10px auto 8px;padding:6px 10px;border-radius:999px;background:rgba(var(--accent-color-rgb,180,140,100),0.10);color:var(--text-secondary);font-size:11px;line-height:1.4;max-width:86%;text-align:center;';
        bottomNotice.innerHTML = '<button type="button" onclick="window.exitMessageLocateMode&&window.exitMessageLocateMode()" style="border:none;background:none;color:var(--accent-color);font-size:11px;font-weight:700;padding:0;">退出定位查看，回到最新消息</button>';
        fragment.appendChild(bottomNotice);
    }

    container.appendChild(fragment);

    if (preserveScroll) {
        const newScrollHeight = container.scrollHeight;
        container.scrollTop = oldScrollTop + (newScrollHeight - oldScrollHeight);
    } else if (!suppressAutoScroll && !locating) {
        requestAnimationFrame(() => {
            container.scrollTop = container.scrollHeight;
        });
    }
}

window.exitMessageLocateMode = function() {
    window.__chatLocateWindow = null;
    window.__suppressNextRenderAutoScroll = false;
    displayedMessageCount = Math.min(messages.length, (typeof HISTORY_BATCH_SIZE !== 'undefined' ? HISTORY_BATCH_SIZE : 20));
    if (typeof renderMessages === 'function') renderMessages(false);
};


window.openChatStatsModal = function(source) {
    try {
        if (typeof window.hideMomentsPage === 'function') {
            const moments = document.getElementById('moments-container');
            if (moments && (moments.classList.contains('active') || moments.style.display === 'block' || moments.style.display === 'flex')) {
                window.hideMomentsPage();
            }
        }
    } catch(e) {}
    try {
        const home = document.getElementById('home-container');
        if (home && (home.classList.contains('active') || home.style.display === 'flex' || home.style.display === 'block')) {
            if (typeof window.hideHomePage === 'function') window.hideHomePage();
            else {
                home.classList.remove('active');
                home.style.display = 'none';
                const bg = document.getElementById('home-page-bg');
                const chatArea = document.querySelector('.main-chat-area');
                const header = document.querySelector('.header');
                const input = document.querySelector('.input-area-wrapper');
                if (bg) bg.style.display = 'none';
                if (chatArea) chatArea.style.display = '';
                if (header) { header.style.display = ''; header.style.visibility = ''; }
                if (input) { input.style.display = ''; input.style.visibility = ''; }
                document.body.classList.remove('home-active');
            }
        }
    } catch(e) {}

    try {
        const modal = document.getElementById('stats-modal');
        if (!modal) return;
        if (typeof renderStatsContent === 'function') renderStatsContent();
        if (typeof switchStatsTab === 'function') switchStatsTab('stats');
        // 统计本体回到聊天环境打开；主页图标/底栏只作为跳转入口，不再用 homeShowModal 挂在主页层。
        if (typeof showModal === 'function') showModal(modal);
        else {
            modal.style.display = 'flex';
            modal.style.zIndex = '60000';
        }
    } catch(e) {
        console.error('[stats] 打开消息统计失败:', e);
        if (typeof showNotification === 'function') showNotification('消息统计打开失败，请刷新重试', 'error');
    }
};

window.locateMessageInChat = function(msgId, opts) {
    opts = opts || {};
    msgId = String(msgId || '');
    if (!msgId) return;

    function cssEscape(v) {
        try { return (window.CSS && CSS.escape) ? CSS.escape(String(v)) : String(v).replace(/"/g, '\"'); }
        catch(e) { return String(v).replace(/"/g, '\"'); }
    }
    function ensureChatVisible(done) {
        try {
            if (typeof window.hideMomentsPage === 'function') {
                const moments = document.getElementById('moments-container');
                if (moments && (moments.style.display !== 'none' && moments.classList.contains('active'))) window.hideMomentsPage();
            }
        } catch(e) {}
        try {
            const home = document.getElementById('home-container');
            if (home && (home.classList.contains('active') || home.style.display === 'flex' || home.style.display === 'block')) {
                if (typeof window.hideHomePage === 'function') window.hideHomePage();
                else {
                    home.classList.remove('active');
                    home.style.display = 'none';
                    const bg = document.getElementById('home-page-bg');
                    const chatArea = document.querySelector('.main-chat-area');
                    const header = document.querySelector('.header');
                    const input = document.querySelector('.input-area-wrapper');
                    if (bg) bg.style.display = 'none';
                    if (chatArea) chatArea.style.display = '';
                    if (header) header.style.display = '';
                    if (input) input.style.display = '';
                    document.body.classList.remove('home-active');
                }
            }
        } catch(e) {}
        setTimeout(done, opts.chatDelay || 80);
    }
    function closeStatsModal(done) {
        const m = document.getElementById('stats-modal');
        if (!m || m.style.display === 'none') { done(); return; }
        const content = m.querySelector('.modal-content');
        if (content) {
            content.style.opacity = '0';
            content.style.transform = 'translateY(20px) scale(0.95)';
        }
        if (m._hideTimeout) clearTimeout(m._hideTimeout);
        m._hideTimeout = setTimeout(function() {
            m.style.display = 'none';
            if (content) {
                content.style.opacity = '';
                content.style.transform = '';
            }
            done();
        }, opts.closeDelay || 160);
    }
    function findTarget() {
        const sid = cssEscape(msgId);
        return document.querySelector('[data-msg-id="' + sid + '"]') ||
               document.querySelector('[data-id="' + sid + '"]') ||
               document.querySelector('[data-message-id="' + sid + '"]');
    }
    function highlightTarget(target) {
        if (!target) return false;
        const container = DOMElements && DOMElements.chatContainer;
        if (container && target.offsetParent !== null) {
            const targetTop = target.offsetTop - (container.clientHeight / 2) + (target.offsetHeight / 2);
            container.scrollTo({ top: Math.max(0, targetTop), behavior: opts.instant ? 'auto' : 'smooth' });
        } else {
            target.scrollIntoView({ behavior: opts.instant ? 'auto' : 'smooth', block: 'center' });
        }
        target.classList.add('msg-highlight');
        target.style.transition = 'background .3s ease, box-shadow .3s ease';
        target.style.background = 'rgba(var(--accent-color-rgb,180,140,100),.16)';
        target.style.boxShadow = '0 0 0 2px rgba(var(--accent-color-rgb,180,140,100),.26)';
        setTimeout(function(){
            target.classList.remove('msg-highlight');
            target.style.background = '';
            target.style.boxShadow = '';
        }, 1800);
        return true;
    }
    function doLocate() {
        if (highlightTarget(findTarget())) return;
        if (typeof messages === 'undefined' || !Array.isArray(messages)) return;
        const msgIndex = messages.findIndex(function(m){ return String(m.id) === String(msgId); });
        if (msgIndex === -1) {
            if (typeof showNotification === 'function') showNotification('消息可能已被删除', 'info', 1800);
            return;
        }

        const needed = messages.length - msgIndex;
        const batch = typeof HISTORY_BATCH_SIZE !== 'undefined' ? HISTORY_BATCH_SIZE : 20;
        const heavyThreshold = opts.heavyThreshold || 420;
        window.__suppressNextRenderAutoScroll = true;

        if (needed > heavyThreshold) {
            const before = opts.before || 36;
            const after = opts.after || 90;
            window.__chatLocateWindow = {
                id: msgId,
                start: Math.max(0, msgIndex - before),
                end: Math.min(messages.length, msgIndex + after + 1)
            };
        } else {
            window.__chatLocateWindow = null;
            if (typeof displayedMessageCount !== 'undefined' && needed > displayedMessageCount) {
                displayedMessageCount = Math.min(messages.length, Math.max(needed + 5, batch));
            }
        }

        if (typeof renderMessages === 'function') {
            renderMessages(false);
            requestAnimationFrame(function(){
                requestAnimationFrame(function(){
                    if (!highlightTarget(findTarget())) {
                        setTimeout(function(){
                            if (!highlightTarget(findTarget()) && typeof showNotification === 'function') showNotification('消息定位失败', 'info', 1800);
                        }, 80);
                    }
                });
            });
        }
    }

    closeStatsModal(function(){ ensureChatVisible(doLocate); });
};

const addMessage = (message) => {
    if (!(message.timestamp instanceof Date)) message.timestamp = new Date(message.timestamp);
    
    const container = DOMElements.chatContainer;
    const wasEmpty = messages.length === 0;

    const prevMsg = messages.length > 0 ? messages[messages.length - 1] : null;
    messages.push(message);
    
    if (wasEmpty) {
        DOMElements.emptyState.style.display = 'none';
    }

    // --- Update previous message if needed ---
    const existingWrappers = container.querySelectorAll('.message-wrapper');
    const lastWrapper = existingWrappers.length > 0 ? existingWrappers[existingWrappers.length - 1] : null;
    if (lastWrapper && prevMsg) {
        const currentTs = new Date(message.timestamp).getTime();
        const prevTs = new Date(prevMsg.timestamp).getTime();

        if (message.sender === prevMsg.sender && message.type === 'normal' && prevMsg.type === 'normal' && (currentTs - prevTs < 60000)) {
            const metaEl = lastWrapper.querySelector('.message-meta');
            if (metaEl) metaEl.style.display = 'none';
            const avatarEl = lastWrapper.querySelector('.message-avatar');
            if (avatarEl) avatarEl.style.marginBottom = '';
        }
    }
    
    // --- Append new message ---
    let lastSenderRef = { current: null };
    if (prevMsg) {
        const prevGroupMember = (prevMsg.sender !== 'user' && typeof getGroupMemberForMessage === 'function') ? getGroupMemberForMessage(prevMsg.id) : null;
        lastSenderRef.current = prevGroupMember ? ('group_' + prevGroupMember.name) : prevMsg.sender;
    }
    
    const newMsgFragment = createMessageFragment(message, prevMsg, null, lastSenderRef);
    
    const spacer = container.querySelector('div[style*="flex: 1"]');
    if (spacer && spacer === container.lastElementChild) {
        spacer.before(newMsgFragment);
    } else {
        container.appendChild(newMsgFragment);
    }

    requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
    });

    throttledSaveData();

    if (message.sender && message.sender !== 'user' && message.sender !== 'system' && message.type !== 'system' && message.type !== 'call-event') {
        const homeContainer = document.getElementById('home-container');
        if (homeContainer && homeContainer.style.display !== 'none' && typeof window.showHomeNotification === 'function') {
            const partnerAvatarImg = document.querySelector('#partner-avatar img');
            let avatarSrc = partnerAvatarImg ? partnerAvatarImg.src : '';
            if (!avatarSrc && window.settings && window.settings.partnerAvatar) avatarSrc = window.settings.partnerAvatar;
            window.showHomeNotification({ sender: message.sender, text: message.image ? '[图片]' : (message.text || ''), avatar: avatarSrc });
        }
    }
};

        window._addCallEvent = (icon, label, detail) => {
            addMessage({
                id: Date.now() + Math.random(),
                sender: 'system',
                text: label + (detail ? ' · ' + detail : ''),
                timestamp: new Date(),
                status: 'received',
                type: 'call-event',
                callIcon: icon || 'fa-video',
                callDetail: detail || null,
                favorited: false,
                note: null,
            });
        };

        function optimizeImage(file, maxWidth = 800, quality = 0.7) {
            return new Promise((resolve, reject) => {
                if (file.size < 300 * 1024) {
                    const reader = new FileReader();
                    reader.onload = e => resolve(e.target.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                    return;
                }
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const ctx = canvas.getContext('2d');
                    let {
                        width,
                        height
                    } = img;
                    if (width > maxWidth) {
                        height = Math.round((height * maxWidth) / width);
                        width = maxWidth;
                    }
                    canvas.width = width;
                    canvas.height = height;
                    ctx.drawImage(img, 0, 0, width, height);
                    resolve(canvas.toDataURL('image/jpeg', quality));
                    URL.revokeObjectURL(img.src);
                };
                img.onerror = () => {
                    const reader = new FileReader();
                    reader.onload = e => resolve(e.target.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                    URL.revokeObjectURL(img.src);
                };
                img.src = URL.createObjectURL(file);
            });
        }

        window.updateReplyPreview = function() {
            const container = DOMElements.replyPreviewContainer;
            if (!container) return;
            if (!currentReplyTo) {
                container.innerHTML = '';
                container.style.display = 'none';
                return;
            }
            const senderName = currentReplyTo.sender === 'user' ? (settings.myName || '我') : (settings.partnerName || '对方');
            const previewText = currentReplyTo.text ? currentReplyTo.text.slice(0, 40) : '🖼 图片';
            container.style.display = 'flex';
            container.innerHTML = `
                <div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:rgba(var(--accent-color-rgb),0.07);border-left:3px solid var(--accent-color);border-radius:0 8px 8px 0;width:100%;">
                    <div style="flex:1;min-width:0;">
                        <span style="font-size:11px;color:var(--accent-color);font-weight:600;">回复 ${senderName}</span>
                        <div style="font-size:12px;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${previewText}</div>
                    </div>
                    <button onclick="currentReplyTo=null;window.updateReplyPreview();" style="background:none;border:none;cursor:pointer;color:var(--text-secondary);padding:2px 4px;font-size:14px;">✕</button>
                </div>`;
        };
        function updateReplyPreview() { window.updateReplyPreview(); }

        // ── 对方拍一拍核心逻辑（提取为独立函数，供随机触发和测试指令共用）──
        window._triggerPartnerPoke = function() {
            let pokeAction = null;

            const groups = window.customPokeGroups || [];
            const allPokes = (typeof customPokes !== 'undefined' ? customPokes : []) || [];

            const enabledGroups = groups.filter(function(g) {
                return !g.disabled && Array.isArray(g.items) && g.items.length > 0;
            });

            const groupedItems = new Set();
            enabledGroups.forEach(function(g) { g.items.forEach(function(t) { groupedItems.add(t); }); });

            const ungroupedPokes = allPokes.filter(function(t) { return !groupedItems.has(t); });

            if (enabledGroups.length > 0) {
                const pickedGroup = enabledGroups[Math.floor(Math.random() * enabledGroups.length)];
                const groupPool = pickedGroup.items.filter(function(t) { return allPokes.includes(t); });
                if (groupPool.length > 0) {
                    pokeAction = groupPool[Math.floor(Math.random() * groupPool.length)];
                }
            }

            if (!pokeAction && ungroupedPokes.length > 0) {
                pokeAction = ungroupedPokes[Math.floor(Math.random() * ungroupedPokes.length)];
            }
            if (!pokeAction && allPokes.length > 0) {
                pokeAction = allPokes[Math.floor(Math.random() * allPokes.length)];
            }
            if (!pokeAction && CONSTANTS.POKE_ACTIONS && CONSTANTS.POKE_ACTIONS.length > 0) {
                pokeAction = getRandomItem(CONSTANTS.POKE_ACTIONS);
            }
            if (!pokeAction) {
                if (typeof showNotification === 'function') showNotification('拍一拍库为空，请先添加内容', 'warning', 2500);
                return;
            }

            if (typeof window._sanitizePokeTextForDisplay === 'function') {
                pokeAction = window._sanitizePokeTextForDisplay(pokeAction);
            }
            const pokeText = (typeof window._formatPartnerPokeText === 'function')
                ? window._formatPartnerPokeText(`${settings.partnerName} ${pokeAction}`)
                : `${settings.partnerName} ${pokeAction}`;

            addMessage({ id: Date.now(), text: pokeText, timestamp: new Date(), type: 'system' });
            if (typeof playSound === 'function') playSound('partner_poke');
            (function(){try{if(window._typingIndicatorAutoHideTimer){clearTimeout(window._typingIndicatorAutoHideTimer);window._typingIndicatorAutoHideTimer=null;}}catch(e){}var _tiW=document.getElementById('typing-indicator-wrapper');if(_tiW){var _tiInner=_tiW.querySelector('.typing-indicator');if(_tiInner){_tiInner.classList.add('hiding');setTimeout(function(){_tiW.style.display='none';if(_tiInner)_tiInner.classList.remove('hiding');},240);}else{_tiW.style.display='none';}}})();
        };

        function sendMessage(textOverride = null, type = 'normal') {
            const text = textOverride || DOMElements.messageInput.value.trim();
            const imageFile = DOMElements.imageInput.files[0];
            if (!text && !imageFile && type === 'normal') return;

            // ── 斜杠指令拦截 ──
            if (text && text.startsWith('/') && type === 'normal') {
                const cmd = text.replace(/\s+/g, '').toLowerCase();
                if (cmd === '/测试拍一拍' || cmd === '/testpoke') {
                    DOMElements.messageInput.value = '';
                    DOMElements.messageInput.style.height = '46px';
                    if (typeof window._triggerPartnerPoke === 'function') window._triggerPartnerPoke();
                    if (typeof showNotification === 'function') showNotification('✦ 强制触发对方拍一拍', 'info', 1800);
                    return;
                }
                if (cmd === '/测试状态更新' || cmd === '/teststatus') {
                    DOMElements.messageInput.value = '';
                    DOMElements.messageInput.style.height = '46px';
                    if (typeof window._triggerStatusChange === 'function') window._triggerStatusChange();
                    if (typeof showNotification === 'function') showNotification('✦ 强制触发状态更新', 'info', 1800);
                    return;
                }
            }

            DOMElements.messageInput.value = '';
            DOMElements.messageInput.style.height = '46px';
            if (imageFile && imageFile.size > MAX_IMAGE_SIZE) {
                showNotification('图片大小不能超过5MB', 'error'); DOMElements.imageInput.value = ''; return;
            }

            const createMessage = (imgSrc = null) => {
                const messageData = {
                    id: Date.now(),
                    sender: 'user',
                    text: text || '',
                    timestamp: new Date(),
                    image: imgSrc,
                    status: 'sent',
                    favorited: false,
                    note: null,
                    replyTo: currentReplyTo,
                    type: type
                };
                if (type === 'system') messageData.sender = null;

                addMessage(messageData);
                if (type !== 'system') playSound('send');
                currentReplyTo = null;
                updateReplyPreview();

                // TA的手机：实时收藏用户发送的消息
                if (text && (type === 'normal' || type === 'share') && typeof window.TaPhoneApp === 'object' && typeof window.TaPhoneApp.tryCollectChat === 'function') {
                    window.TaPhoneApp.tryCollectChat(text, Date.now(), messageData);
                }
                // 火花：记录用户发送消息
                if (type === 'normal' && typeof window.SparkApp === 'object' && typeof window.SparkApp.recordChat === 'function') {
                    window.SparkApp.recordChat();
                }

if (!isBatchMode && type === 'normal') {
    const delayRange = settings.replyDelayMax - settings.replyDelayMin;
    const randomDelay = settings.replyDelayMin + Math.random() * delayRange;

    const chance = Math.max(0, Math.min(1, Number(settings.readNoReplyChance) || 0));
    const shouldIgnore = settings.allowReadNoReply && (Math.random() < chance);

    const readDelay = 1500 + Math.random() * 2500;
                setTimeout(() => {
        let changed = false;
        messages.forEach(msg => {
            if (msg.sender === 'user' && msg.status !== 'read') {
                msg.status = 'read';
                changed = true;
            }
        });
        if (changed) { _updateReadReceiptsDOM(); throttledSaveData(); }
    }, readDelay);

    if (window._pendingReplyTimer) clearTimeout(window._pendingReplyTimer);
    window._pendingReplyTimer = null;

            if (!shouldIgnore) {
        if (settings.typingIndicatorEnabled) {
            const tiWrapper = document.getElementById('typing-indicator-wrapper');
            const tiLabel = document.getElementById('typing-indicator-label');
            const tiAvatar = document.getElementById('typing-indicator-avatar');
            if (tiLabel) tiLabel.textContent = (settings.partnerName || '对方') + ' 正在输入';
            if (tiWrapper) { 
                positionTypingIndicator(); 
                tiWrapper.style.display = 'block'; 
            }
            if (tiAvatar) {
                const partnerImg = DOMElements.partner.avatar.querySelector('img');
                tiAvatar.innerHTML = partnerImg ? `<img src="${partnerImg.src}">` : '<i class="fas fa-user"></i>';
            }
            if (DOMElements.chatContainer) DOMElements.chatContainer.scrollTop = DOMElements.chatContainer.scrollHeight;
        }
        window._pendingReplyTimer = setTimeout(() => {
            window._pendingReplyTimer = null;
            simulateReply();
        }, randomDelay);
    }
}
};

            if (imageFile) {
                showNotification('正在优化图片...', 'info', 1500);
                optimizeImage(imageFile).then(createMessage).catch(() => showNotification('图片处理失败', 'error'));
            } else {
                createMessage();
            }
            DOMElements.imageInput.value = '';
        }

        function toggleBatchMode() {
            isBatchMode = !isBatchMode;
            DOMElements.batchBtn.classList.toggle('active', isBatchMode);
            DOMElements.batchBtn.title = isBatchMode ? "退出批量模式": "批量发送模式";
            DOMElements.batchPreview.style.display = isBatchMode ? 'flex': 'none';
            const placeholder = "";
            DOMElements.messageInput.placeholder = isBatchMode ? "此刻，想说的有很多很多...": (placeholder.length > 20 ? placeholder.substring(0, 20) + "...": placeholder);
            if (isBatchMode) {
                batchMessages = []; updateBatchPreview();
            }
        }

        function addToBatch(imageOverride = null) {
            const text = DOMElements.messageInput.value.trim();
            if (!text && !imageOverride) return;
            batchMessages.push({
                id: Date.now() + batchMessages.length, text: text || '', image: imageOverride || null
            });
            DOMElements.messageInput.value = ''; DOMElements.messageInput.style.height = '46px';
            updateBatchPreview();
        }

        function updateBatchPreview() {
            const previewContainer = DOMElements.batchPreview;
            let listHTML = '';
            if (batchMessages.length > 0) {
                listHTML = batchMessages.map((msg, index) => {
                    const preview = msg.image
                        ? `<img src="${msg.image}" style="height:36px;width:36px;object-fit:cover;border-radius:6px;vertical-align:middle;margin-right:6px;">`
                        : '';
                    const label = msg.text
                        ? `<span class="batch-preview-text">${msg.text}</span>`
                        : `<span class="batch-preview-text" style="color:var(--text-secondary);font-style:italic;">图片</span>`;
                    return `<div class="batch-preview-item" data-index="${index}">${preview}${label}<button class="batch-preview-edit" title="编辑"><i class="fas fa-pencil-alt"></i></button><button class="batch-preview-remove"><i class="fas fa-times"></i></button></div>`;
                }).join('');
            } else {
                listHTML = '<div style="text-align: center; color: var(--text-secondary); font-size: 14px; padding: 10px;">つ♡⊂</div>';
            }

            previewContainer.innerHTML = `
        <div class="batch-preview-title">我有很多的话想说…！</div>
        <div class="batch-actions-top" style="display:flex;gap:6px;padding:4px 10px 0;"><label style="flex:1;display:flex;align-items:center;justify-content:center;gap:5px;padding:5px 8px;background:var(--secondary-bg);border:1px solid var(--border-color);border-radius:8px;cursor:pointer;font-size:12px;color:var(--text-secondary);"><i class="fas fa-image"></i>添加图片<input type="file" accept="image/*" style="display:none;" id="batch-image-input"></label></div>
        <div class="batch-preview-list">${listHTML}</div>
        <div class="batch-actions">
        <button class="batch-action-btn batch-cancel-btn">取消</button>
        <button class="batch-action-btn batch-send-btn" ${batchMessages.length === 0 ? 'disabled': ''}>发送全部 (${batchMessages.length})</button>
        </div>`;

            const batchImgInput = document.getElementById('batch-image-input');
            if (batchImgInput) {
                batchImgInput.addEventListener('change', async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    if (file.size > MAX_IMAGE_SIZE) { showNotification('图片超过5MB限制', 'warning'); return; }
                    try {
                        const base64 = await optimizeImage(file, 600, 0.8);
                        addToBatch(base64);
                    } catch(err) { showNotification('图片处理失败', 'error'); }
                    e.target.value = '';
                });
            }
        }

        function sendBatchMessages() {
            if (batchMessages.length === 0) return;
            showNotification(`正在发送 ${batchMessages.length} 条消息...`, 'info', 2000);
            batchMessages.forEach((msg, index) => {
                setTimeout(() => {
                    addMessage({
                        id: Date.now() + index, sender: 'user', text: msg.text || '', image: msg.image || null, timestamp: new Date(), status: 'sent', favorited: false, type: 'normal'
                    });
                    playSound('send');
                }, index * 300);
            });
            const delayRange = settings.replyDelayMax - settings.replyDelayMin;
            const randomDelay = settings.replyDelayMin + Math.random() * delayRange;
            setTimeout(simulateReply, batchMessages.length * 300 + randomDelay);
            isBatchMode = false; batchMessages = [];
            DOMElements.batchBtn.classList.remove('active'); DOMElements.batchPreview.style.display = 'none';
            const placeholder = "";
            DOMElements.messageInput.placeholder = placeholder.length > 20 ? placeholder.substring(0, 20) + "...": placeholder;
        }

        function positionTypingIndicator() {
            var tiW = document.getElementById('typing-indicator-wrapper');
            var inputArea = document.querySelector('.input-area-wrapper');
            if (!tiW || !inputArea) return;
            var h = inputArea.offsetHeight;
            tiW.style.bottom = h + 'px';
        }
        (function() {
            var inputArea = document.querySelector('.input-area-wrapper');
            if (!inputArea) return;
            if (typeof ResizeObserver === 'undefined') {
                window.addEventListener('resize', function() {
                    var tiW = document.getElementById('typing-indicator-wrapper');
                    if (tiW && tiW.style.display !== 'none') positionTypingIndicator();
                });
                return;
            }
            var ro = new ResizeObserver(function() {
                var tiW = document.getElementById('typing-indicator-wrapper');
                if (tiW && tiW.style.display !== 'none') positionTypingIndicator();
            });
            ro.observe(inputArea);
        })();

        window.simulateReply = function() {
            function showTypingIndicator() {
                if (!settings.typingIndicatorEnabled) return;
                const tiWrapper = document.getElementById('typing-indicator-wrapper');
                const tiLabel = document.getElementById('typing-indicator-label');
                const tiAvatar = document.getElementById('typing-indicator-avatar');
                if (tiLabel) tiLabel.textContent = (settings.partnerName || '对方') + ' 正在输入';
                if (tiWrapper) { 
                    positionTypingIndicator(); 
                    tiWrapper.style.display = 'block'; 
                }
                if (tiAvatar) {
                    const partnerImg = DOMElements.partner.avatar.querySelector('img');
                    tiAvatar.innerHTML = partnerImg ? `<img src="${partnerImg.src}">` : '<i class="fas fa-user"></i>';
                }
                DOMElements.chatContainer.scrollTop = DOMElements.chatContainer.scrollHeight;
            }

            let changed = false;
            messages.forEach(msg => {
                if (msg.sender === 'user' && msg.status !== 'read') {
                    msg.status = 'read'; changed = true;
                }
            });
            if (changed) {
                _updateReadReceiptsDOM(); throttledSaveData();
            }

if (partnerPersonas && partnerPersonas.length > 0 && Math.random() < 0.3) {
                const currentPool = [
                    ...partnerPersonas
                ];
                if(currentPool.length > 0) {
                     const nextPersona = currentPool[Math.floor(Math.random() * currentPool.length)];
                     
                     settings.partnerName = nextPersona.name;
                     DOMElements.partner.name.textContent = nextPersona.name;
                     
                     if (nextPersona.avatar) {
                         updateAvatar(DOMElements.partner.avatar, nextPersona.avatar);
                         localforage.setItem(getStorageKey('partnerAvatar'), nextPersona.avatar);
                     }
                     throttledSaveData();
                }
            }
            if (Math.random() < 0.03) {
                // ── 对方拍一拍：调用提取的通用函数（同时供 /测试拍一拍 指令使用）──
                if (typeof window._triggerPartnerPoke === 'function') window._triggerPartnerPoke();
                return;
            }

            if (typeof window.tryPartnerAutoMediaReply === 'function' && window.tryPartnerAutoMediaReply()) {
                return;
            }

            // 拼字卡模式：随机抽取2-3条字卡合并发送
            if (settings.pinyinCardEnabled && Math.random() < 0.3) {
                const allCards = [];
                // 收集字卡库中的字卡
                if (window._customReplies && window._customReplies.length > 0) {
                    allCards.push(...window._customReplies.map(r => String(r || '').trim()).filter(Boolean));
                }
                // 收集颜文字
                if (window._kaomojiLibrary && window._kaomojiLibrary.length > 0) {
                    allCards.push(...window._kaomojiLibrary.map(k => String(k || '').trim()).filter(Boolean));
                }
                // 收集emoji
                if (window._customEmojis && window._customEmojis.length > 0) {
                    allCards.push(...window._customEmojis.map(e => String(e || '').trim()).filter(Boolean));
                }
                if (allCards.length >= 2) {
                    showTypingIndicator();
                    const minCount = Math.max(2, settings.pinyinCardMin || 2);
                    const maxCount = Math.max(minCount, settings.pinyinCardMax || 3);
                    const cardCount = minCount + Math.floor(Math.random() * (maxCount - minCount + 1));
                    const shuffled = allCards.sort(() => Math.random() - 0.5);
                    const picked = shuffled.slice(0, Math.min(cardCount, shuffled.length));
                    const mergedText = picked.join('，');
                    const delayRange = settings.replyDelayMax - settings.replyDelayMin;
                    const delay = settings.replyDelayMin + Math.random() * delayRange;
                    setTimeout(() => {
                        addMessage({
                            id: Date.now(),
                            sender: settings.partnerName || '对方',
                            text: mergedText,
                            timestamp: new Date(),
                            status: 'received',
                            favorited: false,
                            note: null,
                            type: 'normal'
                        });
                        playSound('message');
                        if (typeof window._sendPartnerNotification === 'function') {
                            window._sendPartnerNotification(settings.partnerName || '对方', mergedText);
                        }
                    }, delay);
                    return;
                }
            }

            const replyCount = Math.random() < 0.75 ? 1: (Math.random() < 0.95 ? 2: 3);
            if (!customReplies || customReplies.length === 0) {
                showNotification('回复库为空，请先到「自定义回复」中添加内容', 'info', 3500);
                return;
            }
            const disabledItemsOnce = (() => {
                try {
                    const raw = localStorage.getItem('disabledReplyItems');
                    return raw ? new Set(JSON.parse(raw)) : new Set();
                } catch (e) { return new Set(); }
            })();
            const disabledGroupItemsOnce = new Set();
            (window.customReplyGroups || []).forEach(g => {
                if (g.disabled && Array.isArray(g.items)) g.items.forEach(item => disabledGroupItemsOnce.add(item));
            });
            const replyPoolOnce = customReplies
                .filter(r => !disabledItemsOnce.has(r) && !disabledGroupItemsOnce.has(r))
                .map(r => String(r || '').trim())
                .filter(Boolean);
            if (!replyPoolOnce.length) {
                showNotification('回复库可用内容为空（可能被分组禁用或屏蔽），请到「自定义回复」中调整', 'info', 4000);
                return;
            }

            // 确认有可用回复后再展示“正在输入中”，避免空转
            showTypingIndicator();
            let delay = 0;
            const recentUserMsgs = settings.replyEnabled
                ? messages.filter(m => m.sender === 'user' && m.text).slice(-10)
                : [];
            for (let i = 0; i < replyCount; i++) {
                const delayRange = settings.replyDelayMax - settings.replyDelayMin;
                delay += settings.replyDelayMin + Math.random() * delayRange;
                setTimeout(() => {
                    try {
                    const replyPool = replyPoolOnce;
                    // 被屏蔽或无效项直接换下一个，尽量保证每次都产出可用回复
                    let replyText = '';
                    for (let t = 0; t < 6; t++) {
                        const picked = replyPool[Math.floor(Math.random() * replyPool.length)];
                        if (picked && String(picked).trim()) {
                            replyText = String(picked).trim();
                            break;
                        }
                    }
                    if (!replyText && i === replyCount - 1) {
                        (function(){try{if(window._typingIndicatorAutoHideTimer){clearTimeout(window._typingIndicatorAutoHideTimer);window._typingIndicatorAutoHideTimer=null;}}catch(e){}var _tiW=document.getElementById('typing-indicator-wrapper');if(_tiW){var _tiInner=_tiW.querySelector('.typing-indicator');if(_tiInner){_tiInner.classList.add('hiding');setTimeout(function(){_tiW.style.display='none';if(_tiInner)_tiInner.classList.remove('hiding');},240);}else{_tiW.style.display='none';}}})();
                        return;
                    }

                    let disabledStickerItems = new Set();
                    try {
                        const raw = localStorage.getItem('disabledStickerItems');
                        if (raw) disabledStickerItems = new Set(JSON.parse(raw));
                    } catch (e) {}
                    const enabledStickerPool = (stickerLibrary || []).filter(s => !disabledStickerItems.has(s));
                    const shouldSendSticker = enabledStickerPool.length > 0 && Math.random() < 0.2;

                    let finalText = replyText;
                    let separateEmoji = null;
                    let separateKaomoji = null;
                    
                    // Emoji 混入逻辑
                    if (customEmojis && customEmojis.length > 0 && Math.random() < 0.2) {
                        const emoji = customEmojis[Math.floor(Math.random() * customEmojis.length)];
                        if (settings.emojiMixEnabled !== false) {
                            finalText = Math.random() < 0.5
                                ? emoji + ' ' + finalText
                                : finalText + ' ' + emoji;
                        } else {
                            separateEmoji = emoji;
                        }
                    }
                    
                    // 颜文字混入逻辑
                    if (kaomojiLibrary && kaomojiLibrary.length > 0 && Math.random() < 0.25) {
                        const kaomoji = kaomojiLibrary[Math.floor(Math.random() * kaomojiLibrary.length)];
                        if (settings.kaomojiMixEnabled !== false) {
                            finalText = Math.random() < 0.5
                                ? kaomoji + ' ' + finalText
                                : finalText + ' ' + kaomoji;
                        } else {
                            separateKaomoji = kaomoji;
                        }
                    }

                    addMessage({
                        id: Date.now() + i,
                        sender: settings.partnerName || '对方',
                        text: finalText,
                        timestamp: new Date(),
                        status: 'received',
                        favorited: false,
                        note: null,
                        replyTo: (i === 0 && recentUserMsgs.length > 0 && Math.random() < 0.3)
                            ? (function(){ const m = recentUserMsgs[Math.floor(Math.random() * recentUserMsgs.length)]; return { id: m.id, text: m.text, sender: m.sender }; })()
                            : null,
                        type: 'normal'
                    });
                    if (typeof window._sendPartnerNotification === 'function') {
                        window._sendPartnerNotification(settings.partnerName || '对方', finalText);
                    }
                    playSound('message');

                    if (shouldSendSticker) {
                        const randomSticker = enabledStickerPool[Math.floor(Math.random() * enabledStickerPool.length)];
                        setTimeout(() => {
                            addMessage({
                                id: Date.now() + i + 2000,
                                sender: settings.partnerName || '对方',
                                text: '',
                                timestamp: new Date(),
                                image: randomSticker,
                                status: 'received',
                                favorited: false,
                                note: null,
                                type: 'normal'
                            });
                            playSound('message');
                            if (typeof window._sendPartnerNotification === 'function') {
                                window._sendPartnerNotification(settings.partnerName || '对方', '[表情]');
                            }
                        }, 400 + Math.random() * 600);
                    }

                    if (separateEmoji) {
                        setTimeout(() => {
                            addMessage({
                                id: Date.now() + i + 1000,
                                sender: settings.partnerName || '对方',
                                text: separateEmoji,
                                timestamp: new Date(),
                                status: 'received',
                                favorited: false,
                                note: null,
                                type: 'normal'
                            });
                            playSound('message');
                        }, 300 + Math.random() * 400);
                    }

                    if (separateKaomoji) {
                        setTimeout(() => {
                            addMessage({
                                id: Date.now() + i + 1200,
                                sender: settings.partnerName || '对方',
                                text: separateKaomoji,
                                timestamp: new Date(),
                                status: 'received',
                                favorited: false,
                                note: null,
                                type: 'normal'
                            });
                            playSound('message');
                        }, 350 + Math.random() * 400);
                    }

                    // 语音回复逻辑：约 15% 概率发送语音
                    const voicePool = (typeof customVoices !== 'undefined' && Array.isArray(customVoices)) ? customVoices : [];
                    const shouldSendVoice = voicePool.length > 0 && Math.random() < 0.15;
                    if (shouldSendVoice) {
                        const randomVoice = voicePool[Math.floor(Math.random() * voicePool.length)];
                        setTimeout(() => {
                            const voiceMsg = {
                                id: Date.now() + i + 3000,
                                sender: settings.partnerName || '对方',
                                text: '',
                                timestamp: new Date(),
                                type: 'voice',
                                voiceUrl: randomVoice.audioUrl,
                                voiceText: randomVoice.text,
                                voiceDuration: 0,
                                status: 'received',
                                favorited: false,
                                note: null,
                                replyTo: null
                            };
                            if (randomVoice.audioUrl) {
                                try {
                                    const tmpA = new Audio(randomVoice.audioUrl);
                                    tmpA.addEventListener('loadedmetadata', () => {
                                        voiceMsg.voiceDuration = Math.round(tmpA.duration) || 0;
                                        addMessage(voiceMsg);
                                        playSound('message');
                                    });
                                    tmpA.addEventListener('canplaythrough', () => {
                                        voiceMsg.voiceDuration = Math.round(tmpA.duration) || 0;
                                        addMessage(voiceMsg);
                                        playSound('message');
                                    });
                                    tmpA.addEventListener('error', () => { addMessage(voiceMsg); playSound('message'); });
                                    setTimeout(() => { addMessage(voiceMsg); playSound('message'); }, 2000);
                                } catch(e) { addMessage(voiceMsg); playSound('message'); }
                            } else {
                                addMessage(voiceMsg);
                                playSound('message');
                            }
                        }, 500 + Math.random() * 800);
                    }

                    if (i === replyCount - 1) {
                        (function() {
                            try {
                                if (window._typingIndicatorAutoHideTimer) {
                                    clearTimeout(window._typingIndicatorAutoHideTimer);
                                    window._typingIndicatorAutoHideTimer = null;
                                }
                            } catch (e) {}
                            var _tiW = document.getElementById('typing-indicator-wrapper');
                            if (_tiW) {
                                var _tiInner = _tiW.querySelector('.typing-indicator');
                                if (_tiInner) {
                                    _tiInner.classList.add('hiding');
                                    setTimeout(function() {
                                        _tiW.style.display = 'none';
                                        if (_tiInner) _tiInner.classList.remove('hiding');
                                    }, 240);
                                } else {
                                    _tiW.style.display = 'none';
                                }
                            }
                        })();
                        // 系统随机发红包（在回复完成后触发）
                        if (typeof window.trySystemRedPacket === 'function') {
                            setTimeout(function() { window.trySystemRedPacket(); }, 800 + Math.random() * 1200);
                        }
                        // 系统随机收取待领取红包
                        if (typeof window.tryCollectPendingRedPacket === 'function') {
                            setTimeout(function() { window.tryCollectPendingRedPacket(); }, 1200 + Math.random() * 1500);
                        }
                        // 检查24小时过期红包
                        if (typeof window.checkRedPacketExpiry === 'function') {
                            setTimeout(function() { window.checkRedPacketExpiry(); }, 500);
                        }
                    }
                    } catch (e) {
                        console.error('[simulateReply] 渲染/回填出错:', e);
                        // 机制性兜底：出错时至少让“正在输入中”消失，避免假死
                        try {
                            (function(){
                                try { if (window._typingIndicatorAutoHideTimer) { clearTimeout(window._typingIndicatorAutoHideTimer); window._typingIndicatorAutoHideTimer = null; } } catch (e2) {}
                                var _tiW2 = document.getElementById('typing-indicator-wrapper');
                                if (_tiW2) _tiW2.style.display = 'none';
                            })();
                        } catch (e2) {}
                    }
                }, delay);
            }
        }

function showModal(modalElement, focusElement = null) {
            if (!modalElement) return;
            if (modalElement._hideTimeout) {
                clearTimeout(modalElement._hideTimeout);
                modalElement._hideTimeout = null;
            }
            // 每次打开都挪到 body 末尾；同级弹窗同 z-index 时，DOM 顺序会决定谁压谁。
            if (document.body && modalElement.parentElement !== document.body) {
                document.body.appendChild(modalElement);
            } else if (document.body && document.body.lastElementChild !== modalElement) {
                document.body.appendChild(modalElement);
            }
            // 统一弹窗层级：主弹窗固定在 60000 段，后开的子面板用 90000 段。
            const openCount = Array.from(document.querySelectorAll('.modal')).filter(m => m !== modalElement && getComputedStyle(m).display !== 'none').length;
            const modalZ = 60000 + openCount * 10;
            window.__modalTopZ = modalZ;
            modalElement.style.setProperty('z-index', String(modalZ), 'important');
            const immediateContent = modalElement.querySelector('.modal-content');
            if (immediateContent) immediateContent.style.setProperty('z-index', String(modalZ + 1), 'important');
            modalElement.style.display = 'flex';
            document.body.classList.add('modal-open');
            // 隐藏 header 和 input-area，彻底避免遮挡
            const header = document.querySelector('.header');
            if (header) header.style.visibility = 'hidden';
            const inputArea = document.querySelector('.input-area-wrapper');
            if (inputArea) inputArea.style.visibility = 'hidden';
            requestAnimationFrame(() => {
                const content = modalElement.querySelector('.modal-content');
                if (content) {
                    content.style.opacity = '1';
                    content.style.transform = 'translateY(0) scale(1)';
                }
                if (focusElement) {
                    setTimeout(() => focusElement.focus(), 100);
                }
            });
        }

        function hideModal(modalElement) {
            if (!modalElement) return;
            const content = modalElement.querySelector('.modal-content');
            if (content) {
                content.style.opacity = '0';
                content.style.transform = 'translateY(20px) scale(0.95)';
            }
            if (modalElement._hideTimeout) clearTimeout(modalElement._hideTimeout);
            modalElement._hideTimeout = setTimeout(() => {
                modalElement.style.display = 'none';
                modalElement.style.removeProperty('z-index');
                if (content) content.style.removeProperty('z-index');
                const hasOpenModal = Array.from(document.querySelectorAll('.modal')).some(m => {
                    if (m === modalElement) return false;
                    const display = getComputedStyle(m).display;
                    return display !== 'none';
                });
                // 只有最后一个弹窗关闭时才恢复 header 和 input-area，避免多层弹窗互相误恢复。
                if (!hasOpenModal) {
                    const header = document.querySelector('.header');
                    if (header) header.style.visibility = '';
                    const inputArea = document.querySelector('.input-area-wrapper');
                    if (inputArea) inputArea.style.visibility = '';
                    document.body.classList.remove('modal-open');
                }
            }, 300);
        }

        function viewImage(src) {
            const modal = document.createElement('div');
            modal.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.92);display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s ease;touch-action:pinch-zoom;';
            modal.innerHTML = `
                <div style="position:relative;max-width:95vw;max-height:92vh;display:flex;align-items:center;justify-content:center;">
                    <img src="${src}" style="max-width:95vw;max-height:88vh;object-fit:contain;display:block;border-radius:8px;box-shadow:0 8px 40px rgba(0,0,0,0.6);" draggable="false">
                    <button onclick="this.closest('[style*=fixed]').remove()" style="position:fixed;top:16px;right:16px;width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,0.15);border:1.5px solid rgba(255,255,255,0.3);color:#fff;font-size:18px;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);z-index:10;line-height:1;">×</button>
                    <a href="${src}" download style="position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:10px 24px;background:rgba(255,255,255,0.15);border:1.5px solid rgba(255,255,255,0.3);border-radius:20px;color:#fff;font-size:13px;text-decoration:none;backdrop-filter:blur(8px);display:flex;align-items:center;gap:6px;"><i class="fas fa-download"></i> 保存图片</a>
                </div>`;
            modal.addEventListener('click', (e) => {
                if (e.target === modal || e.target.tagName === 'IMG') modal.remove();
            });
            document.body.appendChild(modal);
        }

        function exportChatHistory() {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;z-index:90010;background:rgba(0,0,0,0.55);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s ease;';
            overlay.innerHTML = `
                <div style="background:var(--secondary-bg);border-radius:20px;padding:24px;width:88%;max-width:360px;box-shadow:0 20px 60px rgba(0,0,0,0.4);animation:modalContentSlideIn 0.3s ease forwards;">
                    <div style="font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:6px;display:flex;align-items:center;gap:8px;">
                        <i class="fas fa-file-export" style="color:var(--accent-color);font-size:14px;"></i>选择导出内容
                    </div>
                    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:16px;">勾选需要导出的数据模块</div>
                    <div style="display:flex;flex-direction:column;gap:9px;margin-bottom:20px;">
                        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:10px 12px;border:1px solid var(--border-color);border-radius:12px;background:var(--primary-bg);font-size:13px;color:var(--text-primary);transition:border-color 0.2s;">
                            <input type="checkbox" id="_exp_msgs" checked style="accent-color:var(--accent-color);width:15px;height:15px;">
                            <i class="fas fa-comments" style="color:var(--accent-color);width:16px;text-align:center;"></i>
                            <span>聊天记录 <span style="font-size:11px;color:var(--text-secondary);">(${messages.length} 条)</span></span>
                        </label>
                        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:10px 12px;border:1px solid var(--border-color);border-radius:12px;background:var(--primary-bg);font-size:13px;color:var(--text-primary);transition:border-color 0.2s;">
                            <input type="checkbox" id="_exp_settings" checked style="accent-color:var(--accent-color);width:15px;height:15px;">
                            <i class="fas fa-sliders-h" style="color:var(--accent-color);width:16px;text-align:center;"></i>
                            <span>外观与聊天设置</span>
                        </label>
                        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:10px 12px;border:1px solid var(--border-color);border-radius:12px;background:var(--primary-bg);font-size:13px;color:var(--text-primary);transition:border-color 0.2s;">
                            <input type="checkbox" id="_exp_replies" style="accent-color:var(--accent-color);width:15px;height:15px;">
                            <i class="fas fa-reply" style="color:var(--accent-color);width:16px;text-align:center;"></i>
                            <span>字卡回复库</span>
                        </label>
                        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:10px 12px;border:1px solid var(--border-color);border-radius:12px;background:var(--primary-bg);font-size:13px;color:var(--text-primary);transition:border-color 0.2s;">
                            <input type="checkbox" id="_exp_ann" style="accent-color:var(--accent-color);width:15px;height:15px;">
                            <i class="fas fa-calendar-heart" style="color:var(--accent-color);width:16px;text-align:center;"></i>
                            <span>纪念日 / 倒计时</span>
                        </label>
                        <label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:10px 12px;border:1px solid var(--border-color);border-radius:12px;background:var(--primary-bg);font-size:13px;color:var(--text-primary);transition:border-color 0.2s;">
                            <input type="checkbox" id="_exp_themes" style="accent-color:var(--accent-color);width:15px;height:15px;">
                            <i class="fas fa-palette" style="color:var(--accent-color);width:16px;text-align:center;"></i>
                            <span>自定义主题配色</span>
                        </label>
                    </div>
                    <div style="display:flex;gap:10px;">
                        <button id="_exp_cancel" style="flex:1;padding:11px;border:1px solid var(--border-color);border-radius:12px;background:none;color:var(--text-secondary);font-size:13px;cursor:pointer;font-family:var(--font-family);">取消</button>
                        <button id="_exp_confirm" style="flex:2;padding:11px;border:none;border-radius:12px;background:var(--accent-color);color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:var(--font-family);display:flex;align-items:center;justify-content:center;gap:7px;">
                            <i class="fas fa-download"></i>确认导出
                        </button>
                    </div>
                </div>`;
            document.body.appendChild(overlay);

            function closeDialog() { overlay.remove(); }
            overlay.addEventListener('click', e => { if (e.target === overlay) closeDialog(); });
            const _expCancelBtn = document.getElementById('_exp_cancel');
            const _expConfirmBtn = document.getElementById('_exp_confirm');
            if (_expCancelBtn) _expCancelBtn.onclick = closeDialog;

            if (_expConfirmBtn) _expConfirmBtn.onclick = function() {
                const inclMsgs     = !!document.getElementById('_exp_msgs')?.checked;
                const inclSettings = !!document.getElementById('_exp_settings')?.checked;
                const inclReplies  = !!document.getElementById('_exp_replies')?.checked;
                const inclAnn      = !!document.getElementById('_exp_ann')?.checked;
                const inclThemes   = !!document.getElementById('_exp_themes')?.checked;

                if (!inclMsgs && !inclSettings && !inclReplies && !inclAnn && !inclThemes) {
                    showNotification('请至少选择一项导出内容', 'error');
                    return;
                }
                closeDialog();

                try {
                    let dgCustomData = null, dgStatusPool = null, customWeatherMap = {};
                    if (inclSettings) {
                        try { dgCustomData = JSON.parse(localStorage.getItem('dg_custom_data') || 'null'); } catch(e2) {}
                        try { dgStatusPool = JSON.parse(localStorage.getItem('dg_status_pool') || 'null'); } catch(e2) {}
                        try {
                            Object.keys(localStorage).forEach(kk => {
                                if (kk && kk.startsWith('customWeather_')) {
                                    customWeatherMap[kk] = localStorage.getItem(kk);
                                }
                            });
                        } catch(e2) {}
                    }

                    const exportObj = {
                        version: '3.1',
                        appName: 'ChatApp',
                        exportDate: new Date().toISOString(),
                        exportModules: []
                    };
                    if (inclMsgs)     {
                        // 永远省略图片字段，只导出文字等基础信息，减小体积
                        exportObj.messages = messages.map(m => {
                            const { image, ...rest } = m;
                            return rest;
                        });
                        exportObj.exportModules.push('messages');
                    }
                    if (inclSettings) {
                        exportObj.settings = settings;
                        exportObj.exportModules.push('settings');
                        exportObj.dgCustomData = dgCustomData;
                        exportObj.dgStatusPool = dgStatusPool;
                        exportObj.customWeatherMap = customWeatherMap;
                    }
                    if (inclReplies)  {
                        exportObj.customReplies = customReplies;
                        if (customEmojis && customEmojis.length > 0) exportObj.customEmojis = customEmojis;
                        exportObj.exportModules.push('customReplies');
                    }
                    if (inclAnn)      { exportObj.anniversaries = anniversaries; exportObj.exportModules.push('anniversaries'); }
                    if (inclThemes)   {
                        exportObj.customThemes = customThemes;
                        // stickerLibrary 体积较大，这里不再随聊天备份导出
                        exportObj.exportModules.push('themes');
                    }

                    const dataStr = JSON.stringify(exportObj, null, 2);
                    const parts = exportObj.exportModules.join('+');
                    const fileName = `chat-export-${parts}-${new Date().toISOString().slice(0,10)}.json`;

                    if (navigator.share && /Mobile|Android|iPhone|iPad/.test(navigator.userAgent)) {
                        const blob = new Blob([dataStr], { type: 'application/json;charset=utf-8' });
                        const file = new File([blob], fileName, { type: 'application/json' });
                        if (navigator.canShare && navigator.canShare({ files: [file] })) {
                            navigator.share({ files: [file], title: '传讯数据导出', text: `导出日期：${new Date().toLocaleDateString()}` })
                                .catch(() => fallbackExport(dataStr, fileName));
                            return;
                        }
                    }
                    fallbackExport(dataStr, fileName);
                } catch (error) {
                    console.error('导出失败:', error);
                    showNotification('导出失败，请重试', 'error');
                }
            };
        }

        function fallbackExport(dataStr, fileName) {
            fileName = fileName || `chat-backup-${SESSION_ID}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
            const dataBlob = new Blob([dataStr], { type: 'application/json;charset=utf-8' });
            const url = URL.createObjectURL(dataBlob);
            const link = document.createElement('a');
            link.href = url;
            link.download = fileName;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(url), 2000);
            showNotification('导出成功', 'success');
        }

        function importChatHistory(file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    let rawText = e.target.result;
                    if (rawText.charCodeAt(0) === 0xFEFF) rawText = rawText.slice(1);
                    let importedData = JSON.parse(rawText);

                    // 兼容全量备份格式（type:'full' 或含 indexedDB/localforage 字段）
                    // 将其转换为 importChatHistory 能识别的标准字段
                    if (importedData && typeof importedData === 'object' &&
                        (importedData.type === 'full' || importedData.indexedDB || importedData.localforage) &&
                        !importedData.messages && !importedData.settings) {

                        const idb = importedData.indexedDB || importedData.localforage || {};
                        const ls  = importedData.localStorage || {};
                        const allKv = Object.assign({}, idb, ls);

                        // 找到 sessionId（取第一个带 _chatMessages 的键前缀）
                        let detectedSid = null;
                        const appPfx = importedData.appPrefix || 'CHAT_APP_V3_';
                        for (const k of Object.keys(allKv)) {
                            if (k.indexOf('_chatMessages') !== -1 && k.startsWith(appPfx)) {
                                const after = k.slice(appPfx.length);
                                const u = after.indexOf('_');
                                if (u > 0) { detectedSid = after.slice(0, u); break; }
                            }
                        }

                        const pfxSid = detectedSid ? (appPfx + detectedSid + '_') : null;
                        const getVal = (suffix) => {
                            if (pfxSid) {
                                const v = allKv[pfxSid + suffix];
                                if (v !== undefined && v !== null) return v;
                            }
                            // 无前缀回退
                            return allKv[suffix] !== undefined ? allKv[suffix] : null;
                        };
                        const parseVal = (v) => {
                            if (v === null || v === undefined) return null;
                            if (typeof v !== 'string') return v;
                            try { return JSON.parse(v); } catch(e2) { return v; }
                        };

                        const converted = {
                            version: importedData.version || '3.1',
                            appName:  importedData.appName || 'ChatApp',
                            exportDate: importedData.exportDate || importedData.timestamp || new Date().toISOString(),
                            exportModules: []
                        };

                        const msgs = parseVal(getVal('chatMessages'));
                        if (Array.isArray(msgs)) { converted.messages = msgs; converted.exportModules.push('messages'); }

                        const chatSettings = parseVal(getVal('chatSettings'));
                        if (chatSettings && typeof chatSettings === 'object') {
                            converted.settings = chatSettings;
                            converted.exportModules.push('settings');
                        }
                        // 额外的 localStorage 设置字段
                        const dgCustomData = parseVal(ls['dg_custom_data'] !== undefined ? ls['dg_custom_data'] : null);
                        if (dgCustomData) converted.dgCustomData = dgCustomData;
                        const dgStatusPool = parseVal(ls['dg_status_pool'] !== undefined ? ls['dg_status_pool'] : null);
                        if (dgStatusPool) converted.dgStatusPool = dgStatusPool;
                        const customWeatherMap = {};
                        for (const wk of Object.keys(ls)) {
                            if (wk && wk.startsWith('customWeather_')) customWeatherMap[wk] = ls[wk];
                        }
                        if (Object.keys(customWeatherMap).length) converted.customWeatherMap = customWeatherMap;

                        const replies = parseVal(getVal('customReplies'));
                        if (Array.isArray(replies)) { converted.customReplies = replies; converted.exportModules.push('customReplies'); }

                        const emojis = parseVal(getVal('customEmojis'));
                        if (Array.isArray(emojis)) converted.customEmojis = emojis;

                        const ann = parseVal(getVal('anniversaries'));
                        if (Array.isArray(ann)) { converted.anniversaries = ann; converted.exportModules.push('anniversaries'); }

                        const themes = parseVal(allKv[appPfx + 'customThemes'] !== undefined ? allKv[appPfx + 'customThemes'] : (ls[appPfx + 'customThemes'] || null));
                        if (themes) { converted.customThemes = themes; converted.exportModules.push('themes'); }

                        importedData = converted;
                    }

                    const hasMessages  = importedData.messages && Array.isArray(importedData.messages);
                    const hasSettings  = !!importedData.settings;
                    const hasReplies   = importedData.customReplies && Array.isArray(importedData.customReplies);
                    const hasAnn       = importedData.anniversaries && Array.isArray(importedData.anniversaries);
                    const hasThemes    = !!importedData.customThemes || !!importedData.stickerLibrary;

                    if (!hasMessages && !hasSettings && !hasReplies && !hasAnn && !hasThemes) {
                        throw new Error('无效的聊天记录文件（未检测到可识别的数据模块）');
                    }

                    const overlay = document.createElement('div');
                    overlay.style.cssText = 'position:fixed;inset:0;z-index:90010;background:rgba(0,0,0,0.55);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;animation:fadeIn 0.2s ease;';

                    const makeRow = (id, icon, label, sublabel, available, checked) => {
                        if (!available) return '';
                        return `<label style="display:flex;align-items:center;gap:10px;cursor:pointer;padding:10px 12px;border:1px solid var(--border-color);border-radius:12px;background:var(--primary-bg);font-size:13px;color:var(--text-primary);">
                            <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} style="accent-color:var(--accent-color);width:15px;height:15px;">
                            <i class="${icon}" style="color:var(--accent-color);width:16px;text-align:center;"></i>
                            <span>${label}${sublabel ? `<span style="font-size:11px;color:var(--text-secondary);margin-left:4px;">${sublabel}</span>` : ''}</span>
                        </label>`;
                    };

                    overlay.innerHTML = `
                        <div style="background:var(--secondary-bg);border-radius:20px;padding:24px;width:88%;max-width:360px;box-shadow:0 20px 60px rgba(0,0,0,0.4);animation:modalContentSlideIn 0.3s ease forwards;">
                            <div style="font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:6px;display:flex;align-items:center;gap:8px;">
                                <i class="fas fa-file-import" style="color:var(--accent-color);font-size:14px;"></i>选择导入内容
                            </div>
                            <div style="font-size:12px;color:var(--text-secondary);margin-bottom:16px;">文件中检测到以下数据，选择要导入的模块</div>
                            <div style="display:flex;flex-direction:column;gap:9px;margin-bottom:20px;">
                                ${makeRow('_imp_msgs', 'fas fa-comments', '聊天记录', hasMessages ? `(${importedData.messages.length} 条)` : '', hasMessages, true)}
                                ${makeRow('_imp_settings', 'fas fa-sliders-h', '外观与聊天设置', '', hasSettings, true)}
                                ${makeRow('_imp_replies', 'fas fa-reply', '字卡回复库', '', hasReplies, false)}
                                ${makeRow('_imp_ann', 'fas fa-calendar-heart', '纪念日 / 倒计时', '', hasAnn, false)}
                                ${makeRow('_imp_themes', 'fas fa-palette', '自定义主题配色', '', hasThemes, false)}
                            </div>
                            <div style="display:flex;gap:10px;">
                                <button id="_imp_cancel" style="flex:1;padding:11px;border:1px solid var(--border-color);border-radius:12px;background:none;color:var(--text-secondary);font-size:13px;cursor:pointer;font-family:var(--font-family);">取消</button>
                                <button id="_imp_confirm" style="flex:2;padding:11px;border:none;border-radius:12px;background:var(--accent-color);color:#fff;font-size:13px;font-weight:600;cursor:pointer;font-family:var(--font-family);display:flex;align-items:center;justify-content:center;gap:7px;">
                                    <i class="fas fa-upload"></i>确认导入
                                </button>
                            </div>
                        </div>`;
                    document.body.appendChild(overlay);

                    function closeDialog() { overlay.remove(); }
                    overlay.addEventListener('click', ev => { if (ev.target === overlay) closeDialog(); });
                    const _impCancelBtn = document.getElementById('_imp_cancel');
                    const _impConfirmBtn = document.getElementById('_imp_confirm');
                    if (_impCancelBtn) _impCancelBtn.onclick = closeDialog;

                    if (_impConfirmBtn) _impConfirmBtn.onclick = function() {
                        const doMsgs     = hasMessages  && !!document.getElementById('_imp_msgs')?.checked;
                        const doSettings = hasSettings  && !!document.getElementById('_imp_settings')?.checked;
                        const doReplies  = hasReplies   && !!document.getElementById('_imp_replies')?.checked;
                        const doAnn      = hasAnn       && !!document.getElementById('_imp_ann')?.checked;
                        const doThemes   = hasThemes    && !!document.getElementById('_imp_themes')?.checked;

                        if (!doMsgs && !doSettings && !doReplies && !doAnn && !doThemes) {
                            showNotification('请至少选择一项导入内容', 'error');
                            return;
                        }

                        if (doMsgs && messages.length > 0 && !confirm('导入将覆盖当前会话的聊天记录，确定继续吗？')) return;
                        closeDialog();

                        if (doMsgs) {
                            messages = importedData.messages.map(m => ({ ...m, timestamp: new Date(m.timestamp) }));
                        }
                        if (doSettings) {
                            if (importedData.settings) {
                                Object.assign(settings, importedData.settings);
                                try {
                                    if (settings.customFontUrl) applyCustomFont(settings.customFontUrl);
                                    if (settings.customBubbleCss) applyCustomBubbleCss(settings.customBubbleCss);
                                    if (settings.customGlobalCss) applyGlobalThemeCss(settings.customGlobalCss);
                                } catch(e2) { console.warn('导入后样式应用失败', e2); }
                            }
                            if (importedData.dgCustomData) { try { localStorage.setItem('dg_custom_data', JSON.stringify(importedData.dgCustomData)); } catch(e2) {} }
                            if (importedData.dgStatusPool) { try { localStorage.setItem('dg_status_pool', JSON.stringify(importedData.dgStatusPool)); } catch(e2) {} }
                            if (importedData.customWeatherMap) { try { Object.keys(importedData.customWeatherMap).forEach(wk => localStorage.setItem(wk, importedData.customWeatherMap[wk])); } catch(e2) {} }
                        }
                        if (doReplies  && importedData.customReplies)  customReplies  = importedData.customReplies;
                        if (doReplies  && importedData.customEmojis && Array.isArray(importedData.customEmojis)) customEmojis = importedData.customEmojis;
                        if (doAnn      && importedData.anniversaries)   anniversaries  = importedData.anniversaries;
                        if (doThemes   && importedData.customThemes)    customThemes   = importedData.customThemes;
                        if (doThemes   && importedData.stickerLibrary)  stickerLibrary = importedData.stickerLibrary;

                        saveData();
                        if (doMsgs && typeof renderMessages === 'function') renderMessages();
                        if (typeof applySettings === 'function') applySettings();
                        updateUI();
                        const count = doMsgs ? `${messages.length} 条消息` : '所选数据';
                        showNotification(`成功导入${count}`, 'success');
                    };
                } catch (error) {
                    console.error('导入失败:', error);
                    showNotification('文件格式错误或已损坏', 'error');
                }
            };
            reader.onerror = () => showNotification('文件读取失败', 'error');
            reader.readAsText(file);
        }

        // ── 对方状态更新核心逻辑（提取为独立函数，供定时触发和 /测试状态更新 指令共用）──
        window._triggerStatusChange = function() {
            let newStatus = null;

            const groups = window.customStatusGroups || [];
            const allStatuses = (typeof customStatuses !== 'undefined' ? customStatuses : []) || [];

            // 只保留「启用」且「有内容」的分组，内容必须也在 allStatuses 里存在
            const enabledGroups = groups.filter(function(g) {
                return !g.disabled && Array.isArray(g.items) && g.items.length > 0;
            });

            // 收集所有在分组内的状态文本
            const groupedItems = new Set();
            enabledGroups.forEach(function(g) { g.items.forEach(function(t) { groupedItems.add(t); }); });

            // 未分组的状态
            const ungroupedStatuses = allStatuses.filter(function(t) { return !groupedItems.has(t); });

            if (enabledGroups.length > 0) {
                // 有启用分组时：随机选一个分组 → 从该分组随机选一条状态
                const pickedGroup = enabledGroups[Math.floor(Math.random() * enabledGroups.length)];
                const groupPool = pickedGroup.items.filter(function(t) { return allStatuses.includes(t); });
                if (groupPool.length > 0) {
                    newStatus = groupPool[Math.floor(Math.random() * groupPool.length)];
                }
            }

            // 分组里没找到内容时，退回到：未分组状态 → 全部 customStatuses → 内置 PARTNER_STATUSES
            if (!newStatus && ungroupedStatuses.length > 0) {
                newStatus = ungroupedStatuses[Math.floor(Math.random() * ungroupedStatuses.length)];
            }
            if (!newStatus && allStatuses.length > 0) {
                newStatus = allStatuses[Math.floor(Math.random() * allStatuses.length)];
            }
            if (!newStatus && CONSTANTS.PARTNER_STATUSES && CONSTANTS.PARTNER_STATUSES.length > 0) {
                newStatus = getRandomItem(CONSTANTS.PARTNER_STATUSES);
            }
            if (!newStatus) {
                if (typeof showNotification === 'function') showNotification('状态库为空，请先添加内容', 'warning', 2500);
                return;
            }

            settings.partnerStatus = newStatus;
            settings.lastStatusChange = Date.now();
            settings.nextStatusChange = 1 + Math.random() * 7;
            DOMElements.partner.status.textContent = newStatus;
            throttledSaveData();
        };

        const checkStatusChange = () => {
            if ((Date.now() - settings.lastStatusChange) / 36e5 >= settings.nextStatusChange) {
                window._triggerStatusChange();
            }
        };



        function getStorageKey(baseKey) {
            if (!SESSION_ID) {
                console.error('[getStorageKey] SESSION_ID 尚未初始化，拒绝生成存储键:', baseKey);
                throw new Error('SESSION_ID 未初始化，存储操作已中止');
            }
            return `${APP_PREFIX}${SESSION_ID}_${baseKey}`;
        }

        async function migrateData() {
            const isMigrated = await localforage.getItem(APP_PREFIX + 'MIGRATION_V2_DONE');
            if (isMigrated) return;

            try {
                const keys = Object.keys(localStorage);
                for (const key of keys) {
                    if (key.startsWith(APP_PREFIX)) {
                        try {
                            const val = localStorage.getItem(key);
                            if (val) {
                                let dataToStore = val;
                                try {
                                    if (val.startsWith('{') || val.startsWith('[')) {
                                        dataToStore = JSON.parse(val);
                                    }
                                } catch (e) {
                                    console.warn(`迁移期间解析数据失败: ${key}，将作为原始字符串存储。`, e);
                                }
                                await localforage.setItem(key, dataToStore);
                            }
                        } catch (e) {
                            console.error(`迁移键值 ${key} 时发生错误，已跳过。`, e);
                        }
                    }
                }
                
                await localforage.setItem(APP_PREFIX + 'MIGRATION_V2_DONE', 'true');
            } catch (e) {
                console.error("数据迁移过程中发生严重错误:", e);
                showNotification('数据迁移失败，部分旧数据可能丢失', 'error');
            }
        }

window.initializeSession = async function() {
    await migrateData();

    async function readChatSessionCandidates() {
        const out = [];
        try {
            const keys = await localforage.keys();
            const prefix = String(APP_PREFIX);
            const suffix = '_chatMessages';
            for (const key of keys || []) {
                if (!key || !key.startsWith(prefix) || !key.endsWith(suffix)) continue;
                const id = key.slice(prefix.length, -suffix.length);
                if (!id) continue;
                let count = 0;
                try {
                    const arr = await localforage.getItem(key);
                    count = Array.isArray(arr) ? arr.length : 0;
                } catch (e) {}
                out.push({ id, count });
            }
        } catch (e) {}
        out.sort((a, b) => b.count - a.count);
        return out;
    }

    const sessionsData = await localforage.getItem(`${APP_PREFIX}sessionList`).catch(() => null);
    sessionList = Array.isArray(sessionsData) ? sessionsData.filter(s => s && s.id) : [];

    // 只补全会话列表，不删除、不迁移、不覆盖任何聊天数组。
    // 用来修复 sessionList 丢失但 chatMessages 还在的情况。
    const candidates = await readChatSessionCandidates();
    let listChanged = false;
    for (const c of candidates) {
        if (!sessionList.some(s => s && s.id === c.id)) {
            sessionList.push({ id: c.id, name: c.count > 0 ? `找回的会话（${c.count}条）` : '旧会话', createdAt: new Date().toISOString() });
            listChanged = true;
        }
    }
    if (listChanged) await localforage.setItem(`${APP_PREFIX}sessionList`, sessionList).catch(() => {});

    const hash = window.location.hash.substring(1);
    if (hash && sessionList.some(s => s.id === hash)) {
        SESSION_ID = hash;
    } else if (sessionList.length > 0) {
        const lastId = await localforage.getItem(`${APP_PREFIX}lastSessionId`).catch(() => null);
        SESSION_ID = lastId && sessionList.some(s => s.id === lastId) ? lastId : sessionList[0].id;

        // 如果当前入口是空会话，而本机还有明确的非空聊天记录，切回消息最多的真实会话。
        // 这个动作只改 lastSessionId，不动聊天内容本身。
        try {
            const currentMsgs = await localforage.getItem(`${APP_PREFIX}${SESSION_ID}_chatMessages`).catch(() => null);
            const currentCount = Array.isArray(currentMsgs) ? currentMsgs.length : 0;
            if (currentCount === 0 && candidates.length && candidates[0].count > 0 && candidates[0].id !== SESSION_ID) {
                console.warn(`[boot] 当前会话为空，切回本地消息最多的会话：${candidates[0].id}（${candidates[0].count}条）`);
                SESSION_ID = candidates[0].id;
            }
        } catch (e) {}
    } else {
        SESSION_ID = await createNewSession(false);
    }

    await localforage.setItem(`${APP_PREFIX}lastSessionId`, SESSION_ID).catch(() => {});
    window.SESSION_ID = SESSION_ID;
    window.sessionList = sessionList;
};

document.addEventListener('DOMContentLoaded', function() {
    const chatArea = document.querySelector('.main-chat-area');
    const historyLoader = document.getElementById('history-loader');
    
    if (chatArea && historyLoader && typeof IntersectionObserver !== 'undefined') {
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && messages.length > displayedMessageCount) {
                loadMoreHistory();
            }
        }, {
            root: chatArea,
            rootMargin: '200px 0px 0px 0px',
            threshold: 0.01
        });
        observer.observe(historyLoader);
    }
});



