chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "update-badge") {
    chrome.action.setBadgeText({ text: `${message.text}min` });
    chrome.action.setBadgeBackgroundColor({ color: "#4CAF50" });
  }

  if (message.type === "clear-badge") {
    chrome.action.setBadgeText({ text: "" });
  }
});
