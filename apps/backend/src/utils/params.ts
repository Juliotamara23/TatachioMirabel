/**
 * Express 5 types route params and query values as `string | string[]`
 * (@types/express-serve-static-core ParamsDictionary/ParsedQs).
 * Narrow to a single string (first value) for Prisma filters.
 *
 * If a param arrives as a repeated array (e.g. `?id=a&id=b`), the first
 * value wins. An empty array is a caller bug, not valid input: fail loudly
 * instead of silently passing `undefined` to a Prisma filter.
 */
export function paramString(value: string | string[]): string {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      throw new Error("paramString: received an empty array for a route/query param");
    }
    return value[0];
  }
  return value;
}
