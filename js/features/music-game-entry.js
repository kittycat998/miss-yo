(function(){
    'use strict';
    if (window.MusicGameApp && window.MusicGameApp.__inlineMusicGameEntry) return;
    let opening = false;

    function getPage() {
        return document.getElementById('music-game-page');
    }

    function getFrame() {
        return document.getElementById('music-game-frame');
    }

    function getInlineGameHtml() {
        const template = document.getElementById('music-game-inline-template');
        if (!template) return '';
        return template.textContent.replace(/<\\\/script/gi, '</script');
    }

    function hideOtherFullPages() {
        const home = document.getElementById('home-container');
        const chat = document.querySelector('.main-chat-area');
        if (home) {
            home.classList.remove('active');
            home.style.display = 'none';
        }
        if (chat) chat.style.display = 'none';
        document.body.classList.add('music-game-open');
    }

    function restoreHome() {
        document.body.classList.remove('music-game-open');
        if (typeof window.showHomePage === 'function') {
            window.showHomePage();
            return;
        }
        const home = document.getElementById('home-container');
        if (home) {
            home.classList.add('active');
            home.style.display = 'flex';
        }
    }

    function open() {
        const page = getPage();
        const frame = getFrame();
        if (!page || !frame) return;
        if (opening) return false;
        opening = true;
        setTimeout(() => { opening = false; }, 250);
        if (page.style.display === 'flex' && frame.dataset.loaded) {
            hideOtherFullPages();
            return false;
        }
        if (!frame.dataset.loaded) {
            const html = getInlineGameHtml();
            if (!html) {
                (window.showNotification || function(){})('音游代码未加载', 'error');
                return false;
            }
            frame.srcdoc = html;
            frame.dataset.loaded = '1';
        }
        hideOtherFullPages();
        page.style.display = 'flex';
        frame.focus();
        return false;
    }

    function openFromIcon(event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
            if (event.stopImmediatePropagation) event.stopImmediatePropagation();
        }
        open();
        return false;
    }

    function close() {
        const page = getPage();
        if (!page) return;
        page.style.display = 'none';
        restoreHome();
    }

    function reload() {
        const frame = getFrame();
        if (!frame) return;
        frame.removeAttribute('srcdoc');
        frame.removeAttribute('src');
        frame.dataset.loaded = '';
        setTimeout(() => {
            const html = getInlineGameHtml();
            if (html) {
                frame.srcdoc = html;
                frame.dataset.loaded = '1';
            }
        }, 60);
    }

    function backup() {
        const frame = getFrame();
        if (!frame || !frame.dataset.loaded) {
            open();
            setTimeout(backup, 300);
            return false;
        }
        try {
            const win = frame.contentWindow;
            if (win && typeof win.exportBackup === 'function') {
                win.exportBackup();
            } else {
                (window.showNotification || function(){})('音游备份功能未就绪，请稍后再试', 'warning');
            }
        } catch (e) {
            (window.showNotification || function(){})('音游备份失败，请重新打开音游后再试', 'error');
        }
        return false;
    }

    document.addEventListener('click', e => {
        const icon = e.target.closest('.app-icon[data-app="music-game"]');
        const item = e.target.closest('.app-item');
        if (!icon && !(item && item.querySelector('.app-icon[data-app="music-game"]'))) return;
        openFromIcon(e);
    }, true);

    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            const page = getPage();
            if (page && page.style.display !== 'none') close();
        }
    });

    window.MusicGameApp = { __inlineMusicGameEntry: true, open, openFromIcon, close, reload, backup };
})();
