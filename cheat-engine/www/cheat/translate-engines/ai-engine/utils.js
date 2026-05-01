/**
 * Utility functions for LLM payload processing
 * Text sanitization, character limiting, think block removal
 */

import { LLM_MAX_CONSECUTIVE_IDENTICAL_CHARS } from './constants.js';

/**
 * Convert array or string to flat string
 * @param {*} value - Value to convert
 * @returns {string}
 */
export const asFlatString = (value) => {
    if (Array.isArray(value)) {
        return value.map((v) => (typeof v === 'string' ? v : '')).join('');
    }
    return typeof value === 'string' ? value : '';
};

/**
 * Limit consecutive identical characters to prevent LLM hallucination
 * Guards against character repetition (e.g., "aaaaaaa" → "aaaaa")
 * @param {string} text - Text to process
 * @param {number} maxConsecutive - Maximum consecutive identical chars allowed
 * @returns {string}
 */
export const limitConsecutiveIdenticalChars = (
    text,
    maxConsecutive = LLM_MAX_CONSECUTIVE_IDENTICAL_CHARS
) => {
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

/**
 * Strip <think>...</think> blocks from LLM output (reasoning models)
 * @param {string} text - Text to process
 * @returns {Object} {text: cleaned text, hasOpenThink: boolean}
 */
export const stripThinkBlocks = (text) => {
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

/**
 * Recursively preprocess message content (limit consecutive chars)
 * @param {*} content - Content to process (string, array, or object)
 * @returns {*}
 */
export const preprocessOutgoingMessageContent = (content) => {
    if (typeof content === 'string') {
        return limitConsecutiveIdenticalChars(content);
    }

    if (Array.isArray(content)) {
        return content.map((item) => preprocessOutgoingMessageContent(item));
    }

    if (content && typeof content === 'object') {
        const next = { ...content };

        if (typeof next.text === 'string') {
            next.text = limitConsecutiveIdenticalChars(next.text);
        }

        if (
            typeof next.content === 'string' ||
            Array.isArray(next.content) ||
            (next.content && typeof next.content === 'object')
        ) {
            next.content = preprocessOutgoingMessageContent(next.content);
        }

        if (typeof next.reasoning_content === 'string') {
            next.reasoning_content = limitConsecutiveIdenticalChars(next.reasoning_content);
        }

        return next;
    }

    return content;
};

/**
 * Preprocess entire LLM request payload
 * @param {Object} payload - API request payload
 * @returns {Object}
 */
export const preprocessPayloadForLlm = (payload) => {
    if (!payload || typeof payload !== 'object') {
        return payload;
    }

    const nextPayload = { ...payload };
    if (!Array.isArray(payload.messages)) {
        return nextPayload;
    }

    nextPayload.messages = payload.messages.map((message) => {
        if (!message || typeof message !== 'object') {
            return message;
        }

        const nextMessage = { ...message };
        if (Object.prototype.hasOwnProperty.call(nextMessage, 'content')) {
            nextMessage.content = preprocessOutgoingMessageContent(nextMessage.content);
        }
        if (typeof nextMessage.reasoning_content === 'string') {
            nextMessage.reasoning_content = limitConsecutiveIdenticalChars(
                nextMessage.reasoning_content
            );
        }

        return nextMessage;
    });

    return nextPayload;
};
