import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { display, displayError, isPipeMode, setExitCode } from "../../src/display.js";

describe("display", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    process.exitCode = 0;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("JSON mode", () => {
    it("outputs envelope with ok:true and data", () => {
      display({ nombres: "Juan", edad: 30 }, "json");
      expect(logSpy).toHaveBeenCalledOnce();
      const output = JSON.parse(logSpy.mock.calls[0][0]);
      expect(output).toEqual({ ok: true, data: { nombres: "Juan", edad: 30 } });
    });

    it("outputs envelope with null data", () => {
      display(null, "json");
      const output = JSON.parse(logSpy.mock.calls[0][0]);
      expect(output.ok).toBe(true);
      expect(output.data).toBeNull();
    });
  });

  describe("pretty mode", () => {
    it("outputs string directly", () => {
      display("hola mundo", "pretty");
      expect(logSpy).toHaveBeenCalledWith("hola mundo");
    });

    it("outputs array with numbering", () => {
      display([{ a: 1 }, { a: 2 }], "pretty");
      expect(logSpy).toHaveBeenCalledTimes(2);
      expect(logSpy.mock.calls[0][0]).toContain("1:");
      expect(logSpy.mock.calls[1][0]).toContain("2:");
    });

    it("outputs object key-value", () => {
      display({ nombre: "Ana", edad: 25 }, "pretty");
      expect(logSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe("displayError", () => {
    it("JSON mode writes to stderr with envelope", () => {
      displayError("something went wrong", "json");
      expect(errorSpy).toHaveBeenCalledOnce();
      const output = JSON.parse(errorSpy.mock.calls[0][0]);
      expect(output).toEqual({ ok: false, error: "something went wrong" });
    });

    it("pretty mode writes to stderr directly", () => {
      displayError("algo falló", "pretty");
      expect(errorSpy).toHaveBeenCalledWith("algo falló");
    });

    it("extracts message from Error instances", () => {
      displayError(new Error("boom"), "json");
      const output = JSON.parse(errorSpy.mock.calls[0][0]);
      expect(output.error).toBe("boom");
    });
  });

  describe("setExitCode", () => {
    it("sets process.exitCode", () => {
      setExitCode(1);
      expect(process.exitCode).toBe(1);
    });
  });
});
