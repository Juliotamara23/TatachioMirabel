/**
 * spec-reader.mjs — OpenAPI spec loader for QA validation
 * Minimal YAML parser for this specific spec structure
 */

import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { readFileSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..", "..", "..");
const DEFAULT_SPEC_PATH = resolve(projectRoot, "specs", "openapi.yaml");

let _specCache = null;

/**
 * Minimal YAML parser for OpenAPI spec structure
 * Handles: 2-space indented maps, arrays with "- ", scalars, $ref strings
 */
function parseYAML(content) {
  const lines = content.split("\n");
  let index = 0;

  function parseValue(line, baseIndent) {
    const trimmed = line.trim();

    // Handle explicit null
    if (trimmed === "null" || trimmed === "~") return null;

    // Handle booleans
    if (trimmed === "true") return true;
    if (trimmed === "false") return false;

    // Handle numbers
    if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
      return trimmed.includes(".") ? parseFloat(trimmed) : parseInt(trimmed, 10);
    }

    // Handle strings (quoted or unquoted)
    // Remove surrounding quotes if present
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      return trimmed.slice(1, -1).replace(/\\"/g, '"');
    }
    if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
      return trimmed.slice(1, -1).replace(/\\'/g, "'");
    }
    return trimmed;
  }

  function getIndent(line) {
    return line.length - line.trimStart().length;
  }

  function parseArray(baseIndent) {
    const arr = [];
    while (index < lines.length) {
      const line = lines[index];
      if (!line.trim() || line.trim().startsWith("#")) {
        index++;
        continue;
      }
      const indent = getIndent(line);
      if (indent < baseIndent) break;
      if (indent > baseIndent) {
        index++;
        continue;
      }
      const trimmed = line.trim();
      if (trimmed.startsWith("- ")) {
        const itemLine = trimmed.slice(2);
        if (itemLine.includes(":")) {
          // Array of objects - parse inline object
          index++;
          arr.push(parseObject(baseIndent + 2));
        } else {
          arr.push(parseValue(itemLine, baseIndent));
          index++;
        }
      } else {
        break;
      }
    }
    return arr;
  }

  function parseObject(baseIndent) {
    const obj = {};
    while (index < lines.length) {
      const line = lines[index];
      if (!line.trim() || line.trim().startsWith("#")) {
        index++;
        continue;
      }
      const indent = getIndent(line);
      if (indent < baseIndent) break;
      if (indent > baseIndent) {
        // This shouldn't happen at this level
        break;
      }

      const trimmed = line.trim();
      const colonIdx = trimmed.indexOf(":");
      if (colonIdx === -1) {
        index++;
        continue;
      }

      const keyRaw = trimmed.slice(0, colonIdx).trim();
      // Strip surrounding quotes from keys (YAML allows quoted keys like "200")
      const key = (keyRaw.startsWith('"') && keyRaw.endsWith('"'))
        ? keyRaw.slice(1, -1).replace(/\\"/g, '"')
        : (keyRaw.startsWith("'") && keyRaw.endsWith("'"))
          ? keyRaw.slice(1, -1).replace(/\\'/g, "'")
          : keyRaw;
      const valuePart = trimmed.slice(colonIdx + 1).trim();

      if (valuePart === "" || valuePart === "|" || valuePart === ">") {
        // Multi-line or nested object/array
        index++;
        if (index < lines.length) {
          const nextLine = lines[index];
          const nextIndent = getIndent(nextLine);
          const nextTrimmed = nextLine.trim();
          if (nextIndent > baseIndent) {
            if (nextTrimmed.startsWith("- ")) {
              obj[key] = parseArray(baseIndent + 2);
            } else {
              obj[key] = parseObject(baseIndent + 2);
            }
          } else {
            obj[key] = null;
          }
        } else {
          obj[key] = null;
        }
      } else {
        // Inline value
        obj[key] = parseValue(valuePart, baseIndent);
        index++;
      }
    }
    return obj;
  }

  // Parse root
  return parseObject(0);
}

/**
 * Load and parse the OpenAPI spec (cached)
 * @param {string} [specPath] - Path to openapi.yaml
 * @returns {Object} Parsed spec object
 */
export function loadSpec(specPath = DEFAULT_SPEC_PATH) {
  if (_specCache) return _specCache;
  const content = readFileSync(specPath, "utf-8");
  _specCache = parseYAML(content);
  return _specCache;
}

/**
 * Get all paths with method, path, responses, security
 * @param {Object} spec - Parsed spec from loadSpec()
 * @returns {Array} [{ method, path, responses: string[], security: string }]
 */
export function getPaths(spec) {
  const paths = spec.paths || {};
  const result = [];

  for (const [path, methods] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (typeof operation !== "object") continue;
      const responses = Object.keys(operation.responses || {});
      const security = operation.security ? "bearer" : "none";
      result.push({
        method: method.toUpperCase(),
        path,
        responses,
        security,
        summary: operation.summary || "",
        tags: operation.tags || [],
      });
    }
  }

  return result;
}

/**
 * Get a specific endpoint operation
 * @param {Object} spec - Parsed spec
 * @param {string} method - HTTP method (GET, POST, etc.)
 * @param {string} path - Path pattern (e.g., "/api/auth/login")
 * @returns {Object|undefined} Operation object or undefined
 */
export function getEndpoint(spec, method, path) {
  const paths = spec.paths || {};
  const pathObj = paths[path];
  if (!pathObj) return undefined;
  const op = pathObj[method.toLowerCase()];
  return op;
}

/**
 * Get status codes for an endpoint
 * @param {Object} spec - Parsed spec
 * @param {string} method - HTTP method
 * @param {string} path - Path pattern
 * @returns {string[]} Status codes (e.g., ["200", "401", "403"])
 */
export function getStatusCodes(spec, method, path) {
  const ep = getEndpoint(spec, method, path);
  if (!ep) return [];
  return Object.keys(ep.responses || {});
}

/**
 * Classify security level for an endpoint
 * Based on operation summary/tags per requirements
 * @param {Object} spec - Parsed spec
 * @param {string} method - HTTP method
 * @param {string} path - Path pattern
 * @returns {"none" | "any" | "admin" | "captain+admin"}
 */
export function getSecurity(spec, method, path) {
  const ep = getEndpoint(spec, method, path);
  if (!ep) return "none";

  const summary = (ep.summary || "").toLowerCase();
  const tags = ep.tags || [];
  const pathLower = path.toLowerCase();
  const methodUpper = method.toUpperCase();

  // auth/register + auth/login → "none"
  if (pathLower === "/api/auth/register" && methodUpper === "POST") return "none";
  if (pathLower === "/api/auth/login" && methodUpper === "POST") return "none";

  // modelos GET, chat POST, cabildos GET, familias GET, miembros GET → "any"
  if (pathLower === "/api/models" && methodUpper === "GET") return "any";
  if (pathLower === "/api/chat" && methodUpper === "POST") return "any";
  if (pathLower === "/api/cabildos" && methodUpper === "GET") return "any";
  if (pathLower.startsWith("/api/cabildos/") && methodUpper === "GET") return "any";
  if (pathLower === "/api/familias" && methodUpper === "GET") return "any";
  if (pathLower.startsWith("/api/familias/") && methodUpper === "GET") return "any";
  if (pathLower === "/api/miembros" && methodUpper === "GET") return "any";
  if (pathLower.startsWith("/api/miembros/") && methodUpper === "GET") return "any";

  // cabildos POST/PUT/DELETE, familias POST/PUT/DELETE, admin/* → "admin"
  if (pathLower === "/api/cabildos" && ["POST", "PUT", "DELETE"].includes(methodUpper)) return "admin";
  if (pathLower.startsWith("/api/cabildos/") && ["PUT", "DELETE"].includes(methodUpper)) return "admin";
  if (pathLower === "/api/familias" && ["POST", "PUT", "DELETE"].includes(methodUpper)) return "admin";
  if (pathLower.startsWith("/api/familias/") && ["PUT", "DELETE"].includes(methodUpper)) return "admin";
  if (pathLower.startsWith("/api/admin/")) return "admin";

  // miembros POST/PUT → "captain+admin"
  if (pathLower === "/api/miembros" && methodUpper === "POST") return "captain+admin";
  if (pathLower.startsWith("/api/miembros/") && methodUpper === "PUT") return "captain+admin";

  // miembros DELETE → "admin"
  if (pathLower.startsWith("/api/miembros/") && methodUpper === "DELETE") return "admin";

  // Default to "any" for authenticated endpoints
  if (ep.security) return "any";

  return "none";
}

/**
 * Get a component schema by name
 * @param {Object} spec - Parsed spec
 * @param {string} name - Schema name (e.g., "Miembro", "Cabildo")
 * @returns {Object|undefined} Schema object or undefined
 */
export function getSchema(spec, name) {
  return spec.components?.schemas?.[name];
}

// Export for testing
export { parseYAML, DEFAULT_SPEC_PATH };