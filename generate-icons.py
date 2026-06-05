"""
Genera iconos PWA para Mi Periódico de Inversiones
Requiere: pip install Pillow
O usa el SVG embebido directamente en el HTML como fallback
"""
import struct, zlib, base64

def create_png_icon(size, output_path):
    """Crea un PNG simple con gradiente oscuro y símbolo de periódico"""
    # Generate raw pixel data
    pixels = []
    for y in range(size):
        row = []
        for x in range(size):
            # Background: dark gradient
            bg_r = int(10 + (x/size)*6)
            bg_g = int(10 + (y/size)*4)
            bg_b = int(15 + (x/size)*10)

            # Gold accent bar (top)
            bar_h = max(4, size // 30)
            if y < bar_h:
                r, g, b, a = 201, 168, 76, 255
            # Center icon area: "P" shape simplified
            elif (size*0.2 < x < size*0.8) and (size*0.25 < y < size*0.75):
                # Outer border of icon
                pad = size * 0.1
                if (x < size*0.25 or x > size*0.75 or
                    y < size*0.3 or y > size*0.7):
                    r, g, b, a = min(255, bg_r+15), min(255, bg_g+15), min(255, bg_b+20), 255
                else:
                    r, g, b, a = bg_r, bg_g, bg_b, 255
            else:
                r, g, b, a = bg_r, bg_g, bg_b, 255

            row.extend([r, g, b, a])
        pixels.append(bytes(row))

    # Build PNG
    def chunk(name, data):
        c = name + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)

    header = b'\x89PNG\r\n\x1a\n'
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 2, 0, 0, 0))

    # IDAT
    raw = b''.join(b'\x00' + row for row in pixels)
    idat = chunk(b'IDAT', zlib.compress(raw, 9))
    iend = chunk(b'IEND', b'')

    png_data = header + ihdr + idat + iend
    with open(output_path, 'wb') as f:
        f.write(png_data)
    print(f"✓ {output_path} ({size}x{size}px)")

if __name__ == '__main__':
    import os
    # Create simple fallback PNG icons
    try:
        create_png_icon(192, 'icon-192.png')
        create_png_icon(512, 'icon-512.png')
        print("\nIconos generados correctamente")
    except Exception as e:
        print(f"Error: {e}")
        print("Genera los iconos manualmente o usa un servicio como https://realfavicongenerator.net")
