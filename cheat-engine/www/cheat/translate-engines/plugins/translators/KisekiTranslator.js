import { BasePluginTranslator } from '../BasePluginTranslator.js';

const KISEKI_PATCH_FLAG = '__cheatKisekiSystemImagePatchApplied';

function normalizeSystemFileName(file) {
    const raw = typeof file === 'string' ? file.trim() : '';
    if (!raw) {
        return '';
    }

    return raw.replace(/(\.png_|\.rpgmvp|\.png)$/i, '');
}

function buildSystemCacheKeys(file) {
    const normalized = normalizeSystemFileName(file);
    if (!normalized) {
        return [];
    }

    return [`system/${normalized}`, `system/${normalized}.png`, `system/${normalized}.rpgmvp`];
}

function findCachedBaseTexture(file) {
    const cache = globalThis.PIXI?.utils?.BaseTextureCache;
    if (!cache) {
        return null;
    }

    const keys = buildSystemCacheKeys(file);
    for (const key of keys) {
        const texture = cache[key];
        if (texture) {
            return texture;
        }
    }

    return null;
}

function storeCachedBaseTexture(file, baseTexture) {
    const cache = globalThis.PIXI?.utils?.BaseTextureCache;
    if (!cache || !baseTexture) {
        return;
    }

    const keys = buildSystemCacheKeys(file);
    for (const key of keys) {
        cache[key] = baseTexture;
    }
}

function resolveBitmapBaseTexture(bitmap) {
    if (!bitmap) {
        return null;
    }

    if (bitmap.baseTexture) {
        return bitmap.baseTexture;
    }

    if (bitmap._image) {
        return new PIXI.BaseTexture(bitmap._image);
    }

    return null;
}

export class KisekiTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'kiseki';
    }

    getPluginLabel() {
        return 'kiseki';
    }

    detectPlugin() {
        if (super.detectPlugin()) {
            return true;
        }

        return typeof globalThis.Saba?.getSystemImage === 'function';
    }

    enablePluginTranslation() {
        const sabaNamespace = globalThis.Saba;
        if (!sabaNamespace || sabaNamespace[KISEKI_PATCH_FLAG]) {
            return false;
        }

        const originalGetSystemBaseTexture = sabaNamespace.getSystemBaseTexture;
        const originalGetSystemImage = sabaNamespace.getSystemImage;
        if (
            typeof originalGetSystemBaseTexture !== 'function' ||
            typeof originalGetSystemImage !== 'function'
        ) {
            return false;
        }

        sabaNamespace.getSystemBaseTexture = function (file) {
            const cachedBaseTexture = findCachedBaseTexture(file);
            if (cachedBaseTexture) {
                return cachedBaseTexture;
            }

            const normalizedFile = normalizeSystemFileName(file);
            if (!normalizedFile) {
                return originalGetSystemBaseTexture.call(this, file);
            }

            const bitmap = ImageManager.loadSystem(normalizedFile);
            const resolvedBaseTexture = resolveBitmapBaseTexture(bitmap);
            if (resolvedBaseTexture) {
                storeCachedBaseTexture(normalizedFile, resolvedBaseTexture);
                storeCachedBaseTexture(file, resolvedBaseTexture);
                return resolvedBaseTexture;
            }

            return originalGetSystemBaseTexture.call(this, normalizedFile);
        };

        sabaNamespace.getSystemImage = function (file) {
            const baseTexture = sabaNamespace.getSystemBaseTexture(file);
            if (!baseTexture) {
                console.warn('[KisekiTranslator] Missing system base texture', file);
                return new PIXI.Sprite();
            }

            return new PIXI.Sprite(new PIXI.Texture(baseTexture));
        };

        sabaNamespace[KISEKI_PATCH_FLAG] = true;
        console.log('[KisekiTranslator] Installed compatibility patch for system images');
        return true;
    }
}
