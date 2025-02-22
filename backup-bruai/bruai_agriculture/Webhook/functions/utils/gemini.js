const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.API_KEY);

const textOnly = async (prompt) => {
    // For text-only input, use the gemini-1.5-flash-8b model
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-8b" });
    const result = await model.generateContent(prompt);
    return result.response.text();
};

const multimodal = async (imageBinary) => {
    // For text-and-image input (multimodal), use the gemini-1.5-flash-8b model
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-8b" });
    const prompt = "ช่วยบรรยายภาพนี้ให้หน่อย";
    const mimeType = "image/png";

    // Convert image binary to a GoogleGenerativeAI.Part object.
    const imageParts = [
        {
            inlineData: {
                data: Buffer.from(imageBinary, "binary").toString("base64"),
                mimeType
            }
        }
    ];

    const result = await model.generateContent([prompt, ...imageParts]);
    const text = result.response.text();
    return text;
};

const chat = async (prompt) => {
    // For text-only input, use the gemini-1.5-flash-8b model
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-8b" });
    const chat = model.startChat({
        history: [
            {
                role: "user",
                parts: [{ text: "สวัสดีจ้า" }],
            },
            {
                role: "model",
                parts: [{ text: "สวัสดีครับ ผมชื่อตี๋ ผมเป็นผู้เชี่ยวชาญเกี่ยวกับ LINE API ที่ช่วยตอบคำถามและแบ่งปันความรู้ให้กับชุมขนนักพัฒนา" }],
            },
            {
                role: "user",
                parts: [{ text: "ปัจจุบันมี LINE API อะไรบ้างที่ใช้งานได้ในประเทศไทย" }],
            },
            {
                role: "model",
                parts: [{ text: "ปัจจุบันมีทั้ง Messaging API, LIFF, LINE Login, LINE Beacon, LINE Notify, LINE Pay, และ LINE MINI App ที่สามารถใช้งานในไทยได้ครับ" }],
            },
        ]
    });

    const result = await chat.sendMessage(prompt);
    return result.response.text();
};

module.exports = { textOnly, multimodal, chat };