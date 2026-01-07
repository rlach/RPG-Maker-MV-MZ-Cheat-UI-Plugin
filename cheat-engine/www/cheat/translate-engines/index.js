// Translation engine exports
import MyMemoryEngine from './MyMemoryEngine.js';
import DatpmtEngine from './DatpmtEngine.js';
import LibreTranslateEngine from './LibreTranslateEngine.js';
import AIEngine from './AIEngine.js';

export {
    MyMemoryEngine,
    DatpmtEngine,
    LibreTranslateEngine,
    AIEngine
};

// Factory function to create engine instances
export function createEngine(engineId, panel) {
    switch (engineId) {
        case 'mymemory':
            return new MyMemoryEngine(panel);
        case 'datpmt':
            return new DatpmtEngine(panel);
        case 'libretranslate':
            return new LibreTranslateEngine(panel);
        case 'gpt4all':
        case 'ai':
            return new AIEngine(panel);
        default:
            console.warn(`[TranslationEngines] Unknown engine: ${engineId}, falling back to MyMemory`);
            return new MyMemoryEngine(panel);
    }
}

// Get list of available engines
export function getAvailableEngines() {
    return [
        { value: 'mymemory', text: 'MyMemory' },
        { value: 'datpmt', text: 'Datpmt' },
        { value: 'libretranslate', text: 'LibreTranslate' },
        { value: 'gpt4all', text: 'AI Engine' }
    ];
}
