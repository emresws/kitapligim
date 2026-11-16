import unittest
import uuid
import test_server as fixtures
from test_server import server

class LibraryOptionsTest(unittest.TestCase):
    def test_override_and_catalog_are_saved_independently_per_profile(self):
        for name in ['library-options', 'library-options-other']:
            try: server.add_user(name)
            except ValueError: pass
        helper=fixtures.ServerTest()
        a=server.app.test_client()
        b=server.app.test_client()
        csrf=helper.login(a,'library-options')['csrf']
        helper.login(b,'library-options-other')
        bid='2'*64
        def op(kind,patch,base=None):
            return a.post('/api/operation',json={'opId':uuid.uuid4().hex,'id':bid,'kind':kind,'patch':patch,'base':base or {}},headers={'X-Kitaplik':'1','X-CSRF':csrf})
        self.assertEqual(op('book',{'format':'PDF','title':'PDF kitap','status':'read','pages':90,'pagesOverride':155}).status_code,200)
        self.assertEqual(op('preferences',{'genreCatalog':{'added':['Deneme'],'removed':['Roman']}}).status_code,200)
        self.assertEqual(op('book',{'pagesOverride':0}).status_code,400)
        self.assertEqual(op('book',{'pagesOverride':12.5}).status_code,400)
        self.assertEqual(op('preferences',{'genreCatalog':{'added':'Deneme','removed':[]}}).status_code,400)
        state=a.get('/api/state').json
        self.assertEqual(state['books'][0]['pages'],90)
        self.assertEqual(state['books'][0]['pagesOverride'],155)
        self.assertEqual(state['preferences']['genreCatalog']['removed'],['Roman'])
        self.assertNotIn('genreCatalog',b.get('/api/state').json['preferences'])
        self.assertEqual(op('book',{'pagesOverride':None},{'pagesOverride':155}).status_code,200)
        self.assertIsNone(a.get('/api/state').json['books'][0]['pagesOverride'])
