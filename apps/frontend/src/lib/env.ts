// Environment variable assertion for the API base URL.
export function getApiBaseUrl(): string {
  const url = import.meta.env.VITE_API_BASE_URL as string | undefined;
  return url ?? "http://localhost:3000";
}
