from __future__ import annotations

import io
import os
import re
from typing import Any

import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from pydantic import BaseModel

from gemini_ocr import GeminiOCRService

app = FastAPI(title="IMS OCR and Parsing Service", version="1.0.0")
gemini_api_key = os.getenv("GEMINI_API_KEY", "")
gemini_model = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")


class CleanRequest(BaseModel):
    rows: list[dict[str, Any]]


def _normalize_columns(columns: list[str]) -> dict[str, str]:
    mapping = {}
    for column in columns:
        normalized = column.strip().lower()
        if normalized in {"product", "product name", "item", "item name", "name"}:
            mapping[column] = "name"
        elif normalized in {"qty", "quantity", "qnt", "units"}:
            mapping[column] = "quantity"
        elif normalized in {"price", "rate", "amount", "unit price"}:
            mapping[column] = "price"
        elif normalized in {"code", "sku", "product code"}:
            mapping[column] = "product_code"
        elif normalized in {"weight", "wt"}:
            mapping[column] = "weight"
        else:
            mapping[column] = normalized.replace(" ", "_")
    return mapping


def _clean_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    cleaned = []
    for row in rows:
        normalized = {}
        for key, value in row.items():
            v = value
            if isinstance(v, str):
                v = v.strip()
            if key == "quantity":
                try:
                    v = int(float(v))
                except (TypeError, ValueError):
                    v = 0
            if key in {"price", "weight"}:
                try:
                    v = float(re.sub(r"[^\d.\-]", "", str(v)))
                except (TypeError, ValueError):
                    v = 0.0
            normalized[key] = v
        cleaned.append(normalized)
    return cleaned


def _dedupe_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    output: list[dict[str, Any]] = []
    for row in rows:
        key = str(sorted(row.items()))
        if key in seen:
            continue
        seen.add(key)
        output.append(row)
    return output


def _gemini_service() -> GeminiOCRService:
    if not gemini_api_key:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY is missing")
    return GeminiOCRService(api_key=gemini_api_key, model_name=gemini_model)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/parse/excel")
async def parse_excel(file: UploadFile = File(...)) -> dict[str, Any]:
    try:
        content = await file.read()
        data = pd.read_excel(io.BytesIO(content))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Unable to parse Excel: {exc}") from exc

    original_columns = [str(c) for c in data.columns]
    mapped = _normalize_columns(original_columns)
    data = data.rename(columns=mapped)
    rows = _clean_rows(data.fillna("").to_dict(orient="records"))
    return {"columns": list(data.columns), "autoMapping": mapped, "rows": rows}


@app.post("/parse/pdf")
async def parse_pdf(file: UploadFile = File(...)) -> dict[str, Any]:
    try:
        content = await file.read()
        result = _gemini_service().parse_pdf(content)
        if not result.success:
            return {"success": False, "columns": [], "rows": [], "confidence": 0.0, "error": result.error}
        cleaned_rows = _dedupe_rows(_clean_rows(result.rows))
        return {"success": True, "columns": result.columns, "rows": cleaned_rows, "confidence": result.confidence}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Unable to parse PDF: {exc}") from exc


@app.post("/parse/image")
async def parse_image(file: UploadFile = File(...)) -> dict[str, Any]:
    try:
        content = await file.read()
        mime_type = file.content_type or "image/png"
        result = _gemini_service().parse_image(content, mime_type=mime_type)
        if not result.success:
            return {"success": False, "columns": [], "rows": [], "confidence": 0.0, "error": result.error}
        cleaned_rows = _dedupe_rows(_clean_rows(result.rows))
        return {"success": True, "columns": result.columns, "rows": cleaned_rows, "confidence": result.confidence}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Unable to parse image: {exc}") from exc


@app.post("/clean")
def clean_payload(payload: CleanRequest) -> dict[str, Any]:
    return {"rows": _clean_rows(payload.rows)}
