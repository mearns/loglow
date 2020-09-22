import getLogger from "@loglow/log";

export default function (sessionName: string): void {
  const logger = getLogger("@loglow", "examples", "lib", sessionName);
  logger("Here is a message");
}
