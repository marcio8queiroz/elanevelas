# Elane Velas

API do projeto Elane Velas, desenvolvida com Node.js, Express e MongoDB.

## Requisitos

- Node.js 20.19 ou superior (Mongoose existente exige 20.19; Sharp exige 20.9)
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

Consultas permanecem públicas. Criação, atualização e exclusão de produtos e
categorias exigem access token de administrador.

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
  -H 'Authorization: Bearer <admin-access-token>' \
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

A criação exige endereço, método e seleção de uma cotação emitida pelo servidor.
Pedidos anteriores continuam consultáveis; novos pedidos exigem o fluxo abaixo.

### Frete, pedido e pagamento (sandbox)

1. Adicione os produtos ao carrinho autenticado.
2. Solicite `POST /api/v1/shipping/quotes` com os mesmos itens e quantidades.
3. Escolha uma opção e envie `shippingQuoteId` e `shippingServiceId` no `POST /api/v1/orders`.
4. Depois do HTTP 201, inicie `POST /api/v1/orders/:orderId/payments`.
5. Consulte `GET /api/v1/orders/:orderId/payments`; webhooks atualizam o estado local.

Todas essas rotas exigem access token e acessam somente o dono do pedido,
inclusive quando o solicitante é administrador. Pedido alheio ou inexistente
retorna 404. O webhook público é `POST /api/v1/webhooks/mercado-pago`.

Exemplo de cotação (substitua o ObjectId pelo produto do carrinho):

```json
{
  "destinationZipCode": "69000000",
  "items": [{ "productId": "64b000000000000000000001", "quantity": 2 }]
}
```

Resposta ilustrativa:

```json
{
  "success": true,
  "data": {
    "quoteId": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "expiresAt": "2026-09-05T20:10:00.000Z",
    "options": [
      { "serviceId": "1", "carrier": "Correios", "serviceName": "PAC", "price": 15.23, "estimatedDays": 4 }
    ]
  }
}
```

Exemplo de criação do pedido:

```json
{
  "shippingQuoteId": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "shippingServiceId": "1",
  "paymentMethod": "pix",
  "shippingAddress": {
    "recipientName": "Cliente Teste",
    "zipCode": "69000-000",
    "street": "Rua das Velas",
    "number": "10",
    "neighborhood": "Centro",
    "city": "Manaus",
    "state": "AM"
  }
}
```

O endereço aceita `complement` opcional. Bodies, params e queries são estritos:
campos desconhecidos, preços, dimensões, origem, totais ou estados enviados pelo
cliente são rejeitados. ObjectIds são validados antes das consultas. Itens
inexistentes retornam 404; inativos, duplicados e quantidades inválidas, 400.

A cotação usa peso em kg e dimensões em cm do Product, todos positivos. Cada
produto é enviado separadamente com `quantity` ao Melhor Envio, que calcula o
agrupamento; não há algoritmo local de empacotamento. O valor segurado utiliza o
preço atual, promocional quando disponível. A origem vem de `STORE_POSTAL_CODE`.
O adapter usa `custom_price` e `custom_delivery_time` quando presentes, filtra
opções com erro ou sem preço/prazo válido e ordena por preço crescente.

O identificador de cotação contém 24 bytes aleatórios (48 caracteres hexadecimais).
Somente seu hash SHA-256 é armazenado em ShippingQuote, junto ao usuário, CEP,
opções normalizadas e fingerprint dos itens/quantidades e `cart.revision`.
A validade é de **10 minutos**, verificada explicitamente mesmo antes da remoção
pelo índice TTL do MongoDB. A criação consulta esse registro e nunca aceita
preço/prazo reenviado pelo cliente. Não é necessário segredo de assinatura.
Qualquer mutação do carrinho incrementa sua revisão, inclusive se as quantidades
voltarem ao valor anterior. Cotação vencida, de outro usuário, CEP diferente ou
carrinho alterado retorna 400 e exige nova cotação. O preço de frete fica fixo
nesses dez minutos; alterações posteriores no catálogo exigem nova cotação para
refletir novos pesos/dimensões. O preço dos produtos é sempre recalculado no pedido.

