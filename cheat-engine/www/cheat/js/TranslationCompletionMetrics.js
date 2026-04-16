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
