import { useState, type FormEvent } from 'react';
import { api } from '../api/client';
import { useMutation } from '../api/hooks';
import { Feedback, Field } from '../components/ui';
export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const mutation = useMutation();
  function submit(event: FormEvent) {
    event.preventDefault();
    void mutation.run(() => api.login(email.trim(), password));
  }
  return (
    <main className="login">
      <section className="login-story">
        <span className="brand-mark" aria-hidden="true">
          ♧
        </span>
        <p className="eyebrow">FEITAS À MÃO, COM AFETO</p>
        <h1>
          Elane<span>Velas</span>
        </h1>
        <p>
          Cuidado em cada detalhe.
          <br />
          Do primeiro aroma à próxima entrega.
        </p>
        <div className="candle-art" aria-hidden="true">
          <i />
          <b />
          <span />
        </div>
        <small>SEU ESPAÇO DE GESTÃO</small>
      </section>
      <section className="login-panel">
        <div>
          <p className="eyebrow">BEM-VINDA AO ATELIÊ</p>
          <h2>Acesse seu painel</h2>
          <p>Entre com sua conta de administração.</p>
          <Feedback error={mutation.error || api.notice} />
          <form onSubmit={submit}>
            <fieldset disabled={mutation.busy}>
              <Field label="E-mail">
                {(id) => (
                  <input
                    id={id}
                    type="email"
                    autoComplete="username"
                    required
                    maxLength={254}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                )}
              </Field>
              <Field label="Senha">
                {(id) => (
                  <input
                    id={id}
                    type="password"
                    autoComplete="current-password"
                    required
                    minLength={8}
                    maxLength={128}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                )}
              </Field>
              <button className="primary wide">
                {mutation.busy ? 'Entrando…' : 'Entrar no painel →'}
              </button>
            </fieldset>
          </form>
          <p className="hint">
            Acesso exclusivo à equipe. Por segurança, recarregar a página exige um novo login.
          </p>
        </div>
      </section>
    </main>
  );
}
