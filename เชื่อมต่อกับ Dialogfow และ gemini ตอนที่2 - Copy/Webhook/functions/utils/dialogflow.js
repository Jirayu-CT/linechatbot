const axios = require("axios");

const postToDialogflow = (request) => {
    console.log("Dialogflow");
    request.headers.host = "dialogflow.cloud.google.com";
    try {
        axios({
            method: "post",
            // แก่ไข url เป็นของตัวเอง
            url: "https://dialogflow.cloud.google.com/v1/integrations/line/webhook/9d325c27-52b7-4bcb-b12f-a5cad00a7516",
            headers: request.headers,
            data: JSON.stringify(request.body),
        });
    } catch (error) {
        console.error(error);
    }
};

module.exports = { postToDialogflow };