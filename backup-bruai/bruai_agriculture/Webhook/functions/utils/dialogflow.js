const axios = require("axios");

const postToDialogflow = async (request) => {
    console.log("Dialogflow");
    request.headers.host = "dialogflow.cloud.google.com";
    try {
        const response = await axios({
            method: "post",
            // แก้ไข URL เป็นของตัวเอง
            url: "https://dialogflow.cloud.google.com/v1/integrations/line/webhook/f576aa78-8f9d-4261-8b7c-4acbc2193227",
            headers: request.headers,
            data: JSON.stringify(request.body),
        });
        return response;
    } catch (error) {
        console.error(error);
        return null;
    }
};

module.exports = { postToDialogflow };