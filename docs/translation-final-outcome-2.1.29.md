# Translation final outcome (2.1.29)

Summary severity now follows final unresolved outcomes, rather than cumulative attempt errors. Recovery statistics and error-type diagnostics remain in the summary.

The batch manager reconciles results by cache key after all phases finish. A failure recovered by a later phase (including CacheEmptyStrings retries) no longer remains in returned failures or lowers the final success percentage. Repeated outcomes for one key count once. Existing usable cache entries also resolve earlier failed attempts. Historical failure counts remain available in summary diagnostics.

Regression coverage includes ordinary-phase failures recovered by cleanup, repeated empty-string translation, recovery diagnostics with a fully successful result, incomplete results, and persistent notifications for genuine failures. No game installations or user caches were modified.
