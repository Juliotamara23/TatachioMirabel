import { Command } from "commander";
import { resolveToken } from "./config.js";
import type { OutputMode } from "./types.js";
import { display, displayError, isPipeMode, setExitCode } from "./display.js";
import { login as loginCmd } from "./commands/login.js";
import { logout as logoutCmd } from "./commands/logout.js";
import { setupMiembrosCommand } from "./commands/miembros.js";
import { setupFamiliasCommand } from "./commands/familias.js";
import { setupCabildosCommand } from "./commands/cabildos.js";
import { setupChatCommand } from "./commands/chat.js";

const program = new Command();

const outputMode = (isPipeMode() ? "json" : "pretty") as OutputMode;

program
  .name("tatachio")
  .description("CLI for Tatachio Mirabel management")
  .version(process.env.npm_package_version || "1.0.0")
  .allowExcessArguments(false);

program
  .command("login")
  .description("Login to the Tatachio service")
  .option("--json", "Output in JSON format")
  .action(async (options) => {
    await loginCmd(undefined, undefined, options.json ? "json" : outputMode);
  });

program
  .command("logout")
  .description("Logout from the Tatachio service")
  .option("--json", "Output in JSON format")
  .action(async (options) => {
    await logoutCmd(options.json ? "json" : outputMode);
  });

const miembrosCmd = program
  .command("miembros")
  .description("Manage members");
setupMiembrosCommand(miembrosCmd);

const familiasCmd = program
  .command("familias")
  .description("Manage families");
setupFamiliasCommand(familiasCmd);

const cabildosCmd = program
  .command("cabildos")
  .description("Manage cabildos");
setupCabildosCommand(cabildosCmd);

const chatCmd = program
  .command("chat")
  .description("Chat interface");
setupChatCommand(chatCmd);

program.parse();
