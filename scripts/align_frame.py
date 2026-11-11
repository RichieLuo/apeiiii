#!/usr/bin/env python3
# 将动作帧对齐到基准帧高度（保持宽高比），确保切换帧时角色尺寸不跳变。
# 用法：python scripts/align_frame.py <源帧> <基准图> <目标输出>
import sys
from PIL import Image

def main():
    if len(sys.argv) < 4:
        print("usage: align_frame.py <src> <ref> <dst>")
        sys.exit(1)
    src, ref, dst = sys.argv[1], sys.argv[2], sys.argv[3]

    ref_img = Image.open(ref).convert("RGBA")
    ref_h = ref_img.height

    img = Image.open(src).convert("RGBA")
    bbox = img.getchannel("A").getbbox()
    if bbox is None:
        print(f"{src}: 全透明，跳过")
        return
    cropped = img.crop(bbox)
    w, h = cropped.size
    new_w = max(1, round(w * ref_h / h))
    resized = cropped.resize((new_w, ref_h), Image.LANCZOS)
    resized.save(dst)
    print(f"{src.split('/')[-1]}: -> {new_w}x{ref_h} (对齐基准高度 {ref_h})")

if __name__ == "__main__":
    main()
