# 🤖 InterviewAI — Offline Interview Preparation Chatbot

> A fully offline, locally-run AI interview coach powered by **Llama 3** and **Ollama**.  
> Practice **Technical**, **Behavioral**, **System Design**, **DSA**, and **HR** interviews — all privately on your machine.

---

## ✨ Features

| Feature | Details |
|---|---|
| 🎯 6 Interview Modes | General · Technical · Behavioral · System Design · DSA · HR |
| 🤖 Any Ollama Model | llama3, llama2, mistral, codellama, gemma, phi3 |
| ⚡ Streaming Responses | Token-by-token output for instant feedback |
| 💻 Code Highlighting | Syntax-highlighted code blocks with one-click copy |
| 📝 Markdown Rendering | Rich formatted answers with tables, lists, headings |
| 📤 Export Chat | Download full conversation as a Markdown file |
| 🔒 100% Offline | No internet required after setup — your data stays local |
| 📱 Responsive | Works on desktop and mobile |

---

## 🚀 Quick Start

### 1. Install Ollama

```bash
# macOS / Linux
curl -fsSL https://ollama.com/install.sh | sh

# macOS (Homebrew)
brew install ollama
```

> Windows: Download from [https://ollama.com/download](https://ollama.com/download)

### 2. Pull a Model

```bash
ollama pull llama3          # Recommended (4.7GB)
# OR
ollama pull llama2          # Older, smaller
ollama pull mistral         # Fast & capable
ollama pull codellama       # Code-focused
```

### 3. Start Ollama

```bash
ollama serve
```

> Keep this terminal open. Ollama runs at `http://localhost:11434`

### 4. Clone & Set Up the App

```bash
# Navigate to project directory
cd "chat bot new"

# Create virtual environment
python3 -m venv venv
source venv/bin/activate        # macOS/Linux
# venv\Scripts\activate         # Windows

# Install dependencies
pip install -r requirements.txt
```

### 5. Run the App

```bash
python app.py
```

Open your browser: **[http://localhost:5000](http://localhost:5000)**

---

## 📁 Project Structure

```
chat bot new/
├── app.py                  # Flask backend (API + routing)
├── requirements.txt        # Python dependencies
├── README.md               # This file
├── templates/
│   └── index.html          # Main HTML template
└── static/
    ├── style.css           # Premium dark theme styles
    └── app.js              # Frontend logic (chat, streaming, UI)
```

---

## 🎓 Interview Categories

| Category | What It Covers |
|---|---|
| **General** | Tell me about yourself, strengths/weaknesses, career goals |
| **Technical** | System internals, design patterns, language specifics |
| **Behavioral** | STAR method, conflict resolution, leadership stories |
| **System Design** | URL shorteners, distributed systems, database design |
| **DSA** | Arrays, trees, graphs, DP, sorting — with code solutions |
| **HR / Culture** | Salary negotiation, culture fit, motivations |

---

## ⚙️ Configuration

Edit `app.py` to customize:

```python
OLLAMA_BASE_URL = "http://localhost:11434"   # Ollama server URL
DEFAULT_MODEL   = "llama3"                   # Default model
STREAM_TIMEOUT  = 120                        # Response timeout (seconds)
```

---

## 🛠️ Troubleshooting

| Problem | Solution |
|---|---|
| "Ollama not running" | Run `ollama serve` in a separate terminal |
| Model not found | Run `ollama pull llama3` |
| Slow responses | Use a smaller model: `ollama pull phi3` |
| Port conflict | Change port in `app.py`: `app.run(port=5001)` |
| Model quality | Try `ollama pull llama3` instead of llama2 |

---

## 📝 Example Conversation

```
You:    "Tell me about yourself."

AI:     Great question! Let's frame your answer using the Present-Past-Future 
        structure most interviewers love:
        
        **Present** — Start with your current role and what you do...
        **Past** — Briefly mention key experiences...
        **Future** — Connect to why you want THIS role...
        
        Want to try answering? I'll give you detailed feedback.
```

---

## 🤝 Tips for Best Results

1. **Be specific** — "I worked on a REST API" is better than "I did backend work"
2. **Use STAR format** for behavioral questions — Situation, Task, Action, Result
3. **Ask for feedback** — "What could I improve in that answer?"
4. **Practice daily** — Even 20 minutes a day makes a big difference
5. **Request a mock interview** — Just say "Start a mock interview"

---

## 📜 License

MIT License — Free to use and modify. No warranty provided.
