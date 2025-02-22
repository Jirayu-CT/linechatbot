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

exports.webhook = onRequest( {region: "asia-northeast1"} , async (req, res) => {
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
                        var notifyStatus = myCache.get("NotifyTheStaff");
                        if (notifyStatus === undefined) {
                            notifyStatus = [];
                        }

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
                        } else if (event.message.text.toLowerCase() == "staff") {
                            console.log("Change mode to Staff");
                            await line.reply(replyToken, [
                                {
                                    type: "text",
                                    text: "คุณได้เปลี่ยนเป็นโหมดคุยกับ Staff แล้ว สามารถสอบถามต่อได้เลยค่ะ",
                                },
                            ]);
                            await firestore.updateUser(userData, "staff");
                            return res.end();
                        }
                        console.log("User Mode " + userMode);

                        if (userMode == "staff") {
                            if (!notifyStatus.includes(userId)) {
                                notifyStatus.push(userId);
                                await line.notify({
                                    message:
                                        "มีผู้ใช้ชื่อ " +
                                        userData.displayName +
                                        " ต้องการติดต่อ " +
                                        event.message.text,
                                    imageFullsize: userData.pictureUrl,
                                    imageThumbnail: userData.pictureUrl,
                                });
                                await line.reply(replyToken, [
                                    {
                                        type: "text",
                                        text: "เราได้แจ้งเตือนไปยัง Staff แล้วค่ะ รอสักครู่นะคะ",
                                    },
                                ]);
                            }
                            myCache.set("NotifyTheStaff", notifyStatus, 600);
                            return res.end();
                        } else if (userMode == "gemini") {
                            let question = event.message.text;
                            await line.loading(userId);
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
                        } else if (userMode == "bot") {
                            await dialogflow.postToDialogflow(req);
                            return res.end();
                        }
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

exports.dialogflowFulfillment = onRequest( {region: "asia-northeast1"}, async (req, res) => {
    console.log("Dialogflow Fullfillment");
    if (req.method === "POST") {
        let userId =
            req.body.originalDetectIntentRequest.payload.data.source.userId;
        let replyToken =
            req.body.originalDetectIntentRequest.payload.data.replyToken;

        var userData = await firestore.getUser(userId);
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