import { SourceTextCatalogTranslator } from '../SourceTextCatalogTranslator.js';

/** TRP_ParticleMZ_ExOption (MZ) and TRP_ParticleExOption (MV), unversioned. */
export class TrpParticleOptionTranslator extends SourceTextCatalogTranslator {
    getPluginName() {
        return 'TRP_ParticleMZ_ExOption';
    }
    getPluginLabel() {
        return 'TRP Particle Option';
    }
    getPluginAliases() {
        return [this.getPluginName(), 'TRP_ParticleExOption'];
    }
    getCacheType() {
        return 'plugin_trp_particle_option';
    }
    async buildCatalog() {
        const plugin = this.getPluginAliases()
            .map((name) => this.findPluginEntry(name))
            .find((entry) => entry?.status);
        this.collectParameterTexts(plugin.parameters);
        for (const text of ['最高', '高', '中', '低', '最低', '無制限'])
            this.entries.set(text, { text });
    }
    enablePluginTranslation() {
        const proto = window.Window_Options?.prototype;
        if (typeof proto?.trpParticleNumText !== 'function') return false;
        const original = proto.trpParticleNumText;
        const translator = this;
        proto.trpParticleNumText = function (...args) {
            const text = original.apply(this, args);
            const runtime = translator.getRuntime();
            return translator.isRuntimeTranslationActive(runtime)
                ? translator.resolveRuntimeTranslation(text, runtime)
                : text;
        };
        return true;
    }
}
