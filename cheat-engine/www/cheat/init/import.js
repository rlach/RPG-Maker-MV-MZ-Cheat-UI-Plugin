;(function() {
    try {
        if (typeof require === 'function' && typeof process === 'object') {
            const fs = require('fs')
            const path = require('path')
            const logDir = path.join(process.cwd(), 'www')
            try {
                if (!fs.existsSync(logDir)) {
                    fs.mkdirSync(logDir, { recursive: true })
                }
            } catch (e) {
                // ignore
            }
            const logFile = path.join(logDir, 'cheat.log')

            const formatArgs = (args) => args.map(a => {
                try {
                    if (typeof a === 'string') return a
                    return JSON.stringify(a)
                } catch (e) {
                    return String(a)
                }
            }).join(' ')

            const writeLine = (level, args) => {
                try {
                    const line = `[${new Date().toISOString()}] ${level.toUpperCase()} ${formatArgs(args)}\n`
                    fs.appendFileSync(logFile, line)
                } catch (e) {
                    // ignore write failures
                }
            }

            const origLog = console.log.bind(console)
            const origWarn = console.warn.bind(console)
            const origError = console.error.bind(console)

            console.log = function(...args) {
                writeLine('log', args)
                try { origLog(...args) } catch (e) {}
            }
            console.warn = function(...args) {
                writeLine('warn', args)
                try { origWarn(...args) } catch (e) {}
            }
            console.error = function(...args) {
                writeLine('error', args)
                try { origError(...args) } catch (e) {}
            }
        }
    } catch (e) {
        // fail silently in environments without fs/require
    }
})()

function applyCheat () {
    function __addScript(type, src) {
        var cheatScript = document.createElement('script');
        cheatScript.type = type;
        cheatScript.src = src

        document.body.appendChild(cheatScript)
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
    __loadJavaScript('cheat/libs/axios.min.js')

    // add <div id='app'> node for vue
    const appDiv = document.createElement('div')

    appDiv.id = 'app'
    appDiv.innerHTML = `
<v-app
    app
    dark
    style="background-color: black;">
    <v-main
        dark>
        <main-component></main-component>
    </v-main>
</v-app>
`

    document.body.appendChild(appDiv)

    // import in head
    document.head.innerHTML += `
<link href="https://fonts.googleapis.com/css?family=Roboto:100,300,400,500,700,900" rel="stylesheet">
<link href="https://cdn.jsdelivr.net/npm/@mdi/font@6.x/css/materialdesignicons.min.css" rel="stylesheet">
<link href="https://cdn.jsdelivr.net/npm/vuetify@2.x/dist/vuetify.min.css" rel="stylesheet">
<link href="cheat/css/main.css" rel="stylesheet">
`

    // import in body
    // __loadJavaScript('cheat/init/setup.js')
    __addScript('module', 'cheat/init/setup.js')
}

applyCheat()
