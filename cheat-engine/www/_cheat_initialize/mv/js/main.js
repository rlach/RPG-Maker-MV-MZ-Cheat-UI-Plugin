//=============================================================================
// main.js
//=============================================================================

function compareVersions(a, b) {
    var av = a.split('.').map(Number);
    var bv = b.split('.').map(Number);
    var len = Math.max(av.length, bv.length);
    for (var i = 0; i < len; i++) {
        var na = av[i] || 0;
        var nb = bv[i] || 0;
        if (na > nb) return 1;
        if (na < nb) return -1;
    }
    return 0;
}



function validateNwjsVersion () {
    if (!(typeof require === 'function' && typeof process === 'object')) {
        return true
    }

    const nwjsVersion = process.versions['node-webkit']
    const minRequiredNwjsVersion = '0.26.4'

    console.log(`Cheat: Detected NW.js version: ${nwjsVersion}`)
    if (compareVersions(nwjsVersion, minRequiredNwjsVersion) < 0) {
        const isKorean = /^ko\b/.test(navigator.language);
        var msg = ''

        if (isKorean) {
                        msg = `게임의 Node Webkit 버전이 치트를 사용하기에 너무 낮습니다.
  - 현재 버전=${nwjsVersion}, 최소 요구 버전=${minRequiredNwjsVersion}
치트가 제대로 동작하지 않을 수 있습니다.

해결 방법을 보려면 "확인"을 눌러주세요. 해결 방법을 보려면 GitHub를 방문하세요.`
        } else {
            msg = `Node Webkit version of game is too low to using cheat
  - version=${nwjsVersion}, minimum required version=${minRequiredNwjsVersion}
Cheat may not work properly. Visit github for the solution.
`
        }

        window.alert(msg);

        return false
    }

    return true
}

validateNwjsVersion();

PluginManager.setup($plugins);

// import cheat js file
PluginManager._path= 'js/plugins/';
PluginManager.loadScript('../../cheat/init/import.js');

window.onload = function() {
    SceneManager.run(Scene_Boot);
};
