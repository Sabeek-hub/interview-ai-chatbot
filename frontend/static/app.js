/**
 * InterviewAI — Frontend Application Logic
 * Handles: chat, streaming, markdown, UI state, mobile sidebar
 */

'use strict';

// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  messages:        [],   // {role, content}
  category:        'general',
  model:           'llama3',
  isStreaming:     false,
  messageCount:    0,
};

// ─── DOM Refs ─────────────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const qs = sel => document.querySelector(sel);

const ui = {
  messagesContainer: $('messagesContainer'),
  welcomeCard:       $('welcomeCard'),
  userInput:         $('userInput'),
  sendBtn:           $('sendBtn'),
  typingIndicator:   $('typingIndicator'),
  statusDot:         $('statusDot'),
  statusLabel:       $('statusLabel'),
  mobileStatus:      $('mobileStatus'),
  modelSelect:       $('modelSelect'),
  questionList:      $('questionList'),
  chatTitle:         $('chatTitle'),
  chatSubtitle:      $('chatSubtitle'),
  messageCount:      $('messageCount'),
  charCount:         $('charCount'),
  clearBtn:          $('clearBtn'),
  exportBtn:         $('exportBtn'),
  sidebar:           $('sidebar'),
  hamburger:         $('hamburger'),
  sidebarOverlay:    $('sidebarOverlay'),
};

// ─── Category Meta ────────────────────────────────────────────────────────────
const CATEGORY_META = {
  general:      { title: 'General Interview',      subtitle: 'All-round interview preparation' },
  technical:    { title: 'Technical Interview',    subtitle: 'Coding & engineering depth' },
  behavioral:   { title: 'Behavioral Interview',   subtitle: 'STAR method & soft skills' },
  system_design:{ title: 'System Design',          subtitle: 'Architecture & scalability' },
  dsa:          { title: 'Data Structures & Algo', subtitle: 'Problem solving & complexity' },
  hr:           { title: 'HR / Culture Fit',       subtitle: 'Salary, motivation & fit' },
};

// ─── Marked.js Configuration ──────────────────────────────────────────────────
// NOTE: 'highlight' inside setOptions is deprecated in marked v4+.
// Use a custom renderer instead (done below).
marked.setOptions({ gfm: true, breaks: true });

// Custom renderer — adds syntax highlighting + copy button to every code block
const renderer = new marked.Renderer();
renderer.code = function(code, language) {
  // marked v4+ passes an object; v3 passes string args
  if (typeof code === 'object' && code !== null) {
    language = code.lang || '';
    code     = code.text || '';
  }
  const lang = (language || 'plaintext').trim();
  let highlighted;
  try {
    highlighted = lang && hljs.getLanguage(lang)
      ? hljs.highlight(code, { language: lang }).value
      : hljs.highlightAuto(code).value;
  } catch (e) { highlighted = escapeHtml(code); }

  return (
    `<pre><div class="code-header">` +
    `<span class="code-lang">${lang}</span>` +
    `<button class="copy-btn" onclick="copyCode(this)" data-code="${escapeAttr(code)}">Copy</button>` +
    `</div><code class="hljs language-${lang}">${highlighted}</code></pre>`
  );
};
marked.use({ renderer });

