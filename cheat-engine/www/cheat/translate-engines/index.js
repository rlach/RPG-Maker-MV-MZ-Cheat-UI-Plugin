// Translation engine exports
import AIEngine from './ai-engine/index.js';
import DummyEngine from './DummyEngine.js';

export { AIEngine, DummyEngine };

// Factory function to create engine instances
export function createEngine(engineId, runtime) {
    switch (engineId) {
        case 'openApi':
        case 'gpt4all':
        case 'ai':
            return new AIEngine(runtime);
        case 'dummy':
            return new DummyEngine(runtime);
        default:
            console.warn(
                `[TranslationEngines] Unknown engine: ${engineId}, falling back to AI Engine`
            );
            return new AIEngine(runtime);
    }
}

// Get list of available engines
export function getAvailableEngines() {
    return [
        { value: 'openApi', text: 'AI Engine' },
        { value: 'dummy', text: 'Dummy' },
    ];
}
