# GrokFlow — Hướng dẫn cài đặt

## Yêu cầu hệ thống

- **Windows 10/11 64-bit** (hoặc macOS 12+, hoặc Linux có Docker)
- **RAM**: tối thiểu 4 GB (khuyến nghị 8 GB)
- **Ổ cứng**: trống ít nhất 5 GB
- **Docker Desktop**: phiên bản mới nhất
  - Windows/Mac: tải tại https://www.docker.com/products/docker-desktop
  - Linux: tham khảo https://docs.docker.com/engine/install/

## Cài đặt nhanh (Windows)

1. **Cài Docker Desktop** nếu chưa có. Mở Docker Desktop, đợi đến khi icon ở khay hệ thống chuyển màu xanh (Docker is running).
2. **Giải nén** file `grokflow-installer.zip` ra một thư mục, ví dụ `C:\GrokFlow`.
3. **Double-click** file `install.bat`.
4. Đợi 1–2 phút (lần đầu cần load image + chạy migration).
5. Cuối cùng installer in ra **email + password admin** — **copy ngay** vào nơi an toàn (Notepad, Notion, password manager).
6. Mở trình duyệt → http://localhost → đăng nhập.

## Cài đặt nhanh (Linux / macOS)

```bash
unzip grokflow-installer.zip
cd grokflow-installer
chmod +x *.sh
./install.sh
```

## Các lệnh thường dùng

| Lệnh | Tác dụng |
|---|---|
| `start.bat` / `./start.sh` | Khởi động lại sau khi tắt máy |
| `stop.bat` / `./stop.sh` | Tạm dừng GrokFlow (dữ liệu vẫn còn) |
| `uninstall.bat` / `./uninstall.sh` | Gỡ hoàn toàn (xóa tất cả dữ liệu) |

> 💡 GrokFlow **auto khởi động** mỗi khi Docker Desktop chạy (restart policy = `unless-stopped`). Bạn không cần chạy `start.bat` mỗi lần.

## Xử lý sự cố

### Port 80 bị chiếm bởi IIS / Skype / web server khác

Mở file `.env`, đổi:
```
HTTP_PORT=8080
```
Rồi chạy `stop.bat` → `start.bat`. Truy cập http://localhost:8080.

### "Docker is not running"

Mở Docker Desktop từ menu Start. Chờ icon chuyển xanh rồi chạy lại installer.

### Quên password admin

```bash
# Reset password (chạy trong thư mục cài đặt)
docker compose exec backend python -m app.scripts.create_admin \
    --email admin@local --password MatKhauMoi123 --role super_admin
```

### Xem log khi có lỗi

```
docker compose logs --tail=100
docker compose logs backend --tail=100
docker compose logs init     # log seed lần đầu
```

### Sao lưu dữ liệu

Toàn bộ dữ liệu nằm trong Docker volumes. Để backup:

```bash
docker run --rm -v grokflow_postgres_data:/data -v %CD%:/backup alpine \
  tar czf /backup/postgres-backup.tar.gz -C /data .

docker run --rm -v grokflow_storage_data:/data -v %CD%:/backup alpine \
  tar czf /backup/storage-backup.tar.gz -C /data .
```

### Khôi phục từ backup

```bash
docker compose down
docker run --rm -v grokflow_postgres_data:/data -v %CD%:/backup alpine \
  sh -c "cd /data && tar xzf /backup/postgres-backup.tar.gz"
docker compose up -d
```

## Cấu hình LLM provider (sau khi cài)

GrokFlow không kèm sẵn API key. Đăng nhập với admin, vào:

- **LLM Gateway → Pools** → Tạo pool mới (ví dụ: "Gemini Flash")
- **LLM Gateway → API Keys** → Thêm key Gemini / OpenAI / Claude của bạn vào pool
- Sau đó tính năng **AI Chat** + **Tạo hình ảnh** + **Tạo video** sẽ hoạt động.

## Bảo mật

- Web UI chỉ binding vào `127.0.0.1` — **không** truy cập được từ mạng LAN. Đây là chủ ý.
- Nếu muốn cho máy khác trong LAN truy cập, sửa `docker-compose.yml`: bỏ `127.0.0.1:` trong dòng `ports`. **Lưu ý**: lúc đó nên đổi password admin sang loại mạnh và bật firewall.
- Toàn bộ secrets (JWT, encryption key, postgres password) được random hóa lúc cài → mỗi máy có bộ secret riêng.

## Hỗ trợ

- Issue: [github.com/anthropics/grokflow/issues](https://github.com/)
- Email: support@grokflow.local

---

Phiên bản này là **single-machine self-host**. Nếu cần triển khai cho nhiều người dùng cùng một public domain (SaaS mode), liên hệ admin để được hướng dẫn dùng `docker-compose.prod.yml` thay thế.
