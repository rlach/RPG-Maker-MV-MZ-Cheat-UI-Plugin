import BaseTranslationEngine from './BaseTranslationEngine.js';

// Tag configuration for preprocessing and postprocessing
const TAG_CONFIGS = [
    // Tags with numeric parameter
    { type: 'variable', shortTag: 'v', prePattern: /\\(V)\[(\d+)\]/gi, postPattern: /\[b=v(\d+)\]/gi, hasParam: true, defaultCase: 'V', requiredConsistency: true },
    { type: 'actor', shortTag: 'an', prePattern: /\\(N)\[(\d+)\]/gi, postPattern: /\[b=an(\d+)\]/gi, hasParam: true, defaultCase: 'N', requiredConsistency: true },
    { type: 'partyMember', shortTag: 'p', prePattern: /\\(P)\[(\d+)\]/gi, postPattern: /\[b=p(\d+)\]/gi, hasParam: true, defaultCase: 'P', requiredConsistency: true },
    { type: 'color', shortTag: 'c', prePattern: /\\(C)\[(\d+)\]/gi, postPattern: /\[b=c(\d+)\]/gi, hasParam: true, defaultCase: 'C', requiredConsistency: false },
    { type: 'icon', shortTag: 'i', prePattern: /\\(I)\[(\d+)\]/gi, postPattern: /\[b=i(\d+)\]/gi, hasParam: true, defaultCase: 'I', requiredConsistency: false },
    // Tags without parameter
    { type: 'gold', shortTag: 'gold', prePattern: /\\(\$)/gi, postPattern: /\[b=gold\]/gi, hasParam: false, defaultCase: '$', requiredConsistency: true },
    { type: 'sizeInc', shortTag: 'si', prePattern: /\\(\{)/gi, postPattern: /\[b=si\]/gi, hasParam: false, defaultCase: '{', requiredConsistency: false },
    { type: 'sizeDec', shortTag: 'sd', prePattern: /\\(\})/gi, postPattern: /\[b=sd\]/gi, hasParam: false, defaultCase: '}', requiredConsistency: false },
    { type: 'backslash', shortTag: 'bs', prePattern: /\\(\\)/gi, postPattern: /\[b=bs\]/gi, hasParam: false, defaultCase: '\\', requiredConsistency: false },
    { type: 'waitQuarter', shortTag: 'wq', prePattern: /\\(\.)/gi, postPattern: /\[b=wq\]/gi, hasParam: false, defaultCase: '.', requiredConsistency: false },
    { type: 'waitSecond', shortTag: 'ws', prePattern: /\\(\|)/gi, postPattern: /\[b=ws\]/gi, hasParam: false, defaultCase: '|', requiredConsistency: false },
    { type: 'waitInput', shortTag: 'wi', prePattern: /\\(!)/gi, postPattern: /\[b=wi\]/gi, hasParam: false, defaultCase: '!', requiredConsistency: false },
    { type: 'displayAll', shortTag: 'da', prePattern: /\\(>)/gi, postPattern: /\[b=da\]/gi, hasParam: false, defaultCase: '>', requiredConsistency: false },
    { type: 'cancelDisplayAll', shortTag: 'cda', prePattern: /\\(<)/gi, postPattern: /\[b=cda\]/gi, hasParam: false, defaultCase: '<', requiredConsistency: false },
    { type: 'noWaitInput', shortTag: 'nwi', prePattern: /\\(\^)/gi, postPattern: /\[b=nwi\]/gi, hasParam: false, defaultCase: '^', requiredConsistency: false },
    // { type: 'simpleN', shortTag: 'n', prePattern: /\\([nN])|\n|↵/gi, postPattern: /\[{1,2}n\]{1,2}/gi, hasParam: false, defaultCase: 'n', requiredConsistency: false },
    // Message core plugin parameters
    // Wait
    { type: 'wait', shortTag: 'w', prePattern: /\\(W)\[(\d+)\]/gi, postPattern: /\[b=w(\d+)\]/gi, hasParam: true, defaultCase: 'W', requiredConsistency: false },
    // NameWindow
    { type: 'nameWindowLeft', shortTag: 'nwl', prePattern: /\\(N)<([^>]+)>/gi, postPattern: /\[b=nwl([^\]]+)\]/gi, hasParam: true, defaultCase: 'N', requiredConsistency: false },
    { type: 'nameWindowCenter', shortTag: 'nwc', prePattern: /\\(NC)<([^>]+)>/gi, postPattern: /\[b=nwc([^\]]+)\]/gi, hasParam: true, defaultCase: 'NC', requiredConsistency: false },
    { type: 'nameWindowRight', shortTag: 'nwr', prePattern: /\\(NR)<([^>]+)>/gi, postPattern: /\[b=nwr([^\]]+)\]/gi, hasParam: true, defaultCase: 'NR', requiredConsistency: false },
    // Line Break
    { type: 'lineBreak', shortTag: 'br', prePattern: /<(br)>/gi, postPattern: /\[b=br\]/gi, hasParam: false, defaultCase: 'br', requiredConsistency: false },
    // Position
    { type: 'posX', shortTag: 'px', prePattern: /\\(PX)\[(\d+)\]/gi, postPattern: /\[b=px(\d+)\]/gi, hasParam: true, defaultCase: 'PX', requiredConsistency: false },
    { type: 'posY', shortTag: 'py', prePattern: /\\(PY)\[(\d+)\]/gi, postPattern: /\[b=py(\d+)\]/gi, hasParam: true, defaultCase: 'PY', requiredConsistency: false },
    // Outline
    { type: 'outlineColor', shortTag: 'oc', prePattern: /\\(OC)\[(\d+)\]/gi, postPattern: /\[b=oc(\d+)\]/gi, hasParam: true, defaultCase: 'OC', requiredConsistency: false },
    { type: 'outlineWidth', shortTag: 'ow', prePattern: /\\(OW)\[(\d+)\]/gi, postPattern: /\[b=ow(\d+)\]/gi, hasParam: true, defaultCase: 'OW', requiredConsistency: false },
    // Font
    { type: 'fontReset', shortTag: 'fr', prePattern: /\\(FR)/gi, postPattern: /\[b=fr\]/gi, hasParam: false, defaultCase: 'FR', requiredConsistency: false, addSpace: true },
    { type: 'fontSize', shortTag: 'fs', prePattern: /\\(FS)\[(\d+)\]/gi, postPattern: /\[b=fs(\d+)\]/gi, hasParam: true, defaultCase: 'FS', requiredConsistency: false },
    { type: 'fontName', shortTag: 'fn', prePattern: /\\(FN)<([^>]+)>/gi, postPattern: /\[b=fn([^\]]+)\]/gi, hasParam: true, defaultCase: 'FN', requiredConsistency: false },
    { type: 'fontBold', shortTag: 'fb', prePattern: /\\(FB)/gi, postPattern: /\[b=fb\]/gi, hasParam: false, defaultCase: 'FB', requiredConsistency: false, addSpace: true },
    { type: 'fontItalic', shortTag: 'fi', prePattern: /\\(FI)/gi, postPattern: /\[b=fi\]/gi, hasParam: false, defaultCase: 'FI', requiredConsistency: false, addSpace: true },
    // Actor
    { type: 'actorFace', shortTag: 'af', prePattern: /\\(AF)\[(\d+)\]/gi, postPattern: /\[b=af(\d+)\]/gi, hasParam: true, defaultCase: 'AF', requiredConsistency: false },
    { type: 'actorClass', shortTag: 'acl', prePattern: /\\(AC)\[(\d+)\]/gi, postPattern: /\[b=acl(\d+)\]/gi, hasParam: true, defaultCase: 'AC', requiredConsistency: false },
    { type: 'actorNickname', shortTag: 'anck', prePattern: /\\(AN)\[(\d+)\]/gi, postPattern: /\[b=anck(\d+)\]/gi, hasParam: true, defaultCase: 'AN', requiredConsistency: false },
    { type: 'justAC', shortTag: 'ac', prePattern: /\\(AC)/gi, postPattern: /\[b=ac\]/gi, hasParam: false, defaultCase: 'AC', requiredConsistency: false, addSpace: true },
    // Party
    { type: 'partyFace', shortTag: 'pf', prePattern: /\\(PF)\[(\d+)\]/gi, postPattern: /\[b=pf(\d+)\]/gi, hasParam: true, defaultCase: 'PF', requiredConsistency: false },
    { type: 'partyClass', shortTag: 'pcl', prePattern: /\\(PC)\[(\d+)\]/gi, postPattern: /\[b=pcl(\d+)\]/gi, hasParam: true, defaultCase: 'PC', requiredConsistency: false },
    { type: 'partyNickname', shortTag: 'pnck', prePattern: /\\(PN)\[(\d+)\]/gi, postPattern: /\[b=pnck(\d+)\]/gi, hasParam: true, defaultCase: 'PN', requiredConsistency: false },
    // Names
    { type: 'className', shortTag: 'ncn', prePattern: /\\(NC)\[(\d+)\]/gi, postPattern: /\[b=ncn(\d+)\]/gi, hasParam: true, defaultCase: 'NC', requiredConsistency: false },
    { type: 'itemName', shortTag: 'ni', prePattern: /\\(NI)\[(\d+)\]/gi, postPattern: /\[b=ni(\d+)\]/gi, hasParam: true, defaultCase: 'NI', requiredConsistency: false },
    { type: 'weaponName', shortTag: 'nw', prePattern: /\\(NW)\[(\d+)\]/gi, postPattern: /\[b=nw(\d+)\]/gi, hasParam: true, defaultCase: 'NW', requiredConsistency: false },
    { type: 'armorName', shortTag: 'na', prePattern: /\\(NA)\[(\d+)\]/gi, postPattern: /\[b=na(\d+)\]/gi, hasParam: true, defaultCase: 'NA', requiredConsistency: false },
    { type: 'skillName', shortTag: 'ns', prePattern: /\\(NS)\[(\d+)\]/gi, postPattern: /\[b=ns(\d+)\]/gi, hasParam: true, defaultCase: 'NS', requiredConsistency: false },
    { type: 'stateName', shortTag: 'nt', prePattern: /\\(NT)\[(\d+)\]/gi, postPattern: /\[b=nt(\d+)\]/gi, hasParam: true, defaultCase: 'NT', requiredConsistency: false },
    // Icon Names
    { type: 'itemNameIcon', shortTag: 'ii', prePattern: /\\(II)\[(\d+)\]/gi, postPattern: /\[b=ii(\d+)\]/gi, hasParam: true, defaultCase: 'II', requiredConsistency: false },
    { type: 'weaponNameIcon', shortTag: 'iw', prePattern: /\\(IW)\[(\d+)\]/gi, postPattern: /\[b=iw(\d+)\]/gi, hasParam: true, defaultCase: 'IW', requiredConsistency: false },
    { type: 'armorNameIcon', shortTag: 'ia', prePattern: /\\(IA)\[(\d+)\]/gi, postPattern: /\[b=ia(\d+)\]/gi, hasParam: true, defaultCase: 'IA', requiredConsistency: false },
    { type: 'skillNameIcon', shortTag: 'is', prePattern: /\\(IS)\[(\d+)\]/gi, postPattern: /\[b=is(\d+)\]/gi, hasParam: true, defaultCase: 'IS', requiredConsistency: false },
    { type: 'stateNameIcon', shortTag: 'it', prePattern: /\\(IT)\[(\d+)\]/gi, postPattern: /\[b=it(\d+)\]/gi, hasParam: true, defaultCase: 'IT', requiredConsistency: false }
];

