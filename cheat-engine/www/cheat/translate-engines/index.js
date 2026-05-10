// Translation engine exports
import MyMemoryEngine from './MyMemoryEngine.js';
import DatpmtEngine from './DatpmtEngine.js';
import LibreTranslateEngine from './LibreTranslateEngine.js';
import AIEngine from './ai-engine/index.js';
import DummyEngine from './DummyEngine.js';

export { MyMemoryEngine, DatpmtEngine, LibreTranslateEngine, AIEngine, DummyEngine };

// Factory function to create engine instances
export function createEngine(engineId, runtime) {
    switch (engineId) {
        case 'mymemory':
            return new MyMemoryEngine(runtime);
        case 'datpmt':
            return new DatpmtEngine(runtime);
        case 'libretranslate':
            return new LibreTranslateEngine(runtime);
        case 'openApi':
        case 'gpt4all':
        case 'ai':
            return new AIEngine(runtime);
        case 'dummy':
            return new DummyEngine(runtime);
        default:
            console.warn(
                `[TranslationEngines] Unknown engine: ${engineId}, falling back to MyMemory`
            );
            return new MyMemoryEngine(runtime);
    }
}

// Get list of available engines
export function getAvailableEngines() {
    return [
        { value: 'mymemory', text: 'MyMemory' },
        { value: 'datpmt', text: 'Datpmt' },
        { value: 'libretranslate', text: 'LibreTranslate' },
        { value: 'openApi', text: 'AI Engine' },
        { value: 'dummy', text: 'Dummy' },
    ];
}
