import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';

/**
 * menu_window.js + modified rpg_windows.js gauge labels (MV, unversioned build in RJ194421).
 * Collects literal drawText labels from menu_window.js (Window_Gold week label) and
 * author-customized Window_Base.prototype.drawActorHp/Mp/Tp labels in js/rpg_windows.js
 * without collecting the core name-input keyboard tables.
 */
const GAUGE_METHOD_PATTERN =
    /Window_Base\.prototype\.drawActor(?:Hp|Mp|Tp)\s*=\s*function\s*\([^)]*\)\s*\{[\s\S]*?\n\};/g;

export class MenuWindowTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'menu_window';
    }

    getPluginLabel() {
        return 'Menu Window & Gauge Labels';
    }

    getCacheType() {
        return 'plugin_menu_window';
    }

    shouldScanEventData() {
        return false;
    }

    isDisplayFragment() {
        return false;
    }

    async collectAdditionalTexts() {
        const response = await fetch('js/rpg_windows.js');
        if (!response.ok) throw new Error(`Cannot read rpg_windows.js: ${response.status}`);
        const source = await response.text();
        GAUGE_METHOD_PATTERN.lastIndex = 0;
        let match = GAUGE_METHOD_PATTERN.exec(source);
        while (match) {
            const catalog = this.collectSourceCatalog(match[0]);
            for (const entry of catalog.entries) {
                if (!this.entries.has(entry.text)) {
                    this.entries.set(entry.text, entry);
                }
            }
            match = GAUGE_METHOD_PATTERN.exec(source);
        }
    }

    enablePluginTranslation() {
        if (typeof window.Window_Base?.prototype?.drawText !== 'function') {
            return false;
        }
        this.hookDrawing(window.Window_Base.prototype, 'drawText');
        this.precomputeCounts().catch((error) =>
            console.error('[MenuWindowTranslator] Catalog scan failed', error)
        );
        return true;
    }
}
