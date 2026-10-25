/** Model-facing contracts shared by translation, reformatting and repair requests. */
export function translationResponseSchema(expectedKeys = [], { allowKnowledgeBase = false } = {}) {
    const keys = [
        ...new Set(expectedKeys.filter((key) => typeof key === 'string' && key !== 'kbase')),
    ];
    const properties = Object.fromEntries(keys.map((key) => [key, { type: 'string' }]));
    if (allowKnowledgeBase)
        properties.kbase = {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    key: { type: 'string' },
                    translation: { type: 'string' },
                    description: { type: 'string' },
                },
                required: ['key', 'translation'],
                additionalProperties: false,
            },
        };
    // Missing translations are recovered by the existing partial-batch pipeline.
    // Exact known keys prevent invented IDs; the fallback is used only for schema-less repairs.
    return {
        type: 'object',
        properties,
        ...(keys.length
            ? {}
            : { patternProperties: { '^[a-z](0|[1-9][0-9]*)([a-z]*)$': { type: 'string' } } }),
        additionalProperties: false,
    };
}

export const languageValidationSchema = {
    type: 'object',
    properties: { isTranslated: { type: 'boolean' } },
    required: ['isTranslated'],
    additionalProperties: false,
};

export function structuredRequestParameters(engine, payload, options = {}) {
    if (engine.provider !== 'openApi' || !engine.useStrataConstrained) {
        return { response_format: { type: 'json_object' } };
    }
    const schema =
        options.responseSchema ||
        payload.response_format?.json_schema?.schema ||
        translationResponseSchema(options.expectedKeys || [], {
            allowKnowledgeBase: !!engine.runtime?.askLlmToAddToKnowledge,
        });
    return {
        strata_constrained: true,
        reasoning_effort: 'none',
        response_format: {
            type: 'json_schema',
            json_schema: { name: 'response', strict: true, schema },
        },
    };
}
