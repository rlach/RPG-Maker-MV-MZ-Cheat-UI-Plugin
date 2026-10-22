import { getUnifiedSetting, setUnifiedSetting } from './UnifiedSettings.js';

function normalizeIds(ids) {
    return [
        ...new Set(
            (Array.isArray(ids) ? ids : [])
                .map(Number)
                .filter((id) => Number.isInteger(id) && id > 0)
        ),
    ].sort((a, b) => a - b);
}

export function getPinnedVariableIds() {
    return normalizeIds(getUnifiedSetting('pinnedVariableIds', []));
}

export function setVariablePinned(id, pinned) {
    const ids = new Set(getPinnedVariableIds());
    if (pinned) ids.add(Number(id));
    else ids.delete(Number(id));
    const normalized = normalizeIds([...ids]);
    setUnifiedSetting('pinnedVariableIds', normalized);
    return normalized;
}
