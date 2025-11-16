/*
* This is the "real" AI Agent Server.
* It uses Express, WebSockets (ws), Puppeteer, and the Gemini API.
*/

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
// Import the "robot" scripts
const { automateRegistration, automateDownload, automateUpdate } = require('./automation_agent.js'); 

// --- 1. Server and WebSocket Setup ---
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server }); // Attach WebSocket server
const PORT = 4000;

// This stores the 'resolve' function for a user's pending CAPTCHA
const pendingCaptchas = new Map();

// --- 2. The *REAL* ML Model (using Gemini) ---
/**
 * Analyzes user text to determine intent and extract data using the Gemini API.
 * @param {string} userQuery - The full text from the user.
 * @returns {object} - A structured JSON object with the intent and data.
 */
async function runMLModel(userQuery) {
    console.log(`[Gemini] Analyzing text: "${userQuery}"`);

    // The API key is left blank; Canvas will provide it.
    const apiKey = "AIzaSyD2AUx_2ix18gx5iqFWUh245WLewa-nNuI"; 
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

    // ---*** THIS IS THE CRITICAL FIX FOR THE DATE ***---
    const systemPrompt = `
        You are an AI agent that parses user requests for a government E-ID services platform.
        Your job is to determine the user's intent and extract all necessary information.
        The user might not provide all information at once.
        Today's date is ${new Date().toLocaleDateString('en-CA')}.
        
        Intents:
        - "register_eid": User wants to register a new E-ID. You MUST extract name, dob, gender, phone, and address.
        - "download_eid": User wants to download their E-ID. You MUST extract the 12-digit eId.
        - "update_eid": User wants to update their info. You MUST extract the 12-digit eId AND the field to update (name, phone, or address) with its new value.
        - "unknown": You cannot understand the intent, OR you are missing information.
        
        RULES:
        1. **DATE OF BIRTH (dob) IS CRITICAL:** You MUST convert any date format into 'YYYY-MM-DD'.
           Examples:
           - '1/1/2012' becomes '2012-01-01'
           - 'May 10 1998' becomes '1998-05-10'
           - '10-05-1998' becomes '1998-05-10'
        2. For "register_eid", if *any* field (name, dob, gender, phone, address) is missing, set intent to "unknown" and ask for the missing fields in 'missingInfo'.
        3. For "download_eid", if 'eId' is missing, set intent to "unknown" and ask for it.
        4. For "update_eid", if 'eId' OR the new info is missing, set intent to "unknown" and ask for it.
    `;
    // ---*** END OF FIX ***---

    // This JSON Schema *forces* Gemini to return a clean, usable object.
    const jsonSchema = {
        type: "OBJECT",
        properties: {
            "intent": { 
                "type": "STRING", 
                "enum": ["register_eid", "download_eid", "update_eid", "unknown"] 
            },
            "data": {
                "type": "OBJECT",
                "properties": {
                    "name": { "type": "STRING" },
                    "dob": { "type": "STRING", "description": "Must be in YYYY-MM-DD format" },
                    "gender": { "type": "STRING", "enum": ["Male", "Female", "Other"] },
                    "phone": { "type": "STRING" },
                    "address": { "type": "STRING" },
                    "eId": { "type": "STRING", "description": "A 12-digit number" },
                    "missingInfo": { "type": "STRING", "description": "A friendly question to ask the user to get missing info." }
                }
            }
        }
    };

    const payload = {
        contents: [{ parts: [{ text: userQuery }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: jsonSchema,
        }
    };

    try {
        // Built-in fetch (Node.js 18+)
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`Gemini API Error: ${response.statusText}`, errorBody);
            throw new Error(`Gemini API Error: ${response.statusText}`);
        }

        const result = await response.json();
        
        if (!result.candidates || !result.candidates[0].content.parts[0].text) {
             throw new Error("Invalid response structure from Gemini.");
        }
        
        const jsonText = result.candidates[0].content.parts[0].text;
        console.log('[Gemini] Received plan:', jsonText);
        return JSON.parse(jsonText);
        
    } catch (error) {
        console.error('[Gemini] Error:', error);
        return { intent: "unknown", data: { missingInfo: "My AI brain had an error. Please try again." } };
    }
}

