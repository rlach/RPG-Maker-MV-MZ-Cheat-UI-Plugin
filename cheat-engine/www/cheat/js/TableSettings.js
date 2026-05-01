import { KEY_VALUE_STORAGE } from './KeyValueStorage.js';

const ROWS_PER_PAGE_KEY = 'cheat.rowsPerPage';
const DEFAULT_ROWS_PER_PAGE = 5;

function normalize(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return null;
    }
    return parsed;
}

export function getRowsPerPage() {
    const stored = KEY_VALUE_STORAGE.getItem(ROWS_PER_PAGE_KEY);
    const normalized = normalize(stored);
    return normalized || DEFAULT_ROWS_PER_PAGE;
}

export function setRowsPerPage(value) {
    const normalized = normalize(value);
    if (normalized === null) {
        return;
    }
    KEY_VALUE_STORAGE.setItem(ROWS_PER_PAGE_KEY, String(normalized));
}
