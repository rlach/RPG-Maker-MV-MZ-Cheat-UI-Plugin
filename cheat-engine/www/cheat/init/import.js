function applyCheat() {
    function __addScript(type, src) {
        var cheatScript = document.createElement('script');
        cheatScript.type = type;
        cheatScript.src = src;

        document.body.appendChild(cheatScript);
    }

    function __loadJavaScript(src) {
        var script = document.createElement('script');
        script.type = 'text/javascript';
        script.src = src;
        script.async = false;
        script._url = src;
        document.body.appendChild(script);
    }

    // load libs
    __loadJavaScript('cheat/libs/axios.min.js');

    // add <div id='app'> node for vue
    const appDiv = document.createElement('div');

    appDiv.id = 'app';
    appDiv.innerHTML = `
<v-app
    app
    style="background-color: black;">
    <v-main>
        <main-component></main-component>
    </v-main>
</v-app>
`;

    document.body.appendChild(appDiv);

    // import in head
    document.head.innerHTML += `
<link href="cheat/libs/mdi/css/materialdesignicons.min.css" rel="stylesheet">
<link href="cheat/libs/vuetify.css" rel="stylesheet">
<link href="cheat/css/main.css" rel="stylesheet">
`;

    // import in body
    // __loadJavaScript('cheat/init/setup.js')
    __addScript('module', 'cheat/init/setup.js');
}

applyCheat();
