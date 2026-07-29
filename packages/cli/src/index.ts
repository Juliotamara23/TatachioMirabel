import { Command } from "commander";
import { resolveToken } from "./config.js";
import type { OutputMode } from "./types.js";
import { display, displayError, isPipeMode, setExitCode } from "./display.js";
import { login as loginCmd } from "./commands/login.js";
import { logout as logoutCmd } from "./commands/logout.js";
import { setupMiembrosCommand } from "./commands/miembros.js";
import { setupFamiliasCommand } from "./commands/familias.js";
import { setupCabildosCommand } from "./commands/cabildos.js";

const program = new Command();

const outputMode = (isPipeMode() ? "json" : "pretty") as OutputMode;

program
  .name("tatachio")
  .description("CLI for Tatachio Mirabel management")
  .version(process.env.npm_package_version || "1.0.0");

program
  .command("login")
  .description("Login to the Tatachio service")
  .action(async () => {
    await loginCmd(undefined, undefined, outputMode);
  });

program
  .command("logout")
  .description("Logout from the Tatachio service")
  .action(async () => {
    await logoutCmd(outputMode);
  });

program
  .command("miembros")
  .description("Manage members")
  .action(() => {
    setupMiembrosCommand();
  });

program
  .command("familias")
  .description("Manage families")
  .action(() => {
    setupFamiliasCommand();
  });

program
  .command("cabildos")
  .description("Manage cabildos")
  .action(() => {
    setupCabildosCommand();
  });

program
  .command("chat")
  .description("Chat interface")
  .action(() => {
    console.error("Not implemented yet");
    setExitCode(1);
  });

program.parse();
