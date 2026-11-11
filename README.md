# Rota Analiz

GPS rotalarını (GPX, KML, KMZ) harita üzerinde analiz eden, arşivleyen ve raporlayan kişisel bir web uygulaması.
Chrome'da "Uygulamayı yükle" ile masaüstü programı gibi çalışır.

**Uygulama:** https://fatihwebkayit-sketch.github.io/rota-analiz/

## Veriler nerede?

Bu depoda yalnızca programın kodu bulunur. Rotalarınız **hiçbir sunucuya gönderilmez**; programda
seçtiğiniz klasörde (ör. `G:\Drive'ım\Rotalarım`) her rota ayrı bir klasör olarak saklanır:

```
Rotalarım/
  2026-11-11_Rota_1_a1b2c3/
    kaynak.gpx        orijinal dosya (değiştirilmez)
    kayit.json        ad, tür, notlar, yer adları, kırpma
    metrikler.json    hesaplanmış özet
```

## Geliştirme

```bash
npm install
npm run dev      # yerel geliştirme sunucusu
npm test         # hesaplama testleri
npm run build    # dist/ klasörüne derleme
```

`main` dalına her gönderimde GitHub Actions uygulamayı derleyip GitHub Pages'e yayınlar.

## Aşamalar

- [x] Aşama 1 — Uygulama iskeleti, harita ve katmanlar, GPX/KML/KMZ içe aktarma, veri klasörü, arşiv
- [x] Aşama 2 — Grafikler, bölüm seçimi (GeoJSON/TCX/FIT ve tırmanış tespiti sonraya)
- [x] Aşama 3 — Araçlarım, yakıt ve masraf, yer adları, etiketler, istatistik, karşılaştırma, yedekleme
- [x] Aşama 4 — PDF rapor, PNG paylaşım kartı, CSV/JSON/GPX/.rota, gizlilik seçenekleri
- [ ] Aşama 5 — Animasyon ve MP4 video

Harita verileri: © OpenStreetMap katkıda bulunanlar, OpenFreeMap, Esri, OpenTopoMap, AWS Terrain Tiles.
