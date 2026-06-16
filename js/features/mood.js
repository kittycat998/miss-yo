

function toggleBatchFavoriteMode() {
            isBatchFavoriteMode = !isBatchFavoriteMode;
            selectedMessages = [];

            if (isBatchFavoriteMode) {
                window.isScreenshotSelectMode = false;
                document.body.classList.add('batch-favorite-mode');
                showBatchFavoriteActions();
                hideScreenshotSelectActions();
                showNotification('批量收藏模式已开启，点击消息进行选择', 'info');
            } else {
                document.body.classList.remove('batch-favorite-mode');
                hideBatchFavoriteActions();
                showNotification('批量收藏模式已关闭', 'info');
            }

            renderMessages(true);
        }

        function hideBatchFavoriteActions() {
            const actions = document.querySelector('.batch-favorite-actions');
            if (actions) {
                actions.style.animation = 'floatUpAction 0.3s reverse forwards';
                setTimeout(() => actions.remove(), 300);
            }
        }

        function updateBatchFavoriteActionCounts() {
            const count = selectedMessages.length;
            const confirmBtn = document.getElementById('confirm-batch-favorite');
            if (confirmBtn) confirmBtn.innerHTML = `<i class="fas fa-check"></i> 确认收藏 (${count})`;
            const saveSelectedBtn = document.getElementById('save-selected-messages');
            if (saveSelectedBtn) saveSelectedBtn.innerHTML = `<i class="fas fa-download"></i> 保存所选 (${count})`;
        }

        function showBatchFavoriteActions() {
            if (document.querySelector('.batch-favorite-actions')) return;

            const actions = document.createElement('div');
            actions.className = 'batch-favorite-actions';

            actions.innerHTML = `
        <button class="batch-action-btn-pill batch-btn-cancel" id="cancel-batch-favorite">
        <i class="fas fa-times"></i> 取消
        </button>
        <button class="batch-action-btn-pill batch-btn-save-selected" id="save-selected-messages">
        <i class="fas fa-download"></i> 保存所选 (0)
        </button>
        <button class="batch-action-btn-pill batch-btn-confirm" id="confirm-batch-favorite">
        <i class="fas fa-check"></i> 确认收藏 (0)
        </button>
        `;
            document.body.appendChild(actions);

            document.getElementById('confirm-batch-favorite').addEventListener('click', confirmBatchFavorite);
            document.getElementById('cancel-batch-favorite').addEventListener('click', toggleBatchFavoriteMode);
            var saveBtn = document.getElementById('save-selected-messages');
            if (saveBtn) saveBtn.addEventListener('click', saveSelectedMessagesToFile);
            updateBatchFavoriteActionCounts();
        }

        function toggleScreenshotSelectMode(initialMessageId) {
            var willOpen = !window.isScreenshotSelectMode;
            window.isScreenshotSelectMode = willOpen;
            selectedMessages = [];
            var anchorMessageId = (initialMessageId !== undefined && initialMessageId !== null && String(initialMessageId) !== '') ? String(initialMessageId) : '';

            if (window.isScreenshotSelectMode) {
                isBatchFavoriteMode = false;
                document.body.classList.add('batch-favorite-mode');
                document.body.classList.add('screenshot-select-mode');
                hideBatchFavoriteActions();
                showScreenshotSelectActions();
                if (anchorMessageId) {
                    selectedMessages.push(anchorMessageId);
                }
                showNotification('多选截图已开启，点圆圈选择消息', 'info');
            } else {
                document.body.classList.remove('batch-favorite-mode');
                document.body.classList.remove('screenshot-select-mode');
                hideScreenshotSelectActions();
                showNotification('多选截图已关闭', 'info');
            }

            renderMessages(true);
            requestAnimationFrame(function() {
                var anchorWrapper = null;
                selectedMessages.forEach(function(id) {
                    var wrapper = document.querySelector('.message-wrapper[data-id="' + id + '"], .selectable-special-message[data-id="' + id + '"]');
                    if (wrapper) {
                        wrapper.classList.add('selected');
                        if (anchorMessageId && String(id) === String(anchorMessageId)) anchorWrapper = wrapper;
                    }
                });
                // 从某条消息点“截图”进入多选时，不要重渲染后跳到聊天顶部；把视口停回这条消息附近。
                if (willOpen && anchorWrapper) {
                    var container = (typeof DOMElements !== 'undefined' && DOMElements.chatContainer) ? DOMElements.chatContainer : document.getElementById('chat-container');
                    if (container) {
                        requestAnimationFrame(function() {
                            try {
                                var targetTop = anchorWrapper.offsetTop - Math.max(80, Math.round(container.clientHeight * 0.38));
                                container.scrollTop = Math.max(0, targetTop);
                            } catch(e) {
                                try { anchorWrapper.scrollIntoView({ block: 'center', inline: 'nearest' }); } catch(_) {}
                            }
                        });
                    }
                }
                if (typeof window.updateScreenshotSelectCount === 'function') window.updateScreenshotSelectCount();
            });
        }

        function hideScreenshotSelectActions() {
            const actions = document.querySelector('.screenshot-select-actions');
            if (actions) {
                actions.style.animation = 'floatUpAction 0.3s reverse forwards';
                setTimeout(() => actions.remove(), 300);
            }
        }

        window.updateScreenshotSelectCount = function() {
            const btn = document.getElementById('generate-screenshot-selected');
            if (btn) btn.innerHTML = `<i class="fas fa-camera"></i> 生成截图 (${selectedMessages.length})`;
        };

        function showScreenshotSelectActions() {
            if (document.querySelector('.screenshot-select-actions')) return;
            const actions = document.createElement('div');
            actions.className = 'batch-favorite-actions screenshot-select-actions';
            actions.innerHTML = `
        <button class="batch-action-btn-pill batch-btn-cancel" id="cancel-screenshot-select">
        <i class="fas fa-times"></i> 取消
        </button>
        <button class="batch-action-btn-pill batch-btn-confirm" id="generate-screenshot-selected">
        <i class="fas fa-camera"></i> 生成截图 (0)
        </button>
        `;
            document.body.appendChild(actions);
            document.getElementById('cancel-screenshot-select').addEventListener('click', toggleScreenshotSelectMode);
            document.getElementById('generate-screenshot-selected').addEventListener('click', generateSelectedMessagesScreenshot);
            window.updateScreenshotSelectCount();
        }

        function formatSelectedMessageForExport(msg) {
            var ts = msg.timestamp ? new Date(msg.timestamp) : new Date();
            var sender = msg.sender === 'user' ? (settings.myName || '我') : (msg.sender || settings.partnerName || '对方');
            var text = msg.text || '';
            if (msg.type === 'red-packet' && msg.redPacket) {
                var cents = Number(msg.redPacket.amount || 0);
                var amountText = (cents / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                text = '[红包信息:]¥' + amountText + (msg.redPacket.message ? ' ' + msg.redPacket.message : '');
            }
            if (msg.image) text += (text ? '\n' : '') + '[图片/表情] ' + msg.image;
            return '[' + ts.toLocaleString('zh-CN', { hour12: false }) + '] ' + sender + '：' + text;
        }

        function getSelectedMessagesInOrder() {
            var selectedSet = new Set(selectedMessages.map(String));
            return messages.filter(function(m) { return selectedSet.has(String(m.id)); });
        }

        function saveSelectedMessagesToFile() {
            var selectedList = getSelectedMessagesInOrder();
            if (selectedList.length === 0) {
                showNotification('请先选择要保存的消息', 'warning');
                return;
            }
            var text = selectedList.map(formatSelectedMessageForExport).join('\n');
            var dateStr = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
            var fileName = 'selected-chat-messages-' + dateStr + '.txt';
            try {
                var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
                if (typeof downloadFileFallback === 'function') {
                    downloadFileFallback(blob, fileName);
                } else if (typeof exportDataToMobileOrPC === 'function') {
                    exportDataToMobileOrPC(text, fileName);
                } else {
                    var url = URL.createObjectURL(blob);
                    var a = document.createElement('a');
                    a.href = url; a.download = fileName;
                    document.body.appendChild(a); a.click(); a.remove();
                    URL.revokeObjectURL(url);
                }
                showNotification('已保存 ' + selectedList.length + ' 条聊天记录', 'success');
            } catch(e) {
                console.error('保存所选聊天记录失败:', e);
                showNotification('保存失败，请重试', 'error');
            }
        }

        function _shotGetCssVar(name, fallback) {
            try {
                var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
                return v || fallback;
            } catch(e) { return fallback; }
        }

        function _shotRoundRect(ctx, x, y, w, h, r) {
            r = Math.min(r, w / 2, h / 2);
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.arcTo(x + w, y, x + w, y + h, r);
            ctx.arcTo(x + w, y + h, x, y + h, r);
            ctx.arcTo(x, y + h, x, y, r);
            ctx.arcTo(x, y, x + w, y, r);
            ctx.closePath();
        }

        function _shotWrapText(ctx, text, maxWidth) {
            text = String(text || '');
            var lines = [];
            text.split(/\n/).forEach(function(para) {
                if (!para) { lines.push(''); return; }
                var current = '';
                for (var i = 0; i < para.length; i++) {
                    var test = current + para[i];
                    if (ctx.measureText(test).width > maxWidth && current) {
                        lines.push(current);
                        current = para[i];
                    } else {
                        current = test;
                    }
                }
                lines.push(current);
            });
            return lines;
        }

        function _shotTime(ts) {
            var d = ts ? new Date(ts) : new Date();
            return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
        }

        function _shotDateLabel(ts) {
            var d = ts ? new Date(ts) : new Date();
            return '日期 ' + d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
        }

        function _shotSameDay(a, b) {
            if (!a || !b) return false;
            var da = new Date(a), db = new Date(b);
            return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
        }


        function _shotRedPacketInfo(msg) {
            var rp = (msg && msg.redPacket) || {};
            var cents = Number(rp.amount || 0);
            var money = '¥' + (cents / 100).toFixed(2);
            var note = rp.message || msg.text || '恭喜发财，大吉大利';
            var status = rp.status || 'pending';
            var statusText = status === 'received' ? '已领取' : (status === 'expired' ? '已退回' : '待领取');
            return { money: money, note: String(note || ''), statusText: statusText };
        }

        function _shotDrawRedPacket(ctx, x, y, w, h, isUser, info) {
            var topH = Math.round(h * 0.68);
            _shotRoundRect(ctx, x, y, w, h, 12);
            ctx.save(); ctx.clip();
            var grad = ctx.createLinearGradient(x, y, x + w, y + topH);
            grad.addColorStop(0, '#f5a24a'); grad.addColorStop(1, '#e86f3d');
            ctx.fillStyle = grad; ctx.fillRect(x, y, w, topH);
            ctx.fillStyle = '#fff6df'; ctx.fillRect(x, y + topH, w, h - topH);
            ctx.restore();
            ctx.save();
            ctx.fillStyle = '#ffe1a8'; ctx.beginPath(); ctx.arc(x + 34, y + 33, 17, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#d84835'; ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('¥', x + 34, y + 34);
            ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillStyle = '#fff'; ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
            var noteLines = _shotWrapText(ctx, info.note || '恭喜发财，大吉大利', w - 72).slice(0, 2);
            noteLines.forEach(function(line, idx) { ctx.fillText(line, x + 62, y + 30 + idx * 19); });
            ctx.font = '12px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.86)'; ctx.fillText(info.statusText || '红包', x + 62, y + topH - 12);
            ctx.fillStyle = '#b56b2a'; ctx.font = '13px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif'; ctx.fillText('微信红包', x + 12, y + h - 12);
            ctx.textAlign = 'right'; ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif'; ctx.fillText(info.money, x + w - 12, y + h - 12);
            ctx.restore();
        }


        function _shotBubbleRadius(isUser) {
            var style = (window.settings && settings.bubbleStyle) || 'standard';
            if (style === 'square') return 8;
            if (style === 'rounded-large') return 28;
            return 16;
        }

        function _shotDrawBubblePath(ctx, x, y, w, h, isUser) {
            var style = (window.settings && settings.bubbleStyle) || 'standard';
            if (style === 'square' || style === 'rounded-large' || style === 'rounded') {
                _shotRoundRect(ctx, x, y, w, h, _shotBubbleRadius(isUser));
                return;
            }
            // 对齐聊天区默认气泡：整体圆角，发送/接收底角收小。
            var r = 16, small = 6;
            var rtl = r, rtr = r, rbr = isUser ? small : r, rbl = isUser ? r : small;
            ctx.beginPath();
            ctx.moveTo(x + rtl, y);
            ctx.lineTo(x + w - rtr, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + rtr);
            ctx.lineTo(x + w, y + h - rbr);
            ctx.quadraticCurveTo(x + w, y + h, x + w - rbr, y + h);
            ctx.lineTo(x + rbl, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - rbl);
            ctx.lineTo(x, y + rtl);
            ctx.quadraticCurveTo(x, y, x + rtl, y);
            ctx.closePath();
        }

        function _shotEllipsis(ctx, text, maxWidth) {
            text = String(text || '');
            if (ctx.measureText(text).width <= maxWidth) return text;
            var ell = '…';
            while (text && ctx.measureText(text + ell).width > maxWidth) text = text.slice(0, -1);
            return text ? text + ell : ell;
        }

        function _shotReplyInfo(msg, ctx, maxWidth) {
            if (!msg || !msg.replyTo) return null;
            var r = msg.replyTo || {};
            var sender = r.sender === 'user' ? (settings.myName || '我') : (settings.partnerName || r.sender || '对方');
            var text = r.text || (r.image ? '🖼 图片' : (r.type === 'red-packet' ? '🧧 红包' : (r.shareData ? '🎁 礼物/商品' : '[消息]')));
            ctx.font = '12px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
            var lines = _shotWrapText(ctx, text, Math.max(80, maxWidth - 22)).slice(0, 2);
            if (!lines.length) lines = ['[消息]'];
            return { sender: sender, text: text, lines: lines, h: 22 + lines.length * 16, w: maxWidth };
        }

        function _shotDrawReplyBlock(ctx, x, y, w, reply, isUser, colors) {
            if (!reply) return;
            ctx.save();
            _shotRoundRect(ctx, x, y, w, reply.h, 8);
            ctx.fillStyle = isUser ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.055)';
            ctx.fill();
            ctx.fillStyle = isUser ? 'rgba(255,255,255,.76)' : (_shotGetCssVar('--accent-color', '#8b7cf6') || '#8b7cf6');
            ctx.fillRect(x, y, 3, reply.h);
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
            ctx.font = '600 11px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
            ctx.fillStyle = isUser ? (colors.sentText || '#fff') : (_shotGetCssVar('--accent-color', '#8b7cf6') || '#8b7cf6');
            ctx.globalAlpha = isUser ? .92 : 1;
            ctx.fillText(_shotEllipsis(ctx, reply.sender || '对方', w - 18), x + 10, y + 15);
            ctx.globalAlpha = isUser ? .78 : .82;
            ctx.font = '12px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
            ctx.fillStyle = isUser ? (colors.sentText || '#fff') : (colors.subColor || '#777');
            var ty = y + 31;
            reply.lines.forEach(function(line) {
                ctx.fillText(_shotEllipsis(ctx, line || '', w - 18), x + 10, ty);
                ty += 16;
            });
            ctx.restore();
        }

        function _shotShopCardInfo(msg) {
            if (!msg) return null;
            var data = msg.shareData || null;
            var isShop = msg.type === 'share' || msg.type === 'pay-request' || data;
            if (!isShop) return null;
            data = data || {};
            var isPay = msg.type === 'pay-request';
            var name = data.name || msg.shopName || '商品';
            var price = data.total || data.price || msg.shopPrice || '';
            var tag = data.tag || (isPay ? '💝 已帮TA付' : '好物分享');
            var desc = data.desc || (isPay ? '帮我买这个好不好~' : name);
            return {
                name: String(name || '商品'),
                price: String(price || ''),
                icon: String(data.icon || msg.icon || '📦'),
                img: String(data.img || msg.img || ''),
                tag: String(tag || ''),
                tagColor: String(data.tagColor || (isPay ? '#ff8a3d' : '#ff4757')),
                desc: String(desc || '')
            };
        }

        function _shotDrawShopCard(ctx, x, y, w, h, info, img, isUser) {
            info = info || _shotShopCardInfo({}) || { name: '商品', price: '', icon: '📦', tag: '好物分享', desc: '商品' };
            ctx.save();
            _shotRoundRect(ctx, x, y, w, h, 12);
            ctx.fillStyle = '#fff';
            ctx.fill();
            ctx.strokeStyle = '#ffe0e0';
            ctx.lineWidth = 1;
            ctx.stroke();
            var thumb = 52;
            var tx = x + 10, ty = y + Math.max(8, Math.round((h - thumb) / 2));
            _shotRoundRect(ctx, tx, ty, thumb, thumb, 7);
            ctx.fillStyle = '#f0f0f0';
            ctx.fill();
            if (img) {
                ctx.save();
                _shotRoundRect(ctx, tx, ty, thumb, thumb, 7);
                ctx.clip();
                ctx.drawImage(img, tx, ty, thumb, thumb);
                ctx.restore();
            } else {
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = '26px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
                ctx.fillStyle = '#555';
                ctx.fillText(info.icon || '📦', tx + thumb / 2, ty + thumb / 2 + 1);
            }
            var cx = tx + thumb + 10;
            var maxText = w - (cx - x) - 10;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'alphabetic';
            ctx.fillStyle = '#666';
            ctx.font = '12px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
            ctx.fillText(_shotEllipsis(ctx, info.desc || info.name || '商品', maxText), cx, y + 23);
            ctx.fillStyle = '#333';
            ctx.font = '600 12px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
            if ((info.desc || '') !== (info.name || '')) ctx.fillText(_shotEllipsis(ctx, info.name || '商品', maxText), cx, y + 39);
            ctx.fillStyle = '#ff4757';
            ctx.font = '700 13px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
            ctx.fillText('¥' + (info.price || ''), cx, y + 56);
            var tagText = info.tag || '好物分享';
            ctx.font = '10px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
            var tagW = Math.min(maxText, ctx.measureText(tagText).width + 12);
            _shotRoundRect(ctx, cx, y + h - 20, tagW, 14, 7);
            ctx.fillStyle = info.tagColor || '#ff4757';
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.fillText(_shotEllipsis(ctx, tagText, tagW - 8), cx + 6, y + h - 9);
            ctx.restore();
        }

        function _shotLoadImage(src) {
            return new Promise(function(resolve) {
                if (!src) return resolve(null);
                var img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = function() { resolve(img); };
                img.onerror = function() { resolve(null); };
                img.src = src;
                setTimeout(function(){ if (!img.complete) resolve(null); }, 5000);
            });
        }

        async function _shotPrepareMessages(list) {
            var prepared = [];
            for (var i = 0; i < list.length; i++) {
                var msg = list[i];
                var img = null;
                if (msg.image) img = await _shotLoadImage(msg.image);
                var shopInfo = _shotShopCardInfo(msg);
                var shopImg = null;
                if (shopInfo && shopInfo.img) shopImg = await _shotLoadImage(shopInfo.img);
                prepared.push({ msg: msg, img: img, shopInfo: shopInfo, shopImg: shopImg });
            }
            return prepared;
        }

        function _shotMeasurePrepared(prepared, width, ctx) {
            var maxBubbleW = 235, lineH = 21, padX = 14, padY = 10;
            var items = [];
            var prevMsg = null;
            prepared.forEach(function(item) {
                var msg = item.msg;
                if (!prevMsg || !_shotSameDay(prevMsg.timestamp, msg.timestamp)) {
                    items.push({ type: 'date', text: _shotDateLabel(msg.timestamp), h: 38 });
                }
                if (msg.type === 'system' || msg.type === 'call-event') {
                    var specialText = msg.text || '';
                    if (msg.type === 'call-event' && msg.callDetail && specialText.indexOf(msg.callDetail) === -1) {
                        specialText += ' · ' + msg.callDetail;
                    }
                    ctx.font = '12px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
                    var specialLines = _shotWrapText(ctx, specialText, 260);
                    items.push({ type: 'system', text: specialText, lines: specialLines, h: Math.max(34, specialLines.length * 18 + 18), msg: msg });
                    prevMsg = msg;
                    return;
                }

                var reply = _shotReplyInfo(msg, ctx, maxBubbleW - padX * 2);
                var replyExtraH = reply ? (reply.h + 7) : 0;

                if (msg.type === 'red-packet' && msg.redPacket) {
                    var rpInfo = _shotRedPacketInfo(msg);
                    var rpW = 220, rpH = 112;
                    var rpBubbleH = replyExtraH + rpH;
                    items.push({ type: 'message', msg: msg, img: null, lines: [], bubbleW: rpW, bubbleH: rpBubbleH, imageW: 0, imageH: 0, redPacket: true, redPacketInfo: rpInfo, reply: reply, cardH: rpH, h: Math.max(44, rpBubbleH + 26) + 10 });
                    prevMsg = msg;
                    return;
                }

                if (item.shopInfo) {
                    var shopW = 240, shopH = 78;
                    var shopBubbleH = replyExtraH + shopH;
                    items.push({ type: 'message', msg: msg, img: null, shopCard: true, shopInfo: item.shopInfo, shopImg: item.shopImg, reply: reply, bubbleW: shopW, bubbleH: shopBubbleH, imageW: 0, imageH: 0, h: Math.max(44, shopBubbleH + 26) + 10 });
                    prevMsg = msg;
                    return;
                }

                ctx.font = '15px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
                var lines = _shotWrapText(ctx, msg.text || '', maxBubbleW - padX * 2);
                if (!msg.text) lines = [];
                var textH = lines.length ? lines.length * lineH : 0;
                var imageW = 0, imageH = 0;
                if (msg.image) {
                    if (item.img) {
                        var maxImgW = 118, maxImgH = 150;
                        var ratio = Math.min(maxImgW / item.img.naturalWidth, maxImgH / item.img.naturalHeight, 1);
                        imageW = Math.max(54, Math.round(item.img.naturalWidth * ratio));
                        imageH = Math.max(54, Math.round(item.img.naturalHeight * ratio));
                    } else {
                        imageW = 110; imageH = 82;
                    }
                }
                var textW = lines.reduce(function(m,l){ return Math.max(m, ctx.measureText(l).width); }, 0) + padX * 2;
                var imageBoxW = imageW ? imageW + (lines.length || reply ? padX * 2 : 0) : 0;
                var replyBoxW = reply ? Math.min(maxBubbleW, reply.w + padX * 2) : 0;
                var bubbleW = Math.max(50, Math.min(maxBubbleW, Math.max(textW, imageBoxW, replyBoxW)));
                var bubbleH;
                if (lines.length && imageH) bubbleH = padY * 2 + replyExtraH + textH + 7 + imageH;
                else if (lines.length) bubbleH = padY * 2 + replyExtraH + textH;
                else if (imageH) bubbleH = replyExtraH + imageH;
                else bubbleH = replyExtraH + 36;
                var h = Math.max(44, bubbleH + 26) + 10;
                items.push({ type: 'message', msg: msg, img: item.img, lines: lines, bubbleW: bubbleW, bubbleH: bubbleH, imageW: imageW, imageH: imageH, reply: reply, h: h });
                prevMsg = msg;
            });
            return items;
        }

        function _shotSplitItems(items, maxContentH) {
            var pages = [], page = [], h = 0;
            items.forEach(function(it) {
                if (page.length && h + it.h > maxContentH) {
                    pages.push(page);
                    page = [];
                    h = 0;
                }
                page.push(it);
                h += it.h;
            });
            if (page.length) pages.push(page);
            return pages;
        }

        async function _shotDrawAvatar(ctx, x, y, size, isUser) {
            var avatarEl = isUser ? (DOMElements.me && DOMElements.me.avatar) : (DOMElements.partner && DOMElements.partner.avatar);
            var imgEl = avatarEl ? avatarEl.querySelector('img') : null;
            var src = imgEl ? imgEl.getAttribute('src') : '';
            ctx.save();
            ctx.beginPath();
            ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
            ctx.clip();
            ctx.fillStyle = _shotGetCssVar('--border-color', '#ddd');
            ctx.fillRect(x, y, size, size);
            if (src) {
                var img = await _shotLoadImage(src);
                if (img) ctx.drawImage(img, x, y, size, size);
            } else {
                ctx.fillStyle = _shotGetCssVar('--accent-color', '#8b7cf6');
                ctx.fillRect(x, y, size, size);
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                var name = isUser ? (settings.myName || '我') : (settings.partnerName || '对');
                ctx.fillText(String(name).charAt(0), x + size / 2, y + size / 2 + 1);
            }
            ctx.restore();
        }

        async function _shotDrawPage(pageItems, pageIndex, totalPages) {
            var width = 390, scale = Math.max(2, Math.min(3, window.devicePixelRatio || 2));
            var headerH = 68, bottomH = totalPages > 1 ? 34 : 14;
            var contentH = pageItems.reduce(function(sum, it){ return sum + it.h; }, 0);
            var height = headerH + 18 + contentH + bottomH;
            var canvas = document.createElement('canvas');
            canvas.width = Math.round(width * scale);
            canvas.height = Math.round(height * scale);
            var ctx = canvas.getContext('2d');
            ctx.scale(scale, scale);

            var bg = _shotGetCssVar('--secondary-bg', '#f6f6f6');
            var headerBg = _shotGetCssVar('--header-bg', _shotGetCssVar('--primary-bg', '#fff'));
            var textColor = _shotGetCssVar('--text-primary', '#222');
            var subColor = _shotGetCssVar('--text-secondary', '#777');
            var border = _shotGetCssVar('--border-color', '#e6e6e6');
            var sentBg = _shotGetCssVar('--message-sent-bg', _shotGetCssVar('--accent-color', '#8b7cf6'));
            var sentText = _shotGetCssVar('--message-sent-text', '#fff');
            var receivedBg = _shotGetCssVar('--message-received-bg', '#fff');
            var receivedText = _shotGetCssVar('--message-received-text', textColor);

            ctx.fillStyle = bg;
            ctx.fillRect(0, 0, width, height);
            ctx.fillStyle = headerBg;
            ctx.fillRect(0, 0, width, headerH);
            ctx.strokeStyle = border;
            ctx.beginPath();
            ctx.moveTo(0, headerH); ctx.lineTo(width, headerH); ctx.stroke();

            await _shotDrawAvatar(ctx, 16, 16, 36, false);
            await _shotDrawAvatar(ctx, width - 52, 16, 36, true);
            ctx.textBaseline = 'alphabetic';
            ctx.textAlign = 'left';
            ctx.fillStyle = textColor;
            ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
            ctx.fillText(settings.partnerName || '对方', 62, 31);
            ctx.fillStyle = subColor;
            ctx.font = '11px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
            ctx.fillText('在线', 62, 48);
            ctx.textAlign = 'right';
            ctx.fillStyle = textColor;
            ctx.font = 'bold 13px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
            ctx.fillText(settings.myName || '我', width - 62, 31);
            ctx.fillStyle = subColor;
            ctx.font = '11px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
            ctx.fillText('在线', width - 62, 48);
            ctx.textAlign = 'center';
            ctx.fillStyle = subColor;
            ctx.font = '12px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
            ctx.fillText('聊天截图', width / 2, 39);

            var y = headerH + 18;
            for (var i = 0; i < pageItems.length; i++) {
                var it = pageItems[i];
                if (it.type === 'date') {
                    ctx.strokeStyle = border;
                    ctx.beginPath(); ctx.moveTo(18, y + 17); ctx.lineTo(122, y + 17); ctx.stroke();
                    ctx.beginPath(); ctx.moveTo(width - 122, y + 17); ctx.lineTo(width - 18, y + 17); ctx.stroke();
                    ctx.fillStyle = subColor;
                    ctx.font = '12px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(it.text, width / 2, y + 21);
                    y += it.h;
                    continue;
                }
                if (it.type === 'system') {
                    var sysLines = it.lines || [it.text || ''];
                    ctx.fillStyle = subColor;
                    ctx.font = '12px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
                    ctx.textAlign = 'center';
                    var sysStartY = y + 18;
                    sysLines.forEach(function(line, lineIdx) {
                        ctx.fillText(line || '', width / 2, sysStartY + lineIdx * 18);
                    });
                    y += it.h;
                    continue;
                }
                var msg = it.msg;
                var isUser = msg.sender === 'user';
                var avSize = 34, margin = 15;
                var avX = isUser ? width - margin - avSize : margin;
                var avY = y + 2;
                await _shotDrawAvatar(ctx, avX, avY, avSize, isUser);

                var bubbleX = isUser ? (avX - 9 - it.bubbleW) : (avX + avSize + 9);
                var bubbleY = y;
                var colors = { sentText: sentText, subColor: subColor };
                var innerY = bubbleY;
                if (it.redPacket || it.shopCard) {
                    if (it.reply) {
                        _shotDrawReplyBlock(ctx, bubbleX, innerY, it.bubbleW, it.reply, isUser, colors);
                        innerY += it.reply.h + 7;
                    }
                }
                if (it.redPacket) {
                    _shotDrawRedPacket(ctx, bubbleX, innerY, it.bubbleW, it.cardH || 112, isUser, it.redPacketInfo || _shotRedPacketInfo(msg));
                } else if (it.shopCard) {
                    _shotDrawShopCard(ctx, bubbleX, innerY, it.bubbleW, 78, it.shopInfo, it.shopImg, isUser);
                } else if (msg.image && !it.lines.length && !it.reply) {
                    if (it.img) {
                        _shotRoundRect(ctx, bubbleX, bubbleY, it.imageW, it.imageH, 12);
                        ctx.save(); ctx.clip();
                        ctx.drawImage(it.img, bubbleX, bubbleY, it.imageW, it.imageH);
                        ctx.restore();
                    } else {
                        _shotRoundRect(ctx, bubbleX, bubbleY, it.imageW, it.imageH, 12);
                        ctx.fillStyle = receivedBg;
                        ctx.fill();
                        ctx.fillStyle = subColor;
                        ctx.font = '12px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
                        ctx.textAlign = 'center';
                        ctx.fillText('图片加载失败', bubbleX + it.imageW/2, bubbleY + it.imageH/2 + 4);
                    }
                } else {
                    _shotDrawBubblePath(ctx, bubbleX, bubbleY, it.bubbleW, it.bubbleH, isUser);
                    ctx.fillStyle = isUser ? sentBg : receivedBg;
                    ctx.fill();
                    var tx = bubbleX + 14, ty = bubbleY + 24;
                    if (it.reply) {
                        _shotDrawReplyBlock(ctx, bubbleX + 10, bubbleY + 10, it.bubbleW - 20, it.reply, isUser, colors);
                        ty = bubbleY + 10 + it.reply.h + 7 + 18;
                    }
                    ctx.textAlign = 'left';
                    ctx.fillStyle = isUser ? sentText : receivedText;
                    ctx.font = '15px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
                    it.lines.forEach(function(line) {
                        ctx.fillText(line, tx, ty);
                        ty += 21;
                    });
                    if (msg.image) {
                        var imgX = tx, imgY = bubbleY + 10 + (it.reply ? it.reply.h + 7 : 0) + (it.lines.length ? it.lines.length * 21 + 7 : 0);
                        if (it.img) {
                            _shotRoundRect(ctx, imgX, imgY, it.imageW, it.imageH, 10);
                            ctx.save(); ctx.clip();
                            ctx.drawImage(it.img, imgX, imgY, it.imageW, it.imageH);
                            ctx.restore();
                        } else {
                            _shotRoundRect(ctx, imgX, imgY, it.imageW, it.imageH, 10);
                            ctx.fillStyle = 'rgba(255,255,255,0.32)';
                            ctx.fill();
                            ctx.fillStyle = isUser ? sentText : subColor;
                            ctx.font = '12px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
                            ctx.textAlign = 'center';
                            ctx.fillText('图片加载失败', imgX + it.imageW/2, imgY + it.imageH/2 + 4);
                        }
                    }
                }

                ctx.fillStyle = subColor;
                ctx.font = '11px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
                ctx.textAlign = isUser ? 'right' : 'left';
                ctx.fillText(_shotTime(msg.timestamp), isUser ? bubbleX + it.bubbleW - 4 : bubbleX + 4, bubbleY + it.bubbleH + 18);
                y += it.h;
            }

            if (totalPages > 1) {
                ctx.fillStyle = subColor;
                ctx.font = '11px -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('第 ' + (pageIndex + 1) + ' / ' + totalPages + ' 张', width / 2, height - 14);
            }

            return canvas;
        }

        function canvasToBlob(canvas) {
            return new Promise(function(resolve, reject) {
                canvas.toBlob(function(blob) {
                    if (blob) resolve(blob);
                    else reject(new Error('canvas.toBlob 失败'));
                }, 'image/png');
            });
        }

        function showScreenshotPreview(canvases, blobs, names) {
            var old = document.getElementById('screenshot-preview-modal');
            if (old) old.remove();

            var canvas = (canvases || [])[0];
            var blob = (blobs || [])[0];
            var fileName = (names || [])[0] || 'selected-chat-screenshot.png';

            var overlay = document.createElement('div');
            overlay.id = 'screenshot-preview-modal';
            overlay.setAttribute('style',
                'position:fixed!important;left:0!important;right:0!important;top:0!important;bottom:0!important;' +
                'z-index:2147483647!important;background:rgba(0,0,0,.68)!important;' +
                'display:flex!important;align-items:center!important;justify-content:center!important;' +
                'padding:14px!important;box-sizing:border-box!important;'
            );

            var panel = document.createElement('div');
            panel.setAttribute('style',
                'width:min(94vw,460px)!important;max-height:90vh!important;background:#fff!important;color:#222!important;' +
                'border-radius:20px!important;box-shadow:0 20px 70px rgba(0,0,0,.38)!important;' +
                'display:flex!important;flex-direction:column!important;overflow:hidden!important;'
            );

            var header = document.createElement('div');
            header.setAttribute('style',
                'height:52px!important;display:flex!important;align-items:center!important;justify-content:space-between!important;' +
                'padding:0 14px!important;border-bottom:1px solid #eee!important;box-sizing:border-box!important;flex-shrink:0!important;'
            );
            header.innerHTML = '<div style="font-weight:700;font-size:15px;color:#222;">📷 聊天截图预览</div>' +
                '<button id="close-screenshot-preview" style="border:none;background:#f4f4f4;color:#555;font-size:22px;width:34px;height:34px;border-radius:50%;line-height:1;">×</button>';

            var body = document.createElement('div');
            body.id = 'screenshot-preview-body';
            body.setAttribute('style',
                'flex:1!important;overflow:auto!important;-webkit-overflow-scrolling:touch!important;' +
                'padding:14px!important;background:#f3f3f5!important;display:block!important;' +
                'min-height:220px!important;box-sizing:border-box!important;'
            );

            var footer = document.createElement('div');
            footer.setAttribute('style',
                'display:flex!important;gap:10px!important;padding:12px 14px!important;border-top:1px solid #eee!important;' +
                'box-sizing:border-box!important;flex-shrink:0!important;background:#fff!important;'
            );
            footer.innerHTML =
                '<button id="close-screenshot-preview-bottom" style="flex:1;padding:12px;border-radius:12px;border:1px solid #ddd;background:#f6f6f6;color:#222;font-weight:700;">关闭</button>' +
                '<button id="save-one-screenshot-preview" style="flex:1.4;padding:12px;border-radius:12px;border:none;background:#8b7cf6;color:#fff;font-weight:800;">保存图片</button>';

            panel.appendChild(header);
            panel.appendChild(body);
            panel.appendChild(footer);
            overlay.appendChild(panel);
            document.body.appendChild(overlay);

            if (canvas) {
                try {
                    canvas.style.setProperty('display', 'block', 'important');
                    canvas.style.setProperty('width', '100%', 'important');
                    canvas.style.setProperty('height', 'auto', 'important');
                    canvas.style.setProperty('max-width', '100%', 'important');
                    canvas.style.setProperty('background', '#fff', 'important');
                    canvas.style.setProperty('border-radius', '18px', 'important');
                    canvas.style.setProperty('visibility', 'visible', 'important');
                    canvas.style.setProperty('opacity', '1', 'important');
                    canvas.style.setProperty('box-shadow', '0 8px 28px rgba(0,0,0,.18)', 'important');
                    body.appendChild(canvas);
                } catch(e) {
                    console.error('canvas 预览插入失败:', e);
                }
            } else {
                var empty = document.createElement('div');
                empty.setAttribute('style', 'padding:40px 12px;text-align:center;color:#777;font-size:14px;background:#fff;border-radius:14px;');
                empty.innerHTML = '预览没拿到画布，请重新生成。';
                body.appendChild(empty);
            }

            function close() { overlay.remove(); }
            function downloadBlob(blob, fileName) {
                if (!blob) return;
                if (typeof downloadFileFallback === 'function') {
                    downloadFileFallback(blob, fileName);
                } else {
                    var url = URL.createObjectURL(blob);
                    var a = document.createElement('a');
                    a.href = url; a.download = fileName || 'chat-screenshot.png';
                    document.body.appendChild(a); a.click(); a.remove();
                    setTimeout(function(){ URL.revokeObjectURL(url); }, 2000);
                }
            }

            overlay.querySelector('#close-screenshot-preview').addEventListener('click', close);
            overlay.querySelector('#close-screenshot-preview-bottom').addEventListener('click', close);
            overlay.querySelector('#save-one-screenshot-preview').addEventListener('click', function() {
                downloadBlob(blob, fileName);
                showNotification('已开始保存图片', 'success', 1600);
            });

            setTimeout(function() {
                try { body.scrollTop = 0; } catch(e) {}
            }, 80);
        }

        async function generateSelectedMessagesScreenshot() {
            var selectedList = getSelectedMessagesInOrder();
            if (!selectedList.length) {
                showNotification('请先选择要生成截图的消息', 'warning');
                return;
            }

            var originalCount = selectedList.length;
            if (selectedList.length > 50) {
                selectedList = selectedList.slice(0, 50);
                showNotification('已限制为前 50 条生成一张长图', 'warning', 2200);
            }

            var triggerBtn = document.getElementById('generate-screenshot-selected');
            var originalHtml = triggerBtn ? triggerBtn.innerHTML : '';
            if (triggerBtn) {
                triggerBtn.disabled = true;
                triggerBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 生成中...';
            }

            try {
                showNotification('正在生成聊天截图...', 'info', 1200);
                var scaleCanvas = document.createElement('canvas');
                var measureCtx = scaleCanvas.getContext('2d');
                measureCtx.font = '15px -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
                var prepared = await _shotPrepareMessages(selectedList);
                var items = _shotMeasurePrepared(prepared, 390, measureCtx);
                var timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

                // v3.1：不再分页。最多 50 条消息生成一张长图，避免 iOS 连续保存/分页预览吞图。
                var canvas = await _shotDrawPage(items, 0, 1);
                var blob = await canvasToBlob(canvas);
                var name = 'selected-chat-screenshot-' + timestamp + '.png';

                showScreenshotPreview([canvas], [blob], [name]);
                showNotification(originalCount > 50 ? '已生成前 50 条截图' : '截图已生成，先预览再保存', 'success', 2200);
            } catch(e) {
                console.error('生成聊天截图失败:', e);
                showNotification('生成截图失败：图片链接可能跨域，或浏览器阻止保存', 'error', 3500);
            } finally {
                if (triggerBtn) {
                    triggerBtn.disabled = false;
                    triggerBtn.innerHTML = originalHtml || '<i class="fas fa-camera"></i> 生成截图';
                    if (typeof window.updateScreenshotSelectCount === 'function') window.updateScreenshotSelectCount();
                }
            }
        }

        function confirmBatchFavorite() {
            if (selectedMessages.length === 0) {
                showNotification('请先选择要收藏的消息', 'warning');
                return;
            }

            const count = selectedMessages.length;

            selectedMessages.forEach(msgId => {
                const message = messages.find(m => String(m.id) === String(msgId));
                if (message) {
                    message.favorited = true;
                }
            });

            throttledSaveData();
            toggleBatchFavoriteMode();
            showNotification(`已成功收藏 ${count} 条消息`, 'success');
        }



        function renderAnniversaries() {
    const list = DOMElements.anniversaryModal.list;
    if (anniversaries.length === 0) {
        list.innerHTML = '<div class="no-favorites" style="padding:20px 0;"><i class="fas fa-heart" style="font-size:24px;margin-bottom:10px;"></i><p>还没有记录纪念日</p></div>';
        return;
    }

    list.innerHTML = anniversaries.map(anniversary => {
        const startDate = new Date(anniversary.date);
        const now = new Date();
        let diffDays;
        
        if (anniversary.type === 'countdown') {
            diffDays = Math.ceil((startDate - now) / (1000 * 60 * 60 * 24));
            if (diffDays < 0) diffDays = 0; 
        } else {
            diffDays = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));
        }

        const typeClass = anniversary.type === 'countdown' ? 'type-future' : 'type-past';
        const tagText = anniversary.type === 'countdown' ? '倒数' : '纪念';

        return `
        <div class="anniversary-card ${typeClass}" data-id="${anniversary.id}">
            <div style="display:flex; justify-content:space-between; align-items:center; width:100%;">
                <div class="ann-info">
                    <div class="ann-name">
                        ${anniversary.name} 
                        <span class="ann-tag">${tagText}</span>
                    </div>
                    <div class="ann-date">${startDate.toLocaleDateString()}</div>
                </div>
                <div class="ann-days">
                    <span class="ann-number">${diffDays}</span>
                    <span class="ann-label">Days</span>
                </div>
            </div>
            <div class="ann-delete-btn" style="position:absolute; top:-8px; right:-8px; width:24px; height:24px; border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer; opacity:0; transition:opacity 0.2s;" 
                 onclick="deleteAnniversary(${anniversary.id}, event)">
                <i class="fas fa-times" style="font-size:12px;"></i>
            </div>
        </div>
        `;
    }).join('');
}

        function addAnniversary() {
    const nameInput = document.getElementById('ann-input-name');
    const dateInput = document.getElementById('ann-input-date');
    
    const name = (nameInput ? nameInput.value : (DOMElements.anniversaryModal.nameInput ? DOMElements.anniversaryModal.nameInput.value : '')).trim();
    const date = dateInput ? dateInput.value : (DOMElements.anniversaryModal.dateInput ? DOMElements.anniversaryModal.dateInput.value : '');

    if (!name || !date) {
        showNotification('请填写名称和日期', 'error');
        return;
    }

    const type = (typeof currentAnnType !== 'undefined' ? currentAnnType : null) 
              || (typeof currentAnniversaryType !== 'undefined' ? currentAnniversaryType : 'anniversary');

    const newAnniversary = {
        id: Date.now(),
        name: name,
        date: date,
        type: type
    };

    anniversaries.push(newAnniversary);
    throttledSaveData();
    renderAnniversariesList();
    
    if (nameInput) nameInput.value = '';
    if (dateInput) dateInput.value = '';
    if (DOMElements.anniversaryModal.nameInput) DOMElements.anniversaryModal.nameInput.value = '';
    if (DOMElements.anniversaryModal.dateInput) DOMElements.anniversaryModal.dateInput.value = '';

    const annFormWrapper = document.getElementById('ann-form-wrapper');
    const annToggleBtn = document.getElementById('ann-toggle-btn');
    if (annFormWrapper) annFormWrapper.classList.remove('active');
    if (annToggleBtn) annToggleBtn.classList.remove('active');

    showNotification('纪念日已添加', 'success');
    if (typeof playSound === 'function') playSound('anniversary');
}

        function showAnniversaryAnimation(anniversary) {
            const startDate = new Date(anniversary.date);
            const now = new Date();
            let diffDays;
            let title, message;

            if (anniversary.type === 'countdown') {

                diffDays = Math.ceil((startDate - now) / (1000 * 60 * 60 * 24));
                title = "倒数日";
                message = `即将到来`;
            } else {

                diffDays = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));
                title = "纪念日快乐！";
                message = `相伴至今`;
            }

            DOMElements.anniversaryAnimation.title.textContent = title;
            DOMElements.anniversaryAnimation.days.textContent = diffDays;
            DOMElements.anniversaryAnimation.message.textContent = message;

            DOMElements.anniversaryAnimation.modal.classList.add('active');
        }

        function updateAnniversaryDisplay(dateString) {
            if (!dateString) return;

            const start = new Date(dateString);
            const now = new Date();
            const diffTime = Math.abs(now - start);
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

            DOMElements.anniversaryModal.daysElement.textContent = diffDays;
            DOMElements.anniversaryModal.dateShowElement.textContent = `起始日：${start.toLocaleDateString()}`;
            DOMElements.anniversaryModal.displayArea.style.display = 'block';
        }



