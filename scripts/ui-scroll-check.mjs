import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

// Run against a headless Chrome CDP endpoint and the repository HTTP server.
const origin = process.env.UI_HTTP_URL || 'http://127.0.0.1:8765';
const endpoint = process.env.UI_CDP_URL || 'http://127.0.0.1:9340';
const enginePath = process.argv[2] || 'D:/Dev/RPGMakerSources/MZ/rmmz_core.js';
const engine = readFileSync(enginePath, 'utf8');
const wheelHandler = engine.match(
    /TouchInput\._onWheel\s*=\s*(function\s*\(event\)\s*\{[\s\S]*?\n\});/
)[1];
const pages = await (await fetch(`${endpoint}/json`)).json();
const target = pages.find((page) => page.type === 'page');
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve) => socket.addEventListener('open', resolve, { once: true }));
let id = 0;
const requests = new Map();
socket.addEventListener('message', ({ data }) => {
    const response = JSON.parse(data);
    const request = requests.get(response.id);
    if (!request) return;
    requests.delete(response.id);
    response.error ? request.reject(response.error) : request.resolve(response.result);
});
function call(method, params = {}) {
    return new Promise((resolve, reject) => {
        requests.set(++id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
    });
}
async function evaluate(expression) {
    const result = await call('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
    });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
}
const wait = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));
async function wheel(selector) {
    const point = await evaluate(
        `(()=>{const e=document.querySelector(${JSON.stringify(selector)});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`
    );
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
    await call('Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        ...point,
        deltaX: 0,
        deltaY: 220,
    });
    await wait();
    return evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollTop`);
}
const report = { enginePath };
try {
    await call('Page.navigate', { url: origin });
    await wait();
    await evaluate(`(()=>{
        document.body.innerHTML='<div id="app"><div id="scroll" style="height:200px;width:400px;overflow:auto"><div style="height:1600px">UI</div></div></div><div id="game" style="height:200px;width:400px;overflow:auto"><div style="height:1600px">Game</div></div>';
        window.__gameWheel={_newState:{wheelX:0,wheelY:0}};
        window.__boundWheel=(${wheelHandler}).bind(window.__gameWheel);
        document.addEventListener('wheel',window.__boundWheel,{passive:false});
        // Patching the property after registration does not update the bound listener.
        window.__gameWheel._onWheel=()=>{};
    })()`);
    report.before = await wheel('#scroll');
    await evaluate(
        `import('${origin}/cheat-engine/www/cheat/js/UiScrollGuard.js').then(m=>m.installUiScrollGuard(window))`
    );
    report.after = await wheel('#scroll');
    report.gameAfter = await wheel('#game');
    report.gameWheel = await evaluate('window.__gameWheel._newState.wheelY');
    await call('Page.navigate', { url: `${origin}/tests/ui-browser.html?maker=MZ` });
    for (let attempt = 0; attempt < 100; attempt++) {
        if (await evaluate('!!window.__QA_APP__')) break;
        await wait(100);
    }
    await evaluate(
        `document.addEventListener('wheel',(${wheelHandler}).bind({_newState:{wheelX:0,wheelY:0}}),{passive:false})`
    );
    report.navigation = await wheel('.cheat-navigation');
    await evaluate("window.__QA_APP__.panel='TranslateOnTheFlyPanel'");
    await wait();
    report.settings = await wheel('.cheat-panel-content');
    await evaluate("window.__QA_APP__.panel='ItemSettingPanel'");
    await wait();
    await evaluate(
        `(()=>{const e=document.querySelector('.v-table__wrapper');e.style.height='120px';e.style.flex='none';})()`
    );
    report.table = await wheel('.v-table__wrapper');
    await evaluate(`(()=>{
        const style=document.createElement('style');style.textContent='.v-table__wrapper::-webkit-scrollbar {display:block!important;width:14px!important;}';document.head.appendChild(style);
        document.querySelector('.v-table__wrapper').scrollTop=0;
    })()`);
    const thumb = await evaluate(
        `(()=>{const r=document.querySelector('.v-table__wrapper').getBoundingClientRect();return {x:r.right-7,y:r.top+12};})()`
    );
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', ...thumb });
    await call('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        ...thumb,
        button: 'left',
        buttons: 1,
        clickCount: 1,
    });
    await call('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: thumb.x,
        y: thumb.y + 80,
        button: 'left',
        buttons: 1,
    });
    await call('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: thumb.x,
        y: thumb.y + 80,
        button: 'left',
        buttons: 0,
        clickCount: 1,
    });
    await wait();
    report.scrollbarDrag = await evaluate("document.querySelector('.v-table__wrapper').scrollTop");
    report.errors = await evaluate('window.__QA_ERRORS__');
    if (
        report.before !== 0 ||
        report.after <= 0 ||
        report.gameAfter !== 0 ||
        report.gameWheel !== 440 ||
        report.navigation <= 0 ||
        report.settings <= 0 ||
        report.table <= 0 ||
        report.scrollbarDrag <= 0 ||
        report.errors.length
    ) {
        process.exitCode = 1;
    }
    mkdirSync('deploy/output', { recursive: true });
    writeFileSync('deploy/output/ui-scroll-check.json', JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
} finally {
    socket.close();
}
