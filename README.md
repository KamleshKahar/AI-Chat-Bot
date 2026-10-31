# FlowPilot — Sales & Inventory

A three-part workspace:

| Directory   | What it is |
| ----------- | ---------- |
| `backend/`  | REST API (Express 5 + MySQL + Prisma). Owns all data, the billing engine, GST splitting and the role matrix. See `backend/README.md`. |
| `frontend/` | Next.js 16 App Router UI + BFF proxy. See `frontend/README.md`. |
| `ai-backend/` | Gemini-powered chat assistant. Answers are computed by calling the FlowPilot API with the *requesting user's* JWT. |

Orchestrated for local development by `dev.mjs` (backend on 4000, frontend on 3100, ai-backend on 3000).

---

## First run

No accounts or sample data are seeded:

1. Start MySQL, then `cd backend && npm install && npm run migrate:deploy && npm start`.
2. Start the frontend (`cd frontend && npm install && npm run dev`) and open it.
3. With an empty database the app lands on **`/setup`** — a wizard that creates your first
   **administrator** account (and optionally the company letterhead printed on invoices). It only
   works while the `users` table is empty, so it cannot be replayed to mint extra admins.
4. That administrator adds the rest of the team from the **Users** screen, assigning roles
   (ADMIN / MANAGER / CASHIER / VIEWER) and resetting passwords as needed.

Verify the backend end to end with `npm run smoke-test` (in `backend/`, against a running server),
and the unit suite with `npm test`.

---

## AI chatbot

Steps to start the AI service:

1. Initialize node:
   npm init -y

2. Install Express and Google's SDK:
   npm install express cors dotenv @google/genai

3. Create .env
   GEMINI_API_KEY=AIzaSyxxxxxxxxxxxxxxxx
   FLOWPILOT_API_URL=http://localhost:4000

   There is no service token in .env. Every chat request carries the signed-in user's
   JWT as `Authorization: Bearer <token>`, and the AI backend forwards it to the
   FlowPilot API.

4. Start your server
   node server.js

5. Test API
    a. POST http://localhost:3000/api/chat
       Header: Authorization: Bearer <current-user-jwt>
    b. {"message": "Show me all active customers from Mumbai"}

   The token in (a) is a real user's JWT, not a static key. The easiest way to get
   one is to sign in to the frontend and let it handle the session. For curl work,
   create an account (via `/setup` on a fresh database, or as an admin from the
   Users screen) and exchange the credentials for a token:

   POST http://localhost:4000/api/auth/login
   {"email": "your-admin@company.com", "password": "<their password>"}
   -> use the returned `data.token`

   Without a valid `Authorization` header the endpoint answers
   `401 Missing bearer token`.
