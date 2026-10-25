import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';
import { parseJsonSafely, walkNestedJsonLike } from './TranslatorHelpers.js';

const MODULES = [
    'kzmz_SaveMenu',
    'kzmz_MenuExWindow',
    'kzmz_MenuStatus',
    'EUL_Pack03_MenuEquip',
    'EUL_Pack04_MapHud',
    'EUL_Pack05_MapTravel',
    'EUL_Pack06_Utility',
    'EUL_Pack07_VisualFix',
];

/**
 * kzmz_SaveMenu / kzmz_MenuExWindow (MZ, unversioned SaveMenu, MenuExWindow v1.00)
 * and EUL packs bundled with RJ01664771 v1.02 (Utility v1.3.7).
 * Save/menu labels are evaluated JS expressions in nested JSON parameters.
 * EUL TODOs use selected switch names; special-status prose uses a private
 * sprite that tokenizes and fits text before drawing. Translate before layout.
 * Bitmap assets (HUD backgrounds, statistics labels, badges) are not text entries.
 */
export class EulKzmzUiTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'EUL_Kzmz_UI';
    }
    getPluginAliases() {
        return MODULES;
    }
    getPluginLabel() {
        return 'EUL / kzmz save, menu and overlays';
    }
    getCacheType() {
        return 'plugin_eul_kzmz_ui';
    }

    collectParameterTexts(parameters) {
        walkNestedJsonLike(parameters, (value, { path }) => {
            if (!this.isUsableText(value) || parseJsonSafely(value, value) !== value) return;
            const field = ([...path].reverse().find((part) => !/^\d+$/.test(part)) || '').replace(
                /^M\d+_/,
                ''
            );
            if (/^(?:data|value|DataEval|ItemDrawScript)$/i.test(field)) {
                const catalog = this.extractCatalog(value);
                for (const entry of catalog.entries)
                    if (!this.entries.has(entry.text)) this.entries.set(entry.text, entry);
            } else if (
                /^(?:Text|titleText|LabelText|CloseText|Labels|message|HelpText|commandName)$/i.test(
                    field
                )
            ) {
                this.entries.set(value, { text: value });
            }
        });
    }

    async collectAdditionalTexts() {
        const utility = this.findPluginEntry('EUL_Pack06_Utility');
        if (!utility?.status) return;
        let system = window.$dataSystem;
        if (!Array.isArray(system?.switches)) {
            const response = await fetch('data/System.json');
            if (!response.ok) throw new Error(`Cannot read System.json: ${response.status}`);
            system = parseJsonSafely(await response.text());
            if (!Array.isArray(system?.switches)) throw new Error('Invalid System.json switches');
        }
        const parameters = utility.parameters;
        const ids = parseJsonSafely(parameters.M01_targetSwitches, []).map((value) =>
            Number(String(value).match(/^\s*(\d+)/)?.[1] || 0)
        );
        const prefix = parameters.M01_todoPrefix || '[T]';
        if (parameters.M01_autoTodo !== 'false')
            system.switches.forEach((name, id) => {
                if (name?.trim().startsWith(prefix)) ids.push(id);
            });
        for (const id of new Set(ids)) {
            const name = system.switches[id]?.trim();
            if (!name) continue;
            const text = name.startsWith(prefix) ? name.slice(prefix.length).trim() : name;
            if (text) this.entries.set(text, { text });
        }
    }

    hookStatusOverlays(scene) {
        for (const sprite of scene._eulidEroStatusTextOverlays || []) {
            const prototype = Object.getPrototypeOf(sprite);
            this.overlayPrototypes ??= new WeakSet();
            if (!this.overlayPrototypes.has(prototype)) {
                this.overlayPrototypes.add(prototype);
                const translator = this;
                const convert = prototype.convertedText;
                prototype.convertedText = function (...args) {
                    const source = this._data.text;
                    this._data.text = translator.resolveText(
                        source,
                        translator.getRuntime(),
                        0,
                        false
                    );
                    try {
                        return convert.apply(this, args);
                    } finally {
                        this._data.text = source;
                    }
                };
                const refresh = prototype.refresh;
                prototype.refresh = function (...args) {
                    translator.drawing++;
                    try {
                        return refresh.apply(this, args);
                    } finally {
                        translator.drawing--;
                    }
                };
            }
            sprite.refresh(true);
        }
    }

    enablePluginTranslation() {
        const statusPrototype = window.Scene_EroStatus?.prototype;
        if (
            this.findPluginEntry('EUL_Pack07_VisualFix')?.status &&
            typeof statusPrototype?.createEroStatusTextOverlays !== 'function'
        )
            return false;
        if (!super.enablePluginTranslation()) return false;
        if (typeof statusPrototype?.createEroStatusTextOverlays === 'function') {
            const create = statusPrototype.createEroStatusTextOverlays;
            const translator = this;
            statusPrototype.createEroStatusTextOverlays = function (...args) {
                const result = create.apply(this, args);
                translator.hookStatusOverlays(this);
                return result;
            };
            const scene = window.SceneManager?._scene;
            if (scene?._eulidEroStatusTextOverlays) this.hookStatusOverlays(scene);
        }
        return true;
    }
}
