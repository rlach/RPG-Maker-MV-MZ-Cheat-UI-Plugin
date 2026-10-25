import { afterEach, describe, expect, it } from 'vitest';

import { OtherStrings } from '../../../../../../cheat-engine/www/cheat/translate-engines/translation-phases/OtherStrings.js';

describe('OtherStrings', () => {
    afterEach(() => {
        delete globalThis.$dataSystem;
        delete globalThis.$gameMap;
        OtherStrings._instance = null;
    });

    it('exposes getTitleOriginalValue and returns game title', () => {
        globalThis.$dataSystem = { gameTitle: 'Sample Title' };

        const strategy = OtherStrings.getInstance();
        expect(strategy.getTitleOriginalValue()).toBe('Sample Title');
    });

    it('never collects or applies translations to vehicle asset filenames', () => {
        globalThis.$dataSystem = {
            gameTitle: 'Title',
            currencyUnit: 'Coins',
            ship: { characterName: 'エタナラ003' },
            boat: { characterName: 'Vehicle' },
            airship: { characterName: '$airship02' },
        };
        const runtime = {
            getCacheKey: (text) => `other:ja-en-${text}`,
            hasUsableCacheValue: () => false,
            translationCache: new Map([['other:ja-en-エタナラ003', 'Etanara 003']]),
        };
        const strategy = new OtherStrings();
        expect(strategy.collectUntranslated({ runtime }).map((item) => item.fieldId)).toEqual([
            'gameTitle',
            'currencyUnit',
        ]);
        for (const type of ['ship', 'boat', 'airship']) {
            expect(strategy.applyTranslatedToField(`${type}CharacterName`, 'Wrong')).toBe(false);
        }
        strategy.applyDataOnLifecycle({ runtime });
        expect($dataSystem.ship.characterName).toBe('エタナラ003');
    });

    it('repairs legacy saved vehicle images without resetting indices or custom graphics', () => {
        globalThis.$dataSystem = {
            ship: { characterName: 'エタナラ003' },
            boat: { characterName: 'Boat' },
        };
        const ship = {
            name: 'Etanara 003',
            index: 3,
            characterName() {
                return this.name;
            },
            characterIndex() {
                return this.index;
            },
            setImage(name, index) {
                this.name = name;
                this.index = index;
            },
        };
        const boat = { ...ship, name: 'Custom' };
        globalThis.$gameMap = { vehicle: (type) => ({ ship, boat })[type] };
        const runtime = {
            getCacheKey: (text) => `other:ja-en-${text}`,
            hasUsableCacheValue: () => false,
            translationCache: new Map([
                ['other:ja-en-エタナラ003', 'Etanara 003'],
                ['other:ja-en-Boat', 'Translated Boat'],
            ]),
        };
        const strategy = new OtherStrings();
        expect(strategy.applyDataOnLifecycle({ runtime })).toBe(true);
        expect(ship.name).toBe('エタナラ003');
        expect(ship.index).toBe(3);
        expect(boat.name).toBe('Custom');
        expect(strategy.applyDataOnLifecycle({ runtime })).toBe(false);
    });
});
