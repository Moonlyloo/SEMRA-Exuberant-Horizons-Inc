from datetime import datetime, timedelta, timezone

from google.cloud import firestore


PROJECT_ID = "project-4cdccfc2-e562-45cb-838"
ASTRONAUT_ID = "crew_1"
COLLECTION = "VitalsLogs"
FALLBACK_HAZARD = "Autonomous Edge Fallback (Offline Protocol)"
START_TIME = datetime(2026, 11, 10, 12, 0, tzinfo=timezone.utc)

DEMO_RECORDS = [
    {
        "mission_day": 136,
        "heart_rate": 62,
        "blood_pressure": "115/75",
        "sleep_hours": 8.0,
        "exercise_min": 30,
        "symptoms": "",
        "risk_level": "GREEN",
        "nasa_hazard": "No acute HRP hazard identified",
        "clinical_reasoning": "Vitals are at the crew member's established baseline.",
        "action_plan": ["Continue routine telemetry monitoring."],
    },
    {
        "mission_day": 137,
        "heart_rate": 63,
        "blood_pressure": "116/75",
        "sleep_hours": 7.8,
        "exercise_min": 32,
        "symptoms": "",
        "risk_level": "GREEN",
        "nasa_hazard": "No acute HRP hazard identified",
        "clinical_reasoning": "Vitals remain close to the established baseline.",
        "action_plan": ["Continue routine telemetry monitoring."],
    },
    {
        "mission_day": 138,
        "heart_rate": 65,
        "blood_pressure": "117/76",
        "sleep_hours": 7.3,
        "exercise_min": 28,
        "symptoms": "",
        "risk_level": "GREEN",
        "nasa_hazard": "No acute HRP hazard identified",
        "clinical_reasoning": "A small heart-rate increase is not accompanied by symptoms.",
        "action_plan": ["Continue routine telemetry monitoring."],
    },
    {
        "mission_day": 139,
        "heart_rate": 73,
        "blood_pressure": "110/72",
        "sleep_hours": 6.4,
        "exercise_min": 20,
        "symptoms": "Mild lightheadedness when standing and increased thirst",
        "risk_level": "YELLOW",
        "nasa_hazard": "Microgravity Fluid Shift",
        "clinical_reasoning": "Postural lightheadedness and thirst warrant monitoring for fluid-shift symptoms.",
        "action_plan": [
            "Recheck blood pressure after rest.",
            "Track fluid intake and symptoms.",
            "Escalate if symptoms worsen or persist.",
        ],
    },
    {
        "mission_day": 140,
        "heart_rate": 78,
        "blood_pressure": "104/68",
        "sleep_hours": 5.8,
        "exercise_min": 18,
        "symptoms": "Persistent postural lightheadedness, thirst, and reduced urine output",
        "risk_level": "YELLOW",
        "nasa_hazard": "Microgravity Fluid Shift",
        "clinical_reasoning": "Persistent postural symptoms with lower blood pressure need prompt crew medical review.",
        "action_plan": [
            "Pause strenuous exercise and reassess after rest.",
            "Monitor vital signs and fluid intake.",
            "Contact the onboard medical officer for follow-up.",
        ],
    },
]


def is_fallback_entry(record):
    assessment = record.get("ai_assessment") or {}
    hazard = assessment.get("nasa_hazard", "")
    reasoning = assessment.get("clinical_reasoning", "")
    findings = assessment.get("ai_findings", "")
    return (
        hazard == FALLBACK_HAZARD
        or "AI offline" in reasoning
        or findings.startswith("Edge fallback visual check completed")
    )


def main():
    confirmation = input(
        "Delete recognized fallback logs for crew_1 and seed five demo records? [y/N] "
    )
    if confirmation.strip().lower() != "y":
        print("Cancelled; Firestore was not changed.")
        return

    db = firestore.Client(project=PROJECT_ID)
    logs = db.collection(COLLECTION)
    deleted = 0
    for snapshot in logs.where("astronaut_id", "==", ASTRONAUT_ID).stream():
        if is_fallback_entry(snapshot.to_dict() or {}):
            snapshot.reference.delete()
            deleted += 1

    for index, record in enumerate(DEMO_RECORDS):
        mission_day = record["mission_day"]
        vitals = {
            "astronaut_id": ASTRONAUT_ID,
            "mission_day": mission_day,
            "environment": "deep_space",
            "heart_rate": record["heart_rate"],
            "blood_pressure": record["blood_pressure"],
            "sleep_hours": record["sleep_hours"],
            "exercise_min": record["exercise_min"],
            "symptoms": record["symptoms"],
        }
        log_entry = {
            "astronaut_id": ASTRONAUT_ID,
            "mission_day": mission_day,
            "environment": "deep_space",
            "vitals": vitals,
            "ai_assessment": {
                "risk_level": record["risk_level"],
                "nasa_hazard": record["nasa_hazard"],
                "clinical_reasoning": record["clinical_reasoning"],
                "action_plan": record["action_plan"],
            },
            "timestamp": (START_TIME + timedelta(days=index)).isoformat(),
        }
        logs.document(f"demo_{ASTRONAUT_ID}_day_{mission_day}").set(log_entry)

    print(f"Deleted {deleted} fallback log(s); seeded {len(DEMO_RECORDS)} demo records.")


if __name__ == "__main__":
    main()
