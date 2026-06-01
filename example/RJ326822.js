/**
 * RJ326822 game-specific translator for _Menu.js
 *
 * Target:
 * - _Menu.js (MV)
 *
 * Fix scope:
 * - Keep Window_MenuEx command dispatch stable even when menu labels are translated.
 * - Preserve original H-status picture file names so image loads do not break.
 *
 * Usage:
 * - Copy this file to www/cheat-settings/translate-cache/js/
 */

const BasePluginTranslator = globalThis.__CheatBasePluginTranslator;

const CACHE_TYPE = 'plugin_rj326822_menu';
const MENU_CALL_OK_PATCH_FLAG = '__CHEAT_RJ326822_MENU_CALL_OK_PATCHED__';
const HSTATUS_INIT_PATCH_FLAG = '__CHEAT_RJ326822_HSTATUS_INIT_PATCHED__';

const COMMAND_ALIASES = [
    {
        canonical: 'オプション',
        aliases: ['options', 'option', 'config', 'settings'],
    },
    {
        canonical: 'アイテム',
        aliases: ['item', 'items', 'inventory'],
    },
    {
        canonical: 'セーブ',
        aliases: ['save', 'save game'],
    },
    {
        canonical: '回想',
        aliases: ['recollection', 'memories', 'cg', 'scene'],
    },
    {
        canonical: '称号',
        aliases: ['title', 'titles', 'achievement', 'achievements'],
    },
    {
        canonical: 'メモ',
        aliases: ['memo', 'notes', 'note'],
    },
];

function normalizeKey(value) {
    return String(value || '')
        .replaceAll('　', ' ')
        .trim()
        .toLowerCase()
        .replaceAll(/\s+/g, ' ')
        .replaceAll(/[_-]+/g, ' ')
        .replaceAll(/[^\p{L}\p{N}\s]/gu, '')
        .trim();
}

function findAliasMatch(name) {
    const key = normalizeKey(name);
    if (!key) {
        return null;
    }

    for (const rule of COMMAND_ALIASES) {
        if (normalizeKey(rule.canonical) === key) {
            return rule.canonical;
        }

        for (const alias of rule.aliases) {
            if (normalizeKey(alias) === key) {
                return rule.canonical;
            }
        }
    }

    return null;
}

export class RJ326822Translator extends BasePluginTranslator {
    constructor() {
        super();
        this._originalPictureNames = [];
    }

    getPluginName() {
        return '_Menu';
    }

    getPluginLabel() {
        return 'RJ326822 _Menu';
    }

    getCacheType() {
        return CACHE_TYPE;
    }

    detectPlugin() {
        return true;
    }

    captureOriginalPictureNames() {
        if (this._originalPictureNames.length > 0) {
            return;
        }

        const pictureInfo = globalThis.CBR_eroStatus?.[0]?.p?.[0];
        const name = String(pictureInfo?.name || '');
        if (name) {
            this._originalPictureNames = [name];
        }
    }

    restoreOriginalPictureNames() {
        this.captureOriginalPictureNames();

        if (this._originalPictureNames.length === 0) {
            return;
        }

        const pictureInfo = globalThis.CBR_eroStatus?.[0]?.p?.[0];
        if (!pictureInfo || typeof pictureInfo !== 'object') {
            return;
        }

        pictureInfo.name = this._originalPictureNames[0];
    }

    resolveCanonicalMenuName(currentName) {
        const directMatch = findAliasMatch(currentName);
        if (directMatch) {
            return directMatch;
        }

        const runtime = this.getRuntime();
        if (!runtime) {
            return null;
        }

        for (const rule of COMMAND_ALIASES) {
            const translated = this.resolveRuntimeTranslation(rule.canonical, runtime, 'item', {
                missValue: rule.canonical,
                harvestMissing: false,
            });

            if (normalizeKey(translated) === normalizeKey(currentName)) {
                return rule.canonical;
            }
        }

        return null;
    }

    installMenuCallOkPatch() {
        const menuProto = globalThis.Window_MenuEx?.prototype;
        if (!menuProto || typeof menuProto.callOkEvent !== 'function') {
            return false;
        }

        if (menuProto[MENU_CALL_OK_PATCH_FLAG]) {
            return true;
        }

        const originalCallOkEvent = menuProto.callOkEvent;
        const resolveCanonicalMenuName = this.resolveCanonicalMenuName.bind(this);
        const isUsableText = this.isUsableText.bind(this);

        menuProto.callOkEvent = function () {
            const item = typeof this.item === 'function' ? this.item() : null;
            if (!item || !isUsableText(item.name)) {
                return originalCallOkEvent.apply(this, arguments);
            }

            const sourceName = String(item.name);
            const canonicalName = resolveCanonicalMenuName(sourceName);
            if (!canonicalName || canonicalName === sourceName) {
                return originalCallOkEvent.apply(this, arguments);
            }

            item.name = canonicalName;
            try {
                return originalCallOkEvent.apply(this, arguments);
            } finally {
                item.name = sourceName;
            }
        };

        Object.defineProperty(menuProto, MENU_CALL_OK_PATCH_FLAG, {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });

        return true;
    }

    installHStatusPicturePatch() {
        const hStatusProto = globalThis.Window_HStatus?.prototype;
        if (!hStatusProto || typeof hStatusProto.initialize !== 'function') {
            return false;
        }

        if (hStatusProto[HSTATUS_INIT_PATCH_FLAG]) {
            return true;
        }

        const originalInitialize = hStatusProto.initialize;
        const restoreOriginalPictureNames = this.restoreOriginalPictureNames.bind(this);

        hStatusProto.initialize = function () {
            restoreOriginalPictureNames();
            return originalInitialize.apply(this, arguments);
        };

        Object.defineProperty(hStatusProto, HSTATUS_INIT_PATCH_FLAG, {
            value: true,
            configurable: true,
            enumerable: false,
            writable: false,
        });

        return true;
    }

    enablePluginTranslation() {
        this.captureOriginalPictureNames();

        const menuPatched = this.installMenuCallOkPatch();
        const hStatusPatched = this.installHStatusPicturePatch();

        return menuPatched && hStatusPatched;
    }
}