require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { GoogleGenAI } = require("@google/genai");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

const FLOWPILOT_API_URL =
    process.env.FLOWPILOT_API_URL || "http://localhost:4000";

const FLOWPILOT_JWT_TOKEN =
    process.env.FLOWPILOT_JWT_TOKEN;

const GEMINI_API_KEY =
    process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
    console.error("ERROR: GEMINI_API_KEY is missing");
    process.exit(1);
}

if (!FLOWPILOT_JWT_TOKEN) {
    console.warn(
        "WARNING: FLOWPILOT_JWT_TOKEN is missing. " +
        "FlowPilot API actions will fail until it is configured."
    );
}

const ai = new GoogleGenAI({
    apiKey: GEMINI_API_KEY
});


/*
|--------------------------------------------------------------------------
| FLOWPILOT API ALLOWLIST
|--------------------------------------------------------------------------
|
| Gemini is NEVER allowed to choose an arbitrary URL.
|
| Only these endpoints can be executed.
|
*/

const ALLOWED_ROUTES = [
    // System
    {
        method: "GET",
        pattern: /^\/api\/health$/
    },

    // Auth
    {
        method: "GET",
        pattern: /^\/api\/auth\/me$/
    },
    {
        method: "POST",
        pattern: /^\/api\/auth\/logout$/
    },
    {
        method: "POST",
        pattern: /^\/api\/auth\/change-password$/
    },

    // Company
    {
        method: "GET",
        pattern: /^\/api\/company$/
    },
    {
        method: "PUT",
        pattern: /^\/api\/company$/
    },

    // Categories
    {
        method: "GET",
        pattern: /^\/api\/categories$/
    },
    {
        method: "POST",
        pattern: /^\/api\/categories$/
    },
    {
        method: "PATCH",
        pattern: /^\/api\/categories\/[^/]+$/
    },
    {
        method: "DELETE",
        pattern: /^\/api\/categories\/[^/]+$/
    },

    // Products
    {
        method: "GET",
        pattern: /^\/api\/products$/
    },
    {
        method: "GET",
        pattern: /^\/api\/products\/[^/]+$/
    },
    {
        method: "POST",
        pattern: /^\/api\/products$/
    },
    {
        method: "PUT",
        pattern: /^\/api\/products\/[^/]+$/
    },
    {
        method: "DELETE",
        pattern: /^\/api\/products\/[^/]+$/
    },
    {
        method: "POST",
        pattern: /^\/api\/products\/[^/]+\/stock-adjustments$/
    },

    // Customers
    {
        method: "GET",
        pattern: /^\/api\/customers$/
    },
    {
        method: "GET",
        pattern: /^\/api\/customers\/[^/]+$/
    },
    {
        method: "POST",
        pattern: /^\/api\/customers$/
    },
    {
        method: "PUT",
        pattern: /^\/api\/customers\/[^/]+$/
    },
    {
        method: "DELETE",
        pattern: /^\/api\/customers\/[^/]+$/
    },

    // Sales
    {
        method: "GET",
        pattern: /^\/api\/sales$/
    },
    {
        method: "GET",
        pattern: /^\/api\/sales\/[^/]+$/
    },
    {
        method: "POST",
        pattern: /^\/api\/sales$/
    },

    // Invoices
    {
        method: "GET",
        pattern: /^\/api\/invoices$/
    },
    {
        method: "GET",
        pattern: /^\/api\/invoices\/[^/]+$/
    },
    {
        method: "POST",
        pattern: /^\/api\/invoices\/[^/]+\/payments$/
    },
    {
        method: "DELETE",
        pattern: /^\/api\/invoices\/[^/]+$/
    },

    // Dashboard
    {
        method: "GET",
        pattern: /^\/api\/dashboard\/summary$/
    },
    {
        method: "GET",
        pattern: /^\/api\/dashboard\/alerts$/
    },
    {
        method: "GET",
        pattern: /^\/api\/dashboard\/transactions$/
    },

    // Ledger
    {
        method: "GET",
        pattern: /^\/api\/ledger$/
    },

    // Reports
    {
        method: "GET",
        pattern: /^\/api\/reports\/sales-summary$/
    },
    {
        method: "GET",
        pattern: /^\/api\/reports\/revenue-trend$/
    },
    {
        method: "GET",
        pattern: /^\/api\/reports\/payment-breakdown$/
    },
    {
        method: "GET",
        pattern: /^\/api\/reports\/product-performance$/
    },
    {
        method: "GET",
        pattern: /^\/api\/reports\/inventory-valuation$/
    },
    {
        method: "GET",
        pattern: /^\/api\/reports\/customer-performance$/
    },
    {
        method: "GET",
        pattern: /^\/api\/reports\/cash-flow$/
    },
    {
        method: "GET",
        pattern: /^\/api\/reports\/receivables-aging$/
    }
];


