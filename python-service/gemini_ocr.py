from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any

import google.generativeai as genai
from pdf2image import convert_from_bytes


@dataclass
class OCRResult:
    success: bool
    columns: list[str]
    rows: list[dict[str, Any]]
    confidence: float
    error: str | None = None


SYSTEM_PROMPT = """
You are a strict document table extraction engine for an inventory system.

Task:
1) Read the provided document image and extract only tabular inventory data.
2) Identify headers and rows accurately.
3) Normalize column names to snake_case.
4) Prefer these normalized keys when possible:
   product_code, name, description, weight, price, quantity
5) Remove currency symbols from numeric values.
6) Parse numbers as numbers, not strings.
7) Missing values must be null.
8) Do not hallucinate rows that are not present.
9) Output ONLY valid JSON (no markdown, no commentary) with this exact shape:
{
  "columns": ["name", "quantity", "price"],
  "rows": [
    {"name": "Widget A", "quantity": 10, "price": 199.0}
  ],
  "confidence": 0.0
}
Confidence must be a number from 0.0 to 1.0.
""".strip()


class GeminiOCRService:
    def __init__(self, api_key: str, model_name: str = "gemini-1.5-flash") -> None:
        if not api_key:
            raise ValueError("GEMINI_API_KEY is missing")
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel(model_name=model_name, system_instruction=SYSTEM_PROMPT)

    def parse_image(self, image_bytes: bytes, mime_type: str = "image/png") -> OCRResult:
        return self._extract_from_images([{"mime_type": mime_type, "data": image_bytes}])

    def parse_pdf(self, pdf_bytes: bytes) -> OCRResult:
        pages = convert_from_bytes(pdf_bytes, dpi=220, fmt="png")
        images: list[dict[str, Any]] = []
        for page in pages:
            # PIL raw bytes are not encoded image bytes, so save as PNG in-memory.
            from io import BytesIO

            buffer = BytesIO()
            page.save(buffer, format="PNG")
            images.append({"mime_type": "image/png", "data": buffer.getvalue()})
        return self._extract_from_images(images)

    def _extract_from_images(self, images: list[dict[str, Any]]) -> OCRResult:
        merged_rows: list[dict[str, Any]] = []
        merged_columns: list[str] = []
        confidences: list[float] = []
        try:
            for image in images:
                response = self.model.generate_content(
                    [
                        {"text": "Extract the table from this image exactly as JSON."},
                        image,
                    ]
                )
                payload = _safe_json_parse(response.text)
                columns = [str(c) for c in payload.get("columns", [])]
                rows = payload.get("rows", [])
                confidence = payload.get("confidence", 0.0)
                if not isinstance(rows, list):
                    rows = []
                normalized_rows = _normalize_and_clean_rows(rows)
                merged_rows.extend(normalized_rows)
                merged_columns.extend(columns)
                try:
                    confidences.append(float(confidence))
                except (TypeError, ValueError):
                    pass

            deduped_rows = _dedupe_rows(merged_rows)
            columns = _derive_columns(merged_columns, deduped_rows)
            confidence = round(sum(confidences) / len(confidences), 3) if confidences else 0.0
            return OCRResult(success=True, columns=columns, rows=deduped_rows, confidence=confidence)
        except Exception as exc:
            return OCRResult(success=False, columns=[], rows=[], confidence=0.0, error=str(exc))


def _safe_json_parse(raw: str | None) -> dict[str, Any]:
    text = (raw or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, flags=re.DOTALL)
        if not match:
            raise ValueError("Gemini returned non-JSON output")
        return json.loads(match.group(0))


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    cleaned = re.sub(r"[^\d.\-]", "", str(value))
    if cleaned == "":
        return None
    try:
        return float(cleaned)
    except ValueError:
        return None


def _to_int(value: Any) -> int | None:
    if value is None:
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    cleaned = re.sub(r"[^\d.\-]", "", str(value))
    if cleaned == "":
        return None
    try:
        return int(float(cleaned))
    except ValueError:
        return None


def _normalize_key(key: str) -> str:
    k = key.strip().lower().replace(" ", "_")
    aliases = {
        "product": "name",
        "product_name": "name",
        "item_name": "name",
        "item": "name",
        "qty": "quantity",
        "qnt": "quantity",
        "units": "quantity",
        "rate": "price",
        "amount": "price",
        "unit_price": "price",
        "sku": "product_code",
        "code": "product_code",
        "wt": "weight",
    }
    return aliases.get(k, k)


def _normalize_and_clean_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    cleaned: list[dict[str, Any]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        normalized: dict[str, Any] = {}
        for key, value in row.items():
            nk = _normalize_key(str(key))
            nv: Any = value.strip() if isinstance(value, str) else value
            if nk == "quantity":
                nv = _to_int(nv)
            elif nk in {"price", "weight"}:
                nv = _to_float(nv)
            normalized[nk] = nv
        if normalized:
            cleaned.append(normalized)
    return cleaned


def _dedupe_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    deduped: list[dict[str, Any]] = []
    for row in rows:
        key = json.dumps(row, sort_keys=True, default=str)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(row)
    return deduped


def _derive_columns(columns: list[str], rows: list[dict[str, Any]]) -> list[str]:
    merged: list[str] = [_normalize_key(c) for c in columns if c]
    if rows:
        for key in rows[0].keys():
            if key not in merged:
                merged.append(key)
    preferred = ["product_code", "name", "description", "weight", "price", "quantity"]
    ordered: list[str] = []
    for key in preferred:
        if key in merged:
            ordered.append(key)
    for key in merged:
        if key not in ordered:
            ordered.append(key)
    return ordered
