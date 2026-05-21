/**
 * Custom Translator Loader – dynamically imports and validates third-party
 * translator scripts from translate-cache/js/ after consent is granted.
 */

import { BasePluginTranslator } from '../translate-engines/plugins/BasePluginTranslator.js';
import { getCustomScriptsDirectoryPath } from './CustomTranslatorConsent.js';

// Expose BasePluginTranslator globally so custom scripts can extend it
// without fragile relative import paths.
globalThis.__CheatBasePluginTranslator = BasePluginTranslator;

function isBasePluginTranslatorSubclass(cls) {
    if (typeof cls !== 'function') return false;

    let current = cls;
    let depth = 0;

    while (current && current !== Object && depth < 20) {
        if (current === BasePluginTranslator) return true;
        current = Object.getPrototypeOf(current);
        depth += 1;
    }

    return false;
}

function extractTranslatorClasses(moduleExports) {
    const classes = [];

    if (!moduleExports || typeof moduleExports !== 'object') return classes;

    for (const [exportName, exportValue] of Object.entries(moduleExports)) {
        if (isBasePluginTranslatorSubclass(exportValue)) {
            classes.push({ name: exportName, cls: exportValue });
        }
    }

    return classes;
}

function toFileUrl(absolutePath) {
    const { pathToFileURL } = require('url');
    return pathToFileURL(absolutePath).href;
}

async function importCustomModule(absolutePath) {
    const fileUrl = toFileUrl(absolutePath);

    try {
        return await import(fileUrl);
    } catch (fileImportError) {
        const fs = require('fs');
        const source = fs.readFileSync(absolutePath, 'utf-8');
        const wrappedSource = `${source}\n//# sourceURL=${fileUrl}`;

        // Try in-memory module import via data URL first.
        // This avoids MIME/type handling on file:// in some NW.js builds.
        try {
            const dataUrl = `data:text/javascript;charset=utf-8,${encodeURIComponent(wrappedSource)}`;
            return await import(dataUrl);
        } catch (dataUrlImportError) {
            // Final fallback: blob URL module import.
            const blob = new Blob([wrappedSource], {
                type: 'text/javascript',
            });
            const blobUrl = URL.createObjectURL(blob);

            try {
                return await import(blobUrl);
            } catch (blobImportError) {
                const combinedError = new Error(
                    [
                        'Custom translator module import failed for all strategies.',
                        `file:// import error: ${String((fileImportError && fileImportError.message) || fileImportError || '')}`,
                        `data: URL import error: ${String((dataUrlImportError && dataUrlImportError.message) || dataUrlImportError || '')}`,
                        `blob: URL import error: ${String((blobImportError && blobImportError.message) || blobImportError || '')}`,
                    ].join(' ')
                );
                combinedError.cause = blobImportError;
                throw combinedError;
            } finally {
                URL.revokeObjectURL(blobUrl);
            }
        }
    }
}

/**
 * Load custom translator classes from translate-cache/js/.
 * Only call AFTER consent has been granted.
 *
 * @param {string[]} files - .js filenames to load
 * @param {object} registry - PluginTranslatorRegistry instance
 */
export async function loadCustomTranslators(files, registry) {
    if (!Array.isArray(files) || files.length === 0) return;

    const path = require('path');
    const scriptsDir = path.resolve(getCustomScriptsDirectoryPath());

    const existingPluginNames = new Set();
    for (const cls of registry.translatorClasses) {
        try {
            const name = new cls().getPluginName().trim().toLowerCase();
            if (name) existingPluginNames.add(name);
        } catch {
            /* skip invalid built-ins */
        }
    }

    let loadedCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    for (const filename of files) {
        const absolutePath = path.join(scriptsDir, filename);

        try {
            const mod = await importCustomModule(absolutePath);
            const translatorEntries = extractTranslatorClasses(mod);

            if (translatorEntries.length === 0) {
                console.warn(
                    `[CustomTranslatorLoader] No BasePluginTranslator subclass in ${filename}, skipping`
                );
                skippedCount += 1;
                continue;
            }

            for (const { name: exportName, cls } of translatorEntries) {
                try {
                    const instance = new cls();
                    const pluginName = String(instance.getPluginName() || '')
                        .trim()
                        .toLowerCase();

                    if (!pluginName) {
                        console.warn(
                            `[CustomTranslatorLoader] ${filename}:${exportName} has empty pluginName, skipping`
                        );
                        skippedCount += 1;
                        continue;
                    }

                    if (existingPluginNames.has(pluginName)) {
                        console.warn(
                            `[CustomTranslatorLoader] ${filename}:${exportName} conflicts with built-in "${pluginName}", skipping`
                        );
                        skippedCount += 1;
                        continue;
                    }

                    registry.translatorClasses.push(cls);
                    existingPluginNames.add(pluginName);
                    loadedCount += 1;
                    console.log(
                        `[CustomTranslatorLoader] Loaded "${pluginName}" from ${filename}`
                    );
                } catch (error) {
                    console.warn(
                        `[CustomTranslatorLoader] Failed to validate ${filename}:${exportName}`,
                        error
                    );
                    failedCount += 1;
                }
            }
        } catch (error) {
            console.warn(`[CustomTranslatorLoader] Failed to import ${filename}`, error);
            failedCount += 1;
        }
    }

    console.log(
        `[CustomTranslatorLoader] Summary: ${loadedCount} loaded, ${skippedCount} skipped, ${failedCount} failed`
    );
}
