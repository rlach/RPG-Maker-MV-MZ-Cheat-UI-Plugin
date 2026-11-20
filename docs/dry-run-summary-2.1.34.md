# Dry-run summary severity (2.1.34)

Completed dry runs now produce a success notification even though simulated dry_run failures populate the diagnostic results and empty cache entries. The summary explicitly explains that these failures are expected. Error and recovery diagnostics remain visible; normal translation failures retain error severity.

The dry-run flag is passed through per-phase, queue and object-translation summaries. A queue whose requests are all dry runs also propagates that mode to its final summary. Exceptions continue through the existing error handling.

Regression tests cover summary severity, retained diagnostics and both options-level and request-level dry-run mode. Game installations and user caches were not modified.
