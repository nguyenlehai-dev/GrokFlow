# Setup môi trường dev

## Yêu cầu

- Docker Desktop (Windows/Mac) hoặc Docker + Compose v2 (Linux)
- Node.js 20+
- Python 3.11+
- Git

## 1. Clone & cấu hình env

```powershell
git clone <repo-url> GrokFlow
cd GrokFlow
copy .env.example .env
copy backend\.env.example backend\.env
copy frontend\.env.example frontend\.env
```

Sửa `backend/.env`:

- `DATABASE_URL` — Postgres connection string
- `REDIS_URL` — Redis connection
- `JWT_SECRET` — secret random 32+ ký tự
- `ENCRYPTION_KEY` — Fernet key, sinh bằng `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`
- `CHROME_BINARY_PATH` — đường dẫn Chrome trên máy host khi chạy worker outside Docker

## 2. Chạy bằng Docker Compose (khuyến nghị)

```powershell
docker compose up -d postgres redis
docker compose up backend worker frontend
```

Services:

| Service | URL | Note |
|---|---|---|
| frontend | http://localhost:5173 | Vite dev server |
| backend | http://localhost:8000 | FastAPI |
| backend docs | http://localhost:8000/docs | OpenAPI Swagger UI |
| postgres | localhost:5432 | user `grokflow` / db `grokflow` |
| redis | localhost:6379 | |

## 3. Chạy không Docker (chỉ backend)

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload
```

Worker chạy riêng terminal:

```powershell
cd backend
.venv\Scripts\activate
python -m app.workers.run image
```

Frontend:

```powershell
cd frontend
npm install
npm run dev
```

## 4. Migration

```powershell
cd backend
alembic revision --autogenerate -m "add_X_table"
alembic upgrade head
```

## 5. Seed admin user

```powershell
cd backend
python -m app.scripts.create_admin --email admin@local --password ChangeMe123!
```

## 6. Tài khoản test mặc định

Sau khi seed:

- Email: `admin@local`
- Password: `ChangeMe123!`
- Role: `admin`

Đổi ngay sau lần login đầu trên môi trường shared.

## 7. Lệnh hữu ích

| Lệnh | Mục đích |
|---|---|
| `docker compose logs -f backend` | Stream log backend |
| `docker compose exec backend pytest` | Chạy test |
| `docker compose exec postgres psql -U grokflow` | Mở psql |
| `docker compose down -v` | Reset cả data |
