# AI-Chat-Bot

The smart AI chatbot for **FlowPilot Sales & Inventory Management**.

This project provides an AI-powered backend that understands natural-language business requests, converts them into structured actions, executes those actions against the FlowPilot backend API, and returns a human-readable response.

---

## Architecture

```text
User
  ↓
AI Chatbot
  ↓
Gemini AI
  ↓
Structured Action Plan
  ↓
Action Executor
  ↓
FlowPilot Backend API
  ↓
Database
  ↓
Execution Result
  ↓
Gemini
  ↓
Human-readable Response
```

The AI does not directly access the database.

It creates structured API actions, and the Node.js action executor safely executes only supported FlowPilot API endpoints.

---

# Features

The AI can understand natural-language requests for:

### Dashboard

- Business summary
- Dashboard alerts
- Recent transactions

### Products

- Search products
- View product details
- Create products
- Update products
- Delete products
- Check stock
- Adjust stock
- Find low-stock products
- Find out-of-stock products

### Categories

- List categories
- Create categories
- Update categories
- Delete categories

### Customers

- Search customers
- View customer details
- Create customers
- Update customers
- Delete customers

### Sales

- View sales
- View individual sales
- Create sales

### Invoices

- List invoices
- View invoice details
- Record invoice payments
- Cancel invoices

### Company

- View company information
- Update company information

### Ledger

- View ledger transactions

### Reports

- Sales summary
- Revenue trends
- Payment breakdown
- Product performance
- Inventory valuation
- Customer performance
- Cash flow
- Receivables aging

### Authentication

- Get current user
- Logout
- Change password

---

# Requirements

Make sure the following are installed:

- Node.js
- npm
- FlowPilot Backend API
- Gemini API key

The FlowPilot backend should normally be running on:

```text
http://localhost:4000
```

The AI backend runs on:

```text
http://localhost:3000
```

---

# Installation

## 1. Clone the project

```bash
git clone <repository-url>
cd AI-Chat-Bot
```

---

## 2. Initialize Node

If `package.json` does not already exist:

```bash
npm init -y
```

---

## 3. Install dependencies

```bash
npm install express cors dotenv @google/genai
```

---

# Environment Configuration

Create a `.env` file in the project root.

```env
GEMINI_API_KEY=AIzaSyxxxxxxxxxxxxxxxx

FLOWPILOT_API_URL=http://localhost:4000

PORT=3000
```

