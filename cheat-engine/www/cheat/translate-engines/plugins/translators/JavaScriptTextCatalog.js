import { parse } from '../../../libs/acorn.js';
import { parseJsonSafely } from './TranslatorHelpers.js';

// Acorn 8.16.0 (MIT) reads syntax only. Never evaluate or rewrite game scripts.
const JAPANESE = /[\u3040-\u30ff\u3400-\u9fff]/;
const VISIBLE_FIELD =
    /^(?:name|names|title|label|labels|text|texts|message|messages|dialogue|dialogues|description|desc|detail|short|location|caution|hint|help|notice|objective|default|after\w+)$/i;
const ASSET_FIELD =
    /(?:image|picture|portrait|bitmap|filename|filepath|folder|fontFace|fontFamily|sound|bgm|bgs|audio|windowskin)/i;
const TECHNICAL_FIELD = /^(?:id|symbol|type|key|pluginName|command|code|tag|meta)$/i;
const DISPLAY_CALL =
    /^(?:drawText\w*|setText|addCommand|setSpeakerName|add|addLog|pushGabRightMessage|pushGabLeftMessage|fillText)$/;
const PLACEHOLDER = (index) => `\\COT[${index}]`;

const keyName = (node) => node?.name ?? node?.value ?? '';
const memberName = (node) => (node?.type === 'MemberExpression' ? keyName(node.property) : '');
export const escapeCatalogPattern = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Read literal tables only; calls, getters and computed expressions are never executed. */
export function readJavaScriptLiteralData(source, names) {
    const bindings = {};
    const objects = [];
    function literal(node) {
        if (node?.type === 'Literal') return node.value;
        if (node?.type === 'ArrayExpression') return node.elements.map(literal);
        if (node?.type !== 'ObjectExpression') return undefined;
        const result = Object.create(null);
        for (const property of node.properties) {
            if (property.type !== 'Property' || property.computed || property.kind !== 'init')
                continue;
            result[keyName(property.key)] = literal(property.value);
        }
        return result;
    }
    function visit(node) {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'VariableDeclarator' && names.includes(node.id.name))
            bindings[node.id.name] = literal(node.init);
        if (node.type === 'ObjectExpression') objects.push(literal(node));
        for (const child of Object.values(node)) {
            if (Array.isArray(child)) child.forEach(visit);
            else if (child && typeof child === 'object') visit(child);
        }
    }
    visit(parse(source, { ecmaVersion: 'latest', allowReturnOutsideFunction: true }));
    return { bindings, objects };
}

function excluded(ancestors) {
    return ancestors.some((node) => {
        if (node.type === 'Property')
            return ASSET_FIELD.test(keyName(node.key)) || TECHNICAL_FIELD.test(keyName(node.key));
        if (node.type === 'AssignmentExpression' && node.left.type === 'MemberExpression')
            return ASSET_FIELD.test(keyName(node.left.property));
        if (node.type === 'VariableDeclarator')
            return /(?:IMAGE|PICTURE|PORTRAIT|ASSET|SOUND|FONT|PATH|FILE)/i.test(
                node.id.name || ''
            );
        if (node.type !== 'CallExpression') return false;
        const name = memberName(node.callee);
        return (
            /^(?:console|ImageManager|AudioManager|SoundManager)$/.test(
                node.callee.object?.name || ''
            ) ||
            /^(?:load|reserve|play|request)(?:Bitmap|Picture|Character|Face|Bgm|Bgs|Se|Me|Audio)/.test(
                name
            )
        );
    });
}

function visibleContext(ancestors, current) {
    return ancestors.some(
        (node, index) =>
            (node.type === 'Property' && VISIBLE_FIELD.test(keyName(node.key))) ||
            (node.type === 'CallExpression' &&
                DISPLAY_CALL.test(memberName(node.callee)) &&
                node.arguments[0] === (ancestors[index + 1] || current))
    );
}

function concatenationParts(node) {
    if (node.type === 'Literal' && typeof node.value === 'string') return [node.value];
    if (node.type === 'TemplateLiteral')
        return node.quasis.map((part) => part.value.cooked ?? part.value.raw);
    if (node.type === 'BinaryExpression' && node.operator === '+') {
        const left = concatenationParts(node.left);
        const right = concatenationParts(node.right);
        // Pure arithmetic must stay one dynamic value.
        if (!left.join('') && !right.join('')) return ['', ''];
        return [...left.slice(0, -1), left[left.length - 1] + right[0], ...right.slice(1)];
    }
    return ['', ''];
}

/** Extract display literals and templates without executing a plugin. */
export function extractJavaScriptTextCatalog(source) {
    const ast = parse(source, {
        ecmaVersion: 'latest',
        sourceType: 'script',
        allowReturnOutsideFunction: true,
    });
    const entries = new Map();

    function add(text, parts = null) {
        if (typeof text !== 'string' || !text.trim()) return;
        const nested = parseJsonSafely(text, text);
        if (nested && typeof nested === 'object') return;
        if (
            /\.(?:png|webp|jpg|ogg|m4a|json|js)(?:$|[?#])/i.test(text) ||
            /^(?:img|audio|story)\//i.test(text)
        )
            return;
        if (!entries.has(text)) entries.set(text, { text, parts });
        // These plugins split descriptions into lines before drawing them.
        if (!parts && text.includes('\n')) for (const line of text.split('\n')) add(line);
    }

    function visit(node, ancestors = []) {
        if (!node || typeof node !== 'object') return;
        if (node.type === 'Literal' && typeof node.value === 'string' && !excluded(ancestors)) {
            const parent = ancestors[ancestors.length - 1];
            const isPropertyKey = parent?.type === 'Property' && parent.key === node;
            if (
                !isPropertyKey &&
                (JAPANESE.test(node.value) ||
                    (visibleContext(ancestors, node) && /[a-z]{2}/i.test(node.value)))
            )
                add(node.value);
        }
        const parent = ancestors[ancestors.length - 1];
        if (
            (node.type === 'TemplateLiteral' ||
                (node.type === 'BinaryExpression' &&
                    node.operator === '+' &&
                    parent?.type !== 'BinaryExpression')) &&
            !excluded(ancestors)
        ) {
            const parts = concatenationParts(node);
            const fixed = parts.join('');
            if (
                !parts.slice(1, -1).some((part) => !part) &&
                (JAPANESE.test(fixed) ||
                    (visibleContext(ancestors, node) && /[a-z]{2}/i.test(fixed)))
            ) {
                const text = parts
                    .map(
                        (part, index) => part + (index < parts.length - 1 ? PLACEHOLDER(index) : '')
                    )
                    .join('');
                add(text, parts.length > 1 ? parts : null);
            }
        }
        const next = [...ancestors, node];
        for (const [key, child] of Object.entries(node)) {
            if (key === 'start' || key === 'end') continue;
            if (Array.isArray(child)) for (const item of child) visit(item, next);
            else if (child && typeof child === 'object') visit(child, next);
        }
    }
    visit(ast);
    return { entries: [...entries.values()] };
}
