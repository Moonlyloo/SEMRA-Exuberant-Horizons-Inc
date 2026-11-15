# NASA Deep Space Health System

A hackathon prototype for astronaut health monitoring, offline telemetry
capture, and onboard triage during delayed Earth communications.

> **Safety notice:** This is a decision-support demonstration, not a medical
> device or a substitute for a qualified flight surgeon. Demo with synthetic
> data only. Do not upload real patient records or medical images.

## Architecture

### Onboard spacecraft segment

The browser app (`index.html`, `app.js`, and `styles.css` in the repository
root) represents the astronaut client on the cabin LAN. It provides cached
crew information, local threshold-based triage, a LocalStorage queue named
`offline_vitals_queue`. The dashboard has been restored to its pre-health-link
layout and no longer exposes the health-link panel, online/offline controls,
vitals submission, or API history. A dedicated **Medical Scan Analysis**
card remains on the dashboard for image upload and AI review. The client-side
API and offline-sync logic remains in `app.js`. The onboard LAN is modeled as
a 0 ms boundary; the current web demo calls the Cloud Run API directly when
connected rather than hosting a separate onboard server.

The installable web-app shell is described by `manifest.json`; `sw.js` caches
only same-origin frontend assets and does not intercept or cache Cloud Run API
responses. In local browser verification, the service-worker registration
remained inactive and created no cache, so app-shell offline behavior is not
confirmed.

The dashboard also includes a 36-item **Measurements** catalogue and a
**Warning Log** with search, filters, and per-event analysis. Catalogue
simulations, sample warning history, and alert cascades are labeled as
simulated and stored in browser-local state; they are not clinical records in
Firestore. Live profile/history data and submitted vitals continue to use the
Cloud Run API described below.

### DSN latency boundary

The system models a **20–45 minute** Deep Space Network store-and-forward
interval. Client code can queue vitals locally when offline and post them to
`/api/sync` on reconnection, but the dashboard no longer exposes those
controls. Clinical updates and baselines should flow from Ground Mission
Control to an onboard server over the DSN; the onboard server should then
serve them to the client over the cabin LAN. That ground-to-onboard feedback
path is an architectural boundary, not a separate service implemented in
this demo.

### Earth and cloud segment

- **API:** FastAPI on Google Cloud Run.
- **Database:** Cloud Firestore collections `AstronautProfiles` and
  `VitalsLogs`.
- **Medical images:** Google Cloud Storage bucket
  `gs://nasa-medical-scans-4cdccfc2`.
- **Multimodal analysis:** Vertex AI Gemini `gemini-3.5-flash-lite`.
- **Cloud credentials:** Google Cloud credentials belong to the backend
  runtime. Never place service-account credentials in browser code.

The backend uses its configured Google Cloud identity for Firestore, Storage,
and Vertex AI. Browser access also depends on the Cloud Run service's invoke
policy and its CORS configuration; CORS is permissive in the current
prototype and should be restricted before production use.

## Production API

**Base URL:** <https://space-health-api-1007338674559.us-central1.run.app>

**Interactive docs:** <https://space-health-api-1007338674559.us-central1.run.app/docs>

The populated demo astronaut is `crew_1` (Elena Rostova). The browser maps
telemetry and scan requests to that demo ID so the existing UI crew selector
does not accidentally query an unseeded profile.

### `GET /api/profile/{astronaut_id}`

```http
GET /api/profile/crew_1
```

Returns the profile, including `medical_baseline` and
`medical_conditions`. The demo profile includes a Penicillin allergy and
Ibuprofen gastric intolerance. The endpoint returns `404` when a profile is
not found.

### `GET /api/history/{astronaut_id}?limit=50`

```http
GET /api/history/crew_1?limit=50
```

Returns `{ "astronaut_id": "crew_1", "records": [...] }`, newest record first.
The dashboard keeps that order in its log table and reverses a copy for its
chronological heart-rate chart. The backend accepts a `limit` from 1 to 500.

### `POST /api/vitals`

Send JSON with numeric values for `mission_day`, `heart_rate`, `sleep_hours`,
and `exercise_min`:

```json
{
  "astronaut_id": "crew_1",
  "mission_day": 142,
  "environment": "Microgravity / Deep Space Transit",
  "heart_rate": 108,
  "blood_pressure": "138/88",
  "sleep_hours": 5.5,
  "exercise_min": 45,
  "symptoms": "Mild headache and visual blur"
}
```

The response contains `risk_level`, `nasa_hazard`, `clinical_reasoning`, and
`action_plan` (and currently includes a `sync_status` field).

### `POST /api/analyze-scan`

Send `multipart/form-data` containing `file`, `astronaut_id`, and `notes`.
Do not set the multipart `Content-Type` header manually; the browser must add
the boundary.

```sh
curl -X POST "https://space-health-api-1007338674559.us-central1.run.app/api/analyze-scan" \
  -F "file=@sample-image.jpg;type=image/jpeg" \
  -F "astronaut_id=crew_1" \
  -F "notes=Synthetic demo image"
```

Returns `gcs_uri`, `risk_level`, `ai_findings`, and `recommended_action`.

### `POST /api/sync`

Send a JSON batch using the same numeric vitals schema as `/api/vitals`:

```json
{
  "records": [
    {
      "astronaut_id": "crew_1",
      "mission_day": 142,
      "environment": "Microgravity / Deep Space Transit",
      "heart_rate": 72,
      "blood_pressure": "120/80",
      "sleep_hours": 7.5,
      "exercise_min": 30,
      "symptoms": ""
    }
  ]
}
```

Returns a batch result with `synced_count`, `status`, and per-record
assessments. The web app clears queued entries after a successful response
and then fetches the latest history.

## Run locally

### Frontend

From the repository root, run either:

```sh
python -m http.server 8080
```

or:

```sh
npx serve .
```

Then open <http://localhost:8080>. React 18 is loaded from a CDN, so the page
requires network access to load React even when the API connection is toggled
offline. The service worker is configured to cache the local app shell, but
its activation was not observed during verification. It does not cache
clinical API responses or make the CDN-hosted React runtime available offline.

### Backend

The FastAPI source is in `hackaton/`. Install dependencies from the repository
root, authenticate with Google Cloud Application Default Credentials, and
start the local server:

```sh
python -m pip install -r hackaton/requirements.txt
gcloud auth application-default login
cd hackaton
uvicorn main:app --reload --port 8000
```

The backend uses the configured Google Cloud project, Firestore, bucket, and
Vertex AI model. Ensure the local identity has the required permissions. Do
not commit credential files.

## Repository layout

```text
/
  index.html
  app.js
  styles.css
  manifest.json
  icon.svg
  sw.js
  README.md
  seed_demo_data.py
  hackaton/
    main.py
    Dockerfile
    requirements.txt
    firestore.indexes.json
    seed_db.py
```

## Team

- **Ibrahim Alizada — Principal AI, Systems & Security Architect:** End-to-end
  GCP infrastructure, FastAPI backend, multimodal Vertex AI integration,
  zero-key IAM security, and clinical safety guardrails.
- **Domain Research & Data Lead — Lead Data Engineer & Space Medicine
  Researcher:** NASA HRP hazard research, astronaut clinical baselines,
  allergy profiles, and biomedical dataset structuring.

## Demo data

`seed_demo_data.py` is an optional Firestore utility. It asks for confirmation,
deletes only recognized fallback logs for `crew_1`, and upserts synthetic
mission-day records. It is not run by the API or deployment. Review the
script and its confirmation prompt before using it; seeded assessments are
synthetic demo data, not clinical advice.
