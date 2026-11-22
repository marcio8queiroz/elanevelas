import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../api/client';
import { Catalog } from '../pages/Catalog';
import { CatalogEditor } from '../pages/CatalogEditor';
import { category, pagination, product } from './fixtures';
const user = () => userEvent.setup();
beforeEach(() => {
  vi.spyOn(api, 'request').mockImplementation(
    async (path) =>
      ({
        success: true,
        data: path.startsWith('/categories?')
          ? [category]
          : path.startsWith('/products?')
            ? [product]
            : path.startsWith('/products/') && path.endsWith('/images')
              ? []
              : path.startsWith('/products/')
                ? product
                : category,
        pagination,
      }) as never,
  );
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});
describe('catálogo', () => {
  it('lista, filtra e pagina com os parâmetros reais', async () => {
    vi.mocked(api.request).mockResolvedValue({
      success: true,
      data: [product],
      pagination: { ...pagination, totalItems: 12, totalPages: 2, hasNextPage: true },
    });
    render(<Catalog kind="products" onDirty={() => {}} />);
    await screen.findByRole('button', { name: 'Editar Vela Lavanda' });
    const u = user();
    await u.type(screen.getByLabelText('Buscar'), 'Lavanda');
    await u.selectOptions(screen.getByLabelText('Status'), 'false');
    await u.selectOptions(screen.getByLabelText('Ordenar'), 'price');
    await u.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith(
        expect.stringContaining('search=Lavanda'),
        expect.anything(),
      ),
    );
    await u.click(screen.getAllByRole('button', { name: 'Próxima' }).at(-1)!);
    await waitFor(() =>
      expect(api.request).toHaveBeenCalledWith(
        expect.stringContaining('page=2'),
        expect.anything(),
      ),
    );
    expect(vi.mocked(api.request).mock.calls.at(-1)![0]).toContain('isActive=false');
  });
  it('preserva categoria quando exclusão está bloqueada', async () => {
    vi.spyOn(api, 'mutate').mockRejectedValue(
      new ApiError(409, 'A categoria está vinculada a produtos e não pode ser excluída.'),
    );
    render(<Catalog kind="categories" onDirty={() => {}} />);
    await screen.findByRole('button', { name: 'Editar Aromáticas' });
    await user().click(screen.getByRole('button', { name: 'Excluir Aromáticas' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('vinculada');
    expect(screen.getByRole('button', { name: 'Editar Aromáticas' })).toBeInTheDocument();
  });
  it('cria categoria e continua com upload disponível', async () => {
    const mutate = vi.spyOn(api, 'mutate').mockResolvedValue({ success: true, data: category });
    render(<CatalogEditor kind="categories" id="new" onDirty={() => {}} onBack={() => {}} />);
    const u = user();
    await u.type(screen.getByLabelText('Nome *'), 'Aromáticas');
    await u.type(screen.getByLabelText('Slug *'), 'aromaticas');
    await u.click(screen.getByRole('button', { name: 'Criar e continuar' }));
    await screen.findByText('Imagem da categoria');
    expect(mutate).toHaveBeenCalledWith('/categories', 'POST', {
      name: 'Aromáticas',
      slug: 'aromaticas',
      description: '',
      isActive: true,
      sortOrder: 0,
    });
  });
  it('edita categoria sem enviar campos internos e preserva valores ao falhar', async () => {
    vi.spyOn(api, 'mutate').mockRejectedValue(
      new ApiError(400, 'Dados inválidos: name: Nome inválido'),
    );
    render(
      <CatalogEditor kind="categories" id={category._id} onDirty={() => {}} onBack={() => {}} />,
    );
    const input = await screen.findByLabelText('Nome *');
    const u = user();
    await u.clear(input);
    await u.type(input, 'Nova coleção');
    await u.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await screen.findByRole('alert');
    expect(input).toHaveValue('Nova coleção');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Nome inválido');
    expect(api.mutate).toHaveBeenCalledWith(
      `/categories/${category._id}`,
      'PATCH',
      expect.not.objectContaining({ _id: category._id }),
    );
  });
  it('cria produto com valores, estoque, dimensões, categoria e status corretos', async () => {
    vi.spyOn(api, 'mutate').mockResolvedValue({ success: true, data: product });
    render(<CatalogEditor kind="products" id="new" onDirty={() => {}} onBack={() => {}} />);
    const u = user();
    for (const [label, value] of [
      ['Nome *', 'Vela Lavanda'],
      ['Slug *', 'vela-lavanda'],
      ['SKU *', 'LAV'],
      ['Fragrância *', 'Lavanda'],
      ['Descrição *', 'Vela artesanal'],
      ['Preço (R$) *', '45.90'],
      ['Peso (kg) *', '0.3'],
      ['Altura (cm) *', '8'],
      ['Largura (cm) *', '7'],
      ['Comprimento (cm) *', '7'],
    ])
      await u.type(screen.getByLabelText(label), value);
    await u.selectOptions(screen.getByLabelText('Categoria *'), category._id);
    await u.click(screen.getByRole('button', { name: 'Criar e continuar' }));
    await screen.findByText('Imagens do produto');
    expect(api.mutate).toHaveBeenCalledWith(
      '/products',
      'POST',
      expect.objectContaining({
        price: 45.9,
        stock: 0,
        promotionalPrice: null,
        category: category._id,
        shipping: product.shipping,
        isActive: true,
        isFeatured: false,
      }),
    );
  });
  it('edita produto e impede submissão duplicada enquanto aguarda confirmação', async () => {
    let resolve!: (v: unknown) => void;
    vi.spyOn(api, 'mutate').mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }) as never,
    );
    render(<CatalogEditor kind="products" id={product._id} onDirty={() => {}} onBack={() => {}} />);
    await screen.findByLabelText('Nome *');
    const u = user();
    await u.clear(screen.getByLabelText('Preço (R$) *'));
    await u.type(screen.getByLabelText('Preço (R$) *'), '52.30');
    const button = screen.getByRole('button', { name: 'Salvar alterações' });
    await u.dblClick(button);
    expect(api.mutate).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    expect(api.mutate).toHaveBeenCalledWith(
      `/products/${product._id}`,
      'PATCH',
      expect.objectContaining({ price: 52.3 }),
    );
    resolve({ success: true, data: product });
    await screen.findByText('Alterações salvas.');
  });
  it('valida campos obrigatórios antes de enviar e avisa ao abandonar alterações', async () => {
    vi.spyOn(api, 'mutate');
    const back = vi.fn();
    vi.mocked(window.confirm).mockReturnValue(false);
    render(<CatalogEditor kind="categories" id="new" onDirty={() => {}} onBack={back} />);
    await user().click(screen.getByRole('button', { name: 'Criar e continuar' }));
    expect(api.mutate).not.toHaveBeenCalled();
    await user().type(screen.getByLabelText('Nome *'), 'Nova');
    await user().click(screen.getByRole('button', { name: /Voltar para/ }));
    expect(window.confirm).toHaveBeenCalled();
    expect(back).not.toHaveBeenCalled();
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
  it('não usa resultados obsoletos quando os filtros mudam', async () => {
    let resolve!: (v: unknown) => void;
    vi.mocked(api.request).mockImplementation((path) => {
      if (path.startsWith('/categories'))
        return Promise.resolve({ success: true, data: [category], pagination }) as never;
      if (path.includes('search=Outra'))
        return Promise.resolve({ success: true, data: [], pagination }) as never;
      return new Promise((r) => {
        resolve = r;
      }) as never;
    });
    render(<Catalog kind="products" onDirty={() => {}} />);
    const u = user();
    await u.type(screen.getByLabelText('Buscar'), 'Outra');
    await u.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
    await screen.findByText('Nenhum registro encontrado');
    resolve({ success: true, data: [product], pagination });
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Editar Vela Lavanda' })).not.toBeInTheDocument(),
    );
  });
  it('exibe falha da API sem dados simulados e permite tentar novamente', async () => {
    let attempts = 0;
    vi.mocked(api.request).mockImplementation(async (path) => {
      if (path.startsWith('/categories'))
        return { success: true, data: [category], pagination } as never;
      if (attempts++ === 0) throw new ApiError(503, 'API indisponível');
      return { success: true, data: [product], pagination } as never;
    });
    render(<Catalog kind="products" onDirty={() => {}} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('API indisponível');
    expect(screen.queryByRole('button', { name: 'Editar Vela Lavanda' })).not.toBeInTheDocument();
    await user().click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByRole('button', { name: 'Editar Vela Lavanda' })).toBeInTheDocument();
  });
  it('rejeita centavos inválidos sem apagar o preço digitado', async () => {
    vi.spyOn(api, 'mutate');
    render(<CatalogEditor kind="products" id={product._id} onDirty={() => {}} onBack={() => {}} />);
    const input = await screen.findByLabelText('Preço (R$) *');
    fireEvent.change(input, { target: { value: '12.345' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Salvar alterações' }).closest('form')!);
    expect(await screen.findByText('Use até duas casas decimais.')).toBeInTheDocument();
    expect(input).toHaveValue(12.345);
    expect(api.mutate).not.toHaveBeenCalled();
  });
});
