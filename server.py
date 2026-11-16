"""Account-isolated durable book storage and optimistic field-level synchronization."""
import os, json, sqlite3, secrets, time, re, hashlib
from datetime import date
from urllib.parse import urlsplit
from contextlib import contextmanager
from pathlib import Path
from flask import Flask, request, jsonify, g, send_from_directory, send_file, abort
import unicodedata

DATA = Path(os.environ.get('DATA_DIR', '/data'))
DATA.mkdir(parents=True, exist_ok=True)
app = Flask(__name__, static_folder='dist', static_url_path='')
app.config['MAX_CONTENT_LENGTH'] = 512 * 1024 * 1024
ID = re.compile(r'^[a-f0-9]{64}$')
BOOK_FIELDS = set('title author year genre status rating favorite notes started ended added position pages pagesOverride pagesSource cover readerFont readerZoom authorBookRank filename format coverWarning'.split())
PREF_FIELDS = set('quote featuredBookId themeId customTheme genreCatalog'.split())

@contextmanager
def connect():
    c = sqlite3.connect(DATA / 'library.sqlite', timeout=30)
    c.row_factory = sqlite3.Row
    c.execute('PRAGMA journal_mode=WAL')
    c.execute('PRAGMA foreign_keys=ON')
    try:
        with c:
            yield c
    finally:
        c.close()

with connect() as c:
    c.executescript('''
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, uid TEXT NOT NULL REFERENCES users(id), csrf TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS records(uid TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(uid,id));
    CREATE TABLE IF NOT EXISTS operations(uid TEXT NOT NULL, op TEXT NOT NULL, PRIMARY KEY(uid,op));
    CREATE TABLE IF NOT EXISTS reading_daily(uid TEXT NOT NULL, book_id TEXT NOT NULL, day TEXT NOT NULL, milliseconds INTEGER NOT NULL, PRIMARY KEY(uid,book_id,day));
    CREATE TABLE IF NOT EXISTS attempts(key TEXT PRIMARY KEY, count INTEGER NOT NULL, until INTEGER NOT NULL);
    ''')

def add_user(username):
    username=unicodedata.normalize('NFC',username.strip())
    if not username or len(username)>60 or any(ord(c)<32 for c in username):
        raise ValueError('Profil adı 1–60 karakter olmalı.')
    with connect() as c:
        if any(r['username'].casefold()==username.casefold() for r in c.execute('SELECT username FROM users')):
            raise ValueError('Bu isimde bir profil zaten var.')
        # Retain the old column/schema and user ids, preserving all existing books.
        c.execute('INSERT INTO users VALUES(?,?,?)',(secrets.token_hex(16),username,''))

@app.before_request
def protect():
    if not request.path.startswith('/api/') or request.path=='/api/health': return
    if request.method != 'GET':
        if request.path=='/api/login' and (request.content_length or 0)>16384: abort(413)
        if request.path=='/api/operation' and (request.content_length or 0)>9_000_000: abort(413)
        if request.headers.get('X-Kitaplik') != '1': abort(403)
        origin=request.headers.get('Origin')
        if origin and urlsplit(origin).netloc != request.host: abort(403)
    if request.path in ('/api/login','/api/profiles'): return
    token=request.cookies.get('kitaplik_session','')
    with connect() as c:
        row=c.execute('SELECT s.*,u.username FROM sessions s JOIN users u ON u.id=s.uid WHERE token=? AND expires>?',(hashlib.sha256(token.encode()).hexdigest(),int(time.time()))).fetchone()
    if not row: abort(401)
    g.user=row
    if request.method!='GET' and not secrets.compare_digest(request.headers.get('X-CSRF',''),row['csrf']): abort(403)

@app.after_request
def headers(response):
    response.headers['X-Content-Type-Options']='nosniff'
    response.headers['Referrer-Policy']='same-origin'
    response.headers['X-Frame-Options']='DENY'
    if request.path.startswith('/api/'):
        response.headers['Cache-Control']='no-store'
    elif request.path in ('/','/index.html','/sw.js'):
        response.headers['Cache-Control']='no-cache'
    return response

