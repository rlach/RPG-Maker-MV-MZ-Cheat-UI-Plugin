export async function runUiBoxingChecks(call, evaluate) {
    const wait = () => new Promise((resolve) => setTimeout(resolve, 200));
    await evaluate(`import('../cheat-engine/www/cheat/components/BoxingModal.js').then(({BOXING_SERVICE})=>{
        window.__QA_BOXING__=BOXING_SERVICE;
        BOXING_SERVICE.state.typeStats=['item_description','armor_description'].map(type=>({type,translatedCount:7,untranslatedCount:0}));
        BOXING_SERVICE.state.selection={item_description:true,armor_description:false};
        BOXING_SERVICE.state.dialogVisible=true;
    })`);
    await wait();
    const results = [];
    const failures = [];
    for (const [type, expected] of [
        ['item_description', false],
        ['armor_description', true],
        ['item_description', true],
        ['armor_description', false],
    ]) {
        const point = await evaluate(`(()=>{
            const row=[...document.querySelectorAll('.v-checkbox')].find(e=>e.textContent.includes('${type}'));
            const r=row.querySelector('input').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};
        })()`);
        for (const event of ['mousePressed', 'mouseReleased'])
            await call('Input.dispatchMouseEvent', {
                type: event,
                ...point,
                button: 'left',
                clickCount: 1,
            });
        await wait();
        const result = await evaluate(`(()=>{
            const row=[...document.querySelectorAll('.v-checkbox')].find(e=>e.textContent.includes('${type}'));
            return {type:'${type}',checked:row.querySelector('input').checked,selected:window.__QA_BOXING__.state.selection['${type}']};
        })()`);
        results.push(result);
        if (result.checked !== expected || result.selected !== expected) failures.push(type);
    }
    const errors = await evaluate('window.__QA_ERRORS__');
    if (errors.length) failures.push(...errors);
    await evaluate('window.__QA_BOXING__.state.dialogVisible=false');
    return { results, failures };
}
