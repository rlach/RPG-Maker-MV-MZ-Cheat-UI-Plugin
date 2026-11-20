/** Read literal-ID setValue calls as syntax; never execute event scripts. */
export function collectScriptVariableAssignments(list = []) {
    const assignments = [];
    for (let i = 0; i < list.length; i++) {
        if (list[i]?.code !== 355) continue;
        const lines = [list[i].parameters?.[0] || ''];
        while (list[i + 1]?.code === 655) lines.push(list[++i].parameters?.[0] || '');
        const source = lines.join('\n');
        const pattern = /\$gameVariables\.setValue\(\s*(\d+)\s*,/g;
        for (const match of source.matchAll(pattern)) {
            const start = match.index + match[0].length;
            let depth = 1,
                quote = '',
                escaped = false;
            for (let cursor = start; cursor < source.length; cursor++) {
                const char = source[cursor];
                if (quote) {
                    if (escaped) escaped = false;
                    else if (char === '\\') escaped = true;
                    else if (char === quote) quote = '';
                } else if (char === '"' || char === "'" || char === '`') quote = char;
                else if (char === '(') depth++;
                else if (char === ')' && --depth === 0) {
                    const id = Number(match[1]);
                    assignments.push([id, id, 0, 4, source.slice(start, cursor).trim()]);
                    break;
                }
            }
        }
    }
    return assignments;
}
