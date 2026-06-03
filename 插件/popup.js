const DEFAULT_SETTINGS = {
  endpoint: "https://api.deepseek.com/chat/completions",
  model: "deepseek-v4-flash",
  apiKey: "",
  showReference: true
};

const fields = {
  endpoint: document.getElementById("endpoint"),
  model: document.getElementById("model"),
  apiKey: document.getElementById("apiKey"),
  showReference: document.getElementById("showReference")
};

const status = document.getElementById("status");

init();

async function init() {
  const settings = migrateSettings(await chrome.storage.sync.get(DEFAULT_SETTINGS));
  fields.endpoint.value = settings.endpoint;
  fields.model.value = settings.model;
  fields.apiKey.value = settings.apiKey;
  fields.showReference.checked = settings.showReference;

  document.getElementById("save").addEventListener("click", save);
  document.getElementById("openPanel").addEventListener("click", openPanel);
}

function migrateSettings(settings) {
  return {
    ...settings,
    endpoint: settings.endpoint === "https://api.openai.com/v1/chat/completions" ? DEFAULT_SETTINGS.endpoint : settings.endpoint,
    model: settings.model === "gpt-4.1-mini" || settings.model === "deepseek-chat" ? DEFAULT_SETTINGS.model : settings.model
  };
}

async function save() {
  await chrome.storage.sync.set({
    endpoint: fields.endpoint.value.trim() || DEFAULT_SETTINGS.endpoint,
    model: fields.model.value.trim() || DEFAULT_SETTINGS.model,
    apiKey: fields.apiKey.value.trim(),
    showReference: fields.showReference.checked
  });
  status.textContent = "已保存";
  setTimeout(() => {
    status.textContent = "";
  }, 1600);
}

async function openPanel() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    await chrome.sidePanel.open({ tabId: tab.id });
    window.close();
  }
}