O pedido guarda `shipping.provider`, `serviceId`, `serviceName`, `price` e
`estimatedDays`. A conversão decimal de frete para centavos rejeita valores
inválidos, precisão maior que duas casas e inteiros fora do limite seguro.
`shippingAmount = shippingInCents / 100`, e
`totalInCents = subtotalInCents + shippingInCents - discountInCents`.
Descontos continuam zero. Duas unidades de R$ 20 com frete de R$ 15,23 geram
subtotal 4000, frete 1523 e total 5523 centavos (R$ 55,23 na resposta).

### Métodos de pagamento e idempotência

PIX e boleto recebem o body abaixo; use dados de teste do provedor nas chamadas
manuais. O e-mail do pagador vem do usuário autenticado. O CPF é transmitido
somente ao provedor e não é salvo por esta integração.

```json
{
  "payer": {
    "firstName": "Cliente",
    "lastName": "Teste",
    "identification": { "type": "CPF", "number": "00000000000" }
  }
}
```

Para `paymentMethod: credit_card`, acrescente o objeto abaixo ao mesmo body:

```json
{
  "card": {
    "token": "token-gerado-pelo-sdk-oficial",
    "paymentMethodId": "visa",
    "installments": 1,
    "issuerId": "123"
  }
}
```

`issuerId` é opcional; token, bandeira e parcelas (1–12) são obrigatórios para
cartão. Gere o token com MercadoPago.js/Bricks no cliente. Número completo, CVV
e validade não são aceitos neste backend. Não há frontend nesta etapa.
Token e dados do pagador não são persistidos nem registrados em logs.

Resposta PIX ilustrativa:

```json
{
  "success": true,
  "data": {
    "paymentStatus": "pending",
    "paymentMethod": "pix",
    "qrCode": "codigo-pix-do-provedor",
    "expiresAt": "2026-09-06T20:00:00.000Z"
  }
}
```

PIX pode incluir `qrCodeBase64`; boleto inclui `ticketUrl` HTTPS do Mercado Pago.
Cartão retorna método e estado. Pagamentos recusados incluem `statusDetail`
genérico. Credenciais, chave idempotente, identificadores internos e payloads
brutos nunca integram a resposta. QR e link só são expostos enquanto pendentes.

A tentativa é iniciada **depois** da criação persistida do pedido e limpeza do
carrinho, por um endpoint separado. Falha externa não remove o pedido nem repete
estoque. Há uma tentativa por pedido nesta etapa: um UUID v4 persistido antes do
HTTP vai em `X-Idempotency-Key`; o número público vai em `external_reference`.
Um HMAC dos dados de entrada impede alterar a requisição durante um retry ambíguo;
o token original não é armazenado. O cliente precisa repetir os mesmos dados
(inclusive o token original, quando a resposta da primeira chamada foi perdida).

Uma lease atômica de 30 segundos no MongoDB impede envios concorrentes entre
instâncias; requisição concorrente retorna 409. Após queda do processo, a lease
expira e a mesma tentativa pode ser retomada. Quando já existe pagamento,
repetir POST apenas retorna seu estado. Um webhook também pode recuperar uma
criação cuja resposta HTTP foi perdida. Não há retry HTTP automático, troca de
método, nova tentativa após rejeição definitiva ou novo pedido em retry.

Order acrescenta `checkoutCompletedAt` para impedir pagamento enquanto a criação
ainda pode ser compensada. Preserva os campos anteriores e acrescenta ao pagamento `idempotencyKey`,
`inputHash`, `lease`, `leaseUntil`, `qrCode`, `qrCodeBase64`, `ticketUrl` e
`expiresAt`. São usados também `provider`, `externalPaymentId` e `paidAt` já
existentes. Não há preference nem persistência do payload do provedor.

### Webhook e transições

Cadastre a URL HTTPS pública `/api/v1/webhooks/mercado-pago` na aplicação do
Mercado Pago, para eventos **payment**. A integração valida `x-signature`
(`ts` e `v1`) por HMAC-SHA256, em comparação constante, sobre
`id:<data.id da query>;request-id:<x-request-id>;ts:<ts>;`.
O ID do body deve corresponder ao ID assinado. São aceitos timestamps em segundos
ou milissegundos com tolerância local de cinco minutos; mantenha o relógio do
servidor sincronizado. A chave vem de `MERCADO_PAGO_WEBHOOK_SECRET`.

