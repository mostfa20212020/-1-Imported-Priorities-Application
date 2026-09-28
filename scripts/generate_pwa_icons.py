#!/usr/bin/env python3
import os
import struct
import zlib
import math

def create_png_rgba(filename, width, height, draw_func):
    """Generate a valid RGBA PNG using pure python standard library."""
    raw_data = bytearray()
    for y in range(height):
        raw_data.append(0)  # filter type None
        for x in range(width):
            r, g, b, a = draw_func(x, y, width, height)
            raw_data.extend([r, g, b, a])
            
    def chunk(chunk_type, data):
        c = chunk_type + data
        crc = struct.pack(">I", zlib.crc32(c) & 0xffffffff)
        return struct.pack(">I", len(data)) + c + crc

    png_header = b"\x89PNG\r\n\x1a\n"
    # Bit depth 8, Color type 6 (RGBA), compression 0, filter 0, interlace 0
    ihdr_data = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    ihdr = chunk(b"IHDR", ihdr_data)
    idat = chunk(b"IDAT", zlib.compress(bytes(raw_data), 6))
    iend = chunk(b"IEND", b"")
    
    with open(filename, "wb") as f:
        f.write(png_header + ihdr + idat + iend)

def draw_app_icon(x, y, w, h, is_maskable=False):
    # Normalized coords 0 to 1
    nx = x / float(w)
    ny = y / float(h)
    
    # Background: Navy #163b50 to #0c2331
    bg_r = int(22 - 10 * ny)
    bg_g = int(59 - 24 * ny)
    bg_b = int(80 - 31 * ny)
    
    # Distance from center
    cx, cy = 0.5, 0.5
    dx = nx - cx
    dy = ny - cy
    dist = math.sqrt(dx*dx + dy*dy)
    
    if is_maskable:
        # Maskable icon: full-bleed background, safe zone inside 0.4 radius
        scale = 0.75
    else:
        # Standard icon
        scale = 0.95

    # Check outer circle ring
    ring_radius = 0.42 * scale
    gold = (212, 175, 55, 255)
    light_gold = (246, 211, 101, 255)
    
    # Gold decorative border
    if abs(dist - ring_radius) < 0.012:
        return gold
    if abs(dist - (ring_radius - 0.02)) < 0.005:
        return light_gold

    # Scales of justice / shield central motif
    # Center pillar: nx around 0.5, ny between 0.35 and 0.65
    pillar_w = 0.02 * scale
    if abs(nx - 0.5) < pillar_w and 0.32 * scale < ny < 0.68 * scale:
        return gold
    
    # Base
    if 0.66 * scale < ny < 0.70 * scale and abs(nx - 0.5) < 0.12 * scale:
        return gold
        
    # Top finial
    if math.sqrt((nx - 0.5)**2 + (ny - 0.31 * scale)**2) < 0.03 * scale:
        return light_gold
        
    # Balance beam
    beam_w = 0.014 * scale
    beam_y = 0.37 * scale
    if abs(ny - beam_y) < beam_w and 0.28 * scale < nx < 0.72 * scale:
        return gold
        
    # Left pan string and pan
    left_x = 0.30 * scale
    if 0.37 * scale <= ny <= 0.48 * scale and abs(nx - left_x) < 0.008 * scale:
        return gold
    if 0.48 * scale <= ny <= 0.52 * scale and abs(nx - left_x) < 0.07 * scale:
        return light_gold

    # Right pan string and pan
    right_x = 0.70 * scale
    if 0.37 * scale <= ny <= 0.48 * scale and abs(nx - right_x) < 0.008 * scale:
        return gold
    if 0.48 * scale <= ny <= 0.52 * scale and abs(nx - right_x) < 0.07 * scale:
        return light_gold

    # Document badge center
    if 0.50 * scale < ny < 0.62 * scale and abs(nx - 0.5) < 0.06 * scale:
        return (255, 255, 255, 240)

    return (bg_r, bg_g, bg_b, 255)

def main():
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    pub = os.path.join(root, "client", "public")
    os.makedirs(pub, exist_ok=True)
    
    print("Generating PWA Icons...")
    create_png_rgba(os.path.join(pub, "pwa-192x192.png"), 192, 192, lambda x,y,w,h: draw_app_icon(x,y,w,h, False))
    create_png_rgba(os.path.join(pub, "pwa-512x512.png"), 512, 512, lambda x,y,w,h: draw_app_icon(x,y,w,h, False))
    create_png_rgba(os.path.join(pub, "pwa-maskable-512x512.png"), 512, 512, lambda x,y,w,h: draw_app_icon(x,y,w,h, True))
    create_png_rgba(os.path.join(pub, "apple-touch-icon.png"), 180, 180, lambda x,y,w,h: draw_app_icon(x,y,w,h, False))
    create_png_rgba(os.path.join(pub, "favicon.ico"), 32, 32, lambda x,y,w,h: draw_app_icon(x,y,w,h, False))
    print("Icons successfully created in client/public!")

if __name__ == "__main__":
    main()