/*
|--------------------------------------------------------------------------
| ACTIONS THAT REQUIRE CONFIRMATION
|--------------------------------------------------------------------------
*/

const CONFIRMATION_REQUIRED = new Set([
    "POST:/api/sales",
    "POST:/api/products",
    "POST:/api/products/*/stock-adjustments",
    "PUT:/api/products/*",
    "DELETE:/api/products/*",

    "POST:/api/customers",
    "PUT:/api/customers/*",
    "DELETE:/api/customers/*",

    "POST:/api/invoices/*/payments",
    "DELETE:/api/invoices/*",

    "PUT:/api/company",

    "POST:/api/categories",
    "PATCH:/api/categories/*",
    "DELETE:/api/categories/*",

    "POST:/api/auth/change-password"
]);


/*
|--------------------------------------------------------------------------
| HELPERS
|--------------------------------------------------------------------------
*/

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}


function isAllowedRoute(method, path) {
    return ALLOWED_ROUTES.some(route => {
        return (
            route.method === method.toUpperCase() &&
            route.pattern.test(path)
        );
    });
}


function requiresConfirmation(method, path) {
    const normalized = `${method.toUpperCase()}:${path}`;

    if (CONFIRMATION_REQUIRED.has(normalized)) {
        return true;
    }

    const wildcard = normalized
        .replace(
            /\/(products|customers|invoices|categories)\/[^/]+/g,
            "/$1/*"
        );

    if (CONFIRMATION_REQUIRED.has(wildcard)) {
        return true;
    }

    return false;
}


function safeJsonParse(text) {
    if (!text) {
        throw new Error("Gemini returned an empty response.");
    }

    let cleaned = text.trim();

    // Remove accidental markdown fences.
    cleaned = cleaned
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

    try {
        return JSON.parse(cleaned);
    } catch (error) {
        console.error("Invalid Gemini JSON:");
        console.error(cleaned);

        throw new Error(
            "Gemini returned invalid JSON."
        );
    }
}


function normalizeAction(action) {
    if (!action || typeof action !== "object") {
        return null;
    }

    const method = String(action.method || "GET").toUpperCase();

    let endpoint = action.endpoint || "";

    if (!endpoint.startsWith("/")) {
        endpoint = `/${endpoint}`;
    }

    return {
        action: action.action || "unknown",
        method,
        endpoint,
        parameters:
            action.parameters &&
            typeof action.parameters === "object"
                ? action.parameters
                : {},
        body:
            action.body &&
            typeof action.body === "object"
                ? action.body
                : {},
        requiresConfirmation:
            Boolean(action.requiresConfirmation),
        reason:
            action.reason ||
            ""
    };
}


/*
|--------------------------------------------------------------------------
| ACTION REFERENCE RESOLUTION
|--------------------------------------------------------------------------
|
| Allows one action to use the result of a previous action.
|
| Example:
|
| $action[0].result.data.id
|
*/

function getNestedValue(object, path) {
    const parts = path.split(".");

    let current = object;

    for (const part of parts) {
        if (
            current === null ||
            current === undefined
        ) {
            return undefined;
        }

        current = current[part];
    }

    return current;
}


function resolveReferences(value, actionResults) {
    if (typeof value === "string") {
        const exactMatch =
            value.match(/^\$action\[(\d+)\]\.result(?:\.(.+))?$/);

        if (exactMatch) {
            const index = Number(exactMatch[1]);
            const path = exactMatch[2];

            const result = actionResults[index];

            if (!result) {
                return value;
            }

            if (!path) {
                return result;
            }

            return getNestedValue(result, path);
        }

        // Also resolve embedded references.
        return value.replace(
            /\$action\[(\d+)\]\.result(?:\.([A-Za-z0-9_.]+))?/g,
            (match, index, path) => {
                const result = actionResults[Number(index)];

                if (!result) {
                    return match;
                }

                if (!path) {
                    return String(result);
                }

                const resolved = getNestedValue(result, path);

                return resolved === undefined
                    ? match
                    : String(resolved);
            }
        );
    }

    if (Array.isArray(value)) {
        return value.map(item =>
            resolveReferences(item, actionResults)
        );
    }

    if (
        value &&
        typeof value === "object"
    ) {
        const output = {};

        for (const [key, child] of Object.entries(value)) {
            output[key] =
                resolveReferences(child, actionResults);
        }

        return output;
    }

    return value;
}


