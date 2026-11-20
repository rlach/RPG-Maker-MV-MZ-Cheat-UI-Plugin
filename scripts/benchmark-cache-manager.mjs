import { mkdirSync, writeFileSync } from 'node:fs';
// Requires tests/ui-browser.html served locally in a dedicated headless browser.
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

const fs = await import('node:fs');
const root = process.argv[2];
if (!root) throw new Error('Pass a split translation-cache directory; only a read-only copy is used.');
const entries = [];
for (const file of fs.readdirSync(root).filter(file => file.endsWith('.ja-en.cache.json'))) {
    const type = file.slice(0, -'.ja-en.cache.json'.length);
    for (const [text, value] of Object.entries(JSON.parse(fs.readFileSync(root+'/'+file,'utf8'))))
        entries.push([type+':ja-en-'+text, value]);
}
try {
    await call('Page.reload', { ignoreCache: true }); await new Promise(r=>setTimeout(r,800));
    for(let i=0;i<100;i++) { if(await evaluate('!!window.__QA_READY__')) break; await new Promise(r=>setTimeout(r,100)); }
    await evaluate(`(async()=>{const {ensureTranslationRuntime}=await import('../cheat-engine/www/cheat/js/translation-runtime/TranslationRuntime.js');ensureTranslationRuntime();const {ensureTranslateCacheRuntime,notifyTranslateCacheRuntimeChanged}=await import('../cheat-engine/www/cheat/js/TranslateCacheRuntime.js');const {cache}=ensureTranslateCacheRuntime();cache.clear();for(const [key,value] of ${JSON.stringify(entries)})cache.set(key,value);notifyTranslateCacheRuntimeChanged('benchmark');})()`);
    const metrics = await evaluate(`(async()=>{
        const frame=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
        const start=performance.now();let last=start,maxGap=0,ticks=0;
        const heartbeat=setInterval(()=>{const now=performance.now();maxGap=Math.max(maxGap,now-last);last=now;ticks++;},16);
        window.__QA_APP__.panel='TranslateCacheManagerPanel';await Vue.nextTick();
        const vm=window.__QA_COMPONENT__('TranslateCacheManagerPanel');
        const loadingShown=vm.isLoadingEntries;
        await vm.refreshEntries();await Vue.nextTick();await frame();
        const loaded=performance.now();const sorted=vm.sortedEntries;
        vm.page=2;await Vue.nextTick();await frame();const paged=performance.now();
        const reusedSort=vm.sortedEntries===sorted;
        window.__QA_APP__.panel='GeneralPanel';await Vue.nextTick();
        window.__QA_APP__.panel='TranslateCacheManagerPanel';await Vue.nextTick();await frame();
        const reopened=performance.now();
        window.__QA_APP__.$.appContext.app.unmount();
        const {createWindowUiApp}=await import('../cheat-engine/www/cheat/js/WindowUiLibraries.js');
        const {default:Panel}=await import('../cheat-engine/www/cheat/panels/TranslateCacheManagerPanel.js');
        const app=createWindowUiApp(window,{components:{Panel},template:'<v-app><v-main><Panel /></v-main></v-app>'});
        window.__QA_APP__=app.mount('#app');await Vue.nextTick();
        const remounted=window.__QA_COMPONENT__('TranslateCacheManagerPanel');
        await remounted.refreshEntries();await Vue.nextTick();await frame();
        const remountMs=Math.round(performance.now()-reopened);clearInterval(heartbeat);
        return {rows:vm.entries.length,domRows:document.querySelectorAll('tbody tr').length,loadingShown,openMs:Math.round(loaded-start),pageMs:Math.round(paged-loaded),reopenMs:Math.round(reopened-paged),maxHeartbeatGapMs:Math.round(maxGap),heartbeatTicks:ticks,reusedSort,remountMs,errors:window.__QA_ERRORS__};
    })()`);
    fs.mkdirSync('tmp/cache-benchmark',{recursive:true});
    fs.writeFileSync('tmp/cache-benchmark/result.json',JSON.stringify(metrics,null,2));
    const shot=await call('Page.captureScreenshot',{format:'png'});
    fs.writeFileSync('tmp/cache-benchmark/table.png',Buffer.from(shot.data,'base64'));
    console.log(JSON.stringify({inputRows:entries.length,...metrics}));
} finally { socket.close(); }


