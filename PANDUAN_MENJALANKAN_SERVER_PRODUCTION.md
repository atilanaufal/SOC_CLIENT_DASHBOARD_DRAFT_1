
### Langkah 4: Jalankan Aplikasi dengan PM2 Cluster Mode
File [`ecosystem.config.js`](file:///mnt/SStorage/Magang/Development/Website/dashboard-production-1/ecosystem.config.js) telah disiapkan di root proyek dengan default **2 worker instances** agar performa seimbang tanpa membebani CPU/RAM secara berlebihan:
```bash
# Jalankan PM2 (default 2 instances)
pm2 start ecosystem.config.js --env production

# ATAU atur jumlah instance tertentu (misal: 2 atau 4 instances)
PM2_INSTANCES=2 pm2 restart ecosystem.config.js --env production

# Cek status proses
pm2 status

# Cek log real-time
pm2 logs soc-client-dashboard
```

> **Tips Alokasi Core PM2:**
> Jangan menggunakan `instances: 'max'` pada mesin dengan core CPU yang banyak (seperti 12-16 core) jika resource RAM terbatas, karena PM2 akan membuat 1 worker per core CPU yang berpotensi menghabiskan RAM server saat start serentak. Gunakan 2–4 worker untuk beban produksi umum.
