const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

const chunk = (arr, size) => {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
};

export const sendExpoPushNotifications = async (messages) => {
  if (!messages.length) return { success: true, sent: 0 };

  const batches = chunk(messages, 100);
  let sent = 0;

  for (const batch of batches) {
    const response = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(batch),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error("Expo push failed:", text);
      continue;
    }

    const result = await response.json();
    const data = Array.isArray(result.data) ? result.data : [result.data];
    sent += data.filter((item) => item?.status === "ok").length;
  }

  return { success: true, sent };
};

export const buildPushMessages = (tokens, { title, body, data = {}, channelId = "default" }) => {
  const uniqueTokens = [...new Set(tokens.filter(Boolean))];
  return uniqueTokens.map((token) => ({
    to: token,
    sound: "default",
    title,
    body,
    data,
    priority: "high",
    channelId,
  }));
};
