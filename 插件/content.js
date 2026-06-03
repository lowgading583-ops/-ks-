const BUTTON_CLASS = "study-sidekick-button";
const PANEL_ID = "study-sidekick-panel";
const ROOT_ID = "study-sidekick-root";
const HIDDEN_PLACEHOLDER = "\u00a0";

let activeQuestion = "";

boot();

function boot() {
  injectPanel();
  scanQuestions();
  bindSelectionShortcut();

  const observer = new MutationObserver(debounce(scanQuestions, 800));
  observer.observe(document.body, { childList: true, subtree: true });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "ANALYSIS_READY") {
      return false;
    }
  });
}

function bindSelectionShortcut() {
  document.addEventListener("mouseup", () => {
    const selected = window.getSelection()?.toString().trim() || "";
    const existing = document.getElementById("study-sidekick-selection-button");

    if (existing) existing.remove();
    if (!looksLikeQuestion(selected)) return;

    const button = document.createElement("button");
    button.id = "study-sidekick-selection-button";
    button.className = BUTTON_CLASS;
    button.type = "button";
    button.textContent = HIDDEN_PLACEHOLDER;
    button.title = "解析当前选中的题目文本";
    button.style.position = "fixed";
    button.style.right = "18px";
    button.style.bottom = "18px";
    button.style.top = "auto";
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      analyzeText(selected, button);
    });

    document.documentElement.appendChild(button);
  });
}

function scanQuestions() {
  hideNativeAiButtons();
  attachToQuestionNumbers();
}

function hideNativeAiButtons() {
  findNativeAiButtons().forEach((nativeButton) => {
    if (nativeButton.dataset.studySidekickHandled === "true") return;
    nativeButton.dataset.studySidekickHandled = "true";
    nativeButton.style.display = "none";
  });
}

function attachToQuestionNumbers() {
  findQuestionNumberTextNodes().forEach((textNode) => {
    const parent = textNode.parentElement;
    if (!parent || parent.closest(`#${ROOT_ID}`)) return;
    if (parent.dataset.studySidekickNumber === "true") return;
    if (parent.querySelector(`.${BUTTON_CLASS}`)) return;

    const block = findQuestionBlockForStart(parent);
    if (!block) return;

    parent.dataset.studySidekickNumber = "true";
    attachButtonBeforeNumber(textNode, block);
  });
}

function findQuestionNumberTextNodes() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest(`#${ROOT_ID}, script, style, textarea, input, button, a`)) {
        return NodeFilter.FILTER_REJECT;
      }
      const text = node.nodeValue || "";
      if (!isQuestionNumberPrefix(text)) return NodeFilter.FILTER_REJECT;
      if (!isVisibleQuestionNumberNode(node)) return NodeFilter.FILTER_REJECT;

      const parentText = parent.innerText || "";
      if (/我的答案\s*[:：]?\s*[A-Z]|正确答案\s*[:：]?\s*[A-Z]/.test(parentText)) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  return nodes;
}

function isVisibleQuestionNumberNode(node) {
  const parent = node.parentElement;
  if (!parent) return false;

  const text = node.nodeValue || "";
  const questionNumber = text.match(/^\s*(\d{1,3})[.．、](?!\d)/);
  if (!questionNumber) return false;

  const range = document.createRange();
  range.setStart(node, 0);
  range.setEnd(node, Math.min(node.length, questionNumber[0].length));
  const rect = range.getBoundingClientRect();
  range.detach();

  if (!rect.width && !rect.height) return false;

  const parentRect = parent.getBoundingClientRect();
  const leftSlack = Math.max(36, parentRect.width * 0.08);
  if (rect.left - parentRect.left > leftSlack) return false;

  const previousText = collectNearbyPreviousText(node, 80);
  if (/[A-Z][.、．]\s*$/.test(previousText)) return false;
  if (/我的答案|正确答案|答案\s*[:：]?\s*[A-Z]/.test(previousText)) return false;

  return true;
}

function collectNearbyPreviousText(node, maxLength) {
  let current = node;
  let text = "";

  while (current && text.length < maxLength) {
    let previous = current.previousSibling;
    while (previous && text.length < maxLength) {
      text = getNodeTailText(previous, maxLength - text.length) + text;
      previous = previous.previousSibling;
    }
    current = current.parentElement;
    if (!current || current === document.body) break;
  }

  return text.replace(/\s+/g, " ");
}

