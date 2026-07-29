import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

import { streamChat } from "../../src/api/chat.js";

const BASE_URL = "http://localhost:3000";

async function writeConfig() {
  const configPath = join(homedir(), ".tatachio", "config.json");
  await fs.mkdir(join(homedir(), ".tatachio"), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify({ token: "test-token", baseUrl: BASE_URL }), "utf-8");
}

async function clearConfig() {
  const configPath = join(homedir(), ".tatachio", "config.json");
  try {
    await fs.unlink(configPath);
  } catch (error) {
    if ((error as { code?: string }).code !== "ENOENT") {
      throw error;
    }
  }
}

async function writeHistoryFile(content: string) {
  const historyPath = join(homedir(), ".tatachio", "history.jsonl");
  await fs.mkdir(join(homedir(), ".tatachio"), { recursive: true });
  await fs.writeFile(historyPath, content, "utf-8");
}

async function clearHistory() {
  const historyPath = join(homedir(), ".tatachio", "history.jsonl");
  try {
    await fs.unlink(historyPath);
  } catch (error) {
    if ((error as { code?: string }).code !== "ENOENT") {
      throw error;
    }
  }
}

function createReadableStream(chunks: Array<string | Uint8Array>): ReadableStream {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        if (typeof chunk === "string") {
          controller.enqueue(new TextEncoder().encode(chunk));
        } else {
          controller.enqueue(chunk);
        }
      }
      controller.close();
    }
  });
}

let server;
let config;
let history;

describe("Chat SSE client", () => {
  beforeEach(async () => {
    await writeConfig();
    await writeHistoryFile("");
  });

  afterEach(async () => {
    await clearConfig();
    await clearHistory();
  });

  it("streams chat response with SSE chunks", async () => {
    server = setupServer(
      http.post(`${BASE_URL}/api/chat`, async ({ request }) => {
        const body = await request.json();
        expect(body.message).toBe("Hello");
        
        const stream = createReadableStream([
          'data: {"delta":"Hello "}' + "\n\n",
          'data: {"delta":"world!"}' + "\n\n",
          'data: [DONE]\n\n'
        ]);
        
        return new HttpResponse(stream, {
          headers: { "Content-Type": "text/event-stream" }
        });
      })
    );
    
    server.listen();
    
    const chunks = [];
    for await (const chunk of streamChat(BASE_URL, "test-token", "Hello")) {
      chunks.push(chunk.delta);
    }
    
    expect(chunks).toEqual(["Hello ", "world!"]);
    
    server.close();
  });

  it("handles single chunk response", async () => {
    server = setupServer(
      http.post(`${BASE_URL}/api/chat`, async ({ request }) => {
        const stream = createReadableStream([
          'data: {"delta":"Simple response"}' + "\n\n",
          'data: [DONE]\n\n'
        ]);
        return new HttpResponse(stream, {
          headers: { "Content-Type": "text/event-stream" }
        });
      })
    );
    
    server.listen();
    
    const chunks = [];
    for await (const chunk of streamChat(BASE_URL, "test-token", "Simple")) {
      chunks.push(chunk.delta);
    }
    
    expect(chunks).toEqual(["Simple response"]);
    
    server.close();
  });

  it("handles empty response", async () => {
    server = setupServer(
      http.post(`${BASE_URL}/api/chat`, async ({ request }) => {
        const stream = createReadableStream([
          'data: [DONE]\n\n'
        ]);
        return new HttpResponse(stream, {
          headers: { "Content-Type": "text/event-stream" }
        });
      })
    );
    
    server.listen();
    
    const chunks = [];
    for await (const chunk of streamChat(BASE_URL, "test-token", "Empty")) {
      chunks.push(chunk.delta);
    }
    
    expect(chunks).toEqual([]);
    
    server.close();
  });

  it("handles non-JSON SSE data gracefully", async () => {
    server = setupServer(
      http.post(`${BASE_URL}/api/chat`, async ({ request }) => {
        const stream = createReadableStream([
          'data: some raw text' + "\n\n",
          'data: more text' + "\n\n",
          'data: [DONE]\n\n'
        ]);
        return new HttpResponse(stream, {
          headers: { "Content-Type": "text/event-stream" }
        });
      })
    );
    
    server.listen();
    
    const chunks = [];
    for await (const chunk of streamChat(BASE_URL, "test-token", "Test")) {
      chunks.push(chunk.delta);
    }
    
    expect(chunks).toEqual([]);
    
    server.close();
  });

  it("handles auth error", async () => {
    server = setupServer(
      http.post(`${BASE_URL}/api/chat`, async () => {
        return HttpResponse.json({ error: "Unauthorized" }, { status: 401 });
      })
    );
    
    server.listen();
    
    await expect(streamChat(BASE_URL, "invalid-token", "Test").next())
      .rejects
      .toMatchObject({ message: "HTTP error! status: 401" });
    
    server.close();
  });
});