import { afterEach, expect, it, vi } from 'vitest';
import { EncLive2dSaveTranslator } from '../cheat-engine/www/cheat/translate-engines/plugins/translators/EncLive2dSaveTranslator.js';

afterEach(() => vi.unstubAllGlobals());

class Live2dManager {
    getModel(id) {
        return { id };
    }
}

class Game_Live2d {
    managerInstance = new Live2dManager();
    gl = { renderer: 'native WebGL context' };
    preloadFinished = true;
    data = { FR: { dataPosition: 0, pictureID: 5, visible: false } };
    addPreloadModelArray = [['FR', 'Model_01', 5]];
    getModel() {
        return this.managerInstance.getModel(this.data.FR.dataPosition);
    }
}

function setup(live2d = new Game_Live2d()) {
    const manager = {
        makeSaveContents: vi.fn(function () {
            return { gameLive2d: live2d, system: { version: 1 } };
        }),
    };
    const original = manager.makeSaveContents;
    vi.stubGlobal('window', { DataManager: manager });
    expect(new EncLive2dSaveTranslator().enablePluginTranslation()).toBe(true);
    return { manager, original, live2d };
}

it('excludes native runtime objects and reloads quick saves through the plugin preload path', () => {
    const { manager, original, live2d } = setup();
    const broken = Object.assign(new Game_Live2d(), JSON.parse(JSON.stringify(live2d)));
    expect(() => broken.getModel()).toThrow(TypeError);
    const activeManager = live2d.managerInstance;
    const activeGl = live2d.gl;
    const snapshot = manager.makeSaveContents('quick');
    expect(original).toHaveBeenCalledWith('quick');
    expect(original.mock.contexts[0]).toBe(manager);
    expect(snapshot.gameLive2d).toBeInstanceOf(Game_Live2d);
    expect(snapshot.gameLive2d).not.toBe(live2d);
    expect(snapshot.gameLive2d.data).toBe(live2d.data);
    expect(snapshot.gameLive2d.addPreloadModelArray).toBe(live2d.addPreloadModelArray);
    expect(live2d.managerInstance).toBe(activeManager);
    expect(live2d.gl).toBe(activeGl);
    expect(live2d.preloadFinished).toBe(true);
    expect(live2d.getModel()).toEqual({ id: 0 });
    const saved = JSON.parse(JSON.stringify(snapshot));
    expect(saved.gameLive2d.managerInstance).toBeNull();
    expect(saved.gameLive2d.gl).toBeNull();
    expect(saved.gameLive2d.preloadFinished).toBe(false);
    const loaded = Object.assign(Object.create(Game_Live2d.prototype), saved.gameLive2d);
    if (!loaded.preloadFinished) {
        loaded.managerInstance = new Live2dManager();
        loaded.preloadFinished = true;
    }
    expect(loaded.getModel()).toEqual({ id: 0 });
    expect(loaded.data).toEqual(live2d.data);
    expect(loaded.addPreloadModelArray).toEqual(live2d.addPreloadModelArray);
});

it('preserves regular save preparation and the active model even if serialization fails', () => {
    const live2d = new Game_Live2d();
    live2d.managerInstance = null;
    live2d.gl = null;
    live2d.preloadFinished = false;
    const { manager } = setup(live2d);
    expect(manager.makeSaveContents().gameLive2d).toEqual(live2d);
    const activeManager = new Live2dManager();
    live2d.managerInstance = activeManager;
    live2d.preloadFinished = true;
    live2d.data.FR.toJSON = () => {
        throw new Error('serialization failed');
    };
    expect(() => JSON.stringify(manager.makeSaveContents())).toThrow('serialization failed');
    expect(live2d.managerInstance).toBe(activeManager);
    expect(live2d.preloadFinished).toBe(true);
});

it('passes through contents without Live2D and waits for the save API', () => {
    vi.stubGlobal('window', {});
    expect(new EncLive2dSaveTranslator().enablePluginTranslation()).toBe(false);
    const { manager } = setup(null);
    expect(manager.makeSaveContents()).toEqual({ gameLive2d: null, system: { version: 1 } });
});
