import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../', import.meta.url));
const pluginDir = path.join(repoRoot, 'cheat-engine/www/cheat/translate-engines/plugins');
const registry = readFileSync(path.join(pluginDir, 'PluginTranslatorRegistry.js'), 'utf8');
const classList = registry.match(/this\.translatorClasses\s*=\s*\[([\s\S]*?)\]/)?.[1];
if (!classList) throw new Error('Cannot find translatorClasses in PluginTranslatorRegistry.js');

const registered = classList.match(/\b[A-Za-z_$][\w$]*\b/g) || [];
const imports = new Map();
for (const match of registry.matchAll(
    /import\s*\{([^}]+)\}\s*from\s*['"]\.\/translators\/([^'"]+)['"]/g
)) {
    for (const specifier of match[1].split(',')) {
        const [exported, local = exported] = specifier.trim().split(/\s+as\s+/);
        imports.set(`${match[2]}:${exported}`, local);
    }
}

const errors = [];
let count = 0;
for (const file of readdirSync(path.join(pluginDir, 'translators'), { withFileTypes: true })) {
    if (!file.isFile() || !file.name.endsWith('.js')) continue;
    const source = readFileSync(path.join(pluginDir, 'translators', file.name), 'utf8');
    // Helper modules export functions rather than translator classes.
    for (const match of source.matchAll(/export\s+class\s+(\w+Translator)\b/g)) {
        count++;
        const name = match[1];
        const local = imports.get(`${file.name}:${name}`);
        if (!local) errors.push(`${file.name}: ${name} is not imported by the registry`);
        else {
            const occurrences = registered.filter((entry) => entry === local).length;
            if (occurrences !== 1)
                errors.push(
                    `${file.name}: ${name} appears ${occurrences} times in translatorClasses (expected 1)`
                );
        }
    }
}

if (errors.length) {
    console.error(`Translator registry check failed (${errors.length} problem(s)):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
} else {
    console.log(
        `Translator registry check passed: all ${count} translator classes are registered exactly once.`
    );
}