const MOOD_OPTIONS = [
    { key: 'happy', kaomoji: '😆', label: '开心', color: '#FFD93D' },
    { key: 'excited', kaomoji: '🥰', label: '兴奋', color: '#FF6B6B' },
    { key: 'peace', kaomoji: '☺️', label: '平淡', color: '#6BCB77' },
    { key: 'sad', kaomoji: '😕', label: '难过', color: '#4D96FF' },
    { key: 'tired', kaomoji: '😞', label: '疲惫', color: '#8D9EFF' },
    { key: 'angry', kaomoji: '😠', label: '生气', color: '#FF4757' },
    { key: 'love', kaomoji: '🥰', label: '想你', color: '#FF9A8B' },
    { key: 'busy', kaomoji: '😵‍💫', label: '忙碌', color: '#A8D8EA' },
    { key: 'sleepy', kaomoji: '😴', label: '困困', color: '#E0C3FC' },
{ key: 'lonely', kaomoji: '🥹', label: '孤单', color: '#B8A9C9' }, 
{ key: 'cool', kaomoji: '😎', label: '潇洒', color: '#2C3E50' },
    { key: 'cute', kaomoji: '🥺', label: '撒娇', color: '#FFB6C1' }
];

let moodData = {}; 
let moodTrash = [];
let currentCalendarDate = new Date();
window.selectedDateStr = null;
let selectedDateStr = null;
let currentMoodPage = 1; 
let currentMoodEditTarget = 'me'; 
let customMoodOptions = []; 
let customMoodSelectedColor = '#FFD93D';
const CUSTOM_MOOD_COLORS = ['#FFD93D','#FF6B6B','#6BCB77','#4D96FF','#8D9EFF','#FF9A8B','#A8D8EA','#E0C3FC','#B8A9C9','#2C3E50'];