@app.errorhandler(401)
@app.errorhandler(403)
@app.errorhandler(404)
@app.errorhandler(413)
def error(e): return jsonify(error={401:'Oturum açman gerekiyor.',403:'Bu işlem için yetkin yok.',404:'Kayıt bulunamadı.',413:'Dosya en fazla 512 MB olabilir.'}[e.code]),e.code

@app.get('/')
def index(): return send_from_directory('dist','index.html')
@app.get('/api/health')
def health():
    with connect() as c: c.execute('SELECT 1').fetchone()
    return jsonify(ok=True)

@app.get('/api/profiles')
def profiles():
    with connect() as c: rows=c.execute('SELECT id,username FROM users ORDER BY username COLLATE NOCASE').fetchall()
    return jsonify([dict(row) for row in rows])

@app.post('/api/login')
def login():
    body=request.get_json(silent=True) or {}
    with connect() as c:
        if body.get('profileId'):
            user=c.execute('SELECT * FROM users WHERE id=?',(str(body['profileId']),)).fetchone()
        else:
            user=c.execute('SELECT * FROM users WHERE username=?',(str(body.get('username','')).strip(),)).fetchone()
        if not user: return jsonify(error='Profil bulunamadı.'),404
        now=int(time.time())
        old=request.cookies.get('kitaplik_session')
        if old:c.execute('DELETE FROM sessions WHERE token=?',(hashlib.sha256(old.encode()).hexdigest(),))
        c.execute('DELETE FROM sessions WHERE expires<?',(now,))
        token,csrf=secrets.token_urlsafe(32),secrets.token_urlsafe(32)
        c.execute('INSERT INTO sessions VALUES(?,?,?,?)',(hashlib.sha256(token.encode()).hexdigest(),user['id'],csrf,now+30*86400))
    response=jsonify(id=user['id'],username=user['username'],csrf=csrf)
    response.set_cookie('kitaplik_session',token,max_age=30*86400,httponly=True,samesite='Strict',secure=False)
    return response

@app.get('/api/session')
def session(): return jsonify(id=g.user['uid'],username=g.user['username'],csrf=g.user['csrf'])
@app.post('/api/logout')
def logout():
    with connect() as c: c.execute('DELETE FROM sessions WHERE token=?',(g.user['token'],))
    r=jsonify(ok=True);r.delete_cookie('kitaplik_session');return r

@app.get('/api/state')
def state():
    with connect() as c: rows=c.execute('SELECT * FROM records WHERE uid=?',(g.user['uid'],)).fetchall()
    books=[];prefs={};deleted=[]
    for row in rows:
        if row['id']=='settings': prefs=json.loads(row['data'])
        elif row['deleted']: deleted.append(row['id'])
        else:
            b=json.loads(row['data']);b['id']=row['id'];b['hasFile']=(DATA/'files'/g.user['uid']/row['id']).is_file();books.append(b)
    with connect() as c: time_rows=c.execute('SELECT book_id,day,milliseconds FROM reading_daily WHERE uid=?',(g.user['uid'],)).fetchall()
    return jsonify(books=books,preferences=prefs,deleted=deleted,readingTime=[{'id':r['book_id']+'|'+r['day'],'bookId':r['book_id'],'day':r['day'],'milliseconds':r['milliseconds']} for r in time_rows])