Após autenticar, consulta `GET /v1/payments/:id` com Bearer token. O status do
body nunca determina o pagamento. Referência pública, ID da tentativa em
metadata, ID externo quando já conhecido, método, valor em centavos e moeda BRL
precisam corresponder ao pedido. Referência desconhecida é ignorada com 200;
assinatura inválida retorna 401 e divergências retornam 400. Falha confirmatória
retorna 502/503 para permitir reentrega. A resposta de sucesso contém somente
`{"success":true}`. O processamento faz uma consulta HTTP com timeout de 8s,
sem fila ou tarefas pendentes em segundo plano.

Mapeamento explícito:

| Mercado Pago | Interno |
| --- | --- |
| pending, in_process, authorized | pending |
| approved | paid |
| rejected, cancelled | failed |
| refunded | refunded |
| desconhecido, charged_back | nenhuma transição |

Para pagamentos integrados, as transições são `pending → paid/failed` e
`paid → refunded`; estados iguais não duplicam histórico. Atualização de estado,
`paidAt` e histórico ocorre em uma operação atômica com comparação do estado
anterior. Eventos fora de ordem não regridem pagamento pago ou reembolsado.
O pedido **permanece pending** após aprovação; confirmação logística continua
administrativa. Estoque não é alterado pelo webhook.

Pedidos sem tentativa integrada preservam o mapa administrativo anterior:
`pending → paid/failed`, `failed → pending`, `paid → refunded`. Após iniciar a
tentativa real, alterações administrativas de paymentStatus são bloqueadas,
inclusive concorrentes à inicialização. Cancelar pedido com tentativa integrada
também é bloqueado: esta etapa não cancela a cobrança no provedor.

Estados logísticos preservados: `pending → confirmed/cancelled`,
`confirmed → processing/cancelled`, `processing → shipped/cancelled`,
`shipped → delivered`; delivered e cancelled são finais. Repetir o estado
atual é idempotente. Listagens mantêm paginação, filtros e respostas sanitizadas.

### Concorrência, falhas e limites

A criação do pedido continua usando reservas condicionais `stock >= quantity`
em MongoDB standalone. Falha numa reserva, na persistência ou na limpeza
condicional do carrinho compensa todas as reservas anteriores e remove o pedido
criado. A limpeza compara itens e revisão para preservar mudanças concorrentes.
Como antes, essa compensação não oferece a garantia de uma transação contra
queda do processo ou falha do próprio banco durante o rollback.

Todas as chamadas externas têm timeout de oito segundos, abrangendo leitura do
body. HTTP 401/403 do provedor, rate limit, erros 5xx, timeout e falha de rede
resultam em 503. Recusas restantes, JSON inválido e respostas incompletas resultam
em 502, sem divulgar mensagens brutas. Logs operacionais incluem somente host,
status HTTP e categoria sanitizada. A configuração só é validada ao usar a
integração: falta de variável obrigatória retorna 503 com seu nome; rotas não
relacionadas continuam disponíveis. Não há retry HTTP automático.

Não há captura manual, split, assinaturas, cupons, etiquetas, rastreamento,
devoluções, operação financeira de reembolso, conciliação ou restauração de
estoque em falhas de pagamento. Não há expiração automática de pedidos nem
liberação automática das reservas. Refund recebido antes de qualquer aprovação
local é ignorado por transição inválida; esse caso e chargebacks exigem futura
conciliação. Renovação de tentativa após rejeição e recuperação de token perdido
pelo cliente não são implementadas. Uma aprovação externa pode ocorrer após
progressão logística administrativa; a tabela financeira permanece independente.

### Configuração e testes de sandbox

Não foi instalado SDK ou outra dependência. Os adapters usam `fetch` nativo do
Node.js 20 e contratos pequenos: frete `quote`, pagamento `create/get`. Serviços
aceitam adapters por argumento; controllers usam `app.locals.shippingAdapter`
e `app.locals.paymentAdapter` quando fornecidos pelos testes.

No Mercado Pago, crie uma aplicação para Bricks, configure credenciais de teste
e use pagadores/cartões de teste conforme o painel. A API é
`https://api.mercadopago.com/v1/payments`, com Bearer token, JSON e
`X-Idempotency-Key` em POST. A mesma base atende testes; **não configure credenciais
de produção** nesta etapa. Cadastre o segredo de webhook e a URL pública de teste.
PIX depende da habilitação do método na conta de teste; nenhum pagamento real foi
executado na implementação.

