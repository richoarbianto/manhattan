# Manhattan

Real-time group chat dengan end-to-end encryption. Server tidak pernah menyentuh plaintext pesan, ia hanya meneruskan ciphertext dari satu client ke client lain.

## Preview

[![Room Entry](docs/screenshots/room-entry.png)](https://ricoo.dev)
[![Chat](docs/screenshots/chat.png)](https://ricoo.dev)

**Live → [ricoo.dev](https://ricoo.dev)**

## Cara kerjanya

Setiap browser menghasilkan sepasang kunci RSA-2048 dan satu kunci AES-256-GCM saat pertama kali dibuka. Kunci privat RSA dan kunci AES tidak pernah meninggalkan browser.

Saat dua orang berada di room yang sama, mereka bertukar kunci AES melalui enkripsi RSA: kunci AES milik A dienkripsi dengan public key RSA milik B, lalu dikirim ke server untuk diteruskan. Server menerima blob terenkripsi dan meneruskannya tanpa membukanya. B mendekripsi blob itu dengan private key RSA-nya sendiri, dan sekarang B punya kunci AES milik A untuk mendekripsi pesan-pesan A.

Pesan dienkripsi dengan AES-256-GCM sebelum dikirim. Server menerima ciphertext, meneruskannya ke semua anggota room, dan tidak tahu isinya.

Identitas pengguna ditentukan oleh IP address. Satu IP, satu sesi.

## Tech stack

| Layer | Teknologi |
|---|---|
| Server | Java 21, Spring Boot 3.4, WebSocket/STOMP, Gradle |
| Client | Vanilla JS, Tailwind CSS, Web Crypto API, argon2-browser (WASM) |
| Database | MongoDB Atlas |
| Deploy | Ubuntu 24.04, Nginx 1.31.1, systemd |

## Struktur project

```
manhattan/
├── server/                  Spring Boot backend
│   ├── src/main/java/com/manhattan/
│   │   ├── config/          WebSocket dan retry config
│   │   ├── controller/      STOMP message handlers
│   │   ├── service/         Logika bisnis
│   │   ├── repository/      MongoDB repositories
│   │   ├── entity/          MongoDB documents (Room, Session, dll)
│   │   ├── dto/             Data transfer objects
│   │   └── interceptor/     IP guard saat WebSocket handshake
│   └── src/test/            Unit + property-based tests (jqwik)
├── client/
│   ├── src/
│   │   ├── crypto.js        Web Crypto API wrapper
│   │   ├── keystore.js      In-memory AES key store
│   │   ├── argon2.js        Argon2id WASM wrapper
│   │   ├── websocket-client.js  STOMP client
│   │   ├── key-exchange.js  RSA key exchange logic
│   │   ├── chat-controller.js   Chat state management
│   │   ├── room-controller.js   Room join/create flow
│   │   └── ui/              Komponen UI (room entry, chat, status bar)
│   └── tests/e2e/           Playwright end-to-end tests
├── deploy/                  Nginx config dan systemd service template
├── deploy.sh                Script deploy untuk Ubuntu 24.04
└── .env.example             Template environment variables
```

## Prerequisites

- Java 21 (Eclipse Temurin direkomendasikan)
- Node.js 20 LTS
- MongoDB Atlas account (atau MongoDB lokal)
- Gradle 8+ (wrapper sudah ada di `server/`)

## Menjalankan secara lokal

### 1. Siapkan database

Buat cluster di [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) atau install MongoDB lokal.

Untuk MongoDB Atlas:
1. Buat cluster gratis (M0)
2. Whitelist IP address kamu di Network Access
3. Buat database user
4. Copy connection string

Untuk MongoDB lokal:
```bash
# Install MongoDB
brew install mongodb-community  # macOS
# atau
sudo apt install mongodb  # Ubuntu

# Jalankan MongoDB
mongod --dbpath /path/to/data
```

### 2. Konfigurasi environment

```bash
cp .env.example .env
```

Edit `.env`:
```bash
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/?appName=manhattan
# atau untuk lokal:
# MONGODB_URI=mongodb://localhost:27017/manhattan
```

### 3. Jalankan server

```bash
cd server
./gradlew bootRun
```

Server berjalan di `http://localhost:8080`.

### 4. Jalankan client

```bash
cd client
npm install
npm run dev
```

Buka `http://localhost:3000` di browser.

> Untuk development lokal, buka dua tab browser berbeda. `IpGuardInterceptor` menambahkan suffix unik ke `127.0.0.1` sehingga dua tab bisa berjalan sebagai dua "user" berbeda.

## Konfigurasi

Konfigurasi server ada di `server/src/main/resources/application.yml`. Untuk production, gunakan environment variables:

```bash
cp .env.example .env
# Edit .env dengan MongoDB connection string
```

| Variable | Default | Keterangan |
|---|---|---|
| `MONGODB_URI` | `mongodb://localhost:27017/manhattan` | MongoDB connection string |
| `SERVER_PORT` | `8080` | Port Spring Boot |

## Deploy ke production

Script `deploy.sh` menangani seluruh proses deploy ke Ubuntu 24.04 LTS:

```bash
chmod +x deploy.sh
./deploy.sh
```

Yang dilakukan script:
1. Install Java 21, Node.js 20, Nginx, Certbot
2. Build server JAR via Gradle
3. Build client (bundle JS + minify CSS)
4. Konfigurasi Nginx sebagai reverse proxy dengan SSL dari Let's Encrypt
5. Daftarkan dan jalankan systemd service
6. Setup auto-renewal SSL certificate

Sebelum deploy, pastikan:
- Domain sudah pointing ke server IP (A record)
- MongoDB Atlas IP whitelist sudah include server IP
- Edit `deploy.sh` untuk set domain dan MongoDB URI

Setelah deploy selesai:

```bash
# Lihat log
ssh -i ~/.ssh/id_ok ubuntu@SERVER_IP "sudo journalctl -u manhattan -f"

# Restart service
ssh -i ~/.ssh/id_ok ubuntu@SERVER_IP "sudo systemctl restart manhattan"

# Cek status
ssh -i ~/.ssh/id_ok ubuntu@SERVER_IP "sudo systemctl status manhattan"
```

## Menjalankan tests

**Server (JUnit 5 + jqwik property-based tests):**

```bash
cd server
./gradlew test
```

**Client (Jest + fast-check property-based tests):**

```bash
cd client
npm test
```

**End-to-end (Playwright):**

```bash
cd client
npm run test:e2e
```

## Alur enkripsi secara ringkas

```
Browser A                    Server                    Browser B
─────────────────────────────────────────────────────────────────
Generate RSA keypair
Generate AES key
                                                  Generate RSA keypair
                                                  Generate AES key

Connect + JOIN room ──────► Simpan session
                            Broadcast public key A ──► Terima public key A
                                                       Enkripsi AES_B dengan RSA_pub_A
                            ◄── Kirim encrypted AES_B
Dekripsi AES_B dengan RSA_priv_A
Simpan AES_B di Keystore

Enkripsi pesan dengan AES_A
Kirim ciphertext ────────► Teruskan ke semua ──────► Dekripsi dengan AES_A dari Keystore
```

## Batasan desain

- Satu IP address = satu sesi aktif. Dua tab dari IP yang sama akan ditolak di production.
- Maksimal 50 peserta per room.
- Password room di-hash dengan Argon2id (time cost 3, memory 64 MB, parallelism 4) di sisi client sebelum dikirim ke server.
- Setelah 5 kali salah password, IP dikunci selama 60 detik per room.
- Pesan untuk client yang sedang offline di-queue maksimal 500 pesan per client per room.
- Riwayat pesan tidak disimpan permanen. Saat client disconnect, pesan hilang dari sisi client.

## Lisensi

Private project.
