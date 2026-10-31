/** DOM regressions that a render-without-errors smoke test cannot detect. */
export async function runUiLayoutChecks() {
    const wait = (ms = 180) => new Promise((resolve) => setTimeout(resolve, ms));
    await document.fonts.ready;
    const failures = [];
    const measurements = [];
    const check = (ok, label) => {
        if (!ok) failures.push(label);
    };
    for (const [width, height] of [
        [760, 720],
        [620, 640],
    ]) {
        window.__QA_SET_SIZE__(width, height);
        for (const panel of [
            'HealthSettingPanel',
            'StatsSettingPanel',
            'TeleportPanel',
            'SwitchSettingPanel',
            'ItemSettingPanel',
            'VariableSettingPanel',
            'ShortcutPanel',
            'SaveRecallPanel',
            'TranslateNamesPanel',
            'TranslateCacheManagerPanel',
            'TranslateImagesPanel',
            'HacksPanel',
        ]) {
            window.__QA_APP__.panel = panel;
            await wait();
            await Vue.nextTick();
            if (panel === 'TranslateCacheManagerPanel') {
                window.__QA_SEED_CACHE__();
                await wait();
            }
            const root = document.querySelector('.cheat-panel-content');
            const placeholder = root.querySelector('.v-field--variant-solo .v-field-label');
            if (placeholder)
                check(
                    placeholder.getBoundingClientRect().left -
                        placeholder.closest('.v-field').getBoundingClientRect().left >=
                        10,
                    'Placeholder padding is missing'
                );
            const footer = root.querySelector('.v-data-table-footer');
            if (footer) {
                const bounds = footer.getBoundingClientRect();
                check(bounds.height <= 60, `${panel} pagination wraps at ${width}`);
                check(
                    bounds.right <= root.getBoundingClientRect().right + 1,
                    `${panel} footer overflows`
                );
                check(
                    footer.querySelector('.v-select__selection-text')?.textContent.trim() === '5',
                    `${panel} page size label is invalid`
                );
            }
            const refresh = root.querySelector('.cheat-refresh');
            if (refresh) {
                const bounds = refresh.getBoundingClientRect();
                const card = refresh.closest('.v-card').getBoundingClientRect();
                check(
                    bounds.width === 36 &&
                        bounds.height === 36 &&
                        Math.abs(bounds.top - card.top - 8) < 2,
                    `${panel} inconsistent refresh`
                );
            }
            if (panel === 'HealthSettingPanel')
                for (const cell of root.querySelectorAll('.cheat-health-cell')) {
                    const input = cell.querySelector('input').getBoundingClientRect();
                    const maximum = cell.querySelector('span.text-caption').getBoundingClientRect();
                    check(
                        Math.abs(input.y + input.height / 2 - maximum.y - maximum.height / 2) < 8,
                        'HP/MP values are misaligned'
                    );
                }
            if (panel === 'ItemSettingPanel' || panel === 'TranslateCacheManagerPanel') {
                const wrapper = root.querySelector('.v-table__wrapper');
                check(
                    wrapper.scrollHeight <= wrapper.clientHeight + 2,
                    `Five inventory rows require scrolling at ${width}`
                );
                check(
                    root.querySelectorAll('tbody tr').length === 5,
                    'Inventory fixture must show five rows'
                );
            }
            if (panel === 'VariableSettingPanel') {
                const input = root.querySelector('tbody input');
                check(
                    input.getBoundingClientRect().width >= 130,
                    'Variable editor does not fill its column'
                );
                const track = root.querySelector('.v-switch__track');
                check(
                    track.getBoundingClientRect().width <= 40,
                    'Only translated switch is oversized'
                );
            }
            if (panel === 'ShortcutPanel') {
                const button = root.querySelector('tbody .v-field button');
                const input = button.closest('.v-field').querySelector('input');
                const b = button.getBoundingClientRect(),
                    i = input.getBoundingClientRect();
                check(
                    Math.abs(b.top + b.height / 2 - i.top - i.height / 2) < 3,
                    'Shortcut clear button is not centered'
                );
            }
            if (panel === 'TeleportPanel') {
                const fields = root.querySelectorAll('input');
                check(
                    Math.abs(
                        fields[0].getBoundingClientRect().top -
                            fields[1].getBoundingClientRect().top
                    ) < 2,
                    'Teleport X/Y are on different rows'
                );
            }
            if (panel === 'SwitchSettingPanel')
                check(
                    root.querySelector('.cheat-toggle-all .v-icon').getBoundingClientRect().width >=
                        26,
                    'Toggle all switches icon is too small'
                );
            if (panel === 'TranslateNamesPanel') {
                const checkbox = Array.from(root.querySelectorAll('.v-label')).find((el) =>
                    el.textContent.includes('Only actors')
                );
                const bounds = checkbox.getBoundingClientRect();
                check(bounds.width > 150 && bounds.height < 45, 'Names checkbox collapsed');
            }
            if (panel === 'TranslateImagesPanel') {
                const imagePanel = window.__QA_COMPONENT__('TranslateImagesPanel');
                imagePanel.folderTreeItems = Array.from({ length: 40 }, (_, i) => ({
                    id: 'fixture-' + i,
                    name: 'Folder ' + i,
                    directImageCount: 1,
                    children: [],
                }));
                await wait();
                const tree = root.querySelector('.cheat-export-tree');
                check(tree.scrollHeight > tree.clientHeight, 'Exporter fixture must overflow');
                tree.scrollTop = 100;
                check(tree.scrollTop === 100, 'Exporter folder list cannot scroll');
                const selection = root.querySelector('.v-select__selection-text');
                check(
                    selection.textContent === 'English' &&
                        selection.scrollWidth <= selection.clientWidth + 1,
                    'Exporter language is truncated'
                );
            }
            if (panel === 'HacksPanel')
                check(
                    getComputedStyle(root.querySelector('.text-amber')).color ===
                        'rgb(255, 193, 7)',
                    'Warning color missing'
                );
            measurements.push({
                panel,
                width,
                footerHeight: footer?.getBoundingClientRect().height,
            });
        }
    }
    window.__QA_APP__.panel = 'TranslateTagManagerPanel';
    await wait();
    const tags = window.__QA_COMPONENT__('TranslateTagManagerPanel');
    tags.customTagForm = {
        description: 'Cancel the effect that displays text at once.',
        tagSymbol: '<',
        style: 'escape',
        type: 'withoutParameter',
        reservedWidth: 0,
        extraPromptForLlm: '',
        requiredConsistency: true,
    };
    tags.customTagReadOnlyMode = true;
    tags.customTagDialogVisible = true;
    await wait(250);
    for (const input of document.querySelectorAll(
        '.v-dialog.v-overlay--active .v-field input:not([inputmode=none])'
    ))
        check(
            input.getBoundingClientRect().left -
                input.closest('.v-field').getBoundingClientRect().left +
                parseFloat(getComputedStyle(input).paddingLeft) >=
                8,
            'Modal editor has no inner padding'
        );
    tags.customTagDialogVisible = false;
    await wait(250);
    tags.findUnknownTagsVisible = true;
    await wait();
    window.__QA_COMPONENT__('UnknownTagsModal').unknownTagsList = [
        { pattern: '<BEValid>', count: 1 },
    ];
    await wait(250);
    const unknown = document.querySelector('.v-dialog.v-overlay--active .cheat-unknown-tags-table');
    check(
        !!unknown && getComputedStyle(unknown).marginLeft === '16px',
        'Unknown-tags table margin is missing'
    );
    tags.findUnknownTagsVisible = false;
    await wait(250);
    const service = window.__QA_SERVICES__.translation;
    service.state.modalDataGathering = false;
    service.state.modalStats = Array.from({ length: 15 }, (_, i) => ({
        id: 'fixture-' + i,
        label: 'Translation category ' + i,
        total: 100,
        left: 20,
    }));
    service.state.dialogVisible = true;
    await wait(250);
    const row = document.querySelector('.cheat-mass-translation-row');
    check(row.getBoundingClientRect().height <= 36, 'Mass translation rows are oversized');
    service.state.dialogVisible = false;
    await wait(250);
    const { createWindowUiApp } = await import('../cheat-engine/www/cheat/js/WindowUiLibraries.js');
    const { default: TagPanel } =
        await import('../cheat-engine/www/cheat/panels/TranslateTagManagerPanel.js');
    const resizedHost = document.createElement('div');
    resizedHost.id = 'app';
    document.body.appendChild(resizedHost);
    const resizedApp = createWindowUiApp(window, {
        components: {
            TagPanel: { ...TagPanel, computed: { ...TagPanel.computed, isAiEngine: () => true } },
        },
        data: () => ({ panelHeight: 400 }),
        template:
            "<v-app><v-main><div :style=\"{width: '1000px',height:panelHeight+'px'}\"><tag-panel/></div></v-main></v-app>",
    });
    const resizedVm = resizedApp.mount(resizedHost);
    for (const height of [400, 900]) {
        resizedVm.panelHeight = height;
        await wait();
        check(
            resizedHost.querySelector('.cheat-tag-format').getBoundingClientRect().height <= 48,
            'Tag format dropdown stretches after resize'
        );
    }
    resizedApp.unmount();
    resizedHost.remove();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createWindowUiApp(window, {
        data: () => ({ busy: false }),
        template: `<v-app><cheat-tooltip location="bottom"><template #activator="{props}"><v-btn v-bind="props" :disabled="busy" @click="busy=true">Translate names regression</v-btn></template>Translate names tooltip regression</cheat-tooltip></v-app>`,
    });
    const vm = app.mount(host);
    await wait();
    const button = host.querySelector('button');
    button.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
    await wait(700);
    check(
        !!document.querySelector('.v-tooltip.v-overlay--active'),
        'Tooltip did not open for test'
    );
    button.click();
    await wait(300);
    check(
        vm.busy && !document.querySelector('.v-tooltip.v-overlay--active'),
        'Tooltip remains after action disables button'
    );
    app.unmount();
    host.remove();
    check(window.__QA_ERRORS__.length === 0, `Render errors: ${window.__QA_ERRORS__.join(', ')}`);
    return { userAgent: navigator.userAgent, failures, measurements };
}
