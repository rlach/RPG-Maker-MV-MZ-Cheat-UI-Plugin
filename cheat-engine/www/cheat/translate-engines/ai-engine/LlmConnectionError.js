export const LLM_CONNECTION_ERROR = 'llm_connection_error';
export const LLM_CONNECTION_MESSAGE =
    'Could not connect to the LLM service. Check the host, port, endpoint and API configuration. Translation stopped.';

export class LlmConnectionError extends Error {
    constructor(detail) {
        super(`${LLM_CONNECTION_MESSAGE} (${detail})`);
        this.name = 'LlmConnectionError';
        this.code = LLM_CONNECTION_ERROR;
    }
}
