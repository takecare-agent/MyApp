const { onDocumentUpdated } = require("firebase-functions/v2/firestore"); // 使用 v2 語法
const admin = require("firebase-admin");
admin.initializeApp();

exports.sendEmergencyNotification = onDocumentUpdated("pairings/{pairingCode}", async (event) => {
    const newData = event.data.after.data();
    const oldData = event.data.before.data();

    // 邏輯相同
    if (newData.status === 'EMERGENCY' && newData.pushTrigger !== oldData.pushTrigger) {
        const familyToken = newData.familyToken;
        if (!familyToken) return null;

        const message = {
            notification: {
                title: '⚠️ 緊急求救通知',
                body: '您的家人正在進行 CPR 急救，請立即查看位置！',
            },
            token: familyToken,
        };

        try {
            await admin.messaging().send(message);
        } catch (error) {
            console.error('推播發送失敗:', error);
        }
    }
    return null;
});