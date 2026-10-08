from PIL import Image, ImageDraw
import math, os

S = 1024
img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# 圆角深色底（应用主色板 #161b22 / 边框感）
pad = 40
r = 200
d.rounded_rectangle([pad, pad, S - pad, S - pad], radius=r, fill=(22, 27, 34, 255), outline=(42, 49, 64, 255), width=8)

# 细腻的径向高光
glow = Image.new('RGBA', (S, S), (0, 0, 0, 0))
gd = ImageDraw.Draw(glow)
for i in range(60, 0, -1):
    a = int(10 * (i / 60.0))
    rad = int(300 * (i / 60.0))
    gd.ellipse([S//2 - rad, S//2 - rad - 40, S//2 + rad, S//2 + rad - 40], fill=(240, 161, 58, a))
img.alpha_composite(glow)
d = ImageDraw.Draw(img)

# 准星参数（CS2 风格：四臂 + 中心点 + 黑色描边）
cx, cy = S // 2, S // 2
arm_len = 210
gap = 68
thick = 52
color = (240, 161, 58, 255)
outline = (10, 12, 16, 255)

def arm(x1, y1, x2, y2):
    # 黑色描边
    d.line([x1, y1, x2, y2], fill=outline, width=thick + 18)
    d.line([x1, y1, x2, y2], fill=color, width=thick)

arm(cx, cy - gap, cx, cy - gap - arm_len)          # 上
arm(cx, cy + gap, cx, cy + gap + arm_len)          # 下
arm(cx - gap, cy, cx - gap - arm_len, cy)          # 左
arm(cx + gap, cy, cx + gap + arm_len, cy)          # 右

# 中心点
dot = 26
d.ellipse([cx - dot - 9, cy - dot - 9, cx + dot + 9, cy + dot + 9], fill=outline)
d.ellipse([cx - dot, cy - dot, cx + dot, cy + dot], fill=color)

# 右下角小小的“准星工坊”装饰弧（增强识别度）
d.arc([S - 380, S - 380, S - 90, S - 90], start=200, end=340, fill=(76, 159, 254, 200), width=18)

os.makedirs('build', exist_ok=True)
img.save('build/icon-1024.png')
# 多尺寸 ico（Windows 要求 256 以内 + 多分辨率）
sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (24, 24), (16, 16)]
img.resize((256, 256), Image.LANCZOS).save('build/icon.ico', format='ICO', sizes=sizes)
print('icon written:', os.path.getsize('build/icon.ico'), 'bytes')
