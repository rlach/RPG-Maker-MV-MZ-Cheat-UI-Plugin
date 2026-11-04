import { afterEach, expect, it, vi } from 'vitest';
import { KzPictureChoicesTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/KzPictureChoicesTranslator.js';
afterEach(() => vi.unstubAllGlobals());

it('preserves native removal of timeout metadata and uses source image names only', () => {
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('$plugins', [{ name: 'ChoiceListWithTimeLimit', status: true }]);
    class ChoiceWindow {
        populateChoiceSprites() {
            return window.$gameMessage.choices().map((text) => text.split('|')[0]);
        }
    }
    vi.stubGlobal('Window_ChoiceList', ChoiceWindow);
    const choices = ['choice1|30|50', 'choice2|60|80', '<limit:5>'];
    const message = {
        _translateOriginalChoices: choices,
        _choices: ['translated1', 'translated2'],
        choices() {
            return this._choices;
        },
    };
    vi.stubGlobal('$gameMessage', message);
    const nativeChoices = message.choices;
    expect(new KzPictureChoicesTranslator().enablePluginTranslation()).toBe(true);
    expect(new ChoiceWindow().populateChoiceSprites()).toEqual(['choice1', 'choice2']);
    message._choices.push('<limit:5>'); // A later core refresh must not restore the sentinel either.
    expect(new ChoiceWindow().populateChoiceSprites()).toEqual(['choice1', 'choice2']);
    expect(message.choices).toBe(nativeChoices);
    expect(choices).toHaveLength(3);
});
