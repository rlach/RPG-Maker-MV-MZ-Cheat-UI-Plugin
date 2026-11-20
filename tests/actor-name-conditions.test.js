import { afterEach, expect, it, vi } from 'vitest';
import { installActorNameConditionTranslation } from '../cheat-engine/www/cheat/js/translation-runtime/ActorNameConditions.js';
afterEach(() => vi.unstubAllGlobals());

it.each(['MV', 'MZ'])(
    'preserves actor-controlled layout branches with %s command arguments',
    (engine) => {
        let name = 'Ria';
        class Interpreter {
            command111(params = this._params) {
                this.result = params[0] === 4 && params[2] === 1 && name === params[3];
                if (this.result) this.layout = { enemyX: 512, messageX: 320, messageY: -20 };
                return true;
            }
        }
        vi.stubGlobal('window', {
            Game_Interpreter: Interpreter,
            $gameActors: { actor: (id) => (id === 50 ? { name: () => name } : null) },
        });
        let enabled = true;
        const runtime = {
            isTranslationEnabled: () => enabled,
            getCacheKey: (text) => text,
            hasUsableCacheValue: (key) => key === '里愛',
            translationCache: new Map([['里愛', 'ria']]),
            normalizeSpeakerNameCase: (text) => text[0].toUpperCase() + text.slice(1),
        };
        installActorNameConditionTranslation(runtime);
        installActorNameConditionTranslation(runtime);
        const interpreter = new Interpreter();
        const params = [4, 50, 1, '里愛'];
        interpreter._params = params;
        const run = () => interpreter.command111(...(engine === 'MZ' ? [params] : []));
        expect(run()).toBe(true);
        expect(interpreter.result).toBe(true);
        expect(interpreter.layout).toEqual({ enemyX: 512, messageX: 320, messageY: -20 });
        expect(interpreter._params).toBe(params);
        expect(params).toEqual([4, 50, 1, '里愛']);
        name = 'Manual rename';
        run();
        expect(interpreter.result).toBe(false);
        name = '里愛';
        run();
        expect(interpreter.result).toBe(true);
        name = 'Ria';
        enabled = false;
        run();
        expect(interpreter.result).toBe(false);
        enabled = true;
        runtime.translationCache.clear();
        runtime.hasUsableCacheValue = () => false;
        run();
        expect(interpreter.result).toBe(false);
    }
);
