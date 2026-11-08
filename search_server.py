import json, re, html, ssl, sys
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, quote_plus, unquote
from urllib.request import Request, urlopen

UAS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
]
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

def fetch(url, timeout=12, ua=0):
    req = Request(url, headers={
        "User-Agent": UAS[ua % len(UAS)],
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "identity",
    })
    with urlopen(req, timeout=timeout, context=CTX) as r:
        return r.read().decode("utf-8", errors="ignore")

def clean(s):
    return html.unescape(re.sub(r"<[^>]+>", "", s)).strip()

def read_page(url, max_chars=8000):
    try:
        raw = fetch(url)
    except Exception as e:
        return f"[Failed to fetch {url}: {e}]"
    for tag in ("script", "style", "nav", "footer", "header", "aside", "noscript", "form"):
        raw = re.sub(rf"<{tag}[\s\S]*?</{tag}>", " ", raw, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", raw)
    text = html.unescape(text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()[:max_chars]

def ddg_search(query, num):
    for attempt in range(2):
        try:
            page = fetch(f"https://html.duckduckgo.com/html/?q={quote_plus(query)}", timeout=10, ua=attempt)
        except Exception:
            continue
        links = re.findall(r'<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)</a>', page, re.DOTALL)
        snips = re.findall(r'class="result__snippet"[^>]*>(.*?)</a>', page, re.DOTALL)
        if not links:
            continue
        results = []
        for i, (link, title) in enumerate(links[:num]):
            m = re.search(r"uddg=([^&]+)", link)
            link = unquote(m.group(1)) if m else link
            if link.startswith("//"):
                link = "https:" + link
            results.append({
                "title": clean(title),
                "url": link,
                "snippet": clean(snips[i]) if i < len(snips) else "",
            })
        if results:
            return results
    return []

def bing_search(query, num):
    try:
        page = fetch(f"https://www.bing.com/search?q={quote_plus(query)}&count={num}", timeout=10)
    except Exception:
        return []
    results = []
    for m in re.finditer(
        r'<li class="b_algo"[\s\S]*?<h2><a href="([^"]+)"[^>]*>(.*?)</a></h2>[\s\S]*?<p[^>]*>(.*?)</p>',
        page,
    ):
        results.append({"title": clean(m.group(2)), "url": m.group(1), "snippet": clean(m.group(3))})
        if len(results) >= num:
            break
    return results

def web_search(query, num=5):
    results = ddg_search(query, num)
    engine = "duckduckgo"
    if not results:
        results = bing_search(query, num)
        engine = "bing"
    if not results:
        return {"query": query, "results": [], "engine": "none", "error": "no engine returned results"}

    for r in results[:5]:
        try:
            r["content"] = read_page(r["url"], max_chars=4000)
        except Exception:
            r["content"] = ""

    return {"query": query, "results": results, "engine": engine}

class Handler(BaseHTTPRequestHandler):
    def _json(self, data, code=200):
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode())

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()

    def do_GET(self):
        p = urlparse(self.path)
        q = parse_qs(p.query)
        if p.path == "/search":
            self._json(web_search(q.get("q", [""])[0], int(q.get("n", ["5"])[0])))
        elif p.path == "/read":
            url = q.get("url", [""])[0]
            self._json({"url": url, "text": read_page(url)})
        elif p.path == "/health":
            self._json({"status": "ok", "engines": ["duckduckgo", "bing"]})
        else:
            self._json({"error": "not found — use /search?q=… or /read?url=…"}, 404)

    def log_message(self, fmt, *args):
        print(f"  {args[0]}")

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8777
    print(f"   Fanoos search server listening on http://127.0.0.1:{port}")
    print(f"   Ctrl+C to stop.\n")
    try:
        HTTPServer(("0.0.0.0", port), Handler).serve_forever()
    except KeyboardInterrupt:
        print("\n   Lantern out.")