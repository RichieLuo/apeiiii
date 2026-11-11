#!/usr/bin/env python3
# 资源归一化：裁切透明留白，使脚底对齐画布底部，输出到 public/assets 规范化目录。
# 用法：python scripts/normalize.py <源图> <目标图> [--pad 0.02]
import sys
from PIL import Image

def main():
    if len(sys.argv) < 3:
        print("usage: normalize.py <src> <dst> [--pad ratio]")
        sys.exit(1)
    src, dst = sys.argv[1], sys.argv[2]
    pad = 0.02
    if '--pad' in sys.argv:
        pad = float(sys.argv[sys.argv.index('--pad') + 1])

    img = Image.open(src).convert("RGBA")
    alpha = img.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        print(f"{src}: 全透明，跳过")
        return
    l, t, r, b = bbox
    w, h = r - l, b - t
    px = int(w * pad)
    py = int(h * pad)
    l = max(0, l - px)
    t = max(0, t - py)
    r = min(img.width, r + px)
    b = min(img.height, b + py)
    cropped = img.crop((l, t, r, b))
    cropped.save(dst)
    print(f"{src.split('/')[-1]}: {img.width}x{img.height} -> {cropped.width}x{cropped.height}")

if __name__ == "__main__":
    main()
