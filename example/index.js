const getLogger = require("./logger");

getLogger().set("sample", 15);
getLogger("sub").set("sub-sample", 20);
getLogger("sub").set("/sub-sample", 20);
