#!/usr/bin/env python3
"""探测每本书能否直接抽出文本：可以就走脚本抽取，抽不出说明是扫描件需要 OCR。"""
import sys
from pathlib import Path

BOOKS = Path(__file__).resolve().parent.parent / 'books'


def probe_pdf(path):
    from pypdf import PdfReader
    reader = PdfReader(str(path))
    n = len(reader.pages)
    # 抽首、中、尾三页取样，判断是文本层还是扫描图
    picks = [min(9, n - 1), n // 2, max(0, n - 3)]
    samples = []
    for i in picks:
        try:
            samples.append(len((reader.pages[i].extract_text() or '').strip()))
        except Exception as exc:
            samples.append(f'err:{exc.__class__.__name__}')
    return n, samples


def probe_docx(path):
    import zipfile
    import re
    with zipfile.ZipFile(path) as z:
        xml = z.read('word/document.xml').decode('utf-8', 'ignore')
    text = re.sub(r'<[^>]+>', '', xml)
    return len(xml), len(text.strip())


for f in sorted(BOOKS.iterdir()):
    if f.name.startswith('.'):
        continue
    try:
        if f.suffix.lower() == '.pdf':
            n, samples = probe_pdf(f)
            print(f'{f.name}\n  页数 {n} | 采样页字符数 {samples}')
        elif f.suffix.lower() == '.docx':
            raw, text = probe_docx(f)
            print(f'{f.name}\n  document.xml {raw} 字符 | 去标签后正文 {text} 字符')
    except Exception as exc:
        print(f'{f.name}\n  探测失败: {exc.__class__.__name__}: {exc}', file=sys.stderr)
