#!/usr/bin/env node
/**
 * openai-compat-mock.mjs — Fake OpenAI-compatible HTTP server for QA.
 *
 * Emulates the subset of the OpenAI chat-completions API that
 * `@ai-sdk/openai` uses (with a custom baseURL pointing at Ollama's `/v1`
 * endpoint) so the backend's AI chat works WITHOUT a real LLM:
 *
 *   GET  /v1/models           → OpenAI-style model list (llama3.2:3b + mistral:7b)
 *   POST /v1/chat/completions → deterministic tool-calling by keyword
 *   everything else           → 404 {"error":{"message":"not found"}}
 *
 * ── Wire protocol (verified against node_modules/@ai-sdk/openai) ─────────
 * - The backend always uses streamText → the provider's doStream path, so the
 *   real wire protocol is SSE streaming (Content-Type: text/event-stream)
 *   regardless of the controller's `stream` flag. The non-stream JSON branch
 *   (`stream: false` in the body) is implemented too so the mock can be
 *   exercised directly with curl.
 * - Streaming events are `data: {…}\n\n` lines; the stream ends with
 *   `data: [DONE]`. Streamed tool calls ride `choices[0].delta.tool_calls[i]`
 *   with `function.arguments` as a JSON STRING fragment (OpenAI shape). The
 *   first tool_call delta must carry `index`, `id`, `type: "function"` and
 *   `function.name` (the SDK throws otherwise); the terminal chunk carries
 *   `choices[0].finish_reason: "stop"`.
 * - After the tool runs, the SDK makes a SECOND /v1/chat/completions call
 *   whose messages include a role:"tool" message (the JSON-serialized result).
 *   The mock detects that and replies with a final Spanish text answer instead
 *   of another tool call.
 * - Tool-call arguments MUST satisfy the tools' input schemas (the AI SDK core
 *   validates args before executing): getCabildoStats{}, searchMiembros{query},
 *   getMiembroById{id}, getFamiliaMembers{familiaId}, getReporteData{reporteId}.
 *   Note getFamiliaMembers expects familiaId (NOT numeroFamilia) and
 *   getReporteData expects reporteId — a missing required arg would make the
 *   SDK reject the tool call.
 *
 * ── Role-gating support ──────────────────────────────────────────────────
 * The backend only advertises the tools the role is allowed to use (ADMIN 5,
 * CAPTAIN 4). The mock only ever emits a tool whose name appears in the
 * request's `tools` array; otherwise it falls back to getCabildoStats. Every
 * request is recorded in an in-memory call log (getCallLog/clearCallLog) so
 * suites can assert which tools were requested per role.
 *
 * Backwards compatibility: `startOllamaMock` is kept as a deprecated alias for
 * `startOpenAICompatMock` for one release (local scripts that imported the old
 * name keep working).
 */

import { createServer } from "node:http";
import { createServer as createNetServer } from "node:net";
import { pathToFileURL } from "node:url";

// ─── Call log ────────────────────────────────────────────────────────────

/** @type {Array<Object>} */
const callLog = [];

export function getCallLog() {
  return callLog;
}

export function clearCallLog() {
  callLog.length = 0;
}

// ─── Model catalog (GET /v1/models) ──────────────────────────────────────

export const OPENAI_COMPAT_MODELS = [
  {
    id: "llama3.2:3b",
    object: "model",
    created: 1700000000,
    owned_by: "ollama",
  },
  {
    id: "mistral:7b",
    object: "model",
    created: 1700000000,
    owned_by: "ollama",
  },
];

/** @deprecated Kept as an alias for one release after the Ollama→OpenAI rename. */
export const OLLAMA_MODELS = OPENAI_COMPAT_MODELS;

// ─── Deterministic tool decision ─────────────────────────────────────────

// Seed fixture IDs used so the executed tools hit real rows in qa.db
// (searchMiembros/getMiembroById/getFamiliaMembers/getReporteData just query
// the DB through the backend's tool implementations).
const FIXTURE_FAMILIA_ID = "cd8031c4-d2f7-423c-b5a8-1e98b793690a"; // familia 1, cabildo TATACHIO
const FIXTURE_MIEMBRO_ID = "c73da2ef-a84e-4d47-8e5a-e2d45b7af7d6"; // primer miembro del seed
const FIXTURE_REPORTE_ID = "00000000-0000-0000-0000-000000000001"; // no existe → tool responde "no encontrado"

