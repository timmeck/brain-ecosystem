"""Generate a circular Brain avatar for GitHub/X profile pictures."""
from PIL import Image, ImageDraw, ImageFilter, ImageFont
import math
import random

random.seed(42)

SIZE = 1024
CENTER = SIZE // 2
R = SIZE // 2 - 20  # circle radius

img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# --- Background circle with dark gradient ---
bg = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
bg_draw = ImageDraw.Draw(bg)
for r in range(R, 0, -1):
    t = r / R
    c1 = (10, 12, 28)    # center
    c2 = (18, 20, 42)    # edge
    color = tuple(int(c1[i] * t + c2[i] * (1 - t)) for i in range(3))
    bg_draw.ellipse([CENTER - r, CENTER - r, CENTER + r, CENTER + r], fill=(*color, 255))
img = Image.alpha_composite(img, bg)

# --- Generate synapse network nodes ---
node_types = {
    'project':     {'color': (255, 179, 71),  'count': 4,  'radius': (18, 28)},
    'code_module': {'color': (180, 122, 255), 'count': 22, 'radius': (6, 12)},
    'error':       {'color': (255, 85, 119),  'count': 10, 'radius': (7, 13)},
    'solution':    {'color': (61, 255, 160),  'count': 6,  'radius': (7, 11)},
    'rule':        {'color': (91, 156, 255),  'count': 5,  'radius': (5, 9)},
}

nodes = []
for ntype, cfg in node_types.items():
    for _ in range(cfg['count']):
        # Place within circle
        for _attempt in range(50):
            angle = random.uniform(0, 2 * math.pi)
            dist = random.uniform(40, R - 50)
            x = CENTER + math.cos(angle) * dist
            y = CENTER + math.sin(angle) * dist
            # Check no overlap
            too_close = False
            for n in nodes:
                if math.hypot(x - n['x'], y - n['y']) < 35:
                    too_close = True
                    break
            if not too_close:
                break
        r = random.randint(*cfg['radius'])
        nodes.append({'x': x, 'y': y, 'r': r, 'type': ntype, 'color': cfg['color']})

# --- Create edges between nearby nodes ---
edges = []
for i, n1 in enumerate(nodes):
    distances = []
    for j, n2 in enumerate(nodes):
        if i == j:
            continue
        d = math.hypot(n1['x'] - n2['x'], n1['y'] - n2['y'])
        distances.append((d, j))
    distances.sort()
    # Connect to 2-4 nearest
    count = random.randint(2, 4) if n1['type'] == 'project' else random.randint(1, 3)
    for d, j in distances[:count]:
        if d < R * 1.2:
            edge = tuple(sorted([i, j]))
            if edge not in edges:
                edges.append(edge)

# --- Draw on a separate layer for glow ---
glow_layer = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
glow_draw = ImageDraw.Draw(glow_layer)

# Edge colors by type combination
EDGE_COLORS = {
    'project':     (91, 156, 255, 50),
    'code_module': (140, 100, 220, 40),
    'error':       (200, 80, 100, 40),
    'solution':    (50, 200, 130, 45),
    'rule':        (70, 130, 220, 40),
}

# Draw edges
for i, j in edges:
    n1, n2 = nodes[i], nodes[j]
    ec = EDGE_COLORS.get(n1['type'], (91, 156, 255, 40))
    glow_draw.line([(n1['x'], n1['y']), (n2['x'], n2['y'])], fill=ec, width=2)

# Draw edge glow
edge_glow = glow_layer.filter(ImageFilter.GaussianBlur(4))
img = Image.alpha_composite(img, edge_glow)
img = Image.alpha_composite(img, glow_layer)

# --- Draw nodes with glow ---
for n in nodes:
    color = n['color']
    r = n['r']
    x, y = int(n['x']), int(n['y'])

    # Outer glow
    glow = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    g_draw = ImageDraw.Draw(glow)
    glow_r = r + 12
    g_draw.ellipse([x - glow_r, y - glow_r, x + glow_r, y + glow_r],
                   fill=(*color, 40))
    glow = glow.filter(ImageFilter.GaussianBlur(10))
    img = Image.alpha_composite(img, glow)

    # Core node
    draw = ImageDraw.Draw(img)
    draw.ellipse([x - r, y - r, x + r, y + r], fill=(*color, 220))

    # Inner highlight
    hr = max(2, r // 3)
    hx, hy = x - r // 4, y - r // 4
    draw.ellipse([hx - hr, hy - hr, hx + hr, hy + hr], fill=(255, 255, 255, 70))

# --- Circular mask ---
mask = Image.new('L', (SIZE, SIZE), 0)
mask_draw = ImageDraw.Draw(mask)
mask_draw.ellipse([CENTER - R, CENTER - R, CENTER + R, CENTER + R], fill=255)
img.putalpha(mask)

# --- Subtle border ring ---
draw = ImageDraw.Draw(img)
for offset in range(3):
    alpha = 80 - offset * 25
    draw.ellipse([CENTER - R + offset, CENTER - R + offset, CENTER + R - offset, CENTER + R - offset],
                 outline=(91, 156, 255, max(alpha, 10)), width=1)

# --- Save ---
img.save('C:/Users/mecklenburg/Desktop/brain/assets/brain-avatar.png')

# Also save smaller sizes for different platforms
for size, name in [(512, 'brain-avatar-512.png'), (256, 'brain-avatar-256.png')]:
    resized = img.resize((size, size), Image.LANCZOS)
    resized.save(f'C:/Users/mecklenburg/Desktop/brain/assets/{name}')

print(f'Generated: brain-avatar.png (1024px), brain-avatar-512.png, brain-avatar-256.png')
