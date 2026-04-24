const SECRET_DB_NAME = 'rpg-maker-cheat-secure-secrets';
const SECRET_DB_VERSION = 1;
const SECRET_STORE_NAME = 'secrets';
const SECRET_MASTER_KEY_ID = '__master_key__';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64(bytes) {
    if (!(bytes instanceof Uint8Array)) {
        return '';
    }

    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function fromBase64(value) {
    if (!value || typeof value !== 'string') {
        return new Uint8Array();
    }

    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

class IndexedDbSecureSecretStorage {
    constructor() {
        this._dbPromise = null;
        this._masterKeyPromise = null;
        this._crypto = this._resolveCrypto();
    }

    async getSecret(secretId) {
        const safeId = this._normalizeSecretId(secretId);
        if (!safeId || !this._isSupported()) {
            return '';
        }

        const entry = await this._idbGet(safeId);
        if (!entry || typeof entry !== 'object') {
            return '';
        }

        if (typeof entry.iv !== 'string' || typeof entry.ciphertext !== 'string') {
            return '';
        }

        try {
            const key = await this._getOrCreateMasterKey();
            const iv = fromBase64(entry.iv);
            const payload = fromBase64(entry.ciphertext);
            const plainBuffer = await this._crypto.subtle.decrypt(
                { name: 'AES-GCM', iv },
                key,
                payload
            );
            return decoder.decode(plainBuffer);
        } catch (error) {
            console.warn('[SecureSecretStorage] Failed to decrypt secret:', error);
            return '';
        }
    }

    async setSecret(secretId, secretValue) {
        const safeId = this._normalizeSecretId(secretId);
        if (!safeId || !this._isSupported()) {
            return false;
        }

        const normalizedValue = typeof secretValue === 'string' ? secretValue : '';
        if (!normalizedValue) {
            await this.removeSecret(safeId);
            return true;
        }

        try {
            const key = await this._getOrCreateMasterKey();
            const iv = this._crypto.getRandomValues(new Uint8Array(12));
            const plainBytes = encoder.encode(normalizedValue);
            const encrypted = await this._crypto.subtle.encrypt(
                { name: 'AES-GCM', iv },
                key,
                plainBytes
            );

            await this._idbSet(safeId, {
                version: 1,
                iv: toBase64(iv),
                ciphertext: toBase64(new Uint8Array(encrypted)),
                updatedAt: Date.now(),
            });
            return true;
        } catch (error) {
            console.warn('[SecureSecretStorage] Failed to persist secret:', error);
            return false;
        }
    }

    async removeSecret(secretId) {
        const safeId = this._normalizeSecretId(secretId);
        if (!safeId || !this._isSupported()) {
            return false;
        }

        await this._idbDelete(safeId);
        return true;
    }

    _normalizeSecretId(secretId) {
        return typeof secretId === 'string' ? secretId.trim() : '';
    }

    _resolveCrypto() {
        return typeof globalThis !== 'undefined' && globalThis.crypto?.subtle
            ? globalThis.crypto
            : null;
    }

    _isSupported() {
        return !!(this._crypto && this._crypto.subtle && globalThis.indexedDB);
    }

    isSupported() {
        return this._isSupported();
    }

    async _openDb() {
        if (this._dbPromise) {
            return this._dbPromise;
        }

        this._dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(SECRET_DB_NAME, SECRET_DB_VERSION);

            request.onupgradeneeded = () => {
                const db = request.result;
                if (!db.objectStoreNames.contains(SECRET_STORE_NAME)) {
                    db.createObjectStore(SECRET_STORE_NAME);
                }
            };

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });

        return this._dbPromise;
    }

    async _idbGet(key) {
        const db = await this._openDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(SECRET_STORE_NAME, 'readonly');
            const store = tx.objectStore(SECRET_STORE_NAME);
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async _idbSet(key, value) {
        const db = await this._openDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(SECRET_STORE_NAME, 'readwrite');
            const store = tx.objectStore(SECRET_STORE_NAME);
            const request = store.put(value, key);
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    async _idbDelete(key) {
        const db = await this._openDb();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(SECRET_STORE_NAME, 'readwrite');
            const store = tx.objectStore(SECRET_STORE_NAME);
            const request = store.delete(key);
            request.onsuccess = () => resolve(true);
            request.onerror = () => reject(request.error);
        });
    }

    async _getOrCreateMasterKey() {
        if (this._masterKeyPromise) {
            return this._masterKeyPromise;
        }

        this._masterKeyPromise = (async () => {
            const existingKey = await this._idbGet(SECRET_MASTER_KEY_ID);
            if (existingKey) {
                return existingKey;
            }

            const newKey = await this._crypto.subtle.generateKey(
                { name: 'AES-GCM', length: 256 },
                false,
                ['encrypt', 'decrypt']
            );
            await this._idbSet(SECRET_MASTER_KEY_ID, newKey);
            return newKey;
        })();

        return this._masterKeyPromise;
    }
}

class SecureSecretStorage {
    constructor() {
        this._indexedDbStorage = new IndexedDbSecureSecretStorage();
        this._inMemoryStorage = new Map();
    }

    async getSecret(secretId) {
        const id = this._normalizeSecretId(secretId);
        if (!id) {
            return '';
        }

        if (this._indexedDbStorage.isSupported()) {
            return this._indexedDbStorage.getSecret(id);
        }

        return this._inMemoryStorage.get(id) || '';
    }

    async setSecret(secretId, secretValue) {
        const id = this._normalizeSecretId(secretId);
        if (!id) {
            return false;
        }

        if (this._indexedDbStorage.isSupported()) {
            return this._indexedDbStorage.setSecret(id, secretValue);
        }

        const value = typeof secretValue === 'string' ? secretValue : '';
        if (value) {
            this._inMemoryStorage.set(id, value);
        } else {
            this._inMemoryStorage.delete(id);
        }
        return true;
    }

    async removeSecret(secretId) {
        const id = this._normalizeSecretId(secretId);
        if (!id) {
            return false;
        }

        if (this._indexedDbStorage.isSupported()) {
            return this._indexedDbStorage.removeSecret(id);
        }

        this._inMemoryStorage.delete(id);
        return true;
    }

    _normalizeSecretId(secretId) {
        return typeof secretId === 'string' ? secretId.trim() : '';
    }
}

export function createSecureSecretStorage() {
    return new SecureSecretStorage();
}
