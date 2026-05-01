export class Alert {
    static normalizeMsg(msg) {
        return typeof msg === 'string'
            ? msg
            : msg && typeof msg.text === 'string'
              ? msg.text
              : String(msg);
    }

    static alertInternal(level, msg, err = null, timeout = 1500) {
        const normalizedMsg = this.normalizeMsg(msg);
        if (err) {
            alert(`[cheat plugin ${level}] ${normalizedMsg}\n\n[cause] ${err}`);
            return;
        }

        alert(`[cheat plugin ${level}] ${normalizedMsg}`);
    }

    static success(msg, err = null, timeout = 1500) {
        this.alertInternal('success', msg, err, timeout);
    }

    static info(msg, err = null, timeout = 1500) {
        this.alertInternal('info', msg, err, timeout);
    }

    static infoHtml(msg, err = null, timeout = 1500) {
        this.alertInternal(
            'info',
            {
                text: msg,
                html: true,
            },
            err,
            timeout
        );
    }

    static warn(msg, err = null, timeout = 1500) {
        this.alertInternal('warn', msg, err, timeout);
    }

    static error(msg, err = null, timeout = 1500) {
        this.alertInternal('error', msg, err, timeout);
    }
}