async function initMoodData() {
    const savedMoods = await localforage.getItem(getStorageKey('moodCalendar'));
    if (savedMoods) { moodData = savedMoods; }
    const savedCustomMoods = await localforage.getItem(getStorageKey('customMoodOptions'));
    if (savedCustomMoods) { customMoodOptions = savedCustomMoods; }
    const savedTrash = await localforage.getItem(getStorageKey('moodTrash'));
    if (savedTrash && Array.isArray(savedTrash)) { moodTrash = savedTrash; }
    window.moodData = moodData;
    window.moodTrash = moodTrash;
    checkPartnerDailyMood();
}
function checkPartnerDailyMood() {
    const today = new Date();
    const dateStr = formatDateStr(today);
    
    if (!moodData[dateStr]) {
        moodData[dateStr] = {};
    }

    if (!moodData[dateStr].partner && moodData[dateStr].partnerChecked === undefined) {
        moodData[dateStr].partnerChecked = true;
        if (Math.random() < 0.20) {
            saveMoodData();
            return;
        }
        const randomMood = getAllMoodOptions()[Math.floor(Math.random() * getAllMoodOptions().length)];
        moodData[dateStr].partner = randomMood.key;
        try {
            const cReplies = (typeof customReplies !== 'undefined') ? customReplies : (window._customReplies || []);
            const sourcePool = [...cReplies];
            if (sourcePool.length > 0) {
                const count = Math.floor(Math.random() * 3) + 1;
                const chosen = [];
                const shuffled = [...sourcePool].sort(() => Math.random() - 0.5);
                for (let i = 0; i < Math.min(count, shuffled.length); i++) {
                    chosen.push(shuffled[i]);
                }
                moodData[dateStr].partnerNote = chosen.join('　');
            }
        } catch(e) {  }
        saveMoodData();
    }
}
function saveMoodData() {
    localforage.setItem(getStorageKey('moodCalendar'), moodData);
    window.moodData = moodData;
    var moodModal = document.getElementById('mood-modal');
    if (moodModal && !moodModal.classList.contains('hidden') && moodModal.style.display !== 'none') {
        renderMoodCalendar();
    }
}
function saveCustomMoodOptions() {
    localforage.setItem(getStorageKey('customMoodOptions'), customMoodOptions);
}