There is deliberately **no** token in the environment. The AI backend acts on
behalf of the signed-in user and forwards that user's bearer token per request
(see [Authentication](#authentication)).

## Environment variables

### GEMINI_API_KEY

Your Google Gemini API key.

```env
GEMINI_API_KEY=your_gemini_api_key
```

### FLOWPILOT_API_URL

The URL of the FlowPilot backend API.

```env
FLOWPILOT_API_URL=http://localhost:4000
```

If your FlowPilot backend runs somewhere else, change this value.

### PORT

Port used by the AI chatbot backend.

```env
PORT=3000
```

---

# Authentication

Every request that can execute a FlowPilot API action must carry the
**initiating user's** JWT:

```http
Authorization: Bearer <current-user-jwt>
```

The AI backend:

- requires the header on `/api/chat` and `/api/execute`;
- forwards that same token, unchanged, to every FlowPilot API call it makes;
- never verifies the JWT itself — FlowPilot remains the single source of truth
  for authentication and authorization, so the user's roles and
  resource-ownership checks are enforced exactly as if they had called the API
  directly;
- never logs the token, never sends it to Gemini, and never returns it in a
  response.

There is no static `FLOWPILOT_JWT_TOKEN` and no service-account fallback. When
the token is missing, the AI backend answers `401 Missing bearer token`; when it
is invalid or expired, FlowPilot's own `401` is surfaced unchanged so the
frontend's normal re-login flow recovers. A permission denial (`403`) is passed
through unchanged too — it is never rewritten as an authentication error.

Under the Next.js BFF, the browser never handles the raw token: `proxy.js` lifts
the httpOnly session cookie into the `Authorization` header and the `/api/ai/*`
rewrite forwards it to this service.

## Getting a token for manual testing

Calling `/api/chat` directly (for example with `curl` or Postman) requires a
real JWT. Sign in to the FlowPilot backend first and reuse the returned
`data.token`:

```bash
# 1. Log in to FlowPilot and capture the token
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@flowpilot.in","password":"flowpilot123"}' \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).data.token))")

# 2. Call the AI backend as that user
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"message":"hello"}'
```

Remember that demo tokens expire after `JWT_EXPIRES_IN` (default `8h`); re-run
the login step to obtain a fresh one. If the token is missing or blank, the
endpoint answers `401 Missing bearer token`.

---

# Start the Project

Start the FlowPilot backend first.

Then start the AI backend:

```bash
node server.js
```

You should see something similar to:

```text
========================================
FlowPilot AI Backend running on http://localhost:3000
FlowPilot API: http://localhost:4000
Gemini configured: true
Auth: per-request bearer token forwarded to the FlowPilot API
========================================
```

---

# Health Check

You can check whether the AI backend is running:

```text
GET http://localhost:3000/health
```

Example response:

```json
{
  "status": "ok",
  "service": "FlowPilot AI Backend",
  "flowpilotApi": "http://localhost:4000"
}
```

---

# Chat API

## Endpoint

```text
POST http://localhost:3000/api/chat
```

## Request

```json
{
  "message": "Show me all active customers from Mumbai"
}
```

## Example

Using `curl`:

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $FLOWPILOT_USER_JWT" \
  -d '{"message":"Show me all active customers from Mumbai"}'
```

The `Authorization` header carries the **signed-in user's** JWT. Without it the
endpoint answers `401 Missing bearer token`. The AI will understand the request,
create the appropriate FlowPilot API action, execute it **as that user**, and
return the result.

---

# Natural Language Examples

You can ask questions naturally.

### Products

```text
Show me all products
```

```text
Find Parle-G
```

```text
Show me products that are out of stock
```

```text
Which products have low stock?
```

```text
Add 50 Parle-G to stock
```

---

### Customers

```text
Show all active customers
```

```text
Find Rahul
```

```text
Show me Rahul's details
```

```text
Create a customer named Rahul
```

---

### Sales

```text
Show today's sales
```

```text
How much did we sell this month?
```

```text
Show sales from last week
```

```text
Create a sale for Rahul
```

For operations that create or modify financial data, the system may request confirmation before execution.

---

### Invoices

```text
Show invoice INV-2026-001
```

```text
Show all unpaid invoices
```

```text
Rahul paid ₹5,000
```

```text
Cancel invoice INV-2026-001
```

Payment and cancellation operations require confirmation unless the request has already been explicitly confirmed.

---

### Reports

```text
How much did we sell this month?
```

```text
Show revenue for September
```

```text
Which products sold the most?
```

```text
How much inventory do we have?
```

```text
Who are our best customers?
```

```text
Show cash flow
```

```text
Who owes us money?
```

---

# Confirmation System

The AI backend separates **read operations** from **write/destructive operations**.

Read operations such as:

```text
Show today's sales
```

can execute immediately.

Operations such as:

```text
Delete product
```

```text
Cancel invoice
```

```text
Record payment
```

```text
Adjust stock
```

```text
Create sale
```

require confirmation.

The first `/api/chat` request can return:

```json
{
  "success": true,
  "executed": false,
  "requiresConfirmation": true,
  "reply": "This action will cancel invoice INV-2026-001. Please confirm.",
  "plan": {},
  "results": []
}
```

The frontend can then ask the user for confirmation.

---

# Execute Confirmed Action

Confirmed action plans can be executed through:

```text
POST http://localhost:3000/api/execute
```

Request:

```json
{
  "confirmed": true,
  "plan": {
    "intent": "cancel_invoice",
    "actions": [
      {
        "action": "cancel_invoice",
        "method": "DELETE",
        "endpoint": "/api/invoices/INV-2026-001",
        "parameters": {},
        "body": {},
        "requiresConfirmation": true,
        "reason": "User requested invoice cancellation."
      }
    ]
  }
}
```

The executor validates the endpoint again before making the request.

Like `/api/chat`, this endpoint requires `Authorization: Bearer <current-user-jwt>`
and executes the plan as that user; confirming a plan is not a way around
authentication.

---

# Action Execution

The AI does not have unrestricted access to the FlowPilot API.

The Node.js backend maintains an allowlist of supported API endpoints.

For example:

```text
GET  /api/products
POST /api/products
PUT  /api/products/{id}
DELETE /api/products/{id}

GET  /api/customers
POST /api/customers
PUT  /api/customers/{id}
DELETE /api/customers/{id}

GET  /api/sales
POST /api/sales

GET  /api/invoices
POST /api/invoices/{id}/payments
DELETE /api/invoices/{id}
```

If Gemini attempts to create an unsupported endpoint, the Node.js executor blocks the request.

This prevents the AI from calling arbitrary URLs.

---

# Multi-step Actions

The AI can perform operations that require multiple API requests.

For example:

```text
Find Parle-G and add 50 units to stock.
```

The AI can create:

```text
1. Search for Parle-G
2. Get the product ID
3. Adjust the product stock
```

The second action can reference the result of the first action using:

```text
$action[0].result.data.id
```

This allows the executor to resolve IDs dynamically instead of allowing Gemini to invent them.

---

# Security

The AI backend implements several safety measures.

### API endpoint allowlist

Gemini cannot call arbitrary URLs.

Only predefined FlowPilot API endpoints can be executed.

### Confirmation

Financial and destructive operations require confirmation.

### No invented IDs

The AI must search for an entity when its ID is unknown.

For example:

```text
Find Rahul
```

does not allow the AI to invent:

```text
CUST-001
```

### No secret exposure

The AI must never expose:

- Gemini API keys
- JWT tokens
- Passwords
- Database credentials
- Internal secrets

### Server-side calculations

Financial calculations remain controlled by the FlowPilot backend.

The AI should not fabricate:

- invoice totals
- taxes
- discounts
- stock values
- payment balances

---

# Conversation Context

The `/api/chat` endpoint can optionally receive conversation history.

Example:

```json
{
  "message": "Show his outstanding balance",
  "conversation": [
    {
      "role": "user",
      "content": "Find Rahul"
    },
    {
      "role": "assistant",
      "content": "I found Rahul."
    }
  ]
}
```

The AI can use recent conversation context to understand references such as:

```text
him
her
that product
that invoice
the same customer
```

---

# API Endpoints

## AI Backend

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/health` | AI backend health check |
| POST | `/api/chat` | Decode, execute and respond |
| POST | `/api/execute` | Execute a confirmed action plan |

---

# FlowPilot Backend

The AI backend communicates with the FlowPilot API.

Supported areas include:

```text
/api/auth
/api/company
/api/categories
/api/products
/api/customers
/api/sales
/api/invoices
/api/dashboard
/api/ledger
/api/reports
```

The exact API contract is defined by the FlowPilot backend OpenAPI documentation.

---

# Project Structure

A simple project structure is:

```text
AI-Chat-Bot/
│
├── server.js
├── package.json
├── package-lock.json
├── .env
├── .env.example
├── .gitignore
└── README.md
```

---

# Important

Never commit `.env` to Git.

Add this to `.gitignore`:

```gitignore
node_modules/
.env
```

---

# Development

Start the AI backend:

```bash
node server.js
```

For development with automatic restart, you can install nodemon:

```bash
npm install --save-dev nodemon
```

Then add a script to `package.json`:

```json
{
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  }
}
```

Run:

```bash
npm run dev
```

---

# Example End-to-End Request

User:

```text
How much did we sell this month?
```

The flow is:

```text
User
 ↓
POST /api/chat
 ↓
Gemini
 ↓
Intent: sales_summary
 ↓
GET /api/reports/sales-summary
 ↓
FlowPilot Backend
 ↓
Database
 ↓
Sales data
 ↓
Gemini
 ↓
Human-readable response
```

Example response:

```text
Your sales for this month are ₹2,45,680 across 184 transactions.
```

The exact values are always taken from the FlowPilot API response.

---

# Purpose

The goal of this project is to provide a natural-language interface for FlowPilot.

Instead of navigating through multiple screens, users can ask:

```text
"Show today's sales"

"Which products are low in stock?"

"Find Rahul"

"Create a sale for Rahul"

"Who owes us money?"

"How much did we sell last month?"

"Record ₹5,000 payment from ABC Traders"
```

The AI understands the request and translates it into safe, structured FlowPilot operations.
```

This version matches the new architecture rather than the old **“Gemini returns JSON only”** README. It also documents the important distinction between `/api/chat` and `/api/execute`.
