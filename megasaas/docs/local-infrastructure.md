# Local Infrastructure

Este ambiente local sobe apenas os servicos de infraestrutura que o projeto precisa para desenvolvimento:

- PostgreSQL para o Spring Core.
- Redis para a Fase 7 do Node, onde entram filas, retries e jobs.

## Subir

Na raiz do repositorio:

```powershell
docker compose up -d
```

Verificar estado:

```powershell
docker compose ps
```

## Parar

```powershell
docker compose stop
```

Parar e remover containers, preservando dados:

```powershell
docker compose down
```

Remover tambem os volumes locais:

```powershell
docker compose down -v
```

## Variaveis Locais

Spring Core:

```env
DATABASE_URL=jdbc:postgresql://localhost:5432/megasaas
DATABASE_USERNAME=megasaas
DATABASE_PASSWORD=megasaas
CORE_PORT=8080
CORE_INTERNAL_API_TOKEN=test-token
```

Node:

```env
CORE_API_BASE_URL=http://localhost:8080
CORE_INTERNAL_API_TOKEN=test-token
CORE_TENANT_ID=11111111-1111-1111-1111-111111111111
TASKER_DEVICE_ID=22222222-2222-2222-2222-222222222222
WHATSAPP_INSTANCE_ID=default-instance
REDIS_URL=redis://localhost:6379
```

## Seed Local

Depois de subir o PostgreSQL e antes do teste completo com Node + Core:

```powershell
cd megasaas\core
psql "postgresql://megasaas:megasaas@localhost:5432/megasaas" -f src\main\resources\db\seed\local-dev.sql
```

O seed nao corre automaticamente porque contem dados de desenvolvimento e nunca deve ser aplicado em producao.
