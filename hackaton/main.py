import os
import json
import uuid
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from google.cloud import firestore, storage
from google import genai
from google.genai import types

# --- КОНФИГУРАЦИЯ ПРОЕКТА ---
PROJECT_ID = "project-4cdccfc2-e562-45cb-838"
BUCKET_NAME = "nasa-medical-scans-4cdccfc2"
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash-lite")
GEMINI_LOCATION = os.environ.get("GEMINI_LOCATION", "global")

app = FastAPI(title="NASA Deep Space Health API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Инициализация клиентов GCP
db = firestore.Client(project=PROJECT_ID)
storage_client = storage.Client(project=PROJECT_ID)

ai_client = genai.Client(
    vertexai=True,
    project=PROJECT_ID,
    location=GEMINI_LOCATION,
)


# --- МОДЕЛИ ДАННЫХ ---
class VitalsInput(BaseModel):
    astronaut_id: str = "crew_1"
    mission_day: int = 140
    environment: str = "deep_space"  # leo, moon, mars, deep_space
    heart_rate: int
    blood_pressure: str
    sleep_hours: float
    exercise_min: Optional[int] = 0
    symptoms: Optional[str] = ""


class SyncBatch(BaseModel):
    records: List[VitalsInput]


# --- ВСПОМОГАТЕЛЬНАЯ ЛОГИКА (NASA HRP + GEMINI) ---
def analyze_vitals_logic(data: VitalsInput):
    doc = db.collection("AstronautProfiles").document(data.astronaut_id).get()
    profile = doc.to_dict() if doc.exists else {}
    baseline = profile.get("medical_baseline", {})
    conditions = profile.get("medical_conditions", [])

    base_hr = baseline.get("base_heart_rating_bpm", 70)
    local_flag = "GREEN"
    if data.heart_rate > base_hr * 1.6 or data.sleep_hours < 4.0:
        local_flag = "RED"
    elif data.heart_rate > base_hr * 1.3 or data.sleep_hours < 6.0 or data.symptoms:
        local_flag = "YELLOW"

    prompt = f"""
    You are an autonomous NASA Deep Space Flight Surgeon AI. Communication latency with Earth is 24 minutes.
    Astronaut Profile: {profile.get('first_name', 'Crew')} {profile.get('last_name', '')}, Role: {profile.get('crew_role', 'Astronaut')}.
    Personal Baseline: Resting HR {base_hr} bpm, Baseline BP {baseline.get('base_blood_pressure', '120/80')}.
    CRITICAL CONTRAINDICATIONS / ALLERGIES: {json.dumps(conditions)}.
    
    Current Telemetry (Mission Day {data.mission_day}, Environment: {data.environment}):
    - Heart Rate: {data.heart_rate} bpm
    - Blood Pressure: {data.blood_pressure}
    - Sleep: {data.sleep_hours} hours
    - Symptoms: "{data.symptoms}"
    - Initial Rule Engine Flag: {local_flag}

    Respond ONLY with a valid JSON object matching this exact structure (no markdown):
    {{
        "risk_level": "GREEN" | "YELLOW" | "RED",
        "nasa_hazard": "Primary NASA HRP hazard involved (e.g., Space Radiation, Microgravity Fluid Shift, Isolation)",
        "clinical_reasoning": "Brief 1-2 sentence explanation comparing current vitals to personal baseline",
        "action_plan": ["Step 1...", "Step 2...", "Step 3..."]
    }}
    Strictly avoid recommending any medication listed in CRITICAL CONTRAINDICATIONS.
    """

    try:
        response = ai_client.models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )
        ai_result = json.loads(response.text)
    except Exception as e:
        ai_result = {
            "risk_level": local_flag,
            "nasa_hazard": "Autonomous Edge Fallback (Offline Protocol)",
            "clinical_reasoning": f"HR {data.heart_rate} bpm vs baseline {base_hr} bpm. AI offline: {str(e)[:80]}",
            "action_plan": [
                "Hydrate with 500ml electrolytes",
                "Rest in shielded crew quarters",
                "Repeat measurement in 30 mins",
            ],
        }

    log_entry = {
        "astronaut_id": data.astronaut_id,
        "mission_day": data.mission_day,
        "environment": data.environment,
        "vitals": data.model_dump(),
        "ai_assessment": ai_result,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    db.collection("VitalsLogs").add(log_entry)

    return ai_result


# --- ЭНДПОИНТЫ API ---
@app.get("/")
def health_check():
    return {"status": "online", "service": "NASA Deep Space Health Backend"}


@app.get("/api/profile/{astronaut_id}")
def get_profile(astronaut_id: str):
    doc = db.collection("AstronautProfiles").document(astronaut_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Astronaut not found")
    return doc.to_dict()


@app.get("/api/history/{astronaut_id}")
def get_history(
    astronaut_id: str,
    limit: int = Query(default=100, ge=1, le=500),
):
    logs = (
        db.collection("VitalsLogs")
        .where("astronaut_id", "==", astronaut_id)
        .order_by("timestamp", direction=firestore.Query.DESCENDING)
        .limit(limit)
        .stream()
    )
    records = []
    for log in logs:
        record = log.to_dict() or {}
        record["id"] = log.id
        records.append(record)
    return {"astronaut_id": astronaut_id, "records": records}


@app.post("/api/vitals")
def submit_vitals(data: VitalsInput):
    assessment = analyze_vitals_logic(data)
    return {**assessment, "sync_status": "saved_to_firestore"}


@app.post("/api/analyze-scan")
async def analyze_scan(
    file: UploadFile = File(...),
    astronaut_id: str = Form("crew_1"),
    notes: str = Form("Visual / Ultrasound check"),
):
    file_bytes = await file.read()
    mime_type = file.content_type or "image/jpeg"
    gcs_uri = "local_edge_buffer"

    # 1. Сохраняем снимок в Cloud Storage
    try:
        blob_name = f"{astronaut_id}/{uuid.uuid4()}_{file.filename}"
        bucket = storage_client.bucket(BUCKET_NAME)
        blob = bucket.blob(blob_name)
        blob.upload_from_string(file_bytes, content_type=mime_type)
        gcs_uri = f"gs://{BUCKET_NAME}/{blob_name}"
    except Exception as storage_err:
        gcs_uri = f"storage_skipped: {str(storage_err)}"

    # 2. Читаем профиль и аллергии из Firestore
    doc = db.collection("AstronautProfiles").document(astronaut_id).get()
    profile = doc.to_dict() if doc.exists else {}
    conditions = json.dumps(profile.get("medical_conditions", []))

    # 3. Анализируем фото через настроенную модель Gemini
    try:
        prompt = f"""
        You are an autonomous NASA flight surgeon AI analyzing a medical image/scan from an astronaut in deep space.
        Astronaut: {profile.get('first_name', 'Crew')} {profile.get('last_name', '')}.
        Known allergies/contraindications: {conditions}.
        Astronaut notes: {notes}.

        Inspect the image for visible anomalies (skin rash, inflammation, eye redness/SANS signs, swelling, injury, or ultrasound anomaly).
        Note: Provide clinical triage decision support, not a definitive diagnosis.
        Return ONLY valid JSON with keys:
        "risk_level" ("GREEN", "YELLOW", or "RED"),
        "ai_findings" (2 concise sentences describing what is visible on the image),
        "recommended_action" (concrete step-by-step onboard first aid respecting their allergies).
        """
        response = ai_client.models.generate_content(
            model=GEMINI_MODEL,
            contents=[
                types.Part.from_bytes(data=file_bytes, mime_type=mime_type),
                prompt,
            ],
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )
        ai_result = json.loads(response.text)
    except Exception as ai_err:
        ai_result = {
            "risk_level": "YELLOW",
            "ai_findings": f"Edge fallback visual check completed (AI detail: {str(ai_err)[:80]})",
            "recommended_action": "Clean area with sterile saline, document progression in 6 hours, avoid contraindicated meds.",
        }

    # 4. Логируем скан в Firestore ДО return
    db.collection("VitalsLogs").add({
        "astronaut_id": astronaut_id,
        "type": "medical_scan",
        "gcs_uri": gcs_uri,
        "notes": notes,
        "ai_assessment": ai_result,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    return {
        "gcs_uri": gcs_uri,
        "risk_level": ai_result.get("risk_level", "YELLOW"),
        "ai_findings": ai_result.get("ai_findings", ""),
        "recommended_action": ai_result.get("recommended_action", ""),
    }


@app.post("/api/sync")
def sync_offline_queue(batch: SyncBatch):
    results = []
    for record in batch.records:
        res = analyze_vitals_logic(record)
        results.append(res)
    return {"synced_count": len(results), "status": "ok", "results": results}