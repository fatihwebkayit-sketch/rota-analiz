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
- [ ] Aşama 2 — Grafikler, bölüm seçimi, GeoJSON/TCX/FIT, tırmanış tespiti
- [ ] Aşama 3 — Arşiv filtreleri, Araçlarım, yakıt, karşılaştırma, istatistik
- [ ] Aşama 4 — PDF/PNG/CSV/GPX çıktıları, gizlilik
- [ ] Aşama 5 — Animasyon ve MP4 video

Harita verileri: © OpenStreetMap katkıda bulunanlar, OpenFreeMap, Esri, OpenTopoMap, AWS Terrain Tiles.
