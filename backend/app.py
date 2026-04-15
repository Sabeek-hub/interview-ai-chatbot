"""
Offline AI Interview Preparation Chatbot
Backend: Flask + Ollama (Llama model)
"""

import json
import os
import io
import requests
import fitz  # PyMuPDF
import docx
from werkzeug.utils import secure_filename
from flask import Flask, render_template, request, jsonify, Response, stream_with_context
from flask_cors import CORS

# Resolve paths relative to this file so the app can be run from any directory
BASE_DIR      = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR  = os.path.join(BASE_DIR, '..', 'frontend')

app = Flask(
    __name__,
    template_folder=os.path.join(FRONTEND_DIR, 'templates'),
    static_folder=os.path.join(FRONTEND_DIR, 'static'),
)
CORS(app)

# ─── Config ──────────────────────────────────────────────────────────────────
OLLAMA_BASE_URL = "http://localhost:11434"
DEFAULT_MODEL   = "llama3"          # change to llama2, mistral, etc. if needed
STREAM_TIMEOUT  = 120               # seconds

# ─── System Prompts per Category ─────────────────────────────────────────────
SYSTEM_PROMPTS = {
    "general": (
        "You are an expert interview coach with 15+ years of experience helping candidates "
        "land jobs at top tech companies (FAANG, startups, unicorns). "
        "Your role is to simulate a real interview environment, ask relevant follow-up questions, "
        "provide detailed feedback on answers, and suggest improvements. "
        "Be encouraging yet honest. Format responses clearly with sections when helpful."
    ),
    "technical": (
        "You are a senior software engineer and technical interviewer at a top tech company. "
        "Focus on data structures, algorithms, system design, coding best practices, "
        "time/space complexity, and clean code principles. "
        "When the candidate answers, evaluate correctness, efficiency, and clarity. "
        "Provide example code snippets in markdown code blocks when appropriate. "
        "Ask probing follow-up questions to test depth of understanding."
    ),
    "behavioral": (
        "You are an experienced HR director and behavioral interview specialist. "
        "Use the STAR method (Situation, Task, Action, Result) to guide responses. "
        "Ask questions about teamwork, leadership, conflict resolution, failure, success, "
        "time management, and career motivation. "
        "After each answer, provide structured feedback on what was strong and what could be improved. "
        "Focus on real, specific examples rather than generic answers."
    ),
    "system_design": (
        "You are a principal engineer specializing in large-scale distributed systems. "
        "Guide candidates through system design interviews covering: requirements gathering, "
        "high-level design, component breakdown, scalability, database design, API design, "
        "caching strategies, load balancing, and failure handling. "
        "Draw ASCII diagrams when helpful. Ask clarifying questions as a real interviewer would. "
        "Evaluate trade-offs and push candidates to think about edge cases."
    ),
    "hr": (
        "You are a talent acquisition specialist and HR interview expert. "
        "Cover topics like salary negotiation, company culture fit, career goals, "
        "strengths and weaknesses, why the candidate wants this role, and work-life balance. "
        "Help candidates craft compelling narratives about their career journey. "
        "Provide tips on body language, tone, and professional communication."
    ),
    "dsa": (
        "You are an algorithms expert and competitive programmer. "
        "Focus exclusively on Data Structures and Algorithms: arrays, linked lists, trees, "
        "graphs, dynamic programming, sorting, searching, recursion, and more. "
        "Present problems progressively from easy to hard. "
        "After the candidate attempts a solution, provide the optimal approach with full code "
        "in Python or the candidate's preferred language. "
        "Always analyze time and space complexity."
    ),
    "resume_analysis": (
        "You are an expert tech recruiter and Applicant Tracking System (ATS) evaluator. "
        "The user will provide the text directly extracted from their resume. "
        "Your task is to analyze this resume and provide structured, actionable feedback. "
        "First, give the resume an ATS-friendliness score out of 100. "
        "Then, break your feedback down into these categories: "
        "1. Format & Readability (Identify formatting issues that might break ATS parsers) "
        "2. Impact & Metrics (Are they using enough numbers and action verbs?) "
        "3. Missing Keywords (Suggest technical/soft skills that seem missing for a typical SWE role) "
        "4. Top 3 Immediate Recommendations. "
        "Be extremely objective and professional. Do not rewrite the resume for them, just evaluate it."
    )
}

