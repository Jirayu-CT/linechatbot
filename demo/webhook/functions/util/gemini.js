const { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const safetySettings = [
    {
        category: HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
    },
    {
        category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
    },
    {
        category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
    },
    {
        category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
    },
];

exports.chat = async (cacheChatHistory, prompt) => {
    try {
        // Note: From Nov 2024, the model has changed to gemini-1.5-flash for multimodal compatible
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const chatHistory = [
            {
                role: "user",
                parts: [{ text: "สวัสดี คุณสามารถช่วยตอบคำถามของฉันจากบริบทที่เคยถามและอ้างอิงจากคำตอบที่คุณตอบไปได้ไหม?" }]
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
        const result = await chat.sendMessage(prompt, safetySettings);
        console.log("Secsessful Gemini: Chat");
        return result.response.text();
    } catch (error) {
        console.error('Error in Gemini chat:', error.message);
        throw error;
    }
};

exports.multimodal = async (prompt, base64Image) => {
    try {
        // Note: From Nov 2024, the model has changed to gemini-1.5-flash-8b for multimodal compatible
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-8b" });
        const mimeType = "image/png";
        const imageParts = [{
            inlineData: { data: base64Image, mimeType }
        }];
        const result = await model.generateContent([prompt, ...imageParts], safetySettings);
        console.log("Secsessful Gemini: Multimodal");
        return result.response.text();
    } catch (error) {
        console.error('Error in Gemini multimodal:', error.message);
        throw error;
    }
};