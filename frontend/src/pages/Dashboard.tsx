import { useResource } from '../api/hooks';
import type { Category, Product, Order } from '../api/types';
import { Badge, Feedback, money, Loading } from '../components/ui';
import type { Page } from '../App';
export function Dashboard({ navigate }: { navigate: (page: Page) => void }) {
  const products = useResource<Product[]>('/products?limit=1');
  const categories = useResource<Category[]>('/categories?limit=1');
  const orders = useResource<Order[]>('/admin/orders?limit=5&sort=-createdAt');
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">UM NOVO DIA NO ATELIÊ</p>
          <h1>Seu negócio, com cuidado.</h1>
          <p>Acompanhe o catálogo e as próximas entregas.</p>
        </div>
      </div>
      <section className="welcome">
        <div>
          <span className="eyebrow">CADA VELA CONTA UMA HISTÓRIA</span>
          <h2>
            Organize o ateliê.
            <br />
            Espalhe boas sensações.
          </h2>
          <p>Do catálogo aos pedidos, tudo começa por aqui.</p>
          <button className="primary" onClick={() => navigate('products')}>
            Gerenciar produtos →
          </button>
        </div>
        <div className="welcome-symbol" aria-hidden="true">
          ♧
        </div>
      </section>
      <section className="stats" aria-label="Totais da loja">
        {(
          [
            { title: 'Produtos no catálogo', resource: products, page: 'products', icon: '◈' },
            { title: 'Categorias', resource: categories, page: 'categories', icon: '▦' },
            { title: 'Pedidos registrados', resource: orders, page: 'orders', icon: '▤' },
          ] as const
        ).map(({ title, resource, page, icon }) => (
          <article className="stat" key={page}>
            <span aria-hidden="true">{icon}</span>
            <p>{title}</p>
            {resource.loading ? (
              <Loading />
            ) : resource.error ? (
              <>
                <Feedback error={resource.error} />
                <button onClick={resource.reload}>Tentar novamente</button>
              </>
            ) : (
              <strong>{resource.data?.pagination?.totalItems ?? '—'}</strong>
            )}
            <button className="text-button" onClick={() => navigate(page)}>
              Ver todos →
            </button>
          </article>
        ))}
      </section>
      <section className="panel">
        <div className="section-title">
          <div>
            <h2>Pedidos recentes</h2>
            <p>Os cinco registros mais recentes da loja.</p>
          </div>
          <button onClick={() => navigate('orders')}>Ver pedidos →</button>
        </div>
        {orders.loading ? (
          <Loading />
        ) : orders.error ? (
          <Feedback error={orders.error} />
        ) : !orders.data?.data.length ? (
          <p className="empty">Os pedidos aparecerão aqui quando forem recebidos.</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Cliente</th>
                  <th>Logística</th>
                  <th>Pagamento</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {orders.data.data.map((o) => (
                  <tr key={o.id}>
                    <td>{o.orderNumber}</td>
                    <td>{o.customer?.name || 'Cliente indisponível'}</td>
                    <td>
                      <Badge value={o.status} />
                    </td>
                    <td>
                      <Badge value={o.paymentStatus} />
                    </td>
                    <td>{money(o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
