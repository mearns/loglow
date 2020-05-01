class LoggingInterface {
    constructor(core) {
        this._core = core;
    }

    event(name, data) {
        this._core.writeTo(name, data);
    }

    set(name, value) {
        this._core.writeOver(name, value);
    }

    log(level, message, ...meta) {
        this._core.writeTo(`logs/${level}`, message, ...meta);
    }

    gauge(name) {
        return {
            set: value => {
                this.writeTo(name, value);
            }
        };
    }

    counter(name) {
        return {
            inc: (by = 1) => {
                // XXX: ???
            }
        };
    }
}

module.exports = LoggingInterface;
