import { ApiError, HttpClient } from './http';
import type { Envelope, Session, Tokens } from './types';
export class ApiClient {
  private session: Session | null = null;
  private generation = 0;
  private refreshing: Promise<void> | null = null;
  private listeners = new Set<() => void>();
  notice = '';
  private version = 0;
  versionSnapshot = () => this.version;
  private http: HttpClient;
  constructor(base = import.meta.env.VITE_API_URL || '/api/v1', transport?: typeof fetch) {
    this.http = new HttpClient(base, transport);
  }
  snapshot = () => this.session;
  subscribe = (callback: () => void) => {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  };
  private emit() {
    this.version++;
    this.listeners.forEach((fn) => fn());
  }
  private clear(message = '') {
    this.generation++;
    this.session = null;
    this.notice = message;
    this.emit();
  }
  private json(method: string, body: unknown): RequestInit {
    return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  }
  async login(email: string, password: string) {
    const generation = ++this.generation;
    const { data } = await this.http.send<Session>(
      '/auth/login',
      this.json('POST', { email, password }),
    );
    if (generation !== this.generation) return;
    if (data.user.role !== 'admin') {
      await this.http
        .send('/auth/logout', this.json('POST', { refreshToken: data.refreshToken }))
        .catch(() => {});
      throw new ApiError(403, 'Acesso restrito a administradores.');
    }
    this.session = data;
    this.notice = '';
    this.emit();
  }
  async logout() {
    // Wait for rotation before revoking the latest token. Never resurrect a cleared session.
    const rotation = this.refreshing;
    if (rotation) await rotation.catch(() => {});
    const refreshToken = this.session?.refreshToken;
    this.clear();
    if (refreshToken) {
      try {
        await this.http.send('/auth/logout', this.json('POST', { refreshToken }));
      } catch {
        this.notice =
          'Sessão encerrada neste navegador. Não foi possível confirmar a revogação no servidor.';
        this.emit();
      }
    }
  }
  private renew() {
    if (this.refreshing) return this.refreshing;
    const current = this.session;
    const generation = this.generation;
    this.refreshing = (async () => {
      if (!current) throw new ApiError(401, 'Entre novamente para continuar.');
      try {
        const { data } = await this.http.send<Tokens>(
          '/auth/refresh',
          this.json('POST', { refreshToken: current.refreshToken }),
        );
        if (generation !== this.generation) throw new ApiError(401, 'Sessão encerrada.');
        this.session = { ...current, ...data };
        this.emit();
      } catch (error) {
        if (generation === this.generation) this.clear('Sua sessão expirou. Entre novamente.');
        throw error;
      }
    })().finally(() => {
      this.refreshing = null;
    });
    return this.refreshing;
  }
  async request<T>(path: string, init: RequestInit = {}): Promise<Envelope<T>> {
    const generation = this.generation;
    const token = this.session?.accessToken;
    if (!token) throw new ApiError(401, 'Entre novamente para continuar.');
    const run = () =>
      this.http.send<T>(path, {
        ...init,
        headers: {
          ...Object.fromEntries(new Headers(init.headers)),
          Authorization: `Bearer ${this.session?.accessToken}`,
        },
      });
    try {
      return await run();
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401 || init.signal?.aborted) throw error;
      if (generation !== this.generation) throw error;
      if (token === this.session?.accessToken) await this.renew();
      if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (generation !== this.generation || !this.session) throw error;
      if (init.method && !['GET', 'HEAD'].includes(init.method.toUpperCase())) {
        throw new ApiError(401, 'Sessão renovada. Revise os dados e envie novamente.');
      }
      // Only reads are replayed once after explicit authentication rejection.
      try {
        return await run();
      } catch (retryError) {
        if (retryError instanceof ApiError && retryError.status === 401)
          this.clear('Sua sessão expirou. Entre novamente.');
        throw retryError;
      }
    }
  }
  mutate<T>(path: string, method: string, body?: unknown) {
    return this.request<T>(
      path,
      body instanceof FormData ? { method, body } : this.json(method, body),
    );
  }
}
export const api = new ApiClient();
