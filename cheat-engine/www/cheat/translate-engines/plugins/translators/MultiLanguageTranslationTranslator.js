import { BasePluginTranslator } from '../BasePluginTranslator.js';

const LOCALIZED_ENTRY = Symbol('nativeLocalizedEntry');

/** Native CSV localization used by RJ01512929, before Game_Message.add. */
export class MultiLanguageTranslationTranslator extends BasePluginTranslator {
    getPluginName() {
        return 'MultiLanguageTranslation';
    }

    getPluginLabel() {
        return 'Multi Language Translation';
    }

    getCacheType() {
        return 'plugin_multi_language_translation';
    }

    enablePluginTranslation() {
        // The native plugin owns language selection and its CSV dictionary.
        return typeof window.__Translation?.translate === 'function';
    }

    localizeLines(text) {
        const localization = window.__Translation;
        if (typeof text !== 'string' || typeof localization?.translate !== 'function') return text;
        // Game_Message.add localizes each authored 401 line independently.
        return text
            .split('\n')
            .map((line) => localization.translate(line))
            .join('\n');
    }

    normalizeTranslationEntry(entry, { runtime } = {}) {
        if (!this.isActive({ runtime })) return entry;
        if (entry?.[LOCALIZED_ENTRY]) return entry;
        if (
            !['message', 'message_portrait', 'speaker', 'choice', 'scroll_text'].includes(
                entry?.type
            )
        )
            return entry;
        // Traversal can transform an entry again when pushing it. Localize each
        // authored line once, without changing runtime text or dictionary data.
        return { ...entry, value: this.localizeLines(entry.value), [LOCALIZED_ENTRY]: true };
    }
}
