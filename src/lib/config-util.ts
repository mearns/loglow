export function compose(...configurators) {
    return cfg => {
        for (const configurator of configurators) {
            cfg = configurator(cfg);
        }
        return cfg;
    };
}

export function addDecorator(...decoratorMetas) {
    return propertyAppender("middleware", ({ metas }) => {
        metas.push(...decoratorMetas);
    });
}

export function propertyDeleter(propName) {
    return cfg => {
        delete cfg[propName];
        return cfg;
    };
}

export function propertyDefaulter(propName, defaultValue) {
    return cfg => {
        if (!Object.hasOwnProperty.call(cfg, propName)) {
            cfg[propName] = defaultValue;
        }
        return cfg;
    };
}

export function propertySetter(propName, value) {
    return cfg => {
        cfg[propName] = value;
        return cfg;
    };
}

export function propertyAppender(propName, ...values) {
    return cfg => {
        cfg[propName] = cfg[propName] || [];
        cfg[propName].push(...values);
        return cfg;
    };
}
