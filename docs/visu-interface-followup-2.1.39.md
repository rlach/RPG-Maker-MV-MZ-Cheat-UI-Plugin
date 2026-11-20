# VisuStella interface follow-up (2.1.39)

RJ01203748 follow-up findings:

- LabelHitType:str was incorrectly classified as a technical type field by a suffix match. Restrict that exclusion to actual type fields so タイプ is harvested.
- Map item pickups now resolve item_name cache values, including icon/color escape prefixes, without altering the source database or control codes.
- Resolve complete AlchemySystem labels through plugin_alchemy_system before generic fragment translation. The installed cache already contains 必要素材： -> Required Materials:; preferring that full match prevents the mixed 必要Material label.
- Enemy-name presentation preserves native space-separated A/B suffixes while resolving the base enemy_name key. The installed cache has 反転オオカミ -> 反転オオカミ, so these identity-valued enemy names are explicitly queued for retranslation. Original Enemies.json names are read without evaluating scripts; pending entries retain the standard enemy_name cache type. Plugin counts include the discovered enemy keys.

Regression coverage verifies the missing type label, item pickup icon preservation, full crafting label precedence, duplicate-enemy suffixes and source-copy retranslation eligibility. A read-only probe against installed configuration and cache confirms the reported label and Pliers/Required Materials resolutions; an in-memory translated enemy entry verifies suffix rendering.

Game installations, saves and user caches were not modified. Live screen validation remains outstanding. Install using the normal script and run MT to populate the missing type label and retranslate identity-valued enemy names.
