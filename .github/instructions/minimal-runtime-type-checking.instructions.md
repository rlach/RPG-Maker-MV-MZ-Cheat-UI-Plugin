---
applyTo: "cheat-engine/www/cheat/**/*.js"
description: "Prefer trust-boundary validation and avoid repetitive runtime type checks in internal runtime code"
---

# Minimal Runtime Type Checking

Use this project style for JavaScript runtime checks.

## Core Rule

- Validate unknown/external inputs at system boundaries.
- Inside internal runtime logic, assume normalized contracts and avoid repetitive `typeof ... === 'function'` checks.

## Trust Boundaries (validate here)

- Browser/DOM/event payloads.
- Plugin metadata (`$plugins`, plugin parameters).
- Network responses / file reads / storage payloads.
- Cross-window messages and opener state.

## Internal Code (do not over-guard)

- Runtime methods owned by this repository should call each other directly.
- Avoid defensive checks before calling known internal methods.
- Prefer one parser/normalizer function at entry point, then trust its output.
- Plugin translators must assume base-level contracts are already normalized.
- Do not add translator-local runtime guard helpers (`resolveRuntime`, `isRuntimeTranslationActive`, method-existence wrappers).

## Preferred Patterns

- Parse once, use many times.
- Fail fast on invalid boundary input.
- Keep fallback behavior localized in one place.
- Prefer `globalThis`/declared globals via `types/*.d.ts` over ad-hoc `window.__*` probing.

## Avoid

- Scattering identical `typeof` checks across business logic.
- Treating internal methods as optional in every call path.
- Silent no-op branches that hide contract violations.
- Adding per-translator boilerplate typeguards for runtime methods guaranteed by `BasePluginTranslator`.

## Refactor Guidance

When touching legacy code:

1. Move validation to the nearest boundary.
2. Remove redundant in-core checks.
3. Add/extend declarations in `types/rpgmaker-globals.d.ts` when globals are known and stable.
4. Keep compatibility guards only where runtime truly differs (MV vs MZ, optional third-party plugin APIs).

## Translator Contract

- `BasePluginTranslator` + registry startup are the single place for runtime contract/type normalization.
- Plugin translators should be readable and domain-focused, not cluttered with repetitive guard code.
- If a translator starts using new RPG Maker globals/classes, update `types/rpgmaker-globals.d.ts` in the same change.
