import { CategoryPicker } from '../components/CategoryPicker';
import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '../api/client';
import { useMutation, useResource } from '../api/hooks';
import type { Category, Product } from '../api/types';
import { Feedback, Field, Loading, useDirty } from '../components/ui';
import type { Kind } from './Catalog';
import { Images } from './Images';
type Values = Record<string, string | boolean>;
const initial: Values = {
  name: '',
  slug: '',
  description: '',
  isActive: true,
  sortOrder: '0',
  sku: '',
  shortDescription: '',
  fragrance: '',
  category: '',
  price: '',
  promotionalPrice: '',
  stock: '0',
  lowStockThreshold: '5',
  isFeatured: false,
  tags: '',
  'shipping.weightKg': '',
  'shipping.heightCm': '',
  'shipping.widthCm': '',
  'shipping.lengthCm': '',
  'specifications.weight': '',
  'specifications.burnTime': '',
  'specifications.waxType': '',
  'specifications.wickType': '',
  'specifications.containerMaterial': '',
};
function valuesOf(item: Product | Category): Values {
  const result = { ...initial };
  for (const key of Object.keys(initial)) {
    const [parent, child] = key.split('.');
    const value = child
      ? (item as unknown as Record<string, Record<string, unknown>>)[parent]?.[child]
      : (item as unknown as Record<string, unknown>)[key];
    if (value !== undefined && value !== null)
      result[key] = typeof value === 'boolean' ? value : String(value);
  }
  if ('category' in item) {
    result.category = item.category?._id || '';
    result.tags = item.tags.join(', ');
  }
  return result;
}
export function CatalogEditor({
  kind,
  id,
  onDirty,
  onBack,
}: {
  kind: Kind;
  id: string;
  onDirty: (value: boolean) => void;
  onBack: () => void;
}) {
  if (id === 'new') return <Editor kind={kind} onDirty={onDirty} onBack={onBack} />;
  return <Existing kind={kind} id={id} onDirty={onDirty} onBack={onBack} />;
}
function Existing(props: {
  kind: Kind;
  id: string;
  onDirty: (value: boolean) => void;
  onBack: () => void;
}) {
  const resource = useResource<Product | Category>(`/${props.kind}/${props.id}`);
  if (resource.loading) return <Loading />;
  if (resource.error)
    return (
      <>
        <button onClick={props.onBack}>← Voltar</button>
        <Feedback error={resource.error} />
        <button onClick={resource.reload}>Tentar novamente</button>
      </>
    );
  return <Editor {...props} item={resource.data!.data} />;
}
function Editor({
  kind,
  item,
  onDirty,
  onBack,
}: {
  kind: Kind;
  item?: Product | Category;
  onDirty: (value: boolean) => void;
  onBack: () => void;
}) {
  const [saved, setSaved] = useState(item);
  const [values, setValues] = useState<Values>(() => (item ? valuesOf(item) : { ...initial }));
  const [baseline, setBaseline] = useState(() => JSON.stringify(item ? valuesOf(item) : initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [imageDirty, setImageDirty] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const mutation = useMutation();
  const dirty = JSON.stringify(values) !== baseline || imageDirty;
  useDirty(dirty);
  useEffect(() => {
    onDirty(dirty || mutation.busy || imageBusy);
  }, [dirty, mutation.busy, imageBusy, onDirty]);
  const product = kind === 'products';
  const set = (key: string, value: string | boolean) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: '' }));
  };
  const field = (
    key: string,
    label: string,
    options: {
      required?: boolean;
      max?: number;
      type?: string;
      step?: string;
      min?: number;
      textarea?: boolean;
    } = {},
  ) => (
    <Field key={key} label={`${label}${options.required ? ' *' : ''}`} error={errors[key]}>
      {(id, errorId) =>
        options.textarea ? (
          <textarea
            id={id}
            value={String(values[key])}
            required={options.required}
            maxLength={options.max}
            aria-invalid={!!errors[key]}
            aria-describedby={errorId}
            onChange={(e) => set(key, e.target.value)}
          />
        ) : (
          <input
            id={id}
            type={options.type || 'text'}
            value={String(values[key])}
            required={options.required}
            maxLength={options.max}
            min={options.min}
            step={options.step}
            aria-invalid={!!errors[key]}
            aria-describedby={errorId}
            onChange={(e) => set(key, e.target.value)}
          />
        )
      }
    </Field>
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    const numeric = product
      ? [
          'price',
          'promotionalPrice',
          'stock',
          'lowStockThreshold',
          'shipping.weightKg',
          'shipping.heightCm',
          'shipping.widthCm',
          'shipping.lengthCm',
          'specifications.weight',
          'specifications.burnTime',
        ]
      : ['sortOrder'];
    const invalid: Record<string, string> = {};
    for (const key of numeric) {
      const raw = String(values[key]);
      if (
        raw !== '' &&
        (!Number.isFinite(Number(raw)) || Math.abs(Number(raw)) > Number.MAX_SAFE_INTEGER)
      )
        invalid[key] = 'Informe um número válido.';
    }
    for (const key of product ? ['price', 'promotionalPrice'] : []) {
      if (values[key] !== '' && !/^\d+(\.\d{1,2})?$/.test(String(values[key])))
        invalid[key] = 'Use até duas casas decimais.';
    }
    const tags = String(values.tags)
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    if (product && (tags.length > 30 || tags.some((t) => t.length > 50)))
      invalid.tags = 'Use até 30 tags com no máximo 50 caracteres cada.';
    if (Object.keys(invalid).length) {
      setErrors(invalid);
      return;
    }
    const payload: Record<string, unknown> = {
      name: String(values.name).trim(),
      slug: String(values.slug).trim(),
      description: String(values.description).trim(),
      isActive: values.isActive,
    };
    if (product) {
      for (const key of ['sku', 'shortDescription', 'fragrance', 'category'])
        payload[key] = String(values[key]).trim();
      for (const key of ['price', 'stock', 'lowStockThreshold']) payload[key] = Number(values[key]);
      payload.promotionalPrice =
        values.promotionalPrice === '' ? null : Number(values.promotionalPrice);
      payload.isFeatured = values.isFeatured;
      payload.tags = tags;
      payload.shipping = Object.fromEntries(
        ['weightKg', 'heightCm', 'widthCm', 'lengthCm'].map((k) => [
          k,
          Number(values[`shipping.${k}`]),
        ]),
      );
      payload.specifications = Object.fromEntries(
        ['weight', 'burnTime', 'waxType', 'wickType', 'containerMaterial']
          .filter((k) => values[`specifications.${k}`] !== '')
          .map((k) => [
            k,
            ['weight', 'burnTime'].includes(k)
              ? Number(values[`specifications.${k}`])
              : String(values[`specifications.${k}`]).trim(),
          ]),
      );
    } else payload.sortOrder = Number(values.sortOrder);
    await mutation.run(
      async () => {
        const response = await api.mutate<Product | Category>(
          `/${kind}${saved ? `/${saved._id}` : ''}`,
          saved ? 'PATCH' : 'POST',
          payload,
        );
        setSaved(response.data);
        setBaseline(JSON.stringify(values));
        setErrors({});
      },
      (e) => {
        if (e instanceof ApiError && e.status === 400) {
          const fields: Record<string, string> = {};
          for (const part of e.message.replace(/^Dados inválidos: /, '').split('; ')) {
            const separator = part.indexOf(':');
            if (separator > 0) fields[part.slice(0, separator)] = part.slice(separator + 1).trim();
          }
          setErrors(fields);
        }
      },
    );
  }
  return (
    <>
      <button
        className="text-button"
        disabled={mutation.busy || imageBusy}
        onClick={() => {
          if (!dirty || window.confirm('Descartar alterações não salvas?')) onBack();
        }}
      >
        ← Voltar para {product ? 'produtos' : 'categorias'}
      </button>
      <div className="page-heading">
        <div>
          <p className="eyebrow">DETALHES QUE FAZEM A DIFERENÇA</p>
          <h1>
            {saved ? 'Editar' : 'Criar'} {product ? 'produto' : 'categoria'}
          </h1>
          <p>Campos com * são obrigatórios.</p>
        </div>
      </div>
      <form className="panel editor" onSubmit={submit}>
        <Feedback error={mutation.error} success={mutation.success} />
        <fieldset disabled={mutation.busy || imageBusy}>
          <h2>Informações gerais</h2>
          <div className="form-grid">
            {field('name', 'Nome', { required: true, max: product ? 150 : 80 })}
            {field('slug', 'Slug', { required: true, max: product ? 180 : 120 })}
            {product && field('sku', 'SKU', { required: true, max: 100 })}
            {product && field('fragrance', 'Fragrância', { required: true, max: 150 })}
          </div>
          {field('description', 'Descrição', {
            required: product,
            max: product ? undefined : 500,
            textarea: true,
          })}
          {product && (
            <>
              {field('shortDescription', 'Descrição curta', { max: 300, textarea: true })}
              <CategoryPicker
                error={errors.category}
                value={String(values.category)}
                name={(saved as Product)?.category?.name}
                onChange={(v) => set('category', v)}
              />
              <h2>Preço e estoque</h2>
              <div className="form-grid">
                {field('price', 'Preço (R$)', {
                  required: true,
                  type: 'number',
                  min: 0,
                  step: '0.01',
                })}
                {field('promotionalPrice', 'Preço promocional (R$)', {
                  type: 'number',
                  min: 0,
                  step: '0.01',
                })}
                {field('stock', 'Estoque (unidades)', {
                  required: true,
                  type: 'number',
                  min: 0,
                  step: '1',
                })}
                {field('lowStockThreshold', 'Alerta de estoque', {
                  required: true,
                  type: 'number',
                  min: 0,
                  step: '1',
                })}
              </div>
              <p className="hint">
                Deixe o preço promocional vazio para removê-lo. Valores em reais, com até duas casas
                decimais.
              </p>
              <h2>Frete</h2>
              <p className="hint">A cotação de frete exige peso e dimensões maiores que zero.</p>
              <div className="form-grid">
                {(['weightKg', 'heightCm', 'widthCm', 'lengthCm'] as const).map((key, index) =>
                  field(
                    `shipping.${key}`,
                    ['Peso (kg)', 'Altura (cm)', 'Largura (cm)', 'Comprimento (cm)'][index],
                    { required: true, type: 'number', min: 0, step: 'any' },
                  ),
                )}
              </div>
              <h2>Características</h2>
              <div className="form-grid">
                {field('specifications.weight', 'Peso da vela', {
                  type: 'number',
                  min: 0,
                  step: 'any',
                })}
                {field('specifications.burnTime', 'Tempo de queima', {
                  type: 'number',
                  min: 0,
                  step: 'any',
                })}
                {field('specifications.waxType', 'Tipo de cera', { max: 100 })}
                {field('specifications.wickType', 'Tipo de pavio', { max: 100 })}
                {field('specifications.containerMaterial', 'Material do recipiente', { max: 100 })}
                {field('tags', 'Tags (separadas por vírgulas)')}
              </div>
            </>
          )}
          {!product &&
            field('sortOrder', 'Ordem de exibição', { required: true, type: 'number', step: '1' })}
          <div className="checks">
            <label>
              <input
                type="checkbox"
                checked={!!values.isActive}
                onChange={(e) => set('isActive', e.target.checked)}
              />{' '}
              {product ? 'Produto ativo' : 'Categoria ativa'}
            </label>
            {product && (
              <label>
                <input
                  type="checkbox"
                  checked={!!values.isFeatured}
                  onChange={(e) => set('isFeatured', e.target.checked)}
                />{' '}
                Em destaque
              </label>
            )}
          </div>
          <div className="form-footer">
            <span>{dirty ? 'Há alterações não salvas.' : 'Tudo salvo.'}</span>
            <button className="primary">
              {mutation.busy ? 'Salvando…' : saved ? 'Salvar alterações' : 'Criar e continuar'}
            </button>
          </div>
        </fieldset>
      </form>
      {saved ? (
        <Images kind={kind} id={saved._id} onDirty={setImageDirty} onBusy={setImageBusy} />
      ) : (
        <p className="notice">
          Salve {product ? 'o produto' : 'a categoria'} para adicionar imagens.
        </p>
      )}
    </>
  );
}