/**
 * Keyword rules, highest priority first.
 *
 * NOTE: the stats keywords are intentionally checked BEFORE "censo"/"reporte":
 * "cuantos miembros hay en el censo" is a stats query (the QA suite asserts a
 * getCabildoStats call for it), while a standalone "genera el censo"/"genera el
 * reporte" maps to getReporteData. Both keyword families in the spec still map
 * to their target tool — only the precedence between them is fixed here.
 */
const TOOL_RULES = [
  {
    tool: "getCabildoStats",
    keywords: ["cuantos", "cuántos", "cuantas", "cuántas", "cuenta", "total", "estadisticas", "estadísticas", "estadistica", "estadística"],
    params: () => ({}),
  },
  {
    tool: "getReporteData",
    keywords: ["reporte", "report", "censo", "datos agregados"],
    params: () => ({ reporteId: FIXTURE_REPORTE_ID }),
  },
  {
    tool: "getFamiliaMembers",
    keywords: ["familia"],
    params: () => ({ familiaId: FIXTURE_FAMILIA_ID }),
  },
  {
    tool: "getMiembroById",
    keywords: ["detalle", "por id"],
    params: () => ({ id: FIXTURE_MIEMBRO_ID }),
  },
  {
    tool: "searchMiembros",
    keywords: ["miembro", "busca", "buscar", "nombre"],
    params: (message, keywordIndex) => ({ query: extractQuery(message, keywordIndex) }),
  },
];

const DEFAULT_TOOL = "getCabildoStats";

const STOP_WORDS = new Set(["a", "al", "de", "del", "el", "la", "los", "las", "por", "un", "una", "con", "que"]);

/** Extract a search term from the text that follows the trigger keyword. */
function extractQuery(message, keywordIndex) {
  let rest = message.slice(keywordIndex).trim();
  // Drop leading stop words / articles so "busca a FANNY" → "FANNY".
  const words = rest.split(/\s+/);
  while (words.length > 0 && STOP_WORDS.has(words[0].toLowerCase())) {
    words.shift();
  }
  let query = words.join(" ").replace(/[?.!]+$/, "").trim();
  if (!query) query = "consulta";
  return query.slice(0, 60);
}

/**
 * Decide which tool the assistant should call for a user message.
 * @returns {{decided: string, gated: boolean, used: string, params: Object}}
 */
function decideToolCall(lastUserContent, toolsAvailable) {
  const message = String(lastUserContent || "");
  const lower = message.toLowerCase();

  let matched = null;
  for (const rule of TOOL_RULES) {
    for (const kw of rule.keywords) {
      const idx = lower.indexOf(kw.toLowerCase());
      if (idx !== -1) {
        matched = { rule, idx, keyword: kw };
        break;
      }
    }
    if (matched) break;
  }

  let decided = matched ? matched.rule.tool : DEFAULT_TOOL;
  let params = matched
    ? matched.rule.params(message, matched.idx + matched.keyword.length)
    : TOOL_RULES[0].params();

  // Role gating: only emit a tool the request advertises (ADMIN 5 / CAPTAIN 4).
  const gated = !toolsAvailable.includes(decided);
  let used = decided;
  if (gated) {
    used = toolsAvailable.includes(DEFAULT_TOOL) ? DEFAULT_TOOL : toolsAvailable[0];
    if (!used) return { decided, gated, used: null, params: {} };
    // Fallback params for the tool that is actually used.
    const fallbackRule = TOOL_RULES.find((r) => r.tool === used);
    params = fallbackRule ? fallbackRule.params(message, matched ? matched.idx + matched.keyword.length : 0) : {};
  }

  return { decided, gated, used, params };
}

// ─── Response helpers ────────────────────────────────────────────────────

const nowUnix = () => Math.floor(Date.now() / 1000);

