import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { useColumnVisibility } from "./useColumnVisibility";

interface TestColumn {
  key: string;
  header: string;
}

const CATALOG: TestColumn[] = [
  { key: "a", header: "A" },
  { key: "b", header: "B" },
  { key: "c", header: "C" },
];
const DEFAULT_KEYS = ["a", "b"];
const STORAGE_KEY = "test:columns";

describe("useColumnVisibility", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows the default keys when nothing is stored", () => {
    const { result } = renderHook(() =>
      useColumnVisibility(CATALOG, DEFAULT_KEYS, STORAGE_KEY),
    );
    expect(result.current.visibleKeys).toEqual(["a", "b"]);
    expect(result.current.visibleColumns.map((c) => c.key)).toEqual(["a", "b"]);
  });

  it("shows every catalog key by default when no defaultKeys are given", () => {
    const { result } = renderHook(() =>
      useColumnVisibility(CATALOG, undefined, STORAGE_KEY),
    );
    expect(result.current.visibleKeys).toEqual(["a", "b", "c"]);
  });

  it("toggles a key and persists the selection to localStorage", () => {
    const { result } = renderHook(() =>
      useColumnVisibility(CATALOG, DEFAULT_KEYS, STORAGE_KEY),
    );
    act(() => result.current.toggle("c"));
    expect(result.current.visibleKeys).toEqual(["a", "b", "c"]);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]")).toEqual([
      "a",
      "b",
      "c",
    ]);

    act(() => result.current.toggle("a"));
    expect(result.current.visibleKeys).toEqual(["b", "c"]);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]")).toEqual([
      "b",
      "c",
    ]);
  });

  it("restores a stored selection on mount", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(["b", "c"]));
    const { result } = renderHook(() =>
      useColumnVisibility(CATALOG, DEFAULT_KEYS, STORAGE_KEY),
    );
    expect(result.current.visibleKeys).toEqual(["b", "c"]);
  });

  it("drops keys that do not exist in the catalog", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(["zzz", "a"]));
    const { result } = renderHook(() =>
      useColumnVisibility(CATALOG, DEFAULT_KEYS, STORAGE_KEY),
    );
    expect(result.current.visibleKeys).toEqual(["a"]);
  });

  it("falls back to defaults when nothing valid is stored", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(["zzz"]));
    const { result } = renderHook(() =>
      useColumnVisibility(CATALOG, DEFAULT_KEYS, STORAGE_KEY),
    );
    expect(result.current.visibleKeys).toEqual(["a", "b"]);
  });

  it("falls back to defaults when stored JSON is corrupt", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    const { result } = renderHook(() =>
      useColumnVisibility(CATALOG, DEFAULT_KEYS, STORAGE_KEY),
    );
    expect(result.current.visibleKeys).toEqual(["a", "b"]);
  });

  it("reset() returns to the default keys and persists them", () => {
    const { result } = renderHook(() =>
      useColumnVisibility(CATALOG, DEFAULT_KEYS, STORAGE_KEY),
    );
    act(() => result.current.toggle("c"));
    act(() => result.current.toggle("a"));
    expect(result.current.visibleKeys).toEqual(["b", "c"]);

    act(() => result.current.reset());
    expect(result.current.visibleKeys).toEqual(["a", "b"]);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]")).toEqual([
      "a",
      "b",
    ]);
  });
});
