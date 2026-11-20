# Dedicated dry-run report

Dry runs now use a separate DryRunSummary report showing the unique cache keys still awaiting translation. The queue counts distinct cacheKey values across all phase results and filters keys that have a usable translation at completion. Repeated discovery and empty-string cleanup therefore do not inflate the count. Object-translation jobs reuse this report rather than reconstructing a translation success/error report from attempt totals.

The dry-run report omits translation success percentages and synthetic failure totals. Ordinary translation reporting is unchanged. Tests cover duplicate keys, already-translated keys, and the same key discovered by multiple queue requests in both request-level and options-level dry-run mode.

Package version remains 2.1.34 as requested. No game installations or user cache files were modified.
