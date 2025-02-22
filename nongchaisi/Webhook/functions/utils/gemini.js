const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.API_KEY);

class Gemini {
    async chat(cacheChatHistory, prompt) {
        // Note: From Nov 2024, the model has changed to gemini-1.5-flash for mutimodal compatible
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const chatHistory = [
            {
                role: "user",
                parts: [{ text: "สวัสดี คุณสามารถช่วยตอบคำถามของฉันได้ไหม?" }]
            },
            {
                role: "model",
                parts: [{ text: "แน่นอน! ถามมาได้เลยครับ 😊" }]
            }
        ];
        if (cacheChatHistory.length > 0) {
            chatHistory.push(...cacheChatHistory);
        }
        const chat = model.startChat({ history: chatHistory });
        const result = await chat.sendMessage(prompt);
        return result.response.text();
    }
}

module.exports = new Gemini();