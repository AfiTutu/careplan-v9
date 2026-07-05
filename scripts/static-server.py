from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
import os

ROOT = Path(__file__).resolve().parents[1] / 'public'
os.chdir(ROOT)

class Handler(SimpleHTTPRequestHandler):
    def do_GET(self):
        requested = Path(self.path.split('?', 1)[0].lstrip('/'))
        if requested and not (ROOT / requested).is_file():
            self.path = '/index.html'
        super().do_GET()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()

ThreadingHTTPServer(('127.0.0.1', 4173), Handler).serve_forever()
