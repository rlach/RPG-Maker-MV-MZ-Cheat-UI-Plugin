/**
 * Custom Translator Consent – per-game consent gate for third-party
 * translator scripts from translate-cache/js/.
 *
 * Consent is stored in localStorage (Chromium-managed), keyed by
 * process.cwd(), so it cannot be bundled with cheat-settings.
 */

import { ConfirmDialog } from './DialogHelper.js';
import { getRootWindow } from './RootWindowState.js';

const CONSENT_STORAGE_PREFIX = 'cheat:custom-translator-consent:';
const CUSTOM_SCRIPTS_DIR = './www/cheat-settings/translate-cache/js';
const ROOT_CONSENT_STATE_KEY = '__CheatCustomTranslatorConsentDecision';

function getGameIdentity() {
    try {
        return typeof process !== 'undefined' && typeof process.cwd === 'function'
            ? process.cwd()
            : '.';
    } catch {
        return '.';
    }
}

function getConsentStorageKey() {
    return `${CONSENT_STORAGE_PREFIX}${getGameIdentity()}`;
}

function getStoredConsent() {
    try {
        const raw = localStorage.getItem(getConsentStorageKey());
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        return null;
    }
}

function storeConsent(decision, fingerprint, fileCount) {
    try {
        localStorage.setItem(
            getConsentStorageKey(),
            JSON.stringify({ decision, fingerprint, fileCount, timestamp: Date.now() })
        );
    } catch (error) {
        console.warn('[CustomTranslatorConsent] Failed to store consent', error);
    }
}

export function clearConsentForCurrentGame() {
    try {
        localStorage.removeItem(getConsentStorageKey());
        return true;
    } catch {
        return false;
    }
}

export function scanCustomScriptFiles() {
    try {
        const fs = require('fs');
        const path = require('path');
        const absoluteDir = path.resolve(CUSTOM_SCRIPTS_DIR);

        if (!fs.existsSync(absoluteDir)) {
            return [];
        }

        return fs
            .readdirSync(absoluteDir, { withFileTypes: true })
            .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
            .map((entry) => entry.name)
            .sort();
    } catch {
        return [];
    }
}

function computeFingerprint(fileNames) {
    if (!fileNames || fileNames.length === 0) return '';

    try {
        const crypto = require('crypto');
        const fs = require('fs');
        const path = require('path');
        const absoluteDir = path.resolve(CUSTOM_SCRIPTS_DIR);
        const hash = crypto.createHash('sha256');

        for (const name of fileNames) {
            const filePath = path.join(absoluteDir, name);
            const content = fs.readFileSync(filePath, 'utf-8');
            const contentHash = crypto.createHash('sha256').update(content).digest('hex');
            hash.update(`${name}:${content.length}:${contentHash}\n`);
        }

        return hash.digest('hex');
    } catch {
        return fileNames.join(',');
    }
}

function resolveDecision(storedConsent, currentFingerprint) {
    if (!storedConsent) return 'prompt';
    if (storedConsent.fingerprint !== currentFingerprint) return 'prompt';
    if (storedConsent.decision === 'allow') return 'allow';
    if (storedConsent.decision === 'deny-permanent') return 'deny';
    return 'prompt';
}

function showConsentModal(fileCount) {
    return new Promise((resolve) => {
        if (typeof ConfirmDialog?.show !== 'function') {
            console.warn(
                '[CustomTranslatorConsent] ConfirmDialog not available, denying by default'
            );
            resolve('deny');
            return;
        }

        ConfirmDialog.show({
            width: 580,
            persistent: true,
            messageHtml: `
                <div style="font-size: 14px; line-height: 1.6;">
                    <div style="color: #ff9800; font-weight: bold; font-size: 16px; margin-bottom: 8px;">
                        ⚠ Third-Party Translation Scripts Detected
                    </div>
                    <div style="margin-bottom: 8px;">
                        <b>${fileCount}</b> custom script file${fileCount !== 1 ? 's' : ''} found in the translation cache
                        (<code>translate-cache/js/</code>).
                    </div>
                    <div style="margin-bottom: 8px;">
                        These scripts are <b>not part of the cheat engine</b> and were delivered
                        together with the translation package. They may contain
                        <b>arbitrary code</b> that runs with full system access.
                    </div>
                    <div style="color: #ef5350; margin-bottom: 8px;">
                        <b>Only activate if you fully trust the author of this translation
                        and the person who provided it to you.</b>
                    </div>
                    <div style="font-size: 12px; color: #999;">
                        The developers of this cheat engine take no responsibility
                        for any damage caused by third-party scripts.
                    </div>
                </div>
            `,
            checkboxLabel: 'I understand the risk and know what I am doing',
            actions: [
                {
                    icon: 'mdi-close',
                    label: 'Do not activate',
                    color: 'grey',
                    action: () => {
                        ConfirmDialog.close();
                        resolve('deny');
                    },
                },
                {
                    icon: 'mdi-close-circle',
                    label: "Don't ask again",
                    color: 'red',
                    action: () => {
                        ConfirmDialog.close();
                        resolve('deny-permanent');
                    },
                },
                {
                    icon: 'mdi-check',
                    label: 'Activate fixes',
                    color: 'green',
                    requiresCheckbox: true,
                    action: () => {
                        ConfirmDialog.close();
                        resolve('allow');
                    },
                },
            ],
        });
    });
}

/**
 * Main entry point: evaluate consent for custom translators.
 * @returns {Promise<{ approved: boolean, files: string[] }>}
 */
export async function evaluateCustomTranslatorConsent() {
    const root = getRootWindow();
    const sessionState = root[ROOT_CONSENT_STATE_KEY];
    if (sessionState && typeof sessionState === 'object') {
        return {
            approved: sessionState.approved === true,
            files: Array.isArray(sessionState.files) ? sessionState.files : [],
        };
    }

    const files = scanCustomScriptFiles();
    if (files.length === 0) {
        const result = { approved: false, files: [] };
        root[ROOT_CONSENT_STATE_KEY] = result;
        return result;
    }

    const fingerprint = computeFingerprint(files);
    const storedConsent = getStoredConsent();
    const decision = resolveDecision(storedConsent, fingerprint);

    if (decision === 'allow') {
        console.log(
            `[CustomTranslatorConsent] Auto-approved ${files.length} custom translator(s) (matching fingerprint)`
        );
        const result = { approved: true, files };
        root[ROOT_CONSENT_STATE_KEY] = result;
        return result;
    }

    if (decision === 'deny') {
        console.log(
            `[CustomTranslatorConsent] Auto-denied ${files.length} custom translator(s) (permanent deny, matching fingerprint)`
        );
        const result = { approved: false, files };
        root[ROOT_CONSENT_STATE_KEY] = result;
        return result;
    }

    const userDecision = await showConsentModal(files.length);

    const approved = userDecision === 'allow';

    if (userDecision === 'allow') {
        storeConsent('allow', fingerprint, files.length);
        console.log(`[CustomTranslatorConsent] User approved ${files.length} custom translator(s)`);
    } else if (userDecision === 'deny-permanent') {
        storeConsent('deny-permanent', fingerprint, files.length);
        console.log(
            `[CustomTranslatorConsent] User permanently denied ${files.length} custom translator(s)`
        );
    } else {
        console.log(
            `[CustomTranslatorConsent] User denied ${files.length} custom translator(s) for this session`
        );
    }

    const result = { approved, files };
    root[ROOT_CONSENT_STATE_KEY] = result;
    return result;
}

export function getCustomScriptsDirectoryPath() {
    return CUSTOM_SCRIPTS_DIR;
}
