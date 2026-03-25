import { BatchSummaryReporter } from "./BatchSummaryReporter.js";

export class BatchProgressTracker {
  constructor(panel) {
    this.panel = panel;
    this.currentStepLabel = "";
    this.currentProcessed = 0;
    this.currentTotal = 0;
    this.currentStepErrors = 0;
    this.currentStepProcessed = 0;
    this.totalErrors = 0;
    this.queueProcessed = 0;
    this.queueTotal = 0;
    this.phaseStartQueueProcessed = 0;
    this.paused = false;
    this.pauseReason = "";
    this.prePauseSnapshot = null;
  }

  /**
   * Begin a multi-phase queue. Starts the spinner once for the whole job.
   * Each phase within the queue calls beginPhase().
   * The queue owner calls endQueue() when all phases are done.
   */
  beginQueue() {
    this.currentStepLabel = "";
    this.currentProcessed = 0;
    this.currentTotal = 0;
    this.currentStepErrors = 0;
    this.currentStepProcessed = 0;
    this.totalErrors = 0;
    this.queueProcessed = 0;
    this.queueTotal = 0;
    this.phaseStartQueueProcessed = 0;
    this.paused = false;
    this.panel.showSpinner();
    this._render();
  }

  /**
   * Transition to the next phase within an active queue.
   * Does NOT touch the spinner — the queue owns the spinner lifecycle.
   */
  beginPhase(phaseLabel, phaseTotal = 0) {
    this.currentStepLabel = phaseLabel || "translating";
    this.currentProcessed = 0;
    this.currentTotal = Math.max(0, Number(phaseTotal) || 0);
    this.currentStepErrors = 0;
    this.currentStepProcessed = 0;
    this.phaseStartQueueProcessed = this.queueProcessed;
    this.queueTotal += this.currentTotal;
    // totalErrors intentionally kept — accumulates across phases
    this._render();
  }

  /**
   * End the queue: hide spinner and progress box.
   */
  endQueue() {
    this.panel.hideSpinner();
    this.panel.hideProgressBox();
  }

  updateStep(stepLabel, currentProcessed, currentTotal) {
    this.currentStepLabel = stepLabel || this.currentStepLabel;
    this.currentProcessed = Math.max(0, Number(currentProcessed) || 0);
    this.currentTotal = Math.max(0, Number(currentTotal) || this.currentTotal);
    this.queueProcessed = Math.max(
      this.queueProcessed,
      this.phaseStartQueueProcessed + this.currentProcessed,
    );
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

  addTotalErrors(errorCountDelta) {
    this.totalErrors += Math.max(0, Number(errorCountDelta) || 0);
    this._render();
  }

  pause(reason = "paused by OTF") {
    if (!this.paused) {
      this.prePauseSnapshot = {
        currentStepLabel: this.currentStepLabel,
        currentProcessed: this.currentProcessed,
        currentTotal: this.currentTotal,
        currentStepErrors: this.currentStepErrors,
        currentStepProcessed: this.currentStepProcessed,
        totalErrors: this.totalErrors,
        queueProcessed: this.queueProcessed,
        queueTotal: this.queueTotal,
        phaseStartQueueProcessed: this.phaseStartQueueProcessed,
      };
    }
    this.paused = true;
    this.pauseReason = reason || "paused by OTF";
    this._render();
  }

  resume(stepLabel) {
    this.paused = false;
    this.pauseReason = "";
    if (this.prePauseSnapshot) {
      this.currentStepLabel = this.prePauseSnapshot.currentStepLabel;
      this.currentProcessed = this.prePauseSnapshot.currentProcessed;
      this.currentTotal = this.prePauseSnapshot.currentTotal;
      this.currentStepErrors = this.prePauseSnapshot.currentStepErrors;
      this.currentStepProcessed = this.prePauseSnapshot.currentStepProcessed;
      this.totalErrors = this.prePauseSnapshot.totalErrors;
      this.queueProcessed = this.prePauseSnapshot.queueProcessed;
      this.queueTotal = this.prePauseSnapshot.queueTotal;
      this.phaseStartQueueProcessed =
        this.prePauseSnapshot.phaseStartQueueProcessed;
      this.prePauseSnapshot = null;
    }
    if (stepLabel) {
      this.currentStepLabel = stepLabel;
    }
    this._render();
  }

  _render() {
    const title = this.paused
      ? `batch paused by OTF - ${this.pauseReason || "translating event"}`
      : this.currentStepLabel;
    const progress = BatchSummaryReporter.buildProgress({
      title,
      processed: this.currentProcessed,
      total: this.currentTotal,
      currentStepErrors: this.currentStepErrors,
      currentStepProcessed: this.currentStepProcessed,
      totalErrors: this.totalErrors,
      totalProcessed: this.queueProcessed,
      queueTotal: this.queueTotal,
    });

    this.panel.updateProgressBox(
      progress.title,
      progress.message,
      progress.currentErrorsLine,
      progress.totalErrorsLine,
    );
  }
}
