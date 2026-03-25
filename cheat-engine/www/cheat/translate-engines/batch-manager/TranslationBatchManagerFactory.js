import { TranslationBatchManager } from "./TranslationBatchManager.js";
import { CommonEventsTranslationKindStrategy } from "../translation-phases/CommonEventsTranslationKindStrategy.js";
import { DataContainerTranslationKindStrategy } from "../translation-phases/DataContainerTranslationKindStrategy.js";
import { DirectItemsTranslationKindStrategy } from "../translation-phases/DirectItemsTranslationKindStrategy.js";
import { GameArraysTranslationKindStrategy } from "../translation-phases/GameArraysTranslationKindStrategy.js";
import { CurrentEventTranslationPhaseStrategy } from "../translation-phases/CurrentEventTranslationPhaseStrategy.js";
import { DataObjectsTranslationPhaseStrategy } from "../translation-phases/DataObjectsTranslationPhaseStrategy.js";
import { EmptyStringsTranslationPhaseStrategy } from "../translation-phases/EmptyStringsTranslationPhaseStrategy.js";
import { MapEventsTranslationPhaseStrategy } from "../translation-phases/MapEventsTranslationPhaseStrategy.js";
import { SystemCommandsTranslationPhaseStrategy } from "../translation-phases/SystemCommandsTranslationPhaseStrategy.js";
import { SystemMessagesTranslationPhaseStrategy } from "../translation-phases/SystemMessagesTranslationPhaseStrategy.js";

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
