# CV Evaluation API

An AI-powered backend service that evaluates candidate CVs and project reports against job descriptions using LLM technology, vector embeddings, and asynchronous processing.

## 🎯 Overview

This service provides automated evaluation of job candidates by:

- Accepting CV and project report uploads (PDF, DOCX, TXT)
- Comparing them against job descriptions using AI
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
- **AI-Powered Evaluation**: Uses OpenAI GPT-4 for intelligent analysis
- **Vector Search (RAG)**: Context-aware evaluation using Pinecone vector database
- **Asynchronous Processing**: Non-blocking evaluation with job queue
- **Detailed Scoring**: 5-point scale across multiple parameters
- **Mock Mode**: Full functionality without API keys for testing
- **Error Resilience**: Retry mechanisms and graceful fallbacks
- **RESTful API**: Clean, documented endpoints

## 🏗 Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Client    │────▶│  REST API   │────▶│   Queue     │
└─────────────┘     └─────────────┘     └─────────────┘
                           │                   │
                           ▼                   ▼
                    ┌─────────────┐     ┌─────────────┐
                    │   MongoDB   │     │   Worker    │
                    └─────────────┘     └─────────────┘
                                               │
                           ┌───────────────────┼───────────────────┐
                           ▼                   ▼                   ▼
                    ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
                    │   OpenAI    │     │  Pinecone   │     │   Parser    │
                    └─────────────┘     └─────────────┘     └─────────────┘
```

### Key Components:

1. **API Layer**: Express.js handles HTTP requests
2. **Queue System**: BullMQ manages async job processing
3. **Storage**: MongoDB for documents and evaluations
4. **AI Services**: OpenAI for LLM, Pinecone for vector search
5. **Workers**: Background processors for evaluations

## 🛠 Tech Stack

- **Runtime**: Node.js 18+ with TypeScript
- **Framework**: Express.js
- **Database**: MongoDB (Atlas)
- **Queue**: BullMQ with Redis
- **LLM**: OpenAI GPT-4 (with mock fallback)
- **Vector DB**: Pinecone (with in-memory fallback)
- **File Parsing**: pdf-parse, mammoth
- **Deployment**: Docker, Railway-ready

## 📋 Prerequisites

- Node.js 18 or higher
- MongoDB (local or Atlas)
- Redis (local or cloud)
- OpenAI API key (optional - mock mode available)
- Pinecone API key (optional - in-memory mode available)

## 🚀 Installation

1. **Clone the repository**

```bash
git clone https://github.com/asyrofuddien/cv-evaluation-api.git
cd cv-evaluation-api
```

2. **Install dependencies**

```bash
npm install
```

3. **Set up environment variables**

```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Start MongoDB and Redis (if local)**

```bash
docker-compose up -d
```

5. **Seed the database**

```bash
npm run seed:all
```

6. **Create Temp Folder**

```bash
mkdir uploads/temp
```
7. **Start the development server**

```bash
npm run dev
```

## ⚙️ Configuration

### Environment Variables

```env
# Server
PORT=3000
NODE_ENV=development

# Database
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/cv-evaluation
REDIS_URL=redis://localhost:6379

# OpenAI (optional - will use mock if not provided)
OPENAI_API_KEY=sk-your-api-key
OPENAI_MODEL=gpt-4-turbo-preview
LLM_TEMPERATURE=0.3

# Pinecone (optional - will use in-memory if not provided)
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
http://localhost:3000/api
```

### Endpoints

#### 1. Upload Documents

```http
POST /api/upload
Content-Type: multipart/form-data

Body:
- cv: file (required)
- project: file (required)

Response:
{
  "success": true,
  "message": "File uploaded successfully",
  "data": {
    "cvDocumentId": "507f1f77bcf86cd799439011",
    "projectDocumentId": "507f1f77bcf86cd799439012"
  }
}
```

#### 2. Start Evaluation

```http
POST /api/evaluate
Content-Type: application/json

Body:
{
  "cvDocumentId": "507f1f77bcf86cd799439011",
  "projectDocumentId": "507f1f77bcf86cd799439012",
  "candidateName": "John Doe",
  "jobDescriptionId": "optional-job-id"
}

Response:
{
  "id": "507f1f77bcf86cd799439013",
  "status": "queued"
}
```

#### 3. Get Result

```http
GET /api/result/{evaluationId}

Response (Completed):
{
  "id": "507f1f77bcf86cd799439013",
  "status": "completed",
  "result": {
    "cv_match_rate": 0.82,
    "cv_feedback": "Strong in backend and cloud, limited AI integration experience.",
    "project_score": 7.5,
    "project_feedback": "Meets prompt chaining requirements, lacks error handling robustness.",
    "overall_summary": "Good candidate fit, would benefit from deeper RAG knowledge."
  }
}
```

### Additional Endpoints

- `GET /health` - Health check
- `GET /api/test` - API documentation
- `GET /api/test/stats` - System statistics

## 🧪 Testing

### Run Tests

```bash
# Unit tests
npm test

# Integration tests
npm run test:integration

# API tests with provided script
./test-api.sh
```

### Using Postman

1. Import `CV-Evaluation-API.postman_collection.json`
2. Import `CV-Evaluation-Env.postman_environment.json`
3. Run the collection or individual requests

### Manual Testing

```bash
# Upload files
curl -X POST http://localhost:3000/api/upload \
  -F "cv=@test-files/sample-cv.txt" \
  -F "project=@test-files/sample-project.txt"

# Start evaluation (use IDs from upload response)
curl -X POST http://localhost:3000/api/evaluate \
  -H "Content-Type: application/json" \
  -d '{
    "cvDocumentId": "your-cv-id",
    "projectDocumentId": "your-project-id",
    "candidateName": "Test User"
  }'

# Check result (use ID from evaluate response)
curl http://localhost:3000/api/result/your-evaluation-id
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

## 📄 License

MIT License - see LICENSE file for details

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📞 Support

For issues and questions:

- Create an issue on GitHub
- Check existing issues for solutions
- Review API documentation at `/api/test`

---