const DEFAULT_SYSTEM_PROMPT = 'You are translating scripts that contain [b=tags] in the form [b=shortcode]. Altering contents or order of any such tags, removing or adding tags will break the script. DO NOT MODIFY TAGS OF THE FORM [b=...]. DO NOT CHANGE ORDER OF THE TAGS. EVER. PRESENT TAGS EXACTLY AS THEY ARE IN THE INPUT. Only translate the text between tags. Return only flat one-line JSON with exact same keys. No markdown, no comments, no code blocks, no pretty formatting.';

const typeToTag = { text: 'm', speaker: 'm', choice: 'm' };

const requestSettings = {
    temperature: 0.7,
    repetition_penalty: 1.0,
    presence_penalty: 1.5,
    "top_p": 0.8,
    "top_k": 20,
    response_format: { type: "json_object" },
}

const buildRequestSettingsForContent = (content) => ({
    ...requestSettings,
    max_tokens: Math.max(1, ((typeof content === 'string' ? content.length : 0) * 5))
});

const STREAM_MONITOR_CHECK_INTERVAL = 64;
const STREAM_OPEN_BRACE_MAX_CHARS = 100;
const STREAM_JSON_TRIM_MAX_CHARS = 400;
const STREAM_JSONL_TRIM_MAX_CHARS = 400;
const LLM_MAX_CONSECUTIVE_IDENTICAL_CHARS = 5;

const STREAM_CANCEL_REASON = Object.freeze({
    NO_OPENING_BRACE: 'no_opening_brace',
    INVALID_JSON_PROGRESS: 'invalid_json_progress',
    UNKNOWN_KEY: 'unknown_key',
    DUPLICATE_KEY: 'duplicate_key',
    TRIM_TOO_LONG: 'trim_too_long',
    COMPLETE_JSON_CONTINUED: 'complete_json_continued'
});

const REQUEST_CANCEL_REASON = Object.freeze({
    BACKGROUND_PREEMPTED: 'background_preempted'
});

const asFlatString = (value) => {
    if (Array.isArray(value)) {
        return value.map(v => typeof v === 'string' ? v : '').join('');
    }
    return typeof value === 'string' ? value : '';
};

const limitConsecutiveIdenticalChars = (text, maxConsecutive = LLM_MAX_CONSECUTIVE_IDENTICAL_CHARS) => {
    if (typeof text !== 'string' || !text) {
        return text;
    }

    const limit = Number.isFinite(maxConsecutive)
        ? Math.max(1, Math.floor(maxConsecutive))
        : LLM_MAX_CONSECUTIVE_IDENTICAL_CHARS;

    let result = '';
    let previousChar = '';
    let runLength = 0;

    for (const ch of text) {
        if (ch === previousChar) {
            runLength += 1;
        } else {
            previousChar = ch;
            runLength = 1;
        }

        if (runLength <= limit) {
            result += ch;
        }
    }

    return result;
};

const preprocessOutgoingMessageContent = (content) => {
    if (typeof content === 'string') {
        return limitConsecutiveIdenticalChars(content);
    }

    if (Array.isArray(content)) {
        return content.map(item => preprocessOutgoingMessageContent(item));
    }

    if (content && typeof content === 'object') {
        const next = { ...content };

        if (typeof next.text === 'string') {
            next.text = limitConsecutiveIdenticalChars(next.text);
        }

        if (typeof next.content === 'string' || Array.isArray(next.content) || (next.content && typeof next.content === 'object')) {
            next.content = preprocessOutgoingMessageContent(next.content);
        }

        if (typeof next.reasoning_content === 'string') {
            next.reasoning_content = limitConsecutiveIdenticalChars(next.reasoning_content);
        }

        return next;
    }

    return content;
};

const preprocessPayloadForLlm = (payload) => {
    if (!payload || typeof payload !== 'object') {
        return payload;
    }

    const nextPayload = { ...payload };
    if (!Array.isArray(payload.messages)) {
        return nextPayload;
    }

    nextPayload.messages = payload.messages.map(message => {
        if (!message || typeof message !== 'object') {
            return message;
        }

        const nextMessage = { ...message };
        if (Object.prototype.hasOwnProperty.call(nextMessage, 'content')) {
            nextMessage.content = preprocessOutgoingMessageContent(nextMessage.content);
        }
        if (typeof nextMessage.reasoning_content === 'string') {
            nextMessage.reasoning_content = limitConsecutiveIdenticalChars(nextMessage.reasoning_content);
        }

        return nextMessage;
    });

    return nextPayload;
};

const stripThinkBlocks = (text) => {
    if (typeof text !== 'string' || !text) {
        return { text: '', hasOpenThink: false };
    }

    const openToken = '<think>';
    const closeToken = '</think>';
    const lower = text.toLowerCase();
    let cursor = 0;
    let output = '';

    while (cursor < text.length) {
        const openIndex = lower.indexOf(openToken, cursor);
        if (openIndex === -1) {
            output += text.slice(cursor);
            return { text: output, hasOpenThink: false };
        }

        output += text.slice(cursor, openIndex);
        const closeIndex = lower.indexOf(closeToken, openIndex + openToken.length);
        if (closeIndex === -1) {
            return { text: output, hasOpenThink: true };
        }

        cursor = closeIndex + closeToken.length;
    }

    return { text: output, hasOpenThink: false };
};

const scanTopLevelObjects = (text) => {
    const result = {
        firstBraceIndex: -1,
        objects: [],
        partialObjectText: '',
        trailingText: ''
    };

    if (typeof text !== 'string' || !text) {
        return result;
    }

    const firstBrace = text.indexOf('{');
    if (firstBrace === -1) {
        return result;
    }

    result.firstBraceIndex = firstBrace;
    const body = text.slice(firstBrace);

    let inString = false;
    let escape = false;
    let depth = 0;
    let objectStart = -1;

    for (let i = 0; i < body.length; i++) {
        const ch = body[i];

        if (inString) {
            if (escape) {
                escape = false;
                continue;
            }
            if (ch === '\\') {
                escape = true;
                continue;
            }
            if (ch === '"') {
                inString = false;
            }
            continue;
        }

        if (ch === '"') {
            inString = true;
            continue;
        }

        if (ch === '{') {
            if (depth === 0) {
                objectStart = i;
            }
            depth += 1;
            continue;
        }

        if (ch === '}') {
            if (depth > 0) {
                depth -= 1;
                if (depth === 0 && objectStart >= 0) {
                    result.objects.push({
                        start: objectStart,
                        end: i,
                        text: body.slice(objectStart, i + 1)
                    });
                    objectStart = -1;
                }
            }
        }
    }

    if (depth > 0 && objectStart >= 0) {
        result.partialObjectText = body.slice(objectStart);
    }

    if (result.objects.length > 0) {
        const lastObject = result.objects[result.objects.length - 1];
        result.trailingText = body.slice(lastObject.end + 1);
    } else if (!result.partialObjectText) {
        result.trailingText = body;
    }

    return result;
};

const parseTopLevelKeys = (objectText) => {
    const output = {
        valid: true,
        keys: [],
        duplicateKeys: []
    };

    if (typeof objectText !== 'string' || !objectText.trim()) {
        return output;
    }

    let depth = 0;
    let expectingKey = false;
    const seen = new Set();

    for (let i = 0; i < objectText.length; i++) {
        const ch = objectText[i];

        if (ch === '"') {
            let j = i + 1;
            let escaped = false;
            while (j < objectText.length) {
                const current = objectText[j];
                if (escaped) {
                    escaped = false;
                } else if (current === '\\') {
                    escaped = true;
                } else if (current === '"') {
                    break;
                }
                j += 1;
            }

            if (j >= objectText.length) {
                output.valid = false;
                return output;
            }

            if (depth === 1 && expectingKey) {
                const literal = objectText.slice(i, j + 1);
                let key;
                try {
                    key = JSON.parse(literal);
                } catch (e) {
                    output.valid = false;
                    return output;
                }

                let k = j + 1;
                while (k < objectText.length && /\s/.test(objectText[k])) {
                    k += 1;
                }
                if (objectText[k] !== ':') {
                    output.valid = false;
                    return output;
                }

                output.keys.push(key);
                if (seen.has(key)) {
                    output.duplicateKeys.push(key);
                }
                seen.add(key);
                expectingKey = false;
            }

            i = j;
            continue;
        }

        if (ch === '{') {
            depth += 1;
            if (depth === 1) {
                expectingKey = true;
            }
            continue;
        }

        if (ch === '}') {
            if (depth > 0) {
                depth -= 1;
            }
            continue;
        }

        if (ch === ',' && depth === 1) {
            expectingKey = true;
        }
    }

    return output;
};

const getJsonClosureState = (text) => {
    if (typeof text !== 'string') {
        return { inString: false, escape: false, depth: 0, openStringStartIndex: -1 };
    }

    let inString = false;
    let escape = false;
    let depth = 0;
    let openStringStartIndex = -1;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (inString) {
            if (escape) {
                escape = false;
                continue;
            }
            if (ch === '\\') {
                escape = true;
                continue;
            }
            if (ch === '"') {
                inString = false;
            }
            continue;
        }

        if (ch === '"') {
            inString = true;
            openStringStartIndex = i;
            continue;
        }

        if (ch === '{') {
            depth += 1;
                openStringStartIndex = -1;
            continue;
        }

        if (ch === '}' && depth > 0) {
            depth -= 1;
        }
    }

    return { inString, escape, depth, openStringStartIndex };
};

const findLastTopLevelComma = (text) => {
    if (typeof text !== 'string' || !text) {
        return -1;
    }

    let inString = false;
    let escape = false;
    let depth = 0;
    let lastCommaIndex = -1;

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];

        if (inString) {
            if (escape) {
                escape = false;
                continue;
            }
            if (ch === '\\') {
                escape = true;
                continue;
            }
            if (ch === '"') {
                inString = false;
            }
            continue;
        }

        if (ch === '"') {
            inString = true;
            continue;
        }

        if (ch === '{') {
            depth += 1;
            continue;
        }

        if (ch === '}') {
            if (depth > 0) {
                depth -= 1;
            }
            continue;
        }

        if (ch === ',' && depth === 1) {
            lastCommaIndex = i;
        }
    }

    return lastCommaIndex;
};

