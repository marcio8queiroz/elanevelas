import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../api/client';
import { OrderDetail, Orders } from '../pages/Orders';
import { order, pagination } from './fixtures';
beforeEach(() => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(api, 'request').mockResolvedValue({ success: true, data: order });
});
describe('pedidos administrativos', () => {
  it('exibe cliente, snapshots, endereço, frete e histórico', async () => {
    render(<OrderDetail id={order.id} onBack={() => {}} />);
    await screen.findByText(order.orderNumber);
    expect(screen.getByText('Nome no snapshot')).toBeInTheDocument();
    expect(screen.getByText('SKU', { exact: false })).toBeInTheDocument();
    expect(screen.getByText(/Cidade de teste/)).toBeInTheDocument();
    expect(screen.getByText(/Prazo cotado: 4/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Histórico' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Pagamento' })).toBeInTheDocument();
  });
  it('permite somente transições recebidas e confirma alteração logística', async () => {
    vi.spyOn(api, 'mutate').mockResolvedValue({ success: true, data: order });
    render(<OrderDetail id={order.id} onBack={() => {}} />);
    await screen.findByText(order.orderNumber);
    expect(screen.queryByRole('button', { name: 'Entregue' })).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Confirmado' }));
    await waitFor(() =>
      expect(api.mutate).toHaveBeenCalledWith(`/admin/orders/${order.id}/status`, 'PATCH', {
        status: 'confirmed',
      }),
    );
    await waitFor(() => expect(api.request).toHaveBeenCalledTimes(2));
  });
  it('bloqueia pagamento manual e cancelamento em pedidos integrados', async () => {
    vi.mocked(api.request).mockResolvedValue({
      success: true,
      data: {
        ...order,
        allowedActions: {
          statuses: ['confirmed'],
          paymentStatuses: [],
          paymentManagedExternally: true,
        },
      },
    });
    render(<OrderDetail id={order.id} onBack={() => {}} />);
    await screen.findByText(/Gerenciado pelo provedor/);
    expect(screen.queryByRole('button', { name: 'Cancelado' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Registrar: Pago' })).not.toBeInTheDocument();
  });
  it('avisa que pagamento manual é apenas registro local e recarrega conflito', async () => {
    vi.spyOn(api, 'mutate').mockRejectedValue(
      new ApiError(409, 'O pedido foi atualizado simultaneamente.'),
    );
    render(<OrderDetail id={order.id} onBack={() => {}} />);
    await screen.findByText(order.orderNumber);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Registrar: Pago' }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('somente local'));
    expect(await screen.findByRole('alert')).toHaveTextContent('simultaneamente');
    await waitFor(() => expect(api.request).toHaveBeenCalledTimes(2));
  });
  it('filtra pedidos por número, logística e pagamento', async () => {
    vi.mocked(api.request).mockResolvedValue({ success: true, data: [order], pagination });
    render(<Orders />);
    await screen.findByText(order.orderNumber);
    const u = userEvent.setup();
    await u.type(screen.getByLabelText('Número exato do pedido'), 'EV-EXEMPLO');
    await u.selectOptions(screen.getByLabelText('Logística'), 'confirmed');
    await u.selectOptions(screen.getByLabelText('Pagamento'), 'paid');
    await u.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith(
        expect.stringContaining('paymentStatus=paid'),
        expect.anything(),
      ),
    );
    expect(vi.mocked(api.request).mock.calls.at(-1)![0]).toContain('status=confirmed');
  });
});