@app.post('/api/reading-time')
def reading_time():
    body=request.get_json(silent=True) or {}
    bid=body.get('bookId','');day=body.get('day','');ms=body.get('milliseconds');oid=body.get('opId','')
    if not isinstance(bid,str) or not ID.fullmatch(bid) or not isinstance(oid,str) or not re.fullmatch(r'[a-zA-Z0-9_-]{10,100}',oid): return jsonify(error='Geçersiz süre kaydı.'),400
    try:
        if not isinstance(day,str) or date.fromisoformat(day).isoformat()!=day: raise ValueError()
    except (ValueError,TypeError): return jsonify(error='Geçersiz gün.'),400
    if isinstance(ms,bool) or not isinstance(ms,int) or not 0<ms<=(172800000 if body.get('import') is True else 60000): return jsonify(error='Geçersiz süre.'),400
    uid=g.user['uid'];mode='import' if body.get('import') is True else 'increment'
    with connect() as c:
        c.execute('BEGIN IMMEDIATE')
        if c.execute('SELECT 1 FROM operations WHERE uid=? AND op=?',(uid,oid)).fetchone(): return jsonify(ok=True,duplicate=True)
        if mode!='import' and not c.execute('SELECT 1 FROM records WHERE uid=? AND id=?',(uid,bid)).fetchone(): return jsonify(error='Kitap bulunamadı.'),404
        if mode=='import':
            c.execute('INSERT INTO reading_daily VALUES(?,?,?,?) ON CONFLICT(uid,book_id,day) DO UPDATE SET milliseconds=max(milliseconds,excluded.milliseconds)',(uid,bid,day,ms))
        else:
            c.execute('INSERT INTO reading_daily VALUES(?,?,?,?) ON CONFLICT(uid,book_id,day) DO UPDATE SET milliseconds=milliseconds+excluded.milliseconds',(uid,bid,day,ms))
        c.execute('INSERT INTO operations VALUES(?,?)',(uid,oid))
    return jsonify(ok=True)

@app.post('/api/operation')
def operation():
    op=request.get_json(silent=True) or {}
    kind=op.get('kind');bid='settings' if kind=='preferences' else op.get('id','')
    oid=op.get('opId','')
    if kind not in ('book','preferences','delete') or not isinstance(oid,str) or not re.fullmatch(r'[a-zA-Z0-9_-]{10,100}',oid) or (bid!='settings' and not ID.fullmatch(bid)): return jsonify(error='Geçersiz işlem.'),400
    patch=op.get('patch',{});base=op.get('base',{})
    allowed=PREF_FIELDS if kind=='preferences' else BOOK_FIELDS
    if not isinstance(patch,dict) or not isinstance(base,dict) or set(patch)-allowed or len(json.dumps(patch))>8_000_000: return jsonify(error='Geçersiz alanlar.'),400
    if kind=='preferences' and patch.get('genreCatalog') is not None:
        catalog=patch['genreCatalog']
        if (not isinstance(catalog,dict) or set(catalog)!={'added','removed'} or
            any(not isinstance(values,list) or len(values)>2000 or
                any(not isinstance(value,str) or not value.strip() or len(value)>120 for value in values)
                for values in catalog.values())):
            return jsonify(error='Geçersiz kitap türü listesi.'),400
    if kind=='book':
        override=patch.get('pagesOverride')
        if override is not None and (type(override) is not int or not 1<=override<=1_000_000): return jsonify(error='Geçersiz sayfa sayısı.'),400
        if 'format' in patch and patch['format'] not in ('PDF','EPUB','Manuel'): return jsonify(error='Geçersiz biçim.'),400
        if 'status' in patch and patch['status'] not in ('want','reading','read'): return jsonify(error='Geçersiz raf.'),400
        for field in ('started','ended'):
            if patch.get(field):
                try:
                    if date.fromisoformat(patch[field]).isoformat()!=patch[field]: raise ValueError()
                except (ValueError,TypeError): return jsonify(error='Geçersiz tarih.'),400
        if 'rating' in patch and (not isinstance(patch['rating'],(int,float)) or not 0<=patch['rating']<=5): return jsonify(error='Geçersiz puan.'),400
        for field in ('pages','readerFont','authorBookRank','added'):
            if patch.get(field) is not None and (not isinstance(patch[field],(int,float)) or abs(patch[field])>1e15): return jsonify(error='Geçersiz sayı.'),400
        for field in ('title','author','genre','notes','cover','filename','year','started','ended'):
            if field in patch and patch[field] is not None and not isinstance(patch[field],str): return jsonify(error='Geçersiz metin.'),400
    uid=g.user['uid']
    with connect() as c:
        c.execute('BEGIN IMMEDIATE')
        if c.execute('SELECT 1 FROM operations WHERE uid=? AND op=?',(uid,oid)).fetchone(): return jsonify(ok=True,duplicate=True)
        row=c.execute('SELECT * FROM records WHERE uid=? AND id=?',(uid,bid)).fetchone()
        current=json.loads(row['data']) if row else {}
        conflict=[]
        if row and row['deleted'] and kind!='delete': conflict=['silinen kitap']
        elif kind=='delete':
            if row and not row['deleted']: conflict=[k for k,v in base.items() if k in BOOK_FIELDS and current.get(k)!=v]
        else:
            conflict=[k for k,v in patch.items() if current.get(k)!=base.get(k) and current.get(k)!=v]
        if conflict and op.get('force') is not True: return jsonify(conflict=conflict,current=current,deleted=bool(row and row['deleted'])),409
        if kind=='delete':
            c.execute('INSERT OR REPLACE INTO records VALUES(?,?,?,1)',(uid,bid,json.dumps(current)))
        else:
            current.update(patch)
            if kind=='book' and (not isinstance(current.get('title'),str) or current.get('format') not in ('PDF','EPUB','Manuel') or current.get('status') not in ('want','reading','read')): return jsonify(error='Kitap bilgileri eksik.'),400
            c.execute('INSERT OR REPLACE INTO records VALUES(?,?,?,0)',(uid,bid,json.dumps(current,ensure_ascii=False)))
        c.execute('INSERT INTO operations VALUES(?,?)',(uid,oid))
        if kind=='delete': (DATA/'files'/uid/bid).unlink(missing_ok=True)
    return jsonify(ok=True)

