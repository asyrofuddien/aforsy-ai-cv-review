# Landly API

An AI-powered backend service for reviewing CV documents, with an optional comparison against a saved job description. Reviews run asynchronously using LLM technology and optional vector search.

## 🎯 Overview

This service provides automated evaluation of job candidates by:

- Accepting CV uploads (PDF, DOCX, TXT)
- General document-quality review when no job description is selected
- Optional comparison against a saved job description
- Providing detailed scoring and feedback
- Processing evaluations asynchronously for scalability

## 📋 Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [API Documentation](#api-documentation)
- [Testing](#testing)
- [Deployment](#deployment)
- [Design Decisions](#design-decisions)
- [Project Structure](#project-structure)

## ✨ Features

- **Multi-format Document Support**: PDF, DOCX, and TXT file parsing
- **AI-Powered Evaluation**: Uses Sumopod's OpenAI-compatible API
- **Vector Search (RAG)**: Context-aware evaluation using Pinecone vector database
- **Asynchronous Processing**: Non-blocking evaluation with job queue
- **Detailed Scoring**: 5-point scale across multiple parameters
- **Mock Mode**: Full functionality without API keys for testing
- **Error Resilience**: Retry mechanisms and graceful fallbacks
- **RESTful API**: Clean, documented endpoints

## 🏗 Architecture

```
┌─────────────┐     ┌─────────────┐       ┌─────────────┐
│   Client    │────▶│  REST API   │────▶ │   Queue     │
└─────────────┘     └─────────────┘       └─────────────┘
                           │                     │
                           ▼                     ▼
                    ┌─────────────┐        ┌─────────────┐
                    │   MongoDB   │        │   Worker    │
                    └─────────────┘        └─────────────┘
                                                 │
                             ┌───────────────────┼───────────────────┐
                             ▼                   ▼                   ▼
                      ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
                      │   Sumopod   │     │  Pinecone   │     │   Parser    │
                      └─────────────┘     └─────────────┘     └─────────────┘
```

### Key Components:

1. **API Layer**: Express.js handles HTTP requests
2. **Queue System**: BullMQ manages async job processing
3. **Storage**: MongoDB for documents and evaluations
4. **AI Services**: Sumopod for LLM, Pinecone for vector search
5. **Workers**: Background processors for evaluations

## 🛠 Tech Stack

- **Runtime**: Node.js 18+ with TypeScript
- **Framework**: Express.js
- **Database**: MongoDB (Atlas)
- **Queue**: BullMQ with Redis
- **LLM**: Sumopod OpenAI-compatible API (with mock fallback)
- **Vector DB**: Pinecone (with in-memory fallback)
- **File Parsing**: pdf-parse, mammoth
- **Deployment**: Docker, Railway-ready

## 📋 Prerequisites

- Node.js 18 or higher
- MongoDB (local or Atlas)
- Redis (local or cloud)
- Sumopod API key (optional - mock mode available)
- Pinecone API key (optional - in-memory mode available)

## 🚀 Installation

This backend is the API for the Next.js frontend in the sibling `cv-evaluation-frontend` directory.

1. **Install dependencies and configure local services**

```bash
npm ci
cp .env.example .env
```

2. **Start MongoDB and Redis**

```bash
docker compose up -d mongodb redis
```

3. **Start the backend**

```bash
npm run dev
```

The API listens at `http://localhost:3001`; health check: `http://localhost:3001/api/health`. MongoDB and Redis are required. Sumopod and Pinecone keys are optional for local development.

4. **Start the frontend** in `../cv-evaluation-frontend` with `NEXT_PUBLIC_API_URL=http://localhost:3001/api` (see its README). It listens at `http://localhost:3000`.

To run the full backend stack in Docker, use `docker compose up --build`.

## Project documentation

- [API reference](docs/API.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Scoring behavior](docs/SCORING.md)
- [Application logging](docs/operations/logging.md)

## ⚙️ Configuration

### Environment Variables

```env
# Server
PORT=3001
NODE_ENV=development

# Database
MONGODB_URI=mongo-db-url
REDIS_URL=redis://localhost:6379

# Sumopod (optional - uses mock mode if no key is provided)
SUMOPOD_API_KEY=your-sumopod-api-key
SUMOPOD_BASE_URL=https://ai.sumopod.com/v1
SUMOPOD_MODEL=glm-5.3-flash
LLM_TEMPERATURE=0.3

# Pinecone (optional - uses in-memory if not provided)
PINECONE_API_KEY=your-api-key
PINECONE_ENVIRONMENT=us-east-1-aws
PINECONE_INDEX_NAME=cv-evaluation

# File Upload
MAX_FILE_SIZE=10485760  # 10MB
ALLOWED_FILE_TYPES=application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain
```

## 📚 API Documentation

### Base URL

```
http://localhost:3001/api
```

### Endpoints

#### 1. Upload a CV

```http
POST /api/upload
Content-Type: multipart/form-data

Body:
- cv: file (required)

Response:
{
  "success": true,
  "message": "File uploaded successfully",
  "data": {
    "cvDocumentId": "507f1f77bcf86cd799439011"
  }
}
```

#### 2. Start CV Review

```http
POST /api/evaluate
Content-Type: application/json

Body:
{
  "cvDocumentId": "507f1f77bcf86cd799439011",
  "candidateName": "John Doe",
  "jobDescriptionId": "optional-job-id"
}

Response:
{
  "id": "507f1f77bcf86cd799439013",
  "status": "queued"
}
```

`candidateName` and `jobDescriptionId` are optional. Omitting `jobDescriptionId` reviews document quality without assuming a target role. Providing it enables job-specific review. Project reports are not part of this endpoint.

#### 3. Get Result

```http
GET /api/evaluate/{evaluationId}

Response (Completed):
{
  "id": "507f1f77bcf86cd799439013",
  "status": "completed",
  "result": {
    "mode": "general",
    "job_description": null,
    "cv_match_rate": 82,
    "cv_feedback": "Document quality feedback based on the CV content.",
    "missing_information": [],
    "overall_summary": "A neutral summary of CV document quality and improvements."
  }
}
```

### Additional Endpoints

- `GET /api/health` - Health check
- `GET /api/test` - API documentation
- `GET /api/test/stats` - System statistics

## 🧪 Testing

### Run Tests

```bash
# Install locked dependencies without downloading Chromium for fake-renderer tests
PUPPETEER_SKIP_DOWNLOAD=true PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true npm ci

npm run typecheck
npm run lint
npm test
npm run build

# API tests with provided script
./test-api.sh
```

Foundation checks run on Node.js 24, matching `.github/workflows/ci.yml`. `npm test` uses the Node test runner; `npm run test:watch` reruns it while editing. The suite uses synthetic persistence/queue/AI/PDF dependencies and an ephemeral loopback HTTP server for route guards. It does not connect to MongoDB/Redis or send real email/AI requests. `test-api.sh` is a separate live-service check and is not run by CI.

Lint reports existing unused-declaration warnings while feature modules migrate. TypeScript handles type-name/global resolution for TS files; lint remains active for other recommended checks. Two local regex exceptions preserve intentional ANSI stripping and legacy documentation-label handling. ESLint 8 is retained for compatibility with the current two-repo toolchain; a major upgrade is separate work.

The build disables incremental output so a tracked cache cannot skip emission on a fresh checkout. Production Chromium/DB/Redis and Docker Node 18 compatibility are separate runtime checks; passing the Node 24 foundation suite does not verify those services. Cross-repo planning is authored in workspace `docs/codex/`, with a versioned snapshot in the frontend repository via its `npm run docs:sync` command.

### Using Postman

1. Import `CV-Evaluation-API.postman_collection.json`
2. Import `CV-Evaluation-Env.postman_environment.json`
3. Run the collection or individual requests

### Manual Testing

```bash
# Upload files
curl -X POST http://localhost:3001/api/upload \
  -F "cv=@test-files/sample-cv.txt" \
  -F "project=@test-files/sample-project.txt"

# Start evaluation (use IDs from upload response)
curl -X POST http://localhost:3001/api/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "cvDocumentId": "your-cv-id",
    "projectDocumentId": "your-project-id",
    "candidateName": "Test User"
  }'

# Check result (use ID from evaluate response)
curl http://localhost:3001/api/result/your-evaluation-id
```

## 🚢 Deployment

### Railway Deployment

1. **Push to GitHub**

```bash
git add .
git commit -m "Initial commit"
git push origin main
```

2. **Deploy on Railway**

- Connect GitHub repository
- Add environment variables
- Deploy

## 🎯 Design Decisions

### 1. **Asynchronous Processing**

- **Why**: LLM calls can take 5-30 seconds
- **Solution**: BullMQ for job queuing
- **Benefit**: Non-blocking API, better scalability

### 2. **Vector Database (RAG)**

- **Why**: Context-aware evaluation improves accuracy
- **Solution**: Pinecone for production, in-memory for development
- **Benefit**: Relevant context retrieval for better scoring

### 3. **Multi-LLM Chain**

- **Why**: Complex evaluation needs multiple specialized prompts
- **Solution**: Separate chains for extraction, evaluation, and summary
- **Benefit**: More accurate and detailed results

### 4. **Mock Mode**

- **Why**: Allow development/testing without API keys
- **Solution**: Realistic mock responses when keys not provided
- **Benefit**: Lower barrier to entry, easier testing

### 5. **TypeScript**

- **Why**: Type safety for complex data structures
- **Solution**: Full TypeScript implementation
- **Benefit**: Fewer runtime errors, better IDE support

### 6. **Modular Architecture**

- **Why**: Maintainability and testability
- **Solution**: Clear separation of concerns (controllers, services, models)
- **Benefit**: Easy to extend and modify

## 📁 Project Structure

```
src/
├── config/          # Configuration files
├── controllers/     # Request handlers
├── middlewares/     # Express middlewares
├── models/         # MongoDB schemas
├── routes/         # API routes
├── services/       # Business logic
│   ├── evaluation/ # Evaluation pipeline
│   ├── llm/       # LLM integration
│   └── vectordb/  # Vector database
├── types/          # TypeScript types
├── utils/          # Utilities
├── workers/        # Background jobs
├── app.ts          # Express app
└── server.ts       # Entry point
```

## 🔧 Troubleshooting

### Common Issues

1. **MongoDB Connection Failed**

   - Check your connection string
   - Ensure IP is whitelisted in Atlas

2. **Redis Connection Failed**

   - Ensure Redis is running
   - Check REDIS_URL format

3. **File Upload Failed**

   - Check file size (max 10MB)
   - Ensure file type is supported


## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

# Local email and CV template setup

## AI CV Review (Phase 3)

The authenticated `/evaluate` workflow uploads a CV only (PDF, DOCX or TXT), then posts to `/api/evaluate` with `cvDocumentId` and optional `candidateName`. Supply either `jobDescriptionText` (up to 20,000 characters) or `jobDescriptionId`, or omit both for a general document review. Whitespace-only text selects general mode; invalid types, oversized text and conflicting sources return 400. Existing document ownership checks apply.

Results include `mode`, `criteria` (name, score from 0–5, CV evidence, suggested revision), `missing_information` and an equal-weight aggregate `cv_match_rate` from 0–100. In general mode this is a document quality estimate, not role fit. A job-specific result preserves the supplied job description in `job_description.text`. Review relies on extracted text and cannot verify visual layout. Incomplete AI criterion output fails the job instead of displaying a fabricated score. Project uploads are not part of this workflow; CV Matcher remains a separate job discovery feature.


Development email is captured by Mailpit. Run `docker compose up -d mailpit`; open the inbox at `http://localhost:8025`. The SMTP listener is available at `localhost:1025` for a backend running directly on the host. The Compose app is configured to use the `mailpit` service automatically. Keep `EMAIL_PROVIDER=smtp` locally.

For VPS email delivery, set `NODE_ENV=production`, `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, and `EMAIL_FROM` in the backend `.env` (for example, `Landly <accounts@aforsy.biz.id>`). Add and verify the sending domain in Resend first; use the exact SPF/DKIM DNS records Resend provides. Keep the API key out of Git. Local development continues to use Mailpit unless `EMAIL_PROVIDER` is explicitly changed.

Seed or refresh the ATS CV template used by the backend generator with `npm run seed:cv-template`. This safely upserts only the `new_template` record from `public/templates/template.html` and does not clear other database collections.

## 📞 Support

For issues and questions:

- Create an issue on GitHub
- Check existing issues for solutions
- Review API documentation at `/api/test`

---
