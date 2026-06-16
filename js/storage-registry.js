/**
 * 存储登记表：所有模块的持久化位置统一写在这里。
 * 备份/恢复只认这张表；新增模块必须登记，否则只能进入“其他未分类”。
 */
(function (global) {
    'use strict';

    var VERSION = '2026-06-16.final-registry-v1';

    function clone(obj) {
        try { return JSON.parse(JSON.stringify(obj)); } catch (e) { return obj; }
    }

    function hasPrefix(key, prefixes) {
        if (!key || !prefixes) return false;
        for (var i = 0; i < prefixes.length; i++) {
            if (prefixes[i] && key.indexOf(prefixes[i]) === 0) return true;
        }
        return false;
    }

    function hasNeedle(key, needles) {
        if (!key || !needles) return false;
        for (var i = 0; i < needles.length; i++) {
            if (needles[i] && key.indexOf(needles[i]) !== -1) return true;
        }
        return false;
    }

    function appPrefix() {
        return (typeof global.APP_PREFIX === 'string' && global.APP_PREFIX) ? global.APP_PREFIX : 'CHAT_APP_V3_';
    }

    function currentSessionPrefix() {
        return appPrefix() + ((typeof global.SESSION_ID === 'string' && global.SESSION_ID) ? global.SESSION_ID + '_' : '');
    }

    var NATIVE_INDEXED_DB = {
        ShopDB: {
            version: 2,
            label: '商城 / 礼物柜原生数据库',
            stores: {
                products: { keyPath: 'key', category: 'shop', label: '商品、购物车、订单、礼物柜' },
                images: { keyPath: 'productId', category: 'shop', label: '商品图片' }
            }
        },
        MomentsVideoDB: {
            version: 2,
            label: '朋友圈媒体原生数据库',
            stores: {
                videos: { keyPath: null, category: 'moments', label: '朋友圈视频' },
                images: { keyPath: null, category: 'moments', label: '朋友圈大图' }
            }
        }
    };

    var CATEGORIES = [
        {
            id: 'chat', label: '聊天记录 / 会话 / 红包', flag: 'inclMsgs',
            localforageNeedles: ['chatMessages', 'sessionList', 'lastSessionId', 'chatSettings', 'showPartnerNameInChat', 'envelopeData', 'pending_envelope', 'transferData'],
            localforagePrefixes: ['gca_'],
            localStorageNeedles: ['groupChatSettings'],
            localStoragePrefixes: []
        },
        {
            id: 'replies', label: '回复 / 拍一拍 / 氛围', flag: 'inclCustom',
            localforageNeedles: ['customReplies', 'customPokes', 'customStatuses', 'customMottos', 'customIntros', 'customEmojis', 'customReplyGroups', 'customPokeGroups', 'customStatusGroups', 'myPokes'],
            localStorageNeedles: ['disabledReplyItems', 'pokeSym_my', 'pokeSym_partner', 'pokeSym_my_custom', 'pokeSym_partner_custom']
        },
        {
            id: 'stickers', label: '表情库 / 颜文字 / 贴纸', flag: 'inclStickers',
            localforageNeedles: ['stickerLibrary', 'myStickerLibrary', 'customStickerGroups', 'kaomojiLibrary', 'kaomojiGroups'],
            localStorageNeedles: ['disabledStickerItems']
        },
        {
            id: 'ann', label: '纪念日', flag: 'inclAnn',
            localforageNeedles: ['anniversaries', 'annHeaderBg_'],
            localStorageNeedles: []
        },
        {
            id: 'mood', label: '心晴手账', flag: 'inclSet',
            localforageNeedles: ['moodCalendar', 'customMoodOptions', 'moodTrash'],
            localStorageNeedles: []
        },
        {
            id: 'themes', label: '主题 / 外观 / 聊天气泡 / 头像背景', flag: 'inclThemes',
            localforageNeedles: ['customThemes', 'themeSchemes', 'backgroundGallery', 'chatBackground', 'partnerAvatar', 'myAvatar', 'partnerPersonas', 'playerCover', 'customSongs'],
            localStorageNeedles: ['immersive_mode', 'tiShowAvatar', 'tiCustomText'],
            localStoragePrefixes: []
        },
        {
            id: 'dg', label: '每日公告 / 运势 / 天气', flag: 'inclDg',
            localforageNeedles: ['weekly_fortune', 'daily_fortune_3'],
            localStorageNeedles: ['dg_custom_data', 'dg_status_pool', 'weekly_fortune', 'daily_fortune', 'dg_header_bg', 'dg_overlay_bg', 'dg_overlay_bg_tint', '_dgUserSalt', 'dailyGreetingShown'],
            localStoragePrefixes: ['customWeather_', 'dailyFortuneNotes_', 'diviHistory_']
        },
        {
            id: 'moments', label: '朋友圈 / 相册 / 访客 / 草稿', flag: 'inclMsgs',
            localforageNeedles: ['moments', 'momentsData', 'moments_lf', 'momentsMedia', 'momentsAlbum', 'moments_friends'],
            localStorageNeedles: ['moments', 'moments_data', 'moments_visitor_records', 'moments_visitor_last_online', 'moments_visitor_last_viewed_count', 'publishDraft', 'profile_me', 'profile_partner'],
            nativeIndexedDBNeedles: ['MomentsVideoDB.videos', 'MomentsVideoDB.images']
        },
        {
            id: 'shop', label: '商城 / 购物车 / 订单 / 礼物柜 / 自动下单', flag: 'inclSet',
            localforageNeedles: ['shop', 'giftCabinet'],
            localStorageNeedles: ['shop_', 'ShopApp', 'giftCabinet', 'shopGiftCabinet', 'shopBalance', 'shopSearchHistory', 'shopAutoBuySettings'],
            localStoragePrefixes: ['shop_'],
            nativeIndexedDBNeedles: ['ShopDB.products', 'ShopDB.images']
        },
        {
            id: 'media', label: '媒体库 / 语音 / 视频 / 链接卡片 / 通话', flag: 'inclSet',
            localforageNeedles: ['mediaLibrary', 'zcardMediaLibraryV1', 'customVoices', 'customVoiceGroups', 'voiceLibrary', 'videoLibrary', 'callBgImageData'],
            localStorageNeedles: ['mediaLibrary', 'zcardMediaLibraryV1', 'zcardMediaLibraryMetaV1', 'partnerVoiceChance', 'partnerVideoChance', 'chat_video_bubble_width', 'chat_video_bubble_height', 'callFeatureEnabled', 'callWindowPos', 'callWindowSize', 'callPillPos']
        },
        {
            id: 'tools', label: '地图 / 记账 / 日记 / 摸鱼', flag: 'inclSet',
            localforageNeedles: ['mapData', 'accountingRecords', 'accountingLabels', 'diaryTodos', 'diaryHabits', 'diaryHabitRecords', 'diaryPeriodRecords', 'diaryAnniversaries', 'diaryTodoCategories', 'moyuRecords', 'moyuLocations', 'moyuActivities', 'currentMoyuRecord', 'moyuUnread', 'moyuWorkSession'],
            localStorageNeedles: ['diaryPeriodLastReminderDate']
        },
        {
            id: 'home_pet_music', label: '首页 / 宠物 / 音游 / TA 的手机 / 火花', flag: 'inclSet',
            localforageNeedles: ['home_', 'profile_', 'playerCover', 'customSongs', 'spark', 'collections', 'tour_seen'],
            localStorageNeedles: ['home_', 'pixelPetGame', 'chat_streak_data', 'ta_phone_collections', 'dailyFortuneNotes_', 'diviHistory_v1', 'home_session_bind', 'home_avatar_sync', 'home_bg_sync', 'tiShowAvatar', 'tiCustomText'],
            localStoragePrefixes: ['home_', 'profile_', 'dailyFortuneNotes_']
        },
        {
            id: 'system', label: '系统状态 / 兼容迁移标记', flag: 'inclSet',
            localforageNeedles: ['MIGRATION_V2_DONE', 'tour_seen'],
            localStorageNeedles: ['notifEnabled', 'pledge_accepted', 'dailyGreetingShown', 'BACKUP_V1_critical', 'BACKUP_V1_timestamp']
        },
        {
            id: 'other', label: '其他新增功能 / 未分类数据', catchAll: true,
            localforageNeedles: [], localStorageNeedles: [], nativeIndexedDBNeedles: []
        }
    ];

    function flagAllows(cat, flags) {
        if (!cat || cat.catchAll) return true;
        if (!flags || !cat.flag) return true;
        if (Object.prototype.hasOwnProperty.call(flags, cat.flag)) return !!flags[cat.flag];
        return true;
    }

    function matchCategory(type, key, cat) {
        if (!cat || cat.catchAll) return false;
        if (type === 'localforage') {
            return hasNeedle(key, cat.localforageNeedles) || hasPrefix(key, cat.localforagePrefixes);
        }
        if (type === 'localStorage') {
            return hasNeedle(key, cat.localStorageNeedles) || hasPrefix(key, cat.localStoragePrefixes);
        }
        if (type === 'nativeIndexedDB') {
            return hasNeedle(key, cat.nativeIndexedDBNeedles);
        }
        return false;
    }

    function classify(type, key) {
        var ids = [];
        for (var i = 0; i < CATEGORIES.length; i++) {
            if (matchCategory(type, key, CATEGORIES[i])) ids.push(CATEGORIES[i].id);
        }
        if (!ids.length) ids.push('other');
        return ids;
    }

    function shouldIncludeKey(type, key, flags) {
        if (!key) return false;
        var matchedAny = false;
        for (var i = 0; i < CATEGORIES.length; i++) {
            var cat = CATEGORIES[i];
            if (cat.catchAll) continue;
            if (matchCategory(type, key, cat)) {
                matchedAny = true;
                if (flagAllows(cat, flags)) return true;
            }
        }
        if (!matchedAny) {
            var other = CATEGORIES.filter(function(c) { return c.id === 'other'; })[0];
            return flagAllows(other, flags);
        }
        return false;
    }

    function shouldIncludeNativePath(path, flags) {
        return shouldIncludeKey('nativeIndexedDB', path, flags);
    }

    function categoryList() {
        return CATEGORIES.map(function (c) {
            var out = clone(c);
            // 兼容旧备份筛选函数字段名
            out.indexedDBNeedles = out.localforageNeedles || [];
            return out;
        });
    }

    function nativeSpecs() {
        var out = {};
        Object.keys(NATIVE_INDEXED_DB).forEach(function (dbName) {
            var db = NATIVE_INDEXED_DB[dbName];
            out[dbName] = { version: db.version, stores: {} };
            Object.keys(db.stores || {}).forEach(function (storeName) {
                var s = db.stores[storeName] || {};
                out[dbName].stores[storeName] = { keyPath: s.keyPath || null };
            });
        });
        return out;
    }

    function manifest() {
        return {
            version: VERSION,
            appPrefix: appPrefix(),
            currentSessionPrefix: currentSessionPrefix(),
            categories: categoryList(),
            nativeIndexedDB: clone(NATIVE_INDEXED_DB)
        };
    }

    global.ChatStorageRegistry = {
        version: VERSION,
        categories: CATEGORIES,
        listCategories: categoryList,
        getNativeIndexedDBSpecs: nativeSpecs,
        getManifest: manifest,
        classify: classify,
        shouldIncludeKey: shouldIncludeKey,
        shouldIncludeNativePath: shouldIncludeNativePath
    };
})(typeof window !== 'undefined' ? window : this);
