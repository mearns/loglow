class LoggingInterface {
    constructor(core) {
        this._core = core;
    }
    event(name, data) {}

    set(name, value) {
        this._core.record("value", name, value);
    }
}

module.exports = LoggingInterface;
