"""
genera_icone.py — Genera le icone PNG dell'app SENZA librerie esterne.

Disegna un'icona "lista/organizer" (tre barre con pallini, gradiente ciano->blu
su sfondo scuro arrotondato) e la salva in piu' dimensioni. Il PNG e' codificato
a mano usando solo la libreria standard (zlib + struct).

Uso:  python tools/genera_icone.py
"""
import zlib
import struct
import os

# --- Colori (R, G, B) ---
BG_TOP = (16, 26, 52)      # navy chiaro in alto
BG_BOT = (7, 10, 20)       # navy scurissimo in basso
CIANO = (34, 211, 238)     # accento ciano (#22d3ee)
BLU = (59, 130, 246)       # accento blu (#3b82f6)
GLOW = (40, 110, 255)      # bagliore blu
PALLINO = (180, 240, 255)  # pallini chiari

def lerp(a, b, t):
    return a + (b - a) * t

def mix(c1, c2, t):
    return (lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t))

def clamp(v, lo, hi):
    return max(lo, min(hi, v))

def smoothstep(edge0, edge1, x):
    t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3 - 2 * t)

def rounded_rect_sdf(px, py, cx, cy, hw, hh, r):
    """Distanza con segno di un punto da un rettangolo arrotondato (negativa = dentro)."""
    qx = abs(px - cx) - (hw - r)
    qy = abs(py - cy) - (hh - r)
    dx, dy = max(qx, 0.0), max(qy, 0.0)
    return (dx * dx + dy * dy) ** 0.5 + min(max(qx, qy), 0.0) - r

def over(dst, src, a):
    """Composita src (con alpha a) sopra dst opaco."""
    return (lerp(dst[0], src[0], a), lerp(dst[1], src[1], a), lerp(dst[2], src[2], a))

def render(S):
    """Disegna l'icona a lato S e restituisce le righe di byte RGBA."""
    aa = 1.2  # ampiezza anti-aliasing (in pixel)

    # Geometria delle barre (proporzionale a S)
    barre = []
    larghezze = [0.50, 0.44, 0.38]
    centri_y = [0.355, 0.515, 0.675]
    left = 0.30
    h = 0.105
    for w, cyf in zip(larghezze, centri_y):
        barre.append({
            'cx': (left + w / 2.0) * S, 'cy': cyf * S,
            'hw': (w / 2.0) * S, 'hh': (h / 2.0) * S, 'r': (h / 2.0) * S,
            'x0': left * S, 'x1': (left + w) * S,
        })
    pallini = [{'cx': 0.225 * S, 'cy': cyf * S, 'r': 0.038 * S} for cyf in centri_y]

    righe = []
    for y in range(S):
        riga = bytearray()
        for x in range(S):
            px, py = x + 0.5, y + 0.5

            # 1) Sfondo: rettangolo arrotondato con gradiente verticale.
            sdf_bg = rounded_rect_sdf(px, py, S / 2, S / 2, S / 2, S / 2, 0.22 * S)
            alpha_bg = 1.0 - smoothstep(0.0, aa, sdf_bg)  # bordo morbido
            if alpha_bg <= 0.0:
                riga += bytes((0, 0, 0, 0))  # fuori dall'icona: trasparente
                continue
            col = mix(BG_TOP, BG_BOT, py / S)

            # 2) Bagliore blu in alto al centro (additivo, tenue).
            dgx, dgy = px - 0.5 * S, py - 0.30 * S
            dist_glow = (dgx * dgx + dgy * dgy) ** 0.5
            g = clamp(1.0 - dist_glow / (0.55 * S), 0.0, 1.0) ** 2 * 0.55
            col = (clamp(col[0] + GLOW[0] * g, 0, 255),
                   clamp(col[1] + GLOW[1] * g, 0, 255),
                   clamp(col[2] + GLOW[2] * g, 0, 255))

            # 3) Barre con gradiente orizzontale ciano->blu (+ alone).
            for b in barre:
                sdf = rounded_rect_sdf(px, py, b['cx'], b['cy'], b['hw'], b['hh'], b['r'])
                cov = 1.0 - smoothstep(0.0, aa, sdf)
                if cov > 0.0:
                    t = clamp((px - b['x0']) / (b['x1'] - b['x0']), 0.0, 1.0)
                    col = over(col, mix(CIANO, BLU, t), cov)
                else:
                    # alone luminoso attorno alla barra
                    alone = clamp(1.0 - sdf / (0.05 * S), 0.0, 1.0) ** 2 * 0.30
                    if alone > 0:
                        col = over(col, BLU, alone)

            # 4) Pallini chiari a sinistra di ogni barra.
            for p in pallini:
                d = ((px - p['cx']) ** 2 + (py - p['cy']) ** 2) ** 0.5
                cov = 1.0 - smoothstep(p['r'] - aa, p['r'], d)
                if cov > 0.0:
                    col = over(col, PALLINO, cov)

            riga += bytes((int(col[0] + 0.5), int(col[1] + 0.5), int(col[2] + 0.5),
                           int(alpha_bg * 255 + 0.5)))
        righe.append(bytes(riga))
    return righe

def scrivi_png(path, S, righe):
    raw = b''.join(b'\x00' + r for r in righe)  # filtro 0 per ogni riga
    comp = zlib.compress(raw, 9)

    def chunk(typ, data):
        return (struct.pack('>I', len(data)) + typ + data +
                struct.pack('>I', zlib.crc32(typ + data) & 0xffffffff))

    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        f.write(chunk(b'IHDR', struct.pack('>IIBBBBB', S, S, 8, 6, 0, 0, 0)))
        f.write(chunk(b'IDAT', comp))
        f.write(chunk(b'IEND', b''))

def main():
    out = os.path.join(os.path.dirname(__file__), '..', 'icons')
    os.makedirs(out, exist_ok=True)
    misure = {
        'icon-512.png': 512,
        'icon-192.png': 192,
        'apple-touch-icon.png': 180,
        'favicon-32.png': 32,
    }
    for nome, S in misure.items():
        scrivi_png(os.path.join(out, nome), S, render(S))
        print('creato', nome, f'({S}x{S})')

if __name__ == '__main__':
    main()