function saveMoodTrash() {
    localforage.setItem(getStorageKey('moodTrash'), moodTrash).catch(() => {});
    window.moodTrash = moodTrash;
}
function getAllMoodOptions() {
    return [...MOOD_OPTIONS, ...customMoodOptions];
}
function formatDateStr(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}


let currentMoodSelection = null; 

function ensureMoodOverlayStack() {
    const overlay = document.getElementById('mood-selector-overlay');
    if (!overlay) return null;
    try {
        if (document.body && overlay.parentElement !== document.body) {
            document.body.appendChild(overlay);
        } else if (document.body && document.body.lastElementChild !== overlay) {
            document.body.appendChild(overlay);
        }
        const baseZ = Math.max(Number(window.__modalTopZ) || 60000, 60000);
        overlay.style.setProperty('position', 'fixed', 'important');
        overlay.style.setProperty('inset', '0', 'important');
        overlay.style.setProperty('z-index', String(baseZ + 80), 'important');
        const editor = document.getElementById('mood-editor-view');
        const detail = document.getElementById('mood-detail-view');
        const custom = document.getElementById('custom-mood-dialog');
        if (editor) editor.style.setProperty('z-index', String(baseZ + 81), 'important');
        if (detail) detail.style.setProperty('z-index', String(baseZ + 81), 'important');
        if (custom) custom.style.setProperty('z-index', String(baseZ + 82), 'important');
    } catch (e) {
        console.warn('[Mood] overlay stack fix failed:', e);
    }
    return overlay;
}
window.ensureMoodOverlayStack = ensureMoodOverlayStack;

