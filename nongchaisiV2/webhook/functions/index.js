/*
Cloud Functions for Firebase 2nd Gen
https://medium.com/firebasethailand/cdda33bbd7dd
*/

const { setGlobalOptions } = require("firebase-functions/v2");
const { onRequest } = require("firebase-functions/v2/https");
const line = require('./util/line');
const dialogflow = require('./util/dialogflow.util');
const gemini = require("./util/gemini");
const NodeCache = require("node-cache");

setGlobalOptions({
    region: "asia-northeast1",
    memory: "1GB",
    concurrency: 40,
});

const CACHE_CHAT = "chat_";
const CACHE_IMAGE = "image_";
const myCache = new NodeCache({ stdTTL: 120, checkperiod: 60 });

function validateWebhook(request, response) {
    if (request.method !== "POST") {
        return response.status(200).send("Method Not Allowed");
    }
    if (!line.verifySignature(request.headers["x-line-signature"], request.body)) {
        return response.status(401).send("Unauthorized");
    }
}

function modef(userId) {
    return myCache.get(userId) || "Dialogflow";
}

exports.webhook = onRequest(async (request, response) => {
    validateWebhook(request, response);

    const events = request.body.events;
    for (const event of events) {
        const userId = event.source.userId;
        let mode = modef(userId);
        let notifyStatus = myCache.get("Notify_" + userId) ?? true;

        switch (event.type) {
            case "follow":
                const profile = await line.getProfile(userId);
                const text = event.follow?.isUnblocked
                    ? `ยินดีต้อนการกลับมา ${profile.displayName} คุณสบายดีไหม`
                    : `ยินดีต้อนรับคุณ ${profile.displayName} คุณสามารถพูดคุย สนทนากับ อบต.หนองชัยศรี ได้เลย`;
                await line.replyWithStateless(event.replyToken, [{ type: "text", text }]);
                break;

            case "unfollow":
                console.log(JSON.stringify(event));
                break;

            case "message":
                if (event.message.type === "text") {
                    let textMessage = event.message.text;

                    if (["เริ่มต้นการสนทนา", "ล้างการสนทนา", "reset"].includes(textMessage)) {
                        await line.isAnimationLoading(userId);
                        mode = "Dialogflow";
                        await line.replyWithStateless(event.replyToken, [{
                            type: "text",
                            sender: { name: "Chatbot" },
                            text: "ระบบเริ่มต้นการสนทนาใหม่เรียบร้อยแล้ว เริ่มต้นการสนทนาใหม่โดยการพิมพ์ข้อความที่ต้องการสอบถามได้เลย✍️",
                        }]);
                        myCache.set(userId, mode, 600);
                        myCache.del([CACHE_CHAT + userId, CACHE_IMAGE + userId]);
                        return response.end();
                    }

                    if (mode === "bot") {
                        textMessage = "สอบถามกับ AI " + textMessage;
                    } else if (mode === "staff") {
                        textMessage = "สอบถามกับเจ้าหน้าที่ " + textMessage;
                    } else {
                        mode = "Dialogflow";
                    }

                    if (textMessage === "testWebhook/jirayu/122333") {
                        await line.replyWithStateless(event.replyToken, [{ type: "text", text: JSON.stringify(event) }]);
                    } 
                    else if (textMessage.includes("สอบถามกับเจ้าหน้าที่")) {
                        if (mode !== "staff" && notifyStatus) {
                            mode = "staff";
                            const profile = await line.getProfile(userId);
                            const payload = [
                                { 
                                    type: "text", 
                                    text: `[อบต.หนองชัยศรี Chatbot] มีผู้ใช้ชื่อ ${profile.displayName} ต้องการติดต่อเรื่อง: ${textMessage.replace("สอบถามกับเจ้าหน้าที่ ", "")}` 
                                },
                                { 
                                    type: "image", 
                                    originalContentUrl: profile.pictureUrl, 
                                    previewImageUrl: profile.pictureUrl 
                                },
                            ];
                            await line.pushMessageNotify(payload);
                            await line.replyWithStateless(event.replyToken, [{
                                type: "text",
                                sender: { name: "Chatbot" },
                                text: "ขอบคุณที่ติดต่อเรา 🙏\nพิมพ์ข้อความที่ต้องการแจ้งเจ้าหน้าที่ได้เลยค่ะ✍️ ทางเจ้าหน้าที่จะติดต่อกลับไปโดยเร็วที่สุด\n\n⏰ เวลาทำการองค์การบริหารส่วนตำบลหนองชัยศรี: วันจันทร์ถึงวันศุกร์ เวลา 8.30 น. - 16.30 น.",
                            }]);
                            myCache.set("Notify_" + userId, false, 600);
                        } else if (mode !== "staff" || textMessage.includes("สอบถามกับเจ้าหน้าที่ สอบถามกับเจ้าหน้าที่")) {
                            mode = "staff";
                            await line.replyWithStateless(event.replyToken, [{
                                type: "text",
                                sender: { name: "Chatbot" },
                                text: "ทางเจ้าหน้าที่ได้รับข้อความแล้ว \nพิมพ์ข้อความที่ต้องการแจ้งเจ้าหน้าที่ได้เลยค่ะ✍️ ทางเจ้าหน้าที่จะติดต่อกลับไปโดยเร็วที่สุด\n\n⏰ เวลาทำการองค์การบริหารส่วนตำบลหนองชัยศรี: วันจันทร์ถึงวันศุกร์ เวลา 8.30 น. - 16.30 น.",
                            }]);
                        }
                        myCache.set(userId, mode, 600);
                    } else if (textMessage.includes("สอบถามกับ AI")) {
                        mode = "bot";

                        await line.isAnimationLoading(userId);
                        const chatHistory = myCache.get(CACHE_CHAT + userId) || [];
                        const question = textMessage.replace("สอบถามกับ AI ", "");
                        const text = await gemini.chat(chatHistory, question);

                        await line.replyWithStateless(event.replyToken, [{
                            type: "text",
                            sender: { name: "Gemini", iconUrl: "https://wutthipong.info/images/geminiicon.png" },
                            text: `[ตอบโดย AI] ${text}`,
                        }]);
                        chatHistory.push({ role: "user", parts: [{ text: textMessage }] });
                        chatHistory.push({ role: "model", parts: [{ text }] });
                        myCache.set(CACHE_CHAT + userId, chatHistory, 120);
                    } else if (mode === "Dialogflow") {
                        await line.isAnimationLoading(userId);
                        await dialogflow.forwardDialodflow(request);
                    }
                    myCache.set(userId, mode, 600);
                } else if (event.message.type === "image") {
                    if (mode === "staff") {
                        mode = "staff";
                    }
                    else if (mode === "bot") {
                        await line.isAnimationLoading(userId);
                        await line.replyWithStateless(event.replyToken, [{
                            type: "text",
                            sender: { name: "Chatbot" },
                            text: "ขออภัยขณะนี้ AI ไม่สามารถตอบกลับรูปภาพได้❌ โปรดติดต่อเจ้าหน้าที่❗️",
                        }]);
                    } else {
                        const question = "ขออภัย❌ ไม่สามารถตอบกลับข้อความประเภทนี้ได้ คุณต้องการสอบถามกับ'เจ้าหน้าที่'หรือไม่❓";
                        await line.replyWithStateless(event.replyToken, [{
                            type: "text",
                            sender: { name: "Chatbot" },
                            text: question,
                            quickReply: {
                                items: [{
                                    type: "action",
                                    action: { type: "message", label: "สอบถามกับเจ้าหน้าที่", text: "สอบถามกับเจ้าหน้าที่ ต้องการสอบถามข้อมูลเกี่ยวกับรูปภาพ" },
                                }],
                            },
                        }]);
                    }
                    myCache.set(userId, mode, 600);
                } else if (event.message.type === "sticker") {
                    if (mode === "bot") {
                        await line.isAnimationLoading(userId);
                        await line.replyWithStateless(event.replyToken, [{
                            type: "text",
                            sender: { name: "Chatbot" },
                            text: "ขออภัย❌ AI ไม่สามารถตอบกลับสติ๊กเกอร์ได้⚠️",
                        }]);
                    }
                    myCache.set(userId, mode, 600);
                } else {
                    if (mode !== "staff") {
                        await line.isAnimationLoading(userId);
                        await dialogflow.forwardDialodflow(request);
                        const question = "ขออภัย❌ ไม่สามารถตอบกลับข้อความประเภทนี้ได้ คุณต้องการสอบถามกับ'เจ้าหน้าที่'หรือไม่❓";
                        await line.replyWithStateless(event.replyToken, [{
                            type: "text",
                            sender: { name: "Chatbot" },
                            text: question,
                            quickReply: {
                                items: [{
                                    type: "action",
                                    action: { type: "message", label: "สอบถามกับเจ้าหน้าที่", text: "สอบถามกับเจ้าหน้าที่ ต้องการสอบถามข้อมูล" },
                                }],
                            },
                        }]);
                    }
                    myCache.set(userId, mode, 600);
                }
                break;

            default:
                return response.end();
        }
    }
    return response.end();
});

exports.dialogflow = onRequest(async (request, response) => {
    console.log("Dialogflow Fullfillment");
    const object = request.body;
    const replyToken = object.originalDetectIntentRequest.payload.data.replyToken;
    const userId = object.originalDetectIntentRequest.payload.data.source.userId;
    const textMessage = object.queryResult.queryText;

    const mode = "Dialogflow";
    const question = "คุณต้องการสอบถามกับ AI หรือ เจ้าหน้าที่";
    const answer1 = `สอบถามกับ AI ${textMessage}`;
    const answer2 = `สอบถามกับเจ้าหน้าที่ ${textMessage}`;

    await line.replyWithStateless(replyToken, [{
        type: "text",
        text: question,
        sender: { name: "Chatbot" },
        quickReply: {
            items: [
                { type: "action", action: { type: "message", label: "สอบถามกับ AI", text: answer1 } },
                { type: "action", action: { type: "message", label: "สอบถามกับเจ้าหน้าที่", text: answer2 } },
            ],
        },
    }]);
    myCache.set(userId, mode, 600);
    return response.end();
});