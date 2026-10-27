"""Local OCR worker. Images arrive over stdin; no image or chat files are stored."""
import base64, io, json, os, sys
os.environ.setdefault('OMP_NUM_THREADS', '2')
os.environ.setdefault('OPENBLAS_NUM_THREADS', '2')
engine = None

def recognize(encoded, with_image=False):
    global engine
    raw = base64.b64decode(encoded, validate=True)
    if len(raw) > 5 * 1024 * 1024:
        raise ValueError('图片超过5MB')
    from PIL import Image
    Image.MAX_IMAGE_PIXELS = 20000000
    with Image.open(io.BytesIO(raw)) as source:
        if source.width * source.height > 20000000 or max(source.size) > 20000:
            raise ValueError('图片尺寸过大，请裁成几张清晰截图')
        image = source.convert('RGB')
    if engine is None:
        from rapidocr import RapidOCR
        engine = RapidOCR(params={'Global.log_level': 'error', 'EngineConfig.onnxruntime.intra_op_num_threads': 2,
                                  'EngineConfig.onnxruntime.inter_op_num_threads': 1})
    import numpy as np
    texts = []
    # Long screenshots are read in bounded strips to retain small text.
    width, height = image.size
    for top in range(0, height, 1700):
        tile = image.crop((0, max(0, top - 80), width, min(height, top + 1800)))
        if tile.width > 1600:
            tile = tile.resize((1600, max(1, round(tile.height * 1600 / tile.width))))
        result = engine(np.asarray(tile))
        for text, score in zip(result.txts or [], result.scores or []):
            if float(score) >= 0.55 and text.strip() and text.strip() not in texts:
                texts.append(text.strip())
        if len('\n'.join(texts)) >= 600:
            break
    text = '\n'.join(texts)[:600]
    result = {'text': text}
    if with_image and len(''.join(text.split())) < 4:
        image.thumbnail((1024, 1024))
        output = io.BytesIO()
        image.save(output, format='JPEG', quality=82)
        result['imageData'] = 'data:image/jpeg;base64,' + base64.b64encode(output.getvalue()).decode('ascii')
    return result

for line in sys.stdin:
    if len(line) > 8 * 1024 * 1024:
        continue
    request = None
    try:
        request = json.loads(line)
        result = recognize(request['image'], request.get('withImage', False))
        response = {'id': request['id'], **result}
    except ImportError:
        response = {'id': (request or {}).get('id'), 'error': '本机缺少OCR依赖，请安装rapidocr、onnxruntime和Pillow'}
    except Exception:
        response = {'id': (request or {}).get('id'), 'error': '图片文字未读到，请换一张更清晰的截图'}
    print(json.dumps(response, ensure_ascii=True), flush=True)