No Melhor Envio, crie conta e token no sandbox, com permissão `shipping-calculate`.
O adapter aceita exclusivamente `https://sandbox.melhorenvio.com.br`, usa
`POST /api/v2/me/shipment/calculate`, Bearer token e `User-Agent` com nome da loja
e e-mail de suporte. Não é preciso telefone da loja para cotação.

Documentação oficial consultada:

- [Mercado Pago: PIX via Bricks](https://www.mercadopago.com.br/developers/pt/docs/checkout-bricks/payment-brick/payment-submission/pix).
- [Mercado Pago: cartões](https://www.mercadopago.com.br/developers/en/docs/checkout-bricks/card-payment-brick/payment-submission).
- [Mercado Pago: boleto](https://www.mercadopago.com.br/developers/pt/docs/checkout-bricks/payment-brick/payment-submission/other-payment-methods).
- [Mercado Pago: autenticação de webhooks](https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks).
- [Melhor Envio: cálculo por produtos](https://docs.melhorenvio.com.br/reference/calculo-de-fretes-por-produtos).

Para verificar sem credenciais reais, execute `npm run check`, `npm test` e
`git diff --check`. Os testes usam exclusivamente mongodb-memory-server,
inicializam os índices antes de começar e não importam server.js/database.js.
O URI de configuração é substituído por um endereço sentinela inacessível;
a conexão usa somente `mongoServer.getUri()`. `fetch` global é bloqueado em cada
teste, e adapters recebem mocks locais. O binário do MongoDB pode precisar ser
baixado no primeiro uso pelo mongodb-memory-server; nenhum teste chama os
provedores de pagamento/frete. Os testes anteriores de pedidos isolam a fronteira
do serviço de frete; a nova suíte exercita cotação persistida e seleção real.

## Imagens de produtos e categorias

Somente o backend foi implementado. Configure `CLOUDINARY_CLOUD_NAME`,
`CLOUDINARY_API_KEY` e `CLOUDINARY_API_SECRET` no ambiente do servidor. Crie um
ambiente Cloudinary separado para desenvolvimento e use suas credenciais de API.
Não exponha o secret ao cliente. Não é necessário upload preset ou SDK Cloudinary.
A falta dessas variáveis afeta uploads e limpeza remota; consultas, edição de
alt, ordenação e remoção lógica continuam disponíveis.

O adapter pequeno oferece `store({ publicId, buffer }) → { url }` e
`remove({ publicId }) → void`. Usa `fetch`, `FormData`, `Blob` e `crypto` nativos
do Node.js, com autenticação assinada SHA-256 e timestamp. Os endpoints fixos são
`https://api.cloudinary.com/v1_1/<cloud>/image/upload` e `/image/destroy`;
upload usa `overwrite=false`, exclusão usa `invalidate=true` e aceita `not found`
como sucesso idempotente. Timeout de oito segundos inclui leitura da resposta;
não há retry automático de upload nem redirecionamentos HTTP. O cliente não
controla chaves, caminhos, transformações ou opções do provedor.

Dependências adicionadas: `multer` 2.3 para multipart em memória com limites e
`sharp` 0.35 para decodificação e reprocessamento real via libvips. Nenhuma
dependência anterior oferecia essas funções. Sharp requer **Node.js >=20.9**;
a implementação foi verificada em Node.js 20.19. O lockfile fixa as versões e
inclui os binários opcionais por plataforma. Não há dependência de geração de
imagens por IA. Referências oficiais consultadas:
[Cloudinary Upload API](https://cloudinary.com/documentation/image_upload_api_reference),
[assinaturas](https://cloudinary.com/documentation/authentication_signatures),
[Multer](https://expressjs.com/en/resources/middleware/multer/),
[limites do Sharp](https://sharp.pixelplumbing.com/api-constructor/) e
[remoção de metadados](https://sharp.pixelplumbing.com/api-output/).

### Contratos e autorização

Todos os caminhos usam `/api/v1`. `id` do recurso é um ObjectId; `imageId` é um
UUID estável gerado pelo servidor, independente da posição no array.

| Método | Caminho | Entrada / resposta |
| --- | --- | --- |
| POST | `/products/:id/images` | Multipart `file` e `alt` opcional; 201, lista completa de imagens |
| GET | `/products/:id/images` | Público; 200, lista completa na ordem atual |
| PATCH | `/products/:id/images/order` | JSON `{ "imageIds": ["uuid-2", "uuid-1"] }`; 200, lista ordenada |
| PATCH | `/products/:id/images/:imageId` | JSON com `alt` e/ou `isMain: true`; 200, lista completa |
| DELETE | `/products/:id/images/:imageId` | 204; imagem ausente retorna 404 |
| PUT | `/categories/:id/image` | Multipart `file` e `alt` opcional; 200, imagem substituída |
| DELETE | `/categories/:id/image` | 204, inclusive se já estiver sem imagem; categoria permanece |

As mutações exigem administrador, validado **antes de ler o multipart**.
IDs, existência e limite do produto também são verificados antes do parsing.
Queries são vazias e estritas; campos desconhecidos são rejeitados. `alt` aceita
até 200 caracteres (vazio remove o texto). Não se aceita `isMain: false`: escolha
outra principal com `true`. Ordenação exige todos os IDs do produto, exatamente
uma vez; uma lista vazia só é válida quando não há imagens. Imagem de outro
produto retorna 404 nas operações individuais. A rota estática `order` precede
o parâmetro de imagem.

Respostas usam `{ "success": true, "data": ... }`. Uma imagem pública contém
`id`, `url`, `alt`, `width`, `height`, `format` e `bytes`; imagens de produto
também contêm `isMain`. Legados podem não ter metadados ou ID até a migração.
`publicId`, revisão e registros de armazenamento não são retornados, inclusive
em consultas de catálogo, carrinho e desejos. A URL pública de entrega pode
naturalmente conter o caminho do arquivo. Não há base64 nas respostas de imagens.

**Mudança dos contratos existentes:** POST/PATCH gerais de produtos e categorias
não aceitam mais `images`/`image`, nem `publicId` ou campos internos. Primeiro
crie o recurso e depois use multipart. Todas as mutações gerais do catálogo,
inclusive exclusão completa, agora exigem admin. As consultas continuam públicas;
preços, carrinho, desejos e snapshots de pedidos preservam seus contratos.
O middleware central também deixa de expor stacks e erros brutos em qualquer
ambiente, para não vazar caminhos locais ou credenciais.

```bash
curl -X POST 'http://localhost:3000/api/v1/products/<productId>/images' \
  -H 'Authorization: Bearer <admin-access-token>' \
  -F 'file=@./vela.png;type=image/png' -F 'alt=Vela de lavanda'

curl -X PUT 'http://localhost:3000/api/v1/categories/<categoryId>/image' \
  -H 'Authorization: Bearer <admin-access-token>' \
  -F 'file=@./categoria.jpg;type=image/jpeg'

curl -X PATCH 'http://localhost:3000/api/v1/products/<productId>/images/<imageId>' \
  -H 'Authorization: Bearer <admin-access-token>' \
  -H 'Content-Type: application/json' -d '{"isMain":true,"alt":"Vista lateral"}'

curl -X PATCH 'http://localhost:3000/api/v1/products/<productId>/images/order' \
  -H 'Authorization: Bearer <admin-access-token>' \
  -H 'Content-Type: application/json' -d '{"imageIds":["<imageId-2>","<imageId-1>"]}'
```

### Formatos e limites

- Um arquivo por requisição, no campo `file`; até **5 MiB** de entrada e saída.
- Somente JPEG, PNG e WebP estáticos. SVG, GIF mesmo estático, APNG, WebP animado,
  documentos, vídeos, arquivos truncados e conteúdo não imagem são rejeitados.
- Até **8192 pixels por dimensão** e **16.000.000 pixels decodificados**.
- Assinatura binária e decodificação real determinam o formato; MIME deve
  corresponder. Nome/extensão são ignorados, portanto PNG válido chamado `.svg`
  com MIME `image/png` é aceito, mas SVG disfarçado de PNG não é.
- Saída sempre WebP com qualidade 85, orientação normalizada e sem EXIF/GPS/ICC.
  O processamento tem limite de dez segundos; não preserva os bytes originais.
- Até 20 imagens por produto. Multipart aceita um campo textual de até 800 bytes
  e nome de campo de até 32 bytes. Arquivos ou campos extras são rejeitados;
  o parser usa limite de partes 3 como sentinela para as duas partes permitidas.
- Requisições com Content-Length acima de 5 MiB + 16 KiB são rejeitadas com 413.
  Sem Content-Length, limites do parser continuam aplicados a cada parte.
  Há no máximo quatro uploads/processamentos ativos por processo, sem fila;
  saturação retorna 503. Os buffers são limitados; não há arquivos temporários.
- Não há importação por URL. Use os bytes locais no multipart.

### Schemas, imagens antigas e migração

Product mantém o array sem `_id` nos subdocumentos e acrescenta `id` UUID e
metadados opcionais. Category preserva seu objeto `image` e acrescenta os mesmos
campos, além de alt. Ambos acrescentam `imageRevision` interna (ausência equivale
a zero). `publicId` permanece interno, inclusive para os legados que já o tinham.

A migração **não roda no bootstrap nem nos endpoints**. Até executá-la, consultas
de produtos antigos continuam funcionando e mutações de suas imagens retornam
409. O script preserva URLs e todos os campos antigos, atribui UUIDs aos itens
sem ID e corrige duplicatas de ID. Mantém a primeira imagem marcada como principal
ou escolhe a primeira quando nenhuma estiver marcada. Uma comparação do array
original impede sobrescrever alterações concorrentes; conflitos são contados e
podem ser tratados repetindo o comando. Reexecuções são idempotentes. Não são
inventadas referências externas nem são excluídos arquivos antigos.

O script exige URI separada explicitamente e **não lê `.env`**, não importa
server.js/database.js e recusa `NODE_ENV=test`. Use a URI do banco que pretende
administrar, após revisar o dry-run; estes comandos não foram executados contra
o banco de desenvolvimento durante a implementação.

```bash
export IMAGE_MAINTENANCE_MONGODB_URI='mongodb://127.0.0.1:27017/banco-a-administrar'
npm run images:migrate -- --dry-run
npm run images:migrate -- --apply
```

### Concorrência, retenção e recuperação

Cada mutação compara `imageRevision` e grava o conjunto de imagens incrementando
a revisão em uma única operação MongoDB. Duas requisições com a mesma revisão
não vencem juntas: uma recebe 409 e deve consultar novamente antes de repetir.
Isso impede ultrapassar 20 imagens, perder mudanças de alt/ordem e criar múltiplas
principais, inclusive entre instâncias. A primeira imagem é principal; remover a
principal escolhe a primeira restante na ordem atual. Não há transação distribuída.

**Política de retenção:** todo arquivo publicado ou potencialmente publicado é
mantido por prazo indeterminado, mesmo após remover uma imagem, substituir imagem
de categoria ou excluir o produto/categoria completo. DELETE conclui a desvinculação
do catálogo, não a exclusão física desses arquivos. Isso protege URLs copiadas em
pedidos, inclusive pedidos criados simultaneamente à remoção e referências
compartilhadas. Arquivos legados também nunca são apagados remotamente por estas
rotas. Esta garantia depende de não apagar arquivos manualmente no Cloudinary e
de manter a conta disponível; implica custo de armazenamento acumulado.

`ImageAsset` é um registro durável pequeno, com chave gerada pelo servidor, URL,
estado, tentativas, próxima execução e lease. Não armazena secrets nem respostas
brutas. É criado **antes** do upload com estado `uploading`. Upload falho/ambíguo
ou queda do processo preservam esse registro para limpeza após quarentena de 24h;
não há reenvio automático. Antes de publicar a URL, o estado muda condicionalmente
para `retained`; um worker que já tenha assumido o registro impede publicação.
Se uma requisição pausada voltar com sucesso depois dessa limpeza, a tarefa é
reaberta e destroy é repetido; uma falha tardia rearma a quarentena. Se o banco
também estiver indisponível nesse ponto, a identidade original permanece no
registro para investigação operacional. A quarentena não é uma transação com
o provedor nem uma garantia contra atrasos externos arbitrários.

Se o banco rejeitar definitivamente a atualização (incluindo conflito de revisão),
o serviço verifica referências e tenta remover o arquivo novo. Se destroy falhar,
fica `cleanup`; nenhuma tarefa é esquecida. Uma falha de rede na gravação do banco
pode significar que a atualização foi concluída: nesse caso, mantém `retained`,
mesmo se a referência já tiver sido removida por outra requisição. Também é
possível uma queda entre a marca de retenção e a gravação do catálogo. Esses
registros permanecem retidos por segurança, identificáveis no banco, podendo
reter arquivos que nunca chegaram a ser publicados. Não há varredura destrutiva
ou reconciliação automática desses registros ambíguos.

O comando de limpeza processa até 100 registros por execução, sequencialmente,
com lease atômica de 60s, backoff exponencial a partir de dois minutos e no máximo
cinco tentativas. `destroy` com arquivo ausente é sucesso. Falha depois de destroy
mas antes da confirmação local pode repetir a exclusão com segurança. Antes de
excluir, consulta produtos, categorias e URLs dos snapshots de pedidos; qualquer
referência promove o registro a `retained`. Falha nessa consulta impede exclusão.
Somente arquivos criados no registro local são elegíveis, nunca IDs arbitrários
das imagens antigas. Use sempre credenciais do mesmo ambiente Cloudinary que
originou o registro.

```bash
# Forneça as variáveis CLOUDINARY_* no ambiente do comando, sem publicá-las.
npm run images:cleanup -- --dry-run  # contagens por estado; nenhuma chamada externa
npm run images:cleanup -- --apply    # limpeza de órfãos elegíveis
```

Agende o comando conforme a operação da loja; não há worker automático no servidor.
Registros com cinco falhas ficam `failed` e exigem intervenção, sem perder a chave.
Após corrigir a causa, um operador pode inspecionar e reabrir **um registro failed**
no banco (`imageassets`) com `state: 'cleanup'`, `attempts: 0`,
`nextAttemptAt: new Date()`, removendo `lease`/`leaseUntil`, e executar novamente
o comando. Nunca reabra registros `retained` para limpeza automática.

| HTTP | Significado nas rotas de imagens |
| --- | --- |
| 400 | Multipart, IDs, alt ou ordenação inválidos; corrupção ou dimensões excessivas |
| 401 / 403 | Sem autenticação / sem papel admin |
| 404 | Recurso ou imagem inexistente |
| 409 | Revisão concorrente, limite de imagens ou migração de IDs necessária |
| 413 | Arquivo, campo textual ou Content-Length acima dos limites |
| 415 | Formato/MIME não suportado, animação ou ausência de multipart |
| 502 | Recusa ou resposta inválida do provedor |
| 503 | Configuração ausente, timeout, indisponibilidade externa, persistência ambígua ou capacidade ocupada |
| 500 | Falha interna inesperada, como indisponibilidade ao criar o registro inicial; resposta genérica |

### Testes de imagens sem credenciais reais

Execute `npm run check`, `npm test` e `git diff --check`. As quatro novas suítes
`images`, `image-processing`, `image-provider` e `image-cleanup` usam o mesmo
mongodb-memory-server isolado. Fixtures são geradas localmente com Sharp, sem
dados pessoais. Parsing e processamento são reais; os testes de rota injetam
somente `app.locals.imageAdapter`, e os testes do adapter injetam o cliente HTTP.
O bloqueio de `fetch` externo do setup permanece ativo. Migração e limpeza são
testadas como serviços no banco temporário, sem executar o CLI contra `.env`.
Nenhum upload ou destroy manual foi executado no Cloudinary.

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
| `MERCADO_PAGO_ACCESS_TOKEN` | Credencial de teste obrigatória ao criar/consultar pagamento | vazio no exemplo |
| `MERCADO_PAGO_WEBHOOK_SECRET` | Segredo HMAC obrigatório ao receber webhook | vazio no exemplo |
| `MELHOR_ENVIO_TOKEN` | Token sandbox obrigatório para cotação | vazio no exemplo |
| `MELHOR_ENVIO_BASE_URL` | Base restrita ao sandbox | `https://sandbox.melhorenvio.com.br` |
| `STORE_POSTAL_CODE` | CEP de origem obrigatório | `69000000` |
| `STORE_NAME` | Nome no User-Agent obrigatório | `ElaneVelas Sandbox` |
| `STORE_EMAIL` | Contato técnico obrigatório | `suporte@example.com` |
| `CLOUDINARY_CLOUD_NAME` | Ambiente Cloudinary para imagens | vazio no exemplo |
| `CLOUDINARY_API_KEY` | Chave de API Cloudinary | vazio no exemplo |
| `CLOUDINARY_API_SECRET` | Secret de API, somente no servidor | vazio no exemplo |
| `IMAGE_MAINTENANCE_MONGODB_URI` | URI explícita para o CLI de migração/limpeza, sem carregar `.env` | vazio no exemplo |

O arquivo `.env` não é enviado ao Git. Use `.env.example` como modelo e cadastre os valores de produção diretamente no serviço de hospedagem.
