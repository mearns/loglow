import { config } from "@loglow/core";

const logLock = config.lock("loglow example app");

import libFunc from "@loglow/examples.lib";

function main(): void {
  console.log("Running main");
  libFunc("Lib session 1");
  libFunc("Lib session 2");
}

main();
