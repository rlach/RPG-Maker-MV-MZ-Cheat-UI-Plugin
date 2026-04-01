export const DATA_CONTAINER_TRANSLATION_DEFINITIONS = Object.freeze([
  {
    kind: "items",
    cachePrefix: "item",
    fields: ["name", "description", "note"],
    getContainer: () => window.$dataItems,
  },
  {
    kind: "skills",
    cachePrefix: "skill",
    fields: ["name", "description", "message1", "message2"],
    getContainer: () => window.$dataSkills,
  },
  {
    kind: "classes",
    cachePrefix: "class",
    fields: ["name"],
    requiresReapplyOnLoad: true,
    getContainer: () => window.$dataClasses,
  },
  {
    kind: "enemies",
    cachePrefix: "enemy",
    fields: ["name"],
    requiresReapplyOnLoad: true,
    getContainer: () => window.$dataEnemies,
  },
  {
    kind: "armors",
    cachePrefix: "armor",
    fields: ["name", "description"],
    getContainer: () => window.$dataArmors,
  },
  {
    kind: "weapons",
    cachePrefix: "weapon",
    fields: ["name", "description"],
    getContainer: () => window.$dataWeapons,
  },
  {
    kind: "maps",
    cachePrefix: "map",
    fields: ["name"],
    getContainer: () => window.$dataMapInfos,
  },
]);
