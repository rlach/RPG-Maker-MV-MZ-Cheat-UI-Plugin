import { ExternBaseTranslator } from '../ExternBaseTranslator.js';
import {
    collectEventCommandEntries,
    extractMessageEntryAt,
} from '../../../js/EventCommandTraversal.js';

/**
 * Baizan ExternMessage 1.1.0 (MV/MZ) and 1.3.12 (MZ, RJ352933).
 * Version 1.3 exposes a global compiler returning a list instead of a static
 * interpreter compiler writing into a supplied list.
 * CSV values in $externMessage.map are strings compiled into 101/401 commands.
 * Use its parser without executing events to preserve references, whitespace,
 * pagination and speakers. CSV keys, faces and the dictionary stay original.
 * Standard message/speaker cache types are consumed by the core window runtime.
 */
export class ExternMessageTranslator extends ExternBaseTranslator {
    constructor() {
        super();
        this.generatedLists = new WeakSet();
    }
    getPluginName() {
        return 'ExternMessage';
    }
    getPluginLabel() {
        return 'ExternMessage CSV';
    }
    getCacheType() {
        return 'message';
    }

    enablePluginTranslation() {
        if (
            typeof window.convertMessageCommand === 'function' &&
            typeof window.Game_Interpreter?.prototype.command101 === 'function'
        ) {
            const compile = window.convertMessageCommand;
            const parse = window.parseCmd;
            const translator = this;
            let compiling = 0;
            window.convertMessageCommand = function (...args) {
                compiling++;
                try {
                    return compile.apply(this, args);
                } finally {
                    compiling--;
                }
            };
            window.parseCmd = function (text, key, ...args) {
                // 1.3 expands variables before the normal message runtime sees
                // them. Keep display variables symbolic until Window_Base draws
                // them, but preserve authored expansion in technical commands.
                if (
                    compiling &&
                    key === '\\V' &&
                    translator.isRuntimeTranslationActive(translator.getRuntime()) &&
                    !/:(?:name|face|event|script|bg|layout)\b/.test(text)
                )
                    return text;
                return parse.call(this, text, key, ...args);
            };
            return true;
        }
        if (
            typeof Game_Interpreter === 'undefined' ||
            typeof Game_Interpreter.convertMessageCommand !== 'function' ||
            typeof Game_Interpreter.prototype.command101 !== 'function'
        )
            return false;
        const translator = this;
        const convert = Game_Interpreter.convertMessageCommand;
        Game_Interpreter.convertMessageCommand = function (dest, ...args) {
            const result = convert.call(this, dest, ...args);
            translator.generatedLists.add(dest);
            return result;
        };
        const command101 = Game_Interpreter.prototype.command101;
        Game_Interpreter.prototype.command101 = function (...args) {
            const runtime = translator.getRuntime();
            if (
                translator.isRuntimeTranslationActive(runtime) &&
                translator.generatedLists.has(this._list)
            ) {
                const entry = extractMessageEntryAt(this._list, this._index);
                if (entry) {
                    translator.resolveRuntimeTranslation(
                        entry.text,
                        runtime,
                        entry.hasPortrait ? 'message_portrait' : 'message'
                    );
                    if (entry.speaker)
                        translator.resolveRuntimeTranslation(entry.speaker, runtime, 'speaker');
                }
            }
            return command101.apply(this, args);
        };
        return true;
    }

    buildScanEntries() {
        const extern = window.$externMessage;
        if (
            !extern?.map &&
            typeof extern?.setup === 'function' &&
            typeof window.$externMessageCSV === 'string'
        )
            extern.setup();
        const dictionary = extern?.map || extern?._map;
        if (
            !dictionary ||
            typeof Game_Interpreter === 'undefined' ||
            (typeof Game_Interpreter.convertMessageCommand !== 'function' &&
                typeof window.convertMessageCommand !== 'function')
        )
            return null;
        const entries = [];
        for (const [messageId, value] of Object.entries(dictionary)) {
            const values = Array.isArray(value) ? value : [value];
            for (const [column, text] of values.entries()) {
                if (!this.isUsableText(text)) continue;
                const commands = [];
                const command = {
                    code: 401,
                    indent: 0,
                    parameters: [text],
                };
                if (typeof window.convertMessageCommand === 'function') {
                    // 1.3 can execute immediate script blocks while compiling.
                    // Compile references at their native depth, but only emit scripts
                    // as commands, and retain variables rather than reading save state.
                    const script = window.convertScript;
                    const parse = window.parseCmd;
                    try {
                        window.convertScript = function (...args) {
                            const result = script.apply(this, args);
                            return result ? { ...result, immediate: false } : result;
                        };
                        window.parseCmd = function (text, key, ...args) {
                            return key === '\\V' ? text : parse.call(this, text, key, ...args);
                        };
                        commands.push(
                            ...window.convertMessageCommand({
                                ...command,
                                parameters: [`\\M[${messageId}]`],
                            })
                        );
                    } finally {
                        window.convertScript = script;
                        window.parseCmd = parse;
                    }
                } else Game_Interpreter.convertMessageCommand(commands, command);
                for (const item of collectEventCommandEntries(commands)) {
                    if (!['message', 'message_portrait', 'speaker'].includes(item.type)) continue;
                    entries.push({
                        text: item.value,
                        cacheType: item.type,
                        source: { messageId, column, cmdIndex: item.cmdIndex },
                    });
                }
            }
        }
        return entries;
    }
}
