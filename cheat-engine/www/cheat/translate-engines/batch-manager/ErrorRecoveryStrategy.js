export class ErrorRecoveryStrategy {
  constructor(sessionId = "") {
    this.sessionId = sessionId;
    this.failuresByType = new Map();
    this.failedKeys = new Set();
    this.recoveredKeys = new Set();
    this.recoveryAttempts = 0;
  }

  reset(nextSessionId = "") {
    this.sessionId = nextSessionId || this.sessionId;
    this.failuresByType.clear();
    this.failedKeys.clear();
    this.recoveredKeys.clear();
    this.recoveryAttempts = 0;
  }

  recordFailure(failure) {
    if (!failure || typeof failure !== "object") {
      this._incrementType("unknown");
      return;
    }

    const reason = this._resolveReason(failure);
    this._incrementType(reason);

    if (failure.cacheKey) {
      this.failedKeys.add(failure.cacheKey);
    }
  }

  recordRecovery(cacheKey) {
    if (!cacheKey) {
      return;
    }

    this.recoveredKeys.add(cacheKey);
  }

  recordRecoveryAttempt(count = 1) {
    const safeCount = Math.max(1, Number(count) || 1);
    this.recoveryAttempts += safeCount;
  }

  getStats() {
    const byType = {};
    for (const [type, count] of this.failuresByType.entries()) {
      byType[type] = count;
    }

    return {
      totalErrors: this.failedKeys.size,
      recoveredErrors: this.recoveredKeys.size,
      recoveryAttempts: this.recoveryAttempts,
      byType,
    };
  }

  _incrementType(type) {
    const key = type || "unknown";
    this.failuresByType.set(key, (this.failuresByType.get(key) || 0) + 1);
  }

  _resolveReason(failure) {
    if (typeof failure.errorType === "string" && failure.errorType) {
      return failure.errorType;
    }

    if (typeof failure.cancelReason === "string" && failure.cancelReason) {
      return failure.cancelReason;
    }

    if (typeof failure.rejectReason === "string" && failure.rejectReason) {
      return failure.rejectReason;
    }

    return "unknown";
  }
}
