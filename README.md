# Elane Velas

API do projeto Elane Velas, desenvolvida com Node.js, Express e MongoDB.

## Requisitos

- Node.js 20 ou superior
- Docker com Docker Compose

## Instalação

```bash
npm install
cp .env.example .env
```

Edite o arquivo `.env` caso a conexão do MongoDB ou a porta sejam diferentes do exemplo.

## Execução

Inicie primeiro o MongoDB em container:

```bash
npm run docker:mongo:up
```

O backend continua sendo executado diretamente na máquina host e se conecta ao
MongoDB em `127.0.0.1:27017`. O volume nomeado `mongodb_data` mantém os dados entre
reinicializações do container.

Para desenvolvimento, com reinicialização automática:

```bash
npm run dev
```

Para executar normalmente:

```bash
npm start
```

A API estará disponível em `http://localhost:3000`. O endpoint de verificação é:

```text
GET /api/v1/health
```

Para acompanhar os logs do banco ou encerrar os containers:

```bash
npm run docker:mongo:logs
npm run docker:mongo:down
```

## Verificação

```bash
npm run check
npm test
```

`npm test` executa testes de integração com Vitest e Supertest. A suíte inicia um
MongoDB temporário com `mongodb-memory-server`, limpa somente esse banco entre os
testes e nunca acessa nem apaga o banco configurado em `.env`.

## API de categorias e produtos

Todos os endpoints usam o prefixo `/api/v1`:

| Método | Endpoint | Operação |
| --- | --- | --- |
| `GET`, `POST` | `/categories` | Listar ou criar categorias |
| `GET`, `PATCH`, `DELETE` | `/categories/:id` | Consultar, atualizar ou excluir uma categoria |
| `GET`, `POST` | `/products` | Listar ou criar produtos |
| `GET`, `PATCH`, `DELETE` | `/products/:id` | Consultar, atualizar ou excluir um produto |

As duas listagens aceitam `page` (padrão 1), `limit` (padrão 10, máximo 100),
`sort` e `search`. Categorias também aceitam `isActive` e podem ser ordenadas por
`name`, `slug`, `sortOrder`, `createdAt` e `updatedAt`. Produtos aceitam
`category`, `fragrance`, `minPrice`, `maxPrice`, `isFeatured`, `isActive` e
`inStock`, e podem ser ordenados por `name`, `price`, `stock`, `salesCount`,
`createdAt` e `updatedAt`. Use `-` antes do campo para ordem decrescente, por
exemplo `sort=-createdAt`.

Exemplos:

```bash
curl 'http://localhost:3000/api/v1/products?page=1&limit=20&inStock=true&sort=price'

curl -X POST http://localhost:3000/api/v1/categories \
  -H 'Content-Type: application/json' \
  -d '{"name":"Velas aromáticas","slug":"velas-aromaticas","isActive":true}'
```

Corpos, parâmetros e queries são validados estritamente com Zod: campos não
reconhecidos ou internos são rejeitados, IDs são validados antes da consulta e
booleanos/números da query são convertidos. Categorias vinculadas a produtos não
podem ser excluídas. Duplicidades de campos únicos retornam HTTP 409.

## Autenticação e perfil

| Método | Endpoint | Operação |
| --- | --- | --- |
| `POST` | `/api/v1/auth/register` | Criar conta e emitir tokens |
| `POST` | `/api/v1/auth/login` | Autenticar e emitir tokens |
| `POST` | `/api/v1/auth/refresh` | Rotacionar access e refresh tokens |
| `POST` | `/api/v1/auth/logout` | Revogar o refresh token |
| `GET` | `/api/v1/users/me` | Consultar o perfil autenticado |
| `PATCH` | `/api/v1/users/me` | Atualizar nome e telefone |

Envie o access token nas rotas protegidas com o cabeçalho
`Authorization: Bearer <token>`. Registro e login retornam `accessToken` e
`refreshToken`; refresh e logout recebem `{ "refreshToken": "..." }`. Cada uso
do endpoint de refresh rotaciona o token, invalidando o anterior. Senhas e
refresh tokens são armazenados somente como hashes, e respostas nunca incluem
hashes, CPF ou campos internos de token.

## Variáveis de ambiente

| Variável | Descrição | Exemplo |
| --- | --- | --- |
| `PORT` | Porta HTTP da aplicação | `3000` |
| `NODE_ENV` | Ambiente de execução | `development` |
| `MONGODB_URI` | Endereço de conexão do MongoDB | `mongodb://127.0.0.1:27017/elanevelas` |
| `JWT_ACCESS_SECRET` | Segredo exclusivo para access tokens | valor longo e aleatório |
| `JWT_REFRESH_SECRET` | Segredo exclusivo para refresh tokens | outro valor longo e aleatório |
| `JWT_ACCESS_EXPIRES_IN` | Validade do access token | `15m` |
| `JWT_REFRESH_EXPIRES_IN` | Validade do refresh token | `7d` |

O arquivo `.env` não é enviado ao Git. Use `.env.example` como modelo e cadastre os valores de produção diretamente no serviço de hospedagem.
