// Background service worker for HN Hiring Lens

// Listen for messages from content script to open side panel
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.action === 'openSidePanel' && sender.tab?.id) {
    chrome.sidePanel.open({ tabId: sender.tab.id });
  }
});
