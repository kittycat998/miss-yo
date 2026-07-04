document.addEventListener('DOMContentLoaded', async () => {
    const loaderBar = document.getElementById('loader-tech-bar');
    const welcomeSubtitle = document.querySelector('.welcome-subtitle-scramble');
    const welcomeScreen = document.getElementById('welcome-animation');
    const disclaimerModal = document.getElementById('disclaimer-modal');
    const acceptDisclaimerBtn = document.getElementById('accept-disclaimer');

    const updateLoader = (text, width) => {
        if (welcomeSubtitle) welcomeSubtitle.textContent = text;
        if (loaderBar) loaderBar.style.width = width;
    };

    const hideWelcomeScreen = () => {
        if (!welcomeScreen) return;
        welcomeScreen.classList.add('hidden');
        setTimeout(() => {
            welcomeScreen.style.display = 'none';
            // 加载动画结束后显示主页
            if (typeof window.showHomePage === 'function') {
                window.showHomePage();
            }
        }, 800);
    };

    const safeAwait = async (promise, fallback = null) => {
        try {
            return await promise;
        } catch (error) {
            console.error('操作失败:', error);
            return fallback;
        }
    };

    try {
        try { setupEventListeners?.(); } catch(e) { console.error('setupEventListeners:', e); }

        if (typeof localforage === 'undefined') {
            console.warn('LocalForage 未加载，将使用 localStorage 降级方案');
        }

        try {
            const emergencyBackupRaw = localStorage.getItem('BACKUP_V1_critical');
            if (emergencyBackupRaw) {
                const emergencyBackup = JSON.parse(emergencyBackupRaw);
                if (emergencyBackup && Array.isArray(emergencyBackup.messages) && emergencyBackup.messages.length > 0) {
                    console.warn('[boot] 检测到紧急备份，可用于异常恢复');
                }
            }
        } catch (e) {
            console.warn('[boot] 紧急备份检查失败:', e);
        }

        updateLoader('正在建立安全连接...', '18%');
        await safeAwait(initializeSession());
        updateLoader('正在确认会话...', '30%');

        updateLoader('正在读取记忆存档...', '45%');
        await safeAwait(loadData());

        updateLoader('正在渲染我们的世界...', '70%');
        
        await Promise.allSettled([
            safeAwait(initializeRandomUI?.()),
            safeAwait(initMusicPlayer?.())
        ]);

        setInterval(checkStatusChange, 60000);

        if (disclaimerModal) {
            const tourSeen = await safeAwait(localforage?.getItem(APP_PREFIX + 'tour_seen'), false);
            
            if (!tourSeen) {
                showModal(disclaimerModal);
                
                if (acceptDisclaimerBtn && !acceptDisclaimerBtn._bound) {
                    acceptDisclaimerBtn._bound = true;
                    acceptDisclaimerBtn.addEventListener('click', () => {
                        hideModal(disclaimerModal);
                        localforage?.setItem(APP_PREFIX + 'tour_seen', true).catch(() => {});
                        startTour?.();
                    }, { once: true });
                }
            }
        }

        updateLoader('连接成功，欢迎回来。', '100%');
        setTimeout(hideWelcomeScreen, 3500);

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                try {
                    if (typeof saveTimeout !== 'undefined') clearTimeout(saveTimeout);
                } catch (e) {}
                try { _backupCriticalData(); } catch (e) { console.warn('[visibilitychange] 紧急备份失败:', e); }
                try {
                    const p = saveData();
                    if (p && typeof p.catch === 'function') {
                        p.catch(e => console.error('[visibilitychange] 保存失败:', e));
                    }
                } catch (e) {
                    console.error('[visibilitychange] 保存失败:', e);
                }
            } else if (document.visibilityState === 'visible') {
                try {
                    const backup = typeof _tryRecoverFromBackup === 'function' ? _tryRecoverFromBackup() : null;
                    if (backup && Array.isArray(backup.messages) && backup.messages.length > 0 && Array.isArray(messages) && backup.messages.length > messages.length) {
                        console.warn('[visibilitychange] 检测到备份消息比当前更多，自动尝试恢复');
                        try {
                            messages = backup.messages.map(m => ({
                                ...m,
                                timestamp: new Date(m.timestamp)
                            }));
                            // 不再从紧急备份恢复 settings，避免旧名字/状态覆盖当前会话设置。
                            if (typeof updateUI === 'function') updateUI();
                            if (typeof throttledSaveData === 'function') throttledSaveData();
                            showNotification('已自动恢复本地临时备份内容', 'warning', 3500);
                        } catch (restoreErr) {
                            console.warn('[visibilitychange] 自动恢复失败，保留当前页面内容:', restoreErr);
                        }
                    }
                } catch (e) {
                    console.warn('[visibilitychange] 恢复备份失败:', e);
                }
            }
        });

        window.addEventListener('pagehide', () => {
            try { _backupCriticalData(); } catch (e) {}
        });

        window.addEventListener('beforeunload', () => {
            try { _backupCriticalData(); } catch (e) {}
        });

        setInterval(() => {
            saveData().catch(e => console.warn('[autoBackup] 定时保存失败:', e));
        }, 3 * 60 * 1000);

        (() => {
            const REMIND_KEY = 'exportReminderLastShown';
            const last = parseInt(localStorage.getItem(REMIND_KEY) || '0', 10);
            const daysSince = (Date.now() - last) / (1000 * 60 * 60 * 24);
            if (daysSince >= 7) {
                setTimeout(() => {
                    showNotification('建议定期导出备份，防止数据意外丢失', 'info', 7000);
                    localStorage.setItem(REMIND_KEY, String(Date.now()));
                }, 8000);
            }
        })();

        setTimeout(async () => {
            if ('Notification' in window && Notification.permission === 'default') {
                try {
                    const permission = await Notification.requestPermission();
                    if (permission === 'granted') {
                        showNotification('已开启系统通知，收到消息时会提醒你', 'success', 3000);
                    }
                } catch(e) {
                    console.warn('通知权限请求失败:', e);
                }
            }
        }, 3000);

    } catch (err) {
        console.error('严重初始化错误:', err);
        try {
            const backup = typeof _tryRecoverFromBackup === 'function' ? _tryRecoverFromBackup() : null;
            if (backup && Array.isArray(backup.messages) && backup.messages.length > 0) {
                messages = backup.messages.map(m => ({
                    ...m,
                    timestamp: new Date(m.timestamp)
                }));
                // 不再从紧急备份恢复 settings，避免旧名字/状态覆盖当前会话设置。
                if (typeof updateUI === 'function') updateUI();
                showNotification('初始化异常，已使用本地紧急备份恢复', 'warning', 5000);
            }
        } catch (recoverErr) {
            console.warn('[boot] 初始化失败后的恢复也失败:', recoverErr);
        }
        updateLoader('加载遇到问题，已强制进入...', '100%');
        setTimeout(hideWelcomeScreen, 3500);
    }
});
const stickerInput = document.getElementById('sticker-file-input');
            if (stickerInput) {
                stickerInput.addEventListener('change', async (e) => {
                    const files = Array.from(e.target.files);
                    if (!files.length) return;

                    const oversized = files.filter(f => f.size > 2 * 1024 * 1024);
                    if (oversized.length > 0) {
                        showNotification(oversized.length + ' 张图片超过 2MB 限制，已跳过', 'warning');
                    }

                    const validFiles = files.filter(f => f.size <= 2 * 1024 * 1024);
                    if (!validFiles.length) return;

                    showNotification('正在批量处理 ' + validFiles.length + ' 张图片...', 'info');

                    let successCount = 0;
                    let failCount = 0;

                    for (const file of validFiles) {
                        try {
                            const base64 = await optimizeImage(file, 300, 0.8);
                            stickerLibrary.push(base64);
                            successCount++;
                        } catch (err) {
                            console.error(err);
                            failCount++;
                        }
                    }

                    throttledSaveData();
                    renderReplyLibrary();

                    if (failCount > 0) {
                        showNotification('上传完成：' + successCount + ' 张成功，' + failCount + ' 张失败', 'warning');
                    } else {
                        showNotification('上传成功，共 ' + successCount + ' 张', 'success');
                    }

                    e.target.value = '';
                });
            }