/*
|--------------------------------------------------------------------------
| BUILD FLOWPILOT REQUEST
|--------------------------------------------------------------------------
*/

function buildRequestUrl(endpoint, parameters = {}) {
    const url =
        new URL(
            endpoint,
            FLOWPILOT_API_URL
        );

    if (
        parameters &&
        typeof parameters === "object"
    ) {
        for (const [key, value] of Object.entries(parameters)) {
            if (
                value === undefined ||
                value === null ||
                value === ""
            ) {
                continue;
            }

            if (Array.isArray(value)) {
                value.forEach(item => {
                    url.searchParams.append(
                        key,
                        String(item)
                    );
                });
            } else {
                url.searchParams.set(
                    key,
                    String(value)
                );
            }
        }
    }

    return url;
}


/*
|--------------------------------------------------------------------------
| EXECUTE ONE ACTION
|--------------------------------------------------------------------------
*/

async function executeAction(
    action,
    actionResults
) {
    const resolvedEndpoint =
        resolveReferences(
            action.endpoint,
            actionResults
        );

    const resolvedParameters =
        resolveReferences(
            action.parameters || {},
            actionResults
        );

    const resolvedBody =
        resolveReferences(
            action.body || {},
            actionResults
        );

    const method =
        String(action.method || "GET")
            .toUpperCase();

    /*
     * Security: never allow Gemini to execute
     * arbitrary endpoints.
     */

    if (
        !isAllowedRoute(
            method,
            resolvedEndpoint
        )
    ) {
        throw new Error(
            `Blocked API action: ${method} ${resolvedEndpoint}`
        );
    }

    const url =
        buildRequestUrl(
            resolvedEndpoint,
            resolvedParameters
        );

    console.log(
        `Executing: ${method} ${url.toString()}`
    );

    const headers = {
        "Content-Type": "application/json",
        "Accept": "application/json"
    };

    if (FLOWPILOT_JWT_TOKEN) {
        headers.Authorization =
            `Bearer ${FLOWPILOT_JWT_TOKEN}`;
    }

    const options = {
        method,
        headers
    };

    if (
        method !== "GET" &&
        method !== "HEAD"
    ) {
        options.body =
            JSON.stringify(
                resolvedBody
            );
    }

    const response =
        await fetch(
            url,
            options
        );

    const rawText =
        await response.text();

    let data;

    try {
        data =
            rawText
                ? JSON.parse(rawText)
                : {};
    } catch {
        data = {
            raw: rawText
        };
    }

    if (!response.ok) {
        const errorMessage =
            data?.error?.message ||
            data?.message ||
            `FlowPilot API returned HTTP ${response.status}`;

        const error = new Error(
            errorMessage
        );

        error.status =
            response.status;

        error.response =
            data;

        throw error;
    }

    return {
        status: response.status,
        data
    };
}


/*
|--------------------------------------------------------------------------
| GEMINI SYSTEM INSTRUCTION
|--------------------------------------------------------------------------
*/

