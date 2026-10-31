import { mkdirSync, writeFileSync } from 'node:fs';
const base = process.env.UI_CDP_URL || 'http://127.0.0.1:9340';
const pages = await (await fetch(`${base}/json`)).json();
const target =
    pages.find((page) => page.url.includes('/tests/ui-browser.html')) ||
    (process.argv.includes('--navigate') ? pages.find((page) => page.type === 'page') : null);
if (!target) throw new Error('Open tests/ui-browser.html in the headless browser first');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
});
let id = 0;
const requests = new Map();
socket.addEventListener('message', ({ data }) => {
    const result = JSON.parse(data);
    if (!requests.has(result.id)) return;
    const entry = requests.get(result.id);
    requests.delete(result.id);
    clearTimeout(entry.timer);
    result.error
        ? entry.reject(new Error(JSON.stringify(result.error)))
        : entry.resolve(result.result);
});
const call = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
        const key = ++id;
        const timer = setTimeout(() => reject(new Error(`Timeout: ${method}`)), 30000);
        requests.set(key, { resolve, reject, timer });
        socket.send(JSON.stringify({ id: key, method, params, sessionId }));
    });
async function evaluate(expression, sessionId) {
    const result = await call(
        'Runtime.evaluate',
        {
            expression,
            awaitPromise: true,
            returnByValue: true,
            userGesture: true,
        },
        sessionId
    );
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
}
try {
    await call('Network.enable');
    await call('Network.setCacheDisabled', { cacheDisabled: true });
    if (process.argv.includes('--navigate'))
        await call('Page.navigate', { url: 'http://127.0.0.1:8131/tests/ui-browser.html' });
    if (process.argv.includes('--mz'))
        await call('Page.navigate', {
            url: 'http://127.0.0.1:8131/tests/ui-browser.html?maker=MZ',
        });
    if (
        process.argv.includes('--reload') ||
        process.argv.includes('--mz') ||
        process.argv.includes('--navigate')
    ) {
        if (!process.argv.includes('--mz') && !process.argv.includes('--navigate'))
            await call('Page.reload', { ignoreCache: true });
        for (let attempt = 0; attempt < 100; attempt++) {
            await new Promise((r) => setTimeout(r, 100));
            if (await evaluate('!!window.__QA_READY__ || window.__QA_ERRORS__?.length > 0')) break;
        }
    }
    if (process.argv.includes('--eval')) {
        console.log(
            JSON.stringify(
                await evaluate(process.argv[process.argv.indexOf('--eval') + 1]),
                null,
                2
            )
        );
    } else if (process.argv.includes('--capture')) {
        const shot = await call('Page.captureScreenshot', { format: 'png' });
        writeFileSync(
            process.argv[process.argv.indexOf('--capture') + 1],
            Buffer.from(shot.data, 'base64')
        );
    } else if (process.argv.includes('--screenshots')) {
        const output = process.env.UI_SCREENSHOT_DIR || 'deploy/output/ui-review';
        mkdirSync(output, { recursive: true });
        await call('Emulation.setDeviceMetricsOverride', {
            width: 900,
            height: 780,
            deviceScaleFactor: 1,
            mobile: false,
        });
        await evaluate('window.__QA_SET_SIZE__(760,720)');
        for (const panel of await evaluate('window.__QA_PANELS__')) {
            await evaluate(`window.__QA_APP__.panel=${JSON.stringify(panel)};`);
            await new Promise((r) => setTimeout(r, 300));
            if (panel === 'TranslateCacheManagerPanel') {
                await evaluate('window.__QA_SEED_CACHE__()');
                await new Promise((r) => setTimeout(r, 200));
            }
            await evaluate('document.fonts.ready');
            const shot = await call('Page.captureScreenshot', { format: 'png' });
            writeFileSync(`${output}/${panel}.png`, Buffer.from(shot.data, 'base64'));
        }
        console.log(await evaluate('({errors:window.__QA_ERRORS__})'));
    } else if (process.argv.includes('--keyboard-check')) {
        const { runUiKeyboardChecks } = await import('./ui-keyboard-check.mjs');
        const report = await runUiKeyboardChecks(call, evaluate);
        console.log(JSON.stringify(report, null, 2));
        if (report.failures.length) process.exitCode = 1;
    } else if (process.argv.includes('--layout-check')) {
        const report = await evaluate(
            "import('./ui-layout-check.js?run='+Date.now()).then(module=>module.runUiLayoutChecks())"
        );
        console.log(JSON.stringify(report, null, 2));
        if (report.failures.length) process.exitCode = 1;
    } else if (process.argv.includes('--inspect')) {
        console.log(
            JSON.stringify(
                await evaluate(
                    '({ready:window.__QA_READY__,errors:window.__QA_ERRORS__,body:document.body.innerText.slice(0,1200)})'
                ),
                null,
                2
            )
        );
    } else {
        const report = await evaluate(`(async()=>{
            const wait=()=>new Promise(r=>setTimeout(r,160));
            if(!window.__QA_READY__)throw new Error(JSON.stringify(window.__QA_ERRORS__));
            const panels=[];
            for(const panel of window.__QA_PANELS__){
                window.__QA_APP__.panel=panel;await wait();await Vue.nextTick();
                panels.push({panel,errors:window.__QA_ERRORS__.splice(0),text:document.body.innerText.slice(0,120)});
            }
            window.__QA_APP__.panel='GeneralPanel';await wait();
            const general=document.querySelector('.v-slider');
            const track=general.querySelector('.v-slider-track').getBoundingClientRect();
            const position=()=>{const thumb=general.querySelector('.v-slider-thumb').getBoundingClientRect();return (thumb.x+thumb.width/2-track.x)/track.width;};
            const mouse=(target,type,x,buttons)=>target.dispatchEvent(new MouseEvent(type,{bubbles:true,clientX:x,clientY:track.y+track.height/2,button:0,buttons}));
            mouse(general.querySelector('.v-slider-track'),'mousedown',track.x+track.width*.2,1);await wait();
            mouse(window,'mousemove',track.x+track.width*.8,1);await wait();
            const duringDrag=position();mouse(window,'mouseup',track.x+track.width*.8,0);await wait();
            const afterRelease=position();
            const nav=Array.from(document.querySelectorAll('.v-treeview-item')).find(el=>el.innerText.trim()==='Variables');nav?.click();await wait();
            const navigation=window.__QA_APP__.panel==='variable-setting-panel';
            const services=window.__QA_SERVICES__;
            services.translation.state.modalDataGathering=true;services.translation.state.dialogVisible=true;await wait();
            const massModal=document.body.innerText.includes('Gathering data');
            services.translation.state.dialogVisible=false;await wait();
            services.boxing.state.dialogVisible=true;await wait();
            const boxingModal=!!document.querySelector('.v-overlay--active .v-card-title')?.textContent.includes('Boxing');
            services.boxing.state.dialogVisible=false;await wait();
            const external=window.open('../cheat-engine/www/cheat/window.html?component=GeneralPanel','ui-qa-external');
            const externalErrors=[];
            external.require=window.require;external.process=window.process;external.nw=window.nw;
            external.addEventListener('error',e=>externalErrors.push(e.message));
            for(let attempt=0;attempt<100&&!external.__CHEAT_APP__;attempt++)await wait();
            let externalResult={mounted:false,errors:externalErrors};
            if(external.__CHEAT_APP__){
                external.__CHEAT_APP__.currentComponentName='TranslateOnTheFlyPanel';await wait();
                const select=external.document.querySelector('.v-select');select?.scrollIntoView();select?.querySelector('.v-field')?.dispatchEvent(new external.MouseEvent('mousedown',{bubbles:true,button:0}));await wait();
                externalResult={mounted:true,distinctVue:external.Vue!==Vue,dropdownInExternal:!!external.document.querySelector('.v-menu.v-overlay--active'),dropdownInParent:!!document.querySelector('.v-menu.v-overlay--active'),errors:externalErrors};
            }
            external.close();
            return {vue:Vue.version,vuetify:Vuetify.version,panels,external:externalResult,interactions:{duringDrag,afterRelease,navigation,massModal,boxingModal},errors:window.__QA_ERRORS__};
        })()`);
        console.log(JSON.stringify(report, null, 2));
        if (
            !report.external.mounted ||
            !report.external.distinctVue ||
            !report.external.dropdownInExternal ||
            report.external.dropdownInParent ||
            report.external.errors.length ||
            report.panels.some((panel) => panel.errors.length) ||
            report.errors.length ||
            !report.interactions.navigation ||
            !report.interactions.massModal ||
            !report.interactions.boxingModal ||
            Math.abs(report.interactions.duringDrag - 0.8) > 0.05
        )
            process.exitCode = 1;
    }
} finally {
    socket.close();
}
