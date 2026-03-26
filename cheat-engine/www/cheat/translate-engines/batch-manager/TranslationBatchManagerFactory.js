import { TranslationBatchManager } from "./TranslationBatchManager.js";
import { CommonEventsTranslationKindStrategy } from "../translation-phases/CommonEvents.js";
import { DataContainerTranslationKindStrategy } from "../translation-phases/DataContainer.js";
import { DATA_CONTAINER_TRANSLATION_DEFINITIONS } from "../translation-phases/DataContainerDefinitions.js";
import { DirectItemsTranslationKindStrategy } from "../translation-phases/DirectItems.js";
import { GameArraysTranslationKindStrategy } from "../translation-phases/GameArrays.js";
import { CurrentEventTranslationPhaseStrategy } from "../translation-phases/CurrentEvent.js";
import { DataObjectsTranslationPhaseStrategy } from "../translation-phases/DataObjects.js";
import { EmptyStringsTranslationPhaseStrategy } from "../translation-phases/EmptyStrings.js";
import { MapEventsTranslationPhaseStrategy } from "../translation-phases/MapEvents.js";
import { SystemCommandsTranslationPhaseStrategy } from "../translation-phases/SystemCommands.js";
import { SystemMessagesTranslationPhaseStrategy } from "../translation-phases/SystemMessages.js";

function registerDefaultStrategies(manager) {
  for (const definition of DATA_CONTAINER_TRANSLATION_DEFINITIONS) {
    manager.register(
      new DataContainerTranslationKindStrategy({
        kind: definition.kind,
        getContainer: definition.getContainer,
        fields: definition.fields,
        cachePrefix: definition.cachePrefix,
      }),
    );
  }

  manager.register(DataObjectsTranslationPhaseStrategy.getInstance());
  manager.register(new DirectItemsTranslationKindStrategy());
  manager.register(EmptyStringsTranslationPhaseStrategy.getInstance());
  manager.register(SystemMessagesTranslationPhaseStrategy.getInstance());
  manager.register(SystemCommandsTranslationPhaseStrategy.getInstance());
  manager.register(new CommonEventsTranslationKindStrategy());
  manager.register(MapEventsTranslationPhaseStrategy.getInstance());
  manager.register(new GameArraysTranslationKindStrategy());
  manager.register(CurrentEventTranslationPhaseStrategy.getInstance());
}

export function createTranslationBatchManager(panel) {
  const manager = new TranslationBatchManager(panel);
  registerDefaultStrategies(manager);
  return manager;
}