window.openMoodModal = function(options) {
    options = options || {};
    const modal = document.getElementById('mood-modal');
    if (!modal) return;
    try { if (typeof window.updateDynamicNames === 'function') window.updateDynamicNames(); } catch(e) {}
    try {
        const btnCalendar = document.getElementById('btn-view-calendar');
        const btnStats = document.getElementById('btn-view-stats');
        const btnTrash = document.getElementById('btn-view-trash');
        const viewCalendar = document.getElementById('mood-calendar-view');
        const viewStats = document.getElementById('mood-stats-view');
        const viewTrash = document.getElementById('mood-trash-view');
        btnCalendar && btnCalendar.classList.add('active');
        btnStats && btnStats.classList.remove('active');
        btnTrash && btnTrash.classList.remove('active');
        viewCalendar && viewCalendar.classList.remove('hidden-view');
        viewStats && viewStats.classList.add('hidden-view');
        viewTrash && viewTrash.classList.add('hidden-view');
        if (typeof renderMoodCalendar === 'function') renderMoodCalendar();
    } catch(e) { console.warn('[Mood] render before open failed:', e); }

    const doShow = () => {
        if (document.body && modal.parentElement !== document.body) document.body.appendChild(modal);
        const homeContainer = document.getElementById('home-container');
        const fromHome = options.fromHome || (homeContainer && homeContainer.classList.contains('active'));
        if (fromHome && typeof window.homeShowModal === 'function') window.homeShowModal(modal);
        else if (typeof showModal === 'function') showModal(modal);
        else modal.style.display = 'flex';
    };

    if (options.fromAdvanced) {
        const advModal = document.getElementById('advanced-modal');
        if (advModal && typeof hideModal === 'function') hideModal(advModal);
        setTimeout(doShow, 160);
    } else {
        doShow();
    }
};

window.closeMoodModal = function() {
    const modal = document.getElementById('mood-modal');
    if (!modal) return;
    if (typeof hideModal === 'function') hideModal(modal);
    else modal.style.display = 'none';
    // 从主页进入时，关闭后明确把主页壳露出来，避免 PWA 下 display/visibility 被弹窗恢复逻辑搅乱。
    setTimeout(() => {
        const homeContainer = document.getElementById('home-container');
        const pageBg = document.getElementById('home-page-bg');
        const chatArea = document.querySelector('.main-chat-area');
        const header = document.querySelector('.header');
        const inputArea = document.querySelector('.input-area-wrapper');
        if (homeContainer && homeContainer.classList.contains('active')) {
            homeContainer.style.display = 'flex';
            if (pageBg) pageBg.style.display = 'block';
            if (chatArea) chatArea.style.display = 'none';
            if (header) header.style.display = 'none';
            if (inputArea) inputArea.style.display = 'none';
            document.body.classList.add('home-active');
        }
    }, 340);
};

function renderMoodCalendar() {
    const grid = document.getElementById('calendar-grid');
    const monthLabel = document.getElementById('calendar-month-label');
    
    if (!grid || !monthLabel) return;

    grid.innerHTML = '';
    
    const year = currentCalendarDate.getFullYear();
    const month = currentCalendarDate.getMonth();
    
    monthLabel.textContent = `${year}年 ${month + 1}月`;

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay(); 

    let stats = {
        me: { total: 0, counts: {} },
        partner: { total: 0, counts: {} }
    };

    for (let i = 0; i < startDayOfWeek; i++) {
        const empty = document.createElement('div');
        empty.className = 'calendar-day empty';
        grid.appendChild(empty);
    }

    const todayStr = formatDateStr(new Date());

    for (let d = 1; d <= daysInMonth; d++) {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day';
        
        const dateObj = new Date(year, month, d);
        const dateStr = formatDateStr(dateObj);
        
        if (dateStr === todayStr) {
            dayDiv.classList.add('today');
            dayDiv.style.borderColor = 'var(--accent-color)';
        }

        const numSpan = document.createElement('span');
        numSpan.textContent = d;
        dayDiv.appendChild(numSpan);

        const dotsContainer = document.createElement('div');
        dotsContainer.className = 'mood-dots-container';

        const dayData = moodData[dateStr];
        
        if (dayData) {
            if (dayData.user) {
                const moodObj = getAllMoodOptions().find(m => m.key === dayData.user);
                if (moodObj) {
                    stats.me.counts[moodObj.key] = (stats.me.counts[moodObj.key] || 0) + 1;
                    stats.me.total++;
                    const dot = createMoodDot(moodObj, dayData.note, false);
                    dotsContainer.appendChild(dot);
                }
            }
            if (dayData.partner) {
                const moodObj = getAllMoodOptions().find(m => m.key === dayData.partner);
                if (moodObj) {
                    stats.partner.counts[moodObj.key] = (stats.partner.counts[moodObj.key] || 0) + 1;
                    stats.partner.total++;
                    const dot = createMoodDot(moodObj, dayData.partnerNote, true); 
                    dotsContainer.appendChild(dot);
                }
            }
        }

        dayDiv.appendChild(dotsContainer);

        dayDiv.addEventListener('click', () => {
            const dayEntry = moodData[dateStr];
            if (dayEntry && (dayEntry.user || dayEntry.partner)) {
                showDayDetails(dateStr, dayEntry);
            } else {
                openMoodSelector(dateStr, 'me');
            }
        });

        grid.appendChild(dayDiv);
    }

    updateDualMoodStats(stats);
}

function createMoodDot(moodObj, note, isPartner) {
    const dot = document.createElement('div');
    dot.className = `mood-detail-dot ${isPartner ? 'partner-mood' : ''}`;
    dot.style.backgroundColor = moodObj.color;
    
    if (isPartner) {
        dot.innerHTML = `
            <span class="mood-kaomoji-span">${moodObj.kaomoji}</span>
            <span class="mood-text-span">Ta</span>
        `;
    } else {
        const displayText = (note && note.trim()) ? note : moodObj.label;
        dot.innerHTML = `
            <span class="mood-kaomoji-span">${moodObj.kaomoji}</span>
            <span class="mood-text-span" style="margin-left:2px;">${displayText}</span>
        `;
    }
    return dot;
}
function updateDualMoodStats(stats) {
    const container = document.getElementById('mood-stats-container');
    if (!container) return;

    const mName = (typeof settings !== 'undefined' && settings.myName) ? settings.myName : '我';
    const pName = (typeof settings !== 'undefined' && settings.partnerName) ? settings.partnerName : '梦角';

    const myTotal = stats.me.total;
    const partnerTotal = stats.partner.total;
    
    const daysInMonth = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth() + 1, 0).getDate();
    const myPercent = daysInMonth > 0 ? (myTotal / daysInMonth) * 100 : 0;
    const partnerPercent = daysInMonth > 0 ? (partnerTotal / daysInMonth) * 100 : 0;

    let myDominant = { label: '无', kaomoji: '😶', color: '#ccc' };
    let myMaxCount = 0;
    Object.keys(stats.me.counts).forEach(key => {
        if (stats.me.counts[key] > myMaxCount) {
            myMaxCount = stats.me.counts[key];
            const m = getAllMoodOptions().find(o => o.key === key);
            if (m) myDominant = m;
        }
    });

    let partnerDominant = { label: '无', kaomoji: '😶', color: '#ccc' };
    let partnerMaxCount = 0;
    Object.keys(stats.partner.counts).forEach(key => {
        if (stats.partner.counts[key] > partnerMaxCount) {
            partnerMaxCount = stats.partner.counts[key];
            const m = getAllMoodOptions().find(o => o.key === key);
            if (m) partnerDominant = m;
        }
    });
    
    const createMoodBarHTML = (moodCounts, totalCount) => {
        if (totalCount <= 0) {
            return `<div class="mood-bar-container" style="justify-content: center; align-items: center; font-size: 10px; color: var(--text-secondary); background: var(--message-received-bg);">无数据</div>`;
        }

        const segments = Object.keys(moodCounts)
            .map(key => {
                const count = moodCounts[key];
                const moodObj = getAllMoodOptions().find(m => m.key === key);
                if (moodObj) {
                    const percentage = (count / totalCount) * 100;
                    return `<div class="mood-bar-segment" style="width: ${percentage}%; background-color: ${moodObj.color};" title="${moodObj.label}: ${count}天"></div>`;
                }
                return ''; 
            })
            .join(''); 
        return `<div class="mood-bar-container">${segments}</div>`;
    };

    const myBarHTML = createMoodBarHTML(stats.me.counts, myTotal);
    const partnerBarHTML = createMoodBarHTML(stats.partner.counts, partnerTotal);

    var todayStr = formatDateStr(new Date());
    var todayEntry = moodData[todayStr] || {};
    var myWeatherVal = todayEntry.myWeather || '';
    var partnerWeatherVal = todayEntry.partnerWeather || '';

    container.innerHTML = `
        <div class="mood-circles-wrapper" style="margin-bottom:20px;">
            <div class="mood-circle-item">
                <div class="mood-circle" style="--percent: ${myPercent}%">
                    <span class="mood-circle-text" style="color:var(--accent-color)">${myTotal}</span>
                </div>
                <div class="mood-circle-label">
                    <span class="mood-marker me" style="width:8px;height:8px;"></span> ${mName}
                </div>
                <div class="stats-weather-tag" onclick="editStatsWeather(this,'me')" title="点击编辑天气">
                    ${myWeatherVal ? `<span>${myWeatherVal}</span>` : `<span style="opacity:0.4;">+ 天气</span>`}
                </div>
            </div>
            <div class="mood-circle-item">
                <div class="mood-circle" style="--percent: ${partnerPercent}%; --accent-color: #ff6b6b;">
                    <span class="mood-circle-text" style="color:#ff6b6b">${partnerTotal}</span>
                </div>
                <div class="mood-circle-label">
                    <span class="mood-marker partner" style="width:8px;height:8px;"></span> ${pName}
                </div>
                <div class="stats-weather-tag" onclick="editStatsWeather(this,'partner')" title="点击编辑天气">
                    ${partnerWeatherVal ? `<span>${partnerWeatherVal}</span>` : `<span style="opacity:0.4;">+ 天气</span>`}
                </div>
            </div>
        </div>

        <div class="mood-stat-group">
            <div class="mood-stat-title">
                <span>我的心情</span>
                <div class="dominant-mood-tag">
                    <span style="color:${myDominant.color}; font-weight:bold;">${myDominant.kaomoji} ${myDominant.label}</span>
                </div>
            </div>
            <div style="font-size:11px; color:var(--text-secondary); display:flex; justify-content:space-between;">
                <span>记录天数: ${myTotal}</span>
            </div>
            ${myBarHTML}
        </div>

        <div class="mood-stat-group">
            <div class="mood-stat-title">
                <span>${pName}的心情</span>
                <div class="dominant-mood-tag">
                    <span style="color:${partnerDominant.color}; font-weight:bold;">${partnerDominant.kaomoji} ${partnerDominant.label}</span>
                </div>
            </div>
            <div style="font-size:11px; color:var(--text-secondary); display:flex; justify-content:space-between;">
                <span>记录天数: ${partnerTotal}</span>
            </div>
            ${partnerBarHTML}
        </div>
    `;
}

