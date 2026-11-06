#!/usr/bin/env python3
"""Reconstruit l'édition web monofichier depuis src/ (démos, partage).
Usage : python3 build-single.py  →  dist/labyrinthe-single.html
Aucun module JS ne contient de balise </script> : l'inlining est sûr."""
import re
import pathlib

root = pathlib.Path(__file__).parent
html = (root / 'src' / 'index.html').read_text(encoding='utf-8')
css = (root / 'src' / 'css' / 'theme.css').read_text(encoding='utf-8')

html = html.replace(
    '<link rel="stylesheet" href="css/theme.css">',
    '<style>\n' + css + '\n</style>'
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
