require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { GoogleGenAI } = require("@google/genai");

const app = express();

app.use(cors());
app.use(express.json());

const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY
});

app.post("/api/chat", async (req, res) => {
    try {
        const userMessage = req.body.message;

        if (!userMessage) {
            return res.status(400).json({
                error: "Message is required"
            });
        }

        const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",

        config: {
            systemInstruction: `
            You are an AI query decoder.

            Your job is to understand the user's query and convert it into
            a structured JSON object.

            You MUST follow these rules:

            1. Always return valid JSON.
            2. Never return Markdown.
            3. Never return explanations outside the JSON.
            4. Do not add fields that are not defined in the schema.
            5. If information is missing, use null.
            6. Identify the user's intent.
            7. Extract relevant entities and parameters.
            8. Do not execute the user's request. Only decode it.

            Return JSON using exactly this structure:

            {
            "intent": "string",
            "entities": {},
            "parameters": {},
            "originalQuery": "string"
            }
            `},
        responseMimeType: "application/json",

        contents: userMessage
    });

        console.log("Gemini response:", response);

        res.json({
            reply: response.text
        });

    } catch (error) {
        console.error("Gemini Error:", error);

        res.status(500).json({
            error: error.message
        });
    }
});

app.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});