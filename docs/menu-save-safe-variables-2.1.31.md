# LL menu and NUUN saved variable values (2.1.31)

RJ01228927 uses safe string variable 10 for its location label and variable 26 for its objective. Both have existing variable_value cache entries. LL_MenuScreenCustom evaluates the variables before drawText, outside escape conversion. NUUN_SaveScreen records the raw values in orgParam_4 and orgParam_6 and renders them through drawOriginal; these fields do not use drawMapName or drawAnyName.

The LL menu help window now enters variable display context during creation and refresh. The standard safe-variable hook therefore resolves the values for rendering while gameplay reads remain raw.

The NUUN adapter localizes direct safe-variable expressions in drawOriginal using a display-only copy of the saved info. It uses the text from the selected save, never the live session variable. It accepts direct value expressions with the plugin's trailing comment syntax and leaves arbitrary expressions unchanged. This works for existing save metadata without rewriting saves. Translation-off and unsafe-variable behavior remain unchanged.

Regression coverage checks both saved location and objective values, safety gating, arbitrary-expression rejection, initial menu rendering, refresh, translation-off behavior, and context cleanup after rendering exceptions. Live game screen validation remains outstanding. No game files, saves or user caches were modified.
