const { register } = require("loglow");
const registrationId = require("uuid").v4();

const NAME = "loglow-example";
const registration = register(registrationId, NAME, {
    record: (type, recordName, data) => {
        console.log(
            new Date().toISOString(),
            type,
            recordName,
            JSON.stringify(data)
        );
    }
});

module.exports = function getLogger(name = null) {
    return registration.getLogger(name);
};
