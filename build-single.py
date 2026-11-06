#!/usr/bin/env python3
"""Reconstruit l'édition web monofichier depuis src/ (démos, partage).
Usage : python3 build-single.py  →  dist/labyrinthe-single.html
Aucun module JS ne contient de balise </script> : l'inlining est sûr."""
import json
import re
import pathlib

root = pathlib.Path(__file__).parent
html = (root / 'src' / 'index.html').read_text(encoding='utf-8')
css = (root / 'src' / 'css' / 'theme.css').read_text(encoding='utf-8')

html = html.replace(
    '<link rel="stylesheet" href="css/theme.css">',
    '<style>\n' + css + '\n</style>'
)

# Un fichier ouvert en file:// ne peut pas fetch() les packs voisins. Les
# embarquer dans le HTML rend aussi les sites, contrats et forums autonomes.
content_root = root / 'content'
content = {
    p.relative_to(content_root).as_posix(): p.read_text(encoding='utf-8')
    for p in sorted(content_root.rglob('*'))
    if p.is_file() and p.suffix.lower() in ('.json', '.md', '.txt')
}
encoded = json.dumps(content, ensure_ascii=True).replace('<', r'\u003c')
html = html.replace(
    '<script src="js/bridge.js"></script>',
    '<script>window.__LABY_CONTENT__ = ' + encoded + ';</' + 'script>\n'
    '<script src="js/bridge.js"></script>'
)


def inline(match):
    src = match.group(1)
    js = (root / 'src' / src).read_text(encoding='utf-8')
    return '<script>\n' + js + '\n</' + 'script>'


html = re.sub(r'<script src="(js/[\w.-]+)"></script>', inline, html)

(root / 'dist').mkdir(exist_ok=True)
out = root / 'dist' / 'labyrinthe-single.html'
out.write_text(html, encoding='utf-8')
print(f'{out} écrit ({out.stat().st_size // 1024} Ko)')
