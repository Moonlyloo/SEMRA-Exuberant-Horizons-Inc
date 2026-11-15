from google.cloud import firestore

# Подключается автоматически, используя GOOGLE_APPLICATION_CREDENTIALS=./key.json
db = firestore.Client(project="project-4cdccfc2-e562-45cb-838")

astronaut_data = {
    "astronaut_id": "crew_1",
    "first_name": "Elena",
    "last_name": "Rostova",
    "date_of_birth": "1992-05-14",
    "sex": "Female",
    "crew_role": "Flight Engineer",
    "standing_height_cm": 172.5,
    "sitting_height_cm": 91.0,
    "created_at": "2026-11-14T10:00:00Z",

    # Вложенный map (бывшая таблица astronaut_medical_baselines)
    "medical_baseline": {
        "blood_type": "O+",
        "baseline_body_composition": {"muscle_mass_kg": 48.2, "body_fat_pct": 21.5},
        "bone_material_normal_density_g_cm2": 1.185,
        "base_heart_rating_bpm": 62,
        "base_blood_pressure": "115/75",
        "base_ecg_results": "Normal sinus rhythm",
        "max_oxygen_capacity_ml_kg_min": 49.5,
        "immune_profile": {"baseline_wbc": 6.1},
        "dental_records": {"last_check": "2026-09-01", "status": "Cleared"},
        "updated_at": "2026-11-01T12:00:00Z"
    },

    # Массив объектов array<map> (бывшая таблица astronaut_medical_conditions)
    "medical_conditions": [
        {
            "condition_type": "Allergy",
            "condition_name": "Penicillin",
            "notes": "Severe skin rash"
        },
        {
            "condition_type": "Drug Intolerance",
            "condition_name": "Ibuprofen",
            "notes": "Gastric irritation in microgravity"
        }
    ]
}

# Записываем (или перезаписываем) документ crew_1 в коллекцию AstronautProfiles
db.collection("AstronautProfiles").document("crew_1").set(astronaut_data)
print("Профиль Elena Rostova (crew_1) успешно загружен в Firestore!")