import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/client';
import { App } from '../App';
const session = {
  user: { id: 'u', name: 'Equipe', email: 'admin@example.com', role: 'admin' },
  accessToken: 'access',
  refreshToken: 'refresh',
};
beforeEach(async () => {
  vi.spyOn(api, 'request').mockResolvedValue({
    success: true,
    data: [],
    pagination: {
      page: 1,
      limit: 10,
      totalItems: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  });
  vi.mocked(fetch).mockImplementation(
    async (url) =>
      new Response(
        String(url).endsWith('/logout') ? null : JSON.stringify({ success: true, data: session }),
        { status: String(url).endsWith('/logout') ? 204 : 200 },
      ),
  );
  await api.logout();
});
describe('login e navegação acessível', () => {
  it('protege painel, usa labels, permite login por teclado e logout', async () => {
    render(<App />);
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    const u = userEvent.setup();
    await u.click(screen.getByLabelText('E-mail'));
    await u.keyboard('admin@example.com');
    await u.tab();
    expect(screen.getByLabelText('Senha')).toHaveFocus();
    await u.keyboard('password123');
    await u.tab();
    await u.keyboard('{Enter}');
    await screen.findByRole('navigation', { name: 'Navegação principal' });
    expect(screen.getByRole('main')).toHaveFocus();
    await u.click(screen.getByRole('button', { name: 'Categorias' }));
    await screen.findByRole('heading', { name: 'Categorias' });
    expect(screen.getByRole('button', { name: 'Categorias' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await u.click(screen.getByRole('button', { name: 'Sair do painel' }));
    await screen.findByRole('heading', { name: 'Acesse seu painel' });
    expect(api.snapshot()).toBeNull();
  });
  it('mostra erro de credenciais e mantém e-mail preenchido', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ success: false, message: 'E-mail ou senha inválidos.' }), {
        status: 401,
      }),
    );
    render(<App />);
    const u = userEvent.setup();
    await u.type(screen.getByLabelText('E-mail'), 'admin@example.com');
    await u.type(screen.getByLabelText('Senha'), 'password123');
    await u.click(screen.getByRole('button', { name: 'Entrar no painel →' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('inválidos');
    expect(screen.getByLabelText('E-mail')).toHaveValue('admin@example.com');
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
  it('exibe acesso recusado a usuário não administrador', async () => {
    vi.mocked(fetch).mockImplementation(
      async (url) =>
        new Response(
          String(url).endsWith('/logout')
            ? null
            : JSON.stringify({
                success: true,
                data: { ...session, user: { ...session.user, role: 'customer' } },
              }),
          { status: String(url).endsWith('/logout') ? 204 : 200 },
        ),
    );
    render(<App />);
    const u = userEvent.setup();
    await u.type(screen.getByLabelText('E-mail'), 'cliente@example.com');
    await u.type(screen.getByLabelText('Senha'), 'password123');
    await u.click(screen.getByRole('button', { name: 'Entrar no painel →' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('administradores'));
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });
});