const autoCloseJsonObjectText = (text) => {
    if (typeof text !== 'string') {
        return '{}';
    }

    const closureState = getJsonClosureState(text);
    let { inString, escape, depth } = closureState;

    let out = text;
    if (inString) {
        if (escape) {
            out += '\\';
        }
        out += '"';
    }

    while (depth > 0) {
        out += '}';
        depth -= 1;
    }

    return out;
};

const parseObjectStrict = (text) => {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('not_json_object');
    }
    return parsed;
};

const tryRepairPartialObject = (partialText, trimLimit) => {
    const closureState = getJsonClosureState(partialText);

    if (closureState.inString) {
        const openStringStart = closureState.openStringStartIndex >= 0
            ? closureState.openStringStartIndex
            : 0;
        const openStringTailChars = partialText.length - openStringStart;

        // Guardrail: if model keeps extending an unterminated string too long,
        // stop early instead of masking it with auto-close.
        if (openStringTailChars > trimLimit) {
            return {
                ok: false,
                reason: STREAM_CANCEL_REASON.TRIM_TOO_LONG,
                trimmedChars: openStringTailChars
            };
        }

        const initialCandidate = autoCloseJsonObjectText(partialText);
        try {
            return {
                ok: true,
                map: parseObjectStrict(initialCandidate),
                trimmedChars: 0,
                repairedText: initialCandidate
            };
        } catch (e) {
            // fall through to comma-based truncation
        }
    } else {
        const initialCandidate = autoCloseJsonObjectText(partialText);
        try {
            return {
                ok: true,
                map: parseObjectStrict(initialCandidate),
                trimmedChars: 0,
                repairedText: initialCandidate
            };
        } catch (e) {
            // fall through to comma-based truncation
        }
    }

    const lastComma = findLastTopLevelComma(partialText);
    let trimmedChars;
    let fallbackCandidate;

    if (lastComma >= 0) {
        trimmedChars = partialText.length - (lastComma + 1);
        fallbackCandidate = `${partialText.slice(0, lastComma)}}`;
    } else {
        trimmedChars = Math.max(0, partialText.length - 1);
        fallbackCandidate = '{}';
    }

    if (trimmedChars > trimLimit) {
        return {
            ok: false,
            reason: STREAM_CANCEL_REASON.TRIM_TOO_LONG,
            trimmedChars
        };
    }

    try {
        return {
            ok: true,
            map: parseObjectStrict(fallbackCandidate),
            trimmedChars,
            repairedText: fallbackCandidate
        };
    } catch (e) {
        return {
            ok: false,
            reason: STREAM_CANCEL_REASON.INVALID_JSON_PROGRESS,
            trimmedChars
        };
    }
};

// Unified AI engine supporting OpenAPI compatible and Open WebUI providers
export default class AIEngine extends BaseTranslationEngine {
    constructor(panel) {
        super(panel);
        this.provider = 'openApi'; // 'openApi' | 'openwebui'
        this.host = 'http://localhost:4891';
        this.apiKey = '';
        this.selectedModel = '';
        this.models = [];
        this.loadingModels = false;
        this.modelsError = '';
        this.allowNewlineMismatch = false;
        this.askAiIfTextTranslated = true;
        this.invalidJsonHandlingStrategy = 'resendFirstHalf'; // 'resendFirstHalf' | 'askAIToFix' | 'useJsonFixer' | 'none'
        this.systemPrompt = DEFAULT_SYSTEM_PROMPT;
        // Allow calling external JSON fixer API (user-configurable)
        this.useJsonFixer = true;
        this._aiFixRecursionMaxDepth = 0;
        this._activeAbortController = null;
        this._activeRequestMeta = null;

        // Map panel-saved keys to internal fields for seamless restore via Object.assign
        Object.defineProperties(this, {
            aiProvider: {
                get: () => this.provider,
                set: (v) => { this.provider = v === 'gpt4all' ? 'openApi' : v; }
            },
            aiHost: {
                get: () => this.host,
                set: (v) => { this.host = v; }
            },
            aiApiKey: {
                get: () => this.apiKey,
                set: (v) => { this.apiKey = v; }
            },
            aiSelectedModel: {
                get: () => this.selectedModel,
                set: (v) => { this.selectedModel = v; }
            },
            aiModels: {
                get: () => this.models,
                set: (v) => { this.models = Array.isArray(v) ? v : []; }
            },
            aiLoadingModels: {
                get: () => this.loadingModels,
                set: (v) => { this.loadingModels = !!v; }
            },
            aiModelsError: {
                get: () => this.modelsError,
                set: (v) => { this.modelsError = v || ''; }
            },
            aiAllowNewlineMismatch: {
                get: () => this.allowNewlineMismatch,
                set: (v) => { this.allowNewlineMismatch = !!v; }
            },
            aiAskIfTextTranslated: {
                get: () => this.askAiIfTextTranslated,
                set: (v) => { this.askAiIfTextTranslated = !!v; }
            },
            aiInvalidJsonHandlingStrategy: {
                get: () => this.invalidJsonHandlingStrategy,
                set: (v) => { this.invalidJsonHandlingStrategy = v || 'resendFirstHalf'; }
            },
            aiSystemPrompt: {
                get: () => this.systemPrompt,
                set: (v) => { this.systemPrompt = v || DEFAULT_SYSTEM_PROMPT; }
            },
            aiFixRecursionMaxDepth: {
                get: () => this._aiFixRecursionMaxDepth,
                set: (v) => { this._aiFixRecursionMaxDepth = Number(v) || 0; }
            },
            userJsonFixer: {
                get: () => this.useJsonFixer,
                set: (v) => { this.useJsonFixer = !!v; }
            }
        });
    }

    getId() {
        return 'openApi';
    }

    getName() {
        return 'AI Engine';
    }

    static getConfigTemplate() {
        return `
           <div v-if="translationEngine === 'openApi' || translationEngine === 'gpt4all'" class="mt-3">
                       <v-select
                           v-model="aiProvider"
                           :items="aiProviderOptions"
                           label="Provider"
                           outlined
                           dense
                           hide-details
                           @input="onChangeAiProvider"
                           @change="onChangeAiProvider"
                           class="mb-2"
                       ></v-select>
                       <v-text-field
                           v-model="aiHost"
                           :label="aiProvider === 'openwebui' ? 'Open WebUI Host' : 'OpenAPI compatible Host'"
                           outlined
                           dense
                           hide-details
                           @keydown.stop
                           @change="onChangeAiHost"
                           class="mb-2"
                       ></v-text-field>
                       <v-text-field
                           v-if="aiProvider === 'openwebui'"
                           v-model="aiApiKey"
                           label="Open WebUI API Key"
                           outlined
                           dense
                           hide-details
                           type="password"
                           @keydown.stop
                           @change="onChangeAiApiKey"
                           class="mb-2"
                       ></v-text-field>
                       <div class="d-flex gap-2 mb-2 align-center">
                           <v-btn
                               small
                               outlined
                               color="primary"
                               :disabled="aiLoadingModels"
                               @click="fetchAiModels"
                               :loading="aiLoadingModels"
                           >
                               <v-icon small left>mdi-refresh</v-icon>
                               Fetch Models
                           </v-btn>
                           <div v-if="aiModelsError" class="text-caption error--text">{{ aiModelsError }}</div>
                       </div>
                       <v-select
                           v-model="aiSelectedModel"
                           :items="aiModels"
                           label="Select Model"
                           outlined
                           dense
                           hide-details
                           :disabled="aiModels.length === 0"
                           @change="onChangeAiModel"
                           class="mb-2"
                       ></v-select>

                       <v-checkbox
                           v-model="aiAllowNewlineMismatch"
                           label="Allow non-essential tag mismatches"
                           @change="onChangeAiAllowNewlineMismatch"
                           class="mt-2"
                           hide-details
                       ></v-checkbox>

                       <v-checkbox
                           v-model="aiAskIfTextTranslated"
                           label="ask AI if text is translated"
                           @change="onChangeAiAskIfTextTranslated"
                           class="mt-2"
                           hide-details
                       ></v-checkbox>
           
                       <v-select
                           v-model="aiInvalidJsonHandlingStrategy"
                           :items="aiInvalidJsonHandlingStrategyOptions"
                           label="Invalid JSON Handling Strategy"
                           outlined
                           dense
                           hide-details
                           @change="onChangeAiInvalidJsonHandlingStrategy"
                           class="mt-2"
                       ></v-select>

                       <v-text-field
                           v-if="aiInvalidJsonHandlingStrategy === 'askAIToFix'"
                           v-model.number="aiFixRecursionMaxDepth"
                           label="AI fix recursion max depth (0 = infinite)"
                           outlined
                           dense
                           type="number"
                           min="0"
                           max="100"
                           hide-details
                           @keydown.stop
                           @change="onChangeAiFixRecursionMaxDepth"
                           class="mt-2"
                       ></v-text-field>

                       <v-checkbox
                           v-model="useJsonFixer"
                           label="Allow calls to json fixer (external API, don't send sensitive data)"
                           @change="onChangeUseJsonFixer"
                           class="mb-2"
                           hide-details
                       ></v-checkbox>
           
                       <v-textarea
                           v-model="aiSystemPrompt"
                           label="System prompt"
                           auto-grow
                           rows="3"
                           outlined
                           dense
                           hide-details
                           @keydown.stop
                           @change="onChangeAiSystemPrompt"
                           class="mb-2"
                       ></v-textarea>
        `;
    }

    getConfigData() {
        return {
            aiProvider: this.provider,
            aiProviderOptions: [
                { text: 'OpenAPI compatible', value: 'openApi' },
                { text: 'Open WebUI', value: 'openwebui' }
            ],
            aiHost: this.host,
            aiApiKey: this.apiKey,
            aiSelectedModel: this.selectedModel,
            aiModels: this.models,
            aiLoadingModels: this.loadingModels,
            aiModelsError: this.modelsError,
            aiAllowNewlineMismatch: this.allowNewlineMismatch,
            aiAskIfTextTranslated: this.askAiIfTextTranslated,
            aiInvalidJsonHandlingStrategy: this.invalidJsonHandlingStrategy,
            aiSystemPrompt: this.systemPrompt,
            aiFixRecursionMaxDepth: this.aiFixRecursionMaxDepth,
            useJsonFixer: this.useJsonFixer
        };
    }