const SYSTEM_INSTRUCTION = `
You are FlowPilot AI, an intelligent business assistant for the
FlowPilot Sales & Inventory Management System.

Your job is to understand natural-language business requests and
convert them into executable structured actions.

You DO NOT directly execute HTTP requests.

The Node.js backend will execute the actions you return.

IMPORTANT:
Return valid JSON only.
Never return Markdown.
Never use code fences.
Never return explanations outside JSON.

==================================================
SUPPORTED FLOWPILOT API
==================================================

Base URL:

http://localhost:4000

Available endpoints:

GET    /api/health

GET    /api/auth/me
POST   /api/auth/logout
POST   /api/auth/change-password

GET    /api/company
PUT    /api/company

GET    /api/categories
POST   /api/categories
PATCH  /api/categories/{id}
DELETE /api/categories/{id}

GET    /api/products
GET    /api/products/{id}
POST   /api/products
PUT    /api/products/{id}
DELETE /api/products/{id}
POST   /api/products/{id}/stock-adjustments

GET    /api/customers
GET    /api/customers/{id}
POST   /api/customers
PUT    /api/customers/{id}
DELETE /api/customers/{id}

GET    /api/sales
GET    /api/sales/{id}
POST   /api/sales

GET    /api/invoices
GET    /api/invoices/{id}
POST   /api/invoices/{id}/payments
DELETE /api/invoices/{id}

GET    /api/dashboard/summary
GET    /api/dashboard/alerts
GET    /api/dashboard/transactions

GET    /api/ledger

GET    /api/reports/sales-summary
GET    /api/reports/revenue-trend
GET    /api/reports/payment-breakdown
GET    /api/reports/product-performance
GET    /api/reports/inventory-valuation
GET    /api/reports/customer-performance
GET    /api/reports/cash-flow
GET    /api/reports/receivables-aging

==================================================
AVAILABLE INTENTS
==================================================

Use one of these whenever possible:

dashboard_summary
dashboard_alerts
dashboard_transactions

list_categories
create_category
update_category
delete_category

list_products
search_products
get_product
create_product
update_product
delete_product
adjust_stock

list_customers
search_customers
get_customer
create_customer
update_customer
delete_customer

list_sales
get_sale
create_sale

list_invoices
get_invoice
record_invoice_payment
cancel_invoice

get_company
update_company

list_ledger

sales_summary
revenue_trend
payment_breakdown
product_performance
inventory_valuation
customer_performance
cash_flow
receivables_aging

get_current_user
logout
change_password

unknown
general_question

==================================================
OUTPUT FORMAT
==================================================

Always return exactly:

{
  "intent": "string",
  "entities": {},
  "parameters": {},
  "actions": [],
  "missingInformation": [],
  "requiresConfirmation": false,
  "originalQuery": "string"
}

Every action must be:

{
  "action": "string",
  "method": "GET|POST|PUT|PATCH|DELETE",
  "endpoint": "/api/...",
  "parameters": {},
  "body": {},
  "requiresConfirmation": false,
  "reason": "string"
}

==================================================
CRITICAL RULE
==================================================

NEVER invent IDs.

If the user says:

"Show Rahul's details"

but Rahul's customer ID is unknown:

First search customers.

Example action:

{
  "action": "search_customers",
  "method": "GET",
  "endpoint": "/api/customers",
  "parameters": {
    "search": "Rahul"
  },
  "body": {},
  "requiresConfirmation": false,
  "reason": "Find the customer before retrieving details."
}

If a later action needs the ID from the first action,
use:

$action[0].result.data.id

or an appropriate path into the previous result.

Do NOT invent:

CUST-001
PRD-101
INV-2026-001
SALE-1001

unless the user explicitly provided that identifier.

==================================================
MULTI-STEP ACTIONS
==================================================

You may return multiple actions.

Example:

"Find Rahul and show his invoice."

Return:

1. Search customer Rahul.
2. Use the resulting customer information to locate the relevant invoice.

Another example:

"Find Parle-G and add 50 to its stock."

Return:

1. Search product Parle-G.
2. Adjust its stock using the resulting product ID.

==================================================
CONFIRMATION
==================================================

These actions are potentially destructive or financially significant:

- create sale
- create product
- update product
- delete product
- stock adjustment
- create customer
- update customer
- delete customer
- create category
- update category
- delete category
- record invoice payment
- cancel invoice
- update company
- change password

Set:

"requiresConfirmation": true

for these actions unless the user's request explicitly confirms that the action should be performed.

Read-only actions do not require confirmation.

==================================================
CONVERSATIONAL CONFIRMATION
==================================================

If the user says:

"Yes"
"Do it"
"Confirm"
"Proceed"
"Go ahead"
"Yes, cancel it"

and the previous assistant request was waiting for confirmation,
treat that as confirmation.

==================================================
PRODUCTS
==================================================

Understand:

- name
- SKU
- category
- stock
- minimum stock
- price
- MRP
- status
- active/inactive
- low stock
- out of stock

Examples:

"Show low stock products"

→ GET /api/products

Use the appropriate query parameters.

"Find Maggi"

→ GET /api/products

with a search/name parameter.

"Add 50 Parle-G to stock"

→ first find Parle-G if ID is unknown,
then POST:

/api/products/{id}/stock-adjustments

Never update stock through PUT /api/products/{id}.

==================================================
CUSTOMERS
==================================================

Understand:

- name
- phone
- email
- address
- customer ID

If the customer is not uniquely identifiable,
do not guess.

==================================================
SALES
==================================================

POST /api/sales creates a complete transaction.

The server calculates:

- subtotal
- tax
- discount
- grand total
- stock movement
- invoice
- payment
- ledger

Do NOT invent or override calculated financial values.

The backend documentation explicitly states that client-supplied subtotal,
taxAmount, discountAmount and grandTotal are ignored and recalculated
from catalogue data.

==================================================
INVOICES
==================================================

GET /api/invoices/{id}

retrieves an invoice.

POST /api/invoices/{id}/payments

records a payment.

DELETE /api/invoices/{id}

cancels an invoice.

Payments and cancellation require confirmation.

==================================================
REPORTS
==================================================

"How much did we sell this month?"

→ sales_summary

"Show revenue trend"

→ revenue_trend

"Which products sold best?"

→ product_performance

"How much inventory do we have?"

→ inventory_valuation

"Who are our best customers?"

→ customer_performance

"Show cash flow"

→ cash_flow

"Who owes us money?"

→ receivables_aging

==================================================
DATES
==================================================

Understand:

today
yesterday
this week
last week
this month
last month
this year
last year

Use dateFrom/dateTo where supported.

Use ISO date format:

YYYY-MM-DD

Do not invent dates.

==================================================
MONEY
==================================================

Understand Indian currency:

₹5000
₹5,000
Rs 5000
5000 rupees
5k
5 thousand

Convert to numeric values.

==================================================
MISSING INFORMATION
==================================================

If required information is missing, do NOT guess.

Example:

"Create a sale"

Return:

"missingInformation": [
  "customer or walk-in sale information",
  "products",
  "quantities"
]

and no executable sale action.

==================================================
AMBIGUITY
==================================================

If multiple customers/products could match,
do not automatically choose one.

Return the search action first or request clarification.

==================================================
SECURITY
==================================================

Never expose:

- JWT tokens
- API keys
- passwords
- database credentials
- internal secrets

Never attempt to bypass authorization.

==================================================
FINAL RULE
==================================================

Your output is consumed directly by a Node.js action executor.

Therefore:
- valid JSON only
- no Markdown
- no comments
- no extra text
- no unsupported endpoint
- no invented data
- no invented IDs
- no arbitrary URLs
`;


