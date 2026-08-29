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

## Carrinho e lista de desejos

Todos os endpoints abaixo exigem `Authorization: Bearer <access-token>` e só
acessam os dados do próprio usuário autenticado.

| Método | Endpoint | Operação |
| --- | --- | --- |
| `GET` | `/api/v1/cart` | Consultar o carrinho |
| `POST` | `/api/v1/cart/items` | Adicionar unidades de um produto |
| `PATCH` | `/api/v1/cart/items/:productId` | Definir a quantidade absoluta |
| `DELETE` | `/api/v1/cart/items/:productId` | Remover um item |
| `DELETE` | `/api/v1/cart` | Esvaziar o carrinho |
| `GET` | `/api/v1/wishlist` | Consultar a lista de desejos |
| `POST` | `/api/v1/wishlist/items` | Adicionar um produto |
| `DELETE` | `/api/v1/wishlist/items/:productId` | Remover um produto |
| `DELETE` | `/api/v1/wishlist` | Esvaziar a lista |

Exemplos:

```bash
curl -X POST http://localhost:3000/api/v1/cart/items \
  -H 'Authorization: Bearer <access-token>' \
  -H 'Content-Type: application/json' \
  -d '{"productId":"64b000000000000000000001","quantity":2}'

curl -X PATCH http://localhost:3000/api/v1/cart/items/64b000000000000000000001 \
  -H 'Authorization: Bearer <access-token>' \
  -H 'Content-Type: application/json' \
  -d '{"quantity":3}'

curl -X POST http://localhost:3000/api/v1/wishlist/items \
  -H 'Authorization: Bearer <access-token>' \
  -H 'Content-Type: application/json' \
  -d '{"productId":"64b000000000000000000001"}'
```

No carrinho, `quantity` deve ser um número inteiro maior que zero e não pode
ultrapassar o estoque atual. Um novo `POST` para o mesmo produto soma a
quantidade enviada; `PATCH` substitui pela quantidade informada. Essas somas são
atômicas no documento do usuário para impedir itens duplicados e atualizações
perdidas. O retorno inclui `items`, `distinctItemCount`, `totalQuantity`,
`subtotal` e `updatedAt`. O subtotal usa `promotionalPrice` quando não é `null`;
caso contrário usa `price`, sempre consultados no banco.

Produtos removidos, inativos, sem estoque ou cuja quantidade passou a exceder o
estoque permanecem no carrinho, são marcados como indisponíveis por
`unavailableReason` e não entram no subtotal. Assim o cliente pode informar o
usuário sem perder silenciosamente sua seleção. A remoção de item e o
esvaziamento são idempotentes e retornam HTTP 204 mesmo se o item já não estiver
presente.

Na lista de desejos, adicionar novamente o mesmo produto é idempotente e não
cria duplicata. Produtos que depois forem removidos ou inativados são omitidos
da consulta, sem provocar erro; as operações de remoção continuam idempotentes.
As respostas de ambas as APIs usam somente campos públicos do produto e nunca
incluem o documento completo do usuário.

Entradas inválidas retornam HTTP 400, autenticação ausente, inválida ou de
usuário inativo retorna HTTP 401, e tentativa de adicionar/atualizar produto
inexistente ou inativo retorna HTTP 404. Adições bem-sucedidas retornam HTTP
201, consultas e atualizações retornam HTTP 200, e exclusões retornam HTTP 204.

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
