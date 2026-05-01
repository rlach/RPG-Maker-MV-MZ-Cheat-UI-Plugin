import { KeyValueStorage } from './KeyValueStorage.js';

const SETTINGS_FILE_PATH = './www/cheat-settings/settings.json';
const TRANSLATE_ON_THE_FLY_FILE_PATH = './www/cheat-settings/translate-on-the-fly.json';

const LEGACY_SETTINGS_FILES = Object.freeze({
    ui: './www/cheat-settings/ui.json',
    textSpeed: './www/cheat-settings/textspeed.json',
    gameSpeed: './www/cheat-settings/gameSpeed.json',
    alwaysDash: './www/cheat-settings/alwaysdash.json',
});

let migrationDone = false;

function normalizeObject(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return {};
    }
    return value;
}

function parseMaybeJson(value) {
    if (typeof value !== 'string') {
        return null;
    }

    try {
        const parsed = JSON.parse(value);
        return normalizeObject(parsed);
    } catch (_error) {
        return null;
    }
}

function unwrapLegacyDataContainer(rawData) {
    const normalized = normalizeObject(rawData);
    const wrapped = normalized.data;

    if (typeof wrapped === 'string') {
        const parsed = parseMaybeJson(wrapped);
        if (parsed) {
            return parsed;
        }
    }

    if (wrapped && typeof wrapped === 'object' && !Array.isArray(wrapped)) {
        return normalizeObject(wrapped);
    }

    return normalized;
}

function readSettingsObject(storage) {
    return unwrapLegacyDataContainer(storage.getAll());
}

function writeSettingsObject(storage, data) {
    storage.setAll(normalizeObject(data));
}

function assignIfMissing(target, key, value) {
    if (target[key] === undefined && value !== undefined) {
        target[key] = value;
    }
}

function migrateLegacySettingsFiles(settings) {
    const fs = require('fs');

    const uiStorage = new KeyValueStorage(LEGACY_SETTINGS_FILES.ui);
    const uiData = unwrapLegacyDataContainer(uiStorage.getAll());
    const nextUi = {};
    if (Object.prototype.hasOwnProperty.call(uiData, 'openInSeparateWindow')) {
        nextUi.openInSeparateWindow = !!uiData.openInSeparateWindow;
    }
    if (
        uiData.overlaySize &&
        typeof uiData.overlaySize === 'object' &&
        Number.isFinite(uiData.overlaySize.width) &&
        Number.isFinite(uiData.overlaySize.height)
    ) {
        nextUi.overlaySize = {
            width: uiData.overlaySize.width,
            height: uiData.overlaySize.height,
        };
    }
    if (Object.keys(nextUi).length > 0) {
        assignIfMissing(settings, 'ui', nextUi);
    }

    const textSpeedStorage = new KeyValueStorage(LEGACY_SETTINGS_FILES.textSpeed);
    const textSpeedData = unwrapLegacyDataContainer(textSpeedStorage.getAll());
    if (Object.prototype.hasOwnProperty.call(textSpeedData, 'textSpeed')) {
        assignIfMissing(settings, 'textSpeed', textSpeedData.textSpeed);
    }

    const alwaysDashStorage = new KeyValueStorage(LEGACY_SETTINGS_FILES.alwaysDash);
    const alwaysDashData = unwrapLegacyDataContainer(alwaysDashStorage.getAll());
    if (Object.prototype.hasOwnProperty.call(alwaysDashData, 'alwaysDash')) {
        assignIfMissing(settings, 'alwaysDash', !!alwaysDashData.alwaysDash);
    }

    const gameSpeedStorage = new KeyValueStorage(LEGACY_SETTINGS_FILES.gameSpeed);
    const gameSpeedData = unwrapLegacyDataContainer(gameSpeedStorage.getAll());
    const hasRate = Object.prototype.hasOwnProperty.call(gameSpeedData, 'rate');
    const hasSceneOption = Object.prototype.hasOwnProperty.call(gameSpeedData, 'sceneOption');
    if (hasRate || hasSceneOption) {
        const migratedGameSpeed = {
            ...normalizeObject(settings.gameSpeed),
        };
        if (hasRate) {
            migratedGameSpeed.rate = gameSpeedData.rate;
        }
        if (hasSceneOption) {
            migratedGameSpeed.sceneOption = gameSpeedData.sceneOption;
        }
        assignIfMissing(settings, 'gameSpeed', migratedGameSpeed);
    }

    Object.values(LEGACY_SETTINGS_FILES).forEach((filePath) => {
        try {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        } catch (error) {
            console.warn(
                '[UnifiedSettings] Failed to remove legacy settings file:',
                filePath,
                error
            );
        }
    });
}

function migrateTranslateOnTheFlyFile() {
    const tofStorage = new KeyValueStorage(TRANSLATE_ON_THE_FLY_FILE_PATH);
    const raw = normalizeObject(tofStorage.getAll());

    if (!Object.prototype.hasOwnProperty.call(raw, 'data')) {
        return;
    }

    const unwrapped = unwrapLegacyDataContainer(raw);
    const merged = { ...unwrapped, ...raw };
    delete merged.data;
    tofStorage.setAll(merged);
}

export function ensureSettingsMigration() {
    if (migrationDone) {
        return;
    }

    migrationDone = true;

    try {
        const storage = new KeyValueStorage(SETTINGS_FILE_PATH);
        const settings = readSettingsObject(storage);
        migrateLegacySettingsFiles(settings);
        writeSettingsObject(storage, settings);
    } catch (error) {
        console.warn('[UnifiedSettings] Failed to migrate unified settings:', error);
    }

    try {
        migrateTranslateOnTheFlyFile();
    } catch (error) {
        console.warn('[UnifiedSettings] Failed to migrate translate-on-the-fly settings:', error);
    }
}

export function readUnifiedSettings() {
    ensureSettingsMigration();
    const storage = new KeyValueStorage(SETTINGS_FILE_PATH);
    return readSettingsObject(storage);
}

export function writeUnifiedSettings(data) {
    ensureSettingsMigration();
    const storage = new KeyValueStorage(SETTINGS_FILE_PATH);
    writeSettingsObject(storage, data);
}

export function getUnifiedSetting(key, defaultValue) {
    const settings = readUnifiedSettings();
    return Object.prototype.hasOwnProperty.call(settings, key) ? settings[key] : defaultValue;
}

export function setUnifiedSetting(key, value) {
    const settings = readUnifiedSettings();
    settings[key] = value;
    writeUnifiedSettings(settings);
}
