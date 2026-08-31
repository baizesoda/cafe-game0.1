#!/usr/bin/env python3
"""把扫描件 PDF 按页切成小块，供多个视觉 agent 并行读图转写。

扫描件没有文字层，脚本抽不出文本；但切成小块后，agent 可以直接读页面图。
用法：
    python3 tools/split_pdf.py 1 --size 20
产出 books/_split/b1-p001-020.pdf ...（books/ 已在 .gitignore 内）
"""
import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BOOKS = ROOT / 'books'
OUT = BOOKS / '_split'

BOOK_PREFIX = {1: '1-', 2: '2-', 3: '3-', 4: '4-', 5: '寻豆师'}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('book', type=int)
    ap.add_argument('--size', type=int, default=20, help='每块页数')
    args = ap.parse_args()

    prefix = BOOK_PREFIX.get(args.book)
    if prefix is None:
        sys.exit(f'未知书号 {args.book}')
    hits = [f for f in BOOKS.iterdir() if f.is_file() and f.name.startswith(prefix)]
    if not hits:
        sys.exit(f'找不到以「{prefix}」开头的书')
    src = hits[0]
    if src.suffix.lower() != '.pdf':
        sys.exit(f'{src.name} 不是 PDF，无需切块')

    from pypdf import PdfReader, PdfWriter

    reader = PdfReader(str(src))
    total = len(reader.pages)
    OUT.mkdir(parents=True, exist_ok=True)

    made = []
    for start in range(0, total, args.size):
        end = min(start + args.size, total)
        writer = PdfWriter()
        for i in range(start, end):
            writer.add_page(reader.pages[i])
        dest = OUT / f'b{args.book}-p{start + 1:03d}-{end:03d}.pdf'
        with dest.open('wb') as fh:
            writer.write(fh)
        made.append((dest.name, dest.stat().st_size // 1024))

    print(f'{src.name} 共 {total} 页，切成 {len(made)} 块：')
    for name, kb in made:
        print(f'  {name}  {kb} KB')


if __name__ == '__main__':
    main()