window.editStatsWeather = function(el, who) {
    if (el.querySelector('input')) return;
    var todayStr = formatDateStr(new Date());
    if (!moodData[todayStr]) moodData[todayStr] = {};
    var current = who === 'me' ? (moodData[todayStr].myWeather || '') : (moodData[todayStr].partnerWeather || '');
    var input = document.createElement('input');
    input.type = 'text';
    input.value = current;
    input.maxLength = 20;
    input.placeholder = '今日天气…';
    input.style.cssText = 'width:100%;padding:3px 7px;border:1px solid var(--accent-color);border-radius:8px;font-size:12px;background:var(--primary-bg);color:var(--text-primary);outline:none;text-align:center;';
    el.innerHTML = '';
    el.appendChild(input);
    input.focus(); input.select();
    function save() {
        var val = input.value.trim();
        if (who === 'me') moodData[todayStr].myWeather = val;
        else moodData[todayStr].partnerWeather = val;
        saveMoodData();
        el.innerHTML = val ? `<span>${val}</span>` : `<span style="opacity:0.4;">+ 天气</span>`;
    }
    input.addEventListener('blur', save);
    input.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') { e.preventDefault(); save(); }
        if (e.key === 'Escape') { el.innerHTML = current ? `<span>${current}</span>` : `<span style="opacity:0.4;">+ 天气</span>`; }
    });
};

window.deleteDailyMood = function(dateStr, who) {
    if (!moodData[dateStr]) return;
    const src = moodData[dateStr];
    const trashItem = {
        id: Date.now() + Math.random(),
        dateStr,
        who,
        deletedAt: new Date().toISOString(),
        payload: {}
    };

    if (who === 'me') {
        trashItem.payload = {
            user: src.user || null,
            note: src.note || '',
            myWeather: src.myWeather || ''
        };
        delete moodData[dateStr].user;
        delete moodData[dateStr].note;
        delete moodData[dateStr].myWeather;
    } else {
        trashItem.payload = {
            partner: src.partner || null,
            partnerNote: src.partnerNote || '',
            partnerWeather: src.partnerWeather || ''
        };
        delete moodData[dateStr].partner;
        delete moodData[dateStr].partnerNote;
        delete moodData[dateStr].partnerWeather;
    }

    if (!moodData[dateStr].user && !moodData[dateStr].partner) delete moodData[dateStr];

    moodTrash.unshift(trashItem);
    saveMoodTrash();

    saveMoodData();
    renderMoodCalendar();
    showNotification('已移入回收站', 'success');
    if (typeof playSound === 'function') playSound('mood');
    renderMoodTrashList && renderMoodTrashList();
    closeMoodOverlay();
};