function getNodeTailText(node, maxLength) {
  const text = node.textContent || "";
  return text.slice(Math.max(0, text.length - maxLength));
}

function findQuestionBlockForStart(start) {
  let current = start;
  let fallback = null;

  while (current && current !== document.body) {
    const text = current.innerText || "";
    if (looksLikeQuestion(text)) {
      fallback = current;
      if (/(^|\n|\s)[A-Z][.、．]/.test(text)) return current;
    }
    current = current.parentElement;
  }

  return fallback;
}

function findQuestionBlocks() {
  const selectors = [
    ".TiMu",
    ".question",
    ".question-item",
    ".questionLi",
    ".Cy_TItle",
    ".mark_item",
    "[class*='question']",
    "[class*='Question']",
    "[class*='tm']"
  ];

  const selected = selectors.flatMap((selector) => Array.from(document.querySelectorAll(selector)));
  const textBlocks = Array.from(document.querySelectorAll("div, li, section, article"))
    .filter((node) => looksLikeQuestion(node.innerText || ""));

  return pruneQuestionBlocks(uniqueElements([...selected, ...textBlocks])
    .filter((node) => node instanceof HTMLElement)
    .filter((node) => looksLikeQuestion(node.innerText || ""))
    .filter((node) => node.offsetWidth > 180 && node.offsetHeight > 40));
}

function looksLikeQuestion(text) {
  const clean = text.trim();
  if (clean.length < 18 || clean.length > 5000) return false;
  if (/我的答案\s*[:：]?\s*[A-Z]|正确答案\s*[:：]?\s*[A-Z]/.test(clean) && clean.length < 260) return false;

  const hasIndex = /(^|\n|\s)\d{1,3}[.、．](?!\d)/.test(clean);
  const hasOptions = /(^|\n|\s)[A-Z][.、．]/.test(clean);
  const hasQuestionWords = /(单选|多选|判断|填空|题|答案|下列|属于|正确|错误|不正确|核心|内容)/.test(clean)
    || /\b(question|single[-\s]?choice|single[-\s]?select|multiple[-\s]?choice|multiple[-\s]?select|multi[-\s]?select|select all|choose all|all that apply|answer|which|what|following|correct|incorrect|true|false)\b/i.test(clean);
  return (hasIndex && hasQuestionWords) || (hasOptions && hasQuestionWords);
}

function pruneQuestionBlocks(blocks) {
  const sorted = blocks
    .map((block) => ({ block, rect: block.getBoundingClientRect(), textLength: (block.innerText || "").length }))
    .filter((item) => item.rect.width > 0 && item.rect.height > 0)
    .sort((a, b) => {
      const topDiff = a.rect.top - b.rect.top;
      if (Math.abs(topDiff) > 24) return topDiff;
      return b.rect.height - a.rect.height || b.textLength - a.textLength;
    });

  const picked = [];
  sorted.forEach((item) => {
    const overlapsPicked = picked.some((chosen) => verticalOverlap(item.rect, chosen.rect) > 0.42);
    if (!overlapsPicked) picked.push(item);
  });

  return picked.map((item) => item.block);
}

function cleanupDuplicateButtons() {
  const buttons = Array.from(document.querySelectorAll(`.${BUTTON_CLASS}:not(#study-sidekick-selection-button)`))
    .map((button) => ({ button, rect: button.getBoundingClientRect() }))
    .sort((a, b) => a.rect.top - b.rect.top || a.rect.left - b.rect.left);

  const kept = [];
  buttons.forEach((item) => {
    const duplicate = kept.some((chosen) => Math.abs(item.rect.top - chosen.rect.top) < 90);
    if (duplicate) {
      item.button.remove();
      return;
    }
    kept.push(item);
  });
}

function verticalOverlap(a, b) {
  const overlap = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return overlap / Math.max(1, Math.min(a.height, b.height));
}

function attachButton(block, nativeButton) {
  block.dataset.studySidekickQuestion = "true";
  const button = document.createElement("button");
  button.className = BUTTON_CLASS;
  button.type = "button";
  button.textContent = HIDDEN_PLACEHOLDER;
  button.title = "识别这道题的选项答案";
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    analyzeBlock(block, button);
  });

  if (nativeButton?.parentElement) {
    button.classList.add("is-inline");
    nativeButton.insertAdjacentElement("afterend", button);
    return;
  }

  const position = getComputedStyle(block).position;
  if (position === "static") block.style.position = "relative";
  block.appendChild(button);
}

