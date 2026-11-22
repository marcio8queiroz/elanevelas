import { render, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { api } from '../api/client';
import { Dashboard } from '../pages/Dashboard';
import { category, order, pagination, product } from './fixtures';

it('usa totais globais da paginação e não apresenta tamanho da página como total', async () => {
  vi.spyOn(api, 'request').mockImplementation(
    async (path) =>
      ({
        success: true,
        data: path.startsWith('/products')
          ? [product]
          : path.startsWith('/categories')
            ? [category]
            : [order],
        pagination: {
          ...pagination,
          totalItems: path.startsWith('/products')
            ? 123
            : path.startsWith('/categories')
              ? 25
              : 456,
        },
      }) as never,
  );
  render(<Dashboard navigate={() => {}} />);
  const totals = screen.getByRole('region', { name: 'Totais da loja' });
  expect(await within(totals).findByText('123')).toBeInTheDocument();
  expect(within(totals).getByText('25')).toBeInTheDocument();
  expect(within(totals).getByText('456')).toBeInTheDocument();
  expect(screen.queryByText(/faturamento/i)).not.toBeInTheDocument();
});
