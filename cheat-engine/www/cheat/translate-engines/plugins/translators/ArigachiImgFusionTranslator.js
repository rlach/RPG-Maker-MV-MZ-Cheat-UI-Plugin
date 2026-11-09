import { BasePluginTranslator } from '../BasePluginTranslator.js';

// Arigachi Mesugachi Saga EA1.00 (MV), CBR_imgFusion. Equipment names are
// copied into variables and later interpolated into image filenames. Resolve
// only those asset arguments, leaving variables and equipment display intact.
const EQUIPMENT_SLOTS = new Map([
    [3, 5],
    [4, 6],
    [5, 4],
    [6, 8],
    [7, 7],
    [8, 2],
    [9, 3],
    [11, 9],
    [12, 1],
    [13, 10],
    [14, 0],
    [258, 7],
    [259, 5],
]);

export class ArigachiImgFusionTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'CBR_imgFusion';
    }
    getPluginLabel() {
        return 'Arigachi equipment image fusion compatibility';
    }
    getCacheType() {
        return 'plugin_arigachi_img_fusion';
    }
    detectPlugin() {
        return (
            super.detectPlugin() &&
            [window.$dataSystem?.gameTitle, window.document?.title].some((title) =>
                title?.includes('アリガチメスガチサーガ')
            )
        );
    }
    resolveEquipmentName(value, variableId, runtime) {
        if (typeof value !== 'string') return value;
        const slot = EQUIPMENT_SLOTS.get(variableId);
        const equipped = slot === undefined ? null : window.$gameParty.members()[0]?.equips()[slot];
        if (equipped?.name === value && equipped._translateOriginal?.name)
            return equipped._translateOriginal.name;

        // Variables can retain previous equipment (for example after stripping).
        // Use exact database/cache matches and reject ambiguous reverse matches.
        const originals = new Set();
        for (const [type, data] of [
            ['weapon_name', window.$dataWeapons],
            ['armor_name', window.$dataArmors],
        ]) {
            for (const item of data || []) {
                if (!item) continue;
                const source = item._translateOriginal?.name ?? item.name;
                if (source === value) return value;
                const translated = runtime.translationCache.get(runtime.getCacheKey(source, type));
                if (item.name === value || translated === value) originals.add(source);
            }
        }
        return originals.size === 1 ? [...originals][0] : value;
    }
    enablePluginTranslation() {
        if (typeof window.CBR?.['画像合成'] !== 'function') return false;
        const translator = this;
        const original = window.CBR['画像合成'];
        window.CBR['画像合成'] = function (images, ...args) {
            const runtime = translator.getRuntime();
            if (!translator.isRuntimeTranslationActive(runtime))
                return original.call(this, images, ...args);
            const resolved = images.map((image) =>
                image.replace(/\\V\[(\d+)\]/g, (tag, id) => {
                    const variableId = Number(id);
                    // Other fusion variables hold directory IDs and layer prefixes.
                    if (!EQUIPMENT_SLOTS.has(variableId) && variableId !== 15) return tag;
                    return translator.resolveEquipmentName(
                        window.$gameVariables.value(variableId),
                        variableId,
                        runtime
                    );
                })
            );
            return original.call(this, resolved, ...args);
        };
        return true;
    }
}
