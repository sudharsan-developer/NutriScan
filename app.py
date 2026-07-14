import json
import os
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image
import google.generativeai as genai

app = FastAPI(title="NutriScan AI Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_KEY = os.getenv("GEMINI_API_KEY", "AQ.Ab8RN6LJwHEQ-MUkKWxYouZuc7YYIIA6VpuGv7sEM-Ii8LIk-g")

if not API_KEY:
    raise RuntimeError("Set GEMINI_API_KEY before starting the server")

genai.configure(api_key=API_KEY)
model = genai.GenerativeModel("gemini-2.5-flash")

SYSTEM_PROMPT = (
    "You are a helpful nutrition assistant. Analyze the food image and answer the user's question "
    "strictly based on the visible food and nutrition context. If the image does not clearly contain "
    "food or the answer cannot be determined from the image, respond with: "
    "I am sorry, I cannot answer this question based on the image provided."
    "Return your answer as compact JSON with keys: foodName, calories, protein, carbs, fat, fiber, "
    "summary, suggestions, alternatives."
)


def parse_number_value(value: Any) -> int:
    if value is None:
        return 0

    if isinstance(value, (int, float)):
        return int(value)

    if isinstance(value, str):
        text = value.strip()
        if not text:
            return 0

        digits = []
        for char in text:
            if char.isdigit():
                digits.append(char)
        if digits:
            return int("".join(digits))

    return 0


def extract_json_payload(text: str) -> dict[str, Any]:
    if not text:
        return {}

    candidate = text.strip()

    try:
        start = candidate.index("```json") + len("```json")
        end = candidate.index("```", start)
        candidate = candidate[start:end].strip()
    except ValueError:
        pass

    if candidate.startswith("```"):
        candidate = candidate[3:].strip()
    if candidate.endswith("```"):
        candidate = candidate[:-3].strip()

    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        pass

    start = candidate.find("{")
    end = candidate.rfind("}")
    if start != -1 and end != -1 and end > start:
        try:
            return json.loads(candidate[start : end + 1])
        except json.JSONDecodeError:
            pass

    return {
        "foodName": "Unknown",
        "calories": 0,
        "protein": 0,
        "carbs": 0,
        "fat": 0,
        "fiber": 0,
        "summary": text,
        "suggestions": ["Add a side salad for balance."],
        "alternatives": ["Choose a lighter option"],
    }


@app.post("/analyze")
async def analyze_food(image: UploadFile = File(...), question: str = Form(...)):
    if not image.filename:
        raise HTTPException(status_code=400, detail="Image is required")

    try:
        contents = await image.read()
        img = Image.open(__import__("io").BytesIO(contents)).convert("RGB")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid image upload: {exc}") from exc

    prompt = f"User question: {question}\n\n{SYSTEM_PROMPT}"

    try:
        response = model.generate_content([prompt, img])
        text = getattr(response, "text", "") or ""
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Gemini request failed: {exc}") from exc

    try:
        payload = extract_json_payload(text)
    except Exception:
        payload = {
            "foodName": "Unknown",
            "calories": 0,
            "protein": 0,
            "carbs": 0,
            "fat": 0,
            "fiber": 0,
            "summary": "Unable to parse response.",
            "suggestions": ["Add a side salad for balance."],
            "alternatives": ["Choose a lighter option"],
        }

    return JSONResponse(content={
        "foodName": payload.get("foodName", "Unknown"),
        "calories": parse_number_value(payload.get("calories", 0)),
        "protein": parse_number_value(payload.get("protein", 0)),
        "carbs": parse_number_value(payload.get("carbs", 0)),
        "fat": parse_number_value(payload.get("fat", 0)),
        "fiber": parse_number_value(payload.get("fiber", 0)),
        "summary": payload.get("summary", "No summary available."),
        "suggestions": payload.get("suggestions", ["Add a side salad for balance."]),
        "alternatives": payload.get("alternatives", ["Choose a lighter option"]),
    })


@app.get("/health")
async def health():
    return {"status": "ok"}

app.mount("/", StaticFiles(directory=".", html=True), name="static")
