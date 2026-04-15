# Python Ingestion Service

This service provides Gemini Vision OCR and document parsing APIs for the Inventory Management System.

## Environment

Set:

```bash
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-1.5-flash
```

`pdf2image` requires Poppler:

- Windows: install Poppler and add `bin` to PATH
- Linux: `sudo apt-get install poppler-utils`
- macOS: `brew install poppler`

## Run

```bash
uvicorn app:app --host 0.0.0.0 --port 8001 --reload
```

## Endpoints

- `GET /health`
- `POST /parse/excel`
- `POST /parse/pdf` (Gemini Vision via PDF->image pipeline)
- `POST /parse/image` (Gemini Vision multimodal OCR)
- `POST /clean`
