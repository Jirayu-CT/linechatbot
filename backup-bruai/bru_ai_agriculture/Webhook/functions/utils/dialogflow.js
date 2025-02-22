const axios = require("axios");

const postToDialogflow = async (request) => {
    console.log("Dialogflow");
    request.headers.host = "dialogflow.cloud.google.com";
    try {
        const response = await axios({
            method: "post",
            // แก้ไข URL เป็นของตัวเอง
            url: "https://dialogflow.cloud.google.com/v1/integrations/line/webhook/d69e2df9-8cf1-46a6-943e-7bd31d0f50c4",
            headers: request.headers,
            data: JSON.stringify(request.body),
        });
        console.log("Dialogflow response:", response.data);
        return response.data;
    } catch (error) {
        console.error("Error posting to Dialogflow:", error.response ? error.response.data : error.message);
        throw error;
    }
};

module.exports = { postToDialogflow };