/** OpenAI non-stream completion body (POST /v1/chat/completions stream:false). */
function nonStreamCompletion(model, { content, toolCall }) {
  const message = { role: "assistant", content: content || "" };
  if (toolCall) {
    message.tool_calls = [
      {
        id: "call_1",
        type: "function",
        function: { name: toolCall.name, arguments: JSON.stringify(toolCall.arguments) },
      },
    ];
  }
  return {
    id: "chatcmpl-1",
    object: "chat.completion",
    created: nowUnix(),
    model,
    choices: [
      {
        index: 0,
        message,
        finish_reason: toolCall ? "tool_calls" : "stop",
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
}

/** One OpenAI SSE chunk (`data: {…}\n\n`). */
function sseChunk(model, delta, { finishReason = null } = {}) {
  return JSON.stringify({
    id: "chatcmpl-1",
    object: "chat.completion.chunk",
    created: nowUnix(),
    model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  });
}

/** Compose the final Spanish answer embedding the tool result JSON. */
function composeAnswer(messages) {
  const toolMessages = messages.filter((m) => m.role === "tool");
  let resultText = toolMessages.length > 0 ? String(toolMessages[toolMessages.length - 1].content ?? "") : "";
  if (!resultText) resultText = "sin resultados";
  try {
    resultText = JSON.stringify(JSON.parse(resultText), null, 2);
  } catch {
    // already plain text — leave as-is
  }
  if (resultText.length > 500) resultText = `${resultText.slice(0, 500)}…`;
  return `He consultado la base de datos. Resultado:\n${resultText}`;
}

/** Split an answer into 2-3 chunks at word boundaries. */
function splitAnswer(text, n = 3) {
  const target = Math.ceil(text.length / n);
  const chunks = [];
  let rest = text;
  while (rest.length > target && chunks.length < n - 1) {
    let cut = rest.lastIndexOf(" ", target);
    if (cut < target * 0.5) cut = target;
    chunks.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest.length > 0) chunks.push(rest);
  return chunks;
}

// ─── HTTP server ─────────────────────────────────────────────────────────

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const parts = [];
    req.on("data", (chunk) => parts.push(chunk));
    req.on("end", () => {
      if (parts.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(parts).toString("utf-8")));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function sendError(res, status, message) {
  sendJson(res, status, { error: { message, type: "api_error", code: status, param: null } });
}

/** Write an OpenAI SSE event stream and end the response. */
async function sendSse(res, events) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  for (let i = 0; i < events.length; i++) {
    // Each event becomes a `data: <payload>` line, blank-line terminated.
    // The final event is the literal "[DONE]" marker.
    res.write(`data: ${events[i]}\n\n`);
    if (i < events.length - 1) {
      // Small delay between events to mimic token streaming.
      await new Promise((r) => setTimeout(r, 5));
    }
  }
  res.end();
}

function handleModels(res) {
  sendJson(res, 200, {
    object: "list",
    data: OPENAI_COMPAT_MODELS,
  });
}

async function handleChatCompletions(req, res) {
  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return sendError(res, 400, "invalid JSON body");
  }

  const { model = "llama3.2:3b", messages, stream } = body;
  const isStream = stream !== false; // explicit stream:false → non-stream JSON

  if (!Array.isArray(messages) || messages.length === 0) {
    return sendError(res, 400, "messages must be a non-empty array");
  }

  const toolsAvailable = Array.isArray(body.tools)
    ? body.tools.map((t) => t?.function?.name).filter(Boolean)
    : [];
  const hasToolResult = messages.some((m) => m && m.role === "tool");
  const lastUser = [...messages].reverse().find((m) => m && m.role === "user");
  const lastUserContent = lastUser ? lastUser.content : "";

  const entry = {
    ts: nowUnix(),
    model,
    stream: isStream,
    toolsAvailable,
    hasToolResult,
    lastUser: String(lastUserContent).slice(0, 120),
  };

  // ── Tool result present → final Spanish answer ──────────────────────
  if (hasToolResult) {
    const answer = composeAnswer(messages);
    entry.type = "answer";
    callLog.push(entry);

    if (!isStream) {
      return sendJson(res, 200, nonStreamCompletion(model, { content: answer }));
    }

    const chunks = splitAnswer(answer);
    const events = chunks.map((c) => sseChunk(model, { role: "assistant", content: c }));
    events.push(sseChunk(model, {}, { finishReason: "stop" }));
    events.push("[DONE]");
    return sendSse(res, events);
  }

  // ── No tool result yet → deterministic tool call ────────────────────
  const decision = decideToolCall(lastUserContent, toolsAvailable);
  entry.type = "tool-call";
  entry.decided = decision.decided;
  entry.gated = decision.gated;
  entry.used = decision.used;
  entry.toolCallsRequested = decision.used ? [decision.used] : [];
  callLog.push(entry);

  // Nothing usable advertised → answer with text instead of a tool call.
  if (!decision.used) {
    const answer = "No dispongo de herramientas habilitadas para esa consulta.";
    if (!isStream) return sendJson(res, 200, nonStreamCompletion(model, { content: answer }));
    const events = [
      sseChunk(model, { role: "assistant", content: answer }),
      sseChunk(model, {}, { finishReason: "stop" }),
      "[DONE]",
    ];
    return sendSse(res, events);
  }

  if (!isStream) {
    return sendJson(
      res,
      200,
      nonStreamCompletion(model, {
        content: "",
        toolCall: { name: decision.used, arguments: decision.params },
      })
    );
  }

  // Streaming tool call, OpenAI shape: name in the first delta, arguments as a
  // JSON-string fragment in the next, then a terminal chunk with
  // finish_reason:"stop" and the [DONE] marker.
  const events = [
    sseChunk(model, {
      role: "assistant",
      content: "",
      tool_calls: [
        {
          index: 0,
          id: "call_1",
          type: "function",
          function: { name: decision.used, arguments: "" },
        },
      ],
    }),
    sseChunk(model, {
      tool_calls: [{ index: 0, function: { arguments: JSON.stringify(decision.params) } }],
    }),
    sseChunk(model, {}, { finishReason: "stop" }),
    "[DONE]",
  ];
  return sendSse(res, events);
}

function createMockServer() {
  return createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "GET" && url.pathname === "/v1/models") {
      return handleModels(res);
    }
    if (req.method === "POST" && url.pathname === "/v1/chat/completions") {
      return handleChatCompletions(req, res).catch((err) => {
        sendError(res, 500, err?.message ?? "internal error");
      });
    }
    sendJson(res, 404, { error: { message: "not found" } });
  });
}

