import { parseCacheKeyForLangPair } from "./TranslateCacheRuntime.js";

function normalizeText(value) {
  if (typeof value === "string") {
    return value;
  }

  if (value === null || value === undefined) {
    return "";
  }

  return String(value);
}

function normalizeCacheTypeSet(cacheTypes) {
  const set = new Set();
  let safeTypes = [];
  if (Array.isArray(cacheTypes)) {
    safeTypes = cacheTypes;
  } else if (cacheTypes instanceof Set) {
    safeTypes = Array.from(cacheTypes);
  }

  for (const type of safeTypes) {
    const normalized = normalizeText(type).trim();
    if (!normalized) {
      continue;
    }
    set.add(normalized);
  }

  return set;
}

export function computeLangPairCompletionByKeyLength({
  translationCache,
  sourceLang,
  targetLang,
}) {
  let totalKeyLength = 0;
  let translatedKeyLength = 0;

  if (!(translationCache instanceof Map)) {
    return {
      totalKeyLength,
      translatedKeyLength,
      completionPercent: 0,
    };
  }

  for (const [cacheKey, value] of translationCache.entries()) {
    const parsed = parseCacheKeyForLangPair(cacheKey, sourceLang, targetLang);
    if (!parsed) {
      continue;
    }

    const originalKey = normalizeText(parsed.original);
    const keyLength = originalKey.length;
    totalKeyLength += keyLength;

    const translation = normalizeText(value).trim();
    if (translation.length > 0) {
      translatedKeyLength += keyLength;
    }
  }

  const completionPercent =
    totalKeyLength > 0 ? (translatedKeyLength / totalKeyLength) * 100 : 0;

  return {
    totalKeyLength,
    translatedKeyLength,
    completionPercent,
  };
}

export function computeLangPairCompletionByCacheTypes({
  translationCache,
  sourceLang,
  targetLang,
  cacheTypes,
}) {
  let totalKeyLength = 0;
  let translatedKeyLength = 0;

  if (!(translationCache instanceof Map)) {
    return {
      totalKeyLength,
      translatedKeyLength,
      completionPercent: 0,
    };
  }

  const typeSet = normalizeCacheTypeSet(cacheTypes);
  if (typeSet.size === 0) {
    return {
      totalKeyLength,
      translatedKeyLength,
      completionPercent: 0,
    };
  }

  for (const [cacheKey, value] of translationCache.entries()) {
    const parsed = parseCacheKeyForLangPair(cacheKey, sourceLang, targetLang);
    if (!parsed || !typeSet.has(parsed.type)) {
      continue;
    }

    const originalKey = normalizeText(parsed.original);
    const keyLength = originalKey.length;
    totalKeyLength += keyLength;

    const translation = normalizeText(value).trim();
    if (translation.length > 0) {
      translatedKeyLength += keyLength;
    }
  }

  const completionPercent =
    totalKeyLength > 0 ? (translatedKeyLength / totalKeyLength) * 100 : 0;

  return {
    totalKeyLength,
    translatedKeyLength,
    completionPercent,
  };
}
