//=============================================================================
// main.js v1.3.0
//=============================================================================

function preserveOriginalFetchForCheat() {
    // Some plugins override global fetch breaking LLM translate.
    if (typeof window === 'undefined') {
        return;
    }

    if (typeof window.chromiumFetch !== 'function' && typeof window.fetch === 'function') {
        window.chromiumFetch = window.fetch.bind(window);
        console.log('[Cheat] Preserved window.fetch as window.chromiumFetch (MZ bootstrap)');
    }
}

function compareNwjsVersions(a, b) {
    const av = String(a || '')
        .split('.')
        .map(Number);
    const bv = String(b || '')
        .split('.')
        .map(Number);
    const len = Math.max(av.length, bv.length);

    for (let i = 0; i < len; i += 1) {
        const na = av[i] || 0;
        const nb = bv[i] || 0;

        if (na > nb) return 1;
        if (na < nb) return -1;
    }

    return 0;
}

function validateNwjsVersion() {
    if (!(typeof require === 'function' && typeof process === 'object')) {
        return true;
    }

    const nwjsVersion = process.versions['node-webkit'] || process.versions.nw;
    const minRequiredNwjsVersion = '0.44.6';

    console.log(`Cheat: Detected NW.js version: ${nwjsVersion}`);
    if (compareNwjsVersions(nwjsVersion, minRequiredNwjsVersion) < 0) {
        let msg = '';
        let docsUrl = '';

        if (/^ko\b/.test(navigator.language)) {
                        msg = `게임의 Node Webkit 버전이 치트를 사용하기에 너무 낮습니다. (MZ)
  - 현재 버전=${nwjsVersion}, 최소 요구 버전=${minRequiredNwjsVersion}
치트가 제대로 동작하지 않을 수 있습니다.

해결 방법을 보려면 "확인"을 눌러주세요.`;
            docsUrl =
                'https://github.com/paramonos/RPG-Maker-MV-MZ-Cheat-UI-Plugin/blob/main/README_ko-kr.md#%EA%B2%8C%EC%9E%84%EC%9D%98-nwjs-%EB%B2%84%EC%A0%84%EC%9D%B4-0264-%EB%B3%B4%EB%8B%A4-%EB%82%AE%EC%9D%80-%EA%B2%BD%EC%9A%B0-%EC%98%9B%EB%82%A0-%EB%B2%84%EC%A0%84%EC%9D%98-mv-%EA%B2%8C%EC%9E%84%EC%9D%B8-%EA%B2%BD%EC%9A%B0';
        } else {
                        msg = `Node Webkit version of game is too low to use cheat in MZ
  - version=${nwjsVersion}, minimum required version=${minRequiredNwjsVersion}
Cheat may not work properly.

Click "OK" button to see the solution.
`;
            docsUrl =
                'https://github.com/paramonos/RPG-Maker-MV-MZ-Cheat-UI-Plugin#if-embeded-nwjs-version-of-game-is-lower-than-0264';
        }

        if (window.confirm(msg)) {
            window.open(docsUrl, '_blank');
        }
        return false;
    }

    return true;
}

// Preserve original fetch before any other cheat startup logic.
preserveOriginalFetchForCheat();

validateNwjsVersion();

const scriptUrls = [
    '../../cheat/init/import.js',
    'js/libs/pixi.js',
    'js/libs/pako.min.js',
    'js/libs/localforage.min.js',
    'js/libs/effekseer.min.js',
    'js/libs/vorbisdecoder.js',
    'js/rmmz_core.js',
    'js/rmmz_managers.js',
    'js/rmmz_objects.js',
    'js/rmmz_scenes.js',
    'js/rmmz_sprites.js',
    'js/rmmz_windows.js',
    'js/plugins.js',
];
const effekseerWasmUrl = 'js/libs/effekseer.wasm';

class Main {
    constructor() {
        this.xhrSucceeded = false;
        this.loadCount = 0;
        this.error = null;
    }

    run() {
        this.showLoadingSpinner();
        this.testXhr();
        this.loadMainScripts();
    }

    showLoadingSpinner() {
        const loadingSpinner = document.createElement('div');
        const loadingSpinnerImage = document.createElement('div');
        loadingSpinner.id = 'loadingSpinner';
        loadingSpinnerImage.id = 'loadingSpinnerImage';
        loadingSpinner.appendChild(loadingSpinnerImage);
        document.body.appendChild(loadingSpinner);
    }

    eraseLoadingSpinner() {
        const loadingSpinner = document.getElementById('loadingSpinner');
        if (loadingSpinner) {
            document.body.removeChild(loadingSpinner);
        }
    }

    testXhr() {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', document.currentScript.src);
        xhr.onload = () => (this.xhrSucceeded = true);
        xhr.send();
    }

    loadMainScripts() {
        for (const url of scriptUrls) {
            const script = document.createElement('script');
            script.type = 'text/javascript';
            script.src = url;
            script.async = false;
            script.defer = true;
            script.onload = this.onScriptLoad.bind(this);
            script.onerror = this.onScriptError.bind(this);
            script._url = url;
            document.body.appendChild(script);
        }
        this.numScripts = scriptUrls.length;
        window.addEventListener('load', this.onWindowLoad.bind(this));
        window.addEventListener('error', this.onWindowError.bind(this));
    }

    onScriptLoad() {
        if (++this.loadCount === this.numScripts) {
            PluginManager.setup($plugins);
        }
    }

    onScriptError(e) {
        this.printError('Failed to load', e.target._url);
    }

    printError(name, message) {
        this.eraseLoadingSpinner();
        if (!document.getElementById('errorPrinter')) {
            const errorPrinter = document.createElement('div');
            errorPrinter.id = 'errorPrinter';
            errorPrinter.innerHTML = this.makeErrorHtml(name, message);
            document.body.appendChild(errorPrinter);
        }
    }

    makeErrorHtml(name, message) {
        const nameDiv = document.createElement('div');
        const messageDiv = document.createElement('div');
        nameDiv.id = 'errorName';
        messageDiv.id = 'errorMessage';
        nameDiv.innerHTML = name;
        messageDiv.innerHTML = message;
        return nameDiv.outerHTML + messageDiv.outerHTML;
    }

    onWindowLoad() {
        if (!this.xhrSucceeded) {
            const message = 'Your browser does not allow to read local files.';
            this.printError('Error', message);
        } else if (this.isPathRandomized()) {
            const message = 'Please move the Game.app to a different folder.';
            this.printError('Error', message);
        } else if (this.error) {
            this.printError(this.error.name, this.error.message);
        } else {
            this.initEffekseerRuntime();
        }
    }

    onWindowError(event) {
        if (!this.error) {
            this.error = event.error;
        }
    }

    isPathRandomized() {
        // [Note] We cannot save the game properly when Gatekeeper Path
        //   Randomization is in effect.
        return Utils?.isNwjs() && process.mainModule.filename.startsWith('/private/var');
    }

    initEffekseerRuntime() {
        const onLoad = this.onEffekseerLoad.bind(this);
        const onError = this.onEffekseerError.bind(this);
        effekseer.initRuntime(effekseerWasmUrl, onLoad, onError);
    }

    onEffekseerLoad() {
        this.eraseLoadingSpinner();
        SceneManager.run(Scene_Boot);
    }

    onEffekseerError() {
        this.printError('Failed to load', effekseerWasmUrl);
    }
}

const main = new Main();
main.run();

//-----------------------------------------------------------------------------
