import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function normalizeDescriptionTags(value) {
    return value.replace(/【[\s\S]*?】|<X\([\s\S]*?\)>/gi, (tag) => tag.replace(/\s*[\r\n]+\s*/g, ' ')
        .replace(/(?:required[\s-]*level|req\.?[\s-]*(?:level|lv\.?))/gi, 'Req. Lv')
        .replace(/rarity[\s-]*(?:level|lv\.?)?/gi, 'Rarity')
        .replace(/outfit[\s-]*type/gi, 'Outfit')
        .replace(/treasure[\s-]*rank/gi, 'Rank'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    const filename = process.argv[2];
    const data = JSON.parse(readFileSync(filename, 'utf8'));
    let changed = 0;
    for (const key of Object.keys(data)) {
        if (typeof data[key] !== 'string') continue;
        const normalized = normalizeDescriptionTags(data[key]);
        if (normalized !== data[key]) { data[key] = normalized; changed++; }
    }
    if (changed) {
        const backup = filename + '.before-tag-fix-' + Date.now() + '.bak';
        copyFileSync(filename, backup);
        writeFileSync(filename, JSON.stringify(data, null, 2) + '\n', 'utf8');
        console.log(JSON.stringify({changed, backup}));
    } else console.log(JSON.stringify({changed}));
}
