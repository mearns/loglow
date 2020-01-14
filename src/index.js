const LoggingInterface = require("./logging-interface");

const MAGIC = "__loglow-61bf2225-93fb-4dcd-8c46-86d0dca03ea0";
const COMPATIBILITY_VERSION = 1;

const globalFallBack = {};
function getGlobal() {
    if (getGlobal.g == null) {
        if (typeof globalThis !== "undefined") {
            getGlobal.g = globalThis; // eslint-disable-line no-undef
        } else if (typeof self !== "undefined") {
            getGlobal.g = self; // eslint-disable-line no-undef
        } else if (typeof window !== "undefined") {
            getGlobal.g = window;
        } else if (typeof global !== "undefined") {
            getGlobal.g = global;
        } else {
            getGlobal.g = globalFallBack;
        }
    }
    return getGlobal.g;
}

function register(registrationId, name, masterConfig = {}) {
    const globalContent = getGlobal();
    if (typeof globalContent[MAGIC] === "undefined") {
        Object.defineProperty(globalContent, MAGIC, {
            configurable: false,
            enumerable: false,
            value: {
                master: null,
                compatibilityVersion: COMPATIBILITY_VERSION,
                registrations: {
                    byId: {},
                    byName: {}
                },
                core: null,
                backends: {}
            },
            writable: false
        });
    } else {
        const { compatibilityVersion } = globalContent[MAGIC];
        if (compatibilityVersion !== COMPATIBILITY_VERSION) {
            throw new Error(
                `loglow version is incompatible: required ${COMPATIBILITY_VERSION}, but found ${compatibilityVersion}`
            );
        }
    }
    const g = globalContent[MAGIC];
    if (typeof g.registrations.byName[name] !== "undefined") {
        throw new Error(`loglow name is already registered: ${name}`);
    }
    if (typeof g.registrations.byId[registrationId] !== "undefined") {
        throw new Error("loglow ID is already registered");
    }
    if (g.master === null) {
        g.master = name;
        g.core = createCore(masterConfig);
    }
    const registration = {
        getLogger: (subName = null) => getLogger(name, subName)
    };
    g.registrations.byId[registrationId] = name;
    g.registrations.byName[name] = {
        registration
    };
    return registration;
}

function createCore(masterConfig) {
    return {
        record: (type, rootName, fullName, name, data) => {
            const recordName = name.startsWith("/")
                ? `${fullName}${name}`
                : `${rootName}/${name}`;
            if (masterConfig.record) {
                masterConfig.record(type, recordName, data);
            }
        }
    };
}

function getCore() {
    const g = getGlobal()[MAGIC];
    return g.core;
}

function getLogger(rootName, name) {
    const fullName = name === null ? rootName : `${rootName}/${name}`;
    const g = getGlobal()[MAGIC];
    if (!g.backends[fullName]) {
        g.backends[fullName] = createBackend(rootName, fullName);
    }
    return new LoggingInterface(g.backends[fullName]);
}

function createBackend(rootName, fullName) {
    return {
        record: (type, name, data) => {
            return getCore().record(type, rootName, fullName, name, data);
        }
    };
}

module.exports = {
    register
};
