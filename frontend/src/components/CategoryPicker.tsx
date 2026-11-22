import { useState } from 'react';
import { useResource } from '../api/hooks';
import type { Category } from '../api/types';
import { Field, Loading, Feedback, Pager } from './ui';
export function CategoryPicker({
  value,
  name,
  onChange,
  required = true,
  error,
}: {
  value: string;
  name?: string;
  required?: boolean;
  error?: string;
  onChange: (value: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const list = useResource<Category[]>(
    `/categories?limit=20&page=${page}${search.trim() ? `&search=${encodeURIComponent(search.trim())}` : ''}`,
  );
  return (
    <div className="category-picker">
      <Field label="Buscar categoria">
        {(id) => (
          <input
            id={id}
            value={search}
            maxLength={100}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        )}
      </Field>
      <Field label={required ? 'Categoria *' : 'Categoria'} error={error}>
        {(id, errorId) => (
          <select
            id={id}
            required={required}
            aria-invalid={!!error}
            aria-describedby={errorId}
            value={value}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="">{required ? 'Selecione' : 'Todas'}</option>
            {value && !list.data?.data.some((c) => c._id === value) && (
              <option value={value}>{name || value}</option>
            )}
            {list.data?.data.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
                {c.isActive ? '' : ' (inativa)'}
              </option>
            ))}
          </select>
        )}
      </Field>
      {list.loading && <Loading />}
      <Feedback error={list.error} />
      {list.error && (
        <button type="button" onClick={list.reload}>
          Recarregar categorias
        </button>
      )}
      <div>
        <Pager pagination={list.data?.pagination} onPage={setPage} />
      </div>
    </div>
  );
}
