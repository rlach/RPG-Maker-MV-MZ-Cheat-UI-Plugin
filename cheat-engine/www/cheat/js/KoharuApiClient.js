/**
 * KoharuApiClient – pure HTTP client for the Koharu image translation API.
 *
 * Zero UI dependencies. All methods return Promises.
 * Consumers (runtime, panels) call these and handle errors themselves.
 */

const DEFAULT_BASE_URL = 'http://localhost:4000/api/v1';

function buildUrl(baseUrl, path) {
    const base = String(baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
    return `${base}${path}`;
}

async function jsonFetch(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            Accept: 'application/json',
            ...options.headers,
        },
    });

    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Koharu API ${response.status}: ${body || response.statusText}`);
    }

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
        return response.json();
    }

    return response;
}

function jsonPost(url, body) {
    return jsonFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getEngines(baseUrl) {
    return jsonFetch(buildUrl(baseUrl, '/engines'));
}

export function getProjects(baseUrl) {
    return jsonFetch(buildUrl(baseUrl, '/projects'));
}

export function createProject(baseUrl, name) {
    return jsonPost(buildUrl(baseUrl, '/projects'), { name });
}

export function openProject(baseUrl, projectId) {
    return jsonFetch(buildUrl(baseUrl, '/projects/current'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: projectId }),
    });
}

export function getScene(baseUrl) {
    return jsonFetch(buildUrl(baseUrl, '/scene.json'));
}

export function getOperations(baseUrl) {
    return jsonFetch(buildUrl(baseUrl, '/operations'));
}

/**
 * Subscribe to Koharu SSE events stream.
 *
 * @param {string} baseUrl
 * @param {{ onOpen?: Function, onEvent?: Function, onError?: Function }} handlers
 * @returns {() => void} unsubscribe function
 */
export function subscribeEvents(baseUrl, handlers = {}) {
    const EventSourceApi = globalThis?.EventSource;
    if (typeof EventSourceApi !== 'function') {
        throw new TypeError('EventSource API is unavailable in this environment');
    }

    const onOpen = typeof handlers.onOpen === 'function' ? handlers.onOpen : null;
    const onEvent = typeof handlers.onEvent === 'function' ? handlers.onEvent : null;
    const onError = typeof handlers.onError === 'function' ? handlers.onError : null;

    const eventSource = new EventSourceApi(buildUrl(baseUrl, '/events'));

    eventSource.onopen = () => {
        if (onOpen) {
            onOpen();
        }
    };

    eventSource.onmessage = (rawEvent) => {
        if (!onEvent) {
            return;
        }

        const payloadText = typeof rawEvent?.data === 'string' ? rawEvent.data.trim() : '';
        if (!payloadText) {
            return;
        }

        try {
            const payload = JSON.parse(payloadText);
            onEvent(payload, rawEvent);
        } catch (error) {
            // Ignore non-JSON keepalive lines.
            if (error) {
                // Keep reference so static analysis treats the exception as handled.
            }
        }
    };

    eventSource.onerror = (error) => {
        if (onError) {
            onError(error);
        }
    };

    return () => {
        try {
            eventSource.close();
        } catch (error) {
            // Ignore close errors.
            if (error) {
                // Keep reference so static analysis treats the exception as handled.
            }
        }
    };
}

export function cancelOperation(baseUrl, operationId) {
    return jsonFetch(buildUrl(baseUrl, `/operations/${encodeURIComponent(operationId)}`), {
        method: 'DELETE',
    });
}

export function runPipeline(baseUrl, { steps, pages, targetLanguage }) {
    const body = { steps };
    if (Array.isArray(pages) && pages.length > 0) {
        body.pages = pages;
    }
    if (targetLanguage) {
        body.targetLanguage = targetLanguage;
    }
    return jsonPost(buildUrl(baseUrl, '/pipelines'), body);
}

export function applyHistoryOp(baseUrl, op) {
    return jsonPost(buildUrl(baseUrl, '/history/apply'), op);
}

/**
 * Upload image files as pages to the current Koharu project.
 *
 * @param {string} baseUrl
 * @param {Array<{ fileName: string, buffer: Buffer|ArrayBuffer }>} files
 * @returns {Promise<{ pages: string[] }>}
 */
export async function uploadPages(baseUrl, files) {
    const formData = new FormData();

    for (const file of files) {
        const blob = new Blob([file.buffer], { type: 'image/png' });
        formData.append('file', blob, file.fileName);
    }

    const url = buildUrl(baseUrl, '/pages');
    const response = await fetch(url, {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Koharu upload ${response.status}: ${body || response.statusText}`);
    }

    return response.json();
}

/**
 * Export rendered pages from Koharu.
 *
 * @param {string} baseUrl
 * @param {{ format: string, pages?: string[] }} options
 * @returns {Promise<Response>} raw fetch Response (binary body)
 */
export async function exportRendered(baseUrl, options) {
    const url = buildUrl(baseUrl, '/projects/current/export');
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
    });

    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Koharu export ${response.status}: ${body || response.statusText}`);
    }

    return response;
}

/**
 * Health-check: try GET /engines to verify connectivity.
 *
 * @param {string} baseUrl
 * @returns {Promise<boolean>}
 */
export async function ping(baseUrl) {
    try {
        await getEngines(baseUrl);
        return true;
    } catch (error) {
        if (error) {
            // Ping should fail silently and return false.
        }
        return false;
    }
}