    isFullyConfigured() {
        // AI Engine is fully configured if a model is selected
        return !!(this.selectedModel && this.selectedModel.trim().length > 0);
    }

    getConfigMethods() {
        const self = this;
        const panel = this.panel;
        return {
            async fetchAiModels() {
                panel.aiLoadingModels = true;
                self.loadingModels = true;
                panel.aiModelsError = '';
                self.modelsError = '';

                try {
                    const host = (panel.aiHost || (panel.aiProvider === 'openwebui' ? 'http://localhost:8080' : 'http://localhost:4891')).replace(/\/$/, '');
                    const url = panel.aiProvider === 'openwebui' ? `${host}/api/models` : `${host}/v1/models`;
                    const headers = panel.aiProvider === 'openwebui' && panel.aiApiKey ? { Authorization: `Bearer ${panel.aiApiKey}` } : {};
                    const response = await axios.get(url, { headers });
                    const data = response && response.data;

                    if (data && Array.isArray(data.data)) {
                        const modelList = data.data.map(m => m.id || m.name || m).filter(Boolean);
                        panel.aiModels = modelList;
                        self.models = modelList;
                        console.log('[AIEngine] Fetched models:', modelList);
                    } else {
                        throw new Error('Invalid response format');
                    }
                } catch (error) {
                    console.error('[AIEngine] Failed to fetch models:', error.message);
                    panel.aiModelsError = 'Failed to fetch models';
                    self.modelsError = 'Failed to fetch models';
                } finally {
                    panel.aiLoadingModels = false;
                    self.loadingModels = false;
                }
            },
            onChangeAiProvider() {
                self.provider = panel.aiProvider === 'gpt4all' ? 'openApi' : panel.aiProvider;
                // Adjust default host per provider
                if (panel.aiProvider === 'openwebui' && (!panel.aiHost || panel.aiHost.includes('4891'))) {
                    panel.aiHost = 'http://localhost:8080';
                }
                if (panel.aiProvider === 'openApi' && (!panel.aiHost || panel.aiHost.includes('8080'))) {
                    panel.aiHost = 'http://localhost:4891';
                }
                self.host = panel.aiHost;
                self.apiKey = panel.aiApiKey || '';
                panel.aiModels = [];
                self.models = [];
                panel.aiSelectedModel = '';
                self.selectedModel = '';
                panel.aiModelsError = '';
                self.modelsError = '';
                panel.saveSettings();
            },
            onChangeAiHost() {
                self.host = panel.aiHost;
                panel.aiModels = [];
                self.models = [];
                panel.aiSelectedModel = '';
                self.selectedModel = '';
                panel.aiModelsError = '';
                self.modelsError = '';
                panel.saveSettings();
            },
            onChangeAiApiKey() {
                self.apiKey = panel.aiApiKey || '';
                panel.saveSettings();
            },
            onChangeAiModel() {
                self.selectedModel = panel.aiSelectedModel;
                panel.saveSettings();
            },
            onChangeAiAllowNewlineMismatch() {
                self.allowNewlineMismatch = panel.aiAllowNewlineMismatch;
                panel.saveSettings();
            },
            onChangeAiAskIfTextTranslated() {
                self.askAiIfTextTranslated = !!panel.aiAskIfTextTranslated;
                panel.saveSettings();
            },
            onChangeAiInvalidJsonHandlingStrategy() {
                self.invalidJsonHandlingStrategy = panel.aiInvalidJsonHandlingStrategy;
                panel.saveSettings();
            },
            onChangeAiSystemPrompt() {
                const next = panel.aiSystemPrompt || DEFAULT_SYSTEM_PROMPT;
                self.systemPrompt = next;
                panel.saveSettings();
            }
            ,
            onChangeAiFixRecursionMaxDepth() {
                self.aiFixRecursionMaxDepth = Number(panel.aiFixRecursionMaxDepth) || 0;
                panel.saveSettings();
            }
            ,
            onChangeUseJsonFixer() {
                self.useJsonFixer = !!panel.useJsonFixer;
                panel.saveSettings();
            }
        };
    }

    getLanguageName(code) {
        const map = {
            'ja': 'Japanese',
            'en': 'English',
            'es': 'Spanish',
            'fr': 'French',
            'de': 'German',
            'it': 'Italian',
            'pt': 'Portuguese',
            'ru': 'Russian',
            'ko': 'Korean',
            'zh-CN': 'Chinese Simplified',
            'zh-TW': 'Chinese Traditional',
            'pl': 'Polish',
            'auto': 'auto'
        };
        return map[code] || code;
    }

    buildNameHints(taggedText) {
        if (!taggedText || !this.panel.translationCache) {
            return '';
        }

        const hints = [];
        const prefix = `speaker:${this.panel.sourceLang}-${this.panel.targetLang}-`;

        for (const [key, value] of this.panel.translationCache.entries()) {
            if (!key || typeof key !== 'string' || !key.startsWith(prefix)) {
                continue;
            }
            const origWithPrefix = key.substring(prefix.length);
            const orig = origWithPrefix.startsWith('name_') ? origWithPrefix.substring(5) : origWithPrefix;
            if (!orig || typeof value !== 'string') {
                continue;
            }
            if (value.trim() === '' || value === orig) {
                continue;
            }
            if (taggedText.includes(orig)) {
                hints.push(`${orig} to ${value}`);
            }
        }

        return hints.length ? `Translate ${hints.join(', ')}.` : '';
    }

    preprocessTags(text) {
        if (!text || typeof text !== 'string') {
            return { text: text || '', tagCounts: {}, caseMap: [] };
        }

        let result = text;
        const tagCounts = {};
        const caseMap = [];

        // Process configured tags (with and without parameters)
        for (const config of TAG_CONFIGS) {
            const matches = result.match(config.prePattern) || [];
            tagCounts[config.type] = matches.length;

            if (config.hasParam) {
                result = result.replace(config.prePattern, (match, letter, num) => {
                    caseMap.push({ type: config.type, num, case: letter });
                    return `[b=${config.shortTag}${num}]`;
                });
            } else {
                result = result.replace(config.prePattern, (match, letter) => {
                    // For patterns that don't capture a letter (e.g., literal newlines), letter will be undefined
                    caseMap.push({ type: config.type, case: letter });
                    return `[b=${config.shortTag}]`;
                });
            }
        }

        return { text: result, tagCounts, caseMap };
    }

    postprocessTags(text, tagCounts, caseMap) {
        if (!text || typeof text !== 'string') {
            return { text: text || '', valid: false, expectedCounts: tagCounts, actualCounts: {} };
        }

        let result = text;
        const actualCounts = {};
        const caseLookup = {};

        // Build case lookup from caseMap
        if (Array.isArray(caseMap)) {
            for (const item of caseMap) {
                if (item.type === 'simpleN') {
                    if (!caseLookup[item.type]) {
                        caseLookup[item.type] = [];
                    }
                    caseLookup[item.type].push(item.case);
                } else if (item.hasOwnProperty('num')) {
                    // Item has numeric parameter
                    if (!caseLookup[item.type]) {
                        caseLookup[item.type] = {};
                    }
                    caseLookup[item.type][item.num] = item.case;
                } else {
                    // Item without parameter - store the case directly
                    caseLookup[item.type] = item.case;
                }
            }
        }

        // Process configured tags
        for (const config of TAG_CONFIGS) {
            const matches = result.match(config.postPattern) || [];
            actualCounts[config.type] = matches.length;

            if (config.hasParam) {
                result = result.replace(config.postPattern, (match, num) => {
                    const caseLookupForType = caseLookup[config.type] || {};
                    const originalCase = caseLookupForType[num] || config.defaultCase;
                    return `\\${originalCase}[${num}]`;
                });
            } else {
                // For non-param tags, track which occurrence we're replacing
                let replaceIndex = 0;
                result = result.replace(config.postPattern, (match) => {
                    // Simple newline tag should become an actual newline, not an escaped sequence
                    if (config.type === 'simpleN') {
                        const replacement = '\n';
                        replaceIndex++;
                        return config.addSpace ? `${replacement} ` : replacement;
                    }

                    let originalCase = caseLookup[config.type] || config.defaultCase;
                    // If originalCase is array (e.g., for simpleN), take element at current index
                    if (Array.isArray(originalCase)) {
                        originalCase = originalCase[replaceIndex] || originalCase[0] || config.defaultCase;
                    }
                    replaceIndex++;
                    const replacement = `\\${originalCase}`;
                    // Add space after tag if addSpace is true
                    return config.addSpace ? `${replacement} ` : replacement;
                });
            }
        }

        // Validate based on setting: if allowing non-essential mismatches, only compare required tags; else compare all
        let valid;
        if (this.allowNewlineMismatch) {
            const requiredTypes = TAG_CONFIGS.filter(c => c.requiredConsistency).map(c => c.type);
            valid = requiredTypes.every(type => actualCounts[type] === (tagCounts[type] || 0));
        } else {
            valid = Object.keys(tagCounts).every(key => actualCounts[key] === (tagCounts[key] || 0));
        }

        if (!valid) {
            console.warn('[AIEngine] Tag count mismatch:', {
                expected: tagCounts,
                actual: actualCounts
            });
        }

        return { text: result, valid, expectedCounts: tagCounts, actualCounts };
    }

    validateUnknownTags(rawText, originalPreprocessed) {
        // Extract all [b=...] tags from response (only these are protected control tags)
        const tagMatches = rawText.match(/\[b=([^\]]+)\]/gi) || [];

        for (const tagMatch of tagMatches) {
            // Check if this tag matches any known postPattern
            let isKnownTag = false;

            for (const config of TAG_CONFIGS) {
                if (config.postPattern.test(tagMatch)) {
                    isKnownTag = true;
                    break;
                }
            }

            // If tag is unknown, check if it was in the original preprocessed text
            if (!isKnownTag) {
                if (!originalPreprocessed.includes(tagMatch)) {
                    // Tag not in original = AI hallucination
                    return {
                        valid: false,
                        unknownTag: tagMatch,
                        reason: 'unknown tag'
                    };
                }
                // Tag was in original, so it's OK (maybe leftover from preprocessing)
            }
        }

