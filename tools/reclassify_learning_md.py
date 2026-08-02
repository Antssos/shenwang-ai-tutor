from pathlib import Path
import re

ROOT = Path('knowledge/learning')

def classify(block: str) -> str:
    first = block.splitlines()[0] if block else ''
    s = first.lower()
    if any(x in s for x in ('英语', 'english', 'pep版', '起点', '单词', '词句型')):
        return '英语'
    if any(x in s for x in ('数学', '数学', '第1讲', '第2讲', '第3讲', '第4讲', '第5讲', '第6讲', '第7讲', '第8讲', '第9讲')):
        return '数学'
    return '语文'

for path in sorted(ROOT.glob('grade-*/*.md')):
    text = path.read_text(encoding='utf-8')
    parts = re.split(r'(?=^### 来源 \d+：)', text, flags=re.M)
    intro = parts[0].split('## 语文')[0].rstrip()
    blocks = [p.strip() for p in parts[1:] if p.strip()]
    cleaned_blocks = []
    for block in blocks:
        # A previous pass may have appended old subject/tail headings inside
        # the final source block; keep only the source content itself.
        block = re.split(r'\n## ', block, maxsplit=1)[0].rstrip()
        if block:
            cleaned_blocks.append(block)
    blocks = cleaned_blocks
    groups = {'语文': [], '数学': [], '英语': []}
    for block in blocks:
        groups[classify(block)].append(block)
    tail = '## 来源与待核验说明\n\n- 原始资料中无法直接解析的旧式 Word、演示文稿和图片来源保留在原始目录，需后续人工或 OCR 复核后补入。\n'
    out = [intro, '', '> 说明：以下按语文、数学、英语分组；每个来源块保留原始来源名称和可提取内容。原始资料中无法直接解析的文件仍列在末尾待核验。', '']
    for subject in ('语文', '数学', '英语'):
        out += [f'## {subject}', '']
        if groups[subject]:
            for block in groups[subject]:
                out += [block, '']
        else:
            out += ['> 本册未找到可直接解析的该学科文档。', '']
    if tail:
        out += [tail.strip(), '']
    path.write_text('\n'.join(out).rstrip() + '\n', encoding='utf-8')
