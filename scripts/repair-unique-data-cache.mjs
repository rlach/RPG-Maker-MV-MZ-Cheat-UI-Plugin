import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
    collectUniqueDataRows,
    normalizeUniqueText,
} from '../cheat-engine/www/cheat/translate-engines/plugins/translators/UniqueDataCatalog.js';

/** One-off operator tool. Never imported by the game runtime. */
export function planUniqueCacheRepair(gameRoot, pair = 'ja-en') {
    const manifestSource = fs
        .readFileSync(path.join(gameRoot, 'js/plugins.js'), 'utf8')
        .replace(/^\uFEFF/, '');
    const plugins = JSON.parse(
        manifestSource.slice(manifestSource.indexOf('[')).trim().replace(/;$/, '')
    );
    const plugin = plugins.find((p) => p.status && p.name.split('/').pop() === 'UniqueDataLoader');
    if (!plugin) throw new Error('Enabled UniqueDataLoader not found');
    const entries = new Map();
    for (let row of JSON.parse(plugin.parameters.UniqueDataList)) {
        if (typeof row === 'string') row = JSON.parse(row);
        const filename = row.JsonFileName;
        if (!/^[A-Za-z0-9_/-]+$/.test(filename) || filename.includes('..'))
            throw new Error('Unsafe JSON filename');
        collectUniqueDataRows(
            JSON.parse(fs.readFileSync(path.join(gameRoot, 'data', filename + '.json'), 'utf8')),
            entries
        );
    }
    const cacheDir = path.join(gameRoot, 'www/cheat-settings/translate-cache');
    if (!fs.existsSync(cacheDir)) throw new Error('Cache directory not found');
    const legacyFile = `plugin_unique_data_loader.${pair}.cache.json`;
    const legacy = JSON.parse(fs.readFileSync(path.join(cacheDir, legacyFile), 'utf8'));
    const typesBySource = new Map();
    for (const item of entries.values()) {
        const type = item.type === 'speaker' ? 'actor_name' : item.type;
        if (!typesBySource.has(item.value)) typesBySource.set(item.value, new Set());
        typesBySource.get(item.value).add(type);
    }
    const files = new Map();
    const originals = new Map();
    const load = (filename) => {
        if (!files.has(filename)) {
            const full = path.join(cacheDir, filename);
            const raw = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
            originals.set(filename, raw);
            files.set(filename, raw ? JSON.parse(raw) : {});
        }
        return files.get(filename);
    };
    const changes = [];
    const conflicts = [];
    const unmatched = [];
    // Normalize existing source aliases before moving the old bucket.
    for (const type of ['message', 'message_portrait', 'choice', 'actor_name']) {
        const filename = `${type}.${pair}.cache.json`;
        const bucket = load(filename);
        for (const [key, value] of Object.entries({ ...bucket })) {
            const canonical = normalizeUniqueText(key).replace(/\n+$/, '');
            if (key === canonical || !typesBySource.get(canonical)?.has(type)) continue;
            if (!bucket[canonical] && value) bucket[canonical] = value;
            delete bucket[key];
        }
    }
    for (const [source, value] of Object.entries(legacy)) {
        const canonical = normalizeUniqueText(source).replace(/\n+$/, '');
        const types = typesBySource.get(canonical);
        if (!types) {
            unmatched.push(source);
            continue;
        }
        for (const type of types) {
            const filename = `${type}.${pair}.cache.json`;
            const bucket = load(filename);
            if (bucket[canonical] && value && bucket[canonical] !== value)
                conflicts.push({
                    type,
                    source: canonical,
                    previous: bucket[canonical],
                    selected: value,
                });
            if (value || !Object.hasOwn(bucket, canonical)) bucket[canonical] = value;
            changes.push({ type, source: canonical });
        }
    }
    if (unmatched.length)
        throw new Error(`Refusing repair: ${unmatched.length} unmatched source keys`);
    originals.set(legacyFile, fs.readFileSync(path.join(cacheDir, legacyFile), 'utf8'));
    files.set(legacyFile, {});
    return { cacheDir, originals, files, changes, conflicts, sourceCount: entries.size };
}
export function applyUniqueCacheRepair(plan) {
    // Abort if a running game or another process changed anything since planning.
    for (const [filename, raw] of plan.originals) {
        const full = path.join(plan.cacheDir, filename);
        const current = fs.existsSync(full) ? fs.readFileSync(full, 'utf8') : null;
        if (current !== raw) throw new Error(`Cache changed during planning: ${filename}`);
    }
    const backup = path.join(
        path.dirname(plan.cacheDir),
        'unique-cache-backup-' + new Date().toISOString().replace(/[:.]/g, '-')
    );
    fs.mkdirSync(backup);
    for (const [filename, raw] of plan.originals)
        if (raw !== null) fs.writeFileSync(path.join(backup, filename), raw);
    fs.writeFileSync(
        path.join(backup, 'report.json'),
        JSON.stringify({ changes: plan.changes, conflicts: plan.conflicts }, null, 2)
    );
    for (const [filename, data] of plan.files) {
        const text =
            JSON.stringify(
                Object.fromEntries(Object.entries(data).sort(([a], [b]) => a.localeCompare(b))),
                null,
                2
            ) + '\n';
        fs.writeFileSync(path.join(plan.cacheDir, filename + '.repair-tmp'), text);
        JSON.parse(fs.readFileSync(path.join(plan.cacheDir, filename + '.repair-tmp'), 'utf8'));
    }
    for (const filename of plan.files.keys())
        fs.renameSync(
            path.join(plan.cacheDir, filename + '.repair-tmp'),
            path.join(plan.cacheDir, filename)
        );
    // The runtime has no compatibility path and must never reload this bucket.
    for (const filename of plan.files.keys())
        if (filename.startsWith('plugin_unique_data_loader.'))
            fs.unlinkSync(path.join(plan.cacheDir, filename));
    return backup;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    const root = process.argv[2];
    if (!root)
        throw new Error('Usage: node scripts/repair-unique-data-cache.mjs GAME_ROOT [--apply]');
    const plan = planUniqueCacheRepair(path.resolve(root));
    const counts = {};
    for (const { type } of plan.changes) counts[type] = (counts[type] || 0) + 1;
    console.log(
        JSON.stringify(
            {
                sourceCount: plan.sourceCount,
                moved: counts,
                conflicts: plan.conflicts.length,
                backup: process.argv.includes('--apply') ? applyUniqueCacheRepair(plan) : null,
            },
            null,
            2
        )
    );
}
