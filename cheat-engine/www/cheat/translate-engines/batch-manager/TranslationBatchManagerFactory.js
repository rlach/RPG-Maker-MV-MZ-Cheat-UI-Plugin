import { TranslationBatchManager } from './TranslationBatchManager.js';
import { Actor } from '../translation-phases/Actor.js';
import { CommonEvents } from '../translation-phases/CommonEvents.js';
import { DataContainer } from '../translation-phases/DataContainer.js';
import { DATA_CONTAINER_TRANSLATION_DEFINITIONS } from '../translation-phases/DataContainerDefinitions.js';
import { DirectItems } from '../translation-phases/DirectItems.js';
import { GameArrays } from '../translation-phases/GameArrays.js';
import { CurrentEvent } from '../translation-phases/CurrentEvent.js';
import { DataObjects } from '../translation-phases/DataObjects.js';
import { CacheEmptyStrings } from '../translation-phases/CacheEmptyStrings.js';
import { EmptyStrings } from '../translation-phases/EmptyStrings.js';
import { Koharu } from '../translation-phases/Koharu.js';
import { MapEvents } from '../translation-phases/MapEvents.js';
import { OtherStrings } from '../translation-phases/OtherStrings.js';
import { Plugins } from '../translation-phases/Plugins.js';
import { SystemCommands } from '../translation-phases/SystemCommands.js';
import { SystemMessages } from '../translation-phases/SystemMessages.js';
import { Troops } from '../translation-phases/Troops.js';
import { Variables } from '../translation-phases/Variables.js';

function registerDefaultStrategies(manager) {
    for (const definition of DATA_CONTAINER_TRANSLATION_DEFINITIONS) {
        manager.register(
            new DataContainer({
                kind: definition.kind,
                getContainer: definition.getContainer,
                fields: definition.fields,
                cachePrefix: definition.cachePrefix,
                requiresReapplyOnLoad: !!definition.requiresReapplyOnLoad,
            })
        );
    }

    manager.register(new Actor());

    manager.register(DataObjects.getInstance());
    manager.register(new DirectItems());
    manager.register(EmptyStrings.getInstance());
    manager.register(CacheEmptyStrings.getInstance());
    manager.register(SystemMessages.getInstance());
    manager.register(SystemCommands.getInstance());
    manager.register(OtherStrings.getInstance());
    manager.register(new CommonEvents());
    manager.register(MapEvents.getInstance());
    manager.register(new GameArrays());
    manager.register(Variables.getInstance());
    manager.register(Troops.getInstance());
    manager.register(Koharu.getInstance());
    manager.register(new Plugins());
    manager.register(CurrentEvent.getInstance());
}

export function createTranslationBatchManager(runtime) {
    const manager = new TranslationBatchManager(runtime);
    registerDefaultStrategies(manager);
    return manager;
}
