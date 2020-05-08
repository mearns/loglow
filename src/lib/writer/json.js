function jsonLinesConsoleWriter(date, loggerName, message, metadata) {
    console.log(
        JSON.stringify({
            date: date.toISOString(),
            logger: loggerName,
            message,
            meta: metadata
        })
    );
}

module.exports = {
    jsonLinesConsoleWriter
};