// ─── Lifecycle ───────────────────────────────────────────────────────────

function findFreePort(start = 3499, end = 3699) {
  return new Promise((resolve, reject) => {
    const probe = createNetServer();
    probe.once("error", () => {
      const next = start + 1;
      if (next > end) return reject(new Error("no free port found"));
      probe.close(() => findFreePort(next, end).then(resolve, reject));
    });
    probe.listen(start, () => {
      const port = probe.address().port;
      probe.close(() => resolve(port));
    });
  });
}

/**
 * Start the fake OpenAI-compatible server (Ollama `/v1` wire protocol).
 * @param {{port?: number}} options
 * @returns {Promise<{port: number, close: () => Promise<void>}>}
 */
export async function startOpenAICompatMock({ port } = {}) {
  const resolvedPort = port || (await findFreePort());
  const server = createMockServer();

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(resolvedPort, () => resolve());
  });

  return {
    port: resolvedPort,
    async close() {
      await new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections?.();
      });
    },
  };
}

/** @deprecated Use startOpenAICompatMock instead (kept for one release). */
export const startOllamaMock = startOpenAICompatMock;

// ─── Direct execution: node scripts/qa/lib/openai-compat-mock.mjs [port] ──

const isDirectRun =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const requested = Number(process.argv[2]);
  startOpenAICompatMock({ port: Number.isInteger(requested) ? requested : undefined })
    .then(({ port }) => {
      console.log(`OpenAI-compatible mock listening on http://localhost:${port}/v1`);
      console.log(`  GET  /v1/models  → ${OPENAI_COMPAT_MODELS.map((m) => m.id).join(", ")}`);
      console.log("  POST /v1/chat/completions → deterministic tool-calling by keyword (OpenAI SSE)");
    })
    .catch((err) => {
      console.error("Failed to start OpenAI-compatible mock:", err.message);
      process.exit(1);
    });
}
