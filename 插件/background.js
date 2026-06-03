const DEFAULT_SETTINGS = {
  endpoint: "https://api.deepseek.com/chat/completions",
  model: "deepseek-v4-flash",
  apiKey: "",
  showReference: true
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "ANALYZE_QUESTION") {
    analyzeQuestion(message.payload)
      .then((result) => {
        persistResult(result, sender.tab?.id);
        sendResponse({ ok: true, result });
      })
      .catch((error) => {
        sendResponse({ ok: false, error: error.message || "解析失败" });
      });
    return true;
  }

  if (message?.type === "OPEN_SIDE_PANEL" && sender.tab?.id) {
    chrome.sidePanel?.open({ tabId: sender.tab.id }).catch(() => {});
    sendResponse({ ok: true });
  }

  return false;
});

async function analyzeQuestion(payload) {
  const settings = await getSettings();
  const question = normalizeText(payload?.question || "");
  const questionType = detectQuestionType(question);

  if (!question) {
    throw new Error("没有识别到题目文本");
  }

  if (!settings.apiKey) {
    return buildLocalGuide(question);
  }

  const prompt = [
    "你是选择题答案识别助手。",
    "只输出选项字母，不要输出解析、标点、空格或其他文字。",
    "For English questions, output option letters only. Do not output words or explanations.",
    questionType === "multiple"
      ? "这是一道多选题或英文 multiple-select 题，请输出所有正确选项字母，例如：ACGI"
      : "这是一道单选题或英文 single-select 题，请只输出一个最可能的选项字母，例如：A",
    "",
    "题目：",
    question
  ].join("\n");

  const response = await fetch(settings.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({
      model: settings.model,
      messages: [
        {
          role: "system",
          content: questionType === "multiple"
            ? "只回答多个选项字母。不要解释。"
            : "只回答一个选项字母。不要解释。"
        },
        {
          role: "user",
          content: prompt
        }
      ],
      thinking: {
        type: "disabled"
      },
      temperature: 0,
      max_tokens: questionType === "multiple" ? 32 : 16
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI 接口错误：${response.status} ${text.slice(0, 160)}`);
  }

  const data = await response.json();
  const message = data.choices?.[0]?.message || {};
  const content = [
    message.content,
    message.reasoning_content
  ].filter(Boolean).join("\n");
  const answer = extractAnswer(content, questionType);

  return {
    id: payload?.id || crypto.randomUUID(),
    question,
    questionType,
    sourceUrl: payload?.sourceUrl || "",
    createdAt: new Date().toISOString(),
    answer: answer || "?"
  };
}

async function getSettings() {
  const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
  const settings = { ...DEFAULT_SETTINGS, ...stored };
  if (settings.endpoint === "https://api.openai.com/v1/chat/completions") {
    settings.endpoint = DEFAULT_SETTINGS.endpoint;
  }
  if (settings.model === "gpt-4.1-mini" || settings.model === "deepseek-chat") {
    settings.model = DEFAULT_SETTINGS.model;
  }
  return settings;
}

async function persistResult(result, tabId) {
  await chrome.storage.local.set({ lastResult: result });
  if (tabId) {
    chrome.tabs.sendMessage(tabId, { type: "ANALYSIS_READY", payload: result }).catch(() => {});
  }
}

function buildLocalGuide(question) {
  const options = question.match(/(^|\n)\s*[A-Z][.．、\s][^\n]+/g) || [];
  const questionType = detectQuestionType(question);

  return {
    id: crypto.randomUUID(),
    question,
    questionType,
    sourceUrl: "",
    createdAt: new Date().toISOString(),
    answer: options.length ? "未配置 API Key" : "未识别选项"
  };
}

function normalizeText(text) {
  return text.replace(/\s+/g, " ").replace(/\s([A-Z][.．、])/g, "\n$1").trim().slice(0, 6000);
}

function detectQuestionType(question) {
  const text = String(question || "");
  if (/多选|多项选择|多项题|不定项/.test(text)) return "multiple";
  if (/\b(multiple[-\s]?choice|multiple[-\s]?select|multi[-\s]?select|select all|choose all|all that apply|more than one|one or more)\b/i.test(text)) {
    return "multiple";
  }
  return "single";
}

function extractAnswer(content, questionType = "single") {
  const letters = extractOptionLetters(content);
  if (questionType === "multiple") return letters.join("");

  return letters[0] || "";
}

function extractOptionLetters(content) {
  const normalized = String(content || "").toUpperCase().trim();
  if (/^[A-Z]{1,26}$/.test(normalized)) return uniqueLetters(normalized.split(""));

  const labelMatch = normalized.match(/(?:答案|正确答案|选项|ANSWER|ANS|OPTION|OPTIONS|CHOICE|CHOICES)\s*(?:IS|ARE|为|是)?\s*[:：-]?\s*(.+)$/);
  if (labelMatch) {
    const labeled = extractStandaloneLetters(labelMatch[1]);
    if (labeled.length) return labeled;
  }

  return extractStandaloneLetters(normalized);
}

function extractStandaloneLetters(text) {
  const letters = [];
  const regex = /(?:^|[^A-Z])([A-Z])(?:$|[^A-Z])/g;
  let match;
  while ((match = regex.exec(text))) {
    letters.push(match[1]);
  }
  return uniqueLetters(letters);
}

function uniqueLetters(letters) {
  return [...new Set(letters)];
}
