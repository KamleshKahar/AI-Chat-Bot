# AI-Chat-Bot
The smart AI chatbot.


Steps to START the project:

1. Initialize node:
npm init -y

2. Install Express and Google's SDK:
npm install express cors dotenv @google/genai

3. Create .env
GEMINI_API_KEY=AIzaSyxxxxxxxxxxxxxxxx

4. Start your server
node server.js

5. Test API
    a. POST http://localhost:3000/api/chat
    b. {"message": "Show me all active customers from Mumbai"}
