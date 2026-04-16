/**
 * Constants for AIEngine module family
 * Central configuration and enum definitions
 */

export const TAG_TYPE = Object.freeze({
  WITH_NUMERIC_PARAMETER: "withNumericParameter",
  WITHOUT_PARAMETER: "withoutParameter",
  WITH_CUSTOM_PARAMETER: "withCustomParameter",
  XML: "xml", // legacy — kept for backward compatibility; prefer style: TAG_STYLE.XML
});

/**
 * Tag rendering style.
 * ESCAPE: classic RPG Maker escape codes, e.g. \C[5] or \N<name>
 * XML:    angle-bracket tags,              e.g. <SGOrder:5> or <br>
 */
export const TAG_STYLE = Object.freeze({
  ESCAPE: "escape",
  XML: "xml",
});

export const TAG_STYLE_OPTIONS = Object.freeze([
  { text: "Escape style (\\Symbol)", value: TAG_STYLE.ESCAPE },
  { text: "XML style (<Symbol>)", value: TAG_STYLE.XML },
]);

export const TAG_BRACKET = Object.freeze({
  ANGLE: "<",
  SQUARE: "[",
  ROUND: "(",
  CURLY: "{",
  NONE: "none", // XML-style colon separator: <Symbol:value>
});

export const TAG_BRACKET_OPTIONS = Object.freeze([
  { text: "< >", value: TAG_BRACKET.ANGLE },
  { text: "[ ]", value: TAG_BRACKET.SQUARE },
  { text: "( )", value: TAG_BRACKET.ROUND },
  { text: "{ }", value: TAG_BRACKET.CURLY },
  { text: "none (xml :value)", value: TAG_BRACKET.NONE },
]);

export const TAG_TYPE_OPTIONS = Object.freeze([
  { text: "withNumericParameter", value: TAG_TYPE.WITH_NUMERIC_PARAMETER },
  { text: "withoutParameter", value: TAG_TYPE.WITHOUT_PARAMETER },
  { text: "withCustomParameter", value: TAG_TYPE.WITH_CUSTOM_PARAMETER },
  // TAG_TYPE.XML is omitted — create xml-style tags via style: TAG_STYLE.XML instead
]);

