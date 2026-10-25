import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {chromium} from 'file:///D:/Dev/Marinara-Engine/node_modules/@playwright/test/index.mjs';
const root=process.cwd();
const server=createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.endsWith('/KeyValueStorage.js')){res.setHeader('Content-Type','text/javascript');res.end(`export class KeyValueStorage {constructor(file){this.file=file}getAll(){return JSON.parse(localStorage.getItem(this.file)||'{}')}setAll(d){localStorage.setItem(this.file,JSON.stringify(d))}getItem(k){return this.getAll()[k]}setItem(k,v){this.setAll({...this.getAll(),[k]:v})}};export const KEY_VALUE_STORAGE=new KeyValueStorage('kv');`);return;}
 if(url.pathname.endsWith('/TranslationRuntime.js')){res.setHeader('Content-Type','text/javascript');res.end('export const ensureTranslationRuntime=()=>window.fixtureRuntime;');return;}
 if(url.pathname.endsWith('/TranslateOnTheFlyState.js')){res.setHeader('Content-Type','text/javascript');res.end('export const TranslateOnTheFlyState={subscribe:()=>()=>{},isEnabled:()=>false};');return;}
 if(url.pathname==='/'){res.setHeader('Content-Type','text/html');res.end(`<div id="app"></div><script src="/cheat-engine/www/cheat/libs/vue.js"></script><script src="/cheat-engine/www/cheat/libs/vuetify.js"></script><script type="module">
 import AIEngine from '/cheat-engine/www/cheat/translate-engines/ai-engine/AIEngine.js';
 import Panel from '/cheat-engine/www/cheat/panels/TranslateOnTheFlyPanel.js';
 import {createTranslationRuntimeStateDefaults} from '/cheat-engine/www/cheat/js/translation-runtime/TranslationRuntimeDefaults.js';
 import {translateOnTheFlySettingsMethods} from '/cheat-engine/www/cheat/js/translation-runtime/TranslateOnTheFlySettingsMethods.js';
 const saved=JSON.parse(localStorage.getItem('settings')||'{}');
 const runtime=window.fixtureRuntime={...createTranslationRuntimeStateDefaults([]),...saved,...translateOnTheFlySettingsMethods,translationEngine:'openApi',kvStorage:{setAll:data=>localStorage.setItem('settings',JSON.stringify(data))},saveGameTranslationSettings(){},applyGameTranslationEngineSettings(){}};
 runtime.engine=new AIEngine(runtime);runtime.restoreTranslationEngineSettings();Object.assign(runtime,runtime.engine.getConfigData(),runtime.engine.getConfigMethods());
 Vue.component('fixture',{...Panel,template:'<div>'+AIEngine.getConfigTemplate()+'</div>'});
 window.vm=new Vue({vuetify:new Vuetify(),render:h=>h('v-app',[h('fixture')])}).$mount('#app');window.fixtureReady=true;
 </script>`);return;}
 try{res.setHeader('Content-Type',url.pathname.endsWith('.js')?'text/javascript':'text/css');res.end(readFileSync(path.join(root,url.pathname)));}catch(e){res.statusCode=404;res.end(String(e));}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
try{
 browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage();page.on('pageerror',e=>console.log('PAGE ERROR',e.stack));page.on('console',m=>{if(m.type()==='error'||m.type()==='warn')console.log(m.type(),m.text().slice(0,240));});
 await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>window.fixtureReady,{},{timeout:5000});
 const state=()=>page.evaluate(()=>({engine:window.fixtureRuntime.engine.useStrataConstrained,runtime:window.fixtureRuntime.aiUseStrataConstrained,saved:JSON.parse(localStorage.getItem('settings')||'{}').engineSettings?.openApi?.aiUseStrataConstrained}));
 console.log('Before',await state());await page.getByLabel('Experimental: Use strata constrained',{exact:true}).evaluate(node=>node.click());await page.waitForTimeout(200);console.log('After click',await state());await page.reload();await page.waitForFunction(()=>window.fixtureReady,{},{timeout:5000});console.log('After reload',await state());
}finally{await browser?.close();await new Promise(r=>server.close(r));}
