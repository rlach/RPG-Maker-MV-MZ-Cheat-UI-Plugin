# NUUN random-item event override harvesting (2.1.40)

RJ01203748 item pickups use NUUN_RandomItems ItemList event commands. Their nested JSON list entries contain per-reward GetText overrides, such as \I[350]特ダネ. Native Game_Party.itemNameVal sends these strings to Game_Message.add, explaining why they appeared under message in seen rather than through ordinary item-name display.

NuunRandomItemsTranslator inherited shouldScanEventData=false from ParameterSourceCatalogTranslator. Its static parameter scan therefore missed the per-event override strings. The adapter now scans common events and map pages using the existing nested parameter extractor, deduplicates the resulting keys and retains map names in map_name. The existing runtime message bridge resolves the plugin catalog before standard message rendering.

A read-only probe of the installed game finds 131 ItemList commands and 136 unique override texts, including the reported icon-prefixed text and the old-photo reward. Regression coverage checks the nested JSON structure, duplicate map/common-event discoveries, unchanged condition expressions and source data, icon preservation and plugin-to-message cache bridging.

Validation: 1066 tests pass; ESLint, registry and diff whitespace checks pass. Live game rendering remains unverified. Game installations, saves and user cache files were not modified. Run MT after installation to translate the newly harvested overrides.
