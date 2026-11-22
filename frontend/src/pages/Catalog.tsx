import { CategoryPicker } from '../components/CategoryPicker';
import { useState } from 'react';
import { api, query } from '../api/client';
import { useMutation, useResource } from '../api/hooks';
import type { Category, Product } from '../api/types';
import { Feedback, Field, Loading, Pager, money } from '../components/ui';
import { CatalogEditor } from './CatalogEditor';
export type Kind = 'products' | 'categories';
export function Catalog({ kind, onDirty }: { kind: Kind; onDirty: (dirty: boolean) => void }) {
  const [editor, setEditor] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, string>>({
    sort: kind === 'products' ? '-createdAt' : 'sortOrder',
  });
  const [applied, setApplied] = useState(filters);
  const list = useResource<(Product | Category)[]>(
    `/${kind}?${query({ ...applied, page, limit: 10 })}`,
  );
  const mutation = useMutation();
  if (editor !== null)
    return (
      <CatalogEditor
        kind={kind}
        id={editor}
        onDirty={onDirty}
        onBack={() => {
          setEditor(null);
          onDirty(false);
          list.reload();
        }}
      />
    );
  const product = kind === 'products';
  const filter = (name: string, label: string, options?: [string, string][], type = 'text') => (
    <Field key={name} label={label}>
      {(id) =>
        options ? (
          <select
            id={id}
            value={filters[name] || ''}
            onChange={(e) => setFilters({ ...filters, [name]: e.target.value })}
          >
            {options.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={id}
            type={type}
            min={type === 'number' ? 0 : undefined}
            step={type === 'number' ? '0.01' : undefined}
            maxLength={name === 'search' ? 100 : 150}
            value={filters[name] || ''}
            onChange={(e) => setFilters({ ...filters, [name]: e.target.value })}
          />
        )
      }
    </Field>
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">CATÁLOGO COM PERSONALIDADE</p>
          <h1>{product ? 'Produtos' : 'Categorias'}</h1>
          <p>
            {product
              ? 'Cuide dos aromas, dos detalhes e do estoque.'
              : 'Organize as coleções do seu ateliê.'}
          </p>
        </div>
        <button className="primary" onClick={() => setEditor('new')}>
          + {product ? 'Novo produto' : 'Nova categoria'}
        </button>
      </div>
      <section className="panel">
        <form
          className="filters"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            setApplied({ ...filters });
          }}
        >
          {filter('search', 'Buscar')}
          {filter('isActive', 'Status', [
            ['', 'Todos'],
            ['true', 'Ativos'],
            ['false', 'Inativos'],
          ])}
          {filter(
            'sort',
            'Ordenar',
            product
              ? [
                  ['-createdAt', 'Mais recentes'],
                  ['createdAt', 'Mais antigos'],
                  ['name', 'Nome A–Z'],
                  ['-name', 'Nome Z–A'],
                  ['price', 'Menor preço'],
                  ['-price', 'Maior preço'],
                  ['stock', 'Menor estoque'],
                  ['-stock', 'Maior estoque'],
                  ['-salesCount', 'Mais vendidos'],
                  ['-updatedAt', 'Atualizados'],
                ]
              : [
                  ['sortOrder', 'Ordem'],
                  ['-sortOrder', 'Ordem inversa'],
                  ['name', 'Nome A–Z'],
                  ['-name', 'Nome Z–A'],
                  ['slug', 'Slug'],
                  ['-createdAt', 'Mais recentes'],
                  ['-updatedAt', 'Atualizados'],
                ],
          )}
          <button className="primary">Aplicar filtros</button>
          {product && (
            <details className="advanced">
              <summary>Mais filtros</summary>
              <CategoryPicker
                required={false}
                value={filters.category || ''}
                onChange={(value) => setFilters({ ...filters, category: value })}
              />
              <div className="form-grid">
                {filter('fragrance', 'Fragrância')}
                {filter('minPrice', 'Preço mínimo (R$)', undefined, 'number')}
                {filter('maxPrice', 'Preço máximo (R$)', undefined, 'number')}
                {filter('inStock', 'Estoque', [
                  ['', 'Todos'],
                  ['true', 'Com estoque'],
                  ['false', 'Sem estoque'],
                ])}
                {filter('isFeatured', 'Destaque', [
                  ['', 'Todos'],
                  ['true', 'Em destaque'],
                  ['false', 'Sem destaque'],
                ])}
              </div>
            </details>
          )}
        </form>
        <Feedback error={mutation.error} success={mutation.success} />
        {list.loading ? (
          <Loading />
        ) : list.error ? (
          <>
            <Feedback error={list.error} />
            <button onClick={list.reload}>Tentar novamente</button>
          </>
        ) : !list.data?.data.length ? (
          <div className="empty">
            <h2>Nenhum registro encontrado</h2>
            <p>
              Revise os filtros ou adicione o primeiro {product ? 'produto' : 'grupo de produtos'}.
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{product ? 'Produto' : 'Categoria'}</th>
                  <th>{product ? 'Preço' : 'Ordem'}</th>
                  {product && <th>Estoque</th>}
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {list.data.data.map((item) => (
                  <tr key={item._id}>
                    <td>
                      <div className="table-product">
                        {(product ? (item as Product).images?.[0] : (item as Category).image)
                          ?.url ? (
                          <img
                            src={
                              (product ? (item as Product).images[0] : (item as Category).image)!
                                .url
                            }
                            alt=""
                          />
                        ) : (
                          <span className="placeholder" aria-hidden="true">
                            ◈
                          </span>
                        )}
                        <div>
                          <strong>{item.name}</strong>
                          <small>{product ? (item as Product).sku : item.slug}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      {product
                        ? money((item as Product).promotionalPrice ?? (item as Product).price)
                        : (item as Category).sortOrder}
                    </td>
                    {product && <td>{(item as Product).stock} un.</td>}
                    <td>
                      <span className={`badge ${item.isActive ? 'paid' : 'cancelled'}`}>
                        {item.isActive ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td>
                      <div className="actions">
                        <button onClick={() => setEditor(item._id)}>
                          Editar<span className="sr-only"> {item.name}</span>
                        </button>
                        <button
                          className="danger"
                          disabled={mutation.busy}
                          onClick={() => {
                            if (
                              window.confirm(
                                `Excluir “${item.name}”? Esta ação não pode ser desfeita. As imagens permanecerão retidas no armazenamento.`,
                              )
                            )
                              void mutation.run(async () => {
                                await api.mutate(`/${kind}/${item._id}`, 'DELETE');
                                if (list.data?.data.length === 1 && page > 1) setPage(page - 1);
                                else list.reload();
                              });
                          }}
                        >
                          Excluir<span className="sr-only"> {item.name}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager pagination={list.data?.pagination} onPage={setPage} />
      </section>
    </>
  );
}
