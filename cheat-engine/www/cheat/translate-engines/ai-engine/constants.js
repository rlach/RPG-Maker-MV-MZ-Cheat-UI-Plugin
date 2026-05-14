/**
 * Constants for AIEngine module family
 * Central configuration and enum definitions
 */

export const TAG_TYPE = Object.freeze({
    WITH_NUMERIC_PARAMETER: 'withNumericParameter',
    WITHOUT_PARAMETER: 'withoutParameter',
    WITH_CUSTOM_PARAMETER: 'withCustomParameter',
    XML: 'xml', // legacy — kept for backward compatibility; prefer style: TAG_STYLE.XML
});

/**
 * Tag rendering style.
 * ESCAPE: classic RPG Maker escape codes, e.g. \C[5] or \N<name>
 * XML:    angle-bracket tags,              e.g. <SGOrder:5> or <br>
 */
export const TAG_STYLE = Object.freeze({
    ESCAPE: 'escape',
    XML: 'xml',
});

export const TAG_STYLE_OPTIONS = Object.freeze([
    { text: 'Escape style (\\Symbol)', value: TAG_STYLE.ESCAPE },
    { text: 'XML style (<Symbol>)', value: TAG_STYLE.XML },
]);

export const TAG_BRACKET = Object.freeze({
    ANGLE: '<',
    SQUARE: '[',
    ROUND: '(',
    CURLY: '{',
    NONE: 'none', // XML-style colon separator: <Symbol:value>
});

export const TAG_BRACKET_OPTIONS = Object.freeze([
    { text: '< >', value: TAG_BRACKET.ANGLE },
    { text: '[ ]', value: TAG_BRACKET.SQUARE },
    { text: '( )', value: TAG_BRACKET.ROUND },
    { text: '{ }', value: TAG_BRACKET.CURLY },
    { text: 'none (xml :value)', value: TAG_BRACKET.NONE },
]);

export const TAG_TYPE_OPTIONS = Object.freeze([
    { text: 'withNumericParameter', value: TAG_TYPE.WITH_NUMERIC_PARAMETER },
    { text: 'withoutParameter', value: TAG_TYPE.WITHOUT_PARAMETER },
    { text: 'withCustomParameter', value: TAG_TYPE.WITH_CUSTOM_PARAMETER },
    // TAG_TYPE.XML is omitted — create xml-style tags via style: TAG_STYLE.XML instead
]);

// Base tag configuration. Regex patterns are generated once in TagManager initialization.
export const TAG_CONFIGS = [
    {
        description: 'Will be replaced with the value of the nth variable.',
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'V',
        reservedWidth: 6,
        requiredConsistency: true,
    },
    {
        description: 'Will be replaced with the name of the nth actor.',
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'N',
        reservedWidth: 6,
        extraPromptForLlm:
            'This tag represents names, so treat them as such in text. NEVER change those tags into pronouns or implied subject.',
        requiredConsistency: true,
    },
    {
        description: 'Will be replaced by the name of the nth (arranged order) party member.',
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'P',
        reservedWidth: 6,
        requiredConsistency: true,
    },
    {
        description: 'Will be replaced by the currency unit.',
        type: TAG_TYPE.WITHOUT_PARAMETER,
        tagSymbol: 'G',
        requiredConsistency: true,
    },
    {
        description:
            'Draw the subsequent text in the nth color. Text color conforms to the contents of the [Window.png] system image.',
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'C',
        requiredConsistency: false,
    },
    {
        description: 'Draws the nth icon.',
        type: TAG_TYPE.WITH_NUMERIC_PARAMETER,
        tagSymbol: 'I',
        requiredConsistency: false,
    },
    {
        description: 'Increases the text by 1 step.',
        type: TAG_TYPE.WITHOUT_PARAMETER,
        tagSymbol: '{',
        requiredConsistency: false,
    },
    {
        description: 'Decreases the text by 1 step.',
        type: TAG_TYPE.WITHOUT_PARAMETER,
        tagSymbol: '}',
        requiredConsistency: false,
    },
    {
        description: 'Replaced with the backslash character.',
        type: TAG_TYPE.WITHOUT_PARAMETER,
        tagSymbol: '\\',
        requiredConsistency: false,
    },
    {
        description: 'Open the gold window.',
        type: TAG_TYPE.WITHOUT_PARAMETER,
        tagSymbol: '$',
        requiredConsistency: true,
    },
    {
        description: 'Wait for 1/4 second.',
        type: TAG_TYPE.WITHOUT_PARAMETER,
        tagSymbol: '.',
        requiredConsistency: false,
    },
    {
        description: 'Wait for 1 second.',
        type: TAG_TYPE.WITHOUT_PARAMETER,
        tagSymbol: '|',
        requiredConsistency: false,
    },
    {
        description: 'Wait for button input.',
        type: TAG_TYPE.WITHOUT_PARAMETER,
        tagSymbol: '!',
        requiredConsistency: false,
    },
    {
        description: 'Display remaining text on same line all at once.',
        type: TAG_TYPE.WITHOUT_PARAMETER,
        tagSymbol: '>',
        requiredConsistency: false,
    },
    {
        description: 'Cancel the effect that displays text all at once.',
        type: TAG_TYPE.WITHOUT_PARAMETER,
        tagSymbol: '<',
        requiredConsistency: false,
    },
    {
        description: 'Do not wait for input after displaying the next.',
        type: TAG_TYPE.WITHOUT_PARAMETER,
        tagSymbol: '^',
        requiredConsistency: false,
    },
];

