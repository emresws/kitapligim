import argparse, sqlite3
from server import add_user, connect
parser=argparse.ArgumentParser(description='Kitaplığım profil yönetimi')
parser.add_argument('command',choices=['add-user','list-users'])
parser.add_argument('username',nargs='?')
a=parser.parse_args()
if a.command=='list-users':
    with connect() as c:
        for row in c.execute('SELECT username FROM users ORDER BY username'): print(row['username'])
else:
    if not a.username: parser.error('Profil adı gerekli.')
    try: add_user(a.username)
    except (ValueError,sqlite3.IntegrityError) as e: raise SystemExit(str(e))
    print('Profil oluşturuldu. Şifre gerekmez.')
