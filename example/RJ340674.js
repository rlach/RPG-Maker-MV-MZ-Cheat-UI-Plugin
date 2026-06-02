/**
 * RJ340674 game-specific translator for _Menu.js
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

const CACHE_TYPE = 'plugin_rj340674_menu';
const MENU_CALL_OK_PATCH_FLAG = '__CHEAT_RJ340674_MENU_CALL_OK_PATCHED__';
const HSTATUS_INIT_PATCH_FLAG = '__CHEAT_RJ340674_HSTATUS_INIT_PATCHED__';

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
        canonical: 'そうび',
        aliases: ['equip', 'equipment', 'gear'],
    },
    {
        canonical: '回想',
        aliases: ['recollection', 'memories', 'cg', 'scene'],
    },
    {
        canonical: 'Ｈステータス',
        aliases: ['h status', 'h-status', 'status', 'hstatus'],
    },
    {
        canonical: '依頼',
        aliases: ['request', 'requests', 'quest', 'quests', 'mission', 'missions'],
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

export class RJ340674Translator extends BasePluginTranslator {
    constructor() {
        super();
        this._originalPictureNames = [];
    }

    getPluginName() {
        return '_Menu';
    }

    getPluginLabel() {
        return 'RJ340674 _Menu';
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

        const pictureInfos = globalThis.CBR_eroStatus?.[0]?.p;
        if (!Array.isArray(pictureInfos) || pictureInfos.length === 0) {
            return;
        }

        this._originalPictureNames = pictureInfos.map((info) => String(info?.name || ''));
    }

    restoreOriginalPictureNames() {
        this.captureOriginalPictureNames();

        if (this._originalPictureNames.length === 0) {
            return;
        }

        const pictureInfos = globalThis.CBR_eroStatus?.[0]?.p;
        if (!Array.isArray(pictureInfos) || pictureInfos.length === 0) {
            return;
        }

        const count = Math.min(this._originalPictureNames.length, pictureInfos.length);
        for (let index = 0; index < count; index++) {
            const originalName = this._originalPictureNames[index];
            if (typeof originalName === 'string' && originalName !== '') {
                pictureInfos[index].name = originalName;
            }
        }
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
            console.warn(
                `[${this.getPluginLabel()}] Window_MenuEx.prototype.callOkEvent not found. Menu command translation patch will not be applied.`
            );
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
            console.warn(
                `[${this.getPluginLabel()}] Window_HStatus.prototype.initialize not found. HStatus picture translation patch will not be applied.`
            );
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
        // Second path of the patch doesn't work.
        // const hStatusPatched = this.installHStatusPicturePatch();

        return menuPatched; // && hStatusPatched;
    }
}