@app.route('/api/books/<bid>/file',methods=['GET','PUT'])
def book_file(bid):
    if not ID.fullmatch(bid): abort(404)
    uid=g.user['uid']
    with connect() as c: row=c.execute('SELECT * FROM records WHERE uid=? AND id=? AND deleted=0',(uid,bid)).fetchone()
    if not row: abort(404)
    path=DATA/'files'/uid/bid
    metadata=json.loads(row['data'])
    if request.method=='GET':
        if not path.is_file(): abort(404)
        return send_file(path,mimetype='application/pdf' if metadata['format']=='PDF' else 'application/epub+zip',as_attachment=True,download_name=Path(metadata.get('filename','book')).name)
    if metadata.get('format')=='Manuel': return jsonify(error='Manuel kitapta dosya yok.'),400
    path.parent.mkdir(parents=True,exist_ok=True)
    temp=path.with_name(bid+'.'+secrets.token_hex(8)+'.tmp')
    try:
        digest=hashlib.sha256();size=0
        with temp.open('wb') as output:
            while chunk:=request.stream.read(1024*1024):
                size+=len(chunk)
                if size>app.config['MAX_CONTENT_LENGTH']: abort(413)
                digest.update(chunk);output.write(chunk)
            output.flush();os.fsync(output.fileno())
        if digest.hexdigest()!=bid: return jsonify(error='Dosya kimliği uyuşmuyor.'),400
        # Lock against a concurrent deletion between validation and final rename.
        with connect() as c:
            c.execute('BEGIN IMMEDIATE')
            row=c.execute('SELECT deleted FROM records WHERE uid=? AND id=?',(uid,bid)).fetchone()
            if not row or row['deleted']: abort(404)
            os.replace(temp,path)
        return jsonify(ok=True)
    finally: temp.unlink(missing_ok=True)
