const ansiColors = require("ansi-colors");
const strftime = require("strftime");

const NO_COLOR = Symbol();

const c = Object.create(ansiColors, {
    [NO_COLOR]: {
        value: str => str
    }
});

const tags = {
    date: (color = NO_COLOR, { format = "%H:%M:%S" } = {}) => date =>
        c[color](strftime(format, date)),
    logger: (color = NO_COLOR) => (date, logger) => c[color](logger),
    message: (color = NO_COLOR) => (date, logger, message) => c[color](message)
};

function createTextFormatter(tags) {
    return (date, loggerName, message, metadata) => {
        const text = new Array(tags.length);
        for (let i = 0; i < tags.length; i++) {
            const tag = tags[i];
            text[i] =
                typeof tag === "function"
                    ? tag(date, loggerName, message, metadata)
                    : String(tag);
        }
        return text.join("");
    };
}

function createConsoleWriter(formatter) {
    return (date, loggerName, message, metadata) => {
        console.log(formatter(date, loggerName, message, metadata));
    };
}

const humanFormatter = createTextFormatter([
    tags.date("gray"),
    " ",
    tags.message("white")
]);

const humanConsoleWriter = createConsoleWriter(humanFormatter);

module.exports = {
    humanConsoleWriter
};
