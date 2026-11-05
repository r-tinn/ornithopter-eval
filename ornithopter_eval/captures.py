"""Local-only clip storage, separate from immutable evaluation artifacts."""
from datetime import datetime, timezone
import hashlib
import html
import json
from pathlib import Path
import re
import uuid
from urllib.parse import parse_qs

from .runner import ROOT

MAX_CAPTURE_BYTES=32*1024*1024
FORMATS={'video/mp4':('.mp4',lambda b:len(b)>=16 and b[4:8]==b'ftyp'),
         'video/webm':('.webm',lambda b:b.startswith(b'\x1a\x45\xdf\xa3')),
         'image/png':('.png',lambda b:b.startswith(b'\x89PNG\r\n\x1a\n'))}


def directory(server):
    if hasattr(server,'capture_directory'):
        return Path(server.capture_directory)
    root=server.artifact_root
    scope=root.parent.name if root.name=='submission' else root.name
    return ROOT/'captures'/(re.sub(r'[^a-zA-Z0-9_-]','-',scope)[:100] or 'local')


def reply(handler,status,body,mime,*,filename=None):
    handler.send_response(status)
    handler.send_header('Content-Type',mime)
    handler.send_header('Content-Length',str(len(body)))
    handler.send_header('Cache-Control','no-store')
    handler.send_header('X-Content-Type-Options','nosniff')
    handler.send_header('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; media-src 'self'; frame-ancestors 'none'; base-uri 'none'")
    if filename:handler.send_header('Content-Disposition','attachment; filename="'+filename+'"')
    handler.end_headers();handler.wfile.write(body)


def save(handler):
    host=handler.headers.get('Host')
    if host not in ('127.0.0.1:'+str(handler.server.server_port),'localhost:'+str(handler.server.server_port)) or handler.headers.get('Origin')!='http://'+host:
        reply(handler,403,b'{"error":"Invalid capture origin"}','application/json');return
    try:
        size=int(handler.headers.get('Content-Length','0'))
        if not 0<size<=MAX_CAPTURE_BYTES:
            reply(handler,413,b'{"error":"Capture must be between 1 byte and 32 MiB"}','application/json');return
        mime=handler.headers.get('Content-Type','').split(';')[0]
        if mime not in FORMATS:raise ValueError('Unsupported capture format')
        trial=handler.headers.get('X-Flight-Trial','ornithopter')
        if not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}',trial):raise ValueError('Invalid trial name')
        handler.connection.settimeout(20)
        data=handler.rfile.read(size)
        extension,valid=FORMATS[mime]
        if len(data)!=size or not valid(data):raise ValueError('Invalid capture data')
        stamp=datetime.now(timezone.utc)
        name=re.sub(r'[^a-zA-Z0-9_-]','-',trial)+'-'+stamp.strftime('%Y%m%dT%H%M%SZ')+'-'+uuid.uuid4().hex[:12]+extension
        target=directory(handler.server);target.mkdir(parents=True,exist_ok=True)
        record={'filename':name,'trial':trial,'created_utc':stamp.isoformat(),'mime':mime,'bytes':size,
                'sha256':hashlib.sha256(data).hexdigest(),'kind':'illustrative viewer capture, not a graded model trial'}
        with (target/name).open('xb') as stream:stream.write(data)
        temporary=target/(name+'.json.tmp')
        with temporary.open('x') as stream:json.dump(record,stream,indent=2)
        temporary.replace(target/(name+'.json'))
        body={**record,'href':'/__captures/'+name,'download_href':'/__captures/'+name+'?download=1',
              'library_href':'/__captures/index.html','saved_path':str(target/name)}
        reply(handler,201,(json.dumps(body)+'\n').encode(),'application/json')
    except (OSError,ValueError) as error:
        reply(handler,400,json.dumps({'error':str(error)}).encode(),'application/json')


def get(handler,name,query):
    if not name.startswith('__captures/'):
        return False
    file=name.removeprefix('__captures/');target=directory(handler.server)
    if file in ('index.html','index.json'):
        records=[]
        for path in sorted(target.glob('*.json'),reverse=True):
            records.append(json.loads(path.read_text()))
        if file=='index.json':
            reply(handler,200,json.dumps(records).encode(),'application/json');return True
        cards=[]
        for record in records:
            filename=html.escape(record['filename'],quote=True);url='/__captures/'+filename
            media=('<video controls loop muted playsinline preload="metadata" src="'+url+'"></video>'
                   if record['mime'].startswith('video/') else '<img alt="Captured flight still" src="'+url+'">')
            cards.append('<article><h2>'+html.escape(record['trial'])+'</h2>'+media+'<p>'+html.escape(record['created_utc'][:10])+' · '+str(round(record['bytes']/1_000_000,1))+' MB</p><a href="'+url+'?download=1" download>Download '+('video' if record['mime'].startswith('video/') else 'PNG')+'</a></article>')
        page='''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your airfield films</title><style>body{background:#14251f;color:#eeeee2;font:15px/1.6 system-ui;margin:0}main{max-width:1200px;margin:auto;padding:40px 24px}h1{font:42px Georgia}h2{font:23px Georgia}p{color:#b6c5b5}section{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:28px}article{min-width:0}video,img{width:100%;aspect-ratio:16/9;object-fit:contain;background:#0b1710;border-radius:6px}a{color:#efe2c7}</style><main><h1>Your airfield films.</h1><p>Saved locally in this project's captures folder. You can return here after refreshing the simulator. These are viewer captures; benchmark scores are unchanged.</p><section>'''+(''.join(cards) or '<p>No clips yet. Choose Film a flyby in a simulator to make one.</p>')+'</section></main></html>'
        reply(handler,200,page.encode(),'text/html; charset=utf-8');return True
    if not re.fullmatch(r'[a-zA-Z0-9_-]+\.(mp4|webm|png)',file) or not (target/file).is_file():
        handler.send_error(404);return True
    mime={'.mp4':'video/mp4','.webm':'video/webm','.png':'image/png'}[Path(file).suffix]
    reply(handler,200,(target/file).read_bytes(),mime,filename=file if parse_qs(query).get('download')==['1'] else None)
    return True