/*
|--------------------------------------------------------------------------
| PARSE USER REQUEST
|--------------------------------------------------------------------------
*/

async function decodeUserRequest(
    userMessage,
    conversation = []
) {
    const contextText =
        Array.isArray(conversation) &&
        conversation.length
            ? `
CONVERSATION HISTORY:

${conversation
    .slice(-10)
    .map(message => {
        const role =
            message.role || "user";

        const content =
            message.content ||
            message.message ||
            "";

        return `${role}: ${content}`;
    })
    .join("\n")}
`
            : "";

    const prompt = `
${contextText}

CURRENT USER REQUEST:

${userMessage}
`;

    const response =
        await ai.models.generateContent({
            model: "gemini-3.8-flash",

            config: {
                systemInstruction:
                    SYSTEM_INSTRUCTION,

                responseMimeType:
                    "application/json"
            },

            contents: prompt
        });

    return safeJsonParse(
        response.text
    );
}


/*
|--------------------------------------------------------------------------
| GENERATE FINAL HUMAN RESPONSE
|--------------------------------------------------------------------------
*/

async function generateFinalResponse(
    userMessage,
    plan,
    executionResults
) {
    const responsePrompt = `
You are the final response generator for FlowPilot.

The user asked:

${userMessage}

The AI created this action plan:

${JSON.stringify(
    plan,
    null,
    2
)}

The backend executed these actions:

${JSON.stringify(
    executionResults,
    null,
    2
)}

Respond naturally to the user.

Rules:

1. Be concise and useful.
2. Explain what actually happened.
3. Never claim an action succeeded if it failed.
4. If an API operation failed, clearly explain the failure.
5. For lists, summarize useful information instead of dumping huge JSON.
6. For financial information, preserve exact values from the API.
7. For created records, mention their returned IDs/numbers.
8. For stock operations, mention the product and resulting information when available.
9. If confirmation is required and the action was NOT executed, clearly ask for confirmation.
10. Never expose JWT tokens, API keys, internal errors, stack traces, or secrets.
11. Do not mention Gemini.
12. Do not mention the action executor.
13. Do not mention internal API endpoints.
14. Return plain text only.
`;

    const response =
        await ai.models.generateContent({
            model: "gemini-3.8-flash",

            config: {
                systemInstruction:
                    "You are the FlowPilot user-facing response generator."
            },

            contents: responsePrompt
        });

    return response.text;
}


