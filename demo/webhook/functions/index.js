/*
Cloud Functions for Firebase 2nd Gen
https://medium.com/firebasethailand/cdda33bbd7dd

*/

const { setGlobalOptions } = require("firebase-functions/v2");
const { onRequest } = require("firebase-functions/v2/https");

setGlobalOptions({
    region: "asia-northeast1",
    memory: "1GB",
    concurrency: 40,
})


const line = require('./util/line');
const dialogflow = require('./util/dialogflow.util');
const gemini = require("./util/gemini");
// const firebase = require('./util/firebase.util');
// const flex = require('./message/flex');
const NodeCache = require("node-cache");
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
    let mode = myCache.get(userId)
    if (mode === undefined) {
        mode = "Dialogflow"
    }
    return mode
}


exports.webhook = onRequest(async (request, response) => {
    validateWebhook(request, response)

    const events = request.body.events
    for (const event of events) {
        let profile = {}
        const userId = event.source.userId
        let mode = modef(userId)
        let notifyStatus = myCache.get("Notify_" + userId)

        switch (event.type) {
            case "follow":
                profile = await line.getProfile(event.source.userId)
                let text = `ยินดีต้อนรับคุณ ${profile.displayName} คุณสามารถพูดคุย สนทนากับ อบต.หนองชัยศรี ได้เลย`
                if (event.follow.isUnblocked) {
                    text = `ยินดีต้อนการกลับมา ${profile.displayName} คุณสบายดีไหม`
                }
                await line.replyWithStateless(event.replyToken, [{
                    "type": "text",
                    "text": text,
                }])
                break;
            case "unfollow":
                console.log(JSON.stringify(event));
                break;
            case "message":
                if (event.message.type === "text") {
                    let textMessage = event.message.text

                    console.log("Notify Status: ", notifyStatus)
                    if (notifyStatus === undefined) {
                        notifyStatus = true
                    }

                    if (textMessage === "เริ่มต้นการสนทนา" || textMessage === "ล้างการสนทนา" || textMessage === "reset") {
                        await line.isAnimationLoading(userId)
                        mode = "Dialogflow"
                        await line.replyWithStateless(event.replyToken, [{
                            "type": "text",
                            "text": "ระบบเริ่มต้นการสนทนาใหม่เรียบร้อยแล้ว...",
                        }])
                        myCache.set(userId, mode, 600)
                        return response.end()
                    }

                    if (mode === "bot") {
                        textMessage = "สอบถามกับ AI " + textMessage
                    }
                    else if (mode === "staff") {
                        textMessage = "สอบถามกับเจ้าหน้าที่ " + textMessage
                    }
                    else {
                        mode = "Dialogflow"
                    }

                    if (textMessage === "testWebhook/jirayu/122333") {
                        await line.replyWithStateless(event.replyToken, [{
                            "type": "text",
                            "text": JSON.stringify(event)
                        }])
                    }
                    else if (textMessage.includes("สอบถามกับเจ้าหน้าที่") || textMessage === " สอบถามกับเจ้าหน้าที่" || textMessage.includes("สอบถามกับเจ้าหน้าที่ ")) {
                        if (mode !== "staff" && notifyStatus) {
                            mode = "staff"
                            let profile = await line.getProfile(userId)
                            const payload = [
                                {
                                    type: "text",
                                    text: `[Demo Chatbot] มีผู้ใช้ชื่อ ${profile.displayName} ต้องการติดต่อเรื่อง: ${textMessage.replace("สอบถามกับเจ้าหน้าที่ ", "")}`
                                },
                                {
                                    type: "image",
                                    originalContentUrl: profile.pictureUrl,  // รูปขนาดเต็ม
                                    previewImageUrl: profile.pictureUrl      // รูปตัวอย่าง (thumbnail)
                                }
                            ];

                            // await line.pushMessageNotify(payload)

                            await line.replyWithStateless(event.replyToken, [{
                                "type": "text",
                                "text": "ขอบคุณที่ติดต่อเรา ทางเจ้าหน้าที่จะติดต่อกลับไปโดยเร็วที่สุด",
                            }])
                            myCache.set("Notify_" + userId, false, 600);
                        } else if (mode !== "staff") {
                            mode = "staff"
                            await line.replyWithStateless(event.replyToken, [{
                                "type": "text",
                                "text": "ทางเจ้าหน้าที่ได้รับข้อความแล้ว ทางเจ้าหน้าที่จะติดต่อกลับไปโดยเร็วที่สุด",
                            }])
                        }
                        else {
                            return response.end()
                        }
                    }
                    else if (textMessage.includes("สอบถามกับ AI")) {
                        mode = "bot"
                        await line.isAnimationLoading(userId)

                        //ตอบกลับรูปภาพ
                        const cacheImage = myCache.get(CACHE_IMAGE + userId);
                        if (cacheImage) {
                            textMessage = textMessage.replace("สอบถามกับ AI ", "");
                            if (textMessage === "ต้องการสอบถามรูปภาพนี้") {
                                await line.isAnimationLoading(userId);

                                await line.replyWithStateless(event.replyToken, [
                                    {
                                        type: "text",
                                        sender: {
                                            name: "Gemini",
                                            iconUrl: "https://wutthipong.info/images/geminiicon.png",
                                        },
                                        text: "[ตอบโดย AI] ระบุสิ่งที่ต้องการทราบจากภาพมาได้เลยได้เลย:)"
                                    }
                                ]);
                                myCache.set(userId, mode, 600);
                                return response.end();
                            }
                            
                            const text = await gemini.multimodal(textMessage, cacheImage);
                            await line.replyWithStateless(event.replyToken, [{
                                type: "text",
                                sender: {
                                    name: "Gemini",
                                    iconUrl: "https://wutthipong.info/images/geminiicon.png"
                                },
                                text: `[ตอบโดย AI] ${text}`
                            }]);
                            console.log("Mode IMAGE: ", mode);
                            myCache.set(userId, mode, 600);
                            break;
                        }

                        let chatHistory = myCache.get(CACHE_CHAT + userId);
                        if (!chatHistory) {
                            chatHistory = [];
                        }

                        let question = textMessage.replace("สอบถามกับ AI ", "");
                        const text = await gemini.chat(chatHistory, question);

                        await line.replyWithStateless(event.replyToken, [{
                            "type": "text",
                            sender: {
                                name: "Gemini",
                                iconUrl: "https://wutthipong.info/images/geminiicon.png",
                            },
                            "text": `[ตอบโดย AI] ${text}`
                        }])
                        chatHistory.push({ role: "user", parts: [{ text: textMessage }] });
                        chatHistory.push({ role: "model", parts: [{ text: text }] });
                        myCache.set(CACHE_CHAT + userId, chatHistory, 120);
                    }
                    else if (mode === "Dialogflow") {
                        /* Foward to Dialogflow */
                        await line.isAnimationLoading(userId)
                        await dialogflow.forwardDialodflow(request)
                    }
                    myCache.set(userId, mode, 600);
                    console.log("Mode TEXT: ", mode);
                }
                else if (event.message.type === "image") {
                    const getImageBinary = await line.getImageBinary(event.message.id);
                    const imageBase64 = Buffer.from(getImageBinary, "binary").toString("base64");
                    myCache.set(CACHE_IMAGE + userId, imageBase64, 60);

                    if (mode === "staff") {
                        mode = "staff";
                    }
                    if (mode === "bot") {
                        mode = "bot";
                        await line.isAnimationLoading(userId);

                        await line.replyWithStateless(event.replyToken, [
                            {
                                type: "text",
                                sender: {
                                    name: "Gemini",
                                    iconUrl: "https://wutthipong.info/images/geminiicon.png",
                                },
                                text: "[ตอบโดย AI] ระบุสิ่งที่ต้องการทราบจากภาพมาได้เลยได้เลย:)"
                            }
                        ]);
                    } else {
                        mode = "Dialogflow";
                        const cacheImage = myCache.get(CACHE_IMAGE + userId);

                        let question = "ขออภัย ไม่สามารถตอบกลับข้อความประเภทนี้ได้ คุณต้องการสอบถามกับ AI หรือ เจ้าหน้าที่";
                        let answer = `ต้องการสอบถามรูปภาพนี้`;
                        // await line.isAnimationLoading(userId);
                        await line.replyWithStateless(event.replyToken, [
                            {
                                type: "text",
                                text: question,
                                sender: {
                                    name: "Dialogflow",
                                },
                                quickReply: {
                                    items: [
                                        {
                                            type: "action",
                                            action: {
                                                type: "message",
                                                label: "สอบถามกับ AI",
                                                text: `สอบถามกับ AI ${answer}`,
                                            },
                                        },
                                        {
                                            type: "action",
                                            action: {
                                                type: "message",
                                                label: "สอบถามกับเจ้าหน้าที่",
                                                text: `สอบถามกับเจ้าหน้าที่ ${answer}`,
                                            },
                                        },
                                        // {
                                        //     type: "action",
                                        //     action: {
                                        //         type: "uri",
                                        //         label: "ดูภาพที่ส่งมา",
                                        //         uri: `สอบถามกับเจ้าหน้าที่, ${cacheImage}`,
                                        //     },
                                        // },
                                        // {
                                        //     type: "action",
                                        //     action: {
                                        //         type: "message",
                                        //         label: "ส่งรูปภาพ",
                                        //         text: "นี่คือรูปภาพที่คุณส่งมา",
                                        //     },
                                        //     imageUrl: "https://example.com/path-to-your-image.jpg",
                                        // },
                                    ],
                                },
                            },
                        ]);
                    }
                    console.log("IMAGE Mode: ", mode);
                    myCache.set(userId, mode, 600);
                }
                else {
                    if (mode === "staff") {
                        mode = "staff"
                        return response.end()
                    }
                    else {
                        mode = "Dialogflow"
                        await line.isAnimationLoading(userId)
                        await dialogflow.forwardDialodflow(request)
                        await line.replyWithStateless(event.replyToken, [{
                            "type": "text",
                            "text": "ขออภัย ไม่สามารถตอบกลับข้อความประเภทนี้ได้ โปรดติดต่อเจ้าหน้าที่",
                        }])
                    }
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
    const object = request.body
    const replyToken = object.originalDetectIntentRequest.payload.data.replyToken
    const userId = object.originalDetectIntentRequest.payload.data.source.userId
    const textMessage = object.queryResult.queryText

    let mode = modef(userId)
    mode = "Dialogflow"
    let question = "คุณต้องการสอบถามกับ AI หรือ เจ้าหน้าที่"
    let answer1 = `สอบถามกับ AI ${textMessage}`
    let answer2 = `สอบถามกับเจ้าหน้าที่ ${textMessage}`

    await line.replyWithStateless(replyToken, [
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
                            label: "สอบถามกับ AI",
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
    myCache.set(userId, mode, 600);
    return response.end();
});