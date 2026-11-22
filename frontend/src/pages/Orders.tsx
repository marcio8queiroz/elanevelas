import { useState } from 'react';
import { api, ApiError, query } from '../api/client';
import { useMutation, useResource } from '../api/hooks';
import type { Order } from '../api/types';
import { Badge, date, Feedback, Field, labels, Loading, money, Pager } from '../components/ui';
export function Orders() {
  const [selected, setSelected] = useState<string>();
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<Record<string, string>>({ sort: '-createdAt' });
  const [applied, setApplied] = useState(filters);
  const list = useResource<Order[]>(`/admin/orders?${query({ ...applied, page, limit: 10 })}`);
  if (selected)
    return (
      <OrderDetail
        id={selected}
        onBack={() => {
          setSelected(undefined);
          list.reload();
        }}
      />
    );
  const field = (name: string, label: string, options?: string[], type = 'text') => (
    <Field key={name} label={label}>
      {(id) =>
        options ? (
          <select
            id={id}
            value={filters[name] || ''}
            onChange={(e) => setFilters({ ...filters, [name]: e.target.value })}
          >
            <option value="">Todos</option>
            {options.map((v) => (
              <option key={v} value={v}>
                {labels[v] || v}
              </option>
            ))}
          </select>
        ) : (
          <input
            id={id}
            type={type}
            maxLength={name === 'orderNumber' ? 40 : 24}
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
          <p className="eyebrow">DO ATELIÊ PARA CADA LAR</p>
          <h1>Pedidos</h1>
          <p>Acompanhe cada entrega e o estado dos pagamentos.</p>
        </div>
      </div>
      <section className="panel">
        <form
          className="filters"
          onSubmit={(e) => {
            e.preventDefault();
            setPage(1);
            const next = { ...filters };
            for (const field of ['from', 'to']) {
              if (next[field]) next[field] = new Date(next[field]).toISOString();
            }
            setApplied(next);
          }}
        >
          {field('orderNumber', 'Número exato do pedido')}
          {field('status', 'Logística', [
            'pending',
            'confirmed',
            'processing',
            'shipped',
            'delivered',
            'cancelled',
          ])}
          {field('paymentStatus', 'Pagamento', ['pending', 'paid', 'failed', 'refunded'])}
          <button className="primary">Aplicar filtros</button>
          <details className="advanced">
            <summary>Mais filtros</summary>
            <div className="form-grid">
              {field('user', 'ID do cliente')}
              {field('from', 'Desde', undefined, 'datetime-local')}
              {field('to', 'Até', undefined, 'datetime-local')}
              <Field label="Ordenar">
                {(id) => (
                  <select
                    id={id}
                    value={filters.sort}
                    onChange={(e) => setFilters({ ...filters, sort: e.target.value })}
                  >
                    <option value="-createdAt">Mais recentes</option>
                    <option value="createdAt">Mais antigos</option>
                    <option value="total">Menor total</option>
                    <option value="-total">Maior total</option>
                  </select>
                )}
              </Field>
            </div>
          </details>
        </form>
        {list.loading ? (
          <Loading />
        ) : list.error ? (
          <>
            <Feedback error={list.error} />
            <button onClick={list.reload}>Tentar novamente</button>
          </>
        ) : !list.data?.data.length ? (
          <p className="empty">Nenhum pedido encontrado para esses filtros.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Pedido / data</th>
                  <th>Cliente</th>
                  <th>Logística</th>
                  <th>Pagamento</th>
                  <th>Total</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {list.data.data.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <strong>{o.orderNumber}</strong>
                      <small>{date(o.createdAt)}</small>
                    </td>
                    <td>{o.customer?.name || 'Cliente indisponível'}</td>
                    <td>
                      <Badge value={o.status} />
                    </td>
                    <td>
                      <Badge value={o.paymentStatus} />
                    </td>
                    <td>{money(o.total)}</td>
                    <td>
                      <button onClick={() => setSelected(o.id)}>
                        Ver detalhes<span className="sr-only"> de {o.orderNumber}</span>
                      </button>
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
export function OrderDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const resource = useResource<Order>(`/admin/orders/${id}`);
  const mutation = useMutation();
  const o = resource.data?.data;
  const transition = (value: string, payment: boolean) => {
    if (
      !window.confirm(
        payment
          ? `Registrar pagamento como “${labels[value]}”? Esta alteração é somente local; não realiza cobrança ou reembolso no provedor.`
          : `Alterar logística para “${labels[value]}”?`,
      )
    )
      return;
    void mutation.run(
      async () => {
        await api.mutate(
          `/admin/orders/${id}/${payment ? 'payment-status' : 'status'}`,
          'PATCH',
          payment ? { paymentStatus: value } : { status: value },
        );
        resource.reload();
      },
      (e) => {
        if (e instanceof ApiError && (e.status === 409 || e.status === 400)) resource.reload();
      },
    );
  };
  return (
    <>
      <button className="text-button" disabled={mutation.busy} onClick={onBack}>
        ← Voltar para pedidos
      </button>
      <Feedback error={mutation.error} success={mutation.success} />
      {resource.loading ? (
        <Loading />
      ) : resource.error ? (
        <>
          <Feedback error={resource.error} />
          <button onClick={resource.reload}>Tentar novamente</button>
        </>
      ) : (
        o && (
          <>
            <div className="page-heading">
              <div>
                <p className="eyebrow">DETALHES DO PEDIDO</p>
                <h1 className="order-number">{o.orderNumber}</h1>
                <p>
                  Criado em {date(o.createdAt)} · Atualizado em {date(o.updatedAt)}
                </p>
              </div>
            </div>
            <div className="detail-grid">
              <section className="panel">
                <h2>Logística</h2>
                <Badge value={o.status} />
                <div className="actions">
                  {o.allowedActions.statuses.map((v) => (
                    <button disabled={mutation.busy} key={v} onClick={() => transition(v, false)}>
                      {labels[v]}
                    </button>
                  ))}
                </div>
                {!o.allowedActions.statuses.length && (
                  <p className="hint">Nenhuma transição logística disponível.</p>
                )}
              </section>
              <section className="panel">
                <h2>Pagamento</h2>
                <Badge value={o.paymentStatus} />
                <p>{labels[o.paymentMethod] || o.paymentMethod}</p>
                {o.allowedActions.paymentManagedExternally ? (
                  <p className="notice">
                    Gerenciado pelo provedor. Alteração manual e cancelamento indisponíveis.
                  </p>
                ) : (
                  <>
                    <p className="hint">
                      Registro local. As ações abaixo não cobram nem reembolsam no provedor.
                    </p>
                    <div className="actions">
                      {o.allowedActions.paymentStatuses.map((v) => (
                        <button
                          key={v}
                          disabled={mutation.busy}
                          onClick={() => transition(v, true)}
                        >
                          Registrar: {labels[v]}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </section>
              <section className="panel">
                <h2>Cliente e entrega</h2>
                <p>
                  <strong>{o.customer?.name || 'Cliente indisponível'}</strong>
                  <br />
                  {o.customer?.email}
                </p>
                <address>
                  {o.shippingAddress.recipientName}
                  <br />
                  {o.shippingAddress.street}, {o.shippingAddress.number}
                  {o.shippingAddress.complement && ` · ${o.shippingAddress.complement}`}
                  <br />
                  {o.shippingAddress.neighborhood}
                  <br />
                  {o.shippingAddress.city} / {o.shippingAddress.state}
                  <br />
                  CEP {o.shippingAddress.zipCode}
                </address>
              </section>
              <section className="panel">
                <h2>Frete e valores</h2>
                {o.shipping ? (
                  <p>
                    {o.shipping.serviceName} · {o.shipping.provider}
                    <br />
                    Serviço {o.shipping.serviceId} · Prazo cotado: {o.shipping.estimatedDays} dia(s)
                    <br />
                    Cotação: {money(o.shipping.price)}
                  </p>
                ) : (
                  <p>Dados detalhados do frete indisponíveis neste pedido.</p>
                )}
                <dl>
                  <dt>Subtotal</dt>
                  <dd>{money(o.subtotal)}</dd>
                  <dt>Frete</dt>
                  <dd>{money(o.shippingAmount)}</dd>
                  <dt>Desconto</dt>
                  <dd>{money(o.discountAmount)}</dd>
                  <dt>Total</dt>
                  <dd>
                    <strong>{money(o.total)}</strong>
                  </dd>
                </dl>
              </section>
            </div>
            <section className="panel">
              <h2>Itens no momento da compra</h2>
              <p className="hint">Snapshots preservados, mesmo se o catálogo mudar.</p>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Produto / SKU</th>
                      <th>Quantidade</th>
                      <th>Preço unitário</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.items.map((item) => (
                      <tr key={item.productId}>
                        <td>
                          <div className="table-product">
                            {item.imageUrl && <img src={item.imageUrl} alt="" />}
                            <div>
                              <strong>{item.name}</strong>
                              <small>{item.sku}</small>
                            </div>
                          </div>
                        </td>
                        <td>{item.quantity}</td>
                        <td>{money(item.unitPrice)}</td>
                        <td>{money(item.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="panel">
              <h2>Histórico</h2>
              <ol className="timeline">
                {o.statusHistory.map((h, index) => (
                  <li key={`${h.changedAt}-${index}`}>
                    <span>
                      {h.type === 'order' ? 'Logística' : 'Pagamento'} ·{' '}
                      <strong>{labels[h.status] || h.status}</strong>
                    </span>
                    <small>{date(h.changedAt)}</small>
                    {h.description && <p>{h.description}</p>}
                  </li>
                ))}
              </ol>
            </section>
          </>
        )
      )}
    </>
  );
}