# ─── Routes ───────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/models", methods=["GET"])
def get_models():
    """Return list of locally available Ollama models."""
    try:
        resp = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=10)
        resp.raise_for_status()
        models = [m["name"] for m in resp.json().get("models", [])]
        return jsonify({"models": models, "default": DEFAULT_MODEL})
    except requests.exceptions.ConnectionError:
        return jsonify({"error": "Ollama not running. Start with: ollama serve"}), 503
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/chat", methods=["POST"])
def chat():
    """Non-streaming chat endpoint."""
    data = request.get_json(silent=True) or {}
    messages  = data.get("messages", [])
    category  = data.get("category", "general")
    model     = data.get("model", DEFAULT_MODEL)

    if not messages:
        return jsonify({"error": "No messages provided"}), 400

    full_messages = _build_messages(messages, category)

    try:
        resp = requests.post(
            f"{OLLAMA_BASE_URL}/api/chat",
            json={"model": model, "messages": full_messages, "stream": False},
            timeout=STREAM_TIMEOUT,
        )
        resp.raise_for_status()
        content = resp.json()["message"]["content"]
        return jsonify({"response": content})
    except requests.exceptions.ConnectionError:
        return jsonify({"error": "Ollama is not running. Please run: ollama serve"}), 503
    except requests.exceptions.Timeout:
        return jsonify({"error": "Request timed out. The model may be loading — try again."}), 504
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/chat/stream", methods=["POST"])
def chat_stream():
    """Streaming chat endpoint — yields token-by-token SSE."""
    data = request.get_json(silent=True) or {}
    messages = data.get("messages", [])
    category = data.get("category", "general")
    model    = data.get("model", DEFAULT_MODEL)

    if not messages:
        return jsonify({"error": "No messages provided"}), 400

    full_messages = _build_messages(messages, category)

    def generate():
        try:
            with requests.post(
                f"{OLLAMA_BASE_URL}/api/chat",
                json={"model": model, "messages": full_messages, "stream": True},
                stream=True,
                timeout=STREAM_TIMEOUT,
            ) as r:
                r.raise_for_status()
                for line in r.iter_lines():
                    if line:
                        try:
                            chunk = json.loads(line)
                            token = chunk.get("message", {}).get("content", "")
                            done  = chunk.get("done", False)
                            payload = json.dumps({"token": token, "done": done})
                            yield f"data: {payload}\n\n"
                            if done:
                                break
                        except json.JSONDecodeError:
                            continue
        except requests.exceptions.ConnectionError:
            err = json.dumps({"error": "Ollama is not running. Run: ollama serve"})
            yield f"data: {err}\n\n"
        except Exception as e:
            err = json.dumps({"error": str(e)})
            yield f"data: {err}\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.route("/api/health", methods=["GET"])
def health():
    """Check Ollama connectivity."""
    try:
        resp = requests.get(f"{OLLAMA_BASE_URL}/api/tags", timeout=5)
        resp.raise_for_status()
        return jsonify({"status": "ok", "ollama": "connected"})
    except Exception:
        return jsonify({"status": "error", "ollama": "disconnected"}), 503


@app.route("/api/questions", methods=["GET"])
def sample_questions():
    """Return sample interview questions by category."""
    category = request.args.get("category", "general")
    questions = SAMPLE_QUESTIONS.get(category, SAMPLE_QUESTIONS["general"])
    return jsonify({"questions": questions})


