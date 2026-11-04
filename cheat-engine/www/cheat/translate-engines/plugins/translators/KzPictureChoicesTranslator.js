import { BasePluginTranslator } from '../BasePluginTranslator.js';

export class KzPictureChoicesTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'kz_PictureChoices';
    }

    getPluginLabel() {
        return 'kz_PictureChoices';
    }

    getCacheType() {
        return 'plugin_kz_picture_choices';
    }

    enablePluginTranslation() {
        if (
            !window.Window_ChoiceList ||
            !Window_ChoiceList.prototype ||
            typeof Window_ChoiceList.prototype.populateChoiceSprites !== 'function'
        ) {
            return false;
        }

        const originalPopulateChoiceSprites = Window_ChoiceList.prototype.populateChoiceSprites;
        const hasTimeLimit = !!this.findPluginEntry('ChoiceListWithTimeLimit')?.status;

        if (!originalPopulateChoiceSprites || typeof originalPopulateChoiceSprites !== 'function') {
            return false;
        }

        Window_ChoiceList.prototype.populateChoiceSprites = function () {
            const gameMessage = window.$gameMessage;
            const originalChoices =
                gameMessage && Array.isArray(gameMessage._translateOriginalChoices)
                    ? gameMessage._translateOriginalChoices
                    : null;

            if (!originalChoices) {
                return originalPopulateChoiceSprites.apply(this, arguments);
            }

            const originalChoicesMethod = gameMessage.choices;

            // Native start() removes the final timeout sentinel before sprites
            // are populated. Never reintroduce it from our stable source snapshot.
            let count = Math.min(originalChoices.length, gameMessage._choices.length);
            if (
                hasTimeLimit &&
                /^<limit:[^>]+>$/.test(originalChoices[originalChoices.length - 1] || '')
            )
                count = Math.min(count, originalChoices.length - 1);
            gameMessage.choices = function () {
                return originalChoices.slice(0, count);
            };

            try {
                return originalPopulateChoiceSprites.apply(this, arguments);
            } finally {
                gameMessage.choices = originalChoicesMethod;
            }
        };
        return true;
    }

    async precomputeCounts() {
        return;
    }

    async buildScanEntries() {
        return [];
    }

    collectUntranslated() {
        return [];
    }

    getCachedCountsSync() {
        return { total: 0, left: 0, totalStrings: 0, leftStrings: 0 };
    }
}