        return { valid: true };
    }

    // Helpers for endpoints and headers
    getModelsUrl() {
        const host = (this.host || (this.provider === 'openwebui' ? 'http://localhost:8080' : 'http://localhost:4891')).replace(/\/$/, '');
        return this.provider === 'openwebui' ? `${host}/api/models` : `${host}/v1/models`;
    }

    getChatUrl() {
        const host = (this.host || (this.provider === 'openwebui' ? 'http://localhost:8080' : 'http://localhost:4891')).replace(/\/$/, '');
        return this.provider === 'openwebui' ? `${host}/api/chat/completions` : `${host}/v1/chat/completions`;
    }

    getAuthHeaders() {
        if (this.provider === 'openwebui' && this.apiKey) {
            return { Authorization: `Bearer ${this.apiKey}` };
        }
        return {};
    }

    getRequestHeaders() {
        return {
            'Content-Type': 'application/json',
            ...this.getAuthHeaders()
        };
    }

    cancelActiveRequest(cancelReason = null) {
        if (cancelReason && this._activeRequestMeta) {
            this._activeRequestMeta.externalCancelReason = cancelReason;
        }

        if (this._activeAbortController) {
            try {
                this._activeAbortController.abort();
                return true;
            } catch (e) {
                console.warn('[AIEngine] cancelActiveRequest abort failed:', e && e.message ? e.message : e);
            }
        }

        return false;
    }

    hasActiveBackgroundRequest() {
        return !!(
            this._activeAbortController
            && this._activeRequestMeta
            && this._activeRequestMeta.isBackgroundJob
        );
    }

    cancelActiveBackgroundRequest(reason = REQUEST_CANCEL_REASON.BACKGROUND_PREEMPTED) {
        if (!this.hasActiveBackgroundRequest()) {
            return false;
        }

        return this.cancelActiveRequest(reason);
    }

    isBackgroundPreemptedError(error) {
        if (!error || typeof error !== 'object') {
            return false;
        }

        return error.code === REQUEST_CANCEL_REASON.BACKGROUND_PREEMPTED
            || error.cancelReason === REQUEST_CANCEL_REASON.BACKGROUND_PREEMPTED;
    }

    extractMessageText(message) {
        const primaryContent = message && typeof message === 'object' ? asFlatString(message.content) : '';
        const fallbackContent = message && typeof message === 'object' ? asFlatString(message.reasoning_content) : '';
        return primaryContent && primaryContent.trim() ? primaryContent : fallbackContent;
    }

    extractStreamingDeltaText(payload) {
        const pickText = (value) => {
            if (typeof value === 'string') {
                return value;
            }
            if (Array.isArray(value)) {
                return value.map(v => pickText(v)).join('');
            }
            if (value && typeof value === 'object') {
                if (typeof value.text === 'string') {
                    return value.text;
                }
                if (typeof value.content === 'string') {
                    return value.content;
                }
                if (Array.isArray(value.content)) {
                    return value.content.map(v => pickText(v)).join('');
                }
            }
            return '';
        };

        const choice = payload && Array.isArray(payload.choices) ? payload.choices[0] : null;
        if (!choice || typeof choice !== 'object') {
            return '';
        }

        const delta = choice.delta && typeof choice.delta === 'object' ? choice.delta : null;
        const message = choice.message && typeof choice.message === 'object' ? choice.message : null;

        const candidates = [
            delta ? delta.content : '',
            delta ? delta.reasoning_content : '',
            delta ? delta.reasoning : '',
            message ? message.content : '',
            message ? message.reasoning_content : ''
        ];

        for (const candidate of candidates) {
            const text = pickText(candidate);
            if (text) {
                return text;
            }
        }

        return '';
    }

    extractExpectedKeysFromJsonLike(text) {
        try {
            const candidate = this.extractJsonLike(text);
            const parsed = parseObjectStrict(candidate);
            return Object.keys(parsed);
        } catch (e) {
            return [];
        }
    }

    buildStreamMonitorState(expectedKeys) {
        const safeKeys = Array.isArray(expectedKeys)
            ? expectedKeys.filter(key => typeof key === 'string' && key.trim().length > 0)
            : [];

        return {
            expectedKeys: safeKeys,
            expectedKeySet: new Set(safeKeys),
            lastCheckedCharCount: 0,
            bestMap: null,
            bestScore: -1,
            bestIsComplete: false,
            cancelReason: null,
            cancelMeta: null
        };
    }

    isMapComplete(map, expectedKeys) {
        if (!map || typeof map !== 'object' || Array.isArray(map)) {
            return false;
        }
        return expectedKeys.every(key => Object.prototype.hasOwnProperty.call(map, key));
    }

    getMatchedExpectedKeyCount(map, expectedKeys) {
        if (!map || typeof map !== 'object' || Array.isArray(map) || !Array.isArray(expectedKeys)) {
            return 0;
        }

        let count = 0;
        for (const key of expectedKeys) {
            if (Object.prototype.hasOwnProperty.call(map, key) && typeof map[key] === 'string') {
                count += 1;
            }
        }

        return count;
    }

    rememberBestMonitorMap(state, candidateMap) {
        if (!candidateMap || typeof candidateMap !== 'object' || Array.isArray(candidateMap)) {
            return;
        }

        const expectedKeys = state.expectedKeys;
        const score = expectedKeys.reduce((acc, key) => {
            return acc + (Object.prototype.hasOwnProperty.call(candidateMap, key) ? 1 : 0);
        }, 0);

        if (score > state.bestScore) {
            state.bestMap = candidateMap;
            state.bestScore = score;
            state.bestIsComplete = this.isMapComplete(candidateMap, expectedKeys);
            return;
        }

        if (score === state.bestScore && score >= 0) {
            const currentSize = state.bestMap ? Object.keys(state.bestMap).length : 0;
            const nextSize = Object.keys(candidateMap).length;
            if (nextSize > currentSize) {
                state.bestMap = candidateMap;
                state.bestScore = score;
                state.bestIsComplete = this.isMapComplete(candidateMap, expectedKeys);
            }
        }
    }

    analyzeSanitizedStreamText(sanitizedText, expectedKeys) {
        const expectedKeySet = new Set(expectedKeys);
        const scan = scanTopLevelObjects(sanitizedText);
        const output = {
            cancelReason: null,
            cancelMeta: null,
            candidateMap: null,
            isComplete: false
        };

        if (scan.firstBraceIndex === -1) {
            return output;
        }

        const seenKeys = new Set();
        const mergedMap = {};
        let completionObjectIndex = -1;
        let completedViaPartialRepair = false;

        const setCandidateFromMerged = () => {
            if (Object.keys(mergedMap).length > 0) {
                output.candidateMap = { ...mergedMap };
            }
        };

        const mergeMap = (map, objectIndex = -1) => {
            for (const key of Object.keys(map)) {
                mergedMap[key] = map[key];
            }
            if (completionObjectIndex === -1 && expectedKeys.every(key => seenKeys.has(key))) {
                if (objectIndex >= 0) {
                    completionObjectIndex = objectIndex;
                } else {
                    completedViaPartialRepair = true;
                }
            }
        };

        for (let idx = 0; idx < scan.objects.length; idx++) {
            const objectChunk = scan.objects[idx].text;
            const keyInfo = parseTopLevelKeys(objectChunk);
            if (!keyInfo.valid) {
                setCandidateFromMerged();
                output.cancelReason = STREAM_CANCEL_REASON.INVALID_JSON_PROGRESS;
                return output;
            }

            if (keyInfo.duplicateKeys.length > 0) {
                setCandidateFromMerged();
                output.cancelReason = STREAM_CANCEL_REASON.DUPLICATE_KEY;
                output.cancelMeta = { keys: keyInfo.duplicateKeys.slice() };
                return output;
            }

            for (const key of keyInfo.keys) {
                if (expectedKeySet.size > 0 && !expectedKeySet.has(key)) {
                    setCandidateFromMerged();
                    output.cancelReason = STREAM_CANCEL_REASON.UNKNOWN_KEY;
                    output.cancelMeta = { key };
                    return output;
                }
                if (seenKeys.has(key)) {
                    setCandidateFromMerged();
                    output.cancelReason = STREAM_CANCEL_REASON.DUPLICATE_KEY;
                    output.cancelMeta = { key };
                    return output;
                }
                seenKeys.add(key);
            }

            let parsed;
            try {
                parsed = parseObjectStrict(objectChunk);
            } catch (e) {
                setCandidateFromMerged();
                output.cancelReason = STREAM_CANCEL_REASON.INVALID_JSON_PROGRESS;
                return output;
            }

            mergeMap(parsed, idx);
        }

        if (scan.partialObjectText) {
            const isJsonlMode = scan.objects.length > 0;
            if (isJsonlMode) {
                const jsonlTrimmedChars = Math.max(0, scan.partialObjectText.length - 1);
                if (jsonlTrimmedChars > STREAM_JSONL_TRIM_MAX_CHARS) {
                    setCandidateFromMerged();
                    output.cancelReason = STREAM_CANCEL_REASON.TRIM_TOO_LONG;
                    output.cancelMeta = { trimmedChars: jsonlTrimmedChars };
                    return output;
                }
            } else {
                const repaired = tryRepairPartialObject(scan.partialObjectText, STREAM_JSON_TRIM_MAX_CHARS);
                if (!repaired.ok) {
                    setCandidateFromMerged();
                    output.cancelReason = repaired.reason || STREAM_CANCEL_REASON.INVALID_JSON_PROGRESS;
                    output.cancelMeta = { trimmedChars: repaired.trimmedChars || 0 };
                    return output;
                }

                const repairedKeys = Object.keys(repaired.map);
                for (const key of repairedKeys) {
                    if (expectedKeySet.size > 0 && !expectedKeySet.has(key)) {
                        setCandidateFromMerged();
                        output.cancelReason = STREAM_CANCEL_REASON.UNKNOWN_KEY;
                        output.cancelMeta = { key };
                        return output;
                    }
                    if (seenKeys.has(key)) {
                        setCandidateFromMerged();
                        output.cancelReason = STREAM_CANCEL_REASON.DUPLICATE_KEY;
                        output.cancelMeta = { key };
                        return output;
                    }
                    seenKeys.add(key);
                }

                mergeMap(repaired.map, -1);
            }
        }

        output.candidateMap = mergedMap;
        output.isComplete = this.isMapComplete(mergedMap, expectedKeys);

        if (output.isComplete) {
            if (completionObjectIndex >= 0) {
                if (completionObjectIndex < scan.objects.length - 1) {
                    setCandidateFromMerged();
                    output.cancelReason = STREAM_CANCEL_REASON.COMPLETE_JSON_CONTINUED;
                    return output;
                }

                const completeObject = scan.objects[completionObjectIndex];
                if (!completeObject) {
                    return output;
                }
                const body = sanitizedText.slice(scan.firstBraceIndex);
                const trailingAfterComplete = body.slice(completeObject.end + 1);
                if (trailingAfterComplete.trim().length > 0) {
                    setCandidateFromMerged();
                    output.cancelReason = STREAM_CANCEL_REASON.COMPLETE_JSON_CONTINUED;
                    return output;
                }
            } else if (completedViaPartialRepair) {
                // Completion came from repaired partial object; no closed object boundary exists yet.
                // Do not apply trailing-content continuation check in this branch.
            }
        }

        return output;
    }

    applyStreamGuardrails(state, rawText, force = false) {
        const thinkInfo = stripThinkBlocks(rawText);
        const sanitizedText = thinkInfo.text || '';

        if (!force) {
            const delta = sanitizedText.length - state.lastCheckedCharCount;
            if (delta < STREAM_MONITOR_CHECK_INTERVAL) {
                return { cancel: false };
            }
            state.lastCheckedCharCount = sanitizedText.length;
        }

        if (thinkInfo.hasOpenThink) {
            return { cancel: false };
        }

        if (sanitizedText.length >= STREAM_OPEN_BRACE_MAX_CHARS && sanitizedText.indexOf('{') === -1) {
            state.cancelReason = STREAM_CANCEL_REASON.NO_OPENING_BRACE;
            return { cancel: true, reason: state.cancelReason };
        }

        const analysis = this.analyzeSanitizedStreamText(sanitizedText, state.expectedKeys);
        if (analysis.candidateMap) {
            this.rememberBestMonitorMap(state, analysis.candidateMap);
        }

        if (analysis.cancelReason) {
            state.cancelReason = analysis.cancelReason;
            state.cancelMeta = analysis.cancelMeta || null;
            return { cancel: true, reason: state.cancelReason };
        }

        return { cancel: false, isComplete: !!analysis.isComplete };
    }

    async requestChatCompletion(payload, options = {}) {
        const expectedKeys = Array.isArray(options.expectedKeys) ? options.expectedKeys : [];
        const isBackgroundJob = !!options.isBackgroundJob;
        const monitorState = this.buildStreamMonitorState(expectedKeys);
        const outgoingPayload = preprocessPayloadForLlm(payload);
        const requestMeta = {
            isBackgroundJob,
            externalCancelReason: null,
            startedAt: Date.now()
        };
        const requestPayload = {
            ...outgoingPayload,
            stream: true
        };

        const url = this.getChatUrl();
        await this.waitForBackgroundPriority(isBackgroundJob);

        const abortController = new AbortController();
        this._activeAbortController = abortController;
        this._activeRequestMeta = requestMeta;
        let rawText = '';
        let cancelledByGuardrail = false;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: this.getRequestHeaders(),
                body: JSON.stringify(requestPayload),
                signal: abortController.signal
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const contentType = (response.headers.get('content-type') || '').toLowerCase();
            const isEventStream = contentType.includes('text/event-stream');

            if (!isEventStream || !response.body || typeof response.body.getReader !== 'function') {
                const data = await response.json();
                const message = data && data.choices && data.choices[0] ? data.choices[0].message : null;
                rawText = this.extractMessageText(message) || '';
                const guardrail = this.applyStreamGuardrails(monitorState, rawText, true);
                return {
                    text: rawText,
                    bestMap: monitorState.bestMap,
                    cancelledByGuardrail: !!guardrail.cancel,
                    cancelReason: monitorState.cancelReason,
                    responseData: data
                };
            }

            const decoder = new TextDecoder();
            const reader = response.body.getReader();
            let eventBuffer = '';
            let done = false;

            while (!done) {
                const readResult = await reader.read();
                done = !!readResult.done;
                if (readResult.value) {
                    eventBuffer += decoder.decode(readResult.value, { stream: true });
                    eventBuffer = eventBuffer.replace(/\r\n/g, '\n');
                }

                let splitIndex = eventBuffer.indexOf('\n\n');
                while (splitIndex >= 0) {
                    const rawEvent = eventBuffer.slice(0, splitIndex);
                    eventBuffer = eventBuffer.slice(splitIndex + 2);

                    const lines = rawEvent.split(/\r?\n/);
                    const dataLines = lines
                        .filter(line => line.startsWith('data:'))
                        .map(line => line.slice(5).trim())
                        .filter(Boolean);

                    for (const dataLine of dataLines) {
                        if (dataLine === '[DONE]') {
                            done = true;
                            break;
                        }

                        let payloadChunk;
                        try {
                            payloadChunk = JSON.parse(dataLine);
                        } catch (e) {
                            continue;
                        }

                        const deltaText = this.extractStreamingDeltaText(payloadChunk);
                        if (!deltaText) {
                            continue;
                        }

                        rawText += deltaText;
                        const guardrail = this.applyStreamGuardrails(monitorState, rawText, false);
                        if (guardrail.cancel) {
                            cancelledByGuardrail = true;
                            abortController.abort();
                            done = true;
                            break;
                        }
                    }

                    if (done) {
                        break;
                    }

                    splitIndex = eventBuffer.indexOf('\n\n');
                }
            }

            if (eventBuffer.trim().length > 0 && !cancelledByGuardrail) {
                const lines = eventBuffer.split(/\r?\n/);
                const dataLines = lines
                    .filter(line => line.startsWith('data:'))
                    .map(line => line.slice(5).trim())
                    .filter(Boolean);

                for (const dataLine of dataLines) {
                    if (dataLine === '[DONE]') {
                        break;
                    }
                    let payloadChunk;
                    try {
                        payloadChunk = JSON.parse(dataLine);
                    } catch (e) {
                        continue;
                    }
                    const deltaText = this.extractStreamingDeltaText(payloadChunk);
                    if (!deltaText) {
                        continue;
                    }
                    rawText += deltaText;
                    const guardrail = this.applyStreamGuardrails(monitorState, rawText, false);
                    if (guardrail.cancel) {
                        cancelledByGuardrail = true;
                        break;
                    }
                }
            }

            const finalGuardrail = this.applyStreamGuardrails(monitorState, rawText, true);
            if (finalGuardrail.cancel) {
                cancelledByGuardrail = true;
            }

            return {
                text: rawText,
                bestMap: monitorState.bestMap,
                cancelledByGuardrail,
                cancelReason: monitorState.cancelReason,
                responseData: null
            };
        } catch (error) {
            const aborted = error && error.name === 'AbortError';
            if (aborted && monitorState.cancelReason) {
                return {
                    text: rawText,
                    bestMap: monitorState.bestMap,
                    cancelledByGuardrail: true,
                    cancelReason: monitorState.cancelReason,
                    responseData: null
                };
            }

            if (aborted && requestMeta.externalCancelReason === REQUEST_CANCEL_REASON.BACKGROUND_PREEMPTED) {
                const preemptError = new Error('Background request preempted by foreground');
                preemptError.code = REQUEST_CANCEL_REASON.BACKGROUND_PREEMPTED;
                preemptError.cancelReason = REQUEST_CANCEL_REASON.BACKGROUND_PREEMPTED;
                throw preemptError;
            }

            throw error;
        } finally {
            if (this._activeAbortController === abortController) {
                this._activeAbortController = null;
            }
            if (this._activeRequestMeta === requestMeta) {
                this._activeRequestMeta = null;
            }
        }
    }

    extractJsonLike(text) {
        if (typeof text !== 'string') {
            return '';
        }

        const trimmed = text.trim();
        if (!trimmed) {
            return '';
        }

        const match = trimmed.match(/\{[\s\S]*\}/);
        return match ? match[0].trim() : trimmed;
    }

    validateTranslatedMapShape(translatedMap, itemData) {
        if (!translatedMap || typeof translatedMap !== 'object' || Array.isArray(translatedMap)) {
            return {
                valid: false,
                reason: 'Response is not a JSON object map'
            };
        }

        const expectedKeys = itemData.map(item => `${typeToTag[item.type] || item.type}${item.index}`);
        const missingKeys = expectedKeys.filter(key => !Object.prototype.hasOwnProperty.call(translatedMap, key));

        if (missingKeys.length > 0) {
            return {
                valid: false,
                reason: `Missing required keys: ${missingKeys.join(', ')}`,
                missingKeys
            };
        }

        for (const key of expectedKeys) {
            if (typeof translatedMap[key] !== 'string') {
                return {
                    valid: false,
                    reason: `Key "${key}" must contain a string value`
                };
            }
        }

        return {
            valid: true,
            expectedKeys
        };
    }

    buildValidationTextFromMap(translatedMap, itemData) {
        if (!translatedMap || typeof translatedMap !== 'object' || Array.isArray(translatedMap)) {
            return '';
        }

        if (!Array.isArray(itemData) || itemData.length === 0) {
            return Object.values(translatedMap)
                .filter(value => typeof value === 'string')
                .join('\n');
        }

        const orderedValues = [];
        for (const item of itemData) {
            const key = `${typeToTag[item.type] || item.type}${item.index}`;
            const value = translatedMap[key];
            if (typeof value === 'string') {
                orderedValues.push(value);
            }
        }

        return orderedValues.join('\n');
    }

    async waitForBackgroundPriority(isBackgroundJob = false) {
        if (!isBackgroundJob) {
            return;
        }

        if (this.panel && typeof this.panel.waitForBackgroundTranslationSlot === 'function') {
            await this.panel.waitForBackgroundTranslationSlot();
        }
    }

    async validateResponseLanguage(validationText, targetName, sourceName, isBackgroundJob = false) {
        // Validate if response is in target language using AI
        if (!this.askAiIfTextTranslated) {
            return true;
        }

        try {
            const validationPayload = {
                model: this.selectedModel,
                messages: [
                    {
                        "role": "system",
                        "content": `Decide if text is translated to ${targetName}. Return only one-line JSON object with exactly one key: {"isTranslated":true} or {"isTranslated":false}. No markdown, no explanation, no arrays, no pretty formatting.`
                    },
                    {
                        "role": "user",
                        "content": `Input: 『岩を動かそう』\n巨大な岩が道を塞いでいる。\n岩を動かして道を進もう！\nAre you sure about that?`
                    },
                    {
                        "role": "assistant",
                        "content": `{"isTranslated":false}`
                    },
                    {
                        "role": "user",
                        "content": `Good. Now evaluate this input as one set: ${validationText}`
                    },
                ],
                response_format: { type: "json_object" }
            };

            const streamResult = await this.requestChatCompletion(validationPayload, {
                expectedKeys: ['isTranslated'],
                isBackgroundJob
            });

            let validationResult = streamResult.bestMap;

            if (!validationResult) {
                const sanitized = stripThinkBlocks(streamResult.text || '').text;
                const analyzed = this.analyzeSanitizedStreamText(sanitized, ['isTranslated']);
                validationResult = analyzed.candidateMap;
            }

            if (!validationResult || typeof validationResult !== 'object' || Array.isArray(validationResult)) {
                console.warn('[AIEngine] Validation response is not a JSON object:', streamResult.text);
                return false;
            }

            if (!Object.prototype.hasOwnProperty.call(validationResult, 'isTranslated')) {
                console.warn('[AIEngine] Validation response missing isTranslated:', validationResult);
                return false;
            }

            if (typeof validationResult.isTranslated !== 'boolean') {
                console.warn('[AIEngine] Validation response has invalid isTranslated type:', validationResult);
                return false;
            }

            return validationResult.isTranslated === true;
        } catch (error) {
            console.error('[AIEngine] Validation error:', error.message);
            return false;
        }
    }

    async retryTranslationWithError(originalPayload, responseJson, targetName, isBackgroundJob = false, expectedKeys = []) {
        // Retry translation with error feedback
        try {
            const retryPayload = {
                ...originalPayload,
                messages: [
                    ...originalPayload.messages,
                    {
                        "role": "assistant",
                        "content": responseJson
                    },
                    {
                        "role": "user",
                        "content": `Wrong! This is not ${targetName}! Try again!`
                    }
                ],
                ...requestSettings
            };

            const streamResult = await this.requestChatCompletion(retryPayload, {
                expectedKeys,
                isBackgroundJob
            });

            if (streamResult.bestMap && Object.keys(streamResult.bestMap).length > 0) {
                return JSON.stringify(streamResult.bestMap);
            }

            if (streamResult.cancelledByGuardrail) {
                console.warn('[AIEngine] Retry cancelled by stream guardrail:', streamResult.cancelReason);
                return null;
            }

            if (!streamResult.text) {
                console.warn('[AIEngine] Retry returned no content');
                return null;
            }

            return streamResult.text;
        } catch (error) {
            console.error('[AIEngine] Retry error:', error.message);
            return null;
        }
    }

    async retryJsonParsing(originalContent, invalidJsonResponse, errorMessage, depth = 0, isBackgroundJob = false) {
        // Retry with JSON parsing error feedback
        try {
            const retryPayload = {
                model: this.selectedModel,
                messages: [
                    {
                        "role": "system",
                        "content": "You fix translation jsons generated by LLM with malformed format. Only fix the json, do not comment or add anything else. Do not bold, DO NOT FORMAT THE RESPONSE, RETURN IT ALL IN ONE LINE"
                    },
                    {
                        "role": "user",
                        "content": "Fix broken translation json. Each message in translation json should be related to the same message key in original. \n Original: { \"message23\": \"はい\" } \n Broken Translation JSON: { \"message23: \"Yes\" } \n Error: Missing closing quote after message23 key"
                    },
                    {
                        "role": "assistant",
                        "content": "{ \"message23\": \"はい\" } { \"message23\": \"Yes\" }"
                    },
                    {
                        "role": "user",
                        "content": "Wrong. You've returned both original and translation. Only return the fixed translation json."
                    },
                    {
                        "role": "assistant",
                        "content": "{ \"message23\": \"Yes\" }"
                    },
                    {
                        "role": "user",
                        "content": `Good. Now fix broken translation json. Each message in translation json should be related to the same message key in original. \n Original: ${originalContent} \n Broken Translation JSON: ${invalidJsonResponse} \n Error: ${errorMessage}`
                    }
                ],
                ...requestSettings
            };

            const expectedKeys = this.extractExpectedKeysFromJsonLike(originalContent);
            const streamResult = await this.requestChatCompletion(retryPayload, {
                expectedKeys,
                isBackgroundJob
            });

            if (streamResult.cancelledByGuardrail && (!streamResult.bestMap || Object.keys(streamResult.bestMap).length === 0)) {
                console.warn('[AIEngine] JSON parsing retry cancelled by stream guardrail:', streamResult.cancelReason);
                return null;
            }

            const responseContent = streamResult.bestMap && Object.keys(streamResult.bestMap).length > 0
                ? JSON.stringify(streamResult.bestMap)
                : streamResult.text;

            if (!responseContent) {
                console.warn('[AIEngine] JSON parsing retry returned no content');
                return null;
            }

            console.log('[AIEngine] JSON parsing retry response:', responseContent, invalidJsonResponse);
            try {
                JSON.parse(this.extractJsonLike(responseContent));
            } catch (parseError) {
                const reachedDepthLimit = (this.aiFixRecursionMaxDepth > 0 && depth >= this.aiFixRecursionMaxDepth);
                if (responseContent === invalidJsonResponse || reachedDepthLimit) {
                    console.warn('[AIEngine] JSON parsing retry returned same invalid response or reached recursion depth, aborting further retries.');
                    return responseContent;
                }
                console.warn('[AIEngine] JSON parsing retry still invalid:', responseContent);
                return this.retryJsonParsing(originalContent, responseContent, parseError.message, depth + 1, isBackgroundJob);
            }

            return responseContent;
        } catch (error) {
            console.error('[AIEngine] JSON parsing retry error:', error.message);
            return null;
        }
    }

    async resendFirstHalfOfItems(itemData, payload, isBackgroundJob = false) {
        // Split request into two sequential halves and merge responses.
        try {
            const halfCount = Math.ceil(itemData.length / 2);
            const chunks = [
                itemData.slice(0, halfCount),
                itemData.slice(halfCount)
            ].filter(chunk => Array.isArray(chunk) && chunk.length > 0);

            console.log(`[AIEngine] Split-half resend: ${itemData.length} items -> chunks [${chunks.map(c => c.length).join(', ')}]`);

            const mergedMap = {};

            for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
                const chunkItems = chunks[chunkIndex];
                const jsonMap = {};

                chunkItems.forEach(item => {
                    const shortTag = typeToTag[item.type] || item.type;
                    const key = `${shortTag}${item.index}`;
                    jsonMap[key] = item.preprocessed;
                });

                const content = JSON.stringify(jsonMap);
                const messages = payload.messages.slice(0, -1);
                messages.push({
                    "role": "user",
                    "content": `Try again with split batch (${chunkIndex + 1}/${chunks.length}). Translate only this subset and keep exact keys: ${content}`
                });

                const retryPayload = {
                    ...payload,
                    ...buildRequestSettingsForContent(content),
                    messages
                };

                const chunkExpectedKeys = chunkItems.map(item => `${typeToTag[item.type] || item.type}${item.index}`);
                const streamResult = await this.requestChatCompletion(retryPayload, {
                    expectedKeys: chunkExpectedKeys,
                    isBackgroundJob
                });

                if (streamResult.cancelledByGuardrail && (!streamResult.bestMap || Object.keys(streamResult.bestMap).length === 0)) {
                    console.warn(`[AIEngine] Split-half resend (${chunkIndex + 1}/${chunks.length}) cancelled by stream guardrail:`, streamResult.cancelReason);
                    return null;
                }

                const responseContent = streamResult.bestMap && Object.keys(streamResult.bestMap).length > 0
                    ? JSON.stringify(streamResult.bestMap)
                    : streamResult.text;

                if (!responseContent && !streamResult.bestMap) {
                    console.warn(`[AIEngine] Split-half resend (${chunkIndex + 1}/${chunks.length}) returned no content`);
                    return null;
                }

                let chunkMap;
                if (streamResult.bestMap && Object.keys(streamResult.bestMap).length > 0) {
                    chunkMap = streamResult.bestMap;
                } else {
                    try {
                        chunkMap = JSON.parse(this.extractJsonLike(responseContent));
                    } catch (parseError) {
                        console.warn(`[AIEngine] Split-half resend (${chunkIndex + 1}/${chunks.length}) invalid JSON:`, parseError.message);
                        return null;
                    }
                }

                const shapeCheck = this.validateTranslatedMapShape(chunkMap, chunkItems);
                if (!shapeCheck.valid) {
                    console.warn(`[AIEngine] Split-half resend (${chunkIndex + 1}/${chunks.length}) invalid shape:`, shapeCheck.reason);
                    return null;
                }

                Object.assign(mergedMap, chunkMap);
            }

            return JSON.stringify(mergedMap);
        } catch (error) {
            console.error('[AIEngine] Split-half resend error:', error.message);
            return null;
        }
    }

    async batchTranslate(items, options = {}) {
        // items: [{ type, id, value, cacheKey }]
        if (!Array.isArray(items) || !items.length) {
            return { successes: [], failures: [] };
        }

        const isBackgroundJob = !!(options && options.backgroundJob);

        if (!this.selectedModel) {
            console.warn('[AIEngine] No model selected');
            return {
                successes: [],
                failures: items.map(item => ({
                    rejectReason: 'No model selected'
                }))
            };
        }

        // Preprocess each item individually to track tags
        const itemData = items.map((item, i) => {
            const { text: preprocessed, tagCounts, caseMap } = this.preprocessTags(item.value || '');
            return { ...item, index: i, preprocessed, tagCounts, caseMap };
        });

        // Build JSON map from items
        const jsonMap = {};
        itemData.forEach(item => {
            const shortTag = typeToTag[item.type] || item.type;
            const key = `${shortTag}${item.index}`;
            jsonMap[key] = item.preprocessed;
        });

        // Build name hints for the system prompt
        const allTextForHints = itemData.map(item => item.preprocessed).join(' ');
        const nameHints = this.buildNameHints(allTextForHints);

        const sourceName = this.getLanguageName(this.panel.sourceLang);
        const targetName = this.getLanguageName(this.panel.targetLang);
        const content = JSON.stringify(jsonMap);
        const expectedKeys = Object.keys(jsonMap);

        console.log('[AIEngine] Batch translate items:', items.length, 'JSON keys:', Object.keys(jsonMap).length);
        console.log('[AIEngine] Request JSON map:', content);

        const payload = {
            model: this.selectedModel,
            messages: [
                {
                    "role": "system",
                    "content": this.systemPrompt
                },
                {
                    "role": "system",
                    "content": `Translate video game text from ${sourceName} to ${targetName}. Return only flat one-line JSON object with exactly the same keys as input. No markdown, no comments, no extra keys, no missing keys, no duplicate keys, no arrays, no pretty formatting. Preserve every [[tag]] exactly and keep tag order unchanged. Character name hints: ${nameHints}`
                },
                {
                    "role": "user",
                    "content": `{"${typeToTag.text}0":"それはいいですね","${typeToTag.text}1":"情報\\nありがとうございます。"}`
                },
                {
                    "role": "assistant",
                    "content": `{"${typeToTag.text}0":"That's great","${typeToTag.text}1":"Thank you for the information"}`
                },
                {
                    "role": "user",
                    "content": `Good. Keep this one-line JSON style and exact keys! Now translate this: ${content}`
                }
            ],
            ...buildRequestSettingsForContent(content)
        };

        try {
            const streamResult = await this.requestChatCompletion(payload, {
                expectedKeys,
                isBackgroundJob
            });

            if (!streamResult.text && !streamResult.bestMap) {
                console.warn('[AIEngine] Batch returned no content');
                return {
                    successes: [],
                    failures: items.map(item => ({ ...item, rejectReason: 'No content' }))
                };
            }

            let rawTranslated = streamResult.text || '';
            console.log('[AIEngine] Response content:', rawTranslated);

            // Parse JSON response
            const streamPartialMatchedKeys = this.getMatchedExpectedKeyCount(streamResult.bestMap, expectedKeys);

            let translatedMap = streamPartialMatchedKeys > 0
                ? streamResult.bestMap
                : null;

            const guardrailPartialMap = !!(
                streamResult.cancelledByGuardrail
                && translatedMap
                && !this.isMapComplete(translatedMap, expectedKeys)
            );

            try {
                if (!translatedMap) {
                    translatedMap = JSON.parse(this.extractJsonLike(rawTranslated));
                }
            } catch (parseError) {
                console.error('[AIEngine] Failed to parse JSON response:', parseError.message);
                console.log('[AIEngine] Invalid JSON Handling Strategy:', this.invalidJsonHandlingStrategy);

                if (streamResult.cancelledByGuardrail && streamPartialMatchedKeys > 0) {
                    translatedMap = streamResult.bestMap;
                    rawTranslated = JSON.stringify(streamResult.bestMap);
                } else {
                    let retryResponse = null;

                    if (this.invalidJsonHandlingStrategy === 'resendFirstHalf' && itemData.length > 1) {
                        console.log('[AIEngine] Using resendFirstHalf strategy...');
                        retryResponse = await this.resendFirstHalfOfItems(itemData, payload, isBackgroundJob);
                    } else if (this.invalidJsonHandlingStrategy === 'askAIToFix' || this.invalidJsonHandlingStrategy === 'resendFirstHalf' && itemData.length === 1) {
                        console.log('[AIEngine] Using askAIToFix strategy (retryJsonParsing)...');
                        retryResponse = await this.retryJsonParsing(content, rawTranslated, parseError.message, 0, isBackgroundJob);
                    } else if (this.invalidJsonHandlingStrategy === 'useJsonFixer') {
                        console.log('[AIEngine] Using useJsonFixer strategy (useJsonFixerApi)...');
                        retryResponse = await this.useJsonFixerApi(rawTranslated, isBackgroundJob);
                    }

                    if (this.invalidJsonHandlingStrategy === 'none') {
                        console.log('[AIEngine] Using none strategy - no retry');
                        retryResponse = null;
                    }

                    console.log('[AIEngine] Retry response for JSON parsing:', retryResponse);
                    if (retryResponse) {
                        try {
                            translatedMap = JSON.parse(this.extractJsonLike(retryResponse));
                            console.log('[AIEngine] Retry response parsed successfully');
                            rawTranslated = retryResponse;
                        } catch (retryParseError) {
                            console.error('[AIEngine] Failed to parse retry JSON response:', retryParseError.message);
                            translatedMap = await this.useJsonFixerApi(retryResponse, isBackgroundJob);
                            if (!translatedMap) {
                                return {
                                    successes: [],
                                    failures: items.map(item => ({ ...item, rejectReason: 'Invalid JSON response (retry also failed)' }))
                                };
                            }
                        }
                    } else {
                        console.warn('[AIEngine] JSON parsing strategy returned null or failed');
                        return {
                            successes: [],
                            failures: items.map(item => ({ ...item, rejectReason: streamResult.cancelReason || 'Invalid JSON response' }))
                        };
                    }
                }
            }

            // Validate response language
            let shapeCheck = this.validateTranslatedMapShape(translatedMap, itemData);
            if (!shapeCheck.valid) {
                if (guardrailPartialMap) {
                    console.warn('[AIEngine] Streaming guardrail returned partial map. Skipping shape retry and keeping partial translations.');
                } else {
                    console.warn('[AIEngine] Response JSON has invalid map shape before language validation:', shapeCheck.reason, translatedMap);
                    const retryReason = `No good! You must return a JSON object map with EXACT keys from source. ${shapeCheck.reason}. Try again.`;
                    const retryResponse = await this.retryTranslationWithError(payload, rawTranslated, retryReason, isBackgroundJob, expectedKeys);

                    if (retryResponse) {
                        try {
                            const retryMap = JSON.parse(this.extractJsonLike(retryResponse));
                            shapeCheck = this.validateTranslatedMapShape(retryMap, itemData);
                            if (!shapeCheck.valid) {
                                return {
                                    successes: [],
                                    failures: items.map(item => ({ ...item, rejectReason: `Invalid JSON map shape after retry: ${shapeCheck.reason}` }))
                                };
                            }
                            rawTranslated = retryResponse;
                            translatedMap = retryMap;
                        } catch (retryParseError) {
                            return {
                                successes: [],
                                failures: items.map(item => ({ ...item, rejectReason: 'Invalid retry JSON response' }))
                            };
                        }
                    } else {
                        return {
                            successes: [],
                            failures: items.map(item => ({ ...item, rejectReason: `Invalid JSON map shape: ${shapeCheck.reason}` }))
                        };
                    }
                }
            }

            // Validate response language
            if (!guardrailPartialMap && shapeCheck.valid) {
                console.log('[AIEngine] Validating response language...');
                const validationText = this.buildValidationTextFromMap(translatedMap, itemData);
                const isValid = await this.validateResponseLanguage(validationText, targetName, sourceName, isBackgroundJob);

                if (!isValid) {
                    console.log('[AIEngine] Validation failed, retrying with error feedback...');
                    const retryResponse = await this.retryTranslationWithError(payload, rawTranslated, targetName, isBackgroundJob, expectedKeys);

                    if (retryResponse) {
                        try {
                            const retryMap = JSON.parse(this.extractJsonLike(retryResponse));
                            const retryShapeCheck = this.validateTranslatedMapShape(retryMap, itemData);
                            if (!retryShapeCheck.valid) {
                                return {
                                    successes: [],
                                    failures: items.map(item => ({ ...item, rejectReason: `Invalid retry JSON map shape: ${retryShapeCheck.reason}` }))
                                };
                            }
                            console.log('[AIEngine] Retry response parsed successfully', retryMap);
                            rawTranslated = retryResponse;
                            translatedMap = retryMap;
                        } catch (retryParseError) {
                            console.error('[AIEngine] Failed to parse retry response:', retryParseError.message);
                            return {
                                successes: [],
                                failures: items.map(item => ({ ...item, rejectReason: 'Invalid retry JSON response' }))
                            };
                        }
                    } else {
                        console.warn('[AIEngine] Retry translation failed');
                        return {
                            successes: [],
                            failures: items.map(item => ({ ...item, rejectReason: 'Translation validation failed and retry failed' }))
                        };
                    }
                } else {
                    console.log('[AIEngine] Validation passed');
                }
            }

            const successes = [];
            const failures = [];

            // Process each item individually
            for (const itemD of itemData) {
                const shortTag = typeToTag[itemD.type] || itemD.type;
                const key = `${shortTag}${itemD.index}`;

                // Get translated value from JSON map
                const rawSlice = translatedMap[key];

                if (rawSlice === undefined || rawSlice === null) {
                    failures.push({
                        type: itemD.type,
                        id: itemD.id,
                        value: itemD.value,
                        cacheKey: itemD.cacheKey,
                        rejectReason: `Missing key "${key}" in response`
                    });
                    continue;
                }

                if (typeof rawSlice !== 'string') {
                    failures.push({
                        type: itemD.type,
                        id: itemD.id,
                        value: itemD.value,
                        cacheKey: itemD.cacheKey,
                        rejectReason: `Value for key "${key}" is not a string`
                    });
                    continue;
                }

                // Validate unknown tags before postprocessing
                const unknownTagCheck = this.validateUnknownTags(rawSlice, itemD.preprocessed);
                if (!unknownTagCheck.valid && (itemD.type === 'text' || itemD.type === 'choice')) {
                    failures.push({
                        type: itemD.type,
                        id: itemD.id,
                        value: itemD.value,
                        cacheKey: itemD.cacheKey,
                        rejectReason: `Unknown tag: ${unknownTagCheck.unknownTag}`
                    });
                    continue;
                }

                // Postprocess with tag tracking
                const { text: translated, valid, expectedCounts, actualCounts } = this.postprocessTags(rawSlice, itemD.tagCounts, itemD.caseMap);

                // Check if invalid due to tag mismatch
                if (!valid) {
                    failures.push({
                        type: itemD.type,
                        id: itemD.id,
                        value: itemD.value,
                        cacheKey: itemD.cacheKey,
                        rejectReason: "Tag count mismatch"
                    });
                    continue;
                }

                // Clean and wrap text/choice types and descriptions
                let finalTranslated = translated;
                const isDescriptionType = (typeof itemD.type === 'string' && itemD.type.endsWith('_description'));
                if (itemD.type === 'text' || itemD.type === 'choice' || isDescriptionType) {
                    const maxWidth = isDescriptionType ? (this.panel.descriptionMaxLineWidth || this.panel.maxLineWidth) : this.panel.maxLineWidth;
                    finalTranslated = this.wrapText(this.cleanTranslatedText(translated), maxWidth);
                } else if (itemD.type === 'speaker') {
                    finalTranslated = this.normalizeSpeakerNameCase(translated);
                }

                successes.push({
                    type: itemD.type,
                    id: itemD.id,
                    value: itemD.value,
                    translated: finalTranslated,
                    cacheKey: itemD.cacheKey
                });
            }

            console.log(`[AIEngine] Batch complete: ${successes.length} successes, ${failures.length} failures`);
            return { successes, failures };

        } catch (error) {
            if (this.isBackgroundPreemptedError(error)) {
                return {
                    successes: [],
                    failures: items.map(item => ({
                        ...item,
                        rejectReason: 'Background request preempted by foreground',
                        preempted: true,
                        cancelReason: REQUEST_CANCEL_REASON.BACKGROUND_PREEMPTED
                    }))
                };
            }

            console.error('[AIEngine] Batch error:', error.message);
            return {
                successes: [],
                failures: items.map(item => ({
                    ...item,
                    rejectReason: `Exception: ${error.message}`
                }))
            };
        }
    }

    async useJsonFixerApi(invalidJson, isBackgroundJob = false) {
        if (!this.useJsonFixer) {
            console.warn('[AIEngine] JSON fixer API calls disabled by user setting');
            return null;
        }
        const apiUrl = 'https://mangiucugna.pythonanywhere.com/api/repair-json';
        try {
            await this.waitForBackgroundPriority(isBackgroundJob);
            const response = await axios.post(apiUrl, { malformedJSON: invalidJson });
            if (response && response.data && response.data[0]) {
                console.log('[AIEngine] JSON fixed using external API');
                return response.data[0];
            } else {
                console.warn('[AIEngine] JSON fixer API returned invalid response');
                return null;
            }
        } catch (error) {
            console.error('[AIEngine] JSON fixer API error:', error.message);
            return null;
        }
    }

}
