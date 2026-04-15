# Inventory Management System (IMS)

Production-oriented full-stack IMS with:

- React + TypeScript + Tailwind frontend
- Node.js + TypeScript + Express backend
- PostgreSQL database
- Python Gemini Vision OCR/PDF/Excel data ingestion service
- JWT shared-login authentication
- Real-time updates over Server-Sent Events (SSE)
- CSV/PDF history export

## Folder Structure

```text
.
├─ backend/               # REST APIs + inventory logic engine
├─ frontend/              # Enterprise dark UI dashboard
├─ python-service/        # OCR/PDF/Excel parsing + data cleaning
├─ database/schema.sql    # PostgreSQL schema
├─ requirements.txt       # Python dependencies
└─ docker-compose.yml     # Local PostgreSQL
```

## 1) Infrastructure Setup

### Start PostgreSQL

```bash
docker compose up -d
```

`schema.sql` is auto-applied from `docker-entrypoint-initdb.d`.

## 2) Python Service Setup (MANDATORY Virtual Environment)

1. Create virtual environment:

```bash
python -m venv venv
```

2. Activate:

- Windows:

```bash
venv\Scripts\activate
```

- Mac/Linux:

```bash
source venv/bin/activate
```

3. Install dependencies:

```bash
pip install -r requirements.txt
```

4. Configure Gemini API key:

```bash
set GEMINI_API_KEY=your_key_here
```

macOS/Linux:

```bash
export GEMINI_API_KEY=your_key_here
```

5. Run Python service:

```bash
cd python-service
uvicorn app:app --host 0.0.0.0 --port 8001 --reload
```

## 3) Backend Setup

```bash
cd backend
npm install
```

Create `.env` from `.env.example`:

```env
PORT=4000
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/ims
PYTHON_SERVICE_URL=http://localhost:8001
JWT_SECRET=replace_with_long_secret
SHARED_LOGIN_PASSWORD=ims123
```

Run backend:

```bash
npm run dev
```

## 4) Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`.

Login uses the shared password from `SHARED_LOGIN_PASSWORD`.

## 5) Smart Import Pipeline

Implemented flow:

1. Upload (Excel / PDF / Image)
2. Parse (Python service)
3. Preview (frontend modal)
4. Mapping override (editable grid)
5. Validation (backend schema checks)
6. Save (upsert + inventory transaction logs)

## 6) API Highlights

- `POST /api/auth/login`
- `GET /api/events` (SSE real-time updates)
- `GET /api/dashboard`
- `GET/POST /api/products`
- `GET/POST /api/orders`
- `GET/POST /api/manufacturing`
- `GET /api/history`
- `GET /api/history/export.csv`
- `GET /api/history/export.pdf`
- `POST /api/import/parse`
- `POST /api/import/validate`
- `POST /api/import/save`

## 7) Docker Deployment (all services)

Build and run all services together:

```bash
cp .env.example .env
docker compose up --build -d
```

Services:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000`
- Python service: `http://localhost:8001`
- PostgreSQL: `localhost:5432`

## 8) Security & Production Notes

- Use HTTPS via reverse proxy (Nginx/Cloudflare/ALB)
- Encrypt secrets at rest (KMS-managed AES-256 keys)
- Enable daily PostgreSQL backups (cron + object storage)
- For max 5 concurrent users, current pooled API architecture is sufficient
- Add rate limits and audit retention policy for production rollout
