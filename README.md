# Legal AI Engine

An AI-powered legal research SaaS platform. Upload legal PDFs, ask questions in plain English, and get citation-backed answers using Llama 3 via Groq + a full RAG pipeline.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, TailwindCSS, shadcn/ui, Framer Motion |
| Backend | FastAPI (Python 3.11+) |
| Database | Supabase PostgreSQL |
| Vector DB | ChromaDB |
| AI Framework | LangChain |
| LLM | Groq API — Llama 3.3 70B |
| Auth | Supabase Auth |
| Embeddings | sentence-transformers (all-MiniLM-L6-v2) |
| PDF Processing | PyMuPDF (fitz) |

---

## Project Structure

```
legal-ai-engine/
├── backend/
│   ├── app/
│   │   ├── api/routes/        # upload.py, chat.py, search.py
│   │   ├── core/              # config.py, security.py
│   │   ├── db/                # supabase_client.py
│   │   ├── models/            # schemas.py
│   │   ├── services/          # pdf_processor, vector_store, rag_pipeline
│   │   └── main.py
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── app/
│   │   ├── (auth)/            # login, signup
│   │   ├── (dashboard)/       # dashboard, upload, chat, search
│   │   ├── layout.tsx
│   │   └── page.tsx           # landing page
│   ├── components/
│   │   ├── layout/            # Sidebar, Header
│   │   ├── chat/              # ChatInterface, MessageBubble, CitationCard
│   │   ├── upload/            # DropZone
│   │   └── search/            # SearchBar, SearchResults
│   ├── lib/                   # api.ts, supabase.ts, utils.ts
│   └── types/                 # index.ts
├── uploads/                   # Uploaded PDFs (gitignored)
├── chroma_db/                 # ChromaDB persistence (gitignored)
├── supabase_schema.sql        # Run this in Supabase SQL editor
└── README.md
```

---

## Prerequisites

- Python 3.11+
- Node.js 20+
- A [Supabase](https://supabase.com) project
- A [Groq](https://console.groq.com) API key

---

## Setup

### 1. Supabase

1. Create a new Supabase project at https://supabase.com
2. Go to **SQL Editor** and run the contents of `supabase_schema.sql`
3. In **Authentication → Settings**, enable email/password sign-in
4. Grab your project URL, anon key, and service role key from **Settings → API**

### 2. Backend

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env — fill in GROQ_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_JWT_SECRET

# Create log directory
mkdir logs

# Start the server
uvicorn app.main:app --reload --port 8000
```

The API will be available at http://localhost:8000
Interactive docs: http://localhost:8000/docs

### 3. Frontend

```bash
cd frontend

# Install dependencies
npm install

# Configure environment
cp .env.local.example .env.local
# Edit .env.local — fill in your Supabase URL and anon key

# Start development server
npm run dev
```

The frontend will be available at http://localhost:3000

---

## Environment Variables

### Backend (`backend/.env`)

| Variable | Description |
|---|---|
| `GROQ_API_KEY` | Your Groq API key |
| `GROQ_MODEL` | Groq model ID (default: `llama-3.3-70b-versatile`) |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase service role key (secret — backend only) |
| `SUPABASE_JWT_SECRET` | JWT secret from Supabase Auth settings |
| `SECRET_KEY` | App secret key (use a long random string) |
| `UPLOAD_DIR` | Directory for uploaded PDFs (default: `./uploads`) |
| `CHROMA_DB_PATH` | ChromaDB persistence path (default: `./chroma_db`) |
| `MAX_FILE_SIZE_MB` | Max PDF upload size in MB (default: `50`) |
| `EMBEDDING_MODEL` | Sentence-transformers model (default: `all-MiniLM-L6-v2`) |
| `CHUNK_SIZE` | Text chunk size in characters (default: `1000`) |
| `CHUNK_OVERLAP` | Chunk overlap in characters (default: `200`) |

### Frontend (`frontend/.env.local`)

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon/public key |
| `NEXT_PUBLIC_API_URL` | Backend URL (default: `http://localhost:8000`) |

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/documents/upload` | Upload a PDF |
| `GET` | `/api/v1/documents/` | List user's documents |
| `GET` | `/api/v1/documents/{id}` | Get a document |
| `DELETE` | `/api/v1/documents/{id}` | Delete a document |
| `POST` | `/api/v1/chat/` | Chat with documents (RAG) |
| `POST` | `/api/v1/chat/summarize` | Generate document summary |
| `POST` | `/api/v1/search/` | Semantic search |
| `GET` | `/health` | Health check |

---

## How It Works

```
User uploads PDF
       ↓
PyMuPDF extracts text per page
       ↓
Text is chunked with overlap (LangChain TextSplitter)
       ↓
Chunks embedded with sentence-transformers (all-MiniLM-L6-v2)
       ↓
Embeddings stored in ChromaDB (scoped by user_id)
       ↓
User asks a question
       ↓
Question embedded → top-K similar chunks retrieved
       ↓
Chunks + question sent to Groq Llama 3 with legal system prompt
       ↓
Citation-backed answer returned to user
```

---

## Production Deployment

### Backend (Railway / Render / EC2)

```bash
# Install production server
pip install gunicorn

# Run with gunicorn
gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker --bind 0.0.0.0:8000
```

Set `APP_ENV=production` to disable `/docs` and `/redoc`.

### Frontend (Vercel)

```bash
# Deploy to Vercel
npx vercel --prod
```

Set environment variables in the Vercel dashboard.

---

## Security Notes

- All API endpoints require Supabase JWT authentication
- Documents and vector embeddings are scoped by `user_id`
- Row-Level Security (RLS) is enabled on all Supabase tables
- The Supabase service key is backend-only and never exposed to the frontend
- File uploads are validated for type (PDF only) and size

---

## License

MIT
