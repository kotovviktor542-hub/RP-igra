#!/usr/bin/env python3
"""Оптимизатор GLB: ужимает текстуры и выбрасывает лишние анимации.

Исходные модели Mixamo весят 8-9 МБ из-за PNG 2048x2048 — для телефона это
слишком. Скрипт пересобирает GLB: текстуры -> JPEG (или PNG с альфой) нужного
размера, ненужные клипы анимации удаляются, буфер перепаковывается.

Использование:
  python3 tools/glb_optimize.py in.glb out.glb --max-tex 1024 --keep-anims idle,walk,run
"""
import argparse
import io
import json
import struct
import sys

from PIL import Image

GLB_MAGIC = 0x46546C67
JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942


def read_glb(path):
    data = open(path, 'rb').read()
    magic, version, length = struct.unpack('<III', data[:12])
    assert magic == GLB_MAGIC, 'не GLB'
    off = 12
    js, binary = None, b''
    while off < length:
        clen, ctype = struct.unpack('<II', data[off:off + 8])
        chunk = data[off + 8:off + 8 + clen]
        if ctype == JSON_CHUNK:
            js = json.loads(chunk.decode('utf-8'))
        elif ctype == BIN_CHUNK:
            binary = chunk
        off += 8 + clen + ((4 - clen % 4) % 4 if clen % 4 else 0)
    return js, binary


def write_glb(path, js, binary):
    jsb = json.dumps(js, separators=(',', ':')).encode('utf-8')
    jsb += b' ' * ((4 - len(jsb) % 4) % 4)
    binary += b'\0' * ((4 - len(binary) % 4) % 4)
    total = 12 + 8 + len(jsb) + 8 + len(binary)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', GLB_MAGIC, 2, total))
        f.write(struct.pack('<II', len(jsb), JSON_CHUNK))
        f.write(jsb)
        f.write(struct.pack('<II', len(binary), BIN_CHUNK))
        f.write(binary)


def shrink_image(raw, max_size, quality, max_alpha=512):
    im = Image.open(io.BytesIO(raw))
    has_alpha = im.mode in ('RGBA', 'LA') or (im.mode == 'P' and 'transparency' in im.info)
    if has_alpha:
        max_size = min(max_size, max_alpha)
    w, h = im.size
    if max(w, h) > max_size:
        k = max_size / max(w, h)
        im = im.resize((max(1, int(w * k)), max(1, int(h * k))), Image.LANCZOS)
    out = io.BytesIO()
    if has_alpha:
        im = im.convert('RGBA')
        im = im.quantize(colors=128, method=Image.FASTOCTREE).convert('RGBA')
        im.save(out, 'PNG', optimize=True)
        return out.getvalue(), 'image/png'
    im.convert('RGB').save(out, 'JPEG', quality=quality, optimize=True)
    return out.getvalue(), 'image/jpeg'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('dst')
    ap.add_argument('--max-tex', type=int, default=1024)
    ap.add_argument('--quality', type=int, default=82)
    ap.add_argument('--max-alpha', type=int, default=512)
    ap.add_argument('--keep-anims', default='')      # список имён через запятую
    ap.add_argument('--rename-anims', default='')    # "старое=новое,старое2=новое2"
    args = ap.parse_args()

    js, binary = read_glb(args.src)

    # ---- анимации ----
    if args.keep_anims:
        keep = [s.strip() for s in args.keep_anims.split(',') if s.strip()]
        anims = js.get('animations', [])
        js['animations'] = [a for a in anims if a.get('name') in keep]
        print(f'анимации: {len(anims)} -> {len(js["animations"])}')
    if args.rename_anims:
        pairs = dict(p.split('=') for p in args.rename_anims.split(',') if '=' in p)
        for a in js.get('animations', []):
            if a.get('name') in pairs:
                a['name'] = pairs[a['name']]

    # ---- выбрасываем аксессоры, на которые больше никто не ссылается ----
    def prune(js):
        used_acc = set()
        for mesh in js.get('meshes', []):
            for prim in mesh.get('primitives', []):
                used_acc.update(prim.get('attributes', {}).values())
                if 'indices' in prim:
                    used_acc.add(prim['indices'])
                for tgt in prim.get('targets', []):
                    used_acc.update(tgt.values())
        for skin in js.get('skins', []):
            if 'inverseBindMatrices' in skin:
                used_acc.add(skin['inverseBindMatrices'])
        for anim in js.get('animations', []):
            for s in anim.get('samplers', []):
                used_acc.add(s['input'])
                used_acc.add(s['output'])

        keep_acc = sorted(used_acc)
        acc_map = {old: new for new, old in enumerate(keep_acc)}
        js['accessors'] = [js['accessors'][i] for i in keep_acc]

        used_bv = set()
        for a in js['accessors']:
            if a.get('bufferView') is not None:
                used_bv.add(a['bufferView'])
            if 'sparse' in a:
                used_bv.add(a['sparse']['indices']['bufferView'])
                used_bv.add(a['sparse']['values']['bufferView'])
        for img in js.get('images', []):
            if img.get('bufferView') is not None:
                used_bv.add(img['bufferView'])

        keep_bv = sorted(used_bv)
        bv_map = {old: new for new, old in enumerate(keep_bv)}
        js['bufferViews'] = [js['bufferViews'][i] for i in keep_bv]

        for a in js['accessors']:
            if a.get('bufferView') is not None:
                a['bufferView'] = bv_map[a['bufferView']]
            if 'sparse' in a:
                a['sparse']['indices']['bufferView'] = bv_map[a['sparse']['indices']['bufferView']]
                a['sparse']['values']['bufferView'] = bv_map[a['sparse']['values']['bufferView']]
        for img in js.get('images', []):
            if img.get('bufferView') is not None:
                img['bufferView'] = bv_map[img['bufferView']]
        for mesh in js.get('meshes', []):
            for prim in mesh.get('primitives', []):
                prim['attributes'] = {k: acc_map[v] for k, v in prim.get('attributes', {}).items()}
                if 'indices' in prim:
                    prim['indices'] = acc_map[prim['indices']]
                if prim.get('targets'):
                    prim['targets'] = [{k: acc_map[v] for k, v in tg.items()} for tg in prim['targets']]
        for skin in js.get('skins', []):
            if 'inverseBindMatrices' in skin:
                skin['inverseBindMatrices'] = acc_map[skin['inverseBindMatrices']]
        for anim in js.get('animations', []):
            for s in anim.get('samplers', []):
                s['input'] = acc_map[s['input']]
                s['output'] = acc_map[s['output']]
        return len(keep_acc), len(keep_bv)

    na, nb = prune(js)
    print(f'аксессоров: {na}, bufferView: {nb}')

    # ---- какие bufferView реально нужны ----
    used = set()

    def mark(bv):
        if bv is not None:
            used.add(bv)

    for acc in js.get('accessors', []):
        mark(acc.get('bufferView'))
        if 'sparse' in acc:
            mark(acc['sparse']['indices'].get('bufferView'))
            mark(acc['sparse']['values'].get('bufferView'))
    for img in js.get('images', []):
        mark(img.get('bufferView'))

    # аккессоры, на которые больше никто не ссылается (удалённые анимации), не выкидываем:
    # перепаковка и так уберёт лишние bufferView только если они не used.

    # ---- пережимаем картинки ----
    new_images = {}
    saved = 0
    for i, img in enumerate(js.get('images', [])):
        bv_idx = img.get('bufferView')
        if bv_idx is None:
            continue
        bv = js['bufferViews'][bv_idx]
        start = bv.get('byteOffset', 0)
        raw = binary[start:start + bv['byteLength']]
        try:
            data, mime = shrink_image(raw, args.max_tex, args.quality, args.max_alpha)
        except Exception as e:                                   # noqa: BLE001
            print('  текстуру не трогаем:', e)
            continue
        saved += len(raw) - len(data)
        new_images[bv_idx] = data
        img['mimeType'] = mime
        print(f'  текстура {i}: {len(raw)//1024} КБ -> {len(data)//1024} КБ')

    # ---- перепаковка буфера ----
    out = bytearray()
    for idx, bv in enumerate(js['bufferViews']):
        start = bv.get('byteOffset', 0)
        raw = new_images.get(idx) or binary[start:start + bv['byteLength']]
        while len(out) % 4:
            out.append(0)
        bv['byteOffset'] = len(out)
        bv['byteLength'] = len(raw)
        out += raw

    js['buffers'] = [{'byteLength': len(out)}]
    write_glb(args.dst, js, bytes(out))

    import os
    print(f'{args.src} {os.path.getsize(args.src)//1024} КБ -> '
          f'{args.dst} {os.path.getsize(args.dst)//1024} КБ')


if __name__ == '__main__':
    sys.exit(main())
