import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../src/app.js';
import User from '../src/models/User.js';

const account = (overrides = {}) => ({
  name: 'Maria da Silva',
  email: 'maria@example.com',
  password: 'senha-segura-123',
  phone: '92999999999',
  ...overrides,
});

async function register(overrides = {}) {
  return request(app).post('/api/v1/auth/register').send(account(overrides));
}

describe('autenticação e perfil', () => {
  it('registra com hashes persistidos e sem expor campos sensíveis', async () => {
    const response = await register();
    expect(response.status).toBe(201);
    expect(response.body.data.accessToken).toBeTypeOf('string');
    expect(response.body.data.refreshToken).toBeTypeOf('string');
    expect(response.body.data.user).not.toHaveProperty('passwordHash');
    expect(response.body.data.user).not.toHaveProperty('refreshTokenHash');
    expect(response.body.data.user).not.toHaveProperty('cpf');

    const user = await User.findOne({ email: 'maria@example.com' })
      .select('+passwordHash +refreshTokenHash');
    expect(user.passwordHash).not.toBe(account().password);
    expect(user.refreshTokenHash).not.toBe(response.body.data.refreshToken);
  });

  it('rejeita e-mail duplicado com 409', async () => {
    await register();
    expect((await register()).status).toBe(409);
  });

  it('faz login e usa mensagem genérica para credenciais inválidas', async () => {
    await register();
    const login = await request(app).post('/api/v1/auth/login').send({
      email: 'maria@example.com', password: account().password,
    });
    expect(login.status).toBe(200);
    expect(login.body.data.accessToken).toBeTypeOf('string');

    const wrongPassword = await request(app).post('/api/v1/auth/login').send({
      email: 'maria@example.com', password: 'senha-incorreta',
    });
    const unknownEmail = await request(app).post('/api/v1/auth/login').send({
      email: 'ninguem@example.com', password: 'senha-incorreta',
    });
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
  });

  it('rotaciona refresh token e invalida o anterior', async () => {
    const registered = await register();
    const oldToken = registered.body.data.refreshToken;
    const refreshed = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: oldToken });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.data.refreshToken).not.toBe(oldToken);
    expect((await request(app).post('/api/v1/auth/refresh').send({ refreshToken: oldToken })).status).toBe(401);
  });

  it('faz logout e revoga o refresh token', async () => {
    const registered = await register();
    const refreshToken = registered.body.data.refreshToken;
    expect((await request(app).post('/api/v1/auth/logout').send({ refreshToken })).status).toBe(204);
    expect((await request(app).post('/api/v1/auth/refresh').send({ refreshToken })).status).toBe(401);
  });

  it('consulta e atualiza o próprio perfil', async () => {
    const registered = await register();
    const authorization = `Bearer ${registered.body.data.accessToken}`;
    const profile = await request(app).get('/api/v1/users/me').set('Authorization', authorization);
    expect(profile.status).toBe(200);
    expect(profile.body.data.email).toBe('maria@example.com');

    const updated = await request(app).patch('/api/v1/users/me')
      .set('Authorization', authorization)
      .send({ name: 'Maria Oliveira', phone: null });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ name: 'Maria Oliveira', phone: null });
    expect(updated.body.data).not.toHaveProperty('cpf');
  });

  it('rejeita token ausente e inválido', async () => {
    expect((await request(app).get('/api/v1/users/me')).status).toBe(401);
    expect((await request(app).get('/api/v1/users/me').set('Authorization', 'Bearer token-invalido')).status).toBe(401);
  });

  it('rejeita usuário inativo no login, perfil e refresh', async () => {
    const registered = await register();
    await User.updateOne({ email: 'maria@example.com' }, { isActive: false });
    const login = await request(app).post('/api/v1/auth/login').send({
      email: 'maria@example.com', password: account().password,
    });
    expect(login.status).toBe(401);
    expect((await request(app).get('/api/v1/users/me')
      .set('Authorization', `Bearer ${registered.body.data.accessToken}`)).status).toBe(401);
    expect((await request(app).post('/api/v1/auth/refresh')
      .send({ refreshToken: registered.body.data.refreshToken })).status).toBe(401);
  });

  it('rejeita campos internos ou desconhecidos', async () => {
    expect((await register({ role: 'admin' })).status).toBe(400);
    const registered = await register({ email: 'outra@example.com' });
    expect((await request(app).patch('/api/v1/users/me')
      .set('Authorization', `Bearer ${registered.body.data.accessToken}`)
      .send({ isActive: false })).status).toBe(400);
  });
});
