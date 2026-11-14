import { afterEach, expect, it, vi } from 'vitest';
import { DTextPictureTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/DTextPictureTranslator.js';
import { YepSaveCoreTranslator } from '../../../../../../../cheat-engine/www/cheat/translate-engines/plugins/translators/YepSaveCoreTranslator.js';
afterEach(() => {vi.unstubAllGlobals();vi.restoreAllMocks();});
it('translates DText source once before native escape expansion', () => {
 vi.stubGlobal('window', globalThis);
 class Screen {setDTextPicture(value) {return value;}}
 class Interpreter {pluginCommandDTextPicture(command,args) {return $gameScreen.setDTextPicture(args[0].replace(/\\V\[1\]/gi,'35').replace(/\\I/gi,'\x1bi'));}}
 vi.stubGlobal('Game_Screen',Screen);vi.stubGlobal('Game_Interpreter',Interpreter);vi.stubGlobal('$gameScreen',new Screen());
 const t=new DTextPictureTranslator();const source='\\I[80]なかよし度: \\V[1]';
 const runtime={isTranslationEnabled:()=>true,getCacheKey:text=>text,hasUsableCacheValue:text=>text===source,translationCache:new Map([[source,'\\I[80]Friendship: \\V[1]']]),trackCacheKeyUsage:vi.fn()};
 vi.spyOn(t,'getRuntime').mockReturnValue(runtime);t.installLegacySetDTextPictureHook();t.installModifiedInterpreterHook();
 expect(new Interpreter().pluginCommandDTextPicture('D_TEXT',[source,'28'])).toBe('\x1bi[80]Friendship: 35');
 expect(runtime.trackCacheKeyUsage).toHaveBeenCalledTimes(1);
 expect(runtime.trackCacheKeyUsage).toHaveBeenCalledWith(source,expect.anything());
});
it('maps sparse YEP format placeholders to their actual capture positions',()=>{
 const t=new YepSaveCoreTranslator();const source='Lv %3';const runtime={getCacheKey:t=>t,hasUsableCacheValue:t=>t===source,translationCache:new Map([[source,'Level %3']])};
 vi.spyOn(t,'resolveRuntimeTranslation').mockReturnValue('Level %3');
 expect(t._translateRenderedText('Lv 42',runtime,{templates:[{template:source,placeholders:['%3'],regex:/^Lv (.+?)$/}]})).toBe('Level 42');
});
