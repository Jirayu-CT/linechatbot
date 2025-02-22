const { onRequest } = require("firebase-functions/v2/https");
// Set the maximum instances to 10 for all functions
const { setGlobalOptions } = require("firebase-functions/v2");
setGlobalOptions({ maxInstances: 10 });
const line = require("./utils/line");
const dialogflow = require("./utils/dialogflow");
const firestore = require("./utils/firestore");
const { WebhookClient } = require("dialogflow-fulfillment");
const axios = require("axios");

exports.webhook = onRequest({ region: "asia-northeast1" }, async (req, res) => {
    if (req.method === "POST") {
        const events = req.body.events;

        for (const event of events) {
            var userId = event.source.userId;
            var replyToken = event.replyToken;
            var userData = await firestore.getUser(userId);
            
            // if (userData == undefined) {
            //     let profile = await line.getUserProfile(userId);
            //     await firestore.updateUser(profile.data, "bot");
            // }
            
            if (event.type === "message" && event.message.type === "text") {
                await loading(userId);
                await dialogflow.postToDialogflow(req);
                return res.end();
            }
        }
    }
    return res.send(req.method);
});

exports.dialogflowFulfillment = onRequest({ region: "asia-northeast1" }, async (req, res) => {
    console.log("Dialogflow Fullfillment");
    if (req.method === "POST") {
        let userId = req.body.originalDetectIntentRequest.payload.data.source.userId;
        let replyToken = req.body.originalDetectIntentRequest.payload.data.replyToken;

        var userData = await firestore.getUser(userId);
        await firestore.updateUser(userData, "gemini");

        const agent = new WebhookClient({ request: req, response: res });
        console.log("Query " + agent.query);

        let question = agent.query;
        let sessionId = userId; // ใช้ userId เป็น sessionId

        const msg = await dialogflow.postToDialogflow(req);
        console.log(msg);
        if (msg.includes("ขออภัยครับ ไม่พบข้อมูลดังกล่าว")) {
            await line.reply(replyToken, [
                {
                    type: "text",
                    text: "ขออภัยครับ ไม่พบข้อมูลดังกล่าว ตอนนี้คุณอยู่ในโหมดคคุยกับ Bot คุณสามารถถามคำถามต่อไป หรือหากต้องการเปลี่ยนโหมดเป็น Staff สามารถเลือกได้เลยค่ะ",
                    quickReply: {
                        items: [
                            {
                                type: "action",
                                action: {
                                    type: "message",
                                    label: "Staff",
                                    text: "Staff",
                                },
                            },
                        ],
                    },
                },
            ]);
        } else {
            await line.reply(replyToken, [
                {
                    type: "text",
                    sender: {
                        name: "Gemini",
                        iconUrl: "https://wutthipong.info/images/geminiicon.png",
                    },
                    text: msg,
                },
            ]);
        }

        return res.end();
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