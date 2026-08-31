#!/usr/bin/env python3
"""把书籍抽成带页码标记的纯文本，供轨道 1 的多个 agent 并行处理。

用法：
    python3 tools/extract_book.py 3          # 抽第 3 本
    python3 tools/extract_book.py 3 --range 1-120

产出 content/raw/b<N>.txt，每页以 `=== p.<页码> ===` 分隔，方便 agent
在 source_locator 里写准确页码，也方便人工回原书复核。
扫描件（无文字层）会直接报错退出，需要另走 OCR。
"""
import argparse
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BOOKS = ROOT / 'books'
OUT = ROOT / 'content' / 'raw'

# 书号 → 文件名前缀。书名含全角字符，用前缀匹配避免手抄出错。
BOOK_PREFIX = {
    1: '1-',
    2: '2-',
    3: '3-',
    4: '4-',
    5: '寻豆师',
}


def resolve(n):
    prefix = BOOK_PREFIX.get(n)
    if prefix is None:
        sys.exit(f'未知书号 {n}，可选 {sorted(BOOK_PREFIX)}')
    hits = [f for f in BOOKS.iterdir() if f.name.startswith(prefix)]
    if not hits:
        sys.exit(f'books/ 下找不到以「{prefix}」开头的文件')
    return hits[0]


def extract_pdf(path, page_range):
    from pypdf import PdfReader
    reader = PdfReader(str(path))
    total = len(reader.pages)
    lo, hi = page_range or (1, total)
    hi = min(hi, total)

    chunks, empty = [], 0
    for i in range(lo - 1, hi):
        text = (reader.pages[i].extract_text() or '').strip()
        if not text:
            empty += 1
            continue
        chunks.append(f'=== p.{i + 1} ===\n{text}')

    if not chunks:
        sys.exit(f'{path.name} 第 {lo}-{hi} 页抽不出任何文字，判定为扫描件，需要 OCR')
    return '\n\n'.join(chunks), total, hi - lo + 1, empty


def extract_docx(path, _page_range):
    with zipfile.ZipFile(path) as z:
        xml = z.read('word/document.xml').decode('utf-8', 'ignore')

    # 段落边界转换成换行，再去掉所有标签
    xml = re.sub(r'</w:p>', '\n', xml)
    xml = re.sub(r'<w:tab[^>]*/>', '\t', xml)
    text = re.sub(r'<[^>]+>', '', xml)
    text = re.sub(r'\n{3,}', '\n\n', text).strip()

    if not text:
        sys.exit(f'{path.name} 抽不出正文')
    # docx 无页概念，按 2000 字切块并编号，便于 agent 分工
    blocks = [text[i:i + 2000] for i in range(0, len(text), 2000)]
    body = '\n\n'.join(f'=== block.{i + 1} ===\n{b}' for i, b in enumerate(blocks))
    return body, len(blocks), len(blocks), 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('book', type=int)
    ap.add_argument('--range', dest='rng', help='页码范围，如 1-120')
    args = ap.parse_args()

    page_range = None
    if args.rng:
        m = re.fullmatch(r'(\d+)-(\d+)', args.rng)
        if not m:
            sys.exit('--range 格式应为 起页-止页，如 1-120')
        page_range = (int(m.group(1)), int(m.group(2)))

    path = resolve(args.book)
    handler = extract_docx if path.suffix.lower() == '.docx' else extract_pdf
    body, total, done, empty = handler(path, page_range)

    OUT.mkdir(parents=True, exist_ok=True)
    suffix = f'-p{page_range[0]}-{page_range[1]}' if page_range else ''
    dest = OUT / f'b{args.book}{suffix}.txt'
    dest.write_text(body, encoding='utf-8')

    print(f'{path.name}')
    print(f'  总单元 {total} | 本次处理 {done} | 空白跳过 {empty}')
    print(f'  → {dest.relative_to(ROOT)}（{len(body)} 字符）')


if __name__ == '__main__':
    main()
