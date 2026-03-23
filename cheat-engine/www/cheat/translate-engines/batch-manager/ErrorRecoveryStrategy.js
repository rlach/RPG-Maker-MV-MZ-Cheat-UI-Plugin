export class ErrorRecoveryStrategy {
  constructor(sessionId = "") {
    this.sessionId = sessionId;
    this.failuresByType = new Map();
    this.failedKeys = new Set();
    this.recoveredKeys = new Set();
  }

  reset(nextSessionId = "") {
    this.sessionId = nextSessionId || this.sessionId;
    this.failuresByType.clear();
    this.failedKeys.clear();
    this.recoveredKeys.clear();
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

  getStats() {
    const byType = {};
    for (const [type, count] of this.failuresByType.entries()) {
      byType[type] = count;
    }

    return {
      totalErrors: this.failedKeys.size,
      recoveredErrors: this.recoveredKeys.size,
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

    if (typeof failure.rejectReason === "string" && failure.rejectReason) {
      return failure.rejectReason;
    }

    if (typeof failure.cancelReason === "string" && failure.cancelReason) {
      return failure.cancelReason;
    }

    return "unknown";
  }
}
