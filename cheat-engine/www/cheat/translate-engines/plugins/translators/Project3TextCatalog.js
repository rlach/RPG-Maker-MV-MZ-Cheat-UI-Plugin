const ALIASES = {
    マ: 'マリン',
    わ: 'わる子',
    し: 'しづ江',
    は: 'はかせ',
    牛: 'うしむすめ',
    兎: 'うさむすめ',
};
const normalize = (text) => text.replace(/＜＞|[<＜]改行[>＞]/g, '\n');
const entry = (text, cacheType) => ({ text, cacheType });

/** Parse display payloads only. Section IDs, cues, effects and filenames remain literal. */
export function parseProject3Text(source, filename = '') {
    const result = [];
    const reactions = /BattleReactions|戦闘リアクション/.test(filename);
    const talks = /ホーム会話/.test(filename);
    let last = null;
    for (const raw of source.replace(/^\uFEFF/, '').split(/\r?\n/)) {
        const line = raw.trim();
        if (!line || /^(?:#|\/\/)/.test(line)) continue;
        const heading = line.match(/^【(.+)】$/);
        if (heading) {
            result.push(entry(heading[1], 'plugin_project3_ui'));
            last = null;
            continue;
        }
        const section = line.match(/^\[[^\]]+\]\s*(.*)$/);
        if (section) {
            if (talks && section[1]) result.push(entry(section[1], 'plugin_project3_ui'));
            last = null;
            continue;
        }
        if (line.startsWith('@')) {
            const command = line.match(/^@(scene|effect|levelup)\s+(.+)$/);
            if (command) {
                const fields = command[2].split('|').map((value) => value.trim());
                for (const text of command[1] === 'levelup'
                    ? fields.slice(0, 3)
                    : fields.slice(1, 2))
                    if (text) result.push(entry(normalize(text), 'plugin_project3_ui'));
            }
            continue;
        }
        const pair = line.match(/^([^:：]+)[:：]\s*(.*)$/);
        if (pair && !reactions) {
            const speaker = pair[1].trim();
            result.push(entry(ALIASES[speaker] || speaker, 'actor_name'));
            last = entry(normalize(pair[2].replace(/【表示:[^】]+】$/, '').trim()), 'message');
            if (last.text) result.push(last);
        } else if (talks && last) last.text += '\n' + line;
        else if (reactions) {
            const parts = line.split('{name}');
            result.push({
                ...entry(
                    parts
                        .map((part, index) => (index ? `\\COT[${index - 1}]${part}` : part))
                        .join(''),
                    'message'
                ),
                ...(parts.length > 1 ? { parts } : {}),
            });
        }
    }
    return result;
}

/** Literal dialogue tables and shop chatter; never collect arbitrary JSON strings. */
export function collectProject3Data(value, entries) {
    if (!value || typeof value !== 'object') return;
    const add = (text, type) => {
        if (typeof text === 'string' && text.trim()) {
            const source = type === 'message' ? normalize(text) : text;
            entries.set(source, entry(source, type));
        }
    };
    if (typeof value.speaker === 'string' && typeof value.text === 'string') {
        add(value.speaker, 'actor_name');
        add(value.text, 'message');
    }
    if (Array.isArray(value.lines)) {
        add(value.title, 'plugin_project3_ui');
        for (const line of value.lines)
            if (Array.isArray(line)) {
                add(line[0], 'actor_name');
                add(line[1], 'message');
            } else if (typeof line === 'string') add(line, 'message');
    }
    for (const [key, child] of Object.entries(value)) {
        if (['orderedTexts', 'randomTexts'].includes(key) && Array.isArray(child))
            for (const text of child) add(text, 'message');
        else if (['caption', 'subtext'].includes(key)) add(child, 'plugin_project3_ui');
        else if (child && typeof child === 'object') collectProject3Data(child, entries);
    }
}
