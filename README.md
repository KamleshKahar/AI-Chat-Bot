# AI-Chat-Bot
The smart AI chatbot.


Steps to START the project:

1. Initialize node:
npm init -y

2. Install Express and Google's SDK:
npm install express cors dotenv @google/genai

3. Create .env
GEMINI_API_KEY=AIzaSyxxxxxxxxxxxxxxxx
FLOWPILOT_API_URL=http://localhost:4000

   There is no token in .env. Every chat request carries the signed-in user's
   JWT as `Authorization: Bearer <token>`, and the AI backend forwards it to the
   FlowPilot API.

4. Start your server
node server.js

5. Test API
    a. POST http://localhost:3000/api/chat
       Header: Authorization: Bearer <current-user-jwt>
    b. {"message": "Show me all active customers from Mumbai"}
