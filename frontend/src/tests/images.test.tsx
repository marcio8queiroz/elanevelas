import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../api/client';
import { Images } from '../pages/Images';
import { category, pictures, product } from './fixtures';
beforeEach(() => {
  vi.spyOn(api, 'request').mockResolvedValue({ success: true, data: pictures });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:preview'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
});
const show = () =>
  render(<Images kind="products" id={product._id} onDirty={() => {}} onBusy={() => {}} />);
const upload = async () => {
  const file = new File(['image'], 'vela.png', { type: 'image/png' });
  await userEvent.setup().upload(screen.getByLabelText('Arquivo de imagem'), file);
  return file;
};
describe('imagens', () => {
  it('envia um arquivo multipart e alt; revoga preview após sucesso', async () => {
    const mutate = vi.spyOn(api, 'mutate').mockResolvedValue({ success: true, data: pictures });
    show();
    await screen.findByDisplayValue('Primeira');
    const file = await upload();
    expect(screen.getByAltText('Prévia do arquivo selecionado')).toHaveAttribute(
      'src',
      'blob:preview',
    );
    await userEvent
      .setup()
      .type(screen.getByLabelText('Texto alternativo da nova imagem'), 'Vela clara');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Enviar imagem' }));
    await screen.findByText('Alterações salvas.');
    const [path, method, body] = mutate.mock.calls[0];
    expect(path).toBe(`/products/${product._id}/images`);
    expect(method).toBe('POST');
    expect((body as FormData).get('file')).toBe(file);
    expect((body as FormData).get('alt')).toBe('Vela clara');
    expect([...(body as FormData).keys()]).toEqual(['file', 'alt']);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
  });
  it('preserva arquivo e texto quando upload falha e impede envio duplicado', async () => {
    let reject!: (reason: unknown) => void;
    vi.spyOn(api, 'mutate').mockImplementation(
      () =>
        new Promise((_, r) => {
          reject = r;
        }) as never,
    );
    show();
    await screen.findByDisplayValue('Primeira');
    await upload();
    await userEvent
      .setup()
      .type(screen.getByLabelText('Texto alternativo da nova imagem'), 'Meu texto');
    await userEvent.setup().dblClick(screen.getByRole('button', { name: 'Enviar imagem' }));
    expect(api.mutate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Enviando…' })).toBeDisabled();
    reject(new ApiError(503, 'Envio indisponível'));
    await screen.findByRole('alert');
    expect(screen.getByLabelText('Texto alternativo da nova imagem')).toHaveValue('Meu texto');
    expect(screen.getByAltText('Prévia do arquivo selecionado')).toBeInTheDocument();
  });
  it.each([
    ['image/svg+xml', 10],
    ['image/png', 5 * 1024 * 1024 + 1],
  ])('rejeita arquivo %s de tamanho %i', async (type, size) => {
    vi.spyOn(api, 'mutate');
    show();
    await screen.findByDisplayValue('Primeira');
    const file = new File(['x'], 'file', { type });
    Object.defineProperty(file, 'size', { value: size });
    fireEvent.change(screen.getByLabelText('Arquivo de imagem'), { target: { files: [file] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('até 5 MiB');
    expect(api.mutate).not.toHaveBeenCalled();
  });
  it('atualiza alt, principal e ordena enviando todos os IDs estáveis', async () => {
    const mutate = vi.spyOn(api, 'mutate').mockResolvedValue({ success: true, data: pictures });
    show();
    await screen.findByDisplayValue('Primeira');
    const second = screen.getByDisplayValue('Segunda').closest('article')!;
    const u = userEvent.setup();
    await u.clear(within(second).getByLabelText('Texto alternativo'));
    await u.type(within(second).getByLabelText('Texto alternativo'), 'Vista lateral');
    await u.click(within(second).getByRole('button', { name: 'Salvar alt' }));
    await waitFor(() =>
      expect(mutate).toHaveBeenCalledWith(
        `/products/${product._id}/images/${pictures[1].id}`,
        'PATCH',
        { alt: 'Vista lateral' },
      ),
    );
    await u.click(within(second).getByRole('button', { name: 'Tornar principal' }));
    await waitFor(() =>
      expect(mutate).toHaveBeenCalledWith(
        `/products/${product._id}/images/${pictures[1].id}`,
        'PATCH',
        { isMain: true },
      ),
    );
    await u.click(within(second).getByRole('button', { name: /Mover antes/ }));
    await waitFor(() =>
      expect(mutate).toHaveBeenCalledWith(`/products/${product._id}/images/order`, 'PATCH', {
        imageIds: [pictures[1].id, pictures[0].id],
      }),
    );
  });
  it('confirma remoção por ID e recarrega estado', async () => {
    vi.spyOn(api, 'mutate').mockResolvedValue({ success: true, data: undefined });
    show();
    await screen.findByDisplayValue('Primeira');
    await userEvent.setup().click(screen.getAllByRole('button', { name: 'Remover imagem' })[0]);
    await waitFor(() => expect(api.request).toHaveBeenCalledTimes(2));
    expect(api.mutate).toHaveBeenCalledWith(
      `/products/${product._id}/images/${pictures[0].id}`,
      'DELETE',
    );
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('retido'));
  });
  it.each([
    ['As imagens mudaram. Consulte novamente e repita a operação.', 'Alteração concorrente'],
    ['Limite de 20 imagens por produto.', 'Limite atingido'],
    ['Execute a migração de IDs das imagens antigas antes de gerenciá-las.', 'Imagens antigas:'],
  ])('recarrega após 409 e distingue %s', async (error, label) => {
    vi.spyOn(api, 'mutate').mockRejectedValue(new ApiError(409, error));
    show();
    await screen.findByDisplayValue('Primeira');
    await userEvent.setup().click(screen.getAllByRole('button', { name: 'Tornar principal' })[1]);
    await screen.findByText(new RegExp(label));
    await waitFor(() => expect(api.request).toHaveBeenCalledTimes(2));
    expect(api.mutate).toHaveBeenCalledTimes(1);
  });
  it('mantém imagem antiga da categoria até substituição confirmada', async () => {
    vi.mocked(api.request).mockResolvedValue({
      success: true,
      data: { ...category, image: pictures[0] },
    });
    let resolve!: (value: unknown) => void;
    vi.spyOn(api, 'mutate').mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }) as never,
    );
    render(<Images kind="categories" id={category._id} onDirty={() => {}} onBusy={() => {}} />);
    const old = await screen.findByAltText('Primeira');
    await upload();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Confirmar substituição' }));
    expect(old).toBeInTheDocument();
    resolve({ success: true, data: pictures[1] });
    await screen.findByAltText('Segunda');
    expect(screen.queryByAltText('Primeira')).not.toBeInTheDocument();
    expect(api.mutate).toHaveBeenCalledWith(
      `/categories/${category._id}/image`,
      'PUT',
      expect.any(FormData),
    );
  });
  it('bloqueia legado e revoga URLs ao desmontar', async () => {
    const { unmount } = show();
    await screen.findByDisplayValue('Primeira');
    await upload();
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
    vi.mocked(api.request).mockResolvedValue({
      success: true,
      data: [{ url: 'https://example.com/legacy.webp' }],
    });
    show();
    await screen.findByText(/precisam de migração/);
    expect(screen.getByRole('button', { name: 'Remover imagem' })).toBeDisabled();
    expect(screen.getByLabelText('Arquivo de imagem')).toBeDisabled();
  });
});

