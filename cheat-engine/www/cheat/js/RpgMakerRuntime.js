export function getRpgMakerName() {
  const makerName = globalThis?.Utils?.RPGMAKER_NAME;
  return typeof makerName === "string" ? makerName : "";
}

export function isRpgMakerMv() {
  return getRpgMakerName().toUpperCase() === "MV";
}
