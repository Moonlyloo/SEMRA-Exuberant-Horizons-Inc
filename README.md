# NASA Deep Space Health System

A hackathon prototype for astronaut health monitoring and onboard triage when
Earth is too far away for real-time support.

> **Demo notice:** This is a decision-support prototype, not a medical device or
> a substitute for clinical judgment. Use synthetic data for demos; do not send
> real patient data to the public demo service.

## The problem

During an Earth-to-Mars mission, one-way communications can take about 24
minutes. A crew cannot wait for Earth to review every change in vital signs.
The system records telemetry, produces a rapid local-rule fallback if Gemini
is unavailable, and uses Gemini to provide structured triage assistance when
the cloud service is reachable.

## Architecture

- **API:** FastAPI in `hackaton/main.py`, deployed to Google Cloud Run.
- **Persistence:** Cloud Firestore collections `AstronautProfiles` and
  `VitalsLogs`.
- **Images:** Cloud Storage bucket `nasa-medical-scans-4cdccfc2`.
- **AI:** Vertex AI through the Google Gen AI SDK, using
  `gemini-3.5-flash-lite` at the `global` endpoint by default.
- **Authentication:** Cloud Run uses its runtime service account and native
  Google Cloud IAM/ADC. No API key is needed in the application or browser.
- **Frontend:** `astronaut-health-system/` is a static UI prototype. It is not
  yet wired to these FastAPI endpoints; use the live API base URL below when
  integrating it.

The model and location can be overridden with `GEMINI_MODEL` and
`GEMINI_LOCATION`. The API has a local threshold-based fallback for vitals and
a separate fallback response for scan analysis. A successful HTTP response
alone does not prove Gemini ran; see the fallback markers below.

## Live API

**Base URL:** <https://space-health-api-1007338674559.us-central1.run.app>

Interactive API documentation: <https://space-health-api-1007338674559.us-central1.run.app/docs>

### `GET /` — health check

```http
GET /
```

Example response:

```json
{
  "status": "online",
  "service": "NASA Deep Space Health Backend"
}
```

### `GET /api/profile/{astronaut_id}` — get an astronaut profile

```http
GET /api/profile/crew_1
```

Example response (fields depend on the stored profile):

```json
{
  "astronaut_id": "crew_1",
  "first_name": "Demo",
  "last_name": "Crewmember",
  "crew_role": "Flight Engineer",
  "medical_baseline": {
    "base_heart_rating_bpm": 62,
    "base_blood_pressure": "115/75"
  },
  "medical_conditions": []
}
```

Returns `404` if the profile does not exist.

### `GET /api/history/{astronaut_id}` — get recent health logs

`limit` is optional (default `100`, range `1`–`500`).

```http
GET /api/history/crew_1?limit=2
```

Example response:

```json
{
  "astronaut_id": "crew_1",
  "records": [
    {
      "id": "firestore-document-id",
      "mission_day": 140,
      "timestamp": "2026-11-14T12:00:00+00:00",
      "vitals": {
        "heart_rate": 78,
        "blood_pressure": "104/68",
        "sleep_hours": 5.8
      },
      "ai_assessment": {
        "risk_level": "YELLOW",
        "nasa_hazard": "Microgravity Fluid Shift",
        "clinical_reasoning": "Example triage summary.",
        "action_plan": ["Example action."]
      }
    }
  ]
}
```

### `POST /api/vitals` — submit vitals and request triage

```http
POST /api/vitals
Content-Type: application/json
```

Example request:

```json
{
  "astronaut_id": "crew_1",
  "mission_day": 140,
  "environment": "deep_space",
  "heart_rate": 78,
  "blood_pressure": "104/68",
  "sleep_hours": 5.8,
  "exercise_min": 25,
  "symptoms": "Lightheadedness when standing and increased thirst"
}
```

Example response:

```json
{
  "risk_level": "YELLOW",
  "nasa_hazard": "Microgravity Fluid Shift",
  "clinical_reasoning": "Example triage summary comparing the telemetry with baseline.",
  "action_plan": ["Example action.", "Example follow-up.", "Example monitoring step."],
  "sync_status": "saved_to_firestore"
}
```