function attachButtonBeforeNumber(textNode, block) {
  const button = document.createElement("button");
  button.className = `${BUTTON_CLASS} is-number-prefix`;
  button.type = "button";
  button.textContent = HIDDEN_PLACEHOLDER;
  button.title = "识别这道题的选项答案";
  button.dataset.questionText = extractQuestionTextFromNumber(textNode);
  button.dataset.answer = "";
  button.dataset.visible = "false";
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    analyzeBlock(block, button);
  });

  textNode.parentElement.insertBefore(button, textNode);
}

function findNativeAiButtons() {
  return Array.from(document.querySelectorAll("button, a, span, div"))
    .filter((node) => {
      if (!(node instanceof HTMLElement)) return false;
      if (node.closest(`#${ROOT_ID}`)) return false;
      const text = (node.innerText || node.textContent || "").replace(/\s+/g, "");
      return text === "AI讲解" || text === "AI解析";
    })
    .filter((node) => node.offsetWidth > 0 && node.offsetHeight > 0);
}

function findQuestionBlockFor(node) {
  let current = node.parentElement;
  while (current && current !== document.body) {
    const text = current.innerText || "";
    if (looksLikeQuestion(text) && /(^|\n|\s)[A-Z][.、．]/.test(text)) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

async function analyzeBlock(block, button) {
  if (button.dataset.answer) {
    toggleCachedAnswer(button);
    return;
  }

  const question = cleanQuestionText(button.dataset.questionText || block.innerText || "");
  analyzeText(question, button);
}

function toggleCachedAnswer(button) {
  const isVisible = button.dataset.visible === "true";
  button.textContent = isVisible ? HIDDEN_PLACEHOLDER : button.dataset.answer;
  button.dataset.visible = isVisible ? "false" : "true";
  button.title = isVisible ? "点击显示选项答案" : "点击隐藏选项答案";
}

async function analyzeText(question, button) {
  activeQuestion = question;
  clearInlineAnswer(button);
  button.disabled = true;
  button.textContent = "...";

  const response = await sendRuntimeMessage({
    type: "ANALYZE_QUESTION",
    payload: {
      id: crypto.randomUUID(),
      question,
      sourceUrl: location.href
    }
  });

  button.disabled = false;

  if (!response?.ok) {
    button.textContent = HIDDEN_PLACEHOLDER;
    button.title = response?.error || "请刷新页面";
    return;
  }

  renderInlineAnswer(button, response.result?.answer || "?");
}

function renderInlineAnswer(button, answer) {
  clearInlineAnswer(button);
  const clean = cleanAnswer(answer);
  button.dataset.answer = clean;
  button.dataset.visible = "true";
  button.textContent = clean;
  button.title = "点击隐藏选项答案";
}

function clearInlineAnswer(button) {
  const oldBadge = button.parentElement?.querySelector(".study-sidekick-answer");
  if (oldBadge) oldBadge.remove();
  const floatingBadge = document.documentElement.querySelector(".study-sidekick-answer");
  if (floatingBadge) floatingBadge.remove();
}

function cleanAnswer(answer) {
  const value = String(answer || "").trim();
  if (/未配置|未识别/.test(value)) return value;

  const unique = extractOptionLetters(value);
  return unique.length ? unique.join("") : "?";
}

function extractOptionLetters(value) {
  const normalized = String(value || "").toUpperCase().trim();
  if (/^[A-Z]{1,26}$/.test(normalized)) return [...new Set(normalized.split(""))];

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
  return [...new Set(letters)];
}

function extractQuestionTextFromNumber(startTextNode) {
  const parts = [];
  let started = false;
  let sawOptionText = false;

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest(`#${ROOT_ID}, script, style, textarea, input, button, a`)) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node === startTextNode) started = true;
    if (!started) continue;

    const text = normalizeSegment(node.nodeValue || "");
    if (!text) continue;

    if (node !== startTextNode && isQuestionNumberPrefix(text) && isVisibleQuestionNumberNode(node)) break;
    if (isResultOrScoreText(text)) {
      if (sawOptionText) break;
      continue;
    }

    parts.push(text);

    if (/^[A-Z][.、．]?/.test(text)) sawOptionText = true;
  }

  return parts.join("\n");
}

