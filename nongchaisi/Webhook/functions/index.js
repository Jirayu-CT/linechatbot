const { onRequest } = require("firebase-functions/v2/https");
// Set the maximum instances to 10 for all functions
const { setGlobalOptions } = require("firebase-functions/v2");
setGlobalOptions({ maxInstances: 10 });
const line = require("./utils/line");
const gemini = require("./utils/gemini");
const { WebhookClient } = require("dialogflow-fulfillment");
const NodeCache = require("node-cache");
const myCache = new NodeCache();

exports.linechatbotnongchaisi = onRequest(async (req, res) => {
    if (req.method === "POST") {
        const events = req.body.events;
        for (const event of events) {
            switch (event.type) {
                case "message":
                    if (event.message.type === "text") {
                        const msg = await gemini.textOnly(event.message.text);
                        await line.reply(event.replyToken, [{ type: "text", text: msg }]);
                        break;
                    }
                    if (event.message.type === "image") {
                        const imageBinary = await line.getImageBinary(event.message.id);
                        const msg = await gemini.multimodal(imageBinary);
                        await line.reply(event.replyToken, [{ type: "text", text: msg }]);
                        break;
                    }
                    break;
            }
        }
    }
    res.send(req.method);
});

exports.dialogflowFulfillment = onRequest(async (req, res) => {
    console.log("DialogflowFulfillment");
    if (req.method === "POST") {
        var userId =
            req.body.originalDetectIntentRequest.payload.data.source.userId;
        var replyToken =
            req.body.originalDetectIntentRequest.payload.data.replyToken;
        const agent = new WebhookClient({ request: req, response: res });
        console.log("Query " + agent.query);

        console.log("UserId: " + userId);
        var mode = myCache.get(userId);
        console.log("Mode: " + mode);
        if (mode === undefined) {
            mode = "Dialogflow";
        }
        var notifyStatus = myCache.get("Notify" + userId);
        if (notifyStatus === undefined) {
            notifyStatus = true;
        }

        if (agent.query == "reset") {
            mode = "Dialogflow";
            console.log("Change Mode to: " + mode);
            await line.reply(replyToken, [
                {
                    type: "text",
                    text: "ระบบตั้งค่าเริ่มต้นให้คุณแล้ว สอบถามได้เลยค่ะ",
                },
            ]);
            myCache.set(userId, mode, 600);
            console.log("Lastest Mode: " + mode);
            return res.end();
        }

        if (mode == "bot") {
            agent.query = "สอบถามกับ Bot" + agent.query;
        } else if (mode == "staff") {
            agent.query = "สอบถามกับ Staff" + agent.query;
        }

        if (agent.query.includes("สอบถามกับ Staff")) {
            mode = "staff";
            console.log("Change Mode to: " + mode);
            let profile = await line.getUserProfile(userId);
            console.log(profile.data);
            if (notifyStatus) {
                line.notify({
                    message:
                        "มีผู้ใช้ชื่อ " +
                        profile.data.displayName +
                        " ต้องการติดต่อ " +
                        agent.query,
                    imageFullsize: profile.data.pictureUrl,
                    imageThumbnail: profile.data.pictureUrl,
                });
                await line.reply(replyToken, [
                    {
                        type: "text",

                        text:
                            agent.query +
                            " เราได้แจ้งเตือนไปยัง Staff แล้วค่ะ Staff จะรีบมาตอบนะคะ",
                    },
                ]);
            }
            myCache.set("Notify" + userId, false, 600);
        } else if (agent.query.includes("สอบถามกับ Bot")) {
            mode = "bot";
            console.log("Change Mode to: " + mode);
            let question = agent.query;
            question = question.replace("สอบถามกับ Bot", "");
            const msg = await gemini.textOnly(question);
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
        } else {
            mode = "Dialogflow";
            let question = "คุณต้องการสอบถามกับ Bot หรือ Staff";
            let answer1 = "สอบถามกับ Bot " + agent.query;
            let answer2 = "สอบถามกับ Staff " + agent.query;

            // await line.reply(
            //   replyToken,
            //   template.quickreply(question, answer1, answer2)
            // );
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
                                    label: "สอบถามกับ Staff",
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