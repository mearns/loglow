const getLogger = require("../src/lib/logging");
const config = require("../src/lib/config");
const { humanConsoleWriter } = require("../src/lib/writer/text");
const { propertySetter, compose } = require("../src/lib/config-util");

config.setRootConfigurator(
    compose(
        propertySetter("consume", humanConsoleWriter),
        propertySetter("enabled", true)
    )
);

const logger = getLogger("foo/bar/baz");
logger("Here is a message", { foo: "bar" });