/*
|--------------------------------------------------------------------------
| MAIN CHAT ENDPOINT
|--------------------------------------------------------------------------
*/

app.post(
    "/api/chat",
    async (req, res) => {
        try {
            const userMessage =
                req.body?.message;

            const conversation =
                req.body?.conversation || [];

            const confirmed =
                req.body?.confirmed === true;

            if (
                !userMessage ||
                typeof userMessage !== "string"
            ) {
                return res.status(400).json({
                    error:
                        "Message is required"
                });
            }

            console.log(
                "\n========================================"
            );

            console.log(
                "User:",
                userMessage
            );

            /*
             * STEP 1
             * Ask Gemini to decode the request.
             */

            const plan =
                await decodeUserRequest(
                    userMessage,
                    conversation
                );

            console.log(
                "AI Plan:",
                JSON.stringify(
                    plan,
                    null,
                    2
                )
            );

            if (
                !plan ||
                !Array.isArray(plan.actions)
            ) {
                throw new Error(
                    "AI returned an invalid action plan."
                );
            }

            /*
             * Normalize actions.
             */

            const actions =
                plan.actions
                    .map(normalizeAction)
                    .filter(Boolean);

            /*
             * STEP 2
             * Validate actions before execution.
             */

            const validationErrors = [];

            for (
                const action
                of actions
            ) {
                if (
                    !isAllowedRoute(
                        action.method,
                        action.endpoint
                    )
                ) {
                    validationErrors.push(
                        `${action.method} ${action.endpoint}`
                    );
                }
            }

            if (
                validationErrors.length
            ) {
                return res.status(400).json({
                    error:
                        "AI requested unsupported API actions.",
                    blockedActions:
                        validationErrors,
                    plan
                });
            }

            /*
             * STEP 3
             * Check confirmation.
             */

            const actionsNeedingConfirmation =
                actions.filter(action => {
                    return (
                        requiresConfirmation(
                            action.method,
                            action.endpoint
                        ) ||
                        action.requiresConfirmation
                    );
                });

            if (
                actionsNeedingConfirmation.length &&
                !confirmed
            ) {
                const confirmationPlan = {
                    ...plan,
                    actions:
                        actions.map(
                            action => ({
                                ...action,
                                requiresConfirmation:
                                    actionsNeedingConfirmation.includes(
                                        action
                                    )
                            })
                        ),
                    requiresConfirmation:
                        true
                };

                const confirmationMessage =
                    await generateFinalResponse(
                        userMessage,
                        confirmationPlan,
                        []
                    );

                return res.json({
                    success: true,

                    executed: false,

                    requiresConfirmation:
                        true,

                    reply:
                        confirmationMessage,

                    plan:
                        confirmationPlan,

                    results: []
                });
            }

            /*
             * STEP 4
             * Execute actions sequentially.
             *
             * Sequential execution is important because
             * later actions may depend on previous results.
             */

            const actionResults = [];

            for (
                let i = 0;
                i < actions.length;
                i++
            ) {
                const action =
                    actions[i];

                try {
                    const result =
                        await executeAction(
                            action,
                            actionResults
                        );

                    actionResults.push({
                        actionIndex: i,
                        success: true,
                        action,
                        result
                    });

                } catch (error) {
                    console.error(
                        `Action ${i} failed:`,
                        error
                    );

                    actionResults.push({
                        actionIndex: i,
                        success: false,
                        action,
                        error: {
                            message:
                                error.message,
                            status:
                                error.status || 500,
                            response:
                                error.response || null
                        }
                    });

                    /*
                     * Stop execution if an action fails.
                     *
                     * This prevents later dependent actions
                     * from executing with invalid data.
                     */

                    break;
                }
            }

            /*
             * STEP 5
             * Generate a human-readable response.
             */

            const finalReply =
                await generateFinalResponse(
                    userMessage,
                    plan,
                    actionResults
                );

            /*
             * STEP 6
             * Return everything useful to frontend.
             */

            const allSuccessful =
                actionResults.length ===
                    actions.length &&
                actionResults.every(
                    result =>
                        result.success
                );

            return res.json({
                success:
                    allSuccessful,

                executed: true,

                requiresConfirmation:
                    false,

                reply:
                    finalReply,

                plan: {
                    ...plan,
                    actions
                },

                results:
                    actionResults
            });

        } catch (error) {
            console.error(
                "AI Backend Error:",
                error
            );

            return res.status(500).json({
                success: false,

                error:
                    error.message ||
                    "Internal server error"
            });
        }
    }
);