// ─── Sanitize Partial Markdown ─────────────────────────────────────────────────
// During streaming, code fences may not be closed yet (e.g. ```java\ncode...)
// This closes any open fence so marked renders a proper block instead of raw text.
function sanitizePartialMarkdown(text) {
  const fences = (text.match(/```/g) || []).length;
  // Odd number means one fence is still open — close it
  return fences % 2 !== 0 ? text + '\n```' : text;
}

// Parse markdown safely
function safeMarkdown(text) {
  try { return marked.parse(sanitizePartialMarkdown(text)); }
  catch (e) { return `<p>${escapeHtml(text)}</p>`; }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function escapeAttr(str) {
  return str.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function escapeHtml(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(str));
  return d.innerHTML;
}
function formatTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Toast notification
let toastTimer;
function showToast(msg, type = '') {
  let toast = qs('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className = `toast ${type}`;
  clearTimeout(toastTimer);
  requestAnimationFrame(() => toast.classList.add('show'));
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
}

// ─── Health Check ─────────────────────────────────────────────────────────────
async function checkHealth() {
  try {
    const res = await fetch('/api/health', { signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      ui.statusDot.className   = 'status-dot connected';
      ui.statusLabel.textContent = 'Ollama Connected';
      if (ui.mobileStatus) ui.mobileStatus.style.background = 'var(--accent-3)';
    } else throw new Error();
  } catch {
    ui.statusDot.className   = 'status-dot disconnected';
    ui.statusLabel.textContent = 'Ollama Offline';
    if (ui.mobileStatus) ui.mobileStatus.style.background = 'var(--accent-err)';
  }
}

// ─── Load Models ──────────────────────────────────────────────────────────────
async function loadModels() {
  try {
    const res = await fetch('/api/models', { signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    if (data.models && data.models.length > 0) {
      ui.modelSelect.innerHTML = data.models
        .map(m => `<option value="${m}" ${m === data.default ? 'selected' : ''}>${m}</option>`)
        .join('');
      state.model = data.default || data.models[0];
    }
  } catch {
    // Keep default option
  }
}

// ─── Load Sample Questions ─────────────────────────────────────────────────────
async function loadQuestions(category) {
  try {
    const res = await fetch(`/api/questions?category=${category}`);
    const data = await res.json();
    ui.questionList.innerHTML = (data.questions || [])
      .map(q => `<button class="question-chip" onclick="startConversation(this.textContent.trim())">${q}</button>`)
      .join('');
  } catch {
    ui.questionList.innerHTML = '';
  }
}

// ─── Category Switch ──────────────────────────────────────────────────────────
function switchCategory(category) {
  state.category = category;
  state.messages = [];

  // Update active button
  document.querySelectorAll('.category-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.category === category);
  });

  // Update header
  const meta = CATEGORY_META[category] || CATEGORY_META['general'];
  ui.chatTitle.textContent    = meta.title;
  ui.chatSubtitle.textContent = meta.subtitle;

  // Clear messages, restore welcome
  clearMessages();

  // Load new questions
  loadQuestions(category);
}

// ─── Clear Messages ───────────────────────────────────────────────────────────
function clearMessages() {
  state.messages = [];
  state.messageCount = 0;
  ui.messageCount.textContent = '0 messages';
  ui.messagesContainer.innerHTML = '';
  const welcome = document.createElement('div');
  welcome.id = 'welcomeCard';
  welcome.className = 'welcome-card';
  welcome.innerHTML = `
    <div class="welcome-icon">🤖</div>
    <h2 class="welcome-title">Ready to Ace Your Interview?</h2>
    <p class="welcome-text">
      Choose an interview category from the sidebar, then start a conversation.
      Your AI coach will ask questions, evaluate your answers, and help you improve — all offline.
    </p>
    <div class="welcome-chips">
      <button class="chip" onclick="startConversation('Tell me about yourself.')">Tell me about yourself</button>
      <button class="chip" onclick="startConversation('Give me a technical interview question.')">Technical question</button>
      <button class="chip" onclick="startConversation('Start a mock interview.')">Mock interview</button>
    </div>
  `;
  ui.messagesContainer.appendChild(welcome);
}

// ─── Start Conversation (from chip/question) ──────────────────────────────────
function startConversation(text) {
  ui.userInput.value = text;
  sendMessage();
}

// ─── Render a Message ─────────────────────────────────────────────────────────
function renderMessage(role, content, streaming = false) {
  // Remove welcome card on first message
  const wc = $('welcomeCard');
  if (wc) wc.remove();

  const div = document.createElement('div');
  div.className = `message ${role}`;
  const initial = role === 'user' ? 'You' : 'AI';

  div.innerHTML = `
    <div class="message-avatar">${initial}</div>
    <div class="message-content">
      <div class="message-meta">
        <span>${role === 'user' ? 'You' : 'AI Coach'}</span>
        <span>${formatTime()}</span>
        ${!streaming ? `<button class="copy-message-btn" onclick="copyMessageText(this)" title="Copy message">⎘ Copy</button>` : ''}
      </div>
      <div class="message-bubble" id="bubble-${Date.now()}">
        ${role === 'user' ? escapeHtml(content).replace(/\n/g, '<br>') : (streaming ? '' : marked.parse(content))}
      </div>
    </div>
  `;
  ui.messagesContainer.appendChild(div);
  scrollToBottom();

  state.messageCount++;
  ui.messageCount.textContent = `${state.messageCount} message${state.messageCount !== 1 ? 's' : ''}`;

  // Return bubble element for streaming updates
  return div.querySelector('.message-bubble');
}

// ─── Send Message ─────────────────────────────────────────────────────────────
async function sendMessage() {
  const text = ui.userInput.value.trim();
  if (!text || state.isStreaming) return;

  state.isStreaming = true;
  ui.sendBtn.disabled = true;
  ui.userInput.value = '';
  autoResizeTextarea();

  // Push user message
  state.messages.push({ role: 'user', content: text });
  renderMessage('user', text);

  // Show typing
  ui.typingIndicator.classList.remove('hidden');
  scrollToBottom();

  try {
    await streamResponse();
  } catch (err) {
    ui.typingIndicator.classList.add('hidden');
    showToast(`Error: ${err.message}`, 'error');
  } finally {
    state.isStreaming = false;
    ui.sendBtn.disabled = false;
    ui.userInput.focus();
  }
}

// ─── Stream Response from Backend ─────────────────────────────────────────────
async function streamResponse() {
  const response = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: state.messages,
      category: state.category,
      model:    state.model,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Unknown server error' }));
    throw new Error(err.error || `HTTP ${response.status}`);
  }

  ui.typingIndicator.classList.add('hidden');

  let bubble = null;
  let fullContent = '';

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop(); // keep incomplete chunk

    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith('data:')) continue;
      const jsonStr = line.slice(5).trim();
      try {
        const chunk = JSON.parse(jsonStr);

        if (chunk.error) {
          throw new Error(chunk.error);
        }

        const token = chunk.token || '';
        fullContent += token;

        if (!bubble) {
          bubble = renderMessage('assistant', '', true);
        }

        // Update bubble with live markdown (sanitized for incomplete fences)
        bubble.innerHTML = safeMarkdown(fullContent);
        scrollToBottom();

        if (chunk.done) break;
      } catch (parseErr) {
        if (parseErr.message && parseErr.message !== 'Unexpected end of JSON input') {
          throw parseErr;
        }
      }
    }
  }

  // Add copy button after streaming completes
  if (bubble) {
    const meta = bubble.closest('.message-content').querySelector('.message-meta');
    if (meta && !meta.querySelector('.copy-message-btn')) {
      const btn = document.createElement('button');
      btn.className = 'copy-message-btn';
      btn.textContent = '⎘ Copy';
      btn.title = 'Copy message';
      btn.onclick = () => copyMessageText(btn);
      meta.appendChild(btn);
    }
  }

  if (fullContent) {
    state.messages.push({ role: 'assistant', content: fullContent });
    // Final clean re-render with complete markdown (no sanitizer needed)
    if (bubble) {
      try { bubble.innerHTML = marked.parse(fullContent); } catch (e) {}
    }
  }
}

// ─── Scroll to Bottom ─────────────────────────────────────────────────────────
function scrollToBottom() {
  ui.messagesContainer.scrollTo({
    top: ui.messagesContainer.scrollHeight,
    behavior: 'smooth',
  });
}

// ─── Copy Helpers ─────────────────────────────────────────────────────────────
function copyCode(btn) {
  const code = btn.dataset.code;
  navigator.clipboard.writeText(code).then(() => {
    btn.textContent = '✓ Copied';
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
  });
}

function copyMessageText(btn) {
  const bubble = btn.closest('.message-content').querySelector('.message-bubble');
  const text = bubble.innerText || bubble.textContent;
  navigator.clipboard.writeText(text).then(() => {
    showToast('Copied to clipboard', 'success');
  });
}

// ─── Export Conversation ──────────────────────────────────────────────────────
function exportConversation() {
  if (state.messages.length === 0) { showToast('No messages to export'); return; }

  const lines = state.messages.map(m =>
    `**${m.role === 'user' ? 'You' : 'AI Coach'}** (${formatTime()})\n${m.content}`
  );

  const content = `# Interview Prep Conversation\n**Category:** ${state.category}\n**Date:** ${new Date().toLocaleString()}\n\n---\n\n${lines.join('\n\n---\n\n')}`;

  const blob = new Blob([content], { type: 'text/markdown' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `interview-${state.category}-${Date.now()}.md`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Conversation exported!', 'success');
}

// ─── Auto-resize Textarea ─────────────────────────────────────────────────────
function autoResizeTextarea() {
  const ta = ui.userInput;
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 180) + 'px';
  ui.charCount.textContent = ta.value.length || '';
}

// ─── Mobile Sidebar ───────────────────────────────────────────────────────────
function toggleSidebar() {
  const open = ui.sidebar.classList.toggle('open');
  ui.hamburger.classList.toggle('open', open);
  ui.sidebarOverlay.classList.toggle('hidden', !open);
  document.body.style.overflow = open ? 'hidden' : '';
}
function closeSidebar() {
  ui.sidebar.classList.remove('open');
  ui.hamburger.classList.remove('open');
  ui.sidebarOverlay.classList.add('hidden');
  document.body.style.overflow = '';
}

// ─── Event Listeners ──────────────────────────────────────────────────────────
ui.sendBtn.addEventListener('click', sendMessage);

ui.userInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

ui.userInput.addEventListener('input', autoResizeTextarea);

document.querySelectorAll('.category-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    switchCategory(btn.dataset.category);
    closeSidebar();
  });
});

ui.modelSelect.addEventListener('change', () => {
  state.model = ui.modelSelect.value;
  showToast(`Model switched to ${state.model}`);
});

ui.clearBtn.addEventListener('click', () => {
  clearMessages();
  showToast('Conversation cleared');
});

ui.exportBtn.addEventListener('click', exportConversation);

ui.hamburger.addEventListener('click', toggleSidebar);
ui.sidebarOverlay.addEventListener('click', closeSidebar);

// ─── Init ─────────────────────────────────────────────────────────────────────
(async function init() {
  await Promise.all([
    checkHealth(),
    loadModels(),
    loadQuestions('general'),
  ]);

  // Periodic health check
  setInterval(checkHealth, 30_000);

  // Focus input
  ui.userInput.focus();
})();
