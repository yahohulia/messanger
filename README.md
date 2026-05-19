# Messanger

Real-time chat built on a microservice architecture. Messages are routed through RabbitMQ with durable lazy queues — offline users receive them when they reconnect, and the database serves only as a cold-storage archive.

**Stack:** Node.js · Nuxt 3 (Vue 3) · Drizzle ORM (libSQL/SQLite) · WebSockets · RabbitMQ · better-auth

## Structure

```
messanger/
├── apps/
│   ├── messaging-worker/   WebSocket server, RabbitMQ consumer, DB archiver
│   └── web-app/            Nuxt 3 frontend — auth, chat UI, real-time client
└── packages/
    └── db/                 Shared Drizzle schema
```

## Setup

**1. Install dependencies**
```bash
npm install
```

**2. Configure environment**

Copy `.env.example` to `.env` in each package and fill in the values:
- `packages/db/.env`
- `apps/messaging-worker/.env`
- `apps/web-app/.env`

**3. Run database migrations**
```bash
npm run db:migrate -w @messanger/db
```

**4. Start RabbitMQ**
```bash
docker run -d --name rabbitmq -p 5672:5672 rabbitmq
```

## Running

Open two terminals from the project root:

```bash
# Terminal 1 — frontend (http://localhost:3000)
npm run dev -w web-app

# Terminal 2 — WebSocket worker
npm run dev -w messaging-worker
```
