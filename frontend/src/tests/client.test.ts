import { describe, it, expect, vi } from 'vitest';
import { ApiClient } from '../api/client';
const session = {
  user: { id: 'u', name: 'Equipe', email: 'admin@example.com', role: 'admin' },
  accessToken: 'old',
  refreshToken: 'refresh-old',
};
const ok = (data: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify({ success: true, data }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
const fail = (status: number) =>
  new Response(JSON.stringify({ success: false, message: 'Recusado' }), { status });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
describe('sessão e cliente HTTP', () => {
  it('faz login sem persistir tokens e revoga no logout', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(ok(session)).mockResolvedValueOnce(ok(null, 204));
    const client = new ApiClient('/api/v1', fetch);
    const storage = vi.spyOn(Storage.prototype, 'setItem');
    await client.login('admin@example.com', 'password');
    expect(client.snapshot()?.user.role).toBe('admin');
    expect(storage).not.toHaveBeenCalled();
    await client.logout();
    expect(client.snapshot()).toBeNull();
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ refreshToken: 'refresh-old' });
  });
  it('recusa cliente não admin e revoga os tokens emitidos', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(ok({ ...session, user: { ...session.user, role: 'customer' } }))
      .mockResolvedValueOnce(ok(null, 204));
    const client = new ApiClient('/api', fetch);
    await expect(client.login('x@example.com', 'password')).rejects.toThrow('administradores');
    expect(client.snapshot()).toBeNull();
    expect(fetch.mock.calls[1][0]).toBe('/api/auth/logout');
  });
  it('recusa acesso sem sessão e credenciais incorretas', async () => {
    const fetch = vi.fn().mockResolvedValue(fail(401));
    const client = new ApiClient('/api', fetch);
    await expect(client.request('/admin/orders')).rejects.toMatchObject({ status: 401 });
    expect(fetch).not.toHaveBeenCalled();
    await expect(client.login('x@example.com', 'password')).rejects.toMatchObject({ status: 401 });
    expect(client.snapshot()).toBeNull();
  });
  it('rotaciona uma única vez para requisições simultâneas e respostas 401 tardias', async () => {
    const gate = deferred<Response>();
    const late = deferred<Response>();
    let oldCalls = 0;
    const fetch = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const path = String(input);
      if (path.endsWith('/login')) return ok(session);
      if (path.endsWith('/refresh')) return gate.promise;
      if ((init.headers as Record<string, string>).Authorization === 'Bearer old') {
        oldCalls++;
        return oldCalls === 3 ? late.promise : fail(401);
      }
      return ok(['result']);
    });
    const client = new ApiClient('/api', fetch);
    await client.login('x@example.com', 'password');
    const first = client.request('/products'),
      second = client.request('/categories'),
      third = client.request('/admin/orders');
    await vi.waitFor(() =>
      expect(fetch.mock.calls.filter(([p]) => String(p).endsWith('/refresh'))).toHaveLength(1),
    );
    gate.resolve(ok({ accessToken: 'new', refreshToken: 'refresh-new' }));
    await Promise.all([first, second]);
    late.resolve(fail(401));
    await third;
    expect(fetch.mock.calls.filter(([p]) => String(p).endsWith('/refresh'))).toHaveLength(1);
    expect(client.snapshot()?.refreshToken).toBe('refresh-new');
  });
  it('encerra sessão quando refresh falha, sem repetir indefinidamente', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(ok(session)).mockResolvedValue(fail(401));
    const client = new ApiClient('/api', fetch);
    await client.login('x@example.com', 'password');
    await expect(client.request('/products')).rejects.toMatchObject({ status: 401 });
    expect(client.snapshot()).toBeNull();
    expect(client.notice).toContain('expirou');
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('não renova novamente quando token novo também é recusado', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(ok(session))
      .mockResolvedValueOnce(fail(401))
      .mockResolvedValueOnce(ok({ accessToken: 'new', refreshToken: 'r2' }))
      .mockResolvedValueOnce(fail(401));
    const client = new ApiClient('/api', fetch);
    await client.login('x@example.com', 'password');
    await expect(client.request('/products')).rejects.toMatchObject({ status: 401 });
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(client.snapshot()).toBeNull();
  });
  it.each([403, 409, 500, 503])('não repete mutações em HTTP %i', async (status) => {
    const fetch = vi.fn().mockResolvedValueOnce(ok(session)).mockResolvedValueOnce(fail(status));
    const client = new ApiClient('/api', fetch);
    await client.login('x@example.com', 'password');
    await expect(client.mutate('/products', 'POST', { name: 'Vela' })).rejects.toMatchObject({
      status,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('preserva multipart sem definir Content-Type ou opções de provedor', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(ok(session)).mockResolvedValueOnce(ok([]));
    const client = new ApiClient('/api', fetch);
    await client.login('x@example.com', 'password');
    const body = new FormData();
    body.append('file', new File(['png'], 'vela.png', { type: 'image/png' }));
    body.append('alt', 'Vela');
    await client.mutate('/products/id/images', 'POST', body);
    const init = fetch.mock.calls[1][1];
    expect(init.body).toBe(body);
    expect(init.headers).not.toHaveProperty('Content-Type');
    expect([...body.keys()]).toEqual(['file', 'alt']);
  });
  it('cancela requisição sem tentar renovar', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(ok(session))
      .mockRejectedValueOnce(new DOMException('Abort', 'AbortError'));
    const client = new ApiClient('/api', fetch);
    await client.login('x@example.com', 'password');
    const controller = new AbortController();
    controller.abort();
    await expect(client.request('/products', { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('espera rotação pendente e revoga o refresh mais recente no logout', async () => {
    const gate = deferred<Response>();
    const fetch = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const path = String(input);
      if (path.endsWith('/login')) return ok(session);
      if (path.endsWith('/refresh')) return gate.promise;
      if (path.endsWith('/logout')) return ok(null, 204);
      return (init.headers as Record<string, string>).Authorization === 'Bearer old'
        ? fail(401)
        : ok([]);
    });
    const client = new ApiClient('/api', fetch);
    await client.login('x@example.com', 'password');
    const request = client.request('/products').catch(() => {});
    await vi.waitFor(() =>
      expect(fetch.mock.calls.some(([p]) => String(p).endsWith('/refresh'))).toBe(true),
    );
    const logout = client.logout();
    gate.resolve(ok({ accessToken: 'new', refreshToken: 'rotated' }));
    await Promise.all([request, logout]);
    expect(client.snapshot()).toBeNull();
    expect(
      JSON.parse(fetch.mock.calls.find(([p]) => String(p).endsWith('/logout'))![1]!.body as string),
    ).toEqual({ refreshToken: 'rotated' });
  });
  it('limpa a sessão local mesmo quando a revogação está indisponível', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(ok(session))
      .mockRejectedValueOnce(new Error('offline'));
    const client = new ApiClient('/api', fetch);
    await client.login('x@example.com', 'password');
    await client.logout();
    expect(client.snapshot()).toBeNull();
    expect(client.notice).toContain('revogação');
  });
});

it('renova após 401 de mutação, mas exige novo envio explícito', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(ok(session))
    .mockResolvedValueOnce(fail(401))
    .mockResolvedValueOnce(ok({ accessToken: 'new', refreshToken: 'r2' }));
  const client = new ApiClient('/api', fetch);
  await client.login('admin@example.com', 'password');
  await expect(client.mutate('/products', 'POST', { name: 'Vela' })).rejects.toThrow(
    'envie novamente',
  );
  expect(fetch).toHaveBeenCalledTimes(3);
  expect(client.snapshot()?.accessToken).toBe('new');
});
