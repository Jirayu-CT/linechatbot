const { onRequest } = require("firebase-functions/v2/https");
// Set the maximum instances to 10 for all functions
const { setGlobalOptions } = require("firebase-functions/v2");
setGlobalOptions({ maxInstances: 10 });
const line = require("./utils/line");
const gemini = require("./utils/gemini");
const dialogflow = require("./utils/dialogflow");
const firestore = require("./utils/firestore");
const { WebhookClient } = require("dialogflow-fulfillment");
const NodeCache = require("node-cache");
const myCache = new NodeCache();
const axios = require("axios");

exports.webhook = onRequest({region: "asia-northeast1"}, async (req, res) => {
    if (req.method === "POST") {
        const events = req.body.events;

        for (const event of events) {
            var userId = event.source.userId;
            var replyToken = event.replyToken;
            var userData = await firestore.getUser(userId);

            var userMode = "bot";
            if (userData == undefined) {
                let profile = await line.getUserProfile(userId);
                await firestore.updateUser(profile.data, userMode);
            } else {
                userMode = userData.mode;
            }

            switch (event.type) {
                case "message":
                    if (event.message.type === "text") {
                        if (event.message.text.toLowerCase() == "mode") {
                            await line.reply(replyToken, [
                                {
                                    type: "text",
                                    text:
                                        "ตอนนี้คุณอยู่ในโหมดคคุยกับ " +
                                        userMode +
                                        " หากต้องการเปลี่ยนโหมดสามารถเลือกได้เลยค่ะ",
                                    quickReply: {
                                        items: [
                                            {
                                                type: "action",
                                                action: {
                                                    type: "message",
                                                    label: "Bot",
                                                    text: "Bot",
                                                },
                                            },
                                        ],
                                    },
                                },
                            ]);
                            return res.end();
                        } else if (event.message.text.toLowerCase() == "gemini") {
                            console.log("Change mode to Gemini");
                            await line.reply(replyToken, [
                                {
                                    type: "text",
                                    text: "คุณได้เปลี่ยนเป็นโหมดคุยกับ Bot แล้ว สามารถสอบถามต่อได้เลยค่ะ",
                                },
                            ]);
                            await firestore.updateUser(userData, "gemini");
                            return res.end();
                        } else if (event.message.text.toLowerCase() == "bot") {
                            console.log("Change mode to Bot");
                            await line.reply(replyToken, [
                                {
                                    type: "text",
                                    text: "คุณได้เปลี่ยนเป็นโหมดคุยกับ Bot แล้ว สามารถสอบถามต่อได้เลยค่ะ",
                                },
                            ]);
                            await firestore.updateUser(userData, "bot");
                            return res.end();
                        }
                        console.log("User Mode " + userMode);

                        // ส่งข้อความไปยัง Dialogflow ก่อน
                        try {
                            const dialogflowResponse = await dialogflow.postToDialogflow(req);
                            if (dialogflowResponse && dialogflowResponse.fulfillmentText) {
                                await line.reply(replyToken, [
                                    {
                                        type: "text",
                                        text: dialogflowResponse.fulfillmentText,
                                    },
                                ]);
                            } else {
                                // หาก Dialogflow ไม่มีการตอบกลับที่เหมาะสม ส่งข้อความไปยัง Gemini
                                let question = event.message.text;
                                await loading(userId);
                                const msg = await gemini.chat(question);
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
                            }
                        } catch (error) {
                            console.error("Error sending message to Dialogflow:", error);
                            // หากเกิดข้อผิดพลาดในการส่งข้อความไปยัง Dialogflow ส่งข้อความไปยัง Gemini
                            let question = event.message.text;
                            await loading(userId);
                            const msg = await gemini.chat(question);
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
                        }
                        return res.end();
                    }
                    if (event.message.type === "image") {
                        const imageBinary = await line.getImageBinary(event.message.id);
                        const msg = await gemini.multimodal(imageBinary);
                        await line.reply(event.replyToken, [{ type: "text", text: msg }]);
                        return res.end();
                    }
                    break;
            }
        }
    }
    return res.send(req.method);
});

exports.dialogflowFulfillment = onRequest( {region: "asia-northeast1"} , async (req, res) => {
    console.log("Dialogflow Fullfillment");
    if (req.method === "POST") {
        let userId =
            req.body.originalDetectIntentRequest?.payload?.data?.source?.userId;
        let replyToken =
            req.body.originalDetectIntentRequest?.payload?.data?.replyToken;

        if (!userId || !replyToken) {
            console.error("Invalid Dialogflow request structure", req.body);
            return res.status(400).send("Invalid request structure");
        }

        var userData = await firestore.getUser(userId);
        if (!userData) {
            console.error("User data not found for userId:", userId);
            return res.status(400).send("User data not found");
        }

        var userMode = "gemini";
        await firestore.updateUser(userData, userMode);

        const agent = new WebhookClient({ request: req, response: res });
        console.log("Query " + agent.query);

        let question = agent.query;

        const msg = await gemini.chat(question);
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