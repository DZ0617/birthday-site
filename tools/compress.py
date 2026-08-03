# -*- coding: utf-8 -*-
"""Compress timeline/secret-album photos for the birthday site."""
import os
from PIL import Image, ImageOps

SRC = r"C:\Users\m1307\Desktop\images"
DST = r"C:\Users\m1307\Desktop\birthday-site\assets\images"
os.makedirs(DST, exist_ok=True)

MAPPING = [
    # ---- timeline (26) ----
    ("2023.11.30开始恋爱！.jpg", "t01.jpg"),
    ("2024.1.12一起去狗咖！.jpg", "t02.jpg"),
    ("2024.1.12一起去狗咖！ (2).jpg", "t03.jpg"),
    ("2024.4.7摩天轮那天！.jpg", "t04.jpg"),
    ("2024.4.7摩天轮那天！ (2).jpg", "t05.jpg"),
    ("2024.4.7摩天轮那天！ (3).jpg", "t06.jpg"),
    ("2024.6.26毕业！.jpg", "t07.jpg"),
    ("2024.6.26毕业！ (2).jpg", "t08.jpg"),
    ("2024.6.30汕头南澳岛！.jpg", "t09.jpg"),
    ("2024.6.30汕头南澳岛！ (2).jpg", "t10.jpg"),
    ("2024.6.30汕头南澳岛！ (3).jpg", "t11.jpg"),
    ("2024.7.14（好像是吧！记得是在吃火锅）.jpg", "t12.jpg"),
    ("2024.7.17长沙岳麓山！.jpg", "t13.jpg"),
    ("2024.7.17长沙岳麓山！ (2).jpg", "t14.jpg"),
    ("2024.8.8祝你生日快乐！.jpg", "t15.jpg"),
    ("2024.8.10去龙华玩.jpg", "t16.jpg"),
    ("2024.9.13周杰伦演唱会.jpg", "t17.jpg"),
    ("2024.12的圣诞照片！.jpg", "t18.jpg"),
    ("2025.1.24去东莞！.jpg", "t19.jpg"),
    ("2025.1.24去东莞！ (2).jpg", "t20.jpg"),
    ("2025.1.24去东莞！ (3).jpg", "t21.jpg"),
    ("2025.1.24东莞~.jpg", "t22.jpg"),
    ("2025.9.16清远！！.jpg", "t23.jpg"),
    ("2025.9.16清远！！ (2).jpg", "t24.jpg"),
    ("2025.1036.万圣节~周年纪念日！.jpg", "t25.jpg"),
    ("2026.1.21珠海~.jpg", "t26.jpg"),
    # ---- secret: 偷拍 (8) ----
    ("偷拍~ (2).jpg", "s01.jpg"),
    ("偷拍~ (3).jpg", "s02.jpg"),
    ("偷拍~ (4).jpg", "s03.jpg"),
    ("偷拍~ (5).jpg", "s04.jpg"),
    ("偷拍~ (6).jpg", "s05.jpg"),
    ("偷拍~ (7).jpg", "s06.jpg"),
    ("偷拍~ (8).jpg", "s07.jpg"),
    ("清远偷拍~.jpg", "s08.jpg"),
    # ---- secret: 日常 (4) ----
    ("日常~.jpg", "d01.jpg"),
    ("日常~ (2).jpg", "d02.jpg"),
    ("日常~ (3).jpg", "d03.jpg"),
    ("日常~ (4).jpg", "d04.jpg"),
]

total_in = total_out = 0
missing = []
for src_name, dst_name in MAPPING:
    src = os.path.join(SRC, src_name)
    dst = os.path.join(DST, dst_name)
    if not os.path.exists(src):
        missing.append(src_name)
        continue
    im = Image.open(src)
    im = ImageOps.exif_transpose(im)  # fix phone rotation
    im = im.convert("RGB")
    w, h = im.size
    if w > 1080:
        im = im.resize((1080, round(h * 1080 / w)), Image.LANCZOS)
    im.save(dst, "JPEG", quality=82, optimize=True, progressive=True)
    total_in += os.path.getsize(src)
    total_out += os.path.getsize(dst)

print(f"done: {len(MAPPING) - len(missing)}/{len(MAPPING)} files")
print(f"size: {total_in/1024/1024:.1f}MB -> {total_out/1024/1024:.1f}MB")
if missing:
    print("MISSING:")
    for m in missing:
        print("  " + m)
