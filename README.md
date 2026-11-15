# NASA Deep Space Health System

A hackathon prototype for astronaut health monitoring, medical image review,
and onboard triage during delayed communications with Earth.

> **Safety notice:** This project is a decision-support demonstration, not a
> medical device or a substitute for a qualified flight surgeon. Use synthetic
> data only. Do not upload real patient records or medical images.

## Architecture

### Onboard spacecraft segment

The browser app consists of `index.html`, `app.js`, and `styles.css` in the
repository root. It represents an astronaut client on the cabin LAN and
includes local threshold-based triage logic and a LocalStorage queue named
`offline_vitals_queue`.

The dashboard currently provides a **Medical Scan Analysis** card for image
uploads and AI review, a **36-item Measurements** catalogue, and a **Warning
Log** with search, filters, and per-event analysis. The Measurements catalogue,
sample warning history, and alert cascades are simulated browser-side data;
they are not clinical records in Firestore.

The client retains Cloud Run integrations for profile and history requests,
vitals submission, scan analysis, and queued batch sync. The current dashboard
does not display the health-link panel, vitals-submission form, queue controls,
or API history table. It listens for browser online/offline events and retains
the local queue/sync logic in `app.js`.

The web demo calls the Cloud Run API directly when connected. The onboard LAN
is modeled as a 0 ms boundary, but a separate onboard API server is not
implemented in this prototype.

### Deep Space Network latency boundary

The architecture models a simulated **20–45 minute** Deep Space Network (DSN)
store-and-forward interval. When the browser is offline or a vitals request
cannot reach the API, client code can queue the payload in LocalStorage and
sync queued records through `/api/sync` when connectivity returns. The current
dashboard does not expose a manual connection toggle or queue indicator.

In the intended feedback path, Ground Mission Control sends clinical updates
and baselines to an onboard server over the DSN; the onboard server then
serves them to the astronaut client over the cabin LAN. This is an
architectural boundary, not a separate service implemented in this demo.

### Earth and cloud segment

- **API:** FastAPI on Google Cloud Run.
- **Database:** Cloud Firestore collections `AstronautProfiles` and
  `VitalsLogs`.
- **Medical image storage:** Google Cloud Storage bucket
  `gs://nasa-medical-scans-4cdccfc2`.
- **Multimodal analysis:** Vertex AI using `gemini-3.5-flash-lite` by default.
- **Credentials:** Google Cloud credentials belong in the backend runtime;
  never put service-account keys in browser code.

The backend uses its configured Google Cloud identity for Firestore, Cloud
Storage, and Vertex AI. The current backend CORS configuration allows all
origins and should be restricted before production use.

### Web app shell and offline limitations

The installable web-app shell is described by `manifest.json`. `sw.js` is
configured to cache same-origin frontend assets and does not intercept or
cache Cloud Run API responses. The service worker and cache are versioned;
increment the matching asset query versions in `index.html` and the cache name
in `sw.js` when publishing updated frontend assets.

Offline shell caching depends on browser support and successful service-worker
installation. React 18 is loaded from a CDN and is not included in the
service-worker cache, so an internet connection is required to load React on a
fresh visit.

## Production API

**Production frontend:** <https://nasa-space-health.vercel.app>

**Base URL:** <https://space-health-api-1007338674559.us-central1.run.app>

**Interactive API documentation:**
<https://space-health-api-1007338674559.us-central1.run.app/docs>

The populated demo astronaut is `crew_1` (Elena Rostova). The client maps
telemetry and scan requests to this ID so they use the seeded demo profile.
The profile includes a Penicillin allergy and Ibuprofen gastric intolerance.

### `GET /api/profile/{astronaut_id}`

```http
GET /api/profile/crew_1
```

Returns the astronaut profile, including `medical_baseline` and
`medical_conditions`. The endpoint returns `404` if the profile does not
exist.

### `GET /api/history/{astronaut_id}?limit=50`

```http
GET /api/history/crew_1?limit=50
```

Returns `{ "astronaut_id": "crew_1", "records": [...] }`, sorted newest first.
The backend default limit is 100; valid limits range from 1 to 500. When
plotting a chronological time series, reverse a copy of the returned array so
the original newest-first order remains available for logs.

### `POST /api/vitals`

Send JSON. `mission_day`, `heart_rate`, `sleep_hours`, and `exercise_min` must
be numeric values:

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

The response includes `risk_level`, `nasa_hazard`, `clinical_reasoning`,
`action_plan`, and `sync_status`.

### `POST /api/analyze-scan`

Send `multipart/form-data` containing `file`, `astronaut_id`, and `notes`. Do
not set the multipart `Content-Type` header manually; the browser must add the
boundary.

```sh
curl -X POST "https://space-health-api-1007338674559.us-central1.run.app/api/analyze-scan" \
  -F "file=@sample-image.jpg;type=image/jpeg" \
  -F "astronaut_id=crew_1" \
  -F "notes=Synthetic demo image"
```

The response includes `gcs_uri`, `risk_level`, `ai_findings`, and
`recommended_action`.

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

The response includes `synced_count`, `status`, and per-record assessments.
After a successful sync, the client clears the queued entries and requests
the latest history.

## Run locally

### Frontend

From the repository root, start a static server with either command:

```sh
python -m http.server 8080
```

or:

```sh
npx serve .
```

Then open <http://localhost:8080>. The page loads React 18 from a CDN, so an
internet connection is required for a fresh visit.

### Backend

The FastAPI source is in `hackaton/`. From the repository root, install the
dependencies and authenticate with Google Cloud Application Default
Credentials:

```sh
python -m pip install -r hackaton/requirements.txt
gcloud auth application-default login
```

Then start the API:

```sh
cd hackaton
uvicorn main:app --reload --port 8000
```

The backend uses its configured Google Cloud project, Firestore database,
Storage bucket, and Vertex AI model. Ensure the local identity has the
required permissions. Do not commit credential files.

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
- **Evgeniia Rozhkova — Team Lead & System Designer:** Leads team coordination
  and shapes the end-to-end system design, turning mission needs into a
  cohesive astronaut-health platform.
- **Domain Research & Data Lead — Lead Data Engineer & Space Medicine
  Researcher:** NASA HRP hazard research, astronaut clinical baselines,
  allergy profiles, and biomedical dataset structuring.

## Demo data

`seed_demo_data.py` is an optional Firestore utility. It requests confirmation,
deletes only recognized fallback logs for `crew_1`, and upserts synthetic
mission-day records. It is not run by the API or frontend deployment. Review
the script and its confirmation prompt before using it. Seeded assessments
are synthetic demo data, not clinical advice.
