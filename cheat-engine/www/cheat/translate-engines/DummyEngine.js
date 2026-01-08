import BaseTranslationEngine from './BaseTranslationEngine.js';

export default class DummyEngine extends BaseTranslationEngine {
    getId() {
        return 'dummy';
    }

    getName() {
        return 'Dummy';
    }

    getConfigTemplate() {
        return `
            <div style="padding: 16px; background-color: #fff3e0; border-radius: 4px; border-left: 4px solid #ff9800;">
                <div style="font-weight: bold; color: #e65100; margin-bottom: 8px;">⚠️ Test Engine</div>
                <div style="color: #bf360c; font-size: 0.9em; line-height: 1.5;">
                    The Dummy Engine never translates anything. All translation requests are rejected with "I'm a dummy".
                    <br><br>
                    Use this engine to test other functionality without actually translating content, such as:
                    <ul style="margin: 8px 0; padding-left: 20px;">
                        <li>Testing the lookahead collection mechanism</li>
                        <li>Verifying cache behavior with failed translations</li>
                        <li>Testing UI interactions and error handling</li>
                    </ul>
                </div>
            </div>
        `;
    }

    async batchTranslate(items) {
        // items: [{ type, id, value, cacheKey }]
        if (!Array.isArray(items) || !items.length) {
            return { successes: [], failures: [] };
        }

        console.log('[DummyEngine] Batch translate called with', items.length, 'items');

        // Return all items as failures
        const failures = items.map(item => ({
            type: item.type,
            id: item.id,
            value: item.value,
            cacheKey: item.cacheKey,
            rejectReason: "I'm a dummy"
        }));

        return { successes: [], failures };
    }
}