@app.route("/api/upload-resume", methods=["POST"])
def upload_resume():
    """Extract text from uploaded resume, prepend to prompt, and stream analysis."""
    if "file" not in request.files:
        return jsonify({"error": "No file part"}), 400
    
    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No selected file"}), 400
    
    model = request.form.get("model", DEFAULT_MODEL)
    
    try:
        extracted_text = extract_text_from_file(file)
        if not extracted_text.strip():
            return jsonify({"error": "Could not extract text from document."}), 400
    except Exception as e:
        return jsonify({"error": f"Error parsing file: {str(e)}"}), 500

    # Build prompt structure
    messages = [{"role": "user", "content": f"Here is my resume text for ATS evaluation:\n\n{extracted_text}"}]
    full_messages = _build_messages(messages, "resume_analysis")

    def generate():
        try:
            with requests.post(
                f"{OLLAMA_BASE_URL}/api/chat",
                json={"model": model, "messages": full_messages, "stream": True},
                stream=True,
                timeout=STREAM_TIMEOUT,
            ) as r:
                r.raise_for_status()
                for line in r.iter_lines():
                    if line:
                        try:
                            chunk = json.loads(line)
                            token = chunk.get("message", {}).get("content", "")
                            done  = chunk.get("done", False)
                            payload = json.dumps({"token": token, "done": done})
                            yield f"data: {payload}\n\n"
                            if done:
                                break
                        except json.JSONDecodeError:
                            continue
        except Exception as e:
            err = json.dumps({"error": str(e)})
            yield f"data: {err}\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


# ─── Helpers ──────────────────────────────────────────────────────────────────

def extract_text_from_file(file) -> str:
    """Extract and return text from a PDF or DOCX file."""
    filename = secure_filename(file.filename).lower()
    file_bytes = file.read()
    
    if filename.endswith(".pdf"):
        doc = fitz.open(stream=file_bytes, filetype="pdf")
        text = ""
        for page in doc:
            text += page.get_text()
        return text
    
    elif filename.endswith(".docx") or filename.endswith(".doc"):
        doc = docx.Document(io.BytesIO(file_bytes))
        return "\n".join([para.text for para in doc.paragraphs])
    
    else:
        raise ValueError("Unsupported file format. Please upload PDF or DOCX.")

def _build_messages(user_messages: list, category: str) -> list:
    """Prepend the system prompt to the conversation."""
    system_content = SYSTEM_PROMPTS.get(category, SYSTEM_PROMPTS["general"])
    return [{"role": "system", "content": system_content}] + user_messages


# ─── Sample Questions ──────────────────────────────────────────────────────────

SAMPLE_QUESTIONS = {
    "general": [
        "Tell me about yourself and your background.",
        "What are your greatest strengths and weaknesses?",
        "Where do you see yourself in 5 years?",
        "Why do you want to work at our company?",
        "Describe a challenging project and how you handled it.",
    ],
    "technical": [
        "Explain the difference between stack and heap memory.",
        "What is the time complexity of quicksort in the worst case?",
        "How does garbage collection work in your preferred language?",
        "Explain REST vs GraphQL and when you'd use each.",
        "What design patterns have you used in production?",
    ],
    "behavioral": [
        "Tell me about a time you had a conflict with a coworker.",
        "Describe a situation where you failed — what did you learn?",
        "Give an example of when you showed leadership.",
        "How do you handle tight deadlines and pressure?",
        "Tell me about a time you had to learn something quickly.",
    ],
    "system_design": [
        "Design a URL shortener like bit.ly.",
        "How would you design Twitter's news feed?",
        "Design a distributed cache system.",
        "How would you build a real-time chat application?",
        "Design a ride-sharing service like Uber.",
    ],
    "hr": [
        "What is your expected salary range?",
        "Why are you leaving your current job?",
        "How do you handle work-life balance?",
        "What motivates you in your work?",
        "Do you prefer working alone or in a team?",
    ],
    "dsa": [
        "Implement a function to reverse a linked list.",
        "Find the longest common subsequence of two strings.",
        "Implement binary search on a rotated sorted array.",
        "Given a graph, find the shortest path between two nodes.",
        "Implement LRU cache with O(1) get and put operations.",
    ],
}


# ─── Entry Point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("\n" + "="*60)
    print("  🤖  Offline Interview Prep Chatbot")
    print("="*60)
    print(f"  Model   : {DEFAULT_MODEL}")
    print(f"  Ollama  : {OLLAMA_BASE_URL}")
    print(f"  App URL : http://localhost:5000")
    print("="*60 + "\n")
    app.run(debug=True, host="0.0.0.0", port=8080)
