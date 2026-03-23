import { Alert } from "../../js/AlertHelper.js";

export class BatchSummaryReporter {
  static buildSummary({
    batchLabel,
    totalItems,
    successes,
    failures,
    errorStats,
    durationMs,
  }) {
    const safeTotal = Math.max(0, Number(totalItems) || 0);
    const safeSuccess = Math.max(0, Number(successes) || 0);
    const safeFailures = Math.max(0, Number(failures) || 0);
    const percent =
      safeTotal > 0 ? Math.round((safeSuccess / safeTotal) * 100) : 100;
    const errorPercent =
      safeTotal > 0 ? Math.round((safeFailures / safeTotal) * 100) : 0;
    const durationSec = Math.max(0, Number(durationMs) || 0) / 1000;

    const lines = [];
    lines.push(`${batchLabel} finished`);
    lines.push(`success: ${safeSuccess}/${safeTotal} (${percent}%)`);
    lines.push(
      `errors in this batch: ${safeFailures}/${safeTotal} (${errorPercent}%)`,
    );
    lines.push(
      `total errors: ${(errorStats && errorStats.totalErrors) || safeFailures}/${safeTotal} (${errorPercent}%)`,
    );

    const byType = (errorStats && errorStats.byType) || {};
    const typeKeys = Object.keys(byType);
    if (typeKeys.length > 0) {
      lines.push("error types:");
      for (const key of typeKeys) {
        lines.push(`- ${key}: ${byType[key]}`);
      }
    }

    lines.push(
      `recovered errors using strategy: ${(errorStats && errorStats.recoveredErrors) || 0}`,
    );
    lines.push(`duration: ${durationSec.toFixed(2)}s`);

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
