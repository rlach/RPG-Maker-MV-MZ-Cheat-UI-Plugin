/** Dispatch real browser keys: synthetic DOM events cannot test default editing actions. */
export async function runUiKeyboardChecks(call, evaluate) {
    const failures = [];
    const results = [];
    const wait = (ms = 180) => new Promise((resolve) => setTimeout(resolve, ms));
    const check = (ok, label) => {
        if (!ok) failures.push(label);
    };
    const key = async (name, code, sessionId, modifiers = 0) => {
        for (const type of ['keyDown', 'keyUp']) {
            await call(
                'Input.dispatchKeyEvent',
                { type, key: name, windowsVirtualKeyCode: code, modifiers },
                sessionId
            );
        }
    };
    await evaluate(`(()=>{
        window.__QA_EXTERNAL__=window.open('../cheat-engine/www/cheat/window.html','keyboard-regression');
        const external=window.__QA_EXTERNAL__;
        external.require=window.require;external.process=window.process;external.nw=window.nw;
        external.addEventListener('DOMContentLoaded',()=>{
            external.__QA_GAME_KEYS__=[];
            external.document.addEventListener('keydown',e=>{external.__QA_GAME_KEYS__.push(e.key);if(['Backspace','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))e.preventDefault();});
        },{once:true});
    })()`);
    for (let attempt = 0; attempt < 100; attempt++) {
        if (await evaluate('!!window.__QA_EXTERNAL__?.__CHEAT_APP__')) break;
        await wait(100);
    }
    const targets = await call('Target.getTargets');
    const external = targets.targetInfos.find((target) =>
        target.url.includes('/cheat/window.html')
    );
    if (!external) throw new Error('External UI did not open');
    const attached = await call('Target.attachToTarget', {
        targetId: external.targetId,
        flatten: true,
    });
    try {
        for (const [mode, sessionId] of [
            ['embedded', undefined],
            ['external', attached.sessionId],
        ]) {
            await call('Page.bringToFront', {}, sessionId);
            const ev = (expression) => evaluate(expression, sessionId);
            await ev(
                mode === 'embedded'
                    ? "window.__QA_APP__.panel='ItemSettingPanel'"
                    : "window.__CHEAT_APP__.currentComponentName='ItemSettingPanel'"
            );
            await wait();
            await ev(
                `(()=>{window.__QA_GAME_KEYS__=[];const input=document.querySelector('.cheat-panel-content input');input.focus();input.value='abcd';input.dispatchEvent(new Event('input',{bubbles:true}));input.setSelectionRange(4,4);})()`
            );
            await key('ArrowLeft', 37, sessionId);
            const left = await ev('document.activeElement.selectionStart');
            await key('Backspace', 8, sessionId);
            const text = await ev('document.activeElement.value');
            await key('ArrowRight', 39, sessionId);
            const right = await ev('document.activeElement.selectionStart');
            check(
                left === 3 && text === 'abd' && right === 3,
                `${mode}: native text editing failed`
            );
            await key('a', 65, sessionId, 2);
            await key('Backspace', 8, sessionId);
            check(
                await ev("document.activeElement.value===''"),
                `${mode}: Ctrl+A / Backspace failed`
            );
            await ev(
                mode === 'embedded'
                    ? "window.__QA_APP__.panel='TranslateOnTheFlyPanel'"
                    : "window.__CHEAT_APP__.currentComponentName='TranslateOnTheFlyPanel'"
            );
            await wait();
            await ev(
                `(()=>{const input=Array.from(document.querySelectorAll('input[type=number]')).find(e=>!e.disabled);if(!input)throw new Error('Numeric fixture input missing');input.focus();input.value='40';input.dispatchEvent(new Event('input',{bubbles:true}));})()`
            );
            await key('ArrowUp', 38, sessionId);
            const up = await ev('document.activeElement.value');
            await key('ArrowDown', 40, sessionId);
            const down = await ev('document.activeElement.value');
            await ev(
                mode === 'embedded'
                    ? "window.__QA_APP__.panel='GeneralPanel'"
                    : "window.__CHEAT_APP__.currentComponentName='GeneralPanel'"
            );
            await wait();
            await ev(
                `(()=>{const input=document.querySelector('.cheat-panel-content input[type=number]');input.focus();input.value='40';input.dispatchEvent(new Event('input',{bubbles:true}));})()`
            );
            await key('ArrowUp', 38, sessionId);
            const goldUp = await ev('document.activeElement.value');
            await key('ArrowDown', 40, sessionId);
            const goldDown = await ev('document.activeElement.value');
            check(goldUp === '41' && goldDown === '40', `${mode}: Gold stepping failed`);
            await ev('window.$gameVariables.setValue(1,40)');
            await ev(
                mode === 'embedded'
                    ? "window.__QA_APP__.panel='VariableSettingPanel'"
                    : "window.__CHEAT_APP__.currentComponentName='VariableSettingPanel'"
            );
            await wait();
            await ev(
                `(()=>{const input=Array.from(document.querySelectorAll('tbody input')).find(e=>e.value==='40');if(!input)throw new Error('Numeric variable missing');input.focus();})()`
            );
            await key('ArrowUp', 38, sessionId);
            const variableUp = await ev('document.activeElement.value');
            await key('ArrowDown', 40, sessionId);
            const variableDown = await ev('document.activeElement.value');
            check(
                variableUp === '41' && variableDown === '40',
                `${mode}: numeric variable stepping failed`
            );
            await ev(
                `(()=>{const input=document.activeElement;input.value='word';input.dispatchEvent(new Event('input',{bubbles:true}));input.setSelectionRange(4,4);})()`
            );
            await key('ArrowUp', 38, sessionId);
            check(
                await ev("document.activeElement.value==='word'"),
                `${mode}: text variable was changed by stepping`
            );
            await ev('document.activeElement.setSelectionRange(4,4)');
            await key('Backspace', 8, sessionId);
            check(
                await ev("window.$gameVariables.value(1)==='wor'"),
                `${mode}: text variable editing failed`
            );
            await ev(
                `(()=>{let overlay=document.querySelector('.v-overlay-container');if(!overlay){overlay=document.createElement('div');overlay.className='v-overlay-container';document.body.appendChild(overlay);}const input=document.createElement('textarea');input.id='keyboard-overlay-fixture';overlay.appendChild(input);input.value='abcd';input.focus();input.setSelectionRange(4,4);})()`
            );
            await key('Backspace', 8, sessionId);
            const modalText = await ev('document.activeElement.value');
            check(modalText === 'abc', `${mode}: teleported field editing failed`);
            await ev("document.getElementById('keyboard-overlay-fixture').remove()");
            const leakedKeys = await ev('window.__QA_GAME_KEYS__');
            check(up === '41' && down === '40', `${mode}: numeric stepping failed`);
            check(leakedKeys.length === 0, `${mode}: editing keys reached the game`);
            results.push({
                mode,
                left,
                text,
                right,
                up,
                down,
                goldUp,
                goldDown,
                variableUp,
                variableDown,
                modalText,
                leakedKeys,
            });
        }
        // The guard must leave the game's own keyboard events alone.
        const outside = await evaluate(
            `(()=>{const input=document.createElement('input');document.body.appendChild(input);const event=new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true,cancelable:true});input.dispatchEvent(event);input.remove();return event.defaultPrevented;})()`
        );
        check(outside, 'Game keyboard outside the UI was intercepted');
    } finally {
        await call('Target.closeTarget', { targetId: external.targetId });
    }
    return { failures, results };
}
