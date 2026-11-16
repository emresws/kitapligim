"""Serve only the installed local library site on the original local address."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import threading
import webbrowser

URL = 'http://127.0.0.1:8765/'
ROOT = Path(__file__).resolve().parent
SITE = ROOT / 'dist-local'
if not (SITE / 'index.html').is_file():
    SITE = ROOT / 'site'

class LibraryHandler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map, '.mjs': 'text/javascript', '.js': 'text/javascript', '.wasm': 'application/wasm'}

    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

if not (SITE / 'index.html').is_file():
    raise SystemExit('Yerel dosyalar bulunamadı. Kaynak koddan npm run build:local çalıştır veya Release ZIP dosyasının tamamını çıkar.')

try:
    with ThreadingHTTPServer(('127.0.0.1', 8765), partial(LibraryHandler, directory=str(SITE))) as server:
        print(f'Kitaplığım: {URL}\nKapatmak için Ctrl+C.')
        threading.Thread(target=webbrowser.open, args=(URL,), daemon=True).start()
        server.serve_forever()
except KeyboardInterrupt:
    pass
except OSError as exc:
    raise SystemExit(f'Başlatılamadı: {exc}. 8765 portunu kullanan eski Kitaplığım veya Docker servisini kapat.')
