import unicodedata

with open("hype.html", "r", encoding="utf-8") as f:
    lines = f.readlines()

emojis_found = []
for line_idx, line in enumerate(lines):
    for char_idx, char in enumerate(line):
        category = unicodedata.category(char)
        ord_val = ord(char)
        if ord_val > 0x2000 and (category in ('So', 'Cn') or 0x1F000 <= ord_val <= 0x1FFFF or 0x2600 <= ord_val <= 0x27BF):
            if char not in ['▲', '▼', '◆', '▶', '◀', '•', '·', '—', '–', '─', '│', '┌', '┐', '└', '┘', '├', '┤', '┬', '┴', '┼', '…', '‘', '’', '“', '”', '™', '©', '®', '⚿', '⚙', '═', '║']:
                emojis_found.append((line_idx + 1, char, hex(ord_val), line.strip()))

print(f"Total emojis found: {len(emojis_found)}")
for line_num, char, hex_val, text in emojis_found:
    clean_text = "".join(c if ord(c) < 128 else '?' for c in text)
    print(f"Zeile {line_num}: {char.encode('utf-8')} ({hex_val}) | {clean_text[:80]}")