// Base tag configuration. Regex patterns are generated once in TagManager initialization.
export const TAG_CONFIGS = [
  { description: "variable", type: TAG_TYPE.WITH_NUMERIC_PARAMETER, tagSymbol: "V", requiredConsistency: true },
  { description: "actor", type: TAG_TYPE.WITH_NUMERIC_PARAMETER, tagSymbol: "N", requiredConsistency: true },
  { description: "partyMember", type: TAG_TYPE.WITH_NUMERIC_PARAMETER, tagSymbol: "P", requiredConsistency: true },
  { description: "icon", type: TAG_TYPE.WITH_NUMERIC_PARAMETER, tagSymbol: "I", requiredConsistency: false },
  { description: "color", type: TAG_TYPE.WITH_NUMERIC_PARAMETER, tagSymbol: "C", requiredConsistency: false },

  { description: "reset color", type: TAG_TYPE.WITHOUT_PARAMETER, tagSymbol: "C", requiredConsistency: false },
  { description: "gold", type: TAG_TYPE.WITHOUT_PARAMETER, tagSymbol: "$", requiredConsistency: true },
  { description: "sizeInc", type: TAG_TYPE.WITHOUT_PARAMETER, tagSymbol: "{", requiredConsistency: false },
  { description: "sizeDec", type: TAG_TYPE.WITHOUT_PARAMETER, tagSymbol: "}", requiredConsistency: false },
  { description: "backslash", type: TAG_TYPE.WITHOUT_PARAMETER, tagSymbol: "\\", requiredConsistency: false },
  { description: "waitQuarter", type: TAG_TYPE.WITHOUT_PARAMETER, tagSymbol: ".", requiredConsistency: false },
  { description: "waitSecond", type: TAG_TYPE.WITHOUT_PARAMETER, tagSymbol: "|", requiredConsistency: false },
  { description: "waitInput", type: TAG_TYPE.WITHOUT_PARAMETER, tagSymbol: "!", requiredConsistency: false },
  { description: "displayAll", type: TAG_TYPE.WITHOUT_PARAMETER, tagSymbol: ">", requiredConsistency: false },
  { description: "cancelDisplayAll", type: TAG_TYPE.WITHOUT_PARAMETER, tagSymbol: "<", requiredConsistency: false },
  { description: "noWaitInput", type: TAG_TYPE.WITHOUT_PARAMETER, tagSymbol: "^", requiredConsistency: false },

  { description: "wait", type: TAG_TYPE.WITH_NUMERIC_PARAMETER, tagSymbol: "W", requiredConsistency: false },

  {
    description: "nameWindowLeft",
    type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
    tagSymbol: "N",
    bracket: TAG_BRACKET.ANGLE,
    maskValue: false,
    requiredConsistency: false,
  },
  {
    description: "nameWindowCenter",
    type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
    tagSymbol: "NC",
    bracket: TAG_BRACKET.ANGLE,
    maskValue: false,
    requiredConsistency: false,
  },
  {
    description: "nameWindowRight",
    type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
    tagSymbol: "NR",
    bracket: TAG_BRACKET.ANGLE,
    maskValue: false,
    requiredConsistency: false,
  },

  { description: "lineBreak", style: TAG_STYLE.XML, type: TAG_TYPE.WITHOUT_PARAMETER, tagSymbol: "br", requiredConsistency: false },

  { description: "posX", type: TAG_TYPE.WITH_NUMERIC_PARAMETER, tagSymbol: "PX", requiredConsistency: false },
  { description: "posY", type: TAG_TYPE.WITH_NUMERIC_PARAMETER, tagSymbol: "PY", requiredConsistency: false },
  { description: "outlineColor", type: TAG_TYPE.WITH_NUMERIC_PARAMETER, tagSymbol: "OC", requiredConsistency: false },
  { description: "outlineWidth", type: TAG_TYPE.WITH_NUMERIC_PARAMETER, tagSymbol: "OW", requiredConsistency: false },

  { description: "fontReset", type: TAG_TYPE.WITHOUT_PARAMETER, tagSymbol: "FR", requiredConsistency: false, addSpace: true },
  { description: "fontSize", type: TAG_TYPE.WITH_NUMERIC_PARAMETER, tagSymbol: "FS", requiredConsistency: false },
  {
    description: "fontName",
    type: TAG_TYPE.WITH_CUSTOM_PARAMETER,
    tagSymbol: "FN",
    bracket: TAG_BRACKET.ANGLE,
    maskValue: false,
    requiredConsistency: false,
  },
  { description: "fontBold", type: TAG_TYPE.WITHOUT_PARAMETER, tagSymbol: "FB", requiredConsistency: false, addSpace: true },
  { description: "fontItalic", type: TAG_TYPE.WITHOUT_PARAMETER, tagSymbol: "FI", requiredConsistency: false, addSpace: true },

  { description: "actorFace", type: TAG_TYPE.WITH_NUMERIC_PARAMETER, tagSymbol: "AF", requiredConsistency: false },
  { description: "actorClass", type: TAG_TYPE.WITH_NUMERIC_PARAMETER, tagSymbol: "AC", requiredConsistency: false },
  { description: "actorNickname", type: TAG_TYPE.WITH_NUMERIC_PARAMETER, tagSymbol: "AN", requiredConsistency: false },
  { description: "justAC", type: TAG_TYPE.WITHOUT_PARAMETER, tagSymbol: "AC", requiredConsistency: false, addSpace: true },

  { description: "partyFace", type: TAG_TYPE.WITH_NUMERIC_PARAMETER, tagSymbol: "PF", requiredConsistency: false },
  { description: "partyClass", type: TAG_TYPE.WITH_NUMERIC_PARAMETER, tagSymbol: "PC", requiredConsistency: false },
  { description: "partyNickname", type: TAG_TYPE.WITH_NUMERIC_PARAMETER, tagSymbol: "PN", requiredConsistency: false },

  { description: "className", type: TAG_TYPE.WITH_NUMERIC_PARAMETER, tagSymbol: "NC", requiredConsistency: false },
  { description: "itemName", type: TAG_TYPE.WITH_NUMERIC_PARAMETER, tagSymbol: "NI", requiredConsistency: false },
  { description: "weaponName", type: TAG_TYPE.WITH_NUMERIC_PARAMETER, tagSymbol: "NW", requiredConsistency: false },
  { description: "armorName", type: TAG_TYPE.WITH_NUMERIC_PARAMETER, tagSymbol: "NA", requiredConsistency: false },
  { description: "skillName", type: TAG_TYPE.WITH_NUMERIC_PARAMETER, tagSymbol: "NS", requiredConsistency: false },
  { description: "stateName", type: TAG_TYPE.WITH_NUMERIC_PARAMETER, tagSymbol: "NT", requiredConsistency: false },

  { description: "itemNameIcon", type: TAG_TYPE.WITH_NUMERIC_PARAMETER, tagSymbol: "II", requiredConsistency: false },
  { description: "weaponNameIcon", type: TAG_TYPE.WITH_NUMERIC_PARAMETER, tagSymbol: "IW", requiredConsistency: false },
  { description: "armorNameIcon", type: TAG_TYPE.WITH_NUMERIC_PARAMETER, tagSymbol: "IA", requiredConsistency: false },
  { description: "skillNameIcon", type: TAG_TYPE.WITH_NUMERIC_PARAMETER, tagSymbol: "IS", requiredConsistency: false },
  { description: "stateNameIcon", type: TAG_TYPE.WITH_NUMERIC_PARAMETER, tagSymbol: "IT", requiredConsistency: false },
];