function normalizeSegment(text) {
  return text
    .replace(/\s+/g, " ")
    .replace(/^\s+|\s+$/g, "")
    .replace(/^[?？]\s*/, "");
}

function isQuestionNumberPrefix(text) {
  return /^\s*\d{1,3}[.．、](?!\d)\s*/.test(text);
}

function isResultOrScoreText(text) {
  return /我的答案|正确答案|^\d+(\.\d+)?\s*分$|^[✓√]$|AI讲解|AI解析/.test(text);
}

function injectPanel() {
  if (document.getElementById(ROOT_ID)) return;

  const root = document.createElement("div");
  root.id = ROOT_ID;
  root.innerHTML = `
    <aside id="${PANEL_ID}" aria-label="学习助手">
      <div class="ss-header">
        <div>
          <strong>学习助手</strong>
          <span>解析 / 知识点 / 排除法</span>
        </div>
        <button type="button" class="ss-close" title="关闭">×</button>
      </div>
      <div class="ss-body">
        <div class="ss-empty">点击题目旁的“AI 解析”开始。</div>
      </div>
    </aside>
  `;
  document.documentElement.appendChild(root);

  root.querySelector(".ss-close").addEventListener("click", closePanel);
}

function openPanel() {
  document.documentElement.classList.add("study-sidekick-open");
  sendRuntimeMessage({ type: "OPEN_SIDE_PANEL" });
}

function closePanel() {
  document.documentElement.classList.remove("study-sidekick-open");
}

function renderLoading(question) {
  const body = getBody();
  body.innerHTML = `
    <section class="ss-card">
      <div class="ss-label">当前题目</div>
      <p>${escapeHtml(shorten(question, 260))}</p>
    </section>
    <section class="ss-card">
      <div class="ss-loader"></div>
      <p>正在生成学习解析...</p>
    </section>
  `;
}

function renderError(error) {
  getBody().innerHTML = `
    <section class="ss-card ss-error">
      <div class="ss-label">解析失败</div>
      <p>${escapeHtml(error)}</p>
    </section>
  `;
}

function renderResult(result) {
  const body = getBody();
  body.innerHTML = `
    <section class="ss-card">
      <div class="ss-label">题目</div>
      <p>${escapeHtml(shorten(result.question || activeQuestion, 360))}</p>
    </section>
    <section class="ss-card ss-answer">
      <div class="ss-label">参考结论</div>
      <p>${escapeHtml(result.answer || "请结合解析自行判断。")}</p>
    </section>
    ${renderList("解题思路", [result.reasoning])}
    ${renderList("知识点", result.knowledgePoints)}
    ${renderList("排除法", result.elimination)}
    <section class="ss-card">
      <div class="ss-label">复习建议</div>
      <p>${escapeHtml(result.nextReview || "把易错点整理成笔记。")}</p>
    </section>
  `;
  openPanel();
}

function renderList(title, items = []) {
  const filtered = items.filter(Boolean);
  if (!filtered.length) return "";
  return `
    <section class="ss-card">
      <div class="ss-label">${escapeHtml(title)}</div>
      <ul>${filtered.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </section>
  `;
}

function getBody() {
  return document.querySelector(`#${PANEL_ID} .ss-body`);
}

function cleanQuestionText(text) {
  return text
    .replace(/AI\s*解析|解析中/g, "")
    .replace(/\?/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s([A-Z][.、．])/g, "\n$1")
    .trim();
}

function shorten(text, max) {
  return text && text.length > max ? `${text.slice(0, max)}...` : text || "";
}

function uniqueElements(elements) {
  return [...new Set(elements)];
}

function debounce(fn, wait) {
  let timer = 0;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function sendRuntimeMessage(message) {
  try {
    if (!chrome?.runtime?.id) {
      return { ok: false, error: "扩展上下文已更新，请刷新当前页面。" };
    }
    return await chrome.runtime.sendMessage(message);
  } catch (error) {
    return {
      ok: false,
      error: error?.message || "扩展通信失败，请刷新当前页面。"
    };
  }
}
