# Kitaplığım

PDF ve EPUB arşivini tarayıcıdan yönet. Dosyasız kitap ekleyebilir, türleri düzenleyebilir, okuma durumunu ve konumunu kaydedebilirsin. Analizde sayfa ve okuma süresi görünümleri ile seçtiğin ayda bitirdiğin kitapların listesi bulunur. Okuyucu, okuma durumunu kendi başına değiştirmez.

İlk GitHub dağıtımı: **Release 1 (`v1.0.0`)**. Uygulama sürümü: **2.4.0**.

| Kurulum | Veriler nerede? | Ne zaman kullanılır? |
| --- | --- | --- |
| Yerel | Bu cihazın tarayıcı profilinde (IndexedDB) | Tek cihaz, sunucu olmadan |
| Docker | Linux sunucunun veri dizininde; cihazlarda çevrimdışı kopyalar tutulabilir | Birden çok profil ve cihaz arasında eşitleme |

## Docker: Linux sunucu

Gerekli: Git, Docker Engine ve güncel Docker Compose eklentisi (`docker compose`).

```bash
git clone https://github.com/emresws/kitapligim.git
cd kitapligim
docker compose up -d --build
docker compose exec kitaplik python manage.py add-user "Adın"
docker compose exec kitaplik python manage.py add-user "Arkadaşının adı"
```

Sunucudan `http://localhost:8765`, aynı ağdaki telefondan `http://SUNUCU_IP:8765` adresini aç. Linux sunucuda IP adresini `hostname -I` ile görebilirsin. Aynı adı seçtiğin cihazlar aynı kitaplığı kullanır. **Şifresiz profil seçimi erişim kontrolü değildir:** siteye erişebilen herkes herhangi bir profili seçebilir. Bu kurulumu güvendiğin yerel ağda kullan; portu internete açma.

Eşitleme için PDF/EPUB dosyalarını sunucuya yükledikten sonra **Eşitlendi** yazısını bekle. Çevrimdışı değişiklikler yeniden bağlanınca gönderilir. Telefonda düz HTTP ile site sekmesini kapattıktan sonra tamamen çevrimdışı yeniden açılış garanti edilmez. Önceden indirdiğin kitapları, mevcut sekme açıkken bağlantı kesilse de okuyabilirsin.

### Mevcut ZIP kurulumunu repoya bağla (bir kez)

1. Eski uygulamada cihazların **Eşitlendi** durumuna gelmesini bekle. Eski `compose.yaml` dizininde `realpath data` ile veri yolunu bul. Farklı bir dizin bağladıysan gerçek dizinin yolunu kullan.
2. Eski dizinde `docker compose stop` çalıştır. İstersen bu sırada bütün veri dizinini başka bir diske kopyala. `library.sqlite` ve `files/` aynı veri dizininde kalmalı.
3. Repoyu ayrı bir dizine klonla. Yeni repo dizininde aşağıdaki örnekte yolu kendi **mevcut** veri dizinine göre değiştir. Başlamadan önce o yolda `library.sqlite` dosyasının bulunduğunu doğrula.

```bash
git clone https://github.com/emresws/kitapligim.git
cd kitapligim
test -f /srv/kitaplik-eski/data/library.sqlite &&
  printf '%s\n' 'KITAPLIK_DATA_DIR=/srv/kitaplik-eski/data' > .env &&
  docker compose up -d --build --wait
```

Aynı adresi açıp profilleri ve kitapları kontrol et. Var olan kullanıcıları yeniden oluşturman gerekmez. Eski dizindeki konteyneri aynı anda başlatma; iki sunucu aynı porta veya aynı veri dizinine bağlanmamalı.

### Sonraki güncellemeler

Repodaki güncelleme `main` dalına yayımlandığında Linux sunucuda:

```bash
cd /repo/yolu/kitapligim
bash scripts/update-linux.sh
```

Betik `git pull --ff-only origin main` çalıştırır, sonra Docker imajını yeniden derleyip sağlık kontrolünün geçmesini bekler. İzlenen dosyalarda yerel değişiklik varsa veya dal ayrışmışsa durur. `.env` ve veri dizini Git'e dahil değildir. Varsayılan veri dizini `./data`; `KITAPLIK_DATA_DIR` ayarladıysan sonraki güncellemelerde aynı ayarı koru. Kitaplar ve veritabanı konteyner dışında kaldığı için normal güncellemede ZIP aktarman gerekmez.

```bash
docker compose ps
docker compose logs --tail=100 kitaplik
```

Güncellemeyi tarayıcıda görmüyorsan önce açık kitaplık sekmelerini kapatıp aynı adresi yeniden aç. Eşitlenmemiş kayıtları korumak için tarayıcı verilerini silme.

## Yerel: sunucusuz kullanım

**Hazır ZIP:** [Releases](https://github.com/emresws/kitapligim/releases) sayfasında `Kitapligim-2.4.0-Yerel.zip` dosyasını indirip tamamen çıkar. Python 3 gerekir. Windows'ta `BASLAT.cmd`, Linux veya macOS'ta `python3 baslat.py` çalıştır.

**Kaynak koddan:** Node.js 24 ve Python 3 ile repo dizininde:

```bash
npm ci
npm run build:local
python3 baslat.py
```

Site `http://127.0.0.1:8765` adresinde açılır. Eski yerel verilerini görmek için aynı tarayıcı profili ve aynı adresi kullan; `localhost` tarayıcı için farklı bir adrestir. Docker da aynı portu kullanıyorsa yerel uygulamayı açmadan önce Docker servisini durdur. Bir cihazdan diğerine taşınmak gerekiyorsa uygulamanın ZIP dışa/içe aktarmasını kullan.

## Geliştirme

```bash
npm ci
npm test
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
python -m unittest discover -s tests -v
npm run build
npm run build:local
```

`web/` statik kaynakları, `src/` uygulama kodunu, `server.py` Docker API'sini içerir. Derlenmiş dosyalar ve kitaplık verileri repoya eklenmez. Projenin lisansı MIT; paketlenen okuyucu bileşenlerinin bildirimleri derleme çıktısındaki `OKUYUCU-LISANSLARI.txt` dosyasındadır.
