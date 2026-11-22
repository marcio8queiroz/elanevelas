import type { Envelope } from './types';
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export class HttpClient {
  constructor(
    private base = import.meta.env.VITE_API_URL || '/api/v1',
    private transport: typeof fetch = (...args) => fetch(...args),
  ) {}
  async send<T>(path: string, init: RequestInit = {}): Promise<Envelope<T>> {
    let response: Response;
    try {
      response = await this.transport(`${this.base}${path}`, { ...init, credentials: 'omit' });
    } catch (error) {
      if (init.signal?.aborted) throw error;
      throw new ApiError(
        0,
        'Não foi possível acessar a API. Verifique sua conexão e tente novamente.',
      );
    }
    if (response.status === 204) return { success: true, data: undefined as T };
    const body = await response.json().catch(() => null);
    if (!response.ok)
      throw new ApiError(
        response.status,
        body?.message || `Serviço indisponível (HTTP ${response.status}).`,
      );
    if (!body?.success) throw new ApiError(502, 'Resposta inesperada da API.');
    return body;
  }
}
export const message = (error: unknown) =>
  error instanceof Error ? error.message : 'Não foi possível concluir a operação.';
