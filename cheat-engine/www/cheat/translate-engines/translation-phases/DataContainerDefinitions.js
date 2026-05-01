const MAP_DISPLAY_NAME_CACHE = new Map();

function readMapDisplayNameById(mapId) {
    const safeMapId = Number(mapId) || 0;
    if (safeMapId <= 0) {
        return '';
    }

    if (MAP_DISPLAY_NAME_CACHE.has(safeMapId)) {
        return MAP_DISPLAY_NAME_CACHE.get(safeMapId) || '';
    }

    let displayName = '';

    try {
        if (typeof require !== 'function') {
            MAP_DISPLAY_NAME_CACHE.set(safeMapId, displayName);
            return displayName;
        }

        const fs = require('fs');
        const path = require('path');
        const mapFileName = `Map${String(safeMapId).padStart(3, '0')}.json`;
        const cwd = typeof process !== 'undefined' && process ? process.cwd() : '.';
        const candidatePaths = [
            path.join(cwd, 'data', mapFileName),
            path.join(cwd, 'www', 'data', mapFileName),
        ];

        let filePath = '';
        for (const candidatePath of candidatePaths) {
            if (fs.existsSync(candidatePath)) {
                filePath = candidatePath;
                break;
            }
        }

        if (filePath) {
            const rawJson = fs.readFileSync(filePath, 'utf-8');
            const parsed = JSON.parse(rawJson);
            if (parsed && typeof parsed.displayName === 'string') {
                displayName = parsed.displayName;
            }
        }
    } catch (error) {
        if (!readMapDisplayNameById._readFailureWarned) {
            readMapDisplayNameById._readFailureWarned = true;
            console.warn(
                '[TranslateOnTheFly] Failed to read map displayName from map files; map displayName translation key collection will be partial',
                error
            );
        }
    }

    MAP_DISPLAY_NAME_CACHE.set(safeMapId, displayName);
    return displayName;
}

function buildMapsTranslationContainer() {
    if (!Array.isArray(window.$dataMapInfos)) {
        return window.$dataMapInfos;
    }

    const container = [null];

    for (let i = 1; i < window.$dataMapInfos.length; i++) {
        const mapInfo = window.$dataMapInfos[i];
        if (!mapInfo) {
            continue;
        }

        container.push(mapInfo);

        const mapInfoName = typeof mapInfo.name === 'string' ? mapInfo.name : '';
        const displayName = readMapDisplayNameById(mapInfo.id);
        if (typeof displayName !== 'string' || displayName.trim() === '') {
            continue;
        }

        // Reuse map_name key type and avoid duplicate key generation when names are identical.
        if (displayName === mapInfoName) {
            continue;
        }

        container.push({
            id: `map_display_name_${mapInfo.id}`,
            name: displayName,
            _translateSyntheticMapDisplayName: true,
        });
    }

    return container;
}

export const DATA_CONTAINER_TRANSLATION_DEFINITIONS = Object.freeze([
    {
        kind: 'items',
        cachePrefix: 'item',
        fields: ['name', 'description', 'note'],
        getContainer: () => window.$dataItems,
    },
    {
        kind: 'skills',
        cachePrefix: 'skill',
        fields: ['name', 'description', 'message1', 'message2'],
        getContainer: () => window.$dataSkills,
    },
    {
        kind: 'classes',
        cachePrefix: 'class',
        fields: ['name'],
        requiresReapplyOnLoad: true,
        getContainer: () => window.$dataClasses,
    },
    {
        kind: 'enemies',
        cachePrefix: 'enemy',
        fields: ['name'],
        requiresReapplyOnLoad: true,
        getContainer: () => window.$dataEnemies,
    },
    {
        kind: 'armors',
        cachePrefix: 'armor',
        fields: ['name', 'description'],
        getContainer: () => window.$dataArmors,
    },
    {
        kind: 'weapons',
        cachePrefix: 'weapon',
        fields: ['name', 'description'],
        getContainer: () => window.$dataWeapons,
    },
    {
        kind: 'maps',
        cachePrefix: 'map',
        fields: ['name'],
        getContainer: () => buildMapsTranslationContainer(),
    },
]);
