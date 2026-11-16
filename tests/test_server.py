import os, tempfile, unittest, hashlib, uuid, importlib.util, subprocess, sys, json
os.environ['DATA_DIR']=tempfile.mkdtemp(prefix='kitaplik-api-')
import server

class ServerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):

        for name in ['alice','bob']:
            try: server.add_user(name)
            except ValueError: pass
    def setUp(self):
        self.a=server.app.test_client();self.b=server.app.test_client()
        self.ca=self.login(self.a,'alice','a-safe-test-password')['csrf']
        self.cb=self.login(self.b,'bob','another-test-password')['csrf']
        self.bid=hashlib.sha256(uuid.uuid4().bytes).hexdigest()
    def login(self,c,u,p=None):
        r=c.post('/api/login',json={'username':u},headers={'X-Kitaplik':'1'})
        self.assertEqual(r.status_code,200);return r.json
    def op(self,patch=None,base=None,kind='book',force=False,oid=None):
        return {'opId':oid or uuid.uuid4().hex,'id':self.bid,'kind':kind,'patch':patch or {},'base':base or {},'force':force}
    def post(self,op,c=None,csrf=None):
        return (c or self.a).post('/api/operation',json=op,headers={'X-Kitaplik':'1','X-CSRF':csrf or self.ca})
    def create(self):
        self.assertEqual(self.post(self.op({'title':'Dune','author':'Frank Herbert','format':'PDF','status':'reading','position':1,'notes':''})).status_code,200)
    def book(self):return next(b for b in self.a.get('/api/state').json['books'] if b['id']==self.bid)
    def test_isolation_and_session(self):
        self.create();self.assertNotIn(self.bid,[b['id'] for b in self.b.get('/api/state').json['books']])
        self.assertEqual(self.b.get('/api/books/'+self.bid+'/file').status_code,404)
        self.assertEqual(server.app.test_client().get('/api/state').status_code,401)
        self.assertEqual(self.a.post('/api/operation',json=self.op({'title':'Hack'})).status_code,403)
        r=self.a.post('/api/operation',json=self.op({'title':'Hack'}),headers={'X-Kitaplik':'1','X-CSRF':self.ca,'Origin':'https://evil.example'})
        self.assertEqual(r.status_code,403)
    def test_nonoverlap_offline_merge_and_idempotence(self):
        self.create()
        pc=self.op({'notes':'PC notu'},{'notes':''});phone=self.op({'position':77},{'position':1})
        self.assertEqual(self.post(pc).status_code,200);self.assertEqual(self.post(phone).status_code,200)
        self.assertEqual(self.post(phone).json['duplicate'],True)
        self.assertEqual((self.book()['notes'],self.book()['position']),('PC notu',77))
    def test_same_field_conflict_preserved_then_explicit_force(self):
        self.create();self.post(self.op({'position':20},{'position':1}))
        phone=self.op({'position':8},{'position':1});r=self.post(phone)
        self.assertEqual(r.status_code,409);self.assertEqual(r.json['current']['position'],20)
        self.assertEqual(self.book()['position'],20)
        phone['force']=True;self.assertEqual(self.post(phone).status_code,200);self.assertEqual(self.book()['position'],8)
    def test_deletion_is_not_silently_resurrected(self):
        self.create();self.assertEqual(self.post(self.op(kind='delete')).status_code,200)
        r=self.post(self.op({'notes':'offlinedraft'},{'notes':''}));self.assertEqual(r.status_code,409)
        self.assertTrue(r.json['deleted']);self.assertIn(self.bid,self.a.get('/api/state').json['deleted'])
    def test_file_integrity_ownership_download_delete(self):
        content=b'%PDF-1.4\nbook test';self.bid=hashlib.sha256(content).hexdigest();self.create()
        url='/api/books/'+self.bid+'/file';headers={'X-Kitaplik':'1','X-CSRF':self.ca}
        self.assertEqual(self.a.put(url,data=b'wrong',headers=headers).status_code,400)
        self.assertEqual(self.a.put(url,data=content,headers=headers).status_code,200)
        with self.a.get(url) as response: self.assertEqual(response.data,content)
        self.assertTrue(self.book()['hasFile'])
        self.assertEqual(self.b.put(url,data=content,headers={'X-Kitaplik':'1','X-CSRF':self.cb}).status_code,404)
        self.post(self.op(kind='delete'));self.assertEqual(self.a.get(url).status_code,404)
    def test_preferences_independent_and_restart_persistence(self):
        self.post(self.op({'quote':'Benim alıntım'},kind='preferences'))
        self.assertEqual(self.a.get('/api/state').json['preferences']['quote'],'Benim alıntım')
        self.assertNotEqual(self.b.get('/api/state').json['preferences'].get('quote'),'Benim alıntım')
        self.create();fresh=subprocess.check_output([sys.executable,'-c',"import server,json;\nwith server.connect() as c: print(json.dumps([r[0] for r in c.execute('select id from records where deleted=0')]))"]);self.assertIn(self.bid,json.loads(fresh));spec=importlib.util.spec_from_file_location('restarted_server',server.__file__);module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
        c=module.app.test_client();self.login(c,'alice','a-safe-test-password');self.assertIn(self.bid,[b['id'] for b in c.get('/api/state').json['books']])
    def test_profiles_dropdown_and_passwordless_switch(self):
        server.add_user('Çağrı Yılmaz')
        c=server.app.test_client();rows=c.get('/api/profiles').json
        profile=next(p for p in rows if p['username']=='Çağrı Yılmaz')
        self.assertEqual(set(profile),{'id','username'})
        r=c.post('/api/login',json={'profileId':profile['id']},headers={'X-Kitaplik':'1'})
        self.assertEqual(r.status_code,200);self.assertEqual(c.get('/api/session').json['username'],'Çağrı Yılmaz')
        self.assertNotIn('Secure',r.headers['Set-Cookie'])
        self.assertEqual(c.post('/api/login',json={'profileId':'nonexistent'},headers={'X-Kitaplik':'1'}).status_code,404)
    def test_legacy_profile_keeps_id_and_books_without_password(self):
        uid='legacy-migration-test'
        with server.connect() as c:
            c.execute('INSERT INTO users VALUES(?,?,?)',(uid,'eski-profil','old-password-hash'))
            c.execute('INSERT INTO records VALUES(?,?,?,0)',(uid,self.bid,json.dumps({'title':'Eski kitap','format':'Manuel','status':'want'})))
        c=server.app.test_client();result=self.login(c,'eski-profil');self.assertEqual(result['id'],uid)
        self.assertEqual(c.get('/api/state').json['books'][0]['title'],'Eski kitap')
    def test_https_origin_through_proxy(self):
        self.create();r=self.a.post('/api/operation',json=self.op({'position':2},{'position':1}),headers={'X-Kitaplik':'1','X-CSRF':self.ca,'Origin':'https://localhost'})
        self.assertEqual(r.status_code,200)