Each request is saved in `VitalsLogs`. When Gemini is unavailable, the response
can still be HTTP `200` but use
`"nasa_hazard": "Autonomous Edge Fallback (Offline Protocol)"` and include
`"AI offline"` in `clinical_reasoning`.

### `POST /api/analyze-scan` — analyze an uploaded image

Send `multipart/form-data` with:

- `file` — required image file
- `astronaut_id` — optional, defaults to `crew_1`
- `notes` — optional context

Example with curl:

```sh
curl -X POST "https://space-health-api-1007338674559.us-central1.run.app/api/analyze-scan" \
  -F "file=@sample-image.jpg;type=image/jpeg" \
  -F "astronaut_id=crew_1" \
  -F "notes=Synthetic demo image"
```

Example response:

```json
{
  "gcs_uri": "gs://nasa-medical-scans-4cdccfc2/crew_1/example-image.jpg",
  "risk_level": "GREEN",
  "ai_findings": "Example visual findings.",
  "recommended_action": "Example next step."
}
```

If image storage fails, `gcs_uri` can begin with `storage_skipped:` while AI
analysis may still succeed. The scan fallback is indicated by
`ai_findings` beginning with `Edge fallback visual check completed`.

### `POST /api/sync` — submit an offline batch

```http
POST /api/sync
Content-Type: application/json
```

Example request:

```json
{
  "records": [
    {
      "astronaut_id": "crew_1",
      "mission_day": 139,
      "environment": "deep_space",
      "heart_rate": 73,
      "blood_pressure": "110/72",
      "sleep_hours": 6.4,
      "exercise_min": 20,
      "symptoms": "Mild lightheadedness when standing"
    }
  ]
}
```

Example response:

```json
{
  "synced_count": 1,
  "status": "ok",
  "results": [
    {
      "risk_level": "YELLOW",
      "nasa_hazard": "Microgravity Fluid Shift",
      "clinical_reasoning": "Example triage summary.",
      "action_plan": ["Example action."]
    }
  ]
}
```

## Frontend integration

Use the live base URL for browser requests. For JSON endpoints, send
`Content-Type: application/json`; for image upload, send `FormData` and let the
browser set the multipart boundary.

```js
const API_BASE_URL = "https://space-health-api-1007338674559.us-central1.run.app";

const response = await fetch(`${API_BASE_URL}/api/vitals`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    astronaut_id: "crew_1",
    mission_day: 140,
    environment: "deep_space",
    heart_rate: 72,
    blood_pressure: "120/80",
    sleep_hours: 8,
    exercise_min: 30,
    symptoms: ""
  })
});

if (!response.ok) {
  throw new Error(`Vitals request failed: ${response.status}`);
}

const assessment = await response.json();
```

Do not put service-account keys or other Google Cloud credentials in frontend
code. The current backend CORS policy is permissive for the prototype and
should be restricted to the deployed frontend origin before production use.

## Local development

The backend uses Application Default Credentials. For local development,
install the backend requirements and authenticate with an account that has
access to the configured project:

```sh
python -m pip install -r hackaton/requirements.txt
gcloud auth application-default login
cd hackaton
uvicorn main:app --reload
```

Then open <http://127.0.0.1:8000/docs>. The configured project and bucket are
declared in `hackaton/main.py`; ensure the local identity has the required
Firestore, Storage, and Vertex AI permissions. Never commit local credential
files.

## Demo data

`seed_demo_data.py` is an optional Firestore utility. When run manually, it
asks for confirmation, deletes only recognized fallback logs for `crew_1`, and
upserts five synthetic mission-day records that progress from GREEN baseline
telemetry to YELLOW fluid-shift symptoms. It is **not run by the API or
deployment**.

```sh
python -m pip install -r hackaton/requirements.txt
gcloud auth application-default login
python seed_demo_data.py
```

Review the project and the confirmation prompt before allowing it to modify
Firestore. The seeded assessments are synthetic demo data, not clinical advice.
