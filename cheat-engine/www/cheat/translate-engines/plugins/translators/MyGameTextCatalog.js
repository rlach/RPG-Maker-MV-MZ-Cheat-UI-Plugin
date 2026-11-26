import { parse } from '../../../libs/acorn.js';
import { readJavaScriptLiteralData } from './JavaScriptTextCatalog.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

/** Read the original manifest, never runtime parameters modified by display translation. */
export async function readOriginalUiPlugins(names) {
    const response = await fetch('js/plugins.js');
    if (!response.ok) throw new Error('Cannot read original custom UI parameters');
    const plugins = readJavaScriptLiteralData(await response.text(), ['$plugins']).bindings
        .$plugins;
    if (!Array.isArray(plugins)) throw new Error('Invalid original plugin manifest');
    return plugins.filter((plugin) => plugin.status && names.includes(plugin.name));
}

const DISPLAY_FIELD =
    /(?:name|names|labels?|titles?|texts?|messages?|descriptions?|desc|detail|speech|quote|help|hint|tooltip|caption|instructions|objective|supply|format|prompt|lines|choices)$/i;
const ASSET_FIELD =
    /(?:image|picture|faceImage|characterName|pluginName|fileName|filePath|folder|sound|bgm|bgs|audio|font|skin)/i;

/** Visible parameter fields only. IDs, commands, reward values and media paths stay literal. */
export function collectMyDisplayParameters(value, entries, field = '') {
    const decoded = parseJsonSafely(value, value);
    if (decoded !== value) return collectMyDisplayParameters(decoded, entries, field);
    if (Array.isArray(value)) {
        for (const child of value) collectMyDisplayParameters(child, entries, field);
    } else if (value && typeof value === 'object') {
        for (const [key, child] of Object.entries(value))
            if (!ASSET_FIELD.test(key)) collectMyDisplayParameters(child, entries, key);
    } else if (typeof value === 'string' && value.trim() && DISPLAY_FIELD.test(field)) {
        const parts = value.split(/%\d+/);
        const text = parts
            .map((part, index) => (index ? `\\COT[${index - 1}]${part}` : part))
            .join('');
        const cacheType = /^(?:speech|quote|message)$/.test(field.toLowerCase())
            ? 'message'
            : undefined;
        entries.set(text, {
            text,
            ...(parts.length > 1 ? { parts } : {}),
            ...(cacheType ? { cacheType } : {}),
        });
    }
}

/** Classify complete message/choice/name expressions using their authored call sites. */
export function collectMyTypedSource(source, extract) {
    const entries = new Map();
    const add = (node, cacheType) => {
        if (!node) return;
        const entry = extract(`({text: (${source.slice(node.start, node.end)})})`).entries[0];
        if (entry) entries.set(entry.text, { ...entry, cacheType });
    };
    function visit(node) {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'CallExpression') {
            const owner = node.callee.object?.name;
            const method = node.callee.property?.name;
            if (owner === '$gameMessage') {
                if (method === 'add') add(node.arguments[0], 'message');
                if (method === 'setSpeakerName') add(node.arguments[0], 'actor_name');
                if (method === 'setChoices' && node.arguments[0]?.type === 'ArrayExpression')
                    for (const choice of node.arguments[0].elements) add(choice, 'choice');
            }
            if (node.callee.name === 'say') add(node.arguments[1], 'message');
            if (method === 'setGuide') add(node.arguments[1], 'actor_name');
        }
        if (
            node.type === 'Property' &&
            ['speech', 'quote'].includes(node.key.name || node.key.value)
        )
            add(node.value, 'message');
        if (node.type === 'VariableDeclarator' && node.id.name === 'forestGuides')
            for (const property of node.init?.properties || []) add(property.value, 'message');
        for (const child of Object.values(node)) {
            if (Array.isArray(child)) child.forEach(visit);
            else if (child && typeof child === 'object') visit(child);
        }
    }
    visit(parse(source, { ecmaVersion: 'latest', allowReturnOutsideFunction: true }));
    return entries;
}
