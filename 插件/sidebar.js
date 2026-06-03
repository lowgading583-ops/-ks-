const app = document.getElementById("app");
const DEFAULT_SETTINGS = {
  endpoint: "https://api.deepseek.com/chat/completions",
  model: "deepseek-v4-flash",
  apiKey: "",
  showReference: true
};

const settingsForm = document.getElementById("settingsForm");
const settingsStatus = document.getElementById("settingsStatus");
const fields = {
  endpoint: document.getElementById("endpoint"),
  model: document.getElementById("model"),
  apiKey: document.getElementById("apiKey"),
  showReference: document.getElementById("showReference")
};

initSettings();

chrome.storage.local.get("lastResult").then(({ lastResult }) => {
  if (lastResult) render(lastResult);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.lastResult?.newValue) {
    render(changes.lastResult.newValue);
  }
});

async function initSettings() {
  const settings = migrateSettings(await chrome.storage.sync.get(DEFAULT_SETTINGS));
  fields.endpoint.value = settings.endpoint;
  fields.model.value = settings.model;
  fields.apiKey.value = settings.apiKey;
  fields.showReference.checked = settings.showReference;

  document.getElementById("toggleSettings").addEventListener("click", () => {
    settingsForm.hidden = !settingsForm.hidden;
  });

  settingsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await chrome.storage.sync.set({
      endpoint: fields.endpoint.value.trim() || DEFAULT_SETTINGS.endpoint,
      model: fields.model.value.trim() || DEFAULT_SETTINGS.model,
      apiKey: fields.apiKey.value.trim(),
      showReference: fields.showReference.checked
    });
    settingsStatus.textContent = "已保存，回到题目页重新点击 AI 解析。";
    setTimeout(() => {
      settingsStatus.textContent = "";
    }, 2200);
  });
}

function migrateSettings(settings) {
  return {
    ...settings,
    endpoint: settings.endpoint === "https://api.openai.com/v1/chat/completions" ? DEFAULT_SETTINGS.endpoint : settings.endpoint,
    model: settings.model === "gpt-4.1-mini" || settings.model === "deepseek-chat" ? DEFAULT_SETTINGS.model : settings.model
  };
}

function render(result) {
  app.innerHTML = `
    <section class="card">
      <div class="label">题目</div>
      <p>${escapeHtml(shorten(result.question, 360))}</p>
    </section>
    <section class="card answer">
      <div class="label">选项答案</div>
      <p>${escapeHtml(result.answer || "请重新点击题目旁的 AI 解析。")}</p>
    </section>
  `;
}

function renderList(title, items = []) {
  const filtered = items.filter(Boolean);
  if (!filtered.length) return "";
  return `
    <section class="card">
      <div class="label">${escapeHtml(title)}</div>
      <ul>${filtered.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </section>
  `;
}

function shorten(text, max) {
  return text && text.length > max ? `${text.slice(0, max)}...` : text || "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