export const DEFAULT_SYSTEM_PROMPT =
    "You are translating scripts that contain [b=tags] in the form [b=shortcode]. Altering contents or order of any such tags, removing or adding tags will break the script. Preserve every [b=tag] exactly and keep tag order unchanged. The only exception are tags with <values> like this - [b=na<しえる>]. In this case the <value> can be translated, but otherwise don't modify the tag. NEVER treat 【】as tags. Only translate the text between tags and <> values. Return only flat one-line JSON with exactly the same keys as input. No markdown, no comments, no code blocks, no extra keys, no missing keys, no duplicate keys, no arrays, no pretty formatting. Keys with the same prefix+index are context-linked fields of one entity (for example i0n and i0d are one item), so they must stay semantically consistent.";

export const DEFAULT_BANNED_PHRASES = Object.freeze(['tool_call', 'JSON']);
export const DEFAULT_BANNED_PHRASES_TEXT = DEFAULT_BANNED_PHRASES.join('\n');

export const TYPE_TO_TAG = {
    text: 'm',
    message: 'm',
    message_portrait: 'm',
    scroll_text: 'm',
    speaker: 'm',
    choice: 'm',
};

export const REQUEST_SETTINGS = {
    stream: true,
    temperature: 0.7,
    repetition_penalty: 1.0,
    presence_penalty: 1.5,
    top_p: 0.8,
    top_k: 20,
    response_format: { type: 'json_object' },
};

export const buildRequestSettingsForContent = (content) => ({
    ...REQUEST_SETTINGS,
    max_tokens: Math.max(1, (typeof content === 'string' ? content.length : 0) * 5),
});

// Stream monitoring constants
export const STREAM_MONITOR_CHECK_INTERVAL = 64;
export const STREAM_OPEN_BRACE_MAX_CHARS = 100;
export const LLM_MAX_CONSECUTIVE_IDENTICAL_CHARS = 5;

export const STREAM_CANCEL_REASON = Object.freeze({
    NO_OPENING_BRACE: 'no_opening_brace',
    INVALID_JSON_PROGRESS: 'invalid_json_progress',
    UNKNOWN_KEY: 'unknown_key',
    DUPLICATE_KEY: 'duplicate_key',
    TRIM_TOO_LONG: 'trim_too_long',
    COMPLETE_JSON_CONTINUED: 'complete_json_continued',
    BANNED_PHRASE: 'banned_phrase',
});

export const REQUEST_CANCEL_REASON = Object.freeze({
    BACKGROUND_PREEMPTED: 'background_preempted',
    REQUEST_ABORTED: 'request_aborted',
});