const myStickerQuickUpload = document.getElementById('my-sticker-quick-upload');
if (myStickerQuickUpload) {
    myStickerQuickUpload.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        if (!files.length) return;
        const oversized = files.filter(f => f.size > 2 * 1024 * 1024);
        if (oversized.length > 0) showNotification(oversized.length + ' 张图片超过 2MB，已跳过', 'warning');
        const validFiles = files.filter(f => f.size <= 2 * 1024 * 1024);
        if (!validFiles.length) return;
        showNotification('正在处理 ' + validFiles.length + ' 张...', 'info');
        let ok = 0, fail = 0;
        for (const file of validFiles) {
            try {
                const base64 = await optimizeImage(file, 300, 0.8);
                const cleanName = (file.name || '').replace(/\.[^.]+$/, '').trim();
                myStickerLibrary.push({ name: cleanName, url: base64 });
                ok++;
            } catch(err) { fail++; }
        }
        throttledSaveData();
        if (typeof window.renderComboContent === 'function') window.renderComboContent('my-sticker');
        showNotification(fail > 0 ? `上传完成：${ok} 成功 ${fail} 失败` : `✓ 已添加 ${ok} 张到我的表情库`, fail > 0 ? 'warning' : 'success');
        e.target.value = '';
    });
}

window.parseMyStickerUrlLines = function(raw) {
    const lines = String(raw || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const parsed = [];
    const bad = [];
    lines.forEach((line, idx) => {
        let name = '';
        let url = '';
        const pair = line.match(/^(.+?)\s*[:：]\s*((?:https?:\/\/|data:image\/).+)$/i);
        if (pair) {
            name = pair[1].trim();
            url = pair[2].trim();
        } else if (/^(https?:\/\/|data:image\/)/i.test(line)) {
            url = line;
        }
        if (url) parsed.push({ name, url });
        else bad.push(idx + 1);
    });
    return { parsed, bad };
};

window._getActiveStickerUrlTarget = function() {
    const active = document.querySelector('#user-sticker-picker .combo-tab-btn.active');
    return active && active.dataset && active.dataset.tab === 'partner-sticker' ? 'partner' : 'my';
};

window._normalizeStickerEntryForUrl = function(entry) {
    if (typeof entry === 'string') return { name: '', url: entry };
    if (entry && typeof entry === 'object') return { name: String(entry.name || entry.label || entry.title || '').trim(), url: String(entry.url || entry.src || entry.image || entry.data || '').trim() };
    return { name: '', url: '' };
};

window.saveMyStickerUrlBatch = async function(raw, target) {
    target = target || (window._getActiveStickerUrlTarget ? window._getActiveStickerUrlTarget() : 'my');
    const result = window.parseMyStickerUrlLines(raw);
    if (!result.parsed.length) {
        showNotification('没有识别到有效图片链接。格式：大笑:https://图片地址', 'warning', 2600);
        return { ok: 0, bad: result.bad.length };
    }
    const isPartner = target === 'partner';
    if (isPartner) {
        if (!Array.isArray(stickerLibrary)) stickerLibrary = [];
    } else {
        if (!Array.isArray(myStickerLibrary)) myStickerLibrary = [];
    }
    const targetLibrary = isPartner ? stickerLibrary : myStickerLibrary;
    const storageName = isPartner ? 'stickerLibrary' : 'myStickerLibrary';
    const existing = new Set(targetLibrary.map(item => {
        const info = window._normalizeStickerEntryForUrl ? window._normalizeStickerEntryForUrl(item) : { url: (typeof item === 'string' ? item : '') };
        return info.url;
    }).filter(Boolean));
    let ok = 0, dup = 0;
    result.parsed.forEach(item => {
        if (existing.has(item.url)) { dup++; return; }
        targetLibrary.push({ name: item.name, url: item.url });
        existing.add(item.url);
        ok++;
    });
    try {
        if (typeof localforage !== 'undefined' && typeof getStorageKey === 'function') {
            await localforage.setItem(getStorageKey(storageName), targetLibrary);
        }
        if (typeof throttledSaveData === 'function') throttledSaveData();
    } catch(e) {
        console.warn('URL 表情保存失败:', e);
    }
    if (typeof window.renderComboContent === 'function') window.renderComboContent(isPartner ? 'partner-sticker' : 'my-sticker');
    const picker = document.getElementById('user-sticker-picker');
    if (picker) picker.classList.add('active');
    const badText = result.bad.length ? `，${result.bad.length} 行格式无效` : '';
    const dupText = dup ? `，${dup} 个重复已跳过` : '';
    const targetText = isPartner ? '对方表情库' : '我的表情库';
    showNotification(ok ? `✓ 已添加 ${ok} 个 URL 表情到${targetText}${dupText}${badText}` : `没有新增，可能都重复了${badText}`, ok ? 'success' : 'info', 2600);
    return { ok, dup, bad: result.bad.length };
};

window.addMyStickerByUrl = async function(target) {
    if (typeof window.openMyStickerUrlModal === 'function') {
        window.openMyStickerUrlModal();
        return;
    }
    const raw = prompt('一行一个：大笑:https://xxx.jpg\n也支持只填 https://xxx.jpg');
    if (!raw) return;
    await window.saveMyStickerUrlBatch(raw, target || (window._getActiveStickerUrlTarget ? window._getActiveStickerUrlTarget() : 'my'));
};

window.openMyStickerUrlModal = function() {
    let modal = document.getElementById('my-sticker-url-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'my-sticker-url-modal';
        modal.className = 'modal';
        modal.style.zIndex = '5000';
        modal.innerHTML = `
            <div class="modal-content my-sticker-url-modal-content">
                <div class="modal-title"><i class="fas fa-link"></i><span id="my-sticker-url-modal-title">批量添加 URL 表情</span></div>
                <div class="setting-description" style="margin-bottom:10px;line-height:1.6;">
                    一行一个，推荐格式：<b>大笑:https://xxx.jpg</b>。冒号前会显示在图片下面，也会作为搜索关键词。只填图片 URL 也能添加。
                </div>
                <textarea id="my-sticker-url-textarea" class="my-sticker-url-textarea" placeholder="大笑:https://example.com/laugh.jpg
委屈:https://example.com/sad.png
亲亲:https://example.com/kiss.webp"></textarea>
                <div class="modal-buttons">
                    <button class="modal-btn modal-btn-secondary" id="my-sticker-url-cancel">取消</button>
                    <button class="modal-btn modal-btn-primary" id="my-sticker-url-save"><i class="fas fa-plus"></i> 添加</button>
                </div>
            </div>`;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.classList.remove('active');
        });
        modal.querySelector('#my-sticker-url-cancel').addEventListener('click', () => modal.classList.remove('active'));
        modal.querySelector('#my-sticker-url-save').addEventListener('click', async () => {
            const ta = modal.querySelector('#my-sticker-url-textarea');
            const res = await window.saveMyStickerUrlBatch(ta.value, window._getActiveStickerUrlTarget ? window._getActiveStickerUrlTarget() : 'my');
            if (res && res.ok) {
                ta.value = '';
                modal.classList.remove('active');
            }
        });
    }
    modal.classList.add('active');
    setTimeout(() => {
        const title = modal.querySelector('#my-sticker-url-modal-title');
        const target = window._getActiveStickerUrlTarget ? window._getActiveStickerUrlTarget() : 'my';
        if (title) title.textContent = target === 'partner' ? '批量添加 URL 表情到对方表情库' : '批量添加 URL 表情到我的表情库';
        const ta = modal.querySelector('#my-sticker-url-textarea');
        if (ta) ta.focus();
    }, 80);
};

