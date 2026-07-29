import { Command } from "commander";
import { resolveToken, getBaseUrl } from "../config.js";
import { display, displayError, setExitCode } from "../display.js";
import { isPipeMode } from "../display.js";
import type { OutputMode } from "../types.js";
import { streamChat } from "../api/chat.js";
import { loadChatHistory, saveChatHistory } from "../config.js";
import type { ChatEntry } from "../types.js";

const outputMode = (isPipeMode() ? "json" : "pretty") as OutputMode;

export async function chatCmd(options: { message?: string; model?: string }): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    const token = await resolveToken();
    const baseUrl = await getBaseUrl();
    const message = options.message || "";
    const model = options.model;
    
    if (!token) {
      throw new Error("No authentication token found. Please login first.");
    }
    
    if (isPipeMode() && options.message) {
      // Pipe mode: Single message, no history
      const history: ChatEntry[] = [];
      await saveChatHistory(history);
      
      let responseText = "";
      
      for await (const chunk of streamChat(baseUrl, token, message, model)) {
        process.stdout.write(chunk.delta);
        responseText += chunk.delta;
      }
      
      process.stdout.write("\n");
      
      const assistantEntry: ChatEntry = {
        timestamp: new Date().toISOString(),
        role: "assistant",
        content: responseText
      };
      
      const updatedHistory = [...history, { timestamp: new Date().toISOString(), role: "user", content: message }, assistantEntry];
      await saveChatHistory(updatedHistory);
      
      if (outputMode === "json") {
        display({ message, response: responseText, model }, outputMode);
      }
      
      setExitCode(0);
      return { success: true, data: { message, response: responseText, model } };
    }
    
    if (process.stdout.isTTY) {
      // Interactive mode
      console.log("Tatachio Chat — type 'exit' to quit");
      console.log("(Type your message and press Enter)");
      console.log("> ", " ".repeat(50), "\r");
      
      const readline = await import("node:readline");
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false
      });
      
      const history = await loadChatHistory();
      
      await new Promise<void>((resolve) => {
        rl.on("line", async (line) => {
          const trimmed = line.trim();
          
          if (trimmed.toLowerCase() === "exit") {
            rl.close();
            resolve();
            return;
          }
          
          if (!trimmed) {
            return;
          }
          
          process.stdout.write("> ");
          
          let responseText = "";
          
          for await (const chunk of streamChat(baseUrl, token, trimmed, model)) {
            process.stdout.write(chunk.delta);
            responseText += chunk.delta;
          }
          
          process.stdout.write("\n> ", " ".repeat(50), "\r");
          
          const userEntry: ChatEntry = {
            timestamp: new Date().toISOString(),
            role: "user",
            content: trimmed
          };
          
          const assistantEntry: ChatEntry = {
            timestamp: new Date().toISOString(),
            role: "assistant",
            content: responseText
          };
          
          const updatedHistory = [...history, userEntry, assistantEntry];
          await saveChatHistory(updatedHistory);
        });
        
        rl.on("close", async () => {
          resolve();
        });
      });
      
      if (outputMode === "json") {
        display({ history }, outputMode);
      }
    
    } else {
      // Non-TTY mode (e.g., when piped input is not available)
      if (!message) {
        throw new Error("Message required in non-interactive mode");
      }
      
      let responseText = "";
      
      for await (const chunk of streamChat(baseUrl, token, message, model)) {
        process.stdout.write(chunk.delta);
        responseText += chunk.delta;
      }
      
      process.stdout.write("\n");
      
      if (outputMode === "json") {
        display({ message, response: responseText, model }, outputMode);
      }
      
      setExitCode(0);
      return { success: true, data: { message, response: responseText, model } };
    }
    
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    displayError(err, outputMode);
    const status = (err as { status?: number }).status;
    setExitCode(status && status >= 500 ? 2 : 1);
    return { success: false, error: message };
  }
}

export function setupChatCommand(): void {
  const program = new Command();
  
  program
    .command("chat")
    .description("Chat interface")
    .option("--message <message>", "Send a single message (pipe-friendly)")
    .option("--model <model>", "Model to use (e.g., gemini)")
    .action(async (options) => {
      await chatCmd(options);
    });
  
  program.parse();
}

export { setupChatCommand };