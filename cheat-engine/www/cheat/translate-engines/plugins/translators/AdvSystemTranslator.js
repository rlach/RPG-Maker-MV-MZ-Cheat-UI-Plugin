/**
 * ADVsystem (MV, unversioned script): legacy external scenario-file compatibility.
 * TS_Decode and ReplayMode also use the same scenario-directory getter.
 * Dialogue remains in the standard message pipeline; no extra cache or scanning.
 */
import { BasePluginTranslator } from '../BasePluginTranslator.js';
import { getRootWindow } from '../../../js/RootWindowState.js';

export class AdvSystemTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'ADVsystem';
    }

    enablePluginTranslation() {
        const root = getRootWindow();
        const prototype = root.ADV_System?.prototype;
        if (typeof prototype?.localFileDirectoryPath !== 'function') return false;
        const appDirectory = root.nw?.App?.startPath;
        if (root.location?.protocol === 'chrome-extension:' && !appDirectory) return false;
        const original = prototype.localFileDirectoryPath;
        prototype.localFileDirectoryPath = function (...args) {
            const directory = original.apply(this, args);
            // This is file-access compatibility, independent of text translation settings.
            // Preserve native file:// paths and custom plugin directory overrides.
            if (
                root.location?.protocol !== 'chrome-extension:' ||
                typeof directory !== 'string' ||
                !/^[/\\]scenario[/\\]?$/.test(directory)
            )
                return directory;
            const path = require('path');
            return path.join(appDirectory, 'scenario') + path.sep;
        };
        return true;
    }
}