window.addEventListener('load', function() {
    setTimeout(function() {
        try {
            if (localStorage.getItem('dailyGreetingShown') === new Date().toDateString()) return;
            try { if (typeof checkPartnerDailyMood === 'function') checkPartnerDailyMood(); } catch(e2) { console.warn('checkPartnerDailyMood error:', e2); }
            if (typeof _buildDailyGreeting === 'function') _buildDailyGreeting();
            if (window.localforage && window.APP_PREFIX) {
                localforage.getItem(window.APP_PREFIX + 'tour_seen').then(function(seen) {
                    if (seen) {
                        var modal = document.getElementById('daily-greeting-modal');
                        if (modal) modal.classList.remove('hidden');
                        localStorage.setItem('dailyGreetingShown', new Date().toDateString());
                    }
                }).catch(function() {
                    var modal = document.getElementById('daily-greeting-modal');
                    if (modal) modal.classList.remove('hidden');
                    localStorage.setItem('dailyGreetingShown', new Date().toDateString());
                });
            } else {
                var modal = document.getElementById('daily-greeting-modal');
                if (modal) modal.classList.remove('hidden');
                localStorage.setItem('dailyGreetingShown', new Date().toDateString());
            }
        } catch(e) { console.warn('Daily greeting timing error:', e); }
    }, 4500);
}, { once: true });
