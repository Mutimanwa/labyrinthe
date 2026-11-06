#!/usr/bin/env python3
"""Serve the web edition and its content packs without a platform-specific symlink."""
from argparse import ArgumentParser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
import os

ROOT = Path(__file__).resolve().parent


class LabyrintheHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        # /content/ is kept outside src/ so the same files are used by Tauri,
        # the web edition and the single-file build. SimpleHTTPRequestHandler
        # normalises the remaining path and does not allow '..' traversal.
        url_path = urlsplit(path).path
        if url_path == "/content" or url_path.startswith("/content/"):
            original = self.directory
            self.directory = str(ROOT / "content")
            try:
                return super().translate_path(url_path[len("/content"):] or "/")
            finally:
                self.directory = original
        return super().translate_path(path)


def main():
    parser = ArgumentParser(description="Serveur local de LABYRINTHE")
    parser.add_argument("--bind", default="0.0.0.0", help="adresse d'écoute")
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "8000")))
    args = parser.parse_args()
    handler = partial(LabyrintheHandler, directory=str(ROOT / "src"))
    with ThreadingHTTPServer((args.bind, args.port), handler) as server:
        actual_port = server.server_address[1]
        print(f"LABYRINTHE disponible sur http://{args.bind}:{actual_port}", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
