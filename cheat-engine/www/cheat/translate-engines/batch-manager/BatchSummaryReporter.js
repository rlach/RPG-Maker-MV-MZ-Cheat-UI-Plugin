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
    totalCumulativeErrors = 0,
    progressLabel = "translated",
  }) {
    const safeProcessed = Math.max(0, Number(processed) || 0);
    const safeTotal = Math.max(0, Number(total) || 0);
    const safeCurrentErrors = Math.max(0, Number(currentStepErrors) || 0);
    const safeCurrentProcessed = Math.max(0, Number(currentStepProcessed) || 0);
    const safeTotalCumulativeErrors = Math.max(
      0,
      Number(totalCumulativeErrors) || Number(totalErrors) || 0,
    );
    const percent =
      safeTotal > 0 ? Math.round((safeProcessed / safeTotal) * 100) : 100;

    const message = `${safeProcessed}/${safeTotal} ${progressLabel} (${percent}%)`;

    let currentErrorsLine = null;
    if (safeCurrentErrors > 0) {
      const currentErrorsBase = Math.max(
        0,
        safeCurrentProcessed || safeProcessed,
      );
      const currentErrorPercent =
        currentErrorsBase > 0
          ? Math.round((safeCurrentErrors / currentErrorsBase) * 100)
          : 0;
      currentErrorsLine = `current phase errors: ${safeCurrentErrors}/${currentErrorsBase} (${currentErrorPercent}%)`;
    }

    let totalErrorsLine = null;
    if (safeTotalCumulativeErrors > 0) {
      const totalErrorsBase = Math.max(0, safeProcessed);
      const totalErrorPercent =
        totalErrorsBase > 0
          ? Math.round((safeTotalCumulativeErrors / totalErrorsBase) * 100)
          : 0;
      totalErrorsLine = `total errors: ${safeTotalCumulativeErrors}/${totalErrorsBase} (${totalErrorPercent}%)`;
    }

    return {
      title: title || "translating",
      message,
      currentErrorsLine,
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
    currentPhaseErrors = 0,
    totalCumulativeErrors = 0,
  }) {
    const safeTotal = Math.max(0, this.toSafeNumber(totalItems, 0));
    const safeSuccess = Math.max(0, this.toSafeNumber(successes, 0));
    const safeFailures = Math.max(0, this.toSafeNumber(failures, 0));
    const normalizedErrorStats = this.normalizeErrorStats(
      errorStats,
      safeFailures,
    );
    const safeCurrentPhaseErrors = Math.max(
      0,
      this.toSafeNumber(currentPhaseErrors, 0),
    );
    const safeTotalCumulativeErrors = Math.max(
      0,
      this.toSafeNumber(
        totalCumulativeErrors,
        normalizedErrorStats.totalErrors,
      ),
    );
    const percent =
      safeTotal > 0 ? Math.round((safeSuccess / safeTotal) * 100) : 100;

    const lines = [];
    lines.push(`success: ${safeSuccess}/${safeTotal} (${percent}%)`);

    if (safeCurrentPhaseErrors > 0) {
      const phaseErrorPercent =
        safeTotal > 0
          ? Math.round((safeCurrentPhaseErrors / safeTotal) * 100)
          : 0;
      lines.push(
        `current phase errors: ${safeCurrentPhaseErrors}/${safeTotal} (${phaseErrorPercent}%)`,
      );
    }

    if (safeTotalCumulativeErrors > 0) {
      const totalErrorPercent =
        safeSuccess + safeTotalCumulativeErrors > 0
          ? Math.round(
              (safeTotalCumulativeErrors /
                (safeSuccess + safeTotalCumulativeErrors)) *
                100,
            )
          : 0;
      lines.push(
        `total errors: ${safeTotalCumulativeErrors}/${safeSuccess + safeTotalCumulativeErrors} (${totalErrorPercent}%)`,
      );
    }

    const byType = normalizedErrorStats.byType;
    const typeKeys = Object.keys(byType);
    if (typeKeys.length > 0) {
      lines.push(
        `error types: ${typeKeys.map((key) => `${key}: ${byType[key]}`).join(", ")}`,
      );
    }

    if (normalizedErrorStats.recoveredErrors > 0) {
      lines.push(
        `recovered errors using strategy: ${normalizedErrorStats.recoveredErrors}`,
      );
    }

    return {
      title: "[BatchSummary]",
      message: lines.join("\n"),
      successRate: percent,
    };
  }

  static showAlert(summary) {
    if (!summary) {
      return;
    }

    const fullMessage = `${summary.title}\n${summary.message}`;
    Alert.success(fullMessage, null, 5000);
  }

  static logSummary(summary) {
    if (!summary) {
      return;
    }

    const fullMessage = `${summary.title}\n${summary.message}`;
    console.log(fullMessage);
  }
}
