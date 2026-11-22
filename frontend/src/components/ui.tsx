import { useEffect, useId, type ReactNode } from 'react';
import type { Pagination } from '../api/types';
export const money = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
export const date = (value: string) => new Date(value).toLocaleString('pt-BR');
export const labels: Record<string, string> = {
  pending: 'Pendente',
  confirmed: 'Confirmado',
  processing: 'Em preparação',
  shipped: 'Enviado',
  delivered: 'Entregue',
  cancelled: 'Cancelado',
  paid: 'Pago',
  failed: 'Falhou',
  refunded: 'Reembolsado',
  pix: 'PIX',
  credit_card: 'Cartão de crédito',
  boleto: 'Boleto',
};
export function Badge({ value }: { value: string }) {
  return <span className={`badge ${value}`}>{labels[value] || value}</span>;
}
export function Feedback({ error, success }: { error?: string; success?: string }) {
  return (
    <>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {success && (
        <p className="notice" role="status">
          {success}
        </p>
      )}
    </>
  );
}
export function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: (id: string, errorId?: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(id, error ? `${id}-error` : undefined)}
      {error && (
        <small className="field-error" id={`${id}-error`}>
          {error}
        </small>
      )}
    </div>
  );
}
export function Pager({
  pagination: p,
  onPage,
}: {
  pagination?: Pagination;
  onPage: (page: number) => void;
}) {
  if (!p) return null;
  return (
    <div className="pager">
      <span>
        {p.totalItems} resultado(s) · Página {p.page} de {Math.max(1, p.totalPages)}
      </span>
      <div>
        <button type="button" disabled={!p.hasPreviousPage} onClick={() => onPage(p.page - 1)}>
          Anterior
        </button>
        <button type="button" disabled={!p.hasNextPage} onClick={() => onPage(p.page + 1)}>
          Próxima
        </button>
      </div>
    </div>
  );
}
export function Loading() {
  return (
    <p role="status" className="empty">
      Carregando…
    </p>
  );
}
export function useDirty(dirty: boolean) {
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
}
