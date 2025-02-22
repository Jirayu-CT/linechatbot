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


const line = require('./util/line.util');
const dialogflow = require('./util/dialogflow.util');
const gemini = require("./util/gemini");
// const firebase = require('./util/firebase.util');
// const flex = require('./message/flex');
const NodeCache = require("node-cache");
const CACHE_CHAT = "chat_";
const CACHE_IMAGE = "image_";
const myCache = new NodeCache({ stdTTL: 120, checkperiod: 60 });
let chatHistory = [];

myCache.on("expired", function (key, value) {
    if (key.startsWith(CACHE_CHAT)) {
        chatHistory = [];
    }
});


function validateWebhook(request, response) {
    if (request.method !== "POST") {
        return response.status(200).send("Method Not Allowed");
    }
    if (!line.verifySignature(request.headers["x-line-signature"], request.body)) {
        return response.status(401).send("Unauthorized");
    }
}


exports.webhook = onRequest(async (request, response) => {
    validateWebhook(request, response)

    const events = request.body.events
    for (const event of events) {
        let profile = {}
        const userId = event.source.userId

        // console.log("event", JSON.stringify(event));
        switch (event.type) {


            case "follow":
                /*
                    Greeting Message for new friend
                */
                profile = await line.getProfile(event.source.userId)

                let text = `ยินดีต้อนรับคุณ ${profile.displayName} คุณสามารถพูดคุย สนทนากับ BRU AI เพื่อการเกษตร ได้เลย`
                if (event.follow.isUnblocked) {
                    /*
                        Greeting Message for Old Friend
                        https://developers.line.biz/en/reference/messaging-api/#follow-event
                        https://linedevth.line.me/th/knowledge-api/follow-event
                    */
                    text = `ยินดีต้อนการกลับมา ${profile.displayName} คุณสบายดีไหม`
                }
                await line.replyWithStateless(event.replyToken, [{
                    "type": "text",
                    "text": text,
                }])
                break;
            case "unfollow":
                /*
                    Unsend event
                    https://developers.line.biz/en/reference/messaging-api/#unsend-event
                */
                console.log(JSON.stringify(event));
                break;
            case "message":



                /*
                    Message
                    https://developers.line.biz/en/reference/messaging-api/#message-event
                */
                if (event.message.type === "text") {
                    await line.isAnimationLoading(userId)
                    let textMessage = event.message.text

                    //ตอบกลับรูปภาพ
                    // const cacheImage = myCache.get(CACHE_IMAGE + userId);
                    // if (cacheImage) {
                    //     const text = await gemini.multimodal(textMessage, cacheImage);
                    //     await line.replyWithStateless(event.replyToken, [{ 
                    //         type: "text", 
                    //         sender: {
                    //             name: "Gemini",
                    //             iconUrl: "https://wutthipong.info/images/geminiicon.png",
                    //         },
                    //         text: `[ตอบโดย AI] ${text}`
                    //     }]);
                    //     break;
                    // }

                    //ตอบกลับข้อความ
                    chatHistory = myCache.get(CACHE_CHAT + userId);
                    if (!chatHistory) {
                        chatHistory = [];
                    }
                    chatHistory.push({ role: "user", parts: [{ text: textMessage }] });
                    myCache.set(CACHE_CHAT + userId, chatHistory);
                    // console.log("chatHistory webhook: ", chatHistory);

                    if (textMessage === "testWebhook") {
                        chatHistory(event.source.userId, event.message.text)
                        await line.replyWithStateless(event.replyToken, [{
                            "type": "text",
                            "text": JSON.stringify(event),
                        }])
                    }
                    else {
                        /* Foward to Dialogflow */
                        await dialogflow.forwardDialodflow(request)
                        
                    }

                } 
                // else if (event.message.type === "image") {
                //     const getImageBinary = await line.getImageBinary(event.message.id);
                //     const imageBase64 = Buffer.from(getImageBinary, "binary").toString("base64");
                //     myCache.set(CACHE_IMAGE + userId, imageBase64, 60);
                //     await line.replyWithStateless(event.replyToken, [{ 
                //         type: "text", 
                //         sender: {
                //             name: "Gemini",
                //             iconUrl: "https://wutthipong.info/images/geminiicon.png",
                //         },
                //         text: "[ตอบโดย AI] ระบุสิ่งที่ต้องการทราบจากภาพมาได้เลยได้เลย:)"}]);
                
                // } 
                else {
                    await line.replyWithStateless(event.replyToken, [{
                        "type": "text",
                        "text": "ขออภัย ไม่สามารถตอบกลับข้อความประเภทนี้ได้",
                    }])
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
    const question = object.queryResult.queryText
    
    chatHistory = myCache.get(CACHE_CHAT + userId) || [];
    
    const text = await gemini.chat(chatHistory, question);
    
    await line.replyWithStateless(replyToken, [{
        "type": "text",
        sender: {
            name: "Gemini",
            iconUrl: "https://wutthipong.info/images/geminiicon.png",
        },
        "text": `[ตอบโดย AI] ${text}`
    }])
    
    chatHistory.push({ role: "model", parts: [{ text: text }] });
    // console.log("chatHistory Dialogflow" + chatHistory);
    myCache.set(CACHE_CHAT + userId, chatHistory);

    return response.end();

});