import os
import json
from pathlib import Path

import psycopg2
import psycopg2.extras
from flask import Flask, request, jsonify, Response, stream_with_context
from flask_cors import CORS
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

DATABASE_URL = os.environ.get("DATABASE_URL", "")
OPENAI_API_KEY = os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY", "")
OPENAI_BASE_URL = os.environ.get("AI_INTEGRATIONS_OPENAI_BASE_URL", "https://api.openai.com/v1")

openai_client = OpenAI(api_key=OPENAI_API_KEY, base_url=OPENAI_BASE_URL)

SYSTEM_PROMPT = """You are ClarIT, an IT Help Desk AI.
Only answer IT/technology questions.
If unrelated, politely refuse and redirect to IT support only.
Be concise and practical.
Use short numbered steps.
Warn before risky actions.
Escalate after 3 failed attempts.
Classify issues as Hardware, Software, Network, or General.
Use these core rules:
Hardware: power/cables/ports/drivers first.
Software: BSOD codes, reinstall apps, Task Manager.
Network: router, Wi-Fi, flush DNS, cache.
Security: Defender full scan.
Files: Recycle Bin then previous versions.
Performance: startup apps and RAM usage.
Start by greeting the user and asking what IT issue they need help with.
"""

print(f"System prompt: {len(SYSTEM_PROMPT)} chars (~{len(SYSTEM_PROMPT)//4} tokens)")


def get_db():
    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    return conn


