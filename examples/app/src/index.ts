import { config } from "@loglow/core";
import getLogger from "@loglow/log";

const logLock = config.lock("loglow example app");

import libFunc from "@loglow/examples.lib";

function main(): void {
  console.log("Running main");
  const logger = getLogger("@loglow", "examples", "app");
  logger("Here is the app");
  libFunc("Lib session 1");
  libFunc("Lib session 2");
}

main();
