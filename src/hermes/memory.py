import sqlite3, os, json, datetime, time
import urllib.request

DB_PATH = os.path.join(os.path.dirname(__file__), '../../data/memory.db')
CONFIG_PATH = os.path.join(os.path.dirname(__file__), '../../config.json')

def _load_config():
    try:
        with open(CONFIG_PATH) as f:
            return json.load(f)
    except Exception:
        return {}

def _conn():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    c = sqlite3.connect(DB_PATH)
    c.execute('''CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        source TEXT,
        timestamp TEXT NOT NULL
    )''')
    # Add source column if upgrading from an older schema
    try:
        c.execute("ALTER TABLE messages ADD COLUMN source TEXT")
    except sqlite3.OperationalError:
        pass  # column already exists
    c.commit()
    return c

def _enforce_sliding_window(c, chat_id, limit):
    rows = c.execute(
        'SELECT id FROM messages WHERE chat_id=? ORDER BY id ASC',
        (str(chat_id),)
    ).fetchall()
    overflow = len(rows) - limit
    if overflow > 0:
        ids_to_delete = [r[0] for r in rows[:overflow]]
        c.execute(
            f'DELETE FROM messages WHERE id IN ({",".join("?" * len(ids_to_delete))})',
            ids_to_delete
        )
        c.commit()
    return max(overflow, 0)

def _call_summarizer(messages, config, attempt=1):
    url = config.get('summarizer_url', 'http://localhost:4000/v1/chat/completions')
    model = config.get('summarizer_model', 'deepseek-v4-flash')
    master_key = config.get('litellm_master_key', '')
    prompt = (
        "You are a memory summarizer for an AI agent. "
        "Summarize the following conversation history concisely, "
        "preserving key facts, decisions, and context. "
        "Be brief but complete. Output only the summary, no preamble.\n\n"
        + "\n".join([f"{m['role'].upper()}: {m['content']}" for m in messages])
    )
    payload = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 512
    }).encode()
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {master_key}"
    }
    try:
        req = urllib.request.Request(url, data=payload, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode())
            return data['choices'][0]['message']['content'].strip()
    except Exception as e:
        if attempt < 2:
            time.sleep(2)
            return _call_summarizer(messages, config, attempt=2)
        raise e

def _enforce_summarize(c, chat_id, limit, config):
    rows = c.execute(
        'SELECT id, role, content FROM messages WHERE chat_id=? ORDER BY id ASC',
        (str(chat_id),)
    ).fetchall()
    if len(rows) <= limit:
        return 0
    batch_size = max(1, limit // 2)
    batch = rows[:batch_size]
    messages_to_summarize = [{'role': r[1], 'content': r[2]} for r in batch if not r[2].startswith('[SUMMARY]')]
    if not messages_to_summarize:
        return _enforce_sliding_window(c, chat_id, limit)
    try:
        summary = _call_summarizer(messages_to_summarize, config)
        now = datetime.datetime.now(datetime.timezone.utc).isoformat()
        ids_to_delete = [r[0] for r in batch]
        c.execute(
            f'DELETE FROM messages WHERE id IN ({",".join("?" * len(ids_to_delete))})',
            ids_to_delete
        )
        c.execute(
            'INSERT INTO messages (chat_id, role, content, timestamp) VALUES (?,?,?,?)',
            (str(chat_id), 'system', f'[SUMMARY] {summary}', now)
        )
        c.commit()
        return len(batch)
    except Exception:
        return _enforce_sliding_window(c, chat_id, limit)

def save(chat_id, role, content, source=None):
    config = _load_config()
    strategy = config.get('memory_strategy', 'sliding_window')
    limit = config.get('memory_limit', 100)
    c = _conn()
    c.execute(
        'INSERT INTO messages (chat_id, role, content, source, timestamp) VALUES (?,?,?,?,?)',
        (str(chat_id), role, content, source, datetime.datetime.now(datetime.timezone.utc).isoformat())
    )
    c.commit()
    if strategy == 'sliding_window':
        _enforce_sliding_window(c, chat_id, limit)
    elif strategy == 'summarize':
        _enforce_summarize(c, chat_id, limit, config)
    elif strategy == 'hard_stop':
        count = c.execute(
            'SELECT COUNT(*) FROM messages WHERE chat_id=?', (str(chat_id),)
        ).fetchone()[0]
        if count > limit:
            c.execute(
                'DELETE FROM messages WHERE id = (SELECT MAX(id) FROM messages WHERE chat_id=?)',
                (str(chat_id),)
            )
            c.commit()
    c.close()

def get_history(chat_id, limit=10):
    c = _conn()
    rows = c.execute(
        'SELECT role, content, source FROM messages WHERE chat_id=? ORDER BY id DESC LIMIT ?',
        (str(chat_id), limit)
    ).fetchall()
    c.close()
    return [{'role': r[0], 'content': r[1], 'source': r[2]} for r in reversed(rows)]

def prune(chat_id, limit):
    c = _conn()
    pruned = _enforce_sliding_window(c, chat_id, limit)
    c.close()
    return pruned

def clear(chat_id):
    c = _conn()
    c.execute('DELETE FROM messages WHERE chat_id=?', (str(chat_id),))
    c.commit()
    c.close()

if __name__ == '__main__':
    save('test123', 'user', 'Hello Korvin')
    save('test123', 'assistant', 'Hello Carlos, how can I help?')
    history = get_history('test123')
    for m in history:
        print(f"  [{m['role']}]: {m['content']}")
    print('Memory working.')