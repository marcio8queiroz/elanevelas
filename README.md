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
```

## Variáveis de ambiente

| Variável | Descrição | Exemplo |
| --- | --- | --- |
| `PORT` | Porta HTTP da aplicação | `3000` |
| `NODE_ENV` | Ambiente de execução | `development` |
| `MONGODB_URI` | Endereço de conexão do MongoDB | `mongodb://127.0.0.1:27017/elanevelas` |

O arquivo `.env` não é enviado ao Git. Use `.env.example` como modelo e cadastre os valores de produção diretamente no serviço de hospedagem.
