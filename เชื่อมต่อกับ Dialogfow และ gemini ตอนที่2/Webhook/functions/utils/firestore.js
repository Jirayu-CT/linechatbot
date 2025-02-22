const { initializeApp } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
initializeApp();
const db = getFirestore();

const updateUser = async (user, mode) => {
    console.log("updateUser");

    if (!user || !user.userId) {
        console.error("Invalid user object", user);
        return;
    }

    const userRef = db.collection("user").doc(user.userId);
    user.timestamp = Timestamp.now();
    user.mode = mode;

    try {
        await userRef.set(user, { merge: true });
        console.log("User data updated successfully:", user);
    } catch (error) {
        console.error("Error updating user:", error);
    }
};

const getUser = async (userId) => {
    console.log("getUser", userId);
    const userRef = db.collection("user").doc(userId);

    try {
        const doc = await userRef.get();
        if (!doc.exists) {
            console.log("No such document!");
            return undefined;
        } else {
            return doc.data();
        }
    } catch (error) {
        console.error("Error getting user:", error);
    }
};

module.exports = { updateUser, getUser };