export class BatchProgressTracker {
  constructor(panel) {
    this.panel = panel;
    this.currentStepLabel = "";
    this.currentProcessed = 0;
    this.currentTotal = 0;
    this.currentStepErrors = 0;
    this.currentStepProcessed = 0;
    this.totalErrors = 0;
    this.paused = false;
  }

  start(stepLabel, currentTotal = 0) {
    this.currentStepLabel = stepLabel || "translating";
    this.currentProcessed = 0;
    this.currentTotal = Math.max(0, Number(currentTotal) || 0);
    this.currentStepErrors = 0;
    this.currentStepProcessed = 0;
    this.totalErrors = 0;
    this.paused = false;

    this.panel.showSpinner();
    this._render();
  }

  updateStep(stepLabel, currentProcessed, currentTotal) {
    this.currentStepLabel = stepLabel || this.currentStepLabel;
    this.currentProcessed = Math.max(0, Number(currentProcessed) || 0);
    this.currentTotal = Math.max(0, Number(currentTotal) || this.currentTotal);
    this.currentStepErrors = 0;
    this.currentStepProcessed = 0;
    this._render();
  }

  updateCurrentStepErrors(currentStepErrors, currentStepProcessed) {
    this.currentStepErrors = Math.max(0, Number(currentStepErrors) || 0);
    this.currentStepProcessed = Math.max(0, Number(currentStepProcessed) || 0);
    this._render();
  }

  updateTotalErrors(totalErrors) {
    this.totalErrors = Math.max(0, Number(totalErrors) || 0);
    this._render();
  }

  pause(reason = "paused by OTF") {
    this.paused = true;
    this.currentStepLabel = reason;
    this._render();
  }

  resume(stepLabel) {
    this.paused = false;
    if (stepLabel) {
      this.currentStepLabel = stepLabel;
    }
    this._render();
  }

  complete() {
    this.panel.hideSpinner();
    this.panel.hideProgressBox();
  }

  _render() {
    const title = this.paused
      ? `batch paused by OTF - ${this.currentStepLabel}`
      : this.currentStepLabel;
    const progress = `${this.currentProcessed}/${this.currentTotal}`;
    const percent =
      this.currentTotal > 0
        ? Math.round((this.currentProcessed / this.currentTotal) * 100)
        : 100;

    let messageLine = `${progress} (${percent}%)`;
    if (this.currentStepErrors > 0 && this.currentStepProcessed > 0) {
      const currentStepErrorPercent = Math.round(
        (this.currentStepErrors / this.currentStepProcessed) * 100,
      );
      messageLine += ` | errors: ${this.currentStepErrors}/${this.currentStepProcessed} (${currentStepErrorPercent}%)`;
    }

    let totalErrorsLine = null;
    if (this.totalErrors > 0) {
      const processedForTotalErrors = Math.max(0, this.currentProcessed);
      const totalErrorPercent =
        processedForTotalErrors > 0
          ? Math.round((this.totalErrors / processedForTotalErrors) * 100)
          : 0;
      totalErrorsLine = `total errors: ${this.totalErrors}/${processedForTotalErrors} (${totalErrorPercent}%)`;
    }

    this.panel.updateProgressBox(
      title,
      messageLine,
      null,
      null,
      totalErrorsLine,
    );
  }
}