// --- 3. The *REAL* Human-in-the-Loop (HITL) Function ---
function handleCaptchaForUser(screenshotBase64, ws) {
    console.log('[Agent Server] CAPTCHA required. Sending to user...');
    
    return new Promise((resolve, reject) => {
        ws.send(JSON.stringify({
            type: 'captcha_required',
            image: `data:image/png;base64,${screenshotBase64}`
        }));

        pendingCaptchas.set(ws, resolve);

        setTimeout(() => {
            if (pendingCaptchas.has(ws)) {
                pendingCaptchas.delete(ws);
                console.log('[Agent Server] CAPTCHA timed out.');
                reject(new Error('CAPTCHA response timed out.'));
            }
        }, 120000); // 2 minute timeout
    });
}

// --- 4. Main WebSocket Logic ---
wss.on('connection', ws => {
    console.log('[Agent Server] A user connected via WebSocket.');

    // Function to send logs back to the UI
    const sendLog = (message) => {
        ws.send(JSON.stringify({ type: 'agent_log', message: message }));
    };

    ws.on('message', async (messageBuffer) => {
        const message = JSON.parse(messageBuffer.toString());

        try {
            // --- A: User is sending a new text command ---
            if (message.type === 'user_message') {
                const userText = message.text;
                
                // 1. Run the "ML Model" to get an intent and data
                const { intent, data } = await runMLModel(userText);

                let result;
                // Create the HITL function for this specific user
                const hitl_function = (screenshot) => handleCaptchaForUser(screenshot, ws);

                // 2. Decide which script to run
                switch (intent) {
                    case 'register_eid':
                        sendLog('AI classified intent as: Register E-ID. Starting agent...');
                        result = await automateRegistration(data, hitl_function, sendLog);
                        break;
                        
                    case 'download_eid':
                        sendLog(`AI classified intent as: Download E-ID for ${data.eId}. Starting agent...`);
                        result = await automateDownload(data.eId, hitl_function, sendLog);
                        break;
                    
                    case 'update_eid':
                        sendLog(`AI classified intent as: Update E-ID for ${data.eId}. Starting agent...`);
                        result = await automateUpdate(data, hitl_function, sendLog);
                        break;
                        
                    default:
                        // AI couldn't figure it out, or info is missing
                        sendLog(`AI could not determine intent. Asking user: "${data.missingInfo}"`);
                        ws.send(JSON.stringify({ type: 'ai_reply', text: data.missingInfo || "I'm not sure what you mean. Can you be more specific?" }));
                        return; // Don't send a final result, just the AI reply
                }
                
                // 3. Send the *final* result back to the user
                ws.send(JSON.stringify({ type: 'agent_result', result }));
            }
            
            // --- B: User is sending a CAPTCHA solution ---
            else if (message.type === 'captcha_solution') {
                const pendingResolve = pendingCaptchas.get(ws);
                
                if (pendingResolve) {
                    console.log(`[Agent Server] Received CAPTCHA solution: ${message.code}`);
                    pendingResolve(message.code);
                    pendingCaptchas.delete(ws);
                }
            }
        } catch (error) {
            console.error('[Agent Server] Error processing message:', error);
            ws.send(JSON.stringify({
                type: 'agent_result',
                result: { success: false, error: error.message }
            }));
        }
    });

    ws.on('close', () => {
        console.log('[Agent Server] A user disconnected.');
        pendingCaptchas.delete(ws);
    });
});

// --- 5. Start the Server ---
server.listen(PORT, () => {
    console.log(`Your AI Agent Server is running on http://localhost:${PORT}`);
    console.log(`WebSocket server is listening on ws://localhost:${PORT}`);
});
