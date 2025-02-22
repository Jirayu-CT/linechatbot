const { onRequest } = require("firebase-functions/v2/https");
// Set the maximum instances to 10 for all functions
const { setGlobalOptions } = require("firebase-functions/v2");
setGlobalOptions({ maxInstances: 10 });
const line = require("./utils/line");
const gemini = require("./utils/gemini");
const { WebhookClient } = require("dialogflow-fulfillment");
const NodeCache = require("node-cache");
const myCache = new NodeCache();
const axios = require("axios");

const CACHE_CHAT = "chat_";

exports.dialogflowFulfillment = onRequest( {region: "asia-northeast1"}, async (req, res) => {
    console.log("DialogflowFulfillment");
    if (req.method === "POST") {
        const payload = req.body.originalDetectIntentRequest.payload.data;
        let userId = payload.source.userId;
        let replyToken = payload.replyToken;

        const agent = new WebhookClient({ request: req, response: res });
        console.log("Query " + agent.query);

        let mode = myCache.get(userId);
        console.log("Mode: ", mode);
        if (mode === undefined) {
            mode = "Dialogflow";
        }
        console.log("Mode: ", mode);

        let notifyStatus = myCache.get("Notify_" + userId);
        console.log("Befor NotifyStatus: ", notifyStatus);
        if (notifyStatus === undefined) {
            notifyStatus = true;
        }
        console.log("After NotifyStatus: ", notifyStatus);

        if (agent.query === "reset") {
            mode = "Dialogflow";
            console.log("Change Mode to: ", mode);
            await line.reply(replyToken, [{ type: "text", text: "ระบบตั้งค่าเริ่มต้นให้คุณแล้ว สอบถามได้เลยค่ะ" }]);
            myCache.set(userId, mode, 600);
            console.log("Lastest Mode: ", mode);
            return res.end();
        }

        if (mode === "bot") {
            agent.query = "สอบถามกับ Bot " + agent.query;
        } else if (mode === "staff") {
            agent.query = "สอบถามกับเจ้าหน้าที่ " + agent.query;
        }

        if (agent.query.includes("สอบถามกับเจ้าหน้าที่")) {
            mode = "staff";
            console.log("Change Mode to: ", mode);
            let profile = await line.getUserProfile(userId);
            console.log("Profile: ", profile.data);
            if (notifyStatus) {
                let promptNotify = agent.query.replace("สอบถามกับเจ้าหน้าที่ ", "");
                line.notify({
                    message: "มีผู้ใช้ชื่อ " +
                        profile.data.displayName + "\n" +
                        "ต้องการสอบถามคำถาม: " +
                        promptNotify,
                    imageFullsize: profile.data.pictureUrl,
                    imageThumbnail: profile.data.pictureUrl,
                });
                await line.reply(replyToken, [{ type: "text", text: agent.query + "\nระบบได้แจ้งเตือนไปยังเจ้าหน้าที่แล้วค่ะ เจ้าหน้าที่จะรีบมาตอบนะคะ" }]);
            }
            myCache.set("Notify_" + userId, false, 600);
        }
        else if (agent.query.includes("สอบถามกับ Bot")) {
            await loading(userId);
            mode = "bot";
            console.log("Change Mode to: ", mode);

            let chatHistory = myCache.get(CACHE_CHAT + userId);
            if (!chatHistory) {
                chatHistory = [];
            }

            let question = agent.query.replace("สอบถามกับ Bot ", "");
            const text = await gemini.chat(chatHistory, question);
            
            await line.reply(replyToken, [
                {
                    type: "text",
                    sender: {
                        name: "Gemini",
                        iconUrl: "https://wutthipong.info/images/geminiicon.png",
                    },
                    text: text,
                },
            ]);
            chatHistory.push({ role: "user", parts: [{ text: agent.query }] });
            chatHistory.push({ role: "model", parts: [{ text: text }] });
            myCache.set(CACHE_CHAT + userId, chatHistory, 120);
        }
        else {
            mode = "Dialogflow";
            let question = "คุณต้องการสอบถามกับ Bot หรือ เจ้าหน้าที่";
            let answer1 = "สอบถามกับ Bot " + agent.query;
            let answer2 = "สอบถามกับเจ้าหน้าที่ " + agent.query;

            await line.reply(replyToken, [
                {
                    type: "text",
                    text: question,
                    sender: {
                        name: "Dialogflow",
                        // iconUrl: "https://wutthipong.info/images/geminiicon.png",
                    },
                    quickReply: {
                        items: [
                            {
                                type: "action",
                                action: {
                                    type: "message",
                                    label: "สอบถามกับ Bot",
                                    text: answer1,
                                },
                            },
                            {
                                type: "action",
                                action: {
                                    type: "message",
                                    label: "สอบถามกับเจ้าหน้าที่",
                                    text: answer2,
                                },
                            },
                        ],
                    },
                },
            ]);
        }
        myCache.set(userId, mode, 600);
        console.log("Lastest Mode: " + mode);
    }
    return res.send(req.method);
});

function loading(userId) {
    return axios({
        method: "post",
        url: "https://api.line.me/v2/bot/chat/loading/start",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.CHANNEL_ACCESS_TOKEN}`
        },
        data: { chatId: userId }
    });
}