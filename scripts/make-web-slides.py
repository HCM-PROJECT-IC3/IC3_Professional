#!/usr/bin/env python3
"""
make-web-slides.py
────────────────────────────────────────────────────────────────────────
Tạo BẢN CHIẾU WEB nhẹ cho file .pptx quá lớn để Office Online trình chiếu
(trang tai-lieu-nam-hoc.html: Office Online mở được file 38MB, KHÔNG mở được
87MB → ngưỡng 50MB). File gốc giữ nguyên; bản mới tên "<tên> (web).pptx".

Giảm dung lượng ở phần phương tiện (slide, chữ, hiệu ứng giữ nguyên):
  • ảnh PNG/JPEG lớn → thu về tối đa 1920px (đủ nét cho máy chiếu)
  • video .mp4 → nén lại H.264 tối đa 1280px (cần ffmpeg)
  • mô hình 3D .glb → texture tối đa 1024px (texture không trong suốt lưu JPEG)
Mỗi phần chỉ thay khi bản mới NHỎ HƠN.

CÁCH CHẠY:
  python scripts/make-web-slides.py <file.pptx | thư mục> ... [--out THƯ_MỤC] [--min-mb 45] [--ffmpeg ĐƯỜNG_DẪN]
    --min-mb   chỉ xử lý file lớn hơn ngưỡng này (mặc định 45)
    --out      nơi ghi bản web (mặc định: cạnh file gốc)
    --ffmpeg   ffmpeg.exe (mặc định: biến môi trường FFMPEG hoặc "ffmpeg" trong PATH);
               thiếu ffmpeg thì bỏ qua phần video.

SAU ĐÓ: tải "<tên> (web).pptx" lên CÙNG thư mục với file gốc trên Google Drive rồi
  node scripts/build-slides-manifest.js
→ trang tự trình chiếu bằng bản web, danh sách vẫn hiện 1 dòng, "Mở trên Drive" vẫn mở file gốc.
────────────────────────────────────────────────────────────────────────
"""
import argparse
import io
import json
import os
import pathlib
import shutil
import struct
import subprocess
import sys
import tempfile
import zipfile

from PIL import Image

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")

IMG_MAX = 1920
TEX_MAX = 1024
IMG_MIN_BYTES = 300_000


def has_alpha(im):
    if im.mode in ("RGBA", "LA"):
        return im.getchannel("A").getextrema()[0] < 255
    return im.mode == "P" and "transparency" in im.info


def shrink_image(data, ext):
    """Ảnh PNG/JPEG lớn → tối đa IMG_MAX px, giữ nguyên định dạng (tên file trong pptx không đổi)."""
    im = Image.open(io.BytesIO(data))
    if getattr(im, "is_animated", False):
        return data
    if max(im.size) > IMG_MAX:
        im.thumbnail((IMG_MAX, IMG_MAX), Image.LANCZOS)
    out = io.BytesIO()
    if ext == "png":
        im.save(out, "PNG", optimize=True)
    else:
        im.convert("RGB").save(out, "JPEG", quality=82, optimize=True, progressive=True)
    return out.getvalue()


def shrink_glb(data):
    """Thu nhỏ texture trong .glb rồi dựng lại BIN chunk (accessor vẫn trỏ đúng bufferView)."""
    magic, version, _ = struct.unpack("<4sII", data[:12])
    if magic != b"glTF":
        return data
    jlen, jtype = struct.unpack("<II", data[12:20])
    gltf = json.loads(data[20:20 + jlen])
    pos = 20 + jlen
    blen, btype = struct.unpack("<II", data[pos:pos + 8])
    binbuf = data[pos + 8:pos + 8 + blen]
    views = gltf.get("bufferViews", [])
    chunks = [binbuf[v.get("byteOffset", 0):v.get("byteOffset", 0) + v["byteLength"]] for v in views]

    for img in gltf.get("images", []):
        if "bufferView" not in img:
            continue
        i = img["bufferView"]
        im = Image.open(io.BytesIO(chunks[i]))
        if max(im.size) <= TEX_MAX and len(chunks[i]) < 1_000_000:
            continue
        im.thumbnail((TEX_MAX, TEX_MAX), Image.LANCZOS)
        out = io.BytesIO()
        if has_alpha(im):
            im.save(out, "PNG", optimize=True)
            mime = "image/png"
        else:
            im.convert("RGB").save(out, "JPEG", quality=85, optimize=True)
            mime = "image/jpeg"
        if out.tell() < len(chunks[i]):
            chunks[i] = out.getvalue()
            img["mimeType"] = mime

    # Dựng lại buffer: các bufferView nối nhau, căn 4 byte như chuẩn glTF
    newbin = bytearray()
    for v, c in zip(views, chunks):
        while len(newbin) % 4:
            newbin.append(0)
        v["byteOffset"] = len(newbin)
        v["byteLength"] = len(c)
        newbin += c
    while len(newbin) % 4:
        newbin.append(0)
    gltf["buffers"][0]["byteLength"] = len(newbin)

    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * ((4 - len(js) % 4) % 4)
    body = struct.pack("<II", len(js), 0x4E4F534A) + js + struct.pack("<II", len(newbin), 0x004E4942) + bytes(newbin)
    return struct.pack("<4sII", b"glTF", version, 12 + len(body)) + body


def shrink_video(data, ffmpeg, tmp):
    src = os.path.join(tmp, "in.mp4")
    dst = os.path.join(tmp, "out.mp4")
    with open(src, "wb") as f:
        f.write(data)
    cmd = [ffmpeg, "-y", "-loglevel", "error", "-i", src,
           "-vf", "scale='min(1280,iw)':-2", "-c:v", "libx264", "-preset", "slow", "-crf", "28",
           "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", dst]
    subprocess.run(cmd, check=True)
    with open(dst, "rb") as f:
        return f.read()


def process(path, out_path, ffmpeg):
    zin = zipfile.ZipFile(path)
    tmp = tempfile.mkdtemp()
    saved = {}
    try:
        with zipfile.ZipFile(out_path, "w") as zout:
            for info in zin.infolist():
                data = zin.read(info)
                name = info.filename.lower()
                ext = name.rsplit(".", 1)[-1]
                new = data
                if name.startswith("ppt/media/"):
                    try:
                        if ext in ("png", "jpg", "jpeg") and len(data) > IMG_MIN_BYTES:
                            new = shrink_image(data, "png" if ext == "png" else "jpeg")
                        elif ext == "glb":
                            new = shrink_glb(data)
                        elif ext == "mp4" and ffmpeg:
                            new = shrink_video(data, ffmpeg, tmp)
                    except Exception as e:  # 1 phương tiện lỗi: giữ bản gốc, không bỏ cả file
                        print(f"    ! giữ nguyên {info.filename}: {e}")
                        new = data
                    if len(new) >= len(data):
                        new = data
                    else:
                        saved[ext] = saved.get(ext, 0) + len(data) - len(new)
                zi = zipfile.ZipInfo(info.filename, date_time=info.date_time)
                zi.compress_type = info.compress_type
                zi.external_attr = info.external_attr
                zout.writestr(zi, new)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    with zipfile.ZipFile(out_path) as z:  # kiểm tra bản mới đọc lại được
        bad = z.testzip()
        if bad:
            raise RuntimeError(f"bản web hỏng ở {bad}")
    return saved


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("inputs", nargs="+")
    ap.add_argument("--out")
    ap.add_argument("--min-mb", type=float, default=45)
    ap.add_argument("--ffmpeg", default=os.environ.get("FFMPEG") or shutil.which("ffmpeg"))
    a = ap.parse_args()
    if not a.ffmpeg:
        print("⚠ Không thấy ffmpeg — bỏ qua phần nén video (truyền --ffmpeg hoặc đặt biến FFMPEG).")

    files = []
    for p in map(pathlib.Path, a.inputs):
        files += sorted(p.rglob("*.pptx")) if p.is_dir() else [p]
    files = [f for f in files if not f.stem.endswith("(web)") and f.stat().st_size > a.min_mb * 1e6]
    if not files:
        print(f"Không có file .pptx nào lớn hơn {a.min_mb:g}MB.")
        return

    for f in files:
        dest_dir = pathlib.Path(a.out) if a.out else f.parent
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest = dest_dir / f"{f.stem} (web).pptx"
        print(f"• {f.name} ({f.stat().st_size / 1e6:.1f}MB)")
        saved = process(f, dest, a.ffmpeg)
        detail = ", ".join(f"{k} −{v / 1e6:.1f}MB" for k, v in sorted(saved.items(), key=lambda kv: -kv[1]))
        size = dest.stat().st_size / 1e6
        flag = "" if size <= 50 else "  ⚠ vẫn > 50MB — Office Online sẽ không trình chiếu được"
        print(f"    → {dest} ({size:.1f}MB; {detail or 'không giảm được'}){flag}")


if __name__ == "__main__":
    main()