it('remove a imagem da categoria sem excluir a categoria', async () => {
  vi.mocked(api.request).mockResolvedValue({
    success: true,
    data: { ...category, image: pictures[0] },
  });
  vi.spyOn(api, 'mutate').mockResolvedValue({ success: true, data: undefined });
  render(<Images kind="categories" id={category._id} onDirty={() => {}} onBusy={() => {}} />);
  await screen.findByAltText('Primeira');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Remover imagem' }));
  await waitFor(() =>
    expect(api.mutate).toHaveBeenCalledWith(`/categories/${category._id}/image`, 'DELETE'),
  );
  expect(api.mutate).toHaveBeenCalledTimes(1);
});

it('preserva alt editado quando há conflito e requer revisão antes de reenviar', async () => {
  vi.spyOn(api, 'mutate').mockRejectedValue(
    new ApiError(409, 'As imagens mudaram. Consulte novamente.'),
  );
  show();
  const input = await screen.findByDisplayValue('Primeira');
  const u = userEvent.setup();
  await u.clear(input);
  await u.type(input, 'Texto preservado');
  await u.click(within(input.closest('article')!).getByRole('button', { name: 'Salvar alt' }));
  await screen.findByText(/Alteração concorrente/);
  expect(input).toHaveValue('Texto preservado');
  expect(api.mutate).toHaveBeenCalledTimes(1);
});