/*
|--------------------------------------------------------------------------
| DIRECT ACTION EXECUTION ENDPOINT
|--------------------------------------------------------------------------
|
| Useful for frontend confirmation.
|
| Instead of sending "yes" and hoping the AI understands
| which action to execute, the frontend can send:
|
| POST /api/execute
|
| {
|   "plan": {...},
|   "confirmed": true
| }
|
*/

app.post(
    "/api/execute",
    async (req, res) => {
        try {
            const plan =
                req.body?.plan;

            const confirmed =
                req.body?.confirmed === true;

            if (!plan) {
                return res.status(400).json({
                    error:
                        "Plan is required."
                });
            }

            if (!confirmed) {
                return res.status(400).json({
                    error:
                        "Confirmation is required."
                });
            }

            if (
                !Array.isArray(
                    plan.actions
                )
            ) {
                return res.status(400).json({
                    error:
                        "Plan contains no actions."
                });
            }

            const actions =
                plan.actions
                    .map(normalizeAction)
                    .filter(Boolean);

            /*
             * Validate every endpoint again.
             */

            for (
                const action
                of actions
            ) {
                if (
                    !isAllowedRoute(
                        action.method,
                        action.endpoint
                    )
                ) {
                    return res.status(400).json({
                        error:
                            `Blocked API action: ${action.method} ${action.endpoint}`
                    });
                }
            }

            const results = [];

            for (
                let i = 0;
                i < actions.length;
                i++
            ) {
                const action =
                    actions[i];

                try {
                    const result =
                        await executeAction(
                            action,
                            results
                        );

                    results.push({
                        actionIndex: i,
                        success: true,
                        action,
                        result
                    });

                } catch (error) {
                    results.push({
                        actionIndex: i,
                        success: false,
                        action,
                        error: {
                            message:
                                error.message,
                            status:
                                error.status ||
                                500,
                            response:
                                error.response ||
                                null
                        }
                    });

                    break;
                }
            }

            return res.json({
                success:
                    results.length ===
                        actions.length &&
                    results.every(
                        item =>
                            item.success
                    ),

                executed: true,

                results
            });

        } catch (error) {
            console.error(
                "Execute Error:",
                error
            );

            return res.status(500).json({
                success: false,
                error:
                    error.message ||
                    "Execution failed"
            });
        }
    }
);


/*
|--------------------------------------------------------------------------
| HEALTH CHECK
|--------------------------------------------------------------------------
*/

app.get(
    "/health",
    (req, res) => {
        res.json({
            status: "ok",
            service:
                "FlowPilot AI Backend",
            flowpilotApi:
                FLOWPILOT_API_URL,
            timestamp:
                new Date().toISOString()
        });
    }
);


/*
|--------------------------------------------------------------------------
| START SERVER
|--------------------------------------------------------------------------
*/

app.listen(
    PORT,
    () => {
        console.log(
            "========================================"
        );

        console.log(
            `FlowPilot AI Backend running on http://localhost:${PORT}`
        );

        console.log(
            `FlowPilot API: ${FLOWPILOT_API_URL}`
        );

        console.log(
            `Gemini configured: ${Boolean(GEMINI_API_KEY)}`
        );

        console.log(
            `FlowPilot JWT configured: ${Boolean(FLOWPILOT_JWT_TOKEN)}`
        );

        console.log(
            "========================================"
        );
    }
);