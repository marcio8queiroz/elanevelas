// Shared entry point for session-aware data access.
export { ApiClient, api } from './session';
export { ApiError, message } from './http';

export function query(values: Record<string, string | number>) {
  return new URLSearchParams(
    Object.entries(values)
      .filter(([, value]) => String(value).trim() !== '')
      .map(([key, value]) => [key, String(value)]),
  ).toString();
}
