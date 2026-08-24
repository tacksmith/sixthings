
from PIL import Image, ImageDraw, ImageFont
import os
os.makedirs("icons", exist_ok=True)
for size in (192, 512):
    img = Image.new("RGBA", (size, size), (0,0,0,0))
    d = ImageDraw.Draw(img)
    r = size * 0.22
    d.rounded_rectangle([0,0,size,size], radius=r, fill=(255,90,60,255))
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", int(size*0.62))
    except Exception:
        font = ImageFont.load_default()
    text = "6"
    bbox = d.textbbox((0,0), text, font=font)
    tw, th = bbox[2]-bbox[0], bbox[3]-bbox[1]
    x = (size-tw)/2 - bbox[0]
    y = (size-th)/2 - bbox[1] - size*0.02
    d.text((x, y), text, font=font, fill=(255,255,255,255))
    img.save(f"icons/icon-{size}.png")
    print(f"icon-{size}.png", img.size)
