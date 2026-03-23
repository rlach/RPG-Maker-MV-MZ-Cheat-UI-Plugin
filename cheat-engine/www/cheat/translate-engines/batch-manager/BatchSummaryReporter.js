import { Alert } from "../../js/AlertHelper.js";

export class BatchSummaryReporter {
  static toSafeNumber(value, fallback = 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : fallback;
  }

  static createErrorStatsAccumulator() {
    return {
      totalErrors: 0,
      recoveredErrors: 0,
      byType: {},
    };
  }

  static normalizeErrorStats(errorStats, fallbackFailures = 0) {
    const normalized = this.createErrorStatsAccumulator();
    normalized.totalErrors = Math.max(
      0,
      this.toSafeNumber(errorStats && errorStats.totalErrors, 0),
    );
    normalized.recoveredErrors = Math.max(
      0,
      this.toSafeNumber(errorStats && errorStats.recoveredErrors, 0),
    );

    const byType = (errorStats && errorStats.byType) || {};
    for (const key of Object.keys(byType)) {
      normalized.byType[key] = Math.max(0, this.toSafeNumber(byType[key], 0));
    }

    if (normalized.totalErrors <= 0) {
      normalized.totalErrors = Math.max(0, this.toSafeNumber(fallbackFailures));
    }

    return normalized;
  }

  static mergeErrorStats(target, errorStats) {
    const accumulator =
      target && typeof target === "object"
        ? target
        : this.createErrorStatsAccumulator();
    const normalized = this.normalizeErrorStats(errorStats, 0);

    accumulator.totalErrors += normalized.totalErrors;
    accumulator.recoveredErrors += normalized.recoveredErrors;

    if (!accumulator.byType || typeof accumulator.byType !== "object") {
      accumulator.byType = {};
    }

    for (const key of Object.keys(normalized.byType)) {
      accumulator.byType[key] =
        (accumulator.byType[key] || 0) + normalized.byType[key];
    }

    return accumulator;
  }

  static buildProgress({
    title,
    processed,
    total,
    currentStepErrors = 0,
    currentStepProcessed = 0,
    totalErrors = 0,
    progressLabel = "translated",
  }) {
    const safeProcessed = Math.max(0, Number(processed) || 0);
    const safeTotal = Math.max(0, Number(total) || 0);
    const safeCurrentErrors = Math.max(0, Number(currentStepErrors) || 0);
    const safeCurrentProcessed = Math.max(0, Number(currentStepProcessed) || 0);
    const safeTotalErrors = Math.max(0, Number(totalErrors) || 0);
    const percent =
      safeTotal > 0 ? Math.round((safeProcessed / safeTotal) * 100) : 100;

    let message = `${safeProcessed}/${safeTotal} ${progressLabel} (${percent}%)`;
    if (safeCurrentErrors > 0 && safeCurrentProcessed > 0) {
      const currentErrorPercent = Math.round(
        (safeCurrentErrors / safeCurrentProcessed) * 100,
      );
      message += ` | errors: ${safeCurrentErrors}/${safeCurrentProcessed} (${currentErrorPercent}%)`;
    }

    let totalErrorsLine = null;
    if (safeTotalErrors > 0) {
      const totalErrorsBase = Math.max(0, safeProcessed);
      const totalErrorPercent =
        totalErrorsBase > 0
          ? Math.round((safeTotalErrors / totalErrorsBase) * 100)
          : 0;
      totalErrorsLine = `total errors: ${safeTotalErrors}/${totalErrorsBase} (${totalErrorPercent}%)`;
    }

    return {
      title: title || "translating",
      message,
      totalErrorsLine,
    };
  }

  static buildSummary({
    batchLabel,
    totalItems,
    successes,
    failures,
    errorStats,
    durationMs,
  }) {
    const safeTotal = Math.max(0, this.toSafeNumber(totalItems, 0));
    const safeSuccess = Math.max(0, this.toSafeNumber(successes, 0));
    const safeFailures = Math.max(0, this.toSafeNumber(failures, 0));
    const normalizedErrorStats = this.normalizeErrorStats(
      errorStats,
      safeFailures,
    );
    const percent =
      safeTotal > 0 ? Math.round((safeSuccess / safeTotal) * 100) : 100;
    const errorPercent =
      safeTotal > 0
        ? Math.round((normalizedErrorStats.totalErrors / safeTotal) * 100)
        : 0;

    const lines = [];
    lines.push(`${batchLabel} finished`);
    lines.push(`success: ${safeSuccess}/${safeTotal} (${percent}%)`);
    lines.push(
      `total errors: ${normalizedErrorStats.totalErrors}/${safeTotal} (${errorPercent}%)`,
    );

    const byType = normalizedErrorStats.byType;
    const typeKeys = Object.keys(byType);
    if (typeKeys.length > 0) {
      lines.push(
        `error types: ${typeKeys.map((key) => `${key}: ${byType[key]}`).join(", ")}`,
      );
    }

    lines.push(
      `recovered errors using strategy: ${normalizedErrorStats.recoveredErrors}`,
    );

    return {
      title: batchLabel,
      message: lines.join("\n"),
      successRate: percent,
    };
  }

  static showAlert(summary) {
    if (!summary) {
      return;
    }

    Alert.success(summary.message, null, 5000);
  }

  static logSummary(summary) {
    if (!summary) {
      return;
    }

    console.log("[BatchSummary]\n" + summary.message);
  }
}
