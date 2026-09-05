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

## Pedidos

Todos os endpoints exigem `Authorization: Bearer <access-token>`. Clientes só
enxergam seus próprios pedidos; uma tentativa de consultar o pedido de outro
cliente retorna HTTP 404, da mesma forma que um pedido inexistente. As rotas
administrativas também exigem o papel `admin` (caso contrário, HTTP 403).

| Método | Endpoint | Operação |
| --- | --- | --- |
| `POST` | `/api/v1/orders` | Criar um pedido a partir do carrinho atual |
| `GET` | `/api/v1/orders` | Listar os próprios pedidos |
| `GET` | `/api/v1/orders/:orderId` | Consultar um pedido próprio pelo ObjectId |
| `GET` | `/api/v1/admin/orders` | Listar todos os pedidos |
| `GET` | `/api/v1/admin/orders/:orderId` | Consultar qualquer pedido |
| `PATCH` | `/api/v1/admin/orders/:orderId/status` | Atualizar o estado do pedido |
| `PATCH` | `/api/v1/admin/orders/:orderId/payment-status` | Atualizar o estado do pagamento |

A criação recebe somente um endereço de entrega e um método de pagamento
simulado. O endereço é estrito, todos os campos abaixo são obrigatórios exceto
`complement`, `state` tem duas letras e o CEP aceita `00000000` ou `00000-000`.
Não envie dados reais de cartão.

```bash
curl -X POST http://localhost:3000/api/v1/orders \
  -H 'Authorization: Bearer <access-token>' \
  -H 'Content-Type: application/json' \
  -d '{
    "shippingAddress": {
      "recipientName": "Maria da Silva",
      "zipCode": "69000-000",
      "street": "Rua das Velas",
      "number": "10",
      "complement": "Casa",
      "neighborhood": "Centro",
      "city": "Manaus",
      "state": "AM"
    },
    "paymentMethod": "pix"
  }'

curl -H 'Authorization: Bearer <access-token>' \
  'http://localhost:3000/api/v1/orders?page=1&limit=10&status=pending&sort=-createdAt'

curl -H 'Authorization: Bearer <access-token>' \
  http://localhost:3000/api/v1/orders/64b000000000000000000001
```

`paymentMethod` aceita somente `pix`, `credit_card` ou `boleto`. Itens, usuário,
preços, totais e estados enviados pelo cliente são rejeitados. O servidor
recarrega os produtos, verifica existência, atividade e estoque e usa o preço
promocional quando presente. O pedido guarda snapshots do nome, SKU, imagem
principal, preço, quantidade e endereço, de modo que seu histórico não dependa
de consultas futuras aos produtos. Valores são persistidos em centavos e
expostos como números na unidade monetária. Nesta etapa `shippingAmount` e
`discountAmount` são zero e `total = subtotal + shippingAmount - discountAmount`.

O número público tem o formato `EV-` seguido de 18 caracteres hexadecimais
aleatórios, não sequenciais. Um pedido começa com `status: pending` e
`paymentStatus: pending`, e cada mudança fica em `statusHistory`. Após sucesso,
o carrinho é esvaziado e seu `updatedAt` é atualizado. Após qualquer falha, o
carrinho é preservado e nenhum pedido ou baixa parcial de estoque permanece.
Não foi adicionada chave de idempotência nesta etapa: repetir uma criação já
concluída encontra o carrinho vazio e retorna HTTP 400, sem criar duplicata.

### Concorrência e consistência

Os testes usam um MongoDB standalone em memória, que não oferece transações. A
criação faz reservas condicionais e atômicas (`stock >= quantity`) em cada
produto. Se uma reserva posterior, a criação do pedido ou a limpeza condicional
do carrinho falhar, todas as reservas anteriores são compensadas e um pedido já
criado é removido. Assim, pedidos concorrentes não vendem acima do estoque e
uma alteração concorrente do carrinho não é apagada silenciosamente. Um conflito
detectado durante essas operações retorna HTTP 409.

### Listagem, respostas e estados

As listagens aceitam `page`, `limit` (máximo 100), `status`, `paymentStatus` e
`sort`, limitado a `createdAt` e `total` (prefixe com `-` para ordem
decrescente). A listagem administrativa também aceita `user` (ObjectId),
`orderNumber`, `from` e `to` (datas válidas). Queries e corpos desconhecidos são
rejeitados. Resumos não carregam produtos nem o documento completo do usuário;
detalhes administrativos incluem somente `id`, `name` e `email` do cliente.

Estados do pedido: `pending`, `confirmed`, `processing`, `shipped`, `delivered`
e `cancelled`. Transições permitidas:

- `pending` → `confirmed` ou `cancelled`;
- `confirmed` → `processing` ou `cancelled`;
- `processing` → `shipped` ou `cancelled`;
- `shipped` → `delivered`;
- `delivered` e `cancelled` são finais.

Estados de pagamento: `pending`, `paid`, `failed` e `refunded`. Transições:

- `pending` → `paid` ou `failed`;
- `failed` → `pending` (nova tentativa simulada);
- `paid` → `refunded`;
- `refunded` é final.

Enviar novamente o estado atual é idempotente e não duplica o histórico.
Transições ou estados inválidos retornam HTTP 400. Cancelar não restaura estoque
nesta etapa; a baixa acontece somente na criação e nunca em mudanças
administrativas de estado.

Não há integração real com gateway de pagamento, dados de cartão,
transportadora, cálculo de frete, cupons, devoluções, reembolsos financeiros ou
cancelamento automático. Os estados de pagamento e reembolso são apenas
registros administrativos preparados para integrações futuras.

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