export const DEFAULT_SYSTEM_PROMPT =
  "You are translating scripts that contain [b=tags] in the form [b=shortcode]. Altering contents or order of any such tags, removing or adding tags will break the script. DO NOT MODIFY TAGS OF THE FORM [b=...]. DO NOT CHANGE ORDER OF THE TAGS. EVER. PRESENT TAGS EXACTLY AS THEY ARE IN THE INPUT. Only translate the text between tags. Return only flat one-line JSON with exact same keys. No markdown, no comments, no code blocks, no pretty formatting. Keys with the same prefix+index are context-linked fields of one entity (for example i0n and i0d are one item), so they must stay semantically consistent.";

export const DEFAULT_BANNED_PHRASES = Object.freeze(["tool_call", "JSON"]);
export const DEFAULT_BANNED_PHRASES_TEXT = DEFAULT_BANNED_PHRASES.join("\n");

export const TYPE_TO_TAG = { text: "m", speaker: "m", choice: "m" };

export const REQUEST_SETTINGS = {
  stream: true,
  temperature: 0.7,
  repetition_penalty: 1.0,
  presence_penalty: 1.5,
  top_p: 0.8,
  top_k: 20,
  response_format: { type: "json_object" },
};

export const buildRequestSettingsForContent = (content) => ({
  ...REQUEST_SETTINGS,
  max_tokens: Math.max(
    1,
    (typeof content === "string" ? content.length : 0) * 5,
  ),
});

// Stream monitoring constants
export const STREAM_MONITOR_CHECK_INTERVAL = 64;
export const STREAM_OPEN_BRACE_MAX_CHARS = 100;
export const LLM_MAX_CONSECUTIVE_IDENTICAL_CHARS = 5;

export const STREAM_CANCEL_REASON = Object.freeze({
  NO_OPENING_BRACE: "no_opening_brace",
  INVALID_JSON_PROGRESS: "invalid_json_progress",
  UNKNOWN_KEY: "unknown_key",
  DUPLICATE_KEY: "duplicate_key",
  TRIM_TOO_LONG: "trim_too_long",
  COMPLETE_JSON_CONTINUED: "complete_json_continued",
  BANNED_PHRASE: "banned_phrase",
});

export const REQUEST_CANCEL_REASON = Object.freeze({
  BACKGROUND_PREEMPTED: "background_preempted",
  REQUEST_ABORTED: "request_aborted",
});