function _escapeHtml(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function renderMoodTrashList() {
    const list = document.getElementById('mood-trash-list');
    if (!list) return;
    if (!moodTrash || moodTrash.length === 0) {
        list.innerHTML = `
            <div style="padding:22px 0; text-align:center; color:var(--text-secondary);">
                <div style="font-size:26px; opacity:0.35; margin-bottom:6px;">🗑</div>
                <div style="font-weight:600; font-size:13px;">回收站空空如也</div>
            </div>
        `;
        return;
    }
    const mName = (typeof settings !== 'undefined' && settings.myName) ? settings.myName : '我';
    const pName = (typeof settings !== 'undefined' && settings.partnerName) ? settings.partnerName : '梦角';
    const allMoods = getAllMoodOptions();

    list.innerHTML = moodTrash.map(item => {
        const whoLabel = item.who === 'me' ? mName : pName;
        const moodKey = item.who === 'me' ? item.payload.user : item.payload.partner;
        const moodObj = moodKey ? allMoods.find(o => o.key === moodKey) : null;
        const moodText = moodObj ? `${moodObj.kaomoji} ${moodObj.label}` : '（无心情）';

        return `
            <div style="
                display:flex; align-items:center; justify-content:space-between; gap:10px;
                border:1.5px solid var(--border-color); background:var(--primary-bg);
                border-radius:14px; padding:12px 12px; margin-bottom:10px;
            ">
                <div style="min-width:0;">
                    <div style="font-size:13px; font-weight:700; color:var(--text-primary);">
                        ${_escapeHtml(item.dateStr)} · ${_escapeHtml(whoLabel)}
                    </div>
                    <div style="font-size:12px; color:var(--text-secondary); margin-top:3px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        ${_escapeHtml(moodText)}
                    </div>
                </div>
                <div style="display:flex; gap:8px; flex-shrink:0;">
                    <button class="modal-btn modal-btn-secondary" onclick="restoreMoodTrashItem('${item.id}')" style="padding:7px 10px; font-size:12px; flex-shrink:0;">
                        恢复
                    </button>
                    <button class="modal-btn modal-btn-secondary" onclick="deleteMoodTrashItem('${item.id}')" style="padding:7px 10px; font-size:12px; color:#ff6b6b; border-color:rgba(255,107,107,0.4); flex-shrink:0;">
                        彻底删除
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

window.restoreMoodTrashItem = function(trashId) {
    const idStr = String(trashId);
    const item = (moodTrash || []).find(t => String(t.id) === idStr);
    if (!item) return;

    if (!moodData[item.dateStr]) moodData[item.dateStr] = {};
    if (item.who === 'me') {
        moodData[item.dateStr].user = item.payload.user;
        moodData[item.dateStr].note = item.payload.note || '';
        moodData[item.dateStr].myWeather = item.payload.myWeather || '';
    } else {
        moodData[item.dateStr].partner = item.payload.partner;
        moodData[item.dateStr].partnerNote = item.payload.partnerNote || '';
        moodData[item.dateStr].partnerWeather = item.payload.partnerWeather || '';
    }

    moodTrash = moodTrash.filter(t => String(t.id) !== idStr);
    saveMoodTrash();
    saveMoodData();
    renderMoodCalendar();
    renderMoodTrashList();
    showNotification('已从回收站恢复', 'success');
    if (typeof playSound === 'function') playSound('mood');
};

window.deleteMoodTrashItem = function(trashId) {
    const idStr = String(trashId);
    const item = (moodTrash || []).find(t => String(t.id) === idStr);
    if (!item) return;
    if (!confirm('确定要彻底删除这一条回收站记录吗？')) return;
    moodTrash = moodTrash.filter(t => String(t.id) !== idStr);
    saveMoodTrash();
    renderMoodTrashList();
    showNotification('已彻底删除', 'success');
    if (typeof playSound === 'function') playSound('error');
};

function exportMoodBackup() {
    try {
        const payload = {
            type: 'mood-backup',
            exportDate: new Date().toISOString(),
            moodCalendar: moodData,
            customMoodOptions: customMoodOptions,
            moodTrash: moodTrash
        };
        const fileName = `mood-backup-${new Date().toISOString().slice(0, 10)}.json`;
        exportDataToMobileOrPC(JSON.stringify(payload, null, 2), fileName);
        showNotification('✓ 心晴手账已导出', 'success');
        if (typeof playSound === 'function') playSound('export');
    } catch (e) {
        console.error('心晴手账导出失败:', e);
        showNotification('心晴手账导出失败', 'error');
    }
}

async function importMoodBackupFile(file) {
    if (!file) return;
    const text = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsText(file);
    });

    let data = null;
    try {
        data = JSON.parse(text);
    } catch (e) {
        showNotification('导入文件格式不正确', 'error');
        return;
    }

    if (!data || typeof data !== 'object') {
        showNotification('导入文件无效', 'error');
        return;
    }

    _showMoodImportPicker(data);
}

function _showMoodImportPicker(data) {
    const hasCalendar = data.moodCalendar && typeof data.moodCalendar === 'object';
    const hasCustom = Array.isArray(data.customMoodOptions);
    const hasTrash = Array.isArray(data.moodTrash);

    if (!hasCalendar && !hasCustom && !hasTrash) {
        showNotification('文件不包含可导入的心晴手账数据', 'error');
        return;
    }

    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.6);
        backdrop-filter:blur(10px);display:flex;align-items:flex-end;justify-content:center;
    `;
    overlay.innerHTML = `
        <div style="
            width:100%;max-width:520px;background:var(--secondary-bg);border-radius:24px 24px 0 0;
            box-shadow:0 -10px 60px rgba(0,0,0,0.3);
            padding:16px 18px env(safe-area-inset-bottom,0);
        ">
            <div style="width:36px;height:4px;border-radius:2px;background:var(--border-color);margin:0 auto 14px;"></div>
            <div style="font-size:16px;font-weight:800;color:var(--text-primary);margin-bottom:10px;">选择导入内容</div>
            <label style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 12px;border:1.5px solid var(--border-color);border-radius:16px;background:var(--primary-bg);margin-bottom:10px;opacity:${hasCalendar ? 1 : 0.45};">
                <span style="font-size:13px;font-weight:700;color:var(--text-primary);">心情日历</span>
                <input type="checkbox" id="mood-imp-cal" ${hasCalendar ? 'checked' : ''} ${hasCalendar ? '' : 'disabled'} style="transform:scale(1.1); accent-color:var(--accent-color);">
            </label>
            <label style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 12px;border:1.5px solid var(--border-color);border-radius:16px;background:var(--primary-bg);margin-bottom:10px;opacity:${hasCustom ? 1 : 0.45};">
                <span style="font-size:13px;font-weight:700;color:var(--text-primary);">自定义心情</span>
                <input type="checkbox" id="mood-imp-custom" ${hasCustom ? 'checked' : ''} ${hasCustom ? '' : 'disabled'} style="transform:scale(1.1); accent-color:var(--accent-color);">
            </label>
            <label style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 12px;border:1.5px solid var(--border-color);border-radius:16px;background:var(--primary-bg);margin-bottom:10px;opacity:${hasTrash ? 1 : 0.45};">
                <span style="font-size:13px;font-weight:700;color:var(--text-primary);">回收站</span>
                <input type="checkbox" id="mood-imp-trash" ${hasTrash ? 'checked' : ''} ${hasTrash ? '' : 'disabled'} style="transform:scale(1.1); accent-color:var(--accent-color);">
            </label>
            <div style="display:flex;gap:10px;margin-top:14px;">
                <button id="mood-imp-cancel" class="modal-btn modal-btn-secondary" style="flex:1;padding:12px 0;">取消</button>
                <button id="mood-imp-confirm" class="modal-btn modal-btn-primary" style="flex:1;padding:12px 0;">确认导入</button>
            </div>
        </div>
    `;

    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    const moodImpCancelBtn = document.getElementById('mood-imp-cancel');
    const moodImpConfirmBtn = document.getElementById('mood-imp-confirm');
    if (moodImpCancelBtn) moodImpCancelBtn.onclick = () => overlay.remove();
    if (moodImpConfirmBtn) moodImpConfirmBtn.onclick = () => {
        const selCal = document.getElementById('mood-imp-cal').checked;
        const selCustom = document.getElementById('mood-imp-custom').checked;
        const selTrash = document.getElementById('mood-imp-trash').checked;

        if (!selCal && !selCustom && !selTrash) {
            showNotification('请至少选择一项', 'error');
            return;
        }

        try {
            if (selCal && hasCalendar) {
                Object.keys(data.moodCalendar).forEach(dateStr => {
                    if (!moodData[dateStr]) moodData[dateStr] = {};
                    if (data.moodCalendar[dateStr] && typeof data.moodCalendar[dateStr] === 'object') {
                        Object.assign(moodData[dateStr], data.moodCalendar[dateStr]);
                    }
                });
            }

            if (selCustom && hasCustom) {
                const map = new Map();
                (customMoodOptions || []).forEach(m => map.set(m.key, m));
                data.customMoodOptions.forEach(m => map.set(m.key, m));
                customMoodOptions = [...map.values()];
            }

            if (selTrash && hasTrash) {
                const map = new Map();
                (moodTrash || []).forEach(t => map.set(String(t.id), t));
                data.moodTrash.forEach(t => map.set(String(t.id), t));
                moodTrash = [...map.values()];
            }

            window.moodData = moodData;
            window.moodTrash = moodTrash;

            saveMoodData();
            saveCustomMoodOptions();
            saveMoodTrash();

            renderMoodCalendar();
            renderMoodTrashList();
            showNotification('✓ 导入成功', 'success');
            if (typeof playSound === 'function') playSound('import');
            overlay.remove();
        } catch (err) {
            console.error('心晴手账导入失败:', err);
            showNotification('导入失败', 'error');
        }
    };

    document.body.appendChild(overlay);
}

function renderMoodOptionsGrid(targetKey) {
    const allMoods = getAllMoodOptions();
    const optionsGrid = document.getElementById('mood-options-grid');
    optionsGrid.innerHTML = allMoods.map(mood => {
        const isSelected = targetKey === mood.key;
        const isCustom = mood.key.startsWith('custom_');
        return `
        <div class="mood-option-btn${isCustom ? ' mood-option-custom' : ''}" 
             style="${isSelected ? `background:${mood.color}; color:#fff; border-color:${mood.color}; transform:scale(1.05); box-shadow:0 4px 10px rgba(0,0,0,0.15);` : ''}"
             onclick="tempSelectMood('${mood.key}')">
            <div class="mood-kaomoji" style="${isSelected ? 'color:#fff' : `color:${mood.color}`}">${mood.kaomoji}</div>
            <div class="mood-label">${mood.label}</div>
            ${(isCustom && currentMoodEditTarget === 'me') ? `<div class="mood-custom-actions" onclick="event.stopPropagation()">
                <button class="mood-custom-action-btn" onclick="editCustomMood('${mood.key}')" title="编辑">✏️</button>
                <button class="mood-custom-action-btn" onclick="deleteCustomMood('${mood.key}')" title="删除">🗑</button>
            </div>` : ''}
        </div>
    `}).join('');
}

function switchMoodPage(dir) {
    currentMoodPage = Math.max(1, Math.min(2, currentMoodPage + dir));
    const page1 = document.getElementById('mood-page-1');
    const page2 = document.getElementById('mood-page-2');
    const indicator = document.getElementById('mood-page-indicator');
    const prevBtn = document.getElementById('mood-page-prev');
    const nextBtn = document.getElementById('mood-page-next');
    if (currentMoodPage === 1) {
        page1.style.display = 'block'; page2.style.display = 'none';
        indicator.textContent = '第 1 页 · 心情';
        prevBtn.disabled = true; nextBtn.disabled = false;
    } else {
        page1.style.display = 'none'; page2.style.display = 'block';
        const isPartner = currentMoodEditTarget === 'partner';
        indicator.textContent = '第 2 页 · 随记';
        document.getElementById('mood-note-label').textContent = isPartner ? '对方随记:' : '随记:';
        document.getElementById('mood-note-input').placeholder = isPartner ? '记录对方今天发生的事...' : '记录下今天发生的小事...';
        prevBtn.disabled = false; nextBtn.disabled = true;
    }
}
window.switchMoodPage = switchMoodPage;

function switchMoodEditTarget(target) {
    currentMoodEditTarget = target;
    document.getElementById('mood-tab-me').classList.toggle('active', target === 'me');
    document.getElementById('mood-tab-partner').classList.toggle('active', target === 'partner');
    const existing = moodData[selectedDateStr];
    let currentKey, noteVal;
    if (target === 'me') {
        currentKey = existing ? existing.user : null;
        noteVal = (existing && existing.note) ? existing.note : '';
    } else {
        currentKey = existing ? existing.partner : null;
        noteVal = (existing && existing.partnerNote) ? existing.partnerNote : '';
    }
    currentMoodSelection = currentKey;
    document.getElementById('mood-note-input').value = noteVal;
    renderMoodOptionsGrid(currentKey);
    switchMoodPage(0); 
}
window.switchMoodEditTarget = switchMoodEditTarget;

function openMoodSelector(dateStr, editTarget) {
    selectedDateStr = dateStr;
    window.selectedDateStr = dateStr;
    currentMoodEditTarget = editTarget || 'me';
    currentMoodPage = 1;
    currentMoodSelection = null;

    const overlay = ensureMoodOverlayStack() || document.getElementById('mood-selector-overlay');
    const editorView = document.getElementById('mood-editor-view');
    const detailView = document.getElementById('mood-detail-view');
    const dateTitle = document.getElementById('mood-selector-date');

    if (window._moodOverlayRafId) {
        cancelAnimationFrame(window._moodOverlayRafId);
        window._moodOverlayRafId = null;
    }

    overlay.classList.remove('active');
    
    editorView.style.display = 'block';
    if (detailView) detailView.style.display = 'none';

    const [y, m, d] = dateStr.split('-');
    dateTitle.textContent = `${m}月${d}日`;

    document.getElementById('mood-tab-me').classList.toggle('active', currentMoodEditTarget === 'me');
    document.getElementById('mood-tab-partner').classList.toggle('active', currentMoodEditTarget === 'partner');

    const existing = moodData[dateStr];
    let currentKey, noteVal, weatherVal;
    if (currentMoodEditTarget === 'me') {
        currentKey = existing ? existing.user : null;
        noteVal = (existing && existing.note) ? existing.note : '';
        weatherVal = (existing && existing.myWeather) ? existing.myWeather : '';
    } else {
        currentKey = existing ? existing.partner : null;
        noteVal = (existing && existing.partnerNote) ? existing.partnerNote : '';
        weatherVal = (existing && existing.partnerWeather) ? existing.partnerWeather : '';
    }
    currentMoodSelection = currentKey;
    document.getElementById('mood-note-input').value = noteVal;
    const weatherInput = document.getElementById('mood-weather-input');
    if (weatherInput) weatherInput.value = weatherVal;
    const weatherLabel = document.getElementById('mood-weather-label');
    if (weatherLabel) {
        var pNameW = (typeof settings !== 'undefined' && settings.partnerName) ? settings.partnerName : '梦角';
        var mNameW = (typeof settings !== 'undefined' && settings.myName) ? settings.myName : '我';
        if (weatherLabel.firstChild) weatherLabel.firstChild.textContent = currentMoodEditTarget === 'me' ? mNameW + '的天气\u00a0' : pNameW + '的天气\u00a0';
    }

    document.getElementById('mood-page-1').style.display = 'block';
    document.getElementById('mood-page-2').style.display = 'none';
    document.getElementById('mood-page-indicator').textContent = '第 1 页 · 心情';
    document.getElementById('mood-page-prev').disabled = true;
    document.getElementById('mood-page-next').disabled = false;

    renderMoodOptionsGrid(currentKey);
    window._moodOverlayRafId = requestAnimationFrame(() => {
        window._moodOverlayRafId = null;
        overlay.classList.add('active');
    });
}

window.editPartnerMoodRecord = function() {
    openMoodSelector(selectedDateStr, 'partner');
};

window.tempSelectMood = function(key) {
    currentMoodSelection = key;
    renderMoodOptionsGrid(key);
}

document.getElementById('confirm-mood-save').addEventListener('click', () => {
    if (!selectedDateStr) return;
    if (!currentMoodSelection && currentMoodPage === 1) {
        showNotification('请先选择一个心情图标', 'warning');
        return;
    }
    if (!moodData[selectedDateStr]) moodData[selectedDateStr] = {};
    const weatherVal = (document.getElementById('mood-weather-input') || {}).value || '';
    if (currentMoodEditTarget === 'me') {
        if (currentMoodSelection) moodData[selectedDateStr].user = currentMoodSelection;
        moodData[selectedDateStr].note = document.getElementById('mood-note-input').value.trim();
        moodData[selectedDateStr].myWeather = weatherVal.trim();
    } else {
        if (currentMoodSelection) moodData[selectedDateStr].partner = currentMoodSelection;
        moodData[selectedDateStr].partnerNote = document.getElementById('mood-note-input').value.trim();
        moodData[selectedDateStr].partnerWeather = weatherVal.trim();
    }
    
    saveMoodData();
    closeMoodOverlay();
    showNotification('记录已保存 ✦', 'success');
    if (typeof playSound === 'function') playSound('mood');
});

function showDayDetails(dateStr, data) {
    selectedDateStr = dateStr;
    window.selectedDateStr = dateStr;
    const overlay = ensureMoodOverlayStack() || document.getElementById('mood-selector-overlay');
    const editorView = document.getElementById('mood-editor-view');
    const detailView = document.getElementById('mood-detail-view');
    
    const allMoods = getAllMoodOptions();
    const moodObj = allMoods.find(m => m.key === data.user);

    const [y, m, d] = dateStr.split('-');
    document.getElementById('detail-date').textContent = `${m}月${d}日`;

    const mySection = document.getElementById('detail-my-section');
    if (moodObj) {
        mySection.style.display = 'block';
        document.getElementById('detail-kaomoji').textContent = moodObj.kaomoji;
        document.getElementById('detail-label').textContent = moodObj.label;
        document.getElementById('detail-label').style.color = moodObj.color;
        document.getElementById('detail-text').textContent = data.note || "（这天没有写下随记...）";
        detailView.style.borderLeftColor = moodObj.color;
        const myWeatherEl = document.getElementById('detail-my-weather');
        if (myWeatherEl) {
            if (data.myWeather) { myWeatherEl.style.display = 'block'; document.getElementById('detail-my-weather-val').textContent = data.myWeather; }
            else myWeatherEl.style.display = 'none';
        }
    } else {
        mySection.style.display = 'none';
    }

    const partnerSection = document.getElementById('detail-partner-section');
    const partnerNoRecord = document.getElementById('detail-partner-no-record');
    if (data.partner) {
        const partnerMoodObj = allMoods.find(mo => mo.key === data.partner);
        if (partnerMoodObj) {
            partnerSection.style.display = 'block';
            if (partnerNoRecord) partnerNoRecord.style.display = 'none';
            document.getElementById('detail-partner-kaomoji').textContent = partnerMoodObj.kaomoji;
            document.getElementById('detail-partner-label').textContent = partnerMoodObj.label;
            document.getElementById('detail-partner-label').style.color = partnerMoodObj.color;
            document.getElementById('detail-partner-text').textContent = data.partnerNote || "（Ta 这天没有写下任何随记）";
            const partnerWeatherEl = document.getElementById('detail-partner-weather');
            if (partnerWeatherEl) {
                if (data.partnerWeather) { partnerWeatherEl.style.display = 'block'; document.getElementById('detail-partner-weather-val').textContent = data.partnerWeather; }
                else partnerWeatherEl.style.display = 'none';
            }
        } else {
            partnerSection.style.display = 'none';
            if (partnerNoRecord) partnerNoRecord.style.display = 'none';
        }
    } else {
        partnerSection.style.display = 'none';
        if (partnerNoRecord) partnerNoRecord.style.display = 'block';
    }

    editorView.style.display = 'none';
    detailView.style.display = 'block';
    overlay.classList.add('active');
}

document.getElementById('edit-existing-mood').addEventListener('click', () => {
    const editorView = document.getElementById('mood-editor-view');
    const detailView = document.getElementById('mood-detail-view');
    openMoodSelector(selectedDateStr, 'me');
    editorView.style.display = 'block';
    detailView.style.display = 'none';
});

window.closeMoodOverlay = function() {
    if (window._moodOverlayRafId) {
        cancelAnimationFrame(window._moodOverlayRafId);
        window._moodOverlayRafId = null;
    }
    const overlay = document.getElementById('mood-selector-overlay');
    if(overlay) {
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.25s ease';
        setTimeout(() => {
            overlay.classList.remove('active');
            overlay.style.opacity = '';
            overlay.style.transition = '';
            const customDialog = document.getElementById('custom-mood-dialog');
            if(customDialog) customDialog.style.display = 'none';
        }, 250);
    }
};
window.viewMoodDetailFromEditor = function() {
    if (!selectedDateStr || !moodData[selectedDateStr]) return;
    showDayDetails(selectedDateStr, moodData[selectedDateStr]);
};
document.getElementById('cancel-mood-edit').addEventListener('click', closeMoodOverlay);

window.openCustomMoodDialog = function() {
    const dialog = document.getElementById('custom-mood-dialog');
    document.getElementById('custom-mood-emoji').value = '';
    document.getElementById('custom-mood-label').value = '';
    customMoodSelectedColor = CUSTOM_MOOD_COLORS[0];
    const colorsEl = document.getElementById('custom-mood-colors');
    colorsEl.innerHTML = CUSTOM_MOOD_COLORS.map((c,i) => 
        `<div class="custom-mood-color-dot ${i===0?'selected':''}" style="background:${c};" onclick="selectCustomColor('${c}',this)"></div>`
    ).join('');
    const saveBtn = dialog.querySelector('.modal-btn-primary');
    saveBtn.onclick = window.saveCustomMood;
    dialog.style.display = 'block';
};
window.selectCustomColor = function(color, el) {
    customMoodSelectedColor = color;
    document.querySelectorAll('.custom-mood-color-dot').forEach(d => d.classList.remove('selected'));
    el.classList.add('selected');
};
window.closeCustomMoodDialog = function() {
    document.getElementById('custom-mood-dialog').style.display = 'none';
};
window.saveCustomMood = function() {
    const emoji = document.getElementById('custom-mood-emoji').value.trim();
    const label = document.getElementById('custom-mood-label').value.trim();
    if (!emoji || !label) { showNotification('请填写表情和名称', 'warning'); return; }
    const key = 'custom_' + Date.now();
    customMoodOptions.push({ key, kaomoji: emoji, label, color: customMoodSelectedColor });
    saveCustomMoodOptions();
    closeCustomMoodDialog();
    renderMoodOptionsGrid(currentMoodSelection);
    showNotification('自定义心情已添加 ✦', 'success');
    if (typeof playSound === 'function') playSound('mood');
};

window.deleteCustomMood = function(key) {
    customMoodOptions = customMoodOptions.filter(m => m.key !== key);
    saveCustomMoodOptions();
    renderMoodOptionsGrid(currentMoodSelection);
    showNotification('已删除自定义心情', 'success');
    if (typeof playSound === 'function') playSound('mood');
};

window.editCustomMood = function(key) {
    const mood = customMoodOptions.find(m => m.key === key);
    if (!mood) return;
    const dialog = document.getElementById('custom-mood-dialog');
    document.getElementById('custom-mood-emoji').value = mood.kaomoji;
    document.getElementById('custom-mood-label').value = mood.label;
    customMoodSelectedColor = mood.color;
    const colorsEl = document.getElementById('custom-mood-colors');
    colorsEl.innerHTML = CUSTOM_MOOD_COLORS.map((c) => 
        `<div class="custom-mood-color-dot ${c===mood.color?'selected':''}" style="background:${c};" onclick="selectCustomColor('${c}',this)"></div>`
    ).join('');
    dialog.style.display = 'block';
    dialog._editingKey = key;
    const saveBtn = dialog.querySelector('.modal-btn-primary');
    saveBtn.onclick = function() {
        const emoji = document.getElementById('custom-mood-emoji').value.trim();
        const label = document.getElementById('custom-mood-label').value.trim();
        if (!emoji || !label) { showNotification('请填写表情和名称', 'warning'); return; }
        const idx = customMoodOptions.findIndex(m => m.key === key);
        if (idx !== -1) customMoodOptions[idx] = { key, kaomoji: emoji, label, color: customMoodSelectedColor };
        saveCustomMoodOptions();
        closeCustomMoodDialog();
        saveBtn.onclick = null;
        renderMoodOptionsGrid(currentMoodSelection);
        showNotification('自定义心情已更新 ✦', 'success');
        if (typeof playSound === 'function') playSound('mood');
    };
};

function initMoodListeners() {
    const btnCalendar = document.getElementById('btn-view-calendar');
    const btnStats = document.getElementById('btn-view-stats');
    const btnTrash = document.getElementById('btn-view-trash');
    const viewCalendar = document.getElementById('mood-calendar-view');
    const viewStats = document.getElementById('mood-stats-view');
    const viewTrash = document.getElementById('mood-trash-view');

    if (btnCalendar && !btnCalendar.dataset.initialized) {
        btnCalendar.dataset.initialized = 'true';
        btnCalendar.addEventListener('click', () => {
            btnCalendar.classList.add('active');
            btnStats.classList.remove('active');
            btnTrash && btnTrash.classList.remove('active');
            viewCalendar.classList.remove('hidden-view');
            viewStats.classList.add('hidden-view');
            viewTrash && viewTrash.classList.add('hidden-view');
        });
    }

    if (btnStats && !btnStats.dataset.initialized) {
        btnStats.dataset.initialized = 'true';
        btnStats.addEventListener('click', () => {
            btnStats.classList.add('active');
            btnCalendar.classList.remove('active');
            viewStats.classList.remove('hidden-view');
            viewCalendar.classList.add('hidden-view');
            btnTrash && btnTrash.classList.remove('active');
            viewTrash && viewTrash.classList.add('hidden-view');
            renderMoodCalendar(); 
        });
    }

    if (btnTrash && !btnTrash.dataset.initialized) {
        btnTrash.dataset.initialized = 'true';
        btnTrash.addEventListener('click', () => {
            btnTrash.classList.add('active');
            btnCalendar.classList.remove('active');
            btnStats.classList.remove('active');
            viewTrash && viewTrash.classList.remove('hidden-view');
            viewCalendar && viewCalendar.classList.add('hidden-view');
            viewStats && viewStats.classList.add('hidden-view');
            renderMoodTrashList();
        });
    }

    const entryBtn = document.getElementById('mood-function');
    const modal = document.getElementById('mood-modal');
    
    if (entryBtn && !entryBtn.dataset.initialized) {
        entryBtn.dataset.initialized = 'true';
        const newBtn = entryBtn.cloneNode(true);
        entryBtn.parentNode.replaceChild(newBtn, entryBtn);
        
        newBtn.addEventListener('click', () => {
            if (typeof window.openMoodModal === 'function') window.openMoodModal({ fromAdvanced: true });
            else {
                const advModal = document.getElementById('advanced-modal');
                if (advModal) hideModal(advModal);
                setTimeout(() => { renderMoodCalendar(); showModal(modal); }, 150);
            }
        });
    }

    const closeMoodBtn = document.getElementById('close-mood');
    if (closeMoodBtn && !closeMoodBtn.dataset.initialized) {
        closeMoodBtn.dataset.initialized = 'true';
        closeMoodBtn.addEventListener('click', () => {
            if (typeof window.closeMoodModal === 'function') window.closeMoodModal();
            else hideModal(modal);
        });
    }

    const exportMoodBtn = document.getElementById('mood-export-btn');
    const importMoodBtn = document.getElementById('mood-import-btn');
    const importFileInput = document.getElementById('mood-import-file-input');

    if (exportMoodBtn && !exportMoodBtn.dataset.initialized) {
        exportMoodBtn.dataset.initialized = 'true';
        exportMoodBtn.addEventListener('click', () => {
            if (typeof exportMoodBackup === 'function') exportMoodBackup();
        });
    }

    if (importMoodBtn && !importMoodBtn.dataset.initialized) {
        importMoodBtn.dataset.initialized = 'true';
        importMoodBtn.addEventListener('click', () => {
            importFileInput?.click();
        });
    }

    if (importFileInput && !importFileInput.dataset.initialized) {
        importFileInput.dataset.initialized = 'true';
        importFileInput.addEventListener('change', async (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            try {
                await importMoodBackupFile(file);
            } finally {
                importFileInput.value = '';
            }
        });
    }
    
    const cancelMoodBtn = document.getElementById('cancel-mood-edit');
    if (cancelMoodBtn && !cancelMoodBtn.dataset.initialized) {
        cancelMoodBtn.dataset.initialized = 'true';
        cancelMoodBtn.addEventListener('click', closeMoodOverlay);
    }

    const overlay = document.getElementById('mood-selector-overlay');
    if (overlay && !overlay.dataset.initialized) {
        overlay.dataset.initialized = 'true';
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                closeMoodOverlay();
            }
        });
    }

    const prevMonthBtn = document.getElementById('prev-month');
    if (prevMonthBtn && !prevMonthBtn.dataset.initialized) {
        prevMonthBtn.dataset.initialized = 'true';
        prevMonthBtn.addEventListener('click', () => {
            const y = currentCalendarDate.getFullYear();
            const m = currentCalendarDate.getMonth();
            currentCalendarDate = new Date(y, m - 1, 1);
            renderMoodCalendar();
        });
    }
    
    const nextMonthBtn = document.getElementById('next-month');
    if (nextMonthBtn && !nextMonthBtn.dataset.initialized) {
        nextMonthBtn.dataset.initialized = 'true';
        nextMonthBtn.addEventListener('click', () => {
            const y = currentCalendarDate.getFullYear();
            const m = currentCalendarDate.getMonth();
            currentCalendarDate = new Date(y, m + 1, 1);
            renderMoodCalendar();
        });
    }
}
