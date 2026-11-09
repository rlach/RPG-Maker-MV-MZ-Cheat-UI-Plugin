import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';

/** Kiki's _Menu/_Memo family, RJ340674 MV 1.0 and RJ326822 MV 1.0
 * (unversioned plugins, _IconText/_Touch and earlier _Icon variants).
 * Commands and recollection unlocks use database names as identifiers.
 * Keep those identifiers native while translating drawing and request metadata.
 */
export class ElleMenuTranslator extends SourceTextCatalogTranslator {
    constructor() {
        super();
        this.logicPrototypes = new WeakSet();
    }
    getPluginName() {
        return '_Menu';
    }
    getPluginLabel() {
        return 'Kiki menus and requests (MV)';
    }
    getCacheType() {
        return 'plugin_elle_menu';
    }
    detectPlugin() {
        return (
            ['_Menu', '_Memo', '_Objects'].every((name) => this.findPluginEntry(name)?.status) &&
            ['_IconText', '_Icon'].some((name) => this.findPluginEntry(name)?.status)
        );
    }
    getSourcePluginNames() {
        return [
            '_Menu',
            '_Memo',
            '_IconText',
            '_IconButton',
            '_Icon',
            '_AddOption',
            '_SceneItemListEx',
            '_Objects',
            '_Global',
            '_HTitle',
            '_HChoice',
            '_Shooting',
        ];
    }
    async collectAdditionalTexts() {
        const response = await fetch('data/Armors.json');
        if (!response.ok) throw new Error(`Cannot read request data: ${response.status}`);
        const armors = await response.json();
        for (const item of armors) {
            if (!item?.note?.includes('<MemoCommand>')) continue;
            for (const match of item.note.matchAll(/<(?:Title|Text|Note):([^>]+)>/g)) {
                const text = match[1];
                this.entries.set(text, { text });
                for (const line of text.split('\n'))
                    if (line) this.entries.set(line, { text: line });
            }
        }
        // CBR status scripts obtain their display labels from variable names.
        const systemResponse = await fetch('data/System.json');
        if (!systemResponse.ok)
            throw new Error(`Cannot read status labels: ${systemResponse.status}`);
        const system = await systemResponse.json();
        for (const text of system.variables)
            if (this.isUsableText(text)) this.entries.set(text, { text });
    }
    installLogicHooks(prototype) {
        if (this.logicPrototypes.has(prototype)) return;
        this.logicPrototypes.add(prototype);
        const original = prototype.callOkEvent;
        prototype.callOkEvent = function (...args) {
            const ownItem = Object.getOwnPropertyDescriptor(this, 'item');
            const getItem = this.item;
            this.item = function () {
                const item = getItem.call(this);
                return item?._translateOriginal?.name
                    ? { ...item, name: item._translateOriginal.name }
                    : item;
            };
            try {
                return original.apply(this, args);
            } finally {
                if (ownItem) Object.defineProperty(this, 'item', ownItem);
                else delete this.item;
            }
        };
        if (Object.prototype.hasOwnProperty.call(prototype, 'isEnabled')) {
            const enabled = prototype.isEnabled;
            prototype.isEnabled = function (item) {
                return enabled.call(
                    this,
                    item?._translateOriginal?.name
                        ? { ...item, name: item._translateOriginal.name }
                        : item
                );
            };
        }
    }
    enablePluginTranslation() {
        if (
            !window.Window_MenuEx?.prototype.callOkEvent ||
            !window.Scene_Map?.prototype.createKaisouWindow ||
            !window.Game_System?.prototype.upHParamByItemName
        )
            return false;
        if (!super.enablePluginTranslation()) return false;
        this.installLogicHooks(window.Window_MenuEx.prototype);
        const translator = this;
        const create = window.Scene_Map.prototype.createKaisouWindow;
        window.Scene_Map.prototype.createKaisouWindow = function (...args) {
            const result = create.apply(this, args);
            translator.installLogicHooks(Object.getPrototypeOf(this._kaisouWindow));
            return result;
        };
        const system = window.Game_System.prototype;
        const upParameters = system.upHParamByItemName;
        const excludesPantyFlash = upParameters.toString().includes('パンチラ');
        system.upHParamByItemName = function (name) {
            // The event calls this later, after the menu's dispatch has ended.
            if (excludesPantyFlash && name === 'パンチラ') return null;
            const item = window.$dataItems.find(
                (entry) => entry && (entry._translateOriginal?.name ?? entry.name) === name
            );
            return upParameters.call(this, item ? item.name : name);
        };
        const convert = window.Window_Base.prototype.convertEscapeCharacters;
        window.Window_Base.prototype.convertEscapeCharacters = function (...args) {
            // Older builds expand random dialogue, script values and item/map names
            // here, after the normal message/cache lookup has already happened.
            return translator.resolveText(convert.apply(this, args), translator.getRuntime());
        };
        return true;
    }
}
