/**
 * Express 5 types route params and query values as `string | string[]`
 * (@types/express-serve-static-core ParamsDictionary/ParsedQs).
 * Narrow to a single string (first value) for Prisma filters.
 */
export function paramString(value: string | string[]): string {
  return Array.isArray(value) ? value[0] : value;
}
