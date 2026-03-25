import { TranslationBatchManager } from "./TranslationBatchManager.js";
import { CommonEventsTranslationKindStrategy } from "../translation-phases/CommonEvents.js";
import { DataContainerTranslationKindStrategy } from "../translation-phases/DataContainer.js";
import { DirectItemsTranslationKindStrategy } from "../translation-phases/DirectItems.js";
import { GameArraysTranslationKindStrategy } from "../translation-phases/GameArrays.js";
import { CurrentEventTranslationPhaseStrategy } from "../translation-phases/CurrentEvent.js";
import { DataObjectsTranslationPhaseStrategy } from "../translation-phases/DataObjects.js";
import { EmptyStringsTranslationPhaseStrategy } from "../translation-phases/EmptyStrings.js";
import { MapEventsTranslationPhaseStrategy } from "../translation-phases/MapEvents.js";
import { SystemCommandsTranslationPhaseStrategy } from "../translation-phases/SystemCommands.js";
import { SystemMessagesTranslationPhaseStrategy } from "../translation-phases/SystemMessages.js";

function registerDefaultStrategies(manager) {
  manager.register(
    new DataContainerTranslationKindStrategy({
      kind: "items",
      getContainer: () => window.$dataItems,
      fields: ["name", "description", "note"],
      cachePrefix: "item",
    }),
  );
  manager.register(
    new DataContainerTranslationKindStrategy({
      kind: "skills",
      getContainer: () => window.$dataSkills,
      fields: ["name", "description", "message1", "message2"],
      cachePrefix: "skill",
    }),
  );
  manager.register(
    new DataContainerTranslationKindStrategy({
      kind: "classes",
      getContainer: () => window.$dataClasses,
      fields: ["name"],
      cachePrefix: "class",
    }),
  );
  manager.register(
    new DataContainerTranslationKindStrategy({
      kind: "enemies",
      getContainer: () => window.$dataEnemies,
      fields: ["name"],
      cachePrefix: "enemy",
    }),
  );
  manager.register(
    new DataContainerTranslationKindStrategy({
      kind: "armors",
      getContainer: () => window.$dataArmors,
      fields: ["name", "description"],
      cachePrefix: "armor",
    }),
  );
  manager.register(
    new DataContainerTranslationKindStrategy({
      kind: "weapons",
      getContainer: () => window.$dataWeapons,
      fields: ["name", "description"],
      cachePrefix: "weapon",
    }),
  );
  manager.register(
    new DataContainerTranslationKindStrategy({
      kind: "maps",
      getContainer: () => window.$dataMapInfos,
      fields: ["name"],
      cachePrefix: "map",
    }),
  );
  manager.register(
    new DataContainerTranslationKindStrategy({
      kind: "actors",
      getContainer: () => window.$dataActors,
      fields: ["name", "nickname", "profile"],
      cachePrefix: "actor",
    }),
  );

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
