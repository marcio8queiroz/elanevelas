import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { api } from './api/client';
import { Login } from './pages/Login';
import { Catalog } from './pages/Catalog';
import { Orders } from './pages/Orders';
import { Dashboard } from './pages/Dashboard';
export type Page = 'home' | 'products' | 'categories' | 'orders';
export function App() {
  useSyncExternalStore(api.subscribe, api.versionSnapshot);
  const session = api.snapshot();
  const [page, setPage] = useState<Page>('home');
  const [dirty, setDirty] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const main = useRef<HTMLElement>(null);
  useEffect(() => {
    main.current?.focus();
  }, [page, session?.user.id]);
  useEffect(() => {
    if (!session) {
      setDirty(false);
      setPage('home');
    }
  }, [session]);
  function navigate(next: Page) {
    if (next === page) return;
    if (dirty && !window.confirm('Descartar alterações não salvas?')) return;
    setDirty(false);
    setPage(next);
  }
  if (!session) return <Login />;
  return (
    <div className="shell">
      <a className="skip" href="#content">
        Pular para o conteúdo
      </a>
      <aside className="sidebar">
        <div className="brand">
          <span aria-hidden="true">♧</span>
          <strong>ElaneVelas</strong>
          <small>PAINEL ADMINISTRATIVO</small>
        </div>
        <p className="nav-label">SEU ATELIÊ</p>
        <nav aria-label="Navegação principal">
          {(
            [
              ['home', '⌂', 'Visão geral'],
              ['products', '◈', 'Produtos'],
              ['categories', '▦', 'Categorias'],
              ['orders', '▤', 'Pedidos'],
            ] as const
          ).map(([key, icon, label]) => (
            <button
              key={key}
              aria-current={page === key ? 'page' : undefined}
              onClick={() => navigate(key)}
            >
              <span aria-hidden="true">{icon}</span>
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          Pequenos detalhes.
          <br />
          <em>Grandes experiências.</em>
        </div>
        <div className="account">
          <span className="avatar" aria-hidden="true">
            {session.user.name.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <strong>{session.user.name}</strong>
            <small>Administrador</small>
          </div>
          <button
            aria-label="Sair do painel"
            disabled={leaving}
            onClick={async () => {
              if (dirty && !window.confirm('Descartar alterações não salvas e sair?')) return;
              setLeaving(true);
              await api.logout();
              setLeaving(false);
            }}
          >
            Sair
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>
            Administração <span aria-hidden="true">/</span>{' '}
            <strong>
              {
                {
                  home: 'Visão geral',
                  products: 'Produtos',
                  categories: 'Categorias',
                  orders: 'Pedidos',
                }[page]
              }
            </strong>
          </span>
          <span className="store-label">ELANEVELAS · ATELIÊ</span>
        </header>
        <main id="content" ref={main} tabIndex={-1}>
          {page === 'home' ? (
            <Dashboard navigate={navigate} />
          ) : page === 'orders' ? (
            <Orders />
          ) : (
            <Catalog key={page} kind={page} onDirty={setDirty} />
          )}
        </main>
        <footer>
          ElaneVelas <span>Feito para cuidar do seu negócio.</span>
        </footer>
      </div>
    </div>
  );
}
