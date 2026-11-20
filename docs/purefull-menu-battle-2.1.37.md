# Purefull Lily menu and battle support (2.1.37)

Game: RJ01412088 / PurefullLily_Ver.1.00.

| Report | Finding and change |
| --- | --- |
| Pink notifications appear in seen but not MT | TorigoyaMZ_NotifyMessage_CommandMessage uses Show, which the existing notify scanner rejected. The scanner now accepts that exact plugin/command combination while keeping other commands excluded. The existing notification runtime handles the cached results. |
| Main menu | VE_Single_Actor_MZ draws Critical Rate, To Next Level and money labels as text. Added source-catalog harvesting and presentation translation. |
| Next action in battle | Keke_PredictionSystem overrides the skill name with text from a skill note such as <行動予測: text:拘束>. These note display values are now harvested and resolved at drawing time; skill notes and gameplay metadata remain unchanged. |
| Custom battle notifications | BattleLogOutput OUTPUT_LOG message payloads are collected. displayCustomLog is translated before line splitting and escape expansion. |
| Reward drop heading | NRP_VictoryRewards_Custom DropItemHeadline parameter is harvested and resolved by the message/display pipeline. |

Read-only inspection of the decoded EroStatus_4 background confirms that the lewdness label, body-part use labels and units, prostitution/count/collection labels, Lily comment heading and comment prose are baked into the background image. They were not translated. Numeric overlays remain native text.

Validation: 1062 tests pass, ESLint and translator registration (301 classes) pass, and diff whitespace checks pass. A read-only installed-source probe finds 186 menu/battle catalog entries, verifies the reported battle log and prediction override, and identifies 978 CommandMessage Show calls in common events. Regression tests cover command recognition, prediction metadata harvesting, reward heading collection, rendering, escape preservation, numeric values and translation-off behavior.

Live screen validation remains outstanding. No game installation, saves or user cache files were modified. Install with the usual script and run MT for the new entries.