def ensure_feedback_table():
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS message_feedback (
                id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                message_id uuid NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
                user_session_id text NOT NULL,
                rating text NOT NULL,
                created_at timestamptz NOT NULL DEFAULT NOW()
            )
        """)
        conn.commit()
    finally:
        conn.close()


try:
    ensure_feedback_table()
    print("message_feedback table ready")
except Exception as e:
    print(f"Warning: could not ensure message_feedback table: {e}")


@app.errorhandler(Exception)
def handle_error(e):
    status = getattr(e, "status", None) or getattr(e, "code", None) or 500
    return jsonify({"error": str(e)}), status


@app.route("/api/conversations", methods=["GET"])
def get_conversations():
    session_id = request.args.get("sessionId", "")
    if not session_id:
        return jsonify({"error": "sessionId is required"}), 400
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT * FROM conversations WHERE user_session_id = %s ORDER BY updated_at DESC", (session_id,))
        return jsonify([dict(r) for r in cur.fetchall()])
    finally:
        conn.close()


@app.route("/api/conversations", methods=["POST"])
def create_conversation():
    body = request.get_json() or {}
    session_id = body.get("sessionId", "")
    if not session_id:
        return jsonify({"error": "sessionId is required"}), 400
    title = body.get("title", "New Chat")
    if not isinstance(title, str) or not title.strip():
        title = "New Chat"
    else:
        title = title.strip()
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("INSERT INTO conversations (id, user_session_id, title, created_at, updated_at) VALUES (gen_random_uuid(), %s, %s, NOW(), NOW()) RETURNING *", (session_id, title))
        row = cur.fetchone()
        conn.commit()
        return jsonify(dict(row)), 201
    finally:
        conn.close()


@app.route("/api/conversations/<conv_id>", methods=["DELETE"])
def delete_conversation(conv_id):
    session_id = request.args.get("sessionId", "")
    if not session_id:
        return jsonify({"error": "sessionId is required"}), 400
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute(
            "DELETE FROM conversations WHERE id = %s AND user_session_id = %s",
            (conv_id, session_id),
        )
        deleted = cur.rowcount
        conn.commit()
        if deleted == 0:
            return jsonify({"error": "Conversation not found"}), 404
        return ("", 204)
    finally:
        conn.close()


@app.route("/api/conversations/<conv_id>/messages", methods=["GET"])
def get_messages(conv_id):
    session_id = request.args.get("sessionId", "")
    if not session_id:
        return jsonify({"error": "sessionId is required"}), 400
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT id FROM conversations WHERE id = %s AND user_session_id = %s LIMIT 1", (conv_id, session_id))
        if not cur.fetchone():
            return jsonify({"error": "Conversation not found"}), 404
        cur.execute("SELECT id, role, content FROM chat_messages WHERE conversation_id = %s ORDER BY created_at ASC", (conv_id,))
        return jsonify([dict(r) for r in cur.fetchall()])
    finally:
        conn.close()


@app.route("/api/messages", methods=["POST"])
def create_message():
    body = request.get_json() or {}
    session_id = body.get("sessionId", "")
    conversation_id = body.get("conversationId", "")
    role = body.get("role", "")
    content = body.get("content", "")
    if role not in ("user", "assistant"):
        return jsonify({"error": "Invalid role"}), 400
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        cur.execute("SELECT id FROM conversations WHERE id = %s AND user_session_id = %s LIMIT 1", (conversation_id, session_id))
        if not cur.fetchone():
            return jsonify({"error": "Conversation not found"}), 404
        cur.execute("INSERT INTO chat_messages (id, conversation_id, role, content, created_at) VALUES (gen_random_uuid(), %s, %s, %s, NOW()) RETURNING *", (conversation_id, role, content))
        row = cur.fetchone()
        cur.execute("UPDATE conversations SET updated_at = NOW() WHERE id = %s", (conversation_id,))
        conn.commit()
        return jsonify(dict(row)), 201
    finally:
        conn.close()


@app.route("/api/feedback", methods=["POST"])
def create_feedback():
    body = request.get_json() or {}
    session_id = body.get("sessionId", "")
    message_id = body.get("messageId", "")
    rating = body.get("rating", "")
    if not session_id or not message_id or rating not in ("up", "down"):
        return jsonify({"error": "sessionId, messageId, and rating ('up'|'down') are required"}), 400
    conn = get_db()
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        # Verify the message belongs to a conversation owned by this session
        cur.execute("""
            SELECT m.id FROM chat_messages m
            JOIN conversations c ON c.id = m.conversation_id
            WHERE m.id = %s AND c.user_session_id = %s LIMIT 1
        """, (message_id, session_id))
        if not cur.fetchone():
            return jsonify({"error": "Message not found"}), 404
        cur.execute("""
            INSERT INTO message_feedback (id, message_id, user_session_id, rating, created_at)
            VALUES (gen_random_uuid(), %s, %s, %s, NOW())
            RETURNING *
        """, (message_id, session_id, rating))
        row = cur.fetchone()
        conn.commit()
        return jsonify(dict(row)), 201
    finally:
        conn.close()


@app.route("/api/feedback/<message_id>", methods=["DELETE"])
def delete_feedback(message_id):
    session_id = request.args.get("sessionId", "")
    if not session_id:
        return jsonify({"error": "sessionId is required"}), 400
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute(
            "DELETE FROM message_feedback WHERE message_id = %s AND user_session_id = %s",
            (message_id, session_id),
        )
        conn.commit()
        return ("", 204)
    finally:
        conn.close()


@app.route("/api/chat", methods=["POST"])
def chat():
    body = request.get_json() or {}
    messages = body.get("messages", [])
    if not isinstance(messages, list):
        messages = []
    filtered = [
        {"role": m["role"], "content": m["content"]}
        for m in messages
        if isinstance(m, dict) and m.get("role") in ("user", "assistant") and isinstance(m.get("content"), str)
    ]

    def generate():
        yield ": ping\n\n"
        yield "data: {\"choices\":[{\"delta\":{\"content\":\"\"}}]}\n\n"
        stream = openai_client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=[{"role": "system", "content": SYSTEM_PROMPT}] + filtered,
            stream=True,
            temperature=0.2,
            max_completion_tokens=768,
        )
        for chunk in stream:
            delta = chunk.choices[0].delta if chunk.choices else None
            content = delta.content if delta and delta.content else None
            if content:
                yield f"data: {json.dumps({'choices': [{'delta': {'content': content}}]})}\n\n"
        yield "data: [DONE]\n\n"

    return Response(
        stream_with_context(generate()),
        status=200,
        content_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"}
    )


if __name__ == "__main__":
    port = int(os.environ.get("PYTHON_PORT", 8000))
    print(f"ClarIT Python API server starting on port {port}")
    app.run(host="0.0.0.0", port=port, debug=False, threaded=True)