class ReadingTimeTest(unittest.TestCase):
    setUp=ServerTest.setUp
    login=ServerTest.login
    op=ServerTest.op
    post=ServerTest.post
    create=ServerTest.create
    book=ServerTest.book
    def timepost(self,day='2026-11-01',ms=15000,oid=None,client=None,csrf=None,imported=False):
        return (client or self.a).post('/api/reading-time',json={'opId':oid or uuid.uuid4().hex,'bookId':self.bid,'day':day,'milliseconds':ms,'import':imported},headers={'X-Kitaplik':'1','X-CSRF':csrf or self.ca})
    @classmethod
    def setUpClass(cls):
        for name in ["alice","bob"]:
            try: server.add_user(name)
            except ValueError: pass
    def test_time_idempotence_months_and_status(self):
        self.create();self.post(self.op({'status':'want'},{'status':'reading'}));oid=uuid.uuid4().hex
        self.assertEqual(self.timepost('2026-10-31',10000,oid).status_code,200)
        self.assertTrue(self.timepost('2026-10-31',10000,oid).json['duplicate'])
        self.assertEqual(self.timepost('2026-11-01',20000).status_code,200)
        rows=[r for r in self.a.get('/api/state').json['readingTime'] if r['bookId']==self.bid]
        self.assertEqual({r['day']:r['milliseconds'] for r in rows},{'2026-10-31':10000,'2026-11-01':20000})
        self.assertEqual(self.book()['status'],'want')
        self.assertNotIn(self.bid,[r['bookId'] for r in self.b.get('/api/state').json['readingTime']])
        self.assertEqual(self.timepost(client=self.b,csrf=self.cb).status_code,404)
    def test_time_validation_import_max_and_csrf(self):
        self.create();self.assertEqual(self.timepost('2026-02-30').status_code,400);self.assertEqual(self.timepost(ms=-1).status_code,400)
        self.assertEqual(self.timepost(ms=50000,imported=True).status_code,200);self.assertEqual(self.timepost(ms=10000,imported=True).status_code,200)
        rows=[r for r in self.a.get('/api/state').json['readingTime'] if r['bookId']==self.bid];self.assertEqual(rows[0]['milliseconds'],50000)
        self.assertEqual(self.a.post('/api/reading-time',json={},headers={'X-Kitaplik':'1'}).status_code,403)

if __name__=='__main__': unittest.main()
