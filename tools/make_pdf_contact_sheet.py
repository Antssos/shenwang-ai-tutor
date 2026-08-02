from __future__ import annotations

import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw


source = Path(sys.argv[1])
output = Path(sys.argv[2])
files = sorted(source.glob("page-*.jpg"))
cards = []
for index, path in enumerate(files, 1):
    image = Image.open(path).convert("RGB")
    image.thumbnail((260, 370))
    card = Image.new("RGB", (284, 410), "white")
    card.paste(image, ((card.width - image.width) // 2, 28))
    ImageDraw.Draw(card).text((10, 8), f"PDF page {index}", fill="black")
    cards.append(card)

columns = 4
rows = math.ceil(len(cards) / columns)
sheet = Image.new("RGB", (columns * 284, rows * 410), (220, 220, 220))
for index, card in enumerate(cards):
    sheet.paste(card, ((index % columns) * 284, (index // columns) * 410))
output.parent.mkdir(parents=True, exist_ok=True)
sheet.save(output, quality=88)
