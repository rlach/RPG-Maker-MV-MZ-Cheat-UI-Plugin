import { withOriginalTextResource } from '../TextResourceTranslationContext.js';
import { BasePluginTranslator } from '../BasePluginTranslator.js';

/**
 * AdvExtention (MZ, unversioned Panzer-IV release, bundled with PrisonBrave v1.1.0).
 * Message commands resolve TextResource labels or carry inline text. Character names
 * remain identifiers; only the displayed speaker name is translated by the draw hook.
 */
export class AdvExtentionTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'AdvExtention';
    }

    getEventCommandTraversalExtension() {
        return {
            collectEntriesAt: ({ command, index, pushEntry }) => {
                const params = command.parameters;
                if (
                    command.code !== 357 ||
                    params[0]?.split('/').pop() !== this.getPluginName() ||
                    params[1] !== 'message'
                )
                    return null;
                const args = params[3];
                const resource = window.TextResource;
                const text = args.label
                    ? resource.hasResourceInLocal(args.label) || resource.hasResource(args.label)
                        ? withOriginalTextResource(() => resource.getText(args.label))
                        : ''
                    : args.text;
                const actor = window.$dataActors?.[Number(args.actor)];
                const speaker =
                    args.altName ||
                    actor?.name ||
                    args.name ||
                    this.findPluginEntry(this.getPluginName())?.parameters?.blankName;
                if (this.isUsableText(speaker))
                    pushEntry({ type: 'speaker', value: speaker, cmdIndex: index, command });
                if (this.isUsableText(text))
                    pushEntry({ type: 'message', value: text, cmdIndex: index, command });
                return { handled: true, nextIndex: index + 1 };
            },
        };
    }

    hookMessageWindow(messageWindow) {
        if (!messageWindow) return;
        const prototype = Object.getPrototypeOf(messageWindow);
        this.prototypes ??= new WeakSet();
        if (this.prototypes.has(prototype)) return;
        this.prototypes.add(prototype);
        const original = prototype.updateSpeakerName;
        const translator = this;
        prototype.updateSpeakerName = function (...args) {
            const runtime = translator.getRuntime();
            if (!translator.isRuntimeTranslationActive(runtime)) return original.apply(this, args);
            const message = window.$gameMessage;
            const source = message._speakerName;
            message._speakerName = translator.resolveRuntimeTranslation(
                source,
                runtime,
                'actor_name'
            );
            try {
                return original.apply(this, args);
            } finally {
                message._speakerName = source;
            }
        };
    }

    enablePluginTranslation() {
        const prototype = window.Scene_Message?.prototype;
        const manager = window.PluginManager;
        const key = `${this.getPluginName()}:message`;
        const command = manager?._commands?.[key];
        if (typeof prototype?.createMessageWindow !== 'function' || typeof command !== 'function')
            return false;
        const original = prototype.createMessageWindow;
        const translator = this;
        prototype.createMessageWindow = function (...args) {
            const result = original.apply(this, args);
            translator.hookMessageWindow(this._messageWindow);
            return result;
        };
        manager._commands[key] = function (...args) {
            return withOriginalTextResource(() => command.apply(this, args));
        };
        this.hookMessageWindow(window.SceneManager?._scene?._messageWindow);
        return true;
    }
}
