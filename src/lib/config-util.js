module.exports = {
    propertySetter,
    propertyAppender,
    propertyDefaulter,
    propertyDeleter
};

function propertyDeleter(propName) {
    return cfg => {
        delete cfg[propName];
        return cfg;
    };
}

function propertyDefaulter(propName, defaultValue) {
    return cfg => {
        if (!Object.hasOwnProperty.call(cfg, propName)) {
            cfg[propName] = defaultValue;
        }
        return cfg;
    };
}

function propertySetter(propName, value) {
    return cfg => {
        cfg[propName] = value;
        return cfg;
    };
}

function propertyAppender(propName, ...values) {
    return cfg => {
        cfg[propName] = cfg[propName] || [];
        cfg[propName].push(...values);
        return cfg;
    };
}
