(function () {
  const API_BASE_URL = "https://space-health-api-1007338674559.us-central1.run.app";
  const OFFLINE_VITALS_QUEUE_KEY = "offline_vitals_queue";
  const h = React.createElement;
  const { useState, useEffect, useRef } = React;

  const STORAGE_KEY = "ahs_crew_state_v2";
  const GCLOUD_CONFIG_STORAGE_KEY = "ahs_gcloud_config_v1";
  const MIN_SLOTS = 0;
  const MAX_SLOTS = 24;
  const DEFAULT_SLOT_COUNT = 0;
  const GENDER_OPTIONS = ["", "Female", "Male", "Non-binary", "Other"];
  const BLOOD_TYPE_OPTIONS = ["", "O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"];

  function fetchApiJson(path, options) {
    return fetch(API_BASE_URL + path, options || {}).then(function (response) {
      return response.text().then(function (text) {
        var payload;
        try {
          payload = text ? JSON.parse(text) : null;
        } catch (_error) {
          payload = null;
        }
        if (!response.ok) {
          var detail =
            payload && typeof payload === "object" && payload.detail
              ? payload.detail
              : response.statusText;
          var error = new Error("API request failed (" + response.status + "): " + detail);
          error.status = response.status;
          throw error;
        }
        if (text && payload === null) {
          throw new Error("API returned an invalid JSON response.");
        }
        return payload;
      });
    });
  }

  function readOfflineVitalsQueue() {
    var raw = window.localStorage.getItem(OFFLINE_VITALS_QUEUE_KEY);
    if (!raw) return [];
    var queue = JSON.parse(raw);
    if (!Array.isArray(queue)) {
      throw new Error("Stored offline vitals queue is not an array.");
    }
    return queue;
  }

  function saveOfflineVitalsQueue(queue) {
    window.localStorage.setItem(OFFLINE_VITALS_QUEUE_KEY, JSON.stringify(queue));
  }

  function getApiAstronautId() {
    return "crew_1";
  }

  function getLocalTriage(payload, profile) {
    var baseline =
      profile && profile.medical_baseline
        ? profile.medical_baseline
        : SAMPLE_CLOUD_ASTRONAUT_ELENA.medical_baseline;
    var baseHeartRate = Number(baseline.base_heart_rating_bpm) || 62;
    var riskLevel = "GREEN";
    if (payload.heart_rate > baseHeartRate * 1.6 || payload.sleep_hours < 4) {
      riskLevel = "RED";
    } else if (
      payload.heart_rate > baseHeartRate * 1.3 ||
      payload.sleep_hours < 6 ||
      Boolean(payload.symptoms)
    ) {
      riskLevel = "YELLOW";
    }
    var conditions =
      profile && Array.isArray(profile.medical_conditions)
        ? profile.medical_conditions
        : SAMPLE_CLOUD_ASTRONAUT_ELENA.medical_conditions;
    var contraindications = conditions
      .filter(function (condition) {
        var name = String(condition.condition_name || "").toLowerCase();
        return name.indexOf("penicillin") !== -1 || name.indexOf("ibuprofen") !== -1;
      })
      .map(function (condition) {
        return condition.condition_name + " (" + (condition.condition_type || "contraindication") + ")";
      });
    return {
      risk_level: riskLevel,
      nasa_hazard:
        riskLevel === "GREEN" ? "Routine Mission Monitoring" : "Microgravity Fluid Shift / Clinical Monitoring",
      clinical_reasoning:
        "Local threshold triage: heart rate " +
        payload.heart_rate +
        " bpm (baseline " +
        baseHeartRate +
        " bpm), sleep " +
        payload.sleep_hours +
        " hours." +
        (payload.symptoms ? " Symptoms reported: " + payload.symptoms + "." : ""),
      action_plan: [
        "Record this reading and repeat measurements if symptoms change.",
        contraindications.length
          ? "Contraindications on file: " + contraindications.join("; ") + ". Do not use these medications."
          : "Check the crew medical profile before any medication.",
        "Contact the flight surgeon according to the mission medical protocol.",
      ],
    };
  }

  function getVitalsHistoryRecords(history) {
    return history && Array.isArray(history.records) ? history.records : [];
  }

  const SAMPLE_CLOUD_ASTRONAUT_ELENA = {
    id: "crew_1",
    astronaut_id: "crew_1",
    first_name: "Elena",
    last_name: "Rostova",
    date_of_birth: "1992-05-14",
    sex: "Female",
    crew_role: "Flight Engineer",
    standing_height_cm: 172.5,
    sitting_height_cm: 91.0,
    created_at: "2026-11-14T10:00:00Z",
    medical_baseline: {
      blood_type: "O+",
      baseline_body_composition: { muscle_mass_kg: 48.2, body_fat_pct: 21.5 },
      bone_material_normal_density_g_cm2: 1.185,
      base_heart_rating_bpm: 62,
      base_blood_pressure: "115/75",
      base_ecg_results: "Normal sinus rhythm",
      max_oxygen_capacity_ml_kg_min: 49.5,
      immune_profile: { baseline_wbc: 6.1 },
      dental_records: { last_check: "2026-09-01", status: "Cleared" },
      updated_at: "2026-11-01T12:00:00Z",
    },
    medical_conditions: [
      {
        condition_type: "Allergy",
        condition_name: "Penicillin",
        notes: "Severe skin rash",
      },
      {
        condition_type: "Drug Intolerance",
        condition_name: "Ibuprofen",
        notes: "Gastric irritation in microgravity",
      },
    ],
  };

  function calculateAgeFromDob(dobStr) {
    if (!dobStr || typeof dobStr !== "string") return "";
    var match = dobStr.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return "";
    var birthYear = parseInt(match[1], 10);
    var birthMonth = parseInt(match[2], 10);
    var birthDay = parseInt(match[3], 10);
    var refYear = 2026;
    var refMonth = 11;
    var refDay = 14;
    var computedAge = refYear - birthYear;
    if (refMonth < birthMonth || (refMonth === birthMonth && refDay < birthDay)) {
      computedAge -= 1;
    }
    return computedAge >= 1 && computedAge <= 120 ? computedAge : "";
  }

  function deriveDobFromAge(ageVal) {
    var parsed = parseInt(ageVal, 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 120) return "";
    return String(2026 - parsed) + "-01-01";
  }

  function sanitizeOptionalNumber(val) {
    if (val === "" || val === null || val === undefined) return null;
    var num = Number(val);
    return Number.isFinite(num) ? Number(num.toFixed(3)) : null;
  }

  function buildMedicalBaseline(rawBaseline, fallbackBloodType) {
    var src = rawBaseline && typeof rawBaseline === "object" ? rawBaseline : {};
    var bodyComp = src.baseline_body_composition && typeof src.baseline_body_composition === "object" ? src.baseline_body_composition : {};
    var immune = src.immune_profile && typeof src.immune_profile === "object" ? src.immune_profile : {};
    var dental = src.dental_records && typeof src.dental_records === "object" ? src.dental_records : {};
    var isLegacyPlaceholder = src.base_heart_rating_bpm === 66 && src.base_blood_pressure === "118/76";
    var muscleVal = sanitizeOptionalNumber(bodyComp.muscle_mass_kg);
    var fatVal = sanitizeOptionalNumber(bodyComp.body_fat_pct);
    var bmdVal = sanitizeOptionalNumber(src.bone_material_normal_density_g_cm2);
    var hrVal = sanitizeOptionalNumber(src.base_heart_rating_bpm);
    var vo2Val = sanitizeOptionalNumber(src.max_oxygen_capacity_ml_kg_min);
    var wbcVal = sanitizeOptionalNumber(immune.baseline_wbc);
    return {
      blood_type: src.blood_type || fallbackBloodType || "O+",
      baseline_body_composition: {
        muscle_mass_kg: muscleVal !== null ? muscleVal : 48.2,
        body_fat_pct: fatVal !== null ? fatVal : 21.5,
      },
      bone_material_normal_density_g_cm2: bmdVal !== null ? bmdVal : 1.185,
      base_heart_rating_bpm: isLegacyPlaceholder ? 62 : (hrVal !== null ? hrVal : 62),
      base_blood_pressure: isLegacyPlaceholder ? "115/75" : (src.base_blood_pressure || "115/75"),
      base_ecg_results: src.base_ecg_results || "Normal sinus rhythm",
      max_oxygen_capacity_ml_kg_min: vo2Val !== null ? vo2Val : 49.5,
      immune_profile: {
        baseline_wbc: wbcVal !== null ? wbcVal : 6.1,
      },
      dental_records: {
        last_check: dental.last_check || "2026-09-01",
        status: dental.status || "Cleared",
      },
      updated_at: src.updated_at || "2026-11-01T12:00:00Z",
    };
  }

  function normalizeAstronautProfile(raw, fallbackIndex) {
    if (!raw || typeof raw !== "object") return null;
    var idxNum = Number.isFinite(fallbackIndex) ? fallbackIndex + 1 : 1;
    var split = splitFullName({
      firstName: raw.first_name !== undefined ? raw.first_name : raw.firstName,
      lastName: raw.last_name !== undefined ? raw.last_name : raw.lastName,
      name: raw.name,
    });
    var first = split.firstName.trim();
    var last = split.lastName.trim();
    var fullName = [first, last].filter(Boolean).join(" ") || (raw.name ? String(raw.name).trim() : "");
    var astroId = raw.astronaut_id || raw.id || "crew_" + idxNum;
    var dob = raw.date_of_birth || (raw.age ? deriveDobFromAge(raw.age) : "");
    var resolvedAge = raw.age !== undefined && raw.age !== "" ? raw.age : calculateAgeFromDob(dob);
    var resolvedSex = raw.sex !== undefined && raw.sex !== "" ? raw.sex : raw.gender || "";
    var rawBlood =
      (raw.medical_baseline && raw.medical_baseline.blood_type) || raw.bloodType || "";
    var standingH =
      raw.standing_height_cm !== undefined && raw.standing_height_cm !== null && raw.standing_height_cm !== ""
        ? Number(raw.standing_height_cm)
        : raw.heightCm !== undefined && raw.heightCm !== null && raw.heightCm !== ""
        ? Number(raw.heightCm)
        : null;
    var cleanStandingH = Number.isFinite(standingH) && standingH > 0 ? Number(standingH.toFixed(1)) : 172.5;
    var sittingH =
      raw.sitting_height_cm !== undefined && raw.sitting_height_cm !== null && raw.sitting_height_cm !== ""
        ? Number(raw.sitting_height_cm)
        : raw.sittingHeightCm !== undefined && raw.sittingHeightCm !== null && raw.sittingHeightCm !== ""
        ? Number(raw.sittingHeightCm)
        : null;
    var cleanSittingH = Number.isFinite(sittingH) && sittingH > 0 ? Number(sittingH.toFixed(1)) : 91.0;
    var crewRole = raw.crew_role || raw.crewRole || "Crew Member";
    var createdAt = raw.created_at || raw.createdAt || "2026-11-14T10:00:00Z";
    var baseline = buildMedicalBaseline(raw.medical_baseline, rawBlood);
    var parsedConditions = Array.isArray(raw.medical_conditions)
      ? raw.medical_conditions
          .filter(function (c) {
            return c && (c.condition_name || c.condition_type || c.notes);
          })
          .map(function (c) {
            return {
              condition_type: String(c.condition_type || "Condition"),
              condition_name: String(c.condition_name || ""),
              notes: String(c.notes || ""),
            };
          })
      : [];
    var conditions =
      parsedConditions.length > 0 || raw._conditionsEdited
        ? parsedConditions
        : SAMPLE_CLOUD_ASTRONAUT_ELENA.medical_conditions.map(function (c) {
            return {
              condition_type: c.condition_type,
              condition_name: c.condition_name,
              notes: c.notes,
            };
          });

    return Object.assign({}, raw, {
      id: astroId,
      astronaut_id: astroId,
      first_name: first,
      last_name: last,
      firstName: first,
      lastName: last,
      name: fullName,
      date_of_birth: dob,
      age: resolvedAge !== null && resolvedAge !== undefined ? resolvedAge : "",
      sex: resolvedSex,
      gender: resolvedSex,
      crew_role: crewRole,
      bloodType: baseline.blood_type || rawBlood,
      standing_height_cm: cleanStandingH,
      heightCm: cleanStandingH !== null ? cleanStandingH : "",
      sitting_height_cm: cleanSittingH,
      sittingHeightCm: cleanSittingH !== null ? cleanSittingH : "",
      created_at: createdAt,
      medical_baseline: baseline,
      medical_conditions: conditions,
      missionDay: Math.max(1, parseInt(raw.missionDay, 10) || 142),
      xp: Number.isFinite(Number(raw.xp)) ? Number(raw.xp) : 100,
      badges: Array.isArray(raw.badges) && raw.badges.length ? raw.badges : ["Baseline Calibrated"],
      avatarUrl: raw.avatarUrl || null,
    });
  }

  function toAstronautProfileDocument(slot, fallbackIndex) {
    var norm = normalizeAstronautProfile(slot, fallbackIndex);
    if (!norm) return null;
    return {
      id: norm.id,
      astronaut_id: norm.astronaut_id,
      first_name: norm.first_name,
      last_name: norm.last_name,
      date_of_birth: norm.date_of_birth || null,
      sex: norm.sex || null,
      crew_role: norm.crew_role || "Crew Member",
      standing_height_cm: norm.standing_height_cm,
      sitting_height_cm: norm.sitting_height_cm,
      created_at: norm.created_at,
      medical_baseline: norm.medical_baseline,
      medical_conditions: norm.medical_conditions,
    };
  }

  function toFirestoreValue(val) {
    if (val === null || val === undefined) return { nullValue: null };
    if (typeof val === "string") return { stringValue: val };
    if (typeof val === "boolean") return { booleanValue: val };
    if (typeof val === "number") {
      return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
    }
    if (Array.isArray(val)) {
      return {
        arrayValue: {
          values: val.map(toFirestoreValue),
        },
      };
    }
    if (typeof val === "object") {
      var fields = {};
      Object.keys(val).forEach(function (k) {
        if (val[k] !== undefined) {
          fields[k] = toFirestoreValue(val[k]);
        }
      });
      return { mapValue: { fields: fields } };
    }
    return { stringValue: String(val) };
  }

  function fromFirestoreValue(v) {
    if (!v || typeof v !== "object") return null;
    if ("nullValue" in v) return null;
    if ("stringValue" in v) return v.stringValue;
    if ("booleanValue" in v) return Boolean(v.booleanValue);
    if ("integerValue" in v) return parseInt(v.integerValue, 10);
    if ("doubleValue" in v) return Number(v.doubleValue);
    if ("timestampValue" in v) return v.timestampValue;
    if (v.arrayValue) {
      return Array.isArray(v.arrayValue.values) ? v.arrayValue.values.map(fromFirestoreValue) : [];
    }
    if (v.mapValue) {
      return fromFirestoreFields(v.mapValue.fields || {});
    }
    return null;
  }

  function fromFirestoreFields(fields) {
    var out = {};
    if (!fields || typeof fields !== "object") return out;
    Object.keys(fields).forEach(function (k) {
      out[k] = fromFirestoreValue(fields[k]);
    });
    return out;
  }

  function fromFirestoreDocument(fsDoc, fallbackIndex) {
    if (!fsDoc || typeof fsDoc !== "object") return null;
    if (fsDoc.fields) {
      var raw = fromFirestoreFields(fsDoc.fields);
      if (!raw.id && fsDoc.name) {
        var segments = String(fsDoc.name).split("/");
        raw.id = segments[segments.length - 1];
      }
      return normalizeAstronautProfile(raw, fallbackIndex);
    }
    return normalizeAstronautProfile(fsDoc, fallbackIndex);
  }

  function getDefaultCloudConfig() {
    var detectedProjectId = "my-first-project";
    try {
      if (typeof window !== "undefined") {
        if (window.AHS_GCLOUD_PROJECT_ID) {
          detectedProjectId = String(window.AHS_GCLOUD_PROJECT_ID).trim();
        } else if (window.AHS_FIREBASE_CONFIG && window.AHS_FIREBASE_CONFIG.projectId) {
          detectedProjectId = String(window.AHS_FIREBASE_CONFIG.projectId).trim();
        } else if (window.location && window.location.search && typeof URLSearchParams === "function") {
          var params = new URLSearchParams(window.location.search);
          var fromUrl = params.get("projectId") || params.get("project");
          if (fromUrl && fromUrl.trim()) detectedProjectId = fromUrl.trim();
        }
      }
    } catch (_e) {
      // Fall back to default project ID if global or URL lookup fails.
    }
    return {
      provider: "google-cloud-firestore",
      projectName: "My First Project",
      projectId: detectedProjectId,
      databaseId: "(default)",
      containerName: "AstronautProfiles",
      endpointUrl: "",
      apiKey: "",
      autoConnect: true,
    };
  }

  function loadCloudConfig() {
    var defaults = getDefaultCloudConfig();
    try {
      var raw = window.localStorage.getItem(GCLOUD_CONFIG_STORAGE_KEY);
      if (!raw) return defaults;
      var parsed = JSON.parse(raw);
      var merged = Object.assign({}, defaults, parsed);
      if (!merged.projectId || !String(merged.projectId).trim()) {
        merged.projectId = defaults.projectId;
      }
      if (!merged.projectName || !String(merged.projectName).trim()) {
        merged.projectName = defaults.projectName;
      }
      if (parsed.autoConnect === undefined) {
        merged.autoConnect = true;
      }
      return merged;
    } catch (_err) {
      return defaults;
    }
  }

  function saveCloudConfig(config) {
    try {
      window.localStorage.setItem(GCLOUD_CONFIG_STORAGE_KEY, JSON.stringify(config));
    } catch (_err) {
      // Ignore storage quota errors in restricted browsing modes.
    }
  }

  var AHSCloudService = {
    SCHEMA_CONTAINER: "AstronautProfiles",
    SAMPLE_DOCUMENT: SAMPLE_CLOUD_ASTRONAUT_ELENA,
    loadConfig: loadCloudConfig,
    saveConfig: saveCloudConfig,
    toDocument: toAstronautProfileDocument,
    fromDocument: function (doc, idx) {
      return fromFirestoreDocument(doc, idx);
    },
    toFirestoreDocument: function (slot, idx) {
      var doc = toAstronautProfileDocument(slot, idx);
      if (!doc) return null;
      return { fields: toFirestoreValue(doc).mapValue.fields };
    },
    buildCollectionUrl: function (config) {
      var cfg = Object.assign(getDefaultCloudConfig(), config || {});
      var container = encodeURIComponent(cfg.containerName || "AstronautProfiles");
      if (cfg.endpointUrl && cfg.endpointUrl.trim()) {
        return cfg.endpointUrl.trim().replace(/\/+$/, "");
      }
      if (!cfg.projectId || !cfg.projectId.trim()) {
        return "";
      }
      var project = encodeURIComponent(cfg.projectId.trim());
      var db = encodeURIComponent((cfg.databaseId || "(default)").trim());
      var base =
        "https://firestore.googleapis.com/v1/projects/" +
        project +
        "/databases/" +
        db +
        "/documents/" +
        container;
      if (cfg.apiKey && cfg.apiKey.trim() && cfg.apiKey.trim().indexOf("ya29.") !== 0) {
        return base + "?key=" + encodeURIComponent(cfg.apiKey.trim());
      }
      return base;
    },
    buildDocumentUrl: function (config, docId) {
      var cfg = Object.assign(getDefaultCloudConfig(), config || {});
      var cleanId = encodeURIComponent(docId || "crew_1");
      if (cfg.endpointUrl && cfg.endpointUrl.trim()) {
        return cfg.endpointUrl.trim().replace(/\/+$/, "") + "/" + cleanId;
      }
      if (!cfg.projectId || !cfg.projectId.trim()) {
        return "";
      }
      var project = encodeURIComponent(cfg.projectId.trim());
      var db = encodeURIComponent((cfg.databaseId || "(default)").trim());
      var container = encodeURIComponent(cfg.containerName || "AstronautProfiles");
      var base =
        "https://firestore.googleapis.com/v1/projects/" +
        project +
        "/databases/" +
        db +
        "/documents/" +
        container +
        "/" +
        cleanId;
      if (cfg.apiKey && cfg.apiKey.trim() && cfg.apiKey.trim().indexOf("ya29.") !== 0) {
        return base + "?key=" + encodeURIComponent(cfg.apiKey.trim());
      }
      return base;
    },
    buildHeaders: function (config) {
      var headers = { "Content-Type": "application/json" };
      var key = config && config.apiKey ? config.apiKey.trim() : "";
      if (key && key.indexOf("ya29.") === 0) {
        headers.Authorization = "Bearer " + key;
      } else if (key && config && config.endpointUrl && config.endpointUrl.trim()) {
        headers.Authorization = "Bearer " + key;
      }
      return headers;
    },
    fetchProfiles: function (config) {
      var url = AHSCloudService.buildCollectionUrl(config);
      if (!url) {
        return Promise.reject(
          new Error("Configure Google Cloud Project ID or Endpoint URL before pulling AstronautProfiles.")
        );
      }
      if (typeof fetch !== "function") {
        return Promise.reject(new Error("Fetch API is unavailable in this environment."));
      }
      return fetch(url, {
        method: "GET",
        headers: AHSCloudService.buildHeaders(config),
      }).then(function (res) {
        if (!res.ok) {
          throw new Error("Google Cloud request failed (" + res.status + " " + res.statusText + ")");
        }
        return res.json().then(function (payload) {
          var rawList = Array.isArray(payload)
            ? payload
            : Array.isArray(payload && payload.documents)
            ? payload.documents
            : payload && payload.id
            ? [payload]
            : [];
          return rawList
            .map(function (item, idx) {
              return fromFirestoreDocument(item, idx);
            })
            .filter(Boolean);
        });
      });
    },
    saveProfile: function (config, slot, idx) {
      var doc = toAstronautProfileDocument(slot, idx);
      if (!doc) return Promise.resolve(null);
      var url = AHSCloudService.buildDocumentUrl(config, doc.astronaut_id);
      if (!url) {
        return Promise.reject(
          new Error("Configure Google Cloud Project ID or Endpoint URL before syncing AstronautProfiles.")
        );
      }
      if (typeof fetch !== "function") {
        return Promise.reject(new Error("Fetch API is unavailable in this environment."));
      }
      var isCustomEndpoint = Boolean(config && config.endpointUrl && config.endpointUrl.trim());
      var body = isCustomEndpoint ? JSON.stringify(doc) : JSON.stringify(AHSCloudService.toFirestoreDocument(slot, idx));
      return fetch(url, {
        method: isCustomEndpoint ? "PUT" : "PATCH",
        headers: AHSCloudService.buildHeaders(config),
        body: body,
      }).then(function (res) {
        if (!res.ok) {
          throw new Error("Failed syncing " + doc.astronaut_id + " (" + res.status + " " + res.statusText + ")");
        }
        return res.json();
      });
    },
    syncAllProfiles: function (config, slots) {
      var validSlots = (slots || []).filter(Boolean);
      if (validSlots.length === 0) {
        return Promise.reject(new Error("No assigned astronaut profiles to sync."));
      }
      return Promise.all(
        validSlots.map(function (slot, idx) {
          return AHSCloudService.saveProfile(config, slot, idx);
        })
      );
    },
    autoConnect: function (config, currentSlots) {
      var cfg = Object.assign(loadCloudConfig(), config || {});
      if (cfg.autoConnect === false) {
        return Promise.resolve({
          status: "disabled",
          source: "local",
          message: "Automatic Firestore connection is paused.",
          profiles: currentSlots || [],
        });
      }
      return AHSCloudService.fetchProfiles(cfg)
        .then(function (fetched) {
          if (fetched && fetched.length > 0) {
            return {
              status: "connected",
              source: "firestore",
              message:
                "Auto-connected to Firestore (" +
                (cfg.projectName || "My First Project") +
                " / " +
                (cfg.containerName || "AstronautProfiles") +
                "): loaded " +
                fetched.length +
                " astronaut profile(s).",
              profiles: fetched,
            };
          }
          var validExisting = (currentSlots || []).filter(Boolean);
          var seedList =
            validExisting.length > 0
              ? validExisting
              : [normalizeAstronautProfile(SAMPLE_CLOUD_ASTRONAUT_ELENA, 0)];
          return AHSCloudService.syncAllProfiles(cfg, seedList)
            .then(function () {
              return {
                status: "seeded",
                source: "firestore",
                message:
                  "Auto-connected to Firestore (" +
                  (cfg.projectName || "My First Project") +
                  ") and initialized AstronautProfiles.",
                profiles: seedList,
              };
            })
            .catch(function () {
              return {
                status: "connected-local-seed",
                source: "local-cache",
                message:
                  "Connected to Firestore config (" +
                  (cfg.projectName || "My First Project") +
                  "). Loaded baseline crew_1 profile.",
                profiles: seedList,
              };
            });
        })
        .catch(function () {
          var validExisting = (currentSlots || []).filter(Boolean);
          var fallbackList =
            validExisting.length > 0
              ? currentSlots
              : [normalizeAstronautProfile(SAMPLE_CLOUD_ASTRONAUT_ELENA, 0)];
          return {
            status: "fallback",
            source: "local-cache",
            message:
              'Auto-Connect active for Google Cloud "' +
              (cfg.projectName || "My First Project") +
              '" (' +
              (cfg.projectId || "my-first-project") +
              " / Firestore " +
              (cfg.databaseId || "(default)") +
              " / " +
              (cfg.containerName || "AstronautProfiles") +
              "). Syncing with local AstronautProfiles cache.",
            profiles: fallbackList,
          };
        });
    },
    exportContainerDocuments: function (slots) {
      return (slots || [])
        .map(function (slot, idx) {
          return slot ? toAstronautProfileDocument(slot, idx) : null;
        })
        .filter(Boolean);
    },
  };

  if (typeof window !== "undefined") {
    window.AHSCloudService = AHSCloudService;
  }

  function createDefaultSlots(count) {
    return Array.from({ length: count }, function (_, index) {
      var num = index + 1;
      return normalizeAstronautProfile(
        {
          id: "crew_" + num,
          astronaut_id: "crew_" + num,
          first_name: "Astronaut",
          last_name: String(num),
          crew_role: "Crew Member",
          missionDay: 12 + index * 3,
          xp: 100 + index * 25,
          badges: ["Baseline Calibrated"],
          avatarUrl: null,
        },
        index
      );
    });
  }

  function formatAstronautBio(astronaut, showEmptyPlaceholders) {
    if (!astronaut) {
      return showEmptyPlaceholders ? "Age: — • DOB: — • Sex: — • Blood Type: —" : "";
    }
    var ageStr = astronaut.age ? String(astronaut.age) : "";
    var dobStr = astronaut.date_of_birth || "";
    var genderStr = astronaut.sex || astronaut.gender || "";
    var bloodStr =
      (astronaut.medical_baseline && astronaut.medical_baseline.blood_type) || astronaut.bloodType || "";

    if (showEmptyPlaceholders) {
      return (
        "Age: " +
        (ageStr || "—") +
        (dobStr ? " (DOB: " + dobStr + ")" : "") +
        " • Sex: " +
        (genderStr || "—") +
        " • Blood Type: " +
        (bloodStr || "—")
      );
    }

    var parts = [];
    if (ageStr) parts.push(ageStr + " yrs");
    if (genderStr) parts.push(genderStr);
    if (bloodStr) parts.push("Blood Type " + bloodStr);
    return parts.join(" • ");
  }

  function getDefaultState() {
    return {
      slotCount: 1,
      slots: [normalizeAstronautProfile(SAMPLE_CLOUD_ASTRONAUT_ELENA, 0)],
    };
  }

  function loadInitialState() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return getDefaultState();
      }
      var parsed = JSON.parse(raw);
      var count = Number(parsed.slotCount);
      if (!Number.isFinite(count) || count < MIN_SLOTS || count > MAX_SLOTS) {
        count = DEFAULT_SLOT_COUNT;
      }
      var incomingSlots = Array.isArray(parsed.slots) ? parsed.slots : [];
      var normalized = Array.from({ length: count }, function (_, idx) {
        var slot = incomingSlots[idx];
        return slot ? normalizeAstronautProfile(slot, idx) : null;
      });
      return {
        slotCount: count,
        slots: normalized,
      };
    } catch (_err) {
      return getDefaultState();
    }
  }

  function readAvatarFile(file) {
    return new Promise(function (resolve, reject) {
      if (!file) {
        resolve(null);
        return;
      }
      var reader = new FileReader();
      reader.onerror = function () {
        reject(new Error("Could not read selected image file."));
      };
      reader.onload = function (event) {
        var dataUrl = event.target.result;
        var img = new Image();
        img.onload = function () {
          try {
            var maxDim = 256;
            var scale = Math.min(1, maxDim / Math.max(img.width, img.height));
            var width = Math.max(1, Math.round(img.width * scale));
            var height = Math.max(1, Math.round(img.height * scale));
            var canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            var ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL("image/jpeg", 0.85));
          } catch (_canvasErr) {
            resolve(dataUrl);
          }
        };
        img.onerror = function () {
          resolve(dataUrl);
        };
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    });
  }

  function splitFullName(slotOrName) {
    if (!slotOrName) {
      return { firstName: "", lastName: "" };
    }
    if (typeof slotOrName === "string") {
      var parts = slotOrName.trim().split(/\s+/).filter(Boolean);
      return {
        firstName: parts[0] || "",
        lastName: parts.length > 1 ? parts.slice(1).join(" ") : "",
      };
    }
    if (slotOrName.firstName !== undefined || slotOrName.lastName !== undefined) {
      return {
        firstName: String(slotOrName.firstName || ""),
        lastName: String(slotOrName.lastName || ""),
      };
    }
    return splitFullName(slotOrName.name || "");
  }

  function getAstronautFullName(slot) {
    if (!slot) return "";
    var parts = splitFullName(slot);
    var combined = [parts.firstName.trim(), parts.lastName.trim()].filter(Boolean).join(" ");
    return combined || (slot.name ? String(slot.name).trim() : "");
  }

  function getInitials(slotOrName) {
    var parts = splitFullName(slotOrName);
    var first = parts.firstName.trim();
    var last = parts.lastName.trim();
    if (!first && !last) return "?";
    var firstInitial = first ? first.charAt(0) : "";
    var lastInitial = last ? last.charAt(0) : "";
    return (firstInitial + lastInitial).toUpperCase();
  }

  function AddAstronautModal(props) {
    var targetIndex = props.targetIndex;
    var onClose = props.onClose;
    var onSubmit = props.onSubmit;

    var _firstName = useState("");
    var firstName = _firstName[0];
    var setFirstName = _firstName[1];

    var _lastName = useState("");
    var lastName = _lastName[0];
    var setLastName = _lastName[1];

    var _crewRole = useState("Crew Member");
    var crewRole = _crewRole[0];
    var setCrewRole = _crewRole[1];

    var _dateOfBirth = useState("");
    var dateOfBirth = _dateOfBirth[0];
    var setDateOfBirth = _dateOfBirth[1];

    var _age = useState("");
    var age = _age[0];
    var setAge = _age[1];

    var _gender = useState("");
    var gender = _gender[0];
    var setGender = _gender[1];

    var _bloodType = useState("");
    var bloodType = _bloodType[0];
    var setBloodType = _bloodType[1];

    var _weightKg = useState("");
    var weightKg = _weightKg[0];
    var setWeightKg = _weightKg[1];

    var _heightCm = useState("");
    var heightCm = _heightCm[0];
    var setHeightCm = _heightCm[1];

    var _sittingHeightCm = useState("");
    var sittingHeightCm = _sittingHeightCm[0];
    var setSittingHeightCm = _sittingHeightCm[1];

    var _missionDay = useState("1");
    var missionDay = _missionDay[0];
    var setMissionDay = _missionDay[1];

    var _avatarUrl = useState(null);
    var avatarUrl = _avatarUrl[0];
    var setAvatarUrl = _avatarUrl[1];

    var _error = useState("");
    var error = _error[0];
    var setError = _error[1];

    function handleFileChange(e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      readAvatarFile(file)
        .then(function (dataUrl) {
          setAvatarUrl(dataUrl);
          setError("");
        })
        .catch(function (err) {
          setError(err.message);
        });
    }

    function handleSubmit(e) {
      e.preventDefault();
      var trimmedFirst = firstName.trim();
      var trimmedLast = lastName.trim();
      if (!trimmedFirst) {
        setError("Please enter the astronaut's name.");
        return;
      }
      var dayNum = parseInt(missionDay, 10);
      if (!Number.isFinite(dayNum) || dayNum < 1) {
        dayNum = 1;
      }
      var dobClean = dateOfBirth.trim();
      var parsedAge = parseInt(age, 10);
      var cleanAge =
        Number.isFinite(parsedAge) && parsedAge >= 1 && parsedAge <= 120
          ? parsedAge
          : dobClean
          ? calculateAgeFromDob(dobClean)
          : "";
      var parsedWeight = parseFloat(weightKg);
      var cleanWeight = Number.isFinite(parsedWeight) && parsedWeight >= 30 && parsedWeight <= 250 ? Number(parsedWeight.toFixed(1)) : "";
      var parsedHeight = parseFloat(heightCm);
      var cleanHeight = Number.isFinite(parsedHeight) && parsedHeight >= 100 && parsedHeight <= 250 ? Number(parsedHeight.toFixed(1)) : null;
      var parsedSittingHeight = parseFloat(sittingHeightCm);
      var cleanSittingHeight =
        Number.isFinite(parsedSittingHeight) && parsedSittingHeight >= 40 && parsedSittingHeight <= 150
          ? Number(parsedSittingHeight.toFixed(1))
          : null;
      var newId = "crew_" + Date.now();
      onSubmit(
        normalizeAstronautProfile(
          {
            id: newId,
            astronaut_id: newId,
            first_name: trimmedFirst,
            last_name: trimmedLast,
            date_of_birth: dobClean || (cleanAge ? deriveDobFromAge(cleanAge) : ""),
            sex: gender,
            crew_role: crewRole.trim() || "Crew Member",
            standing_height_cm: cleanHeight,
            sitting_height_cm: cleanSittingHeight,
            created_at: new Date().toISOString(),
            medical_baseline: {
              blood_type: bloodType || "O+",
              baseline_body_composition: { muscle_mass_kg: 48.2, body_fat_pct: 21.5 },
              bone_material_normal_density_g_cm2: 1.185,
              base_heart_rating_bpm: 62,
              base_blood_pressure: "115/75",
              base_ecg_results: "Normal sinus rhythm",
              max_oxygen_capacity_ml_kg_min: 49.5,
              immune_profile: { baseline_wbc: 6.1 },
              dental_records: { last_check: "2026-09-01", status: "Cleared" },
              updated_at: "2026-11-01T12:00:00Z",
            },
            medical_conditions: [],
            age: cleanAge,
            weightKg: cleanWeight,
            missionDay: dayNum,
            xp: 0,
            badges: ["Crew Registered"],
            avatarUrl: avatarUrl,
          },
          targetIndex
        )
      );
    }

    return h(
      "div",
      {
        className: "modal-backdrop",
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": "add-modal-title",
        onClick: function (e) {
          if (e.target === e.currentTarget) onClose();
        },
      },
      h(
        "div",
        { className: "modal-card" },
        h(
          "div",
          { className: "modal-header" },
          h(
            "h2",
            { id: "add-modal-title", className: "modal-title" },
            targetIndex !== null
              ? "Assign Crew — Slot " + (targetIndex + 1)
              : "Add Astronaut Profile"
          ),
          h(
            "button",
            {
              type: "button",
              className: "modal-close",
              "aria-label": "Close dialog",
              onClick: onClose,
            },
            "×"
          )
        ),
        h(
          "form",
          { onSubmit: handleSubmit },
          h(
            "div",
            { className: "form-grid-2" },
            h(
              "div",
              { className: "form-group" },
              h("label", { className: "field-label", htmlFor: "astro-first-name-input" }, "Name"),
              h("input", {
                id: "astro-first-name-input",
                type: "text",
                className: "text-input",
                placeholder: "Name",
                value: firstName,
                autoFocus: true,
                onChange: function (e) {
                  setFirstName(e.target.value);
                },
              })
            ),
            h(
              "div",
              { className: "form-group" },
              h("label", { className: "field-label", htmlFor: "astro-last-name-input" }, "Surname"),
              h("input", {
                id: "astro-last-name-input",
                type: "text",
                className: "text-input",
                placeholder: "Surname",
                value: lastName,
                onChange: function (e) {
                  setLastName(e.target.value);
                },
              })
            )
          ),
          h(
            "div",
            { className: "form-grid-2" },
            h(
              "div",
              { className: "form-group" },
              h("label", { className: "field-label", htmlFor: "astro-role-input" }, "Crew Role"),
              h("input", {
                id: "astro-role-input",
                type: "text",
                className: "text-input",
                placeholder: "e.g., Flight Engineer",
                value: crewRole,
                onChange: function (e) {
                  setCrewRole(e.target.value);
                },
              })
            ),
            h(
              "div",
              { className: "form-group" },
              h("label", { className: "field-label", htmlFor: "astro-dob-input" }, "Date of Birth"),
              h("input", {
                id: "astro-dob-input",
                type: "date",
                className: "text-input",
                value: dateOfBirth,
                onChange: function (e) {
                  var nextDob = e.target.value;
                  setDateOfBirth(nextDob);
                  var computed = calculateAgeFromDob(nextDob);
                  if (computed !== "") {
                    setAge(String(computed));
                  }
                },
              })
            ),
            h(
              "div",
              { className: "form-group" },
              h("label", { className: "field-label", htmlFor: "astro-age-input" }, "Age"),
              h("input", {
                id: "astro-age-input",
                type: "number",
                min: 1,
                max: 120,
                className: "text-input",
                placeholder: "e.g., 34",
                value: age,
                onChange: function (e) {
                  setAge(e.target.value);
                },
              })
            ),
            h(
              "div",
              { className: "form-group" },
              h("label", { className: "field-label", htmlFor: "astro-day-input" }, "Mission Day"),
              h("input", {
                id: "astro-day-input",
                type: "number",
                min: 1,
                className: "text-input",
                value: missionDay,
                onChange: function (e) {
                  setMissionDay(e.target.value);
                },
              })
            ),
            h(
              "div",
              { className: "form-group" },
              h("label", { className: "field-label", htmlFor: "astro-gender-select" }, "Sex"),
              h(
                "select",
                {
                  id: "astro-gender-select",
                  className: "text-input",
                  value: gender,
                  onChange: function (e) {
                    setGender(e.target.value);
                  },
                },
                GENDER_OPTIONS.map(function (opt) {
                  return h("option", { key: opt || "none", value: opt }, opt || "Select...");
                })
              )
            ),
            h(
              "div",
              { className: "form-group" },
              h("label", { className: "field-label", htmlFor: "astro-blood-select" }, "Blood Type"),
              h(
                "select",
                {
                  id: "astro-blood-select",
                  className: "text-input",
                  value: bloodType,
                  onChange: function (e) {
                    setBloodType(e.target.value);
                  },
                },
                BLOOD_TYPE_OPTIONS.map(function (opt) {
                  return h("option", { key: opt || "none", value: opt }, opt || "Select...");
                })
              )
            ),
            h(
              "div",
              { className: "form-group" },
              h("label", { className: "field-label", htmlFor: "astro-weight-input" }, "Weight (kg)"),
              h("input", {
                id: "astro-weight-input",
                type: "number",
                step: "0.1",
                min: 30,
                max: 250,
                className: "text-input",
                placeholder: "e.g., 72.5",
                value: weightKg,
                onChange: function (e) {
                  setWeightKg(e.target.value);
                },
              })
            ),
            h(
              "div",
              { className: "form-group" },
              h("label", { className: "field-label", htmlFor: "astro-height-input" }, "Standing Height (cm)"),
              h("input", {
                id: "astro-height-input",
                type: "number",
                step: "0.1",
                min: 100,
                max: 250,
                className: "text-input",
                placeholder: "e.g., 172.5",
                value: heightCm,
                onChange: function (e) {
                  setHeightCm(e.target.value);
                },
              })
            ),
            h(
              "div",
              { className: "form-group" },
              h("label", { className: "field-label", htmlFor: "astro-sitting-height-input" }, "Sitting Height (cm)"),
              h("input", {
                id: "astro-sitting-height-input",
                type: "number",
                step: "0.1",
                min: 40,
                max: 150,
                className: "text-input",
                placeholder: "e.g., 91.0",
                value: sittingHeightCm,
                onChange: function (e) {
                  setSittingHeightCm(e.target.value);
                },
              })
            )
          ),
          h(
            "div",
            { className: "form-group" },
            h("span", { className: "field-label" }, "Avatar Photo"),
            h(
              "div",
              { className: "avatar-upload-row" },
              h(
                "div",
                { className: "avatar-preview-circle" },
                avatarUrl
                  ? h("img", { src: avatarUrl, alt: "Avatar preview", className: "crew-avatar" })
                  : h(
                      "span",
                      { className: firstName.trim() || lastName.trim() ? "crew-initials" : undefined },
                      firstName.trim() || lastName.trim()
                        ? getInitials({ firstName: firstName, lastName: lastName })
                        : "IMG"
                    )
              ),
              h(
                "label",
                { className: "file-input-label" },
                "Import Photo",
                h("input", {
                  type: "file",
                  accept: "image/*",
                  className: "sr-only-input",
                  onChange: handleFileChange,
                })
              ),
              avatarUrl
                ? h(
                    "button",
                    {
                      type: "button",
                      className: "btn-danger",
                      onClick: function () {
                        setAvatarUrl(null);
                      },
                    },
                    "Remove"
                  )
                : null
            )
          ),
          error ? h("p", { className: "form-error" }, error) : null,
          h(
            "div",
            { className: "modal-actions" },
            h("button", { type: "button", className: "btn-secondary", onClick: onClose }, "Cancel"),
            h("button", { type: "submit", className: "btn-primary" }, "Save Astronaut")
          )
        )
      )
    );
  }

  function LoginScreen(props) {
    var slots = props.slots;
    var onSelectAstronaut = props.onSelectAstronaut;
    var onOpenAddModal = props.onOpenAddModal;
    var onOpenSetup = props.onOpenSetup;

    return h(
      "main",
      { className: "login-page" },
      h(
        "div",
        { className: "login-container" },
        h("h1", { className: "system-title" }, "ASTRONAUT HEALTH SYSTEM"),
        h(
          "div",
          { className: "crew-grid", role: "list", "aria-label": "Astronaut Profiles" },
          slots.map(function (astro, idx) {
            var isEmpty = !astro;
            var fullName = astro ? getAstronautFullName(astro) : "";
            return h(
              "div",
              { key: astro ? astro.id + "-" + idx : "empty-" + idx, className: "crew-slot", role: "listitem" },
              h(
                "button",
                {
                  type: "button",
                  className: isEmpty ? "crew-circle crew-circle--empty" : "crew-circle",
                  "aria-label": isEmpty
                    ? "Assign astronaut to slot " + (idx + 1)
                    : "Open dashboard for " + fullName,
                  onClick: function () {
                    if (isEmpty) {
                      onOpenAddModal(idx);
                    } else {
                      onSelectAstronaut(astro, idx);
                    }
                  },
                },
                astro
                  ? astro.avatarUrl
                    ? h("img", {
                        src: astro.avatarUrl,
                        alt: fullName,
                        className: "crew-avatar",
                      })
                    : h("span", { className: "crew-initials" }, getInitials(astro))
                  : null
              ),
              h(
                "span",
                {
                  className: isEmpty ? "crew-name crew-name--muted" : "crew-name",
                  title: isEmpty ? "Empty Slot" : fullName,
                },
                isEmpty ? "Empty Slot" : fullName
              )
            );
          }),
          h(
            "div",
            { key: "add-slot", className: "crew-slot", role: "listitem" },
            h(
              "button",
              {
                type: "button",
                className: "crew-circle",
                "aria-label": "Add new astronaut profile",
                onClick: function () {
                  onOpenAddModal(null);
                },
              },
              h("span", { className: "plus-icon", "aria-hidden": "true" }, "+")
            ),
            h("span", { className: "crew-name", "aria-hidden": "true" }, "\u00A0")
          )
        ),
        h(
          "button",
          {
            type: "button",
            className: "setup-btn",
            onClick: onOpenSetup,
          },
          "SETUP"
        )
      )
    );
  }

  function SetupScreen(props) {
    var initialSlotCount = props.slotCount;
    var initialSlots = props.slots;
    var onSave = props.onSave;
    var onCancel = props.onCancel;

    var _slotCount = useState(initialSlotCount);
    var slotCount = _slotCount[0];
    var setSlotCount = _slotCount[1];

    var _draftSlots = useState(function () {
      return initialSlots.map(function (item, idx) {
        return item ? normalizeAstronautProfile(item, idx) : null;
      });
    });
    var draftSlots = _draftSlots[0];
    var setDraftSlots = _draftSlots[1];

    var _expandedSlotIdx = useState(null);
    var expandedSlotIdx = _expandedSlotIdx[0];
    var setExpandedSlotIdx = _expandedSlotIdx[1];

    var _cloudConfig = useState(loadCloudConfig);
    var cloudConfig = _cloudConfig[0];
    var setCloudConfig = _cloudConfig[1];

    var _cloudStatus = useState(function () {
      var initialCfg = loadCloudConfig();
      return initialCfg.autoConnect !== false
        ? 'Auto-Connect Active: Google Cloud "' +
            (initialCfg.projectName || "My First Project") +
            '" (' +
            (initialCfg.projectId || "my-first-project") +
            ") — Firestore " +
            (initialCfg.databaseId || "(default)") +
            " / " +
            (initialCfg.containerName || "AstronautProfiles")
        : "Manual Firestore sync mode.";
    });
    var cloudStatus = _cloudStatus[0];
    var setCloudStatus = _cloudStatus[1];

    useEffect(function () {
      var active = true;
      if (cloudConfig.autoConnect === false) {
        return function () {
          active = false;
        };
      }
      AHSCloudService.fetchProfiles(cloudConfig)
        .then(function (fetched) {
          if (!active || !fetched || fetched.length === 0) return;
          setDraftSlots(function (prev) {
            var nextCount = Math.min(MAX_SLOTS, Math.max(fetched.length, prev.length));
            setSlotCount(nextCount);
            return Array.from({ length: nextCount }, function (_, idx) {
              return fetched[idx] || prev[idx] || null;
            });
          });
          setCloudStatus(
            "Auto-connected to Firestore (" +
              (cloudConfig.projectName || "My First Project") +
              " / " +
              (cloudConfig.containerName || "AstronautProfiles") +
              "): loaded " +
              fetched.length +
              " document(s)."
          );
        })
        .catch(function (err) {
          if (!active) return;
          setCloudStatus(
            'Auto-Connect active for "' +
              (cloudConfig.projectName || "My First Project") +
              '" (' +
              (cloudConfig.projectId || "my-first-project") +
              "): " +
              err.message
          );
        });
      return function () {
        active = false;
      };
    }, []);

    var _cloudJsonOpen = useState(false);
    var cloudJsonOpen = _cloudJsonOpen[0];
    var setCloudJsonOpen = _cloudJsonOpen[1];

    var _notice = useState("");
    var notice = _notice[0];
    var setNotice = _notice[1];

    function updateSlotCount(nextRaw) {
      var clamped = Math.max(MIN_SLOTS, Math.min(MAX_SLOTS, nextRaw));
      setSlotCount(clamped);
      setDraftSlots(function (prev) {
        return Array.from({ length: clamped }, function (_, idx) {
          return prev[idx] || null;
        });
      });
    }

    function updateSlotField(idx, patch) {
      setDraftSlots(function (prev) {
        return prev.map(function (slot, i) {
          if (i !== idx) return slot;
          var base =
            slot ||
            normalizeAstronautProfile(
              {
                id: "crew_" + (idx + 1),
                astronaut_id: "crew_" + (idx + 1),
                first_name: "",
                last_name: "",
                crew_role: "Crew Member",
                missionDay: 1,
                xp: 0,
                badges: ["Crew Registered"],
                avatarUrl: null,
              },
              idx
            );
          var next = Object.assign({}, base, patch);
          if (patch.firstName !== undefined) next.first_name = patch.firstName;
          if (patch.first_name !== undefined) next.firstName = patch.first_name;
          if (patch.lastName !== undefined) next.last_name = patch.lastName;
          if (patch.last_name !== undefined) next.lastName = patch.last_name;
          if (patch.gender !== undefined) next.sex = patch.gender;
          if (patch.sex !== undefined) next.gender = patch.sex;
          if (patch.bloodType !== undefined) {
            next.medical_baseline = Object.assign({}, next.medical_baseline || {}, {
              blood_type: patch.bloodType,
              updated_at: new Date().toISOString(),
            });
          }
          if (patch.date_of_birth !== undefined) {
            var dobAge = calculateAgeFromDob(patch.date_of_birth);
            if (dobAge !== "") next.age = dobAge;
          }
          if (patch.standing_height_cm !== undefined) {
            next.heightCm = patch.standing_height_cm !== null && patch.standing_height_cm !== "" ? patch.standing_height_cm : "";
          }
          if (patch.firstName !== undefined || patch.lastName !== undefined || patch.first_name !== undefined || patch.last_name !== undefined) {
            next.name = [String(next.firstName || "").trim(), String(next.lastName || "").trim()]
              .filter(Boolean)
              .join(" ");
          }
          return next;
        });
      });
    }

    function updateCloudField(patch) {
      setCloudConfig(function (prev) {
        var next = Object.assign({}, prev, patch);
        saveCloudConfig(next);
        return next;
      });
    }

    function handleLoadSampleCloudElena() {
      var elena = normalizeAstronautProfile(SAMPLE_CLOUD_ASTRONAUT_ELENA, 0);
      setDraftSlots(function (prev) {
        var existingIdx = prev.findIndex(function (s) {
          return s && s.astronaut_id === elena.astronaut_id;
        });
        if (existingIdx !== -1) {
          return prev.map(function (s, i) {
            return i === existingIdx ? elena : s;
          });
        }
        var emptyIdx = prev.findIndex(function (s) {
          return !s;
        });
        if (emptyIdx !== -1) {
          return prev.map(function (s, i) {
            return i === emptyIdx ? elena : s;
          });
        }
        if (prev.length < MAX_SLOTS) {
          var nextArr = prev.concat([elena]);
          setSlotCount(nextArr.length);
          return nextArr;
        }
        return [elena].concat(prev.slice(1));
      });
      setCloudStatus("Loaded AstronautProfiles sample document crew_1 (Elena Rostova) into draft slots.");
    }

    function handleDownloadContainerJson() {
      var docs = AHSCloudService.exportContainerDocuments(draftSlots);
      if (docs.length === 0) {
        docs = [SAMPLE_CLOUD_ASTRONAUT_ELENA];
      }
      downloadTxtFile("AstronautProfiles.json", JSON.stringify(docs, null, 2));
      setCloudStatus("Downloaded AstronautProfiles.json (" + docs.length + " document(s)).");
    }

    function handlePullFromCloud() {
      setCloudStatus("Pulling AstronautProfiles from Google Cloud...");
      AHSCloudService.fetchProfiles(cloudConfig)
        .then(function (fetched) {
          if (!fetched || fetched.length === 0) {
            setCloudStatus("Connected to Google Cloud: AstronautProfiles container returned 0 documents.");
            return;
          }
          var clamped = Math.min(MAX_SLOTS, Math.max(fetched.length, slotCount));
          var nextSlots = Array.from({ length: clamped }, function (_, idx) {
            return fetched[idx] || draftSlots[idx] || null;
          });
          setSlotCount(clamped);
          setDraftSlots(nextSlots);
          setCloudStatus("Pulled " + fetched.length + " AstronautProfiles document(s) from Google Cloud.");
        })
        .catch(function (err) {
          setCloudStatus(err.message);
        });
    }

    function handlePushToCloud() {
      setCloudStatus("Syncing AstronautProfiles documents to Google Cloud...");
      AHSCloudService.syncAllProfiles(cloudConfig, draftSlots)
        .then(function (results) {
          setCloudStatus("Synced " + results.length + " AstronautProfiles document(s) to Google Cloud.");
        })
        .catch(function (err) {
          setCloudStatus(err.message);
        });
    }

    function clearSlot(idx) {
      if (expandedSlotIdx === idx) setExpandedSlotIdx(null);
      setDraftSlots(function (prev) {
        return prev.map(function (slot, i) {
          return i === idx ? null : slot;
        });
      });
    }

    function handleAvatarUpload(idx, file) {
      if (!file) return;
      readAvatarFile(file)
        .then(function (dataUrl) {
          var existing = draftSlots[idx];
          var existingFull = existing ? getAstronautFullName(existing) : "";
          var existingSplit = existing ? splitFullName(existing) : { firstName: "", lastName: "" };
          updateSlotField(idx, {
            firstName: existingFull ? existingSplit.firstName : "Astronaut",
            lastName: existingFull ? existingSplit.lastName : String(idx + 1),
            name: existingFull || "Astronaut " + (idx + 1),
            avatarUrl: dataUrl,
          });
          setNotice("");
        })
        .catch(function (err) {
          setNotice(err.message);
        });
    }

    function handleResetDefaults() {
      var def = getDefaultState();
      setSlotCount(def.slotCount);
      setDraftSlots(def.slots);
      setNotice("Reset draft to default (0 astronaut slots).");
    }

    function handleSave() {
      var cleaned = draftSlots.map(function (slot, idx) {
        if (!slot) return null;
        var split = splitFullName(slot);
        var cleanFirst = split.firstName.trim();
        var cleanLast = split.lastName.trim();
        var cleanName = [cleanFirst, cleanLast].filter(Boolean).join(" ");
        if (!cleanName && !slot.avatarUrl) {
          return null;
        }
        var parsedAge = parseInt(slot.age, 10);
        var parsedWeight = parseFloat(slot.weightKg);
        var cleanWeight = Number.isFinite(parsedWeight) && parsedWeight >= 30 && parsedWeight <= 250 ? Number(parsedWeight.toFixed(1)) : "";
        return normalizeAstronautProfile(
          Object.assign({}, slot, {
            first_name: cleanFirst || "Astronaut",
            last_name: cleanLast,
            firstName: cleanFirst || "Astronaut",
            lastName: cleanLast,
            name: cleanName || "Astronaut",
            age: Number.isFinite(parsedAge) && parsedAge >= 1 && parsedAge <= 120 ? parsedAge : "",
            weightKg: cleanWeight,
            missionDay: Math.max(1, parseInt(slot.missionDay, 10) || 1),
          }),
          idx
        );
      });
      if (cloudConfig.autoConnect !== false && cleaned.some(Boolean)) {
        AHSCloudService.syncAllProfiles(cloudConfig, cleaned).catch(function () {});
      }
      onSave(slotCount, cleaned);
    }

    return h(
      "main",
      { className: "setup-page" },
      h(
        "div",
        { className: "setup-container" },
        h(
          "div",
          { className: "setup-header" },
          h("h1", { className: "setup-title" }, "CREW & SYSTEM SETUP"),
          h(
            "div",
            { className: "setup-header-actions" },
            h(
              "button",
              { type: "button", className: "btn-secondary", onClick: handleResetDefaults },
              "Reset Defaults"
            ),
            h("button", { type: "button", className: "btn-secondary", onClick: onCancel }, "Cancel"),
            h("button", { type: "button", className: "btn-primary", onClick: handleSave }, "Save & Return")
          )
        ),
        h(
          "div",
          { className: "slot-config-bar" },
          h(
            "div",
            { className: "slot-config-info" },
            h("h2", null, "CREW MEMBERS MANAGEMENT"),
            h(
              "p",
              null,
              "You can manage the number of crew members using the counter."
            )
          ),
          h(
            "div",
            { className: "slot-stepper" },
            h(
              "button",
              {
                type: "button",
                className: "stepper-btn",
                "aria-label": "Decrease slot count",
                disabled: slotCount <= MIN_SLOTS,
                onClick: function () {
                  updateSlotCount(slotCount - 1);
                },
              },
              "-"
            ),
            h("input", {
              type: "number",
              min: MIN_SLOTS,
              max: MAX_SLOTS,
              className: "stepper-input",
              "aria-label": "Number of astronaut slots",
              value: slotCount,
              onChange: function (e) {
                var val = parseInt(e.target.value, 10);
                if (Number.isFinite(val)) {
                  updateSlotCount(val);
                }
              },
            }),
            h(
              "button",
              {
                type: "button",
                className: "stepper-btn",
                "aria-label": "Increase slot count",
                disabled: slotCount >= MAX_SLOTS,
                onClick: function () {
                  updateSlotCount(slotCount + 1);
                },
              },
              "+"
            )
          )
        ),
        notice ? h("p", { className: "muted-subtext", style: { marginBottom: "1rem" } }, notice) : null,
        h(
          "div",
          { className: "setup-slot-list" },
          draftSlots.length === 0
            ? h(
                "div",
                { className: "panel-box", style: { textAlign: "center" } },
                h(
                  "p",
                  { className: "muted-subtext", style: { margin: 0 } },
                  "0 astronaut slots configured. Only the '+' button is shown on the login screen. Use '+' above to add crew slots."
                )
              )
            : draftSlots.map(function (slot, idx) {
            var split = slot ? splitFullName(slot) : { firstName: "", lastName: "" };
            var firstVal = slot ? (slot.firstName !== undefined ? slot.firstName : split.firstName) : "";
            var lastVal = slot ? (slot.lastName !== undefined ? slot.lastName : split.lastName) : "";
            var nameVal = slot ? getAstronautFullName(slot) : "";
            var ageVal = slot && slot.age !== undefined && slot.age !== null ? String(slot.age) : "";
            var genderVal = slot ? slot.sex || slot.gender || "" : "";
            var bloodVal = slot
              ? (slot.medical_baseline && slot.medical_baseline.blood_type) || slot.bloodType || ""
              : "";
            var dayVal = slot ? slot.missionDay : 1;
            var avatar = slot ? slot.avatarUrl : null;
            var isExpanded = Boolean(slot && expandedSlotIdx === idx);
            var baseline = (slot && slot.medical_baseline) || {};
            var bodyComp = baseline.baseline_body_composition || {};
            var immuneProf = baseline.immune_profile || {};
            var dentalRec = baseline.dental_records || {};
            var conditionsList = (slot && Array.isArray(slot.medical_conditions) && slot.medical_conditions) || [];

            function updateBaselineField(bPatch) {
              var nextBaseline = Object.assign({}, baseline, bPatch, {
                updated_at: new Date().toISOString(),
              });
              updateSlotField(idx, {
                medical_baseline: nextBaseline,
                bloodType: nextBaseline.blood_type !== undefined ? nextBaseline.blood_type : bloodVal,
              });
            }

            return h(
              "div",
              { key: idx, className: "setup-slot-card" },
              h(
                "div",
                { className: "setup-slot-row" },
                h("div", { className: "slot-index" }, "Slot " + (idx + 1)),
                h(
                  "div",
                  { className: "avatar-preview-circle" },
                  avatar
                    ? h("img", { src: avatar, alt: nameVal || "Slot " + (idx + 1), className: "crew-avatar" })
                    : h(
                        "span",
                        { className: nameVal ? "crew-initials" : undefined },
                        nameVal ? getInitials(slot) : "EMPTY"
                      )
                ),
                h(
                  "div",
                  null,
                  h("label", { className: "field-label", htmlFor: "slot-first-name-" + idx }, "Name"),
                  h("input", {
                    id: "slot-first-name-" + idx,
                    type: "text",
                    className: "text-input",
                    placeholder: "Name",
                    value: firstVal,
                    onChange: function (e) {
                      updateSlotField(idx, { firstName: e.target.value, lastName: lastVal });
                    },
                  })
                ),
                h(
                  "div",
                  null,
                  h("label", { className: "field-label", htmlFor: "slot-last-name-" + idx }, "Surname"),
                  h("input", {
                    id: "slot-last-name-" + idx,
                    type: "text",
                    className: "text-input",
                    placeholder: "Surname",
                    value: lastVal,
                    onChange: function (e) {
                      updateSlotField(idx, { lastName: e.target.value, firstName: firstVal });
                    },
                  })
                ),
                h(
                  "div",
                  null,
                  h("label", { className: "field-label", htmlFor: "slot-age-" + idx }, "Age"),
                  h("input", {
                    id: "slot-age-" + idx,
                    type: "number",
                    min: 1,
                    max: 120,
                    className: "text-input",
                    placeholder: "—",
                    value: ageVal,
                    disabled: !slot,
                    onChange: function (e) {
                      updateSlotField(idx, { age: e.target.value });
                    },
                  })
                ),
                h(
                  "div",
                  null,
                  h("label", { className: "field-label", htmlFor: "slot-gender-" + idx }, "Sex"),
                  h(
                    "select",
                    {
                      id: "slot-gender-" + idx,
                      className: "text-input",
                      value: genderVal,
                      disabled: !slot,
                      onChange: function (e) {
                        updateSlotField(idx, { gender: e.target.value, sex: e.target.value });
                      },
                    },
                    GENDER_OPTIONS.map(function (opt) {
                      return h("option", { key: opt || "none", value: opt }, opt || "—");
                    })
                  )
                ),
                h(
                  "div",
                  null,
                  h("label", { className: "field-label", htmlFor: "slot-blood-" + idx }, "Blood Type"),
                  h(
                    "select",
                    {
                      id: "slot-blood-" + idx,
                      className: "text-input",
                      value: bloodVal,
                      disabled: !slot,
                      onChange: function (e) {
                        updateSlotField(idx, { bloodType: e.target.value });
                      },
                    },
                    BLOOD_TYPE_OPTIONS.map(function (opt) {
                      return h("option", { key: opt || "none", value: opt }, opt || "—");
                    })
                  )
                ),
                h(
                  "div",
                  null,
                  h("label", { className: "field-label", htmlFor: "slot-day-" + idx }, "Mission Day"),
                  h("input", {
                    id: "slot-day-" + idx,
                    type: "number",
                    min: 1,
                    className: "text-input",
                    value: dayVal,
                    disabled: !slot,
                    onChange: function (e) {
                      updateSlotField(idx, { missionDay: parseInt(e.target.value, 10) || 1 });
                    },
                  })
                ),
                h(
                  "div",
                  { className: "slot-row-actions" },
                  h(
                    "label",
                    { className: "file-input-label" },
                    "Import Photo",
                    h("input", {
                      type: "file",
                      accept: "image/*",
                      className: "sr-only-input",
                      onChange: function (e) {
                        var file = e.target.files && e.target.files[0];
                        handleAvatarUpload(idx, file);
                        e.target.value = "";
                      },
                    })
                  ),
                  avatar
                    ? h(
                        "button",
                        {
                          type: "button",
                          className: "btn-secondary btn-small",
                          onClick: function () {
                            updateSlotField(idx, { avatarUrl: null });
                          },
                        },
                        "Remove Photo"
                      )
                    : null,
                  slot
                    ? h(
                        "button",
                        {
                          type: "button",
                          className: "btn-secondary btn-small",
                          onClick: function () {
                            setExpandedSlotIdx(isExpanded ? null : idx);
                          },
                        },
                        isExpanded ? "Hide Schema" : "Cloud Schema"
                      )
                    : null,
                  slot
                    ? h(
                        "button",
                        {
                          type: "button",
                          className: "btn-danger",
                          onClick: function () {
                            clearSlot(idx);
                          },
                        },
                        "Clear"
                      )
                    : null
                )
              ),
              isExpanded
                ? h(
                    "div",
                    { className: "slot-schema-drawer" },
                    h(
                      "div",
                      { className: "slot-schema-grid" },
                      h(
                        "div",
                        null,
                        h("label", { className: "field-label" }, "Astronaut ID"),
                        h("input", {
                          type: "text",
                          className: "text-input",
                          value: slot.astronaut_id || slot.id || "",
                          onChange: function (e) {
                            updateSlotField(idx, { id: e.target.value, astronaut_id: e.target.value });
                          },
                        })
                      ),
                      h(
                        "div",
                        null,
                        h("label", { className: "field-label" }, "Crew Role"),
                        h("input", {
                          type: "text",
                          className: "text-input",
                          value: slot.crew_role || "",
                          onChange: function (e) {
                            updateSlotField(idx, { crew_role: e.target.value });
                          },
                        })
                      ),
                      h(
                        "div",
                        null,
                        h("label", { className: "field-label" }, "Date of Birth"),
                        h("input", {
                          type: "date",
                          className: "text-input",
                          value: slot.date_of_birth || "",
                          onChange: function (e) {
                            updateSlotField(idx, { date_of_birth: e.target.value });
                          },
                        })
                      ),
                      h(
                        "div",
                        null,
                        h("label", { className: "field-label" }, "Standing Height (cm)"),
                        h("input", {
                          type: "number",
                          step: "0.1",
                          className: "text-input",
                          value: slot.standing_height_cm !== null && slot.standing_height_cm !== undefined ? slot.standing_height_cm : "",
                          onChange: function (e) {
                            var v = e.target.value;
                            updateSlotField(idx, { standing_height_cm: v === "" ? null : Number(v) });
                          },
                        })
                      ),
                      h(
                        "div",
                        null,
                        h("label", { className: "field-label" }, "Sitting Height (cm)"),
                        h("input", {
                          type: "number",
                          step: "0.1",
                          className: "text-input",
                          value: slot.sitting_height_cm !== null && slot.sitting_height_cm !== undefined ? slot.sitting_height_cm : "",
                          onChange: function (e) {
                            var v = e.target.value;
                            updateSlotField(idx, { sitting_height_cm: v === "" ? null : Number(v) });
                          },
                        })
                      ),
                      h(
                        "div",
                        null,
                        h("label", { className: "field-label" }, "Base HR (bpm)"),
                        h("input", {
                          type: "number",
                          className: "text-input",
                          value: baseline.base_heart_rating_bpm !== null && baseline.base_heart_rating_bpm !== undefined ? baseline.base_heart_rating_bpm : "",
                          onChange: function (e) {
                            var v = e.target.value;
                            updateBaselineField({ base_heart_rating_bpm: v === "" ? null : Number(v) });
                          },
                        })
                      ),
                      h(
                        "div",
                        null,
                        h("label", { className: "field-label" }, "Base Blood Pressure"),
                        h("input", {
                          type: "text",
                          className: "text-input",
                          placeholder: "e.g., 115/75",
                          value: baseline.base_blood_pressure || "",
                          onChange: function (e) {
                            updateBaselineField({ base_blood_pressure: e.target.value });
                          },
                        })
                      ),
                      h(
                        "div",
                        null,
                        h("label", { className: "field-label" }, "BMD Normal (g/cm²)"),
                        h("input", {
                          type: "number",
                          step: "0.001",
                          className: "text-input",
                          value: baseline.bone_material_normal_density_g_cm2 !== null && baseline.bone_material_normal_density_g_cm2 !== undefined ? baseline.bone_material_normal_density_g_cm2 : "",
                          onChange: function (e) {
                            var v = e.target.value;
                            updateBaselineField({ bone_material_normal_density_g_cm2: v === "" ? null : Number(v) });
                          },
                        })
                      ),
                      h(
                        "div",
                        null,
                        h("label", { className: "field-label" }, "VO2 Max (ml/kg/min)"),
                        h("input", {
                          type: "number",
                          step: "0.1",
                          className: "text-input",
                          value: baseline.max_oxygen_capacity_ml_kg_min !== null && baseline.max_oxygen_capacity_ml_kg_min !== undefined ? baseline.max_oxygen_capacity_ml_kg_min : "",
                          onChange: function (e) {
                            var v = e.target.value;
                            updateBaselineField({ max_oxygen_capacity_ml_kg_min: v === "" ? null : Number(v) });
                          },
                        })
                      ),
                      h(
                        "div",
                        null,
                        h("label", { className: "field-label" }, "Base ECG Result"),
                        h("input", {
                          type: "text",
                          className: "text-input",
                          value: baseline.base_ecg_results || "",
                          onChange: function (e) {
                            updateBaselineField({ base_ecg_results: e.target.value });
                          },
                        })
                      ),
                      h(
                        "div",
                        null,
                        h("label", { className: "field-label" }, "Baseline WBC"),
                        h("input", {
                          type: "number",
                          step: "0.1",
                          className: "text-input",
                          value: immuneProf.baseline_wbc !== null && immuneProf.baseline_wbc !== undefined ? immuneProf.baseline_wbc : "",
                          onChange: function (e) {
                            var v = e.target.value;
                            updateBaselineField({
                              immune_profile: { baseline_wbc: v === "" ? null : Number(v) },
                            });
                          },
                        })
                      ),
                      h(
                        "div",
                        null,
                        h("label", { className: "field-label" }, "Dental Status / Date"),
                        h("input", {
                          type: "text",
                          className: "text-input",
                          placeholder: "Cleared (2026-09-01)",
                          value: (dentalRec.status || "") + (dentalRec.last_check ? " (" + dentalRec.last_check + ")" : ""),
                          onChange: function (e) {
                            var raw = e.target.value;
                            var match = raw.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
                            updateBaselineField({
                              dental_records: match
                                ? { status: match[1].trim(), last_check: match[2].trim() }
                                : { status: raw, last_check: dentalRec.last_check || "" },
                            });
                          },
                        })
                      )
                    ),
                    h(
                      "div",
                      { className: "slot-conditions-block" },
                      h(
                        "div",
                        { className: "slot-conditions-head" },
                        h("span", { className: "field-label", style: { marginBottom: 0 } }, "Medical Conditions (" + conditionsList.length + ")"),
                        h(
                          "button",
                          {
                            type: "button",
                            className: "btn-secondary btn-small",
                            onClick: function () {
                              updateSlotField(idx, {
                                _conditionsEdited: true,
                                medical_conditions: conditionsList.concat([
                                  { condition_type: "Allergy", condition_name: "", notes: "" },
                                ]),
                              });
                            },
                          },
                          "+ Add Condition"
                        )
                      ),
                      conditionsList.map(function (cond, cIdx) {
                        return h(
                          "div",
                          { key: cIdx, className: "slot-condition-row" },
                          h("input", {
                            type: "text",
                            className: "text-input",
                            placeholder: "Type (e.g., Allergy)",
                            value: cond.condition_type || "",
                            onChange: function (e) {
                              var nextConds = conditionsList.map(function (c, j) {
                                return j === cIdx ? Object.assign({}, c, { condition_type: e.target.value }) : c;
                              });
                              updateSlotField(idx, { _conditionsEdited: true, medical_conditions: nextConds });
                            },
                          }),
                          h("input", {
                            type: "text",
                            className: "text-input",
                            placeholder: "Name (e.g., Penicillin)",
                            value: cond.condition_name || "",
                            onChange: function (e) {
                              var nextConds = conditionsList.map(function (c, j) {
                                return j === cIdx ? Object.assign({}, c, { condition_name: e.target.value }) : c;
                              });
                              updateSlotField(idx, { _conditionsEdited: true, medical_conditions: nextConds });
                            },
                          }),
                          h("input", {
                            type: "text",
                            className: "text-input",
                            placeholder: "Notes",
                            value: cond.notes || "",
                            onChange: function (e) {
                              var nextConds = conditionsList.map(function (c, j) {
                                return j === cIdx ? Object.assign({}, c, { notes: e.target.value }) : c;
                              });
                              updateSlotField(idx, { _conditionsEdited: true, medical_conditions: nextConds });
                            },
                          }),
                          h(
                            "button",
                            {
                              type: "button",
                              className: "btn-danger",
                              onClick: function () {
                                var nextConds = conditionsList.filter(function (_, j) {
                                  return j !== cIdx;
                                });
                                updateSlotField(idx, { _conditionsEdited: true, medical_conditions: nextConds });
                              },
                            },
                            "Remove"
                          )
                        );
                      })
                    )
                  )
                : null
            );
          })
        ),
        h(
          "section",
          { className: "gcloud-panel", "aria-label": "Google Cloud AstronautProfiles Container" },
          h(
            "div",
            { className: "gcloud-panel-header" },
            h(
              "div",
              null,
              h("h2", { className: "gcloud-panel-title" }, "GOOGLE CLOUD FIRESTORE — My First Project (AstronautProfiles)"),
              h(
                "p",
                { className: "gcloud-panel-subtitle" },
                "Automatic Firestore connection enabled (1 document = 1 astronaut)."
              )
            ),
            h(
              "button",
              {
                type: "button",
                className: "btn-secondary btn-small",
                onClick: function () {
                  setCloudJsonOpen(function (v) {
                    return !v;
                  });
                },
              },
              cloudJsonOpen ? "Hide JSON Preview" : "Show JSON Preview"
            )
          ),
          h(
            "div",
            { className: "gcloud-grid" },
            h(
              "div",
              null,
              h("label", { className: "field-label", htmlFor: "gc-project-id" }, "Google Cloud Project ID"),
              h("input", {
                id: "gc-project-id",
                type: "text",
                className: "text-input",
                placeholder: "e.g., my-first-project",
                value: cloudConfig.projectId || "",
                onChange: function (e) {
                  updateCloudField({ projectId: e.target.value });
                },
              })
            ),
            h(
              "div",
              null,
              h("label", { className: "field-label", htmlFor: "gc-db-id" }, "Firestore Database / Container"),
              h("input", {
                id: "gc-db-id",
                type: "text",
                className: "text-input",
                value: (cloudConfig.databaseId || "(default)") + " / " + (cloudConfig.containerName || "AstronautProfiles"),
                onChange: function (e) {
                  var parts = e.target.value.split("/");
                  updateCloudField({
                    databaseId: (parts[0] || "(default)").trim(),
                    containerName: (parts[1] || "AstronautProfiles").trim(),
                  });
                },
              })
            ),
            h(
              "div",
              null,
              h("label", { className: "field-label", htmlFor: "gc-endpoint-url" }, "Cloud Run / Custom Endpoint URL (Optional)"),
              h("input", {
                id: "gc-endpoint-url",
                type: "url",
                className: "text-input",
                placeholder: "https://.../AstronautProfiles",
                value: cloudConfig.endpointUrl || "",
                onChange: function (e) {
                  updateCloudField({ endpointUrl: e.target.value });
                },
              })
            ),
            h(
              "div",
              null,
              h("label", { className: "field-label", htmlFor: "gc-api-key" }, "API Key / OAuth Bearer Token (Optional)"),
              h("input", {
                id: "gc-api-key",
                type: "password",
                className: "text-input",
                placeholder: "Web API Key or ya29... token",
                value: cloudConfig.apiKey || "",
                onChange: function (e) {
                  updateCloudField({ apiKey: e.target.value });
                },
              })
            )
          ),
          h(
            "div",
            { className: "gcloud-actions" },
            h(
              "label",
              {
                className: "field-label",
                style: {
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.45rem",
                  marginBottom: 0,
                  cursor: "pointer",
                  marginRight: "0.5rem",
                },
              },
              h("input", {
                type: "checkbox",
                checked: cloudConfig.autoConnect !== false,
                onChange: function (e) {
                  var enabled = e.target.checked;
                  updateCloudField({ autoConnect: enabled });
                  setCloudStatus(
                    enabled
                      ? 'Auto-Connect Active: Google Cloud "' +
                          (cloudConfig.projectName || "My First Project") +
                          '" (' +
                          (cloudConfig.projectId || "my-first-project") +
                          ")"
                      : "Manual Firestore sync mode."
                  );
                },
              }),
              "Auto-Connect & Auto-Sync"
            ),
            h(
              "button",
              { type: "button", className: "btn-secondary", onClick: handleLoadSampleCloudElena },
              "Load Sample Document (crew_1: Elena Rostova)"
            ),
            h(
              "button",
              { type: "button", className: "btn-secondary", onClick: handleDownloadContainerJson },
              "Download AstronautProfiles.json"
            ),
            h(
              "button",
              { type: "button", className: "btn-secondary", onClick: handlePullFromCloud },
              "Pull from Google Cloud"
            ),
            h(
              "button",
              { type: "button", className: "btn-primary", onClick: handlePushToCloud },
              "Sync to Google Cloud"
            )
          ),
          cloudStatus ? h("p", { className: "gcloud-status" }, cloudStatus) : null,
          cloudJsonOpen
            ? h(
                "pre",
                { className: "gcloud-json-preview" },
                JSON.stringify(
                  AHSCloudService.exportContainerDocuments(draftSlots).length > 0
                    ? AHSCloudService.exportContainerDocuments(draftSlots)
                    : [SAMPLE_CLOUD_ASTRONAUT_ELENA],
                  null,
                  2
                )
              )
            : null
        )
      )
    );
  }

  function formatHeaderTimestamp(dateObj) {
    var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    var hours = String(dateObj.getHours()).padStart(2, "0");
    var mins = String(dateObj.getMinutes()).padStart(2, "0");
    var day = dateObj.getDate();
    var month = months[dateObj.getMonth()];
    var year = dateObj.getFullYear();
    return hours + ":" + mins + " | " + day + " " + month + " " + year;
  }

  function resolvePositiveNumber(rawVal, fallback) {
    if (rawVal === "" || rawVal === null || rawVal === undefined) return fallback;
    var num = Number(rawVal);
    return Number.isFinite(num) && num > 0 ? num : fallback;
  }

  function getAstronautSampleData(astronaut, slotIndex) {
    var offset = (slotIndex || 0) % 5;
    var baseline = (astronaut && astronaut.medical_baseline) || {};
    var bodyComp = baseline.baseline_body_composition || {};
    var immuneProf = baseline.immune_profile || {};
    var dentalRec = baseline.dental_records || {};
    var bloodTypeVal = baseline.blood_type || (astronaut && astronaut.bloodType) || "O+";
    var baseHrVal = resolvePositiveNumber(baseline.base_heart_rating_bpm, 62);
    var hr = baseHrVal;
    var baseBpStr = baseline.base_blood_pressure || "115/75";
    var baseBpParts = String(baseBpStr).split("/");
    var baseSys = parseInt(baseBpParts[0], 10);
    var baseDia = parseInt(baseBpParts[1], 10);
    var sys = Number.isFinite(baseSys) ? baseSys : 115;
    var dia = Number.isFinite(baseDia) ? baseDia : 75;
    var baseEcgText = baseline.base_ecg_results || "Normal sinus rhythm";
    var vo2Val = resolvePositiveNumber(baseline.max_oxygen_capacity_ml_kg_min, 49.5);
    var muscleMassVal = resolvePositiveNumber(bodyComp.muscle_mass_kg, 48.2);
    var bodyFatVal = resolvePositiveNumber(bodyComp.body_fat_pct, 21.5);
    var bmdVal = resolvePositiveNumber(baseline.bone_material_normal_density_g_cm2, 1.185);
    var wbcVal = resolvePositiveNumber(immuneProf.baseline_wbc, 6.1);
    var dentalStatusVal = dentalRec.status || "Cleared";
    var dentalCheckVal = dentalRec.last_check || "2026-09-01";
    var baselineUpdatedDate = baseline.updated_at ? String(baseline.updated_at).slice(0, 10) : "2026-11-01";
    var radDose = (0.41 + offset * 0.03).toFixed(2);
    var customWeight = astronaut && Number(astronaut.weightKg);
    var customStandingHeight = astronaut && Number(astronaut.standing_height_cm);
    var customHeight = Number.isFinite(customStandingHeight) && customStandingHeight > 0
      ? customStandingHeight
      : astronaut && Number(astronaut.heightCm);
    var derivedWeight = Number((muscleMassVal / (1 - bodyFatVal / 100)).toFixed(1));
    var weightVal =
      Number.isFinite(customWeight) && customWeight > 0
        ? customWeight
        : derivedWeight;
    var heightVal =
      Number.isFinite(customHeight) && customHeight > 0
        ? customHeight
        : 172.5;
    var sittingHeightVal = resolvePositiveNumber(astronaut && astronaut.sitting_height_cm, 91.0);
    var standingHeightStr = Number(heightVal).toFixed(1) + " cm";
    var sittingHeightStr = Number(sittingHeightVal).toFixed(1) + " cm";
    var heightMeters = heightVal / 100;
    var bmiVal = (weightVal / (heightMeters * heightMeters)).toFixed(1);
    var bmdBaseline = bmdVal + " g/cm²";
    var bodyCompText = "Muscle " + muscleMassVal + " kg | Fat " + bodyFatVal + "%";
    var dentalSummaryText = dentalStatusVal + (dentalCheckVal ? " (" + dentalCheckVal + ")" : "");
    var dentalRowStatus = dentalStatusVal === "Cleared" || dentalStatusVal === "Nominal" ? "Nominal" : "Monitor";

    var conditionsList =
      astronaut && Array.isArray(astronaut.medical_conditions)
        ? astronaut.medical_conditions.filter(function (c) {
            return c && (c.condition_name || c.condition_type || c.notes);
          })
        : [];
    var allergyConditions = conditionsList.filter(function (c) {
      var hay = (String(c.condition_type || "") + " " + String(c.notes || "")).toLowerCase();
      return /allerg|skin|rash|hypersens/.test(hay);
    });
    var drugGiConditions = conditionsList.filter(function (c) {
      var hay = (String(c.condition_type || "") + " " + String(c.notes || "")).toLowerCase();
      return /intoleran|gastric|gi\b|stomach|drug/.test(hay);
    });
    function formatConditionLine(c) {
      return (
        String(c.condition_type || "Condition") +
        ": " +
        String(c.condition_name || "Unspecified") +
        (c.notes ? " — " + c.notes : "")
      );
    }
    function formatConditionShort(c) {
      return (
        String(c.condition_type || "Condition") +
        ": " +
        String(c.condition_name || "Unspecified") +
        (c.notes ? " (" + c.notes + ")" : "")
      );
    }
    var conditionsSummaryText =
      conditionsList.length > 0 ? conditionsList.map(formatConditionShort).join("; ") : "None";

    function buildLegSections(idPrefix, compNote) {
      return [
        {
          id: idPrefix + "-bmd",
          title: "Bone Material Normal Density (BMD)",
          status: "Nominal",
          rows: [
            "Normal Bone Density: " + bmdBaseline,
            "Standing Height: " + standingHeightStr + " | Sitting Height: " + sittingHeightStr,
          ],
          note: "Bone mineral density baseline recorded in AstronautProfiles (" + baselineUpdatedDate + ").",
        },
        {
          id: idPrefix + "-comp",
          title: "Lower-Limb Body Composition",
          status: "Nominal",
          rows: [
            "Baseline Muscle Mass: " + muscleMassVal + " kg",
            "Baseline Body Fat: " + bodyFatVal + "%",
          ],
          note: compNote,
        },
      ];
    }

    return {
      crewRole: (astronaut && astronaut.crew_role) || "Crew Member",
      astronautId: (astronaut && (astronaut.astronaut_id || astronaut.id)) || "crew_" + ((slotIndex || 0) + 1),
      dateOfBirth: (astronaut && astronaut.date_of_birth) || "",
      sittingHeightCm: sittingHeightStr,
      medicalBaseline: {
        bloodType: bloodTypeVal,
        bodyComposition: "Muscle " + muscleMassVal + " kg / Fat " + bodyFatVal + "%",
        boneDensity: bmdBaseline,
        baseHr: baseHrVal + " bpm",
        baseBp: baseBpStr + " mmHg",
        baseEcg: baseEcgText,
        vo2Max: vo2Val + " ml/kg/min",
        baselineWbc: String(wbcVal),
        dentalSummary: dentalSummaryText,
      },
      medicalConditions: conditionsList,
      vitals: {
        bloodType: bloodTypeVal,
        hr: hr + " bpm",
        bloodPressure: sys + "/" + dia + " mmHg",
        ecg: baseEcgText,
        vo2Max: vo2Val + " ml/kg/min",
        bodyComposition: bodyCompText,
        boneDensity: bmdBaseline,
        wbc: wbcVal + " ×10³/µL",
        dental: dentalSummaryText,
        conditions: conditionsSummaryText,
      },
      bodyMetrics: {
        weight: weightVal + " kg",
        height: standingHeightStr,
        sittingHeight: sittingHeightStr,
        muscleMass: muscleMassVal + " kg",
        bodyFat: bodyFatVal + "%",
        bmi: bmiVal + " kg/m²",
      },
      spaceLocation: "ISS Columbus Module (LEO)",
      spaceship: {
        temperature: "21.4 °C",
        co2Level: "2.8 mmHg (0.37%)",
        radiationLevel: (0.17 + offset * 0.02).toFixed(2) + " mSv/day",
        innerPressure: "101.3 kPa (14.7 psi)",
        upperPressure: "101.8 kPa",
        lowerPressure: "100.9 kPa",
        exposureLog: [
          "10:00 — " + (Number(radDose) - 0.01).toFixed(2) + " mSv/hr",
          "10:15 — " + radDose + " mSv/hr",
          "10:30 — " + radDose + " mSv/hr",
        ],
      },
      prescription: {
        text:
          "1. Cholecalciferol (Vitamin D3) 1,000 IU — Take 1 capsule orally once daily with morning meal to counter microgravity bone demineralization. " +
          "2. Potassium Citrate 20 mEq — Take 1 tablet orally daily with 500 mL water for renal stone prophylaxis. " +
          "3. Isotonic Electrolyte Supplement — Dissolve 1 packet in 500 mL water before and after ARED/CEVIS exercise sessions.",
        updatedAt: "14 Nov 2026, 09:30",
        doctorName: "Dr. Elena Rostova, MD",
        department: "Department of Aerospace Medicine & Flight Surgery",
      },
      alertData: {
        badVitals: [
          { label: "Heart Rate (HR)", value: "148 bpm", detail: "CRITICAL — Baseline: " + baseHrVal + " bpm" },
          { label: "Max O2 Capacity (VO2 Max)", value: "31.0 ml/kg/min", detail: "LOW — Baseline: " + vo2Val + " ml/kg/min" },
          { label: "Blood Pressure", value: "158/98 mmHg", detail: "ELEVATED — Baseline: " + baseBpStr + " mmHg" },
        ],
        instructions: [
          "1. Immediately cease all physical / ARED exercise activity and stabilize your posture using the nearest cabin restraint.",
          "2. Check portable O2 regulator connection and switch supply to 100% oxygen flow.",
          "3. Remain still, perform controlled breathing, and await Flight Surgeon telemetry link or press SOS for manual distress broadcast.",
        ],
      },
      healthPlanRows: [
        {
          id: "bloodType",
          vital: "Blood Type",
          currentValue: bloodTypeVal,
          baseline: bloodTypeVal,
          status: "Nominal",
          lastCheckup: baselineUpdatedDate,
          advice: "Cross-match type verified in AstronautProfiles medical baseline.",
        },
        {
          id: "hr",
          vital: "Heart Rate (HR)",
          currentValue: hr + " bpm",
          baseline: baseHrVal + " bpm",
          status: "Nominal",
          lastCheckup: baselineUpdatedDate,
          advice: "Maintain 30-min CEVIS aerobic intervals at 75% max HR.",
        },
        {
          id: "bp",
          vital: "Blood Pressure",
          currentValue: sys + "/" + dia + " mmHg",
          baseline: baseBpStr + " mmHg",
          status: "Nominal",
          lastCheckup: baselineUpdatedDate,
          advice: "Continue standard hydration protocol (2.5 L/day) with electrolyte packets.",
        },
        {
          id: "ecg",
          vital: "ECG Results",
          currentValue: baseEcgText,
          baseline: baseEcgText,
          status: "Nominal",
          lastCheckup: baselineUpdatedDate,
          advice: "Complete daily Post-Workout ECG Check; rhythm strip within normal sinus limits.",
        },
        {
          id: "vo2",
          vital: "Max O2 Capacity (VO2 Max)",
          currentValue: vo2Val + " ml/kg/min",
          baseline: vo2Val + " ml/kg/min",
          status: "Nominal",
          lastCheckup: baselineUpdatedDate,
          advice: "Aerobic capacity nominal; sustain CEVIS & T2 treadmill interval protocol.",
        },
        {
          id: "bodyComp",
          vital: "Body Composition",
          currentValue: bodyCompText,
          baseline: bodyCompText,
          status: "Nominal",
          lastCheckup: baselineUpdatedDate,
          advice: "Lean muscle mass and body fat percentage stable under microgravity nutrition plan.",
        },
        {
          id: "bmd",
          vital: "Bone Density (BMD)",
          currentValue: bmdBaseline,
          baseline: bmdBaseline,
          status: "Nominal",
          lastCheckup: baselineUpdatedDate,
          advice: "Complete 60-min daily ARED resistive loading (squats, deadlifts) + 1000 IU Vitamin D3.",
        },
        {
          id: "wbc",
          vital: "Immune Profile (WBC)",
          currentValue: wbcVal + " ×10³/µL",
          baseline: wbcVal + " ×10³/µL",
          status: "Nominal",
          lastCheckup: baselineUpdatedDate,
          advice: "Leukocyte count within normal baseline range; no immune stress indicators.",
        },
      ],
      bodyParts: {
        head: {
          id: "head",
          label: "Head (Dental Records)",
          sections: [
            {
              id: "dental",
              title: "Dental Records",
              status: dentalRowStatus,
              rows: [
                "Dental Status: " + dentalStatusVal,
                "Last Dental Check: " + dentalCheckVal,
                "Baseline Updated: " + baselineUpdatedDate,
              ],
              note: "Dental records sourced from medical_baseline.dental_records.",
            },
            {
              id: "head-anthropometrics",
              title: "Craniofacial & Posture Reference",
              status: "Nominal",
              rows: [
                "Sitting Height: " + sittingHeightStr,
                "Standing Height: " + standingHeightStr,
              ],
              note: "Standing and sitting stature measurements synchronized with AstronautProfiles schema.",
            },
          ],
        },
        neck: {
          id: "neck",
          label: "Neck (Immune & Allergy)",
          sections: [
            {
              id: "neck-immune",
              title: "Immune Profile",
              status: "Nominal",
              rows: [
                "Baseline WBC: " + wbcVal + " ×10³/µL",
                "Blood Type: " + bloodTypeVal,
              ],
              note: "Baseline leukocyte and ABO/Rh profile from medical_baseline.",
            },
            {
              id: "neck-allergy",
              title: "Allergy & Hypersensitivity",
              status: allergyConditions.length > 0 ? "Monitor" : "Nominal",
              rows: allergyConditions.length > 0
                ? allergyConditions.map(formatConditionLine)
                : ["No known allergies or cutaneous reactions recorded"],
              note: allergyConditions.length > 0
                ? "Flagged allergen caution from medical_conditions; verify pharmacological kit exclusions."
                : "No allergic hypersensitivity reactions documented in medical_conditions.",
            },
          ],
        },
        chest: {
          id: "chest",
          label: "Chest (Body Composition & Height)",
          metric: "Muscle: " + muscleMassVal + " kg | Fat: " + bodyFatVal + "% | Height: " + standingHeightStr + " / " + sittingHeightStr,
          sections: [
            {
              id: "chest-comp",
              title: "Baseline Body Composition",
              status: "Nominal",
              rows: [
                "Muscle Mass: " + muscleMassVal + " kg",
                "Body Fat: " + bodyFatVal + "%",
              ],
              note: "Lean body mass and adiposity baseline synced from medical_baseline.baseline_body_composition.",
            },
            {
              id: "chest-anthro",
              title: "Anthropometrics & Thoracic BMD",
              status: "Nominal",
              rows: [
                "Standing Height: " + standingHeightStr,
                "Sitting Height: " + sittingHeightStr,
                "Bone Material Normal Density: " + bmdBaseline,
              ],
              note: "Stature and thoracic mineral density baseline maintained.",
            },
          ],
        },
        lungs: {
          id: "lungs",
          label: "Lungs (Max O2 Capacity)",
          metric: "VO2 Max: " + vo2Val + " ml/kg/min | Base HR: " + baseHrVal + " bpm",
          sections: [
            {
              id: "lungs-vo2",
              title: "Max Oxygen Capacity (VO2 Max)",
              status: "Nominal",
              rows: [
                "Max Oxygen Capacity: " + vo2Val + " ml/kg/min",
                "Baseline Updated: " + baselineUpdatedDate,
              ],
              note: "Peak aerobic oxygen uptake recorded in medical_baseline.max_oxygen_capacity_ml_kg_min.",
            },
            {
              id: "lungs-cardio",
              title: "Cardiorespiratory Coupling",
              status: "Nominal",
              rows: [
                "Base Heart Rating: " + baseHrVal + " bpm",
                "Base ECG Results: " + baseEcgText,
              ],
              note: "Resting cardiopulmonary baseline aligned with ECG and heart rate telemetry.",
            },
          ],
        },
        heart: {
          id: "heart",
          label: "Heart (HR, BP & ECG)",
          metric: "HR: " + hr + " bpm | BP: " + sys + "/" + dia + " mmHg | ECG: " + baseEcgText,
          sections: [
            {
              id: "heart-ecg",
              title: "Cardiac Rate & ECG Baseline",
              status: "Nominal",
              rows: [
                "Base Heart Rating: " + hr + " bpm (Baseline: " + baseHrVal + " bpm)",
                "Base ECG Results: " + baseEcgText,
                "Baseline Updated: " + baselineUpdatedDate,
              ],
              note: "Baseline cardiac rate and rhythm verified from medical_baseline.",
            },
            {
              id: "heart-hemo",
              title: "Blood Pressure & Blood Type",
              status: "Nominal",
              rows: [
                "Base Blood Pressure: " + sys + "/" + dia + " mmHg (Baseline: " + baseBpStr + " mmHg)",
                "Blood Type: " + bloodTypeVal,
              ],
              note: "Arterial pressure and blood group synchronized with AstronautProfiles schema.",
            },
          ],
        },
        abdomen: {
          id: "abdomen",
          label: "Abdomen (GI Tolerance & Immune)",
          metric: "WBC: " + wbcVal + " ×10³/µL | GI: " + (drugGiConditions.length > 0 ? drugGiConditions[0].condition_name + " Intolerance" : "Nominal"),
          sections: [
            {
              id: "abdomen-gi",
              title: "GI & Drug Intolerance (Medical Conditions)",
              status: drugGiConditions.length > 0 ? "Monitor" : "Nominal",
              rows: drugGiConditions.length > 0
                ? drugGiConditions.map(formatConditionLine)
                : ["No known drug intolerances or GI sensitivities recorded"],
              note: drugGiConditions.length > 0
                ? "Avoid gastric-irritating medications listed under medical_conditions during spaceflight."
                : "No GI-related pharmacological exclusions recorded.",
            },
            {
              id: "abdomen-immune",
              title: "Immune & Body Composition Baseline",
              status: "Nominal",
              rows: [
                "Baseline WBC: " + wbcVal + " ×10³/µL",
                "Muscle Mass: " + muscleMassVal + " kg | Body Fat: " + bodyFatVal + "%",
              ],
              note: "Immune leukocyte baseline and metabolic body composition nominal.",
            },
          ],
        },
        "left-arm": {
          id: "left-arm",
          label: "Left Arm (Cutaneous & Muscle)",
          sections: [
            {
              id: "left-arm-allergy",
              title: "Cutaneous Allergy Status",
              status: allergyConditions.length > 0 ? "Monitor" : "Nominal",
              rows: allergyConditions.length > 0
                ? allergyConditions.map(formatConditionLine)
                : ["No known allergies or cutaneous reactions recorded"],
              note: allergyConditions.length > 0
                ? "Dermal / systemic hypersensitivity precaution active per medical_conditions."
                : "No cutaneous allergy warnings recorded.",
            },
            {
              id: "left-arm-muscle",
              title: "Upper-Limb Muscle & Bone Baseline",
              status: "Nominal",
              rows: [
                "Baseline Muscle Mass: " + muscleMassVal + " kg",
                "Bone Material Normal Density: " + bmdBaseline,
              ],
              note: "Lean muscle and bone mineral density baseline from AstronautProfiles.",
            },
          ],
        },
        "right-arm": {
          id: "right-arm",
          label: "Right Arm (BP Cuff & Hematology)",
          sections: [
            {
              id: "right-arm-bp",
              title: "Brachial Blood Pressure Baseline",
              status: "Nominal",
              rows: [
                "Base Blood Pressure: " + sys + "/" + dia + " mmHg (Baseline: " + baseBpStr + " mmHg)",
                "Base Heart Rating: " + baseHrVal + " bpm",
              ],
              note: "Primary arterial pressure reference anchored to medical_baseline.",
            },
            {
              id: "right-arm-blood",
              title: "Blood Type & Leukocyte Baseline",
              status: "Nominal",
              rows: [
                "Blood Type: " + bloodTypeVal,
                "Baseline WBC: " + wbcVal + " ×10³/µL",
              ],
              note: "Hematologic blood type and white blood cell baseline nominal.",
            },
          ],
        },
        "left-leg": {
          id: "left-leg",
          label: "Left Leg (Bone Density & Muscle)",
          sections: buildLegSections("left-leg", "Lower-limb lean mass and body fat % nominal under ARED loading."),
        },
        "right-leg": {
          id: "right-leg",
          label: "Right Leg (Bone Density & Muscle)",
          sections: buildLegSections("right-leg", "Bilateral lean mass and body fat composition stable against baseline."),
        },
      },
    };
  }

  var BODY_PART_SHAPES = [
    {
      id: "head",
      label: "Head (Dental Records)",
      d:
        "M130 14 " +
        "C115 14 108 25 108 41 " +
        "C106 42 105 46 106 51 " +
        "C107 54 109 54 110 53 " +
        "C111 63 119 74 130 74 " +
        "C141 74 149 63 150 53 " +
        "C151 54 153 54 154 51 " +
        "C155 46 154 42 152 41 " +
        "C152 25 145 14 130 14 Z",
    },
    {
      id: "neck",
      label: "Neck (Immune & Allergy)",
      d:
        "M119 71 " +
        "C122 74 126 75 130 75 " +
        "C134 75 138 74 141 71 " +
        "L142 84 " +
        "C149 88 159 92 166 95 " +
        "L154 104 " +
        "L106 104 " +
        "L94 95 " +
        "C101 92 111 88 118 84 Z",
    },
    {
      id: "chest",
      label: "Chest (Body Composition & Height)",
      d:
        "M106 104 " +
        "L154 104 " +
        "L173 108 " +
        "C173 122 170 135 166 149 " +
        "C163 161 162 174 162 186 " +
        "L98 186 " +
        "C98 174 97 161 94 149 " +
        "C90 135 87 122 87 108 Z",
    },
    {
      id: "lungs",
      label: "Lungs (Max O2 Capacity)",
      organClass: "dash-body-part--lungs",
      d:
        "M114 114 " +
        "C103 114 97 126 97 144 " +
        "C97 156 100 165 106 166 " +
        "C114 166 123 162 125 154 " +
        "L125 124 " +
        "C125 117 120 114 114 114 Z " +
        "M146 114 " +
        "C140 114 135 117 135 124 " +
        "L135 154 " +
        "C137 162 146 166 154 166 " +
        "C160 165 163 156 163 144 " +
        "C163 126 157 114 146 114 Z",
    },
    {
      id: "heart",
      label: "Heart (HR, BP & ECG)",
      organClass: "dash-body-part--heart",
      d:
        "M140 134 " +
        "C137 128 127 128 127 137 " +
        "C127 144 134 149 140 155 " +
        "C146 149 153 144 153 137 " +
        "C153 128 143 128 140 134 Z",
    },
    {
      id: "abdomen",
      label: "Abdomen (GI Tolerance & Immune)",
      d:
        "M98 186 " +
        "L162 186 " +
        "C161 200 163 214 167 228 " +
        "C170 239 170 250 167 262 " +
        "L134 274 " +
        "L130 278 " +
        "L126 274 " +
        "L93 262 " +
        "C90 250 90 239 93 228 " +
        "C97 214 99 200 98 186 Z",
    },
    {
      id: "left-arm",
      label: "Left Arm (Cutaneous & Muscle)",
      d:
        "M94 95 " +
        "C79 98 69 109 67 125 " +
        "C65 140 62 156 57 174 " +
        "C52 192 44 214 38 234 " +
        "C35 245 31 255 27 265 " +
        "C25 270 28 273 31 269 " +
        "L36 259 " +
        "C34 269 32 278 35 280 " +
        "C38 281 41 273 43 264 " +
        "C43 273 42 281 45 282 " +
        "C48 282 50 273 51 264 " +
        "C52 271 53 278 56 277 " +
        "C58 276 58 265 57 254 " +
        "C57 248 56 242 57 236 " +
        "C62 218 69 198 75 182 " +
        "C81 169 87 158 94 149 " +
        "C90 135 87 122 87 108 " +
        "L106 104 Z",
    },
    {
      id: "right-arm",
      label: "Right Arm (BP Cuff & Hematology)",
      d:
        "M166 95 " +
        "C181 98 191 109 193 125 " +
        "C195 140 198 156 203 174 " +
        "C208 192 216 214 222 234 " +
        "C225 245 229 255 233 265 " +
        "C235 270 232 273 229 269 " +
        "L224 259 " +
        "C226 269 228 278 225 280 " +
        "C222 281 219 273 217 264 " +
        "C217 273 218 281 215 282 " +
        "C212 282 210 273 209 264 " +
        "C208 271 207 278 204 277 " +
        "C202 276 202 265 203 254 " +
        "C203 248 204 242 203 236 " +
        "C198 218 191 198 185 182 " +
        "C179 169 173 158 166 149 " +
        "C170 135 173 122 173 108 " +
        "L154 104 Z",
    },
    {
      id: "left-leg",
      label: "Left Leg (Bone Density & Muscle)",
      d:
        "M93 262 " +
        "C89 282 90 306 94 334 " +
        "C97 352 98 366 96 382 " +
        "C94 402 95 424 100 448 " +
        "L101 472 " +
        "C97 482 91 490 92 496 " +
        "C93 502 106 504 113 498 " +
        "C117 494 119 485 119 474 " +
        "L120 448 " +
        "C124 426 127 404 126 382 " +
        "C125 366 124 352 125 334 " +
        "C126 312 128 294 126 274 Z",
    },
    {
      id: "right-leg",
      label: "Right Leg (Bone Density & Muscle)",
      d:
        "M167 262 " +
        "C171 282 170 306 166 334 " +
        "C163 352 162 366 164 382 " +
        "C166 402 165 424 160 448 " +
        "L159 472 " +
        "C163 482 169 490 168 496 " +
        "C167 502 154 504 147 498 " +
        "C143 494 141 485 141 474 " +
        "L140 448 " +
        "C136 426 133 404 134 382 " +
        "C135 366 136 352 135 334 " +
        "C134 312 132 294 134 274 Z",
    },
  ];

  function getBodyPartEffectiveStatus(partData) {
    if (!partData) return "Nominal";
    if (Array.isArray(partData.sections) && partData.sections.length > 0) {
      var nonNominal = null;
      for (var i = 0; i < partData.sections.length; i++) {
        var st = (partData.sections[i] && partData.sections[i].status) || "Nominal";
        if (st !== "Nominal") {
          if (st === "Alert" || st === "Critical") {
            return st;
          }
          if (!nonNominal) {
            nonNominal = st;
          }
        }
      }
      return nonNominal || "Nominal";
    }
    return partData.status || "Nominal";
  }

  function getStatusTagClass(status) {
    if (status === "Alert" || status === "Critical") {
      return "dash-status-tag dash-status-tag--alert";
    }
    if (status && status !== "Nominal") {
      return "dash-status-tag dash-status-tag--monitor";
    }
    return "dash-status-tag";
  }

  function HumanSilhouetteSvg(props) {
    var selectedPartId = props.selectedPartId;
    var bodyParts = props.bodyParts;
    var onSelectPart = props.onSelectPart;

    return h(
      "svg",
      {
        className: "dash-body-svg",
        viewBox: "0 0 260 515",
        role: "group",
        "aria-label": "Interactive Astronaut Body Map",
      },
      BODY_PART_SHAPES.map(function (part) {
        var isSelected = selectedPartId === part.id;
        var partData = bodyParts && bodyParts[part.id];
        var effectiveStatus = getBodyPartEffectiveStatus(partData);
        var classes = ["dash-body-part"];
        if (part.organClass) classes.push(part.organClass);
        if (effectiveStatus === "Alert" || effectiveStatus === "Critical") {
          classes.push("dash-body-part--alert");
        } else if (effectiveStatus !== "Nominal") {
          classes.push("dash-body-part--monitor");
        } else {
          classes.push("dash-body-part--nominal");
        }
        if (isSelected) classes.push("dash-body-part--active");
        return h(
          "path",
          {
            key: part.id,
            d: part.d,
            className: classes.join(" "),
            role: "button",
            tabIndex: 0,
            "aria-pressed": isSelected,
            "aria-label": "Inspect " + part.label + " (" + effectiveStatus + ")",
            onClick: function () {
              onSelectPart(part.id);
            },
            onKeyDown: function (e) {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectPart(part.id);
              }
            },
          },
          h("title", null, part.label)
        );
      })
    );
  }

  function BadgeBannerSvg() {
    return h(
      "svg",
      {
        className: "dash-badge-shield",
        viewBox: "0 0 76 92",
        "aria-hidden": "true",
      },
      h("polygon", {
        points: "2,2 74,2 74,73 38,89 2,73",
        fill: "#155b79",
        stroke: "#0d3b4f",
        strokeWidth: "1.5",
      })
    );
  }

  var GROUND_CONTROL_PERIODS = [
    { id: "10min", label: "10 MIN", windowText: "Last 10 Minutes" },
    { id: "1day", label: "1 DAY", windowText: "Last 24 Hours (1 Day)" },
    { id: "30min", label: "30 MIN", windowText: "Last 30 Minutes" },
    { id: "1week", label: "1 WEEK", windowText: "Last 7 Days (1 Week)" },
    { id: "1h", label: "1 H", windowText: "Last 1 Hour" },
    { id: "custom", label: "CUSTOM", windowText: "Custom Time Period" },
    { id: "all", label: "ALL", windowText: "All Mission Telemetry", fullWidth: true },
  ];

  function buildExportLogText(astronaut, sample, tasks, periodObj, customRangeText, categories, nowDate) {
    var displayName = getAstronautFullName(astronaut) || "Name Surname";
    var missionDay = (astronaut && astronaut.missionDay) || 142;
    var ageStr = astronaut && astronaut.age ? String(astronaut.age) : "Unspecified";
    var genderStr = (astronaut && (astronaut.sex || astronaut.gender)) || "Unspecified";
    var bloodStr =
      (astronaut && astronaut.medical_baseline && astronaut.medical_baseline.blood_type) ||
      (astronaut && astronaut.bloodType) ||
      "Unspecified";
    var periodSummary =
      periodObj.id === "custom"
        ? "CUSTOM (" + (customRangeText || "Unspecified Range") + ")"
        : periodObj.label + " (" + periodObj.windowText + ")";

    var selectedLabels = [];
    if (categories.vitals) selectedLabels.push("VITALS");
    if (categories.healthPlan) selectedLabels.push("HEALTH PLAN");
    if (categories.logs) selectedLabels.push("LOGS");

    var lines = [
      "============================================================",
      "ASTRONAUT HEALTH SYSTEM - GROUND CONTROL TXT LOG EXPORT",
      "============================================================",
      "Generated At : " + formatHeaderTimestamp(nowDate),
      "Time Period  : " + periodSummary,
      "Categories   : " + selectedLabels.join(", "),
      "Astronaut ID : " + sample.astronautId,
      "Crew Member  : " + displayName,
      "Role         : " + sample.crewRole,
      "DOB / Age    : " + (sample.dateOfBirth || "Unspecified") + " (" + ageStr + ")",
      "Sex          : " + genderStr,
      "Blood Type   : " + bloodStr,
      "Weight/Height: " +
        sample.bodyMetrics.weight +
        " / " +
        sample.bodyMetrics.height +
        (sample.sittingHeightCm ? " (Sitting: " + sample.sittingHeightCm + ")" : ""),
      "BMI          : " + sample.bodyMetrics.bmi,
      "Mission Day  : " + missionDay,
      "Location     : " + sample.spaceLocation,
      "",
    ];

    if (sample.medicalConditions && sample.medicalConditions.length > 0) {
      lines.push("Medical Conditions / Allergies:");
      sample.medicalConditions.forEach(function (cond) {
        lines.push(
          "  - [" +
            (cond.condition_type || "Condition") +
            "] " +
            (cond.condition_name || "") +
            (cond.notes ? " — " + cond.notes : "")
        );
      });
      lines.push("");
    }

    if (categories.vitals) {
      lines.push("------------------------------------------------------------");
      lines.push("[VITALS]");
      lines.push("------------------------------------------------------------");
      lines.push("Blood Type                : " + sample.vitals.bloodType);
      lines.push("Heart Rate (HR)           : " + sample.vitals.hr);
      lines.push("Blood Pressure            : " + sample.vitals.bloodPressure);
      lines.push("ECG Results               : " + sample.vitals.ecg);
      lines.push("Max O2 Capacity (VO2 Max) : " + sample.vitals.vo2Max);
      lines.push("Body Composition          : " + sample.vitals.bodyComposition);
      lines.push("Bone Density (BMD)        : " + sample.vitals.boneDensity);
      lines.push("Immune Profile (WBC)      : " + sample.vitals.wbc);
      lines.push("");
      lines.push("Window Telemetry Samples (" + periodObj.label + "):");
      lines.push("  - Heart (HR/BP/ECG) : " + sample.bodyParts.heart.metric);
      lines.push("  - Lungs (VO2 Max)   : " + sample.bodyParts.lungs.metric);
      lines.push("  - Chest (Comp/Ht)   : " + sample.bodyParts.chest.metric);
      lines.push("  - Abdomen (GI/WBC)  : " + sample.bodyParts.abdomen.metric);
      lines.push("");
    }

    if (categories.healthPlan) {
      lines.push("------------------------------------------------------------");
      lines.push("[HEALTH PLAN]");
      lines.push("------------------------------------------------------------");
      lines.push("Current Prescription:");
      lines.push("  Prescribed By : " + sample.prescription.doctorName + " (" + sample.prescription.department + ")");
      lines.push("  Date Updated  : " + sample.prescription.updatedAt);
      lines.push("  Rx Details    : " + sample.prescription.text);
      lines.push("");
      sample.healthPlanRows.forEach(function (row) {
        lines.push(
          "- " +
            row.vital +
            " | Current: " +
            row.currentValue +
            " | Baseline: " +
            row.baseline +
            " | Status: " +
            row.status +
            " | Last Checkup: " +
            row.lastCheckup
        );
        lines.push("  Advice: " + row.advice);
      });
      lines.push("");
      lines.push("Daily Tasks Checklist:");
      lines.push("  [" + (tasks.vision ? "x" : " ") + "] Morning Vision & Tonometry Check");
      lines.push("  [" + (tasks.hydration ? "x" : " ") + "] Electrolyte & Fluid Intake Log (2.5 L Target)");
      lines.push("  [" + (tasks.ared ? "x" : " ") + "] 60-Min ARED Resistive Loading Session");
      lines.push("  [" + (tasks.workoutEcg ? "x" : " ") + "] Post-Workout 12-Lead ECG & BP Check");
      lines.push("  [" + (tasks.dosimetry ? "x" : " ") + "] Evening Personal Radiation Dosimeter Sync");
      lines.push("  [" + (tasks.recEcg ? "x" : " ") + "] 15-Min Post-Exercise ECG & BP Verification (Recommended)");
      lines.push("");
    }

    if (categories.logs) {
      lines.push("------------------------------------------------------------");
      lines.push("[LOGS]");
      lines.push("------------------------------------------------------------");
      lines.push("Spaceship Temperature : " + sample.spaceship.temperature);
      lines.push("Cabin CO2 Level       : " + sample.spaceship.co2Level);
      lines.push("Cabin Radiation Level : " + sample.spaceship.radiationLevel);
      lines.push("Inner Pressure        : " + sample.spaceship.innerPressure);
      lines.push("Upper Pressure        : " + sample.spaceship.upperPressure);
      lines.push("Lower Pressure        : " + sample.spaceship.lowerPressure);
      lines.push("System Sync Status    : synced (12 minutes ago)");
      lines.push("");
      lines.push("Radiation Exposure Log (" + periodObj.label + "):");
      sample.spaceship.exposureLog.forEach(function (entry) {
        lines.push("  * " + entry);
      });
      lines.push("");
      lines.push("Ground Control Sync Events:");
      lines.push("  * Telemetry packet verified for " + displayName + " (" + periodSummary + ")");
      lines.push("  * Crew biometric sensors nominal");
      lines.push("");
    }

    return lines.join("\n");
  }

  function downloadTxtFile(filename, textContent) {
    var blob = new Blob([textContent], { type: "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  var MEASUREMENT_SPECS = [
    {
      id: "electrocardiogram",
      name: "Electrocardiogram",
      dataType: "Time-series Array / Float[]",
      unit: "mV",
      representation: "Line graph (updates every 0.1s)",
      threshold: "Δ Amplitude > 0.5 mV or Δ R-R interval > 300 ms",
      category: "vitals",
      chartType: "line",
    },
    {
      id: "heart_rate",
      name: "Heart rate",
      dataType: "Integer",
      unit: "bpm",
      representation: "Line graph (updates every 1s)",
      threshold: "Δ HR > 30 bpm within 30s",
      category: "vitals",
      chartType: "line",
    },
    {
      id: "oxygen_level_in_blood",
      name: "Oxygen level in blood",
      dataType: "Float",
      unit: "% (SpO2)",
      representation: "Line graph (updates every 0.1s)",
      threshold: "Δ SpO2 < -5% within 10s",
      category: "vitals",
      chartType: "line",
    },
    {
      id: "pressure",
      name: "Pressure",
      dataType: "String / Integer (Systolic / Diastolic)",
      unit: "mmHg",
      representation: "Line graph (updates every 1s)",
      threshold: "Systolic > 138/155 mmHg or Diastolic > 88/96 mmHg (or Δ > 18/25 mmHg in 5s)",
      category: "vitals",
      chartType: "line",
    },
    {
      id: "respiration_rate",
      name: "Respiration rate",
      dataType: "Integer",
      unit: "breaths/min",
      representation: "Line graph (updates every 10s)",
      threshold: "Δ RR > 8 breaths/min within 30s",
      category: "vitals",
      chartType: "line",
    },
    {
      id: "oxygen_left",
      name: "Oxygen left",
      dataType: "Float",
      unit: "% or L / kPa",
      representation: "Number (updates every 1s)",
      threshold: "Reserve < 40% (Warning) or < 25% (SOS) | Δ Consumption rate > +50%",
      category: "suit_cabin",
      chartType: "number",
    },
    {
      id: "co2_level",
      name: "CO_2 level",
      dataType: "Float",
      unit: "ppm or mmHg",
      representation: "Line graph (updates every 0.5s)",
      threshold: "CO2 > 3.50 mmHg (Warning) or > 4.25 mmHg (SOS)",
      category: "suit_cabin",
      chartType: "line",
    },
    {
      id: "pressure_inside_veins",
      name: "Pressure inside veins",
      dataType: "Float",
      unit: "mmHg",
      representation: "Number (updates every 1s)",
      threshold: "Δ CVP > 4 mmHg within 10s (Warning > 7.8 mmHg, SOS > 9.5 mmHg)",
      category: "vitals",
      chartType: "number",
    },
    {
      id: "radiation_exposure",
      name: "Radiation exposure",
      dataType: "Float",
      unit: "R (röntgen)",
      representation: "Column graph (updates every 5s)",
      threshold: "Δ Radiation > 0.006 R within 5s or > 0.055 R/sol (Warning) | > 0.085 R/sol or Δ > 0.015 R within 5s (SOS)",
      category: "suit_cabin",
      chartType: "column",
    },
    {
      id: "battery_level",
      name: "Battery level",
      dataType: "Float",
      unit: "%",
      representation: "Number (updates every 1s)",
      threshold: "Charge < 35% (Warning) or < 20% (SOS) | Δ Discharge rate > +50%",
      category: "suit_cabin",
      chartType: "number",
    },
    {
      id: "temp_inside_costume",
      name: "Temperature inside costume",
      dataType: "Float",
      unit: "°C",
      representation: "Line graph (updates every 1s)",
      threshold: "Δ Suit Temp > 2.5 °C within 30s (> 23.3 °C Warning, > 24.5 °C SOS)",
      category: "suit_cabin",
      chartType: "line",
    },
    {
      id: "skin_surface",
      name: "Skin surface",
      dataType: "Float",
      unit: "°C",
      representation: "Line graph (updates every 5s)",
      threshold: "Δ Skin Temp > 1.5 °C within 1m (> 37.2 °C Warning, > 37.9 °C SOS)",
      category: "vitals",
      chartType: "line",
    },
    {
      id: "metabolic_rate",
      name: "Metabolic rate",
      dataType: "Float",
      unit: "kcal/h or W",
      representation: "Number (updates every 5s)",
      threshold: "Δ Metabolic rate > 100 kcal/h within 1m (> 198 kcal/h Warning, > 250 kcal/h SOS)",
      category: "vitals",
      chartType: "number",
    },
    {
      id: "temp_outside_costume",
      name: "Temperature outside costume",
      dataType: "Float",
      unit: "°C",
      representation: "Line graph (updates every 1s)",
      threshold: "Δ External Temp > 10 °C within 5s",
      category: "suit_cabin",
      chartType: "line",
    },
    {
      id: "outside_temperature",
      name: "Outside temperature",
      dataType: "Float",
      unit: "°C",
      representation: "Line graph (updates every 5s)",
      threshold: "Δ Cabin Temp > 3 °C within 1m",
      category: "suit_cabin",
      chartType: "line",
    },
    {
      id: "humidity",
      name: "Humidity",
      dataType: "Float",
      unit: "%",
      representation: "Line graph (updates every 5s)",
      threshold: "Δ Humidity > 15% within 1m",
      category: "suit_cabin",
      chartType: "line",
    },
    {
      id: "sleep_amount",
      name: "Sleep amount",
      dataType: "Float",
      unit: "hours/sol",
      representation: "Column graph (updates per sol)",
      threshold: "Δ Sleep per sol < -2 hours/sol vs baseline",
      category: "daily",
      chartType: "column",
    },
    {
      id: "exercise_activity",
      name: "Exercise activity",
      dataType: "Integer / Float",
      unit: "min/sol or kcal/sol",
      representation: "Column graph (updates per sol)",
      threshold: "Δ Activity per sol < -30% vs target",
      category: "daily",
      chartType: "column",
    },
    {
      id: "blood_type",
      name: "Blood type",
      dataType: "Enum / String",
      unit: "N/A",
      representation: "Const",
      threshold: "N/A",
      category: "baseline",
      chartType: "const",
    },
    {
      id: "allergies",
      name: "Allergies",
      dataType: "Array<String>",
      unit: "N/A",
      representation: "Const",
      threshold: "N/A",
      category: "baseline",
      chartType: "const",
    },
    {
      id: "drugs_intolerance",
      name: "Drugs intolerance",
      dataType: "Array<String>",
      unit: "N/A",
      representation: "Const",
      threshold: "N/A",
      category: "baseline",
      chartType: "const",
    },
    {
      id: "incurable_diseases",
      name: "Incurable disieses",
      dataType: "Array<String>",
      unit: "N/A",
      representation: "Const",
      threshold: "N/A",
      category: "baseline",
      chartType: "const",
    },
    {
      id: "base_heart_rating",
      name: "Base heart rating",
      dataType: "Integer",
      unit: "bpm",
      representation: "Const",
      threshold: "N/A (Baseline Reference)",
      category: "baseline",
      chartType: "const",
    },
    {
      id: "base_blood_pressure",
      name: "Base blood pressure",
      dataType: "String / Object",
      unit: "mmHg",
      representation: "Const",
      threshold: "N/A (Baseline Reference)",
      category: "baseline",
      chartType: "const",
    },
    {
      id: "base_ecg_results",
      name: "Base ECG results",
      dataType: "Time-series Array / String",
      unit: "mV",
      representation: "Const",
      threshold: "N/A (Baseline Reference)",
      category: "baseline",
      chartType: "const",
    },
    {
      id: "max_oxygen_capacity_in_blood",
      name: "Max oxygen capacity in blood",
      dataType: "Float",
      unit: "mL/kg/min",
      representation: "Const",
      threshold: "N/A (Baseline Reference)",
      category: "baseline",
      chartType: "const",
    },
    {
      id: "immune_profile",
      name: "Immune profile",
      dataType: "String / Object",
      unit: "N/A",
      representation: "Const",
      threshold: "N/A",
      category: "baseline",
      chartType: "const",
    },
    {
      id: "bone_material_normal_density",
      name: "Bone material normal density",
      dataType: "Float",
      unit: "g/cm²",
      representation: "Const",
      threshold: "N/A",
      category: "baseline",
      chartType: "const",
    },
    {
      id: "baseline_body_composition",
      name: "Baseline body composition",
      dataType: "Object / Float",
      unit: "%",
      representation: "Const",
      threshold: "N/A",
      category: "baseline",
      chartType: "const",
    },
    {
      id: "dental_records",
      name: "Dental records",
      dataType: "String / Object",
      unit: "N/A",
      representation: "Const",
      threshold: "N/A",
      category: "baseline",
      chartType: "const",
    },
    {
      id: "crew_role",
      name: "Crew role",
      dataType: "String",
      unit: "N/A",
      representation: "Const",
      threshold: "N/A",
      category: "baseline",
      chartType: "const",
    },
    {
      id: "full_name",
      name: "Full name",
      dataType: "String",
      unit: "N/A",
      representation: "Const",
      threshold: "N/A",
      category: "baseline",
      chartType: "const",
    },
    {
      id: "date_of_birth",
      name: "Date of birth",
      dataType: "Date (ISO 8601)",
      unit: "N/A",
      representation: "Const",
      threshold: "N/A",
      category: "baseline",
      chartType: "const",
    },
    {
      id: "sex",
      name: "Sex",
      dataType: "Enum / String",
      unit: "N/A",
      representation: "Const",
      threshold: "N/A",
      category: "baseline",
      chartType: "const",
    },
    {
      id: "standing_height",
      name: "Standing height",
      dataType: "Float",
      unit: "cm",
      representation: "Const",
      threshold: "N/A",
      category: "baseline",
      chartType: "const",
    },
    {
      id: "sitting_height",
      name: "Sitting height",
      dataType: "Float",
      unit: "cm",
      representation: "Const",
      threshold: "N/A",
      category: "baseline",
      chartType: "const",
    },
  ];

  function buildDefaultMeasurementsForAstronaut(astronaut, slotIndex) {
    var offset = (slotIndex || 0) % 5;
    var baseline = (astronaut && astronaut.medical_baseline) || {};
    var bodyComp = baseline.baseline_body_composition || {};
    var immuneProf = baseline.immune_profile || {};
    var dentalRec = baseline.dental_records || {};
    var fullNameVal = getAstronautFullName(astronaut) || "Elena Rostova";
    var dobVal = (astronaut && astronaut.date_of_birth) || "1992-05-14";
    var sexVal = (astronaut && (astronaut.sex || astronaut.gender)) || "Female";
    var roleVal = (astronaut && astronaut.crew_role) || "Flight Engineer";
    var standingH = resolvePositiveNumber(astronaut && astronaut.standing_height_cm, 172.5);
    var sittingH = resolvePositiveNumber(astronaut && astronaut.sitting_height_cm, 91.0);
    var muscleKg = resolvePositiveNumber(bodyComp.muscle_mass_kg, 48.2);
    var fatPct = resolvePositiveNumber(bodyComp.body_fat_pct, 21.5);
    var bloodTypeVal = baseline.blood_type || (astronaut && astronaut.bloodType) || "O+";
    var bmdVal = resolvePositiveNumber(baseline.bone_material_normal_density_g_cm2, 1.185);
    var baseHrVal = resolvePositiveNumber(baseline.base_heart_rating_bpm, 62);
    var baseBpStr = baseline.base_blood_pressure || "115/75";
    var bpParts = String(baseBpStr).split("/");
    var sysVal = parseInt(bpParts[0], 10) || 115;
    var diaVal = parseInt(bpParts[1], 10) || 75;
    var baseEcgVal = baseline.base_ecg_results || "Normal sinus rhythm";
    var vo2Val = resolvePositiveNumber(baseline.max_oxygen_capacity_ml_kg_min, 49.5);
    var wbcVal = resolvePositiveNumber(immuneProf.baseline_wbc, 6.1);
    var dentalStr = (dentalRec.status || "Cleared") + " (Last check: " + (dentalRec.last_check || "2026-09-01") + ")";

    var conditionsList =
      astronaut && Array.isArray(astronaut.medical_conditions) ? astronaut.medical_conditions : [];
    var allergyItems = conditionsList
      .filter(function (c) {
        return c && /allerg/i.test(String(c.condition_type || ""));
      })
      .map(function (c) {
        return c.condition_name + (c.notes ? " (" + c.notes + ")" : "");
      });
    var drugItems = conditionsList
      .filter(function (c) {
        return c && /intoleran|drug/i.test(String(c.condition_type || ""));
      })
      .map(function (c) {
        return c.condition_name + (c.notes ? " (" + c.notes + ")" : "");
      });
    var incurableItems = conditionsList
      .filter(function (c) {
        return c && /incurable|chronic|disease|disiese/i.test(String(c.condition_type || ""));
      })
      .map(function (c) {
        return c.condition_name + (c.notes ? " (" + c.notes + ")" : "");
      });

    var baseRadR = Number((0.038 + offset * 0.002).toFixed(3));
    var defaultsMap = {
      electrocardiogram: {
        value: "1.18",
        series: [
          0.16, -0.15, 1.18, -0.29, 0.25,
          0.16, -0.14, 1.17, -0.28, 0.24,
          0.15, -0.15, 1.19, -0.30, 0.25,
          0.16, -0.15, 1.18, -0.28, 0.24,
          0.16, -0.15, 1.18, -0.29, 0.25,
        ],
        seriesLabels: [
          "-2.4s", "-2.3s", "-2.2s", "-2.1s", "-2.0s",
          "-1.9s", "-1.8s", "-1.7s", "-1.6s", "-1.5s",
          "-1.4s", "-1.3s", "-1.2s", "-1.1s", "-1.0s",
          "-0.9s", "-0.8s", "-0.7s", "-0.6s", "-0.5s",
          "-0.4s", "-0.3s", "-0.2s", "-0.1s", "Now",
        ],
      },
      heart_rate: {
        value: "78",
        series: [77, 78, 79, 78, 77, 79, 80, 79, 78, 77, 78, 80, 79, 78, 79, 78, 77, 79, 78, 78],
        seriesLabels: [
          "-19s", "-18s", "-17s", "-16s", "-15s", "-14s", "-13s", "-12s", "-11s", "-10s",
          "-9s", "-8s", "-7s", "-6s", "-5s", "-4s", "-3s", "-2s", "-1s", "Now",
        ],
      },
      respiration_rate: {
        value: "14",
        series: [14, 14, 15, 14, 13, 14, 15, 14, 14, 15, 14, 14],
        seriesLabels: ["-110s", "-100s", "-90s", "-80s", "-70s", "-60s", "-50s", "-40s", "-30s", "-20s", "-10s", "Now"],
      },
      metabolic_rate: { value: "92.5 kcal/h (108 W)" },
      oxygen_level_in_blood: {
        value: "98.6",
        series: [98.5, 98.6, 98.6, 98.5, 98.7, 98.6, 98.5, 98.6, 98.7, 98.6, 98.5, 98.6, 98.6, 98.7, 98.6, 98.5, 98.6, 98.6, 98.5, 98.6],
        seriesLabels: [
          "-1.9s", "-1.8s", "-1.7s", "-1.6s", "-1.5s", "-1.4s", "-1.3s", "-1.2s", "-1.1s", "-1.0s",
          "-0.9s", "-0.8s", "-0.7s", "-0.6s", "-0.5s", "-0.4s", "-0.3s", "-0.2s", "-0.1s", "Now",
        ],
      },
      pressure_inside_veins: { value: "5.2" },
      pressure: {
        value: sysVal + "/" + diaVal,
        series: [
          sysVal - 1, sysVal, sysVal + 1, sysVal, sysVal - 1, sysVal, sysVal + 1, sysVal, sysVal - 1, sysVal,
          sysVal + 1, sysVal, sysVal - 1, sysVal, sysVal, sysVal + 1, sysVal, sysVal - 1, sysVal, sysVal,
        ],
        seriesSecondary: [
          diaVal, diaVal, diaVal + 1, diaVal, diaVal - 1, diaVal, diaVal, diaVal + 1, diaVal, diaVal,
          diaVal, diaVal - 1, diaVal, diaVal, diaVal + 1, diaVal, diaVal, diaVal - 1, diaVal, diaVal,
        ],
        seriesLabels: [
          "-19s", "-18s", "-17s", "-16s", "-15s", "-14s", "-13s", "-12s", "-11s", "-10s",
          "-9s", "-8s", "-7s", "-6s", "-5s", "-4s", "-3s", "-2s", "-1s", "Now",
        ],
      },
      co2_level: {
        value: "2.60 mmHg (3421 ppm)",
        series: [2.56, 2.58, 2.57, 2.59, 2.60, 2.58, 2.59, 2.61, 2.60, 2.58, 2.59, 2.60, 2.61, 2.59, 2.60, 2.60],
        seriesLabels: [
          "-7.5s", "-7.0s", "-6.5s", "-6.0s", "-5.5s", "-5.0s", "-4.5s", "-4.0s",
          "-3.5s", "-3.0s", "-2.5s", "-2.0s", "-1.5s", "-1.0s", "-0.5s", "Now",
        ],
      },
      oxygen_left: { value: "88.00% (528 L / 101.3 kPa)" },
      temp_inside_costume: {
        value: "21.6",
        series: [21.5, 21.6, 21.6, 21.5, 21.6, 21.7, 21.6, 21.6, 21.5, 21.6, 21.7, 21.6, 21.6, 21.5, 21.6, 21.6],
        seriesLabels: [
          "-15s", "-14s", "-13s", "-12s", "-11s", "-10s", "-9s", "-8s",
          "-7s", "-6s", "-5s", "-4s", "-3s", "-2s", "-1s", "Now",
        ],
      },
      temp_outside_costume: {
        value: "21.4",
        series: [21.3, 21.4, 21.4, 21.3, 21.4, 21.5, 21.4, 21.4, 21.3, 21.4, 21.5, 21.4, 21.4, 21.3, 21.4, 21.4],
        seriesLabels: [
          "-15s", "-14s", "-13s", "-12s", "-11s", "-10s", "-9s", "-8s",
          "-7s", "-6s", "-5s", "-4s", "-3s", "-2s", "-1s", "Now",
        ],
      },
      battery_level: { value: "92.40" },
      radiation_exposure: {
        value: baseRadR.toFixed(3),
        series: [0.036, 0.037, 0.038, 0.039, 0.038, 0.040, baseRadR],
        seriesLabels: ["-30s", "-25s", "-20s", "-15s", "-10s", "-5s", "Now"],
      },
      skin_surface: {
        value: "36.4",
        series: [36.3, 36.4, 36.4, 36.3, 36.4, 36.5, 36.4, 36.4, 36.3, 36.4, 36.4, 36.4],
        seriesLabels: ["-55s", "-50s", "-45s", "-40s", "-35s", "-30s", "-25s", "-20s", "-15s", "-10s", "-5s", "Now"],
      },
      outside_temperature: {
        value: "21.4",
        series: [21.3, 21.4, 21.4, 21.3, 21.4, 21.5, 21.4, 21.4, 21.3, 21.4, 21.4, 21.4],
        seriesLabels: ["-55s", "-50s", "-45s", "-40s", "-35s", "-30s", "-25s", "-20s", "-15s", "-10s", "-5s", "Now"],
      },
      humidity: {
        value: "44.0",
        series: [43.8, 44.0, 44.1, 43.9, 44.0, 44.2, 44.1, 44.0, 43.9, 44.1, 44.0, 44.0],
        seriesLabels: ["-55s", "-50s", "-45s", "-40s", "-35s", "-30s", "-25s", "-20s", "-15s", "-10s", "-5s", "Now"],
      },
      sleep_amount: {
        value: "7.5",
        series: [7.8, 7.2, 8.0, 6.9, 7.4, 7.6, 7.5],
        seriesLabels: ["Sol -6", "Sol -5", "Sol -4", "Sol -3", "Sol -2", "Sol -1", "This Sol"],
      },
      exercise_activity: {
        value: "90 min/sol (639 kcal/sol)",
        series: [85, 90, 95, 80, 90, 100, 90],
        seriesLabels: ["Sol -6", "Sol -5", "Sol -4", "Sol -3", "Sol -2", "Sol -1", "This Sol"],
      },
      full_name: { value: fullNameVal },
      date_of_birth: { value: dobVal },
      sex: { value: sexVal },
      crew_role: { value: roleVal },
      standing_height: { value: String(standingH) },
      sitting_height: { value: String(sittingH) },
      baseline_body_composition: { value: "Fat: " + fatPct + "% (Muscle: " + muscleKg + " kg)" },
      blood_type: { value: bloodTypeVal },
      allergies: { value: allergyItems.length > 0 ? allergyItems.join(", ") : "Penicillin (Severe skin rash)" },
      drugs_intolerance: { value: drugItems.length > 0 ? drugItems.join(", ") : "Ibuprofen (Gastric irritation in microgravity)" },
      immune_profile: { value: "Baseline WBC: " + wbcVal + " ×10³/µL" },
      dental_records: { value: dentalStr },
      incurable_diseases: { value: incurableItems.length > 0 ? incurableItems.join(", ") : "None recorded" },
      bone_material_normal_density: { value: String(bmdVal) },
      base_heart_rating: { value: String(baseHrVal) },
      base_ecg_results: { value: baseEcgVal + " (0.16, -0.15, 1.18, -0.29, 0.25 mV)" },
      base_blood_pressure: { value: baseBpStr },
      max_oxygen_capacity_in_blood: { value: String(vo2Val) },
    };

    var out = {};
    MEASUREMENT_SPECS.forEach(function (spec) {
      var def = defaultsMap[spec.id] || { value: "—" };
      out[spec.id] = {
        id: spec.id,
        name: spec.name,
        dataType: spec.dataType,
        unit: spec.unit,
        representation: spec.representation,
        threshold: spec.threshold,
        category: spec.category,
        chartType: spec.chartType,
        source: spec.category === "baseline" ? "PROFILE OR EXAMPLE PLACEHOLDER" : "SIMULATED TELEMETRY",
        value: def.value,
        series: def.series ? def.series.slice() : null,
        seriesSecondary: def.seriesSecondary ? def.seriesSecondary.slice() : null,
        seriesLabels: def.seriesLabels ? def.seriesLabels.slice() : null,
      };
    });
    return out;
  }

  function loadStoredMeasurements(astronautId, astronaut, slotIndex) {
    var base = buildDefaultMeasurementsForAstronaut(astronaut, slotIndex);
    try {
      var raw = window.localStorage.getItem(MEASUREMENTS_STORAGE_KEY);
      if (!raw) return base;
      var parsed = JSON.parse(raw);
      var astroStore = parsed && parsed[astronautId];
      if (!astroStore || typeof astroStore !== "object") return base;
      Object.keys(base).forEach(function (id) {
        if (astroStore[id] && typeof astroStore[id] === "object") {
          var stored = astroStore[id];
          var candidate = Object.assign({}, base[id], stored, {
            name: base[id].name,
            dataType: base[id].dataType,
            unit: base[id].unit,
            threshold: base[id].threshold,
            representation: base[id].representation,
            category: base[id].category,
            chartType: base[id].chartType,
            source: base[id].source,
            series:
              Array.isArray(stored.series) && stored.series.length > 0
                ? stored.series
                : base[id].series,
            seriesSecondary:
              Array.isArray(stored.seriesSecondary) && stored.seriesSecondary.length > 0
                ? stored.seriesSecondary
                : base[id].seriesSecondary,
            seriesLabels:
              Array.isArray(stored.seriesLabels) && stored.seriesLabels.length > 0
                ? stored.seriesLabels
                : base[id].seriesLabels,
          });
          // Ensure stored dynamic telemetry never auto-triggers a Yellow/Red warning on startup
          if (base[id].chartType !== "const" && getMeasurementAlertLevel(candidate) !== "normal") {
            return;
          }
          base[id] = candidate;
        }
      });
      return base;
    } catch (_e) {
      return base;
    }
  }

  function saveStoredMeasurements(astronautId, measurementsObj) {
    try {
      var raw = window.localStorage.getItem(MEASUREMENTS_STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : {};
      parsed[astronautId] = measurementsObj;
      window.localStorage.setItem(MEASUREMENTS_STORAGE_KEY, JSON.stringify(parsed));
    } catch (_e) {
      // Ignore storage quota errors.
    }
  }

  function getSeriesDelta(series) {
    if (!Array.isArray(series) || series.length < 2) return 0;
    var minV = Math.min.apply(null, series);
    var maxV = Math.max.apply(null, series);
    return maxV - minV;
  }

  function getRecentSeriesDelta(series, windowLen) {
    if (!Array.isArray(series) || series.length < 2) return 0;
    var sub = series.slice(-Math.max(2, windowLen || 5));
    var minV = Math.min.apply(null, sub);
    var maxV = Math.max.apply(null, sub);
    return maxV - minV;
  }

  // Exact 1..36 importance map matching MEASUREMENT_SPECS order
  var MEASUREMENT_PRIORITY_MAP = {};
  MEASUREMENT_SPECS.forEach(function (spec, idx) {
    MEASUREMENT_PRIORITY_MAP[spec.id] = idx + 1;
  });

  function getMeasurementAlertDetails(item) {
    if (!item || !item.id) {
      return { level: "normal", priority: 99, reason: "", instruction: "" };
    }
    var id = item.id;
    var priority = MEASUREMENT_PRIORITY_MAP[id] || 36;
    var rawVal = String(item.value !== undefined && item.value !== null ? item.value : "");
    var numVal = parseFloat(rawVal);
    var series = Array.isArray(item.series) ? item.series : null;
    var recentDelta = getRecentSeriesDelta(series, 5);

    if (id === "electrocardiogram") {
      if (Number.isFinite(numVal)) {
        if (numVal > 1.65 || numVal < 0.50) {
          return {
            level: "red",
            priority: priority,
            reason: "Dangerous cardiac R-wave amplitude anomaly (" + rawVal + " mV; safe limit 0.50–1.65 mV)",
            instruction: "Halt all physical exertion immediately, attach 12-lead diagnostic ECG monitor, and prepare automated defibrillator / anti-arrhythmic kit.",
          };
        }
        if (numVal > 1.42 || numVal < 0.72) {
          return {
            level: "yellow",
            priority: priority,
            reason: "Concerning ECG R-wave amplitude shift detected (" + rawVal + " mV vs 1.18 mV baseline)",
            instruction: "Rest in neutral microgravity posture and record a 30-second reference ECG strip.",
          };
        }
      }
      return { level: "normal", priority: priority, reason: "", instruction: "" };
    }

    if (id === "heart_rate") {
      if (Number.isFinite(numVal)) {
        if (numVal > 148 || numVal < 48 || recentDelta > 30) {
          return {
            level: "red",
            priority: priority,
            reason: "Critical heart rate excursion (" + rawVal + " bpm; emergency threshold >148 or <48 bpm, or ΔHR >30 bpm)",
            instruction: "Cease all EVA / exercise workload immediately, assume supine restraint position, administer 100% O₂, and open flight surgeon telemetry link.",
          };
        }
        if (numVal >= 125 || numVal < 56 || recentDelta > 22) {
          return {
            level: "yellow",
            priority: priority,
            reason: "Concerning heart rate change detected (" + rawVal + " bpm; elevated above nominal 60–124 bpm envelope)",
            instruction: "Reduce physical workload and monitor pulse recovery over the next 60 seconds.",
          };
        }
      }
      return { level: "normal", priority: priority, reason: "", instruction: "" };
    }

    if (id === "respiration_rate") {
      if (Number.isFinite(numVal)) {
        if (numVal > 26 || numVal < 8 || recentDelta > 8) {
          return {
            level: "red",
            priority: priority,
            reason: "Dangerous respiratory rate instability (" + rawVal + " breaths/min; safe range 8–26 breaths/min)",
            instruction: "Verify suit/cabin O₂ supply line and CO₂ scrubber cartridge immediately; initiate guided slow breathing.",
          };
        }
        if (numVal >= 22 || numVal <= 10 || recentDelta > 6) {
          return {
            level: "yellow",
            priority: priority,
            reason: "Concerning respiration rate shift (" + rawVal + " breaths/min vs nominal 12–21 breaths/min)",
            instruction: "Slow breathing cadence and inspect helmet ventilation airflow.",
          };
        }
      }
      return { level: "normal", priority: priority, reason: "", instruction: "" };
    }

    if (id === "metabolic_rate") {
      if (Number.isFinite(numVal)) {
        if (numVal > 250 || numVal < 55) {
          return {
            level: "red",
            priority: priority,
            reason: "Critical metabolic expenditure spike (" + rawVal + "; exceeds safe LCVG thermal & O₂ capacity >250 kcal/h)",
            instruction: "Abort high-exertion task immediately and increase Liquid Cooling Garment flow to maximum.",
          };
        }
        if (numVal >= 198 || numVal < 68) {
          return {
            level: "yellow",
            priority: priority,
            reason: "Concerning metabolic rate elevation (" + rawVal + "; elevated above 198 kcal/h threshold)",
            instruction: "Pace physical activity to prevent thermal and CO₂ buildup.",
          };
        }
      }
      return { level: "normal", priority: priority, reason: "", instruction: "" };
    }

    if (id === "oxygen_level_in_blood") {
      if (Number.isFinite(numVal)) {
        if (numVal < 92.5 || numVal > 100 || recentDelta >= 5.0) {
          return {
            level: "red",
            priority: priority,
            reason: "Dangerous blood oxygen desaturation (" + rawVal + "% SpO₂; critical hypoxia threshold <92.5%)",
            instruction: "Switch suit/mask regulator to 100% emergency O₂ purge immediately and verify cabin pressure.",
          };
        }
        if (numVal < 95.8 || recentDelta >= 3.0) {
          return {
            level: "yellow",
            priority: priority,
            reason: "Concerning dip in blood oxygen saturation (" + rawVal + "% SpO₂ vs 97–99% nominal)",
            instruction: "Take deep controlled breaths and check pulse oximeter sensor contact.",
          };
        }
      }
      return { level: "normal", priority: priority, reason: "", instruction: "" };
    }

    if (id === "pressure_inside_veins") {
      if (Number.isFinite(numVal)) {
        if (numVal > 9.5 || numVal < 1.5) {
          return {
            level: "red",
            priority: priority,
            reason: "Dangerous central venous pressure deviation (" + rawVal + " mmHg; critical limit >9.5 or <1.5 mmHg)",
            instruction: "Activate lower-body negative pressure (LBNP) countermeasure and contact medical control.",
          };
        }
        if (numVal > 7.8 || numVal < 2.5) {
          return {
            level: "yellow",
            priority: priority,
            reason: "Concerning venous pressure shift (" + rawVal + " mmHg vs nominal 3.5–7.8 mmHg)",
            instruction: "Check hydration status and suit cuff compression.",
          };
        }
      }
      return { level: "normal", priority: priority, reason: "", instruction: "" };
    }

    if (id === "pressure") {
      var parts = rawVal.split("/");
      var sys = parseFloat(parts[0]);
      var dia = parts.length > 1 ? parseFloat(parts[1]) : 75;
      if (Number.isFinite(sys)) {
        if (!Number.isFinite(dia)) dia = 75;
        var diaRecentDelta = getRecentSeriesDelta(item.seriesSecondary, 5);
        if (sys > 155 || sys < 85 || dia > 96 || dia < 52 || recentDelta > 25 || diaRecentDelta > 20) {
          return {
            level: "red",
            priority: priority,
            reason: "Dangerous arterial blood pressure (" + rawVal + " mmHg; breached emergency limit >155/96 or <85/52 mmHg)",
            instruction: "Stop all exertion immediately, secure astronaut in restraint chair, and initiate continuous cuff verification.",
          };
        }
        if (sys > 138 || sys < 94 || dia > 88 || dia < 58 || recentDelta > 18 || diaRecentDelta > 15) {
          return {
            level: "yellow",
            priority: priority,
            reason: "Concerning blood pressure change (" + rawVal + " mmHg; outside nominal 94/58–138/88 mmHg envelope)",
            instruction: "Rest quietly for 5 minutes and re-verify systolic/diastolic trend.",
          };
        }
      }
      return { level: "normal", priority: priority, reason: "", instruction: "" };
    }

    if (id === "co2_level") {
      if (Number.isFinite(numVal)) {
        if (numVal > 4.25 || numVal < 1.0) {
          return {
            level: "red",
            priority: priority,
            reason: "Dangerous CO₂ accumulation (" + rawVal + "; exceeds hypercapnia safety limit >4.25 mmHg)",
            instruction: "Switch to backup LiOH / amine CO₂ scrubber loop immediately and open emergency O₂ bypass.",
          };
        }
        if (numVal > 3.50) {
          return {
            level: "yellow",
            priority: priority,
            reason: "Concerning rise in CO₂ level (" + rawVal + "; exceeds 3.50 mmHg warning threshold)",
            instruction: "Increase helmet/cabin ventilation fan speed and inspect CO₂ scrubber canister.",
          };
        }
      }
      return { level: "normal", priority: priority, reason: "", instruction: "" };
    }

    if (id === "oxygen_left") {
      if (Number.isFinite(numVal)) {
        if (numVal < 25 || numVal > 100) {
          return {
            level: "red",
            priority: priority,
            reason: "Critical O₂ reserve depletion (" + rawVal + "; below 25% emergency reserve)",
            instruction: "Abort EVA / isolated module operations immediately, connect umbilical O₂ feed, and switch to secondary O₂ tank.",
          };
        }
        if (numVal < 40) {
          return {
            level: "yellow",
            priority: priority,
            reason: "Concerning O₂ reserve level (" + rawVal + "; below 40% warning threshold)",
            instruction: "Begin return-to-airlock protocol and monitor O₂ consumption rate.",
          };
        }
      }
      return { level: "normal", priority: priority, reason: "", instruction: "" };
    }

    if (id === "temp_inside_costume") {
      if (Number.isFinite(numVal)) {
        if (numVal > 24.5 || numVal < 17.5 || recentDelta > 2.5) {
          return {
            level: "red",
            priority: priority,
            reason: "Dangerous suit internal temperature (" + rawVal + " °C; thermal runaway / cooling failure outside 17.5–24.5 °C)",
            instruction: "Engage backup sublimator cooling loop immediately and terminate external heat load exposure.",
          };
        }
        if (numVal > 23.3 || numVal < 18.8 || recentDelta > 1.8) {
          return {
            level: "yellow",
            priority: priority,
            reason: "Concerning suit internal temperature drift (" + rawVal + " °C vs 19.0–22.6 °C nominal)",
            instruction: "Adjust LCVG water cooling valve and reduce metabolic heat output.",
          };
        }
      }
      return { level: "normal", priority: priority, reason: "", instruction: "" };
    }

    if (id === "temp_outside_costume") {
      if (Number.isFinite(numVal)) {
        var lastStep =
          series && series.length >= 2 ? Math.abs(series[series.length - 1] - series[series.length - 2]) : 0;
        var inSpaceshipSuitBand = numVal >= 18.0 && numVal <= 23.0 && lastStep <= 6.0;
        var inOuterSpaceSuitBand = numVal >= -273.15 && numVal <= -260.0 && lastStep <= 6.0;
        if (inSpaceshipSuitBand || inOuterSpaceSuitBand) {
          return { level: "normal", priority: priority, reason: "", instruction: "" };
        }
        if (numVal > 40.0 || (numVal < -65.0 && numVal > -245.0) || lastStep > 10.0) {
          return {
            level: "red",
            priority: priority,
            reason: "Extreme external thermal shock (" + rawVal + " °C; exceeds suit insulation safety margin)",
            instruction: "Relocate to shaded/thermally shielded structure immediately and inspect outer MLI suit layer.",
          };
        }
        if (
          (numVal >= 14.0 && numVal < 18.0) ||
          (numVal > 23.0 && numVal <= 40.0) ||
          (numVal <= -35.0 && numVal >= -65.0) ||
          (numVal > -260.0 && numVal <= -245.0) ||
          lastStep > 6.0
        ) {
          return {
            level: "yellow",
            priority: priority,
            reason: "Concerning external temperature swing (" + rawVal + " °C; high orbital thermal gradient)",
            instruction: "Monitor suit sublimator feedwater consumption during sunlit pass.",
          };
        }
      }
      return { level: "normal", priority: priority, reason: "", instruction: "" };
    }

    if (id === "battery_level") {
      if (Number.isFinite(numVal)) {
        if (numVal < 20 || numVal > 100) {
          return {
            level: "red",
            priority: priority,
            reason: "Critical battery power depletion (" + rawVal + "%; below 20% life-support reserve)",
            instruction: "Connect spacecraft umbilical power tether immediately and shed non-essential avionics loads.",
          };
        }
        if (numVal < 35) {
          return {
            level: "yellow",
            priority: priority,
            reason: "Concerning battery discharge level (" + rawVal + "%; below 35% warning threshold)",
            instruction: "Prepare backup battery pack or return to charging station.",
          };
        }
      }
      return { level: "normal", priority: priority, reason: "", instruction: "" };
    }

    if (id === "radiation_exposure") {
      if (Number.isFinite(numVal)) {
        var radStep =
          series && series.length >= 2 ? Math.abs(series[series.length - 1] - series[series.length - 2]) : 0;
        if (numVal > 0.085 || radStep > 0.015) {
          return {
            level: "red",
            priority: priority,
            reason: "Dangerous ionizing radiation spike (" + rawVal + " R; exceeds >0.085 R/sol or Δ >0.015 R/5s solar particle limit)",
            instruction: "Proceed immediately to heavily shielded storm shelter module, orient water-wall shielding, and close viewport shutters.",
          };
        }
        if (numVal > 0.055 || radStep > 0.006) {
          return {
            level: "yellow",
            priority: priority,
            reason: "Concerning radiation exposure elevation (" + rawVal + " R vs <0.055 R/sol nominal röntgen envelope)",
            instruction: "Minimize time near hull exterior and verify personal röntgen dosimeter log.",
          };
        }
      }
      return { level: "normal", priority: priority, reason: "", instruction: "" };
    }

    if (id === "skin_surface") {
      if (Number.isFinite(numVal)) {
        if (numVal > 37.9 || numVal < 35.0 || recentDelta > 1.5) {
          return {
            level: "red",
            priority: priority,
            reason: "Critical skin surface temperature (" + rawVal + " °C; hyperthermia/hypothermia risk outside 35.0–37.9 °C)",
            instruction: "Initiate active thermal countermeasure (cooling garment or warming blanket) and check core temperature.",
          };
        }
        if (numVal > 37.2 || numVal < 35.7 || recentDelta > 1.0) {
          return {
            level: "yellow",
            priority: priority,
            reason: "Concerning skin surface temperature change (" + rawVal + " °C vs 36.0–37.1 °C nominal)",
            instruction: "Check thermal garment flow temperature and hydration.",
          };
        }
      }
      return { level: "normal", priority: priority, reason: "", instruction: "" };
    }

    if (id === "outside_temperature") {
      if (Number.isFinite(numVal)) {
        var inSpaceshipCabBand = numVal >= 19.5 && numVal <= 23.2 && recentDelta <= 2.0;
        var inOuterSpaceBand = numVal >= -273.15 && numVal <= -260.0 && recentDelta <= 2.0;
        if (inSpaceshipCabBand || inOuterSpaceBand) {
          return { level: "normal", priority: priority, reason: "", instruction: "" };
        }
        if (numVal > 25.0 || (numVal < 18.0 && numVal > -245.0) || recentDelta > 3.0) {
          return {
            level: "red",
            priority: priority,
            reason: "Dangerous outside / habitat temperature anomaly (" + rawVal + " °C; thermal control loop fault)",
            instruction: "Switch cabin/suit ECLSS heat exchanger to secondary loop and inspect ammonia radiator bypass.",
          };
        }
        if (
          (numVal > 23.2 && numVal <= 25.0) ||
          (numVal >= 18.0 && numVal < 19.5) ||
          (numVal <= -245.0 && numVal > -260.0) ||
          recentDelta > 2.0
        ) {
          return {
            level: "yellow",
            priority: priority,
            reason: "Concerning outside / habitat temperature drift (" + rawVal + " °C vs nominal thermal envelope)",
            instruction: "Verify thermal control circulation and insulation setpoint.",
          };
        }
      }
      return { level: "normal", priority: priority, reason: "", instruction: "" };
    }

    if (id === "humidity") {
      if (Number.isFinite(numVal)) {
        if (numVal > 60.0 || numVal < 25.0 || recentDelta > 15.0) {
          return {
            level: "red",
            priority: priority,
            reason: "Critical cabin humidity imbalance (" + rawVal + "%; condensation / avionics hazard outside 25–60%)",
            instruction: "Engage backup water separator assembly and inspect cabin condensing heat exchanger.",
          };
        }
        if (numVal > 52.0 || numVal < 34.0 || recentDelta > 10.0) {
          return {
            level: "yellow",
            priority: priority,
            reason: "Concerning cabin humidity change (" + rawVal + "% vs 40–50% nominal)",
            instruction: "Check cabin dehumidifier condensate line.",
          };
        }
      }
      return { level: "normal", priority: priority, reason: "", instruction: "" };
    }

    if (id === "sleep_amount") {
      if (Number.isFinite(numVal)) {
        if (numVal < 5.5 || numVal > 10.5) {
          return {
            level: "red",
            priority: priority,
            reason: "Critical sleep deficit (" + rawVal + " hours/sol; >2 hours/sol below 7.5 hours/sol circadian baseline)",
            instruction: "Reschedule high-risk EVA/robotics tasks and mandate recovery sleep block.",
          };
        }
        if (numVal < 6.5 || numVal > 9.2) {
          return {
            level: "yellow",
            priority: priority,
            reason: "Concerning sleep duration change (" + rawVal + " hours/sol vs 7.5 hours/sol target)",
            instruction: "Adjust cabin circadian lighting schedule before next sol sleep shift.",
          };
        }
      }
      return { level: "normal", priority: priority, reason: "", instruction: "" };
    }

    if (id === "exercise_activity") {
      if (Number.isFinite(numVal)) {
        if (numVal < 63 || numVal > 150) {
          return {
            level: "red",
            priority: priority,
            reason: "Critical countermeasure exercise deviation (" + rawVal + "; >30% below 90 min/sol bone/muscle target)",
            instruction: "Schedule mandatory ARED resistive + T2 treadmill session to prevent microgravity bone/muscle loss.",
          };
        }
        if (numVal < 74 || numVal > 130) {
          return {
            level: "yellow",
            priority: priority,
            reason: "Concerning exercise activity deviation (" + rawVal + " vs 90 min/sol target)",
            instruction: "Complete remaining aerobic/resistive protocol before end of current sol.",
          };
        }
      }
      return { level: "normal", priority: priority, reason: "", instruction: "" };
    }

    return { level: "normal", priority: priority, reason: "", instruction: "" };
  }

  function getMeasurementAlertLevel(item) {
    return getMeasurementAlertDetails(item).level;
  }

  var TEST_WARNING_PRESETS = {
    heart_rate: {
      yellow: {
        value: "132",
        series: [82, 86, 92, 98, 104, 110, 115, 118, 121, 124, 126, 128, 129, 130, 131, 130, 131, 132, 131, 132],
      },
      red: {
        value: "158",
        series: [88, 95, 104, 112, 120, 128, 135, 142, 146, 150, 152, 154, 155, 156, 157, 156, 157, 158, 157, 158],
      },
    },
    pressure: {
      yellow: {
        value: "142/90",
        series: [118, 120, 122, 125, 128, 130, 132, 134, 136, 138, 139, 140, 141, 141, 142, 141, 142, 142, 141, 142],
        seriesSecondary: [76, 77, 78, 80, 81, 82, 84, 85, 86, 87, 88, 88, 89, 89, 90, 89, 90, 90, 89, 90],
      },
      red: {
        value: "164/102",
        series: [120, 125, 130, 136, 142, 146, 150, 154, 156, 158, 160, 161, 162, 163, 163, 164, 163, 164, 164, 164],
        seriesSecondary: [78, 80, 83, 86, 89, 92, 94, 96, 98, 99, 100, 100, 101, 101, 102, 101, 102, 102, 101, 102],
      },
    },
    oxygen_level_in_blood: {
      yellow: {
        value: "94.8",
        series: [98.4, 98.2, 97.9, 97.5, 97.1, 96.8, 96.4, 96.0, 95.7, 95.4, 95.2, 95.0, 94.9, 94.8, 94.9, 94.8, 94.8, 94.9, 94.8, 94.8],
      },
      red: {
        value: "89.4",
        series: [97.5, 96.8, 96.0, 95.1, 94.2, 93.4, 92.6, 91.8, 91.2, 90.6, 90.2, 89.9, 89.7, 89.5, 89.4, 89.5, 89.4, 89.3, 89.4, 89.4],
      },
    },
    co2_level: {
      yellow: {
        value: "3.78 mmHg (4974 ppm)",
        series: [2.75, 2.88, 3.02, 3.15, 3.28, 3.40, 3.52, 3.60, 3.66, 3.70, 3.73, 3.75, 3.76, 3.77, 3.78, 3.78],
      },
      red: {
        value: "4.65 mmHg (6118 ppm)",
        series: [2.90, 3.15, 3.40, 3.65, 3.90, 4.10, 4.25, 4.38, 4.46, 4.52, 4.56, 4.60, 4.62, 4.64, 4.65, 4.65],
      },
    },
    radiation_exposure: {
      yellow: {
        value: "0.068",
        series: [0.038, 0.041, 0.046, 0.052, 0.058, 0.063, 0.068],
      },
      red: {
        value: "0.145",
        series: [0.040, 0.056, 0.075, 0.096, 0.116, 0.132, 0.145],
      },
    },
    electrocardiogram: {
      yellow: {
        value: "1.48",
        series: [
          0.20, -0.18, 1.48, -0.34, 0.30,
          0.20, -0.18, 1.47, -0.33, 0.29,
          0.21, -0.19, 1.48, -0.34, 0.30,
          0.20, -0.18, 1.46, -0.33, 0.29,
          0.20, -0.18, 1.48, -0.34, 0.30,
        ],
      },
      red: {
        value: "1.78",
        series: [
          0.26, -0.24, 1.78, -0.42, 0.36,
          0.25, -0.23, 1.76, -0.41, 0.35,
          0.26, -0.24, 1.78, -0.42, 0.36,
          0.25, -0.24, 1.77, -0.41, 0.35,
          0.26, -0.24, 1.78, -0.42, 0.36,
        ],
      },
    },
    respiration_rate: {
      yellow: {
        value: "23",
        series: [14, 15, 16, 18, 19, 20, 21, 22, 22, 23, 23, 23],
      },
      red: {
        value: "30",
        series: [15, 17, 19, 22, 24, 26, 27, 28, 29, 30, 30, 30],
      },
    },
    oxygen_left: {
      yellow: { value: "34.20% (205 L / 101.2 kPa)" },
      red: { value: "18.50% (111 L / 100.8 kPa)" },
    },
    battery_level: {
      yellow: { value: "28.40" },
      red: { value: "14.20" },
    },
    temp_inside_costume: {
      yellow: {
        value: "23.7",
        series: [21.8, 22.0, 22.2, 22.5, 22.7, 22.9, 23.1, 23.2, 23.4, 23.5, 23.6, 23.6, 23.7, 23.7, 23.7, 23.7],
      },
      red: {
        value: "25.4",
        series: [22.0, 22.4, 22.8, 23.2, 23.6, 24.0, 24.3, 24.6, 24.8, 25.0, 25.1, 25.2, 25.3, 25.4, 25.4, 25.4],
      },
    },
    temp_outside_costume: {
      yellow: {
        value: "16.8",
        series: [-12.0, -8.5, -4.0, 0.5, 4.2, 7.5, 10.2, 12.4, 14.0, 15.1, 15.8, 16.2, 16.5, 16.7, 16.8, 16.8],
      },
      red: {
        value: "44.5",
        series: [5.0, 10.0, 16.0, 22.0, 27.5, 32.0, 35.5, 38.2, 40.5, 42.0, 43.0, 43.6, 44.0, 44.3, 44.5, 44.5],
      },
    },
    pressure_inside_veins: {
      yellow: { value: "8.4" },
      red: { value: "10.6" },
    },
    metabolic_rate: {
      yellow: { value: "215.0 kcal/h (250 W)" },
      red: { value: "278.0 kcal/h (323 W)" },
    },
    skin_surface: {
      yellow: {
        value: "37.5",
        series: [36.4, 36.5, 36.7, 36.8, 37.0, 37.1, 37.2, 37.3, 37.4, 37.4, 37.5, 37.5],
      },
      red: {
        value: "38.4",
        series: [36.5, 36.8, 37.1, 37.4, 37.6, 37.8, 38.0, 38.1, 38.2, 38.3, 38.4, 38.4],
      },
    },
    outside_temperature: {
      yellow: {
        value: "23.8",
        series: [21.4, 21.7, 22.0, 22.3, 22.6, 22.9, 23.2, 23.4, 23.6, 23.7, 23.8, 23.8],
      },
      red: {
        value: "26.2",
        series: [21.6, 22.2, 22.8, 23.5, 24.1, 24.7, 25.2, 25.6, 25.9, 26.1, 26.2, 26.2],
      },
    },
    humidity: {
      yellow: {
        value: "54.5",
        series: [44.0, 45.5, 47.0, 48.5, 50.0, 51.2, 52.4, 53.2, 53.8, 54.2, 54.5, 54.5],
      },
      red: {
        value: "64.0",
        series: [45.0, 48.0, 51.0, 54.0, 56.5, 58.8, 60.5, 61.8, 62.8, 63.5, 64.0, 64.0],
      },
    },
    sleep_amount: {
      yellow: {
        value: "6.0",
        series: [7.8, 7.2, 8.0, 6.9, 7.4, 7.6, 6.0],
      },
      red: {
        value: "4.8",
        series: [7.8, 7.2, 8.0, 6.9, 7.4, 7.6, 4.8],
      },
    },
    exercise_activity: {
      yellow: {
        value: "68 min/sol (483 kcal/sol)",
        series: [85, 90, 95, 80, 90, 100, 68],
      },
      red: {
        value: "52 min/sol (369 kcal/sol)",
        series: [85, 90, 95, 80, 90, 100, 52],
      },
    },
  };

  var WARNING_LOGS_STORAGE_KEY = "ahs_warning_logs_v3";

  function getCountermeasuresForWarning(specId, severity, fallbackInstruction) {
    if (fallbackInstruction && String(fallbackInstruction).trim()) {
      return String(fallbackInstruction).trim();
    }
    var isRed = severity === "red";
    var map = {
      electrocardiogram: isRed
        ? "1. Halt all physical exertion immediately and secure astronaut in restraint harness. 2. Attach 12-lead diagnostic ECG monitor and prepare automated external defibrillator (AED) + emergency anti-arrhythmic kit. 3. Administer 100% O₂ and open live flight surgeon telemetry channel."
        : "1. Pause physical workload and assume neutral microgravity posture. 2. Check chest ECG electrode adhesion and lead impedance. 3. Record a 30-second reference ECG strip for flight surgeon review.",
      heart_rate: isRed
        ? "1. Cease all EVA / exercise workload immediately and restrain in supine microgravity posture. 2. Administer 100% emergency O₂ purge and increase LCVG cooling to maximum. 3. If HR <= 5 bpm (asystole), initiate CPR / defibrillation protocol and alert flight surgeon."
        : "1. Reduce physical exertion cadence and rest for 60–120 seconds. 2. Hydrate with 250 mL electrolyte solution via drink bag. 3. Monitor pulse recovery toward 75–90 bpm baseline.",
      oxygen_level_in_blood: isRed
        ? "1. Switch suit/mask regulator to 100% emergency O₂ purge flow immediately. 2. Verify suit/cabin total pressure and inspect O₂ umbilical line for kinks or leaks. 3. Abort EVA or isolate affected cabin module."
        : "1. Perform slow, deep diaphragmatic breathing for 60 seconds. 2. Verify helmet visor airflow and pulse oximeter sensor placement. 3. Increase O₂ partial pressure regulator slightly if SpO₂ remains <96%.",
      pressure: isRed
        ? "1. Stop all physical activity immediately and secure astronaut in restraint chair. 2. Run continuous cuff verification; if hypotensive (<85/52 mmHg), engage lower-body compression garment and IV/oral fluid bolus; if hypertensive (>155/96 mmHg), administer prescribed vasodilator/antihypertensive per flight surgeon."
        : "1. Rest quietly in neutral posture for 5 minutes and re-verify systolic/diastolic trend. 2. Reduce sodium intake and verify fluid-loading balance for current sol.",
      respiration_rate: isRed
        ? "1. Verify suit/cabin O₂ supply line and LiOH/amine CO₂ scrubber cartridge immediately. 2. Switch to backup ventilation loop and guide paced breathing (12–15 breaths/min)."
        : "1. Slow breathing cadence using guided 4-second inhale / 4-second exhale protocol. 2. Inspect helmet ventilation fan airflow and CO₂ sensor reading.",
      oxygen_left: isRed
        ? "1. Abort EVA / isolated module operations immediately and return to airlock. 2. Connect spacecraft umbilical O₂ feed and open secondary emergency O₂ reserve tank."
        : "1. Begin return-to-airlock protocol and reduce metabolic exertion to conserve O₂. 2. Cross-check primary tank pressure regulator and reserve valve.",
      co2_level: isRed
        ? "1. Switch to backup LiOH / amine CO₂ scrubber loop immediately. 2. Open emergency O₂ helmet purge bypass to flush accumulated CO₂."
        : "1. Increase helmet/cabin ventilation fan speed to high. 2. Inspect CO₂ scrubber canister saturation indicator and schedule cartridge swap.",
      battery_level: isRed
        ? "1. Connect spacecraft umbilical power tether immediately. 2. Shed all non-essential avionics/lighting loads to preserve life-support ECLSS/LCVG power."
        : "1. Activate power-saving mode on auxiliary suit/module systems. 2. Prepare backup battery pack or return to charging station.",
      radiation_exposure: isRed
        ? "1. Relocate immediately to heavily shielded storm shelter module. 2. Orient water-wall / polyethylene radiation shielding and close all viewport shutters. 3. Log cumulative röntgen dose and administer radioprotective countermeasure if prescribed."
        : "1. Minimize time near hull exterior or unshielded viewports during SAA / solar flux pass. 2. Verify personal röntgen dosimeter badge and apply localized shielding.",
      temp_inside_costume: isRed
        ? "1. Engage backup sublimator / LCVG cooling loop immediately at 100% flow. 2. Terminate external thermal heat load exposure and halt physical exertion."
        : "1. Adjust Liquid Cooling and Ventilation Garment (LCVG) water mixing valve cooler. 2. Reduce metabolic workload and check coolant pump flow rate.",
      temp_outside_costume: isRed
        ? "1. Relocate immediately to shaded / thermally shielded spacecraft structure. 2. Inspect outer Multi-Layer Insulation (MLI) suit layer and monitor sublimator water usage."
        : "1. Rotate work orientation to avoid direct solar radiative heating or deep-shadow chill. 2. Monitor LCVG inlet/outlet temperature differential.",
      pressure_inside_veins: isRed
        ? "1. Activate Lower-Body Negative Pressure (LBNP) countermeasure device immediately. 2. Adjust thigh venous occlusion cuffs and contact medical control."
        : "1. Check hydration status and adjust suit compression cuff tension. 2. Perform gentle lower-extremity muscle pump contractions.",
      metabolic_rate: isRed
        ? "1. Abort high-exertion task immediately and rest in restraint harness. 2. Set LCVG cooling flow and helmet ventilation to maximum to clear excess heat and CO₂."
        : "1. Pace physical task cadence to keep metabolic expenditure below 185 kcal/h. 2. Sip cool water from suit hydration bag.",
      skin_surface: isRed
        ? "1. Initiate active thermal countermeasure (maximize LCVG cooling water flow if >37.9 °C, or activate suit heater / thermal blanket if <35.0 °C). 2. If caused by high radiation exposure, apply topical soothing hydrogel and move to radiation shelter."
        : "1. Adjust LCVG thermal garment flow temperature by 1–2 °C. 2. Re-check core body temperature and radiation dosimeter reading.",
      outside_temperature: isRed
        ? "1. Switch cabin ECLSS heat exchanger to secondary coolant loop immediately. 2. Inspect external ammonia radiator bypass valve and isolate faulty thermal zone."
        : "1. Verify cabin air circulation ducting and adjust module thermostat setpoint to 21.4 °C.",
      humidity: isRed
        ? "1. Engage backup rotary water separator assembly immediately. 2. Inspect cabin condensing heat exchanger to prevent avionics condensation hazard."
        : "1. Increase cabin dehumidifier fan speed and inspect condensate collection line.",
      sleep_amount: isRed
        ? "1. Reschedule all high-risk EVA and robotics operations for current sol. 2. Mandate an uninterrupted 8.5-hour recovery sleep block with blue-depleted circadian lighting."
        : "1. Adjust cabin circadian lighting schedule (450 nm blue light suppressed 2 hours pre-sleep) and schedule a 45-minute recovery nap.",
      exercise_activity: isRed
        ? "1. Schedule mandatory ARED resistive + T2 treadmill countermeasure session (90 min/sol) to prevent microgravity bone demineralization and muscle atrophy."
        : "1. Complete remaining aerobic/resistive exercise protocol before end of current sol.",
    };
    return (
      map[specId] ||
      "1. Reduce physical workload and verify sensor calibration. 2. Apply standard ECLSS/medical countermeasure protocol and notify flight surgeon."
    );
  }

  function computeRecentRecordsStats(seriesArr) {
    if (!Array.isArray(seriesArr) || seriesArr.length === 0) {
      return { min: 0, max: 0, mean: 0, netDelta: 0, maxStep: 0, maxStepDelta: 0 };
    }
    var nums = seriesArr
      .map(function (n) {
        return typeof n === "number" ? n : parseFloat(n);
      })
      .filter(function (n) {
        return Number.isFinite(n);
      });
    if (nums.length === 0) {
      return { min: 0, max: 0, mean: 0, netDelta: 0, maxStep: 0, maxStepDelta: 0 };
    }
    var minV = Math.min.apply(null, nums);
    var maxV = Math.max.apply(null, nums);
    var sum = nums.reduce(function (acc, v) {
      return acc + v;
    }, 0);
    var meanV = sum / nums.length;
    var netDelta = nums.length >= 2 ? nums[nums.length - 1] - nums[0] : 0;
    var maxStep = 0;
    for (var i = 1; i < nums.length; i++) {
      var st = Math.abs(nums[i] - nums[i - 1]);
      if (st > maxStep) maxStep = st;
    }
    var roundedStep = Number(maxStep.toFixed(3));
    return {
      min: Number(minV.toFixed(3)),
      max: Number(maxV.toFixed(3)),
      mean: Number(meanV.toFixed(3)),
      netDelta: Number(netDelta.toFixed(3)),
      maxStep: roundedStep,
      maxStepDelta: roundedStep,
    };
  }

  function normalizeWarningLogEntry(raw, idx, fallbackSol) {
    if (!raw || typeof raw !== "object") return null;
    var specId = raw.specId || "heart_rate";
    var matchedSpec =
      MEASUREMENT_SPECS.find(function (s) {
        return s.id === specId;
      }) || MEASUREMENT_SPECS[1] || MEASUREMENT_SPECS[0];
    var uniqueId = String(raw.id || raw.logId || "WLOG-SEED-" + (idx + 1) + "-" + specId);
    var recsRaw = Array.isArray(raw.recentRecords)
      ? raw.recentRecords
      : Array.isArray(raw.recentSeries)
      ? raw.recentSeries
      : [];
    var recs = recsRaw
      .map(function (v) {
        return typeof v === "number" ? v : parseFloat(v);
      })
      .filter(function (n) {
        return Number.isFinite(n);
      });
    var secRaw = Array.isArray(raw.recentSecondary) ? raw.recentSecondary : null;
    var sec = secRaw
      ? secRaw
          .map(function (v) {
            return typeof v === "number" ? v : parseFloat(v);
          })
          .filter(function (n) {
            return Number.isFinite(n);
          })
      : null;
    var lbls = Array.isArray(raw.recentLabels) ? raw.recentLabels.slice() : [];
    if (lbls.length < recs.length) {
      lbls = recs.map(function (_, i) {
        var rem = recs.length - 1 - i;
        return rem === 0 ? "Trigger" : "-" + rem + "s";
      });
    }
    var trigVal =
      raw.triggerValue !== undefined && raw.triggerValue !== null
        ? String(raw.triggerValue)
        : raw.triggeredValue !== undefined && raw.triggeredValue !== null
        ? String(raw.triggeredValue)
        : recs.length > 0
        ? String(recs[recs.length - 1])
        : "N/A";

    return {
      id: uniqueId,
      specId: specId,
      source:
        raw.source ||
        (uniqueId.indexOf("WLOG-SEED-") === 0 ? "SIMULATED SAMPLE" : "SIMULATED TELEMETRY"),
      measurementName: String(raw.measurementName || raw.parameterName || matchedSpec.name || "Parameter"),
      priority: Number(raw.priority || MEASUREMENT_PRIORITY_MAP[specId] || 1),
      severity: raw.severity === "red" ? "red" : "yellow",
      status: String(raw.status || "Under Review"),
      sol: Number(raw.sol || fallbackSol || 142),
      timestamp: String(raw.timestamp || "15/11/2026 09:42:18"),
      triggerValue: trigVal,
      initialTriggerValue: String(raw.initialTriggerValue || trigVal),
      peakValue: String(raw.peakValue || trigVal),
      updateCount: Number(raw.updateCount || 1),
      unit: String(raw.unit || matchedSpec.unit || ""),
      thresholdRule: String(raw.thresholdRule || matchedSpec.threshold || ""),
      reason: String(raw.reason || "Concerning telemetry change detected."),
      chartType: String(raw.chartType || matchedSpec.chartType || "line"),
      recentRecords: recs,
      recentSecondary: sec && sec.length > 0 ? sec : null,
      recentLabels: lbls,
      concurrentSnapshot: String(raw.concurrentSnapshot || raw.contextSnapshot || "N/A"),
      countermeasures: String(
        raw.countermeasures || getCountermeasuresForWarning(specId, raw.severity, raw.instruction)
      ),
      isAdditionalCritical: Boolean(raw.isAdditionalCritical),
      analysisNotes: String(raw.analysisNotes || ""),
      manuallyEdited: Boolean(raw.manuallyEdited),
    };
  }

  function buildDefaultWarningLogs(astronaut) {
    var solNum = (astronaut && astronaut.missionDay) || 142;
    var seeds = [
      {
        id: "WLOG-SEED-1",
        specId: "heart_rate",
        measurementName: "Heart rate",
        priority: 2,
        severity: "yellow",
        status: "Under Review",
        sol: solNum,
        timestamp: "15/11/2026 09:42:18",
        triggerValue: "128",
        initialTriggerValue: "125",
        peakValue: "128",
        updateCount: 2,
        unit: "bpm",
        thresholdRule: "Δ HR > 30 bpm within 30s",
        reason: "Concerning heart rate change detected (128 bpm; elevated above nominal 60–124 bpm envelope)",
        chartType: "line",
        recentRecords: [84, 89, 95, 102, 108, 114, 119, 123, 126, 128],
        recentLabels: ["-9s", "-8s", "-7s", "-6s", "-5s", "-4s", "-3s", "-2s", "-1s", "Trigger"],
        concurrentSnapshot: "HR: 128 bpm | BP: 124/79 mmHg | SpO2: 97.8% | RR: 19 breaths/min | Suit Temp: 22.4 °C | Rad: 0.039 R",
        analysisNotes:
          "Transient tachycardia observed during peak ARED resistive squat set. Recent 10-second records show smooth +4.4 bpm/s ramp without ectopic beats.",
      },
      {
        id: "WLOG-SEED-2",
        specId: "radiation_exposure",
        measurementName: "Radiation exposure",
        priority: 9,
        severity: "yellow",
        status: "Monitoring",
        sol: solNum,
        timestamp: "15/11/2026 08:15:05",
        triggerValue: "0.068",
        initialTriggerValue: "0.058",
        peakValue: "0.068",
        updateCount: 3,
        unit: "R (röntgen)",
        thresholdRule: "Δ Radiation > 0.006 R within 5s or > 0.055 R/sol (Warning) | > 0.085 R/sol (SOS)",
        reason: "Concerning radiation exposure elevation (0.068 R vs <0.055 R/sol nominal röntgen envelope)",
        chartType: "line",
        recentRecords: [0.038, 0.041, 0.045, 0.050, 0.056, 0.062, 0.068],
        recentLabels: ["-6s", "-5s", "-4s", "-3s", "-2s", "-1s", "Trigger"],
        concurrentSnapshot: "HR: 76 bpm | BP: 116/75 mmHg | SpO2: 98.6% | RR: 14 breaths/min | Suit Temp: 21.5 °C | Rad: 0.068 R",
        analysisNotes:
          "South Atlantic Anomaly (SAA) orbital transit increased röntgen flux from 0.038 R to 0.068 R. Crew remained inside shielded module.",
      },
      {
        id: "WLOG-SEED-3",
        specId: "pressure",
        measurementName: "Pressure",
        priority: 4,
        severity: "yellow",
        status: "Resolved — Countermeasure Applied",
        sol: Math.max(1, solNum - 1),
        timestamp: "14/11/2026 19:28:40",
        triggerValue: "148/94",
        initialTriggerValue: "144/91",
        peakValue: "148/94",
        updateCount: 2,
        unit: "mmHg",
        thresholdRule: "Δ SYS > 22 mmHg or Δ DIA > 14 mmHg within 60s (142/90 Warning | 160/100 SOS)",
        reason: "Concerning blood pressure elevation (148/94 mmHg; normal resting <142/90 mmHg)",
        chartType: "line",
        recentRecords: [122, 126, 131, 136, 141, 145, 148],
        recentSecondary: [78, 80, 83, 86, 89, 92, 94],
        recentLabels: ["-6s", "-5s", "-4s", "-3s", "-2s", "-1s", "Trigger"],
        concurrentSnapshot: "HR: 112 bpm | BP: 148/94 mmHg | SpO2: 97.4% | RR: 20 breaths/min | Suit Temp: 22.8 °C | Rad: 0.038 R",
        analysisNotes:
          "Systolic/diastolic pressure rose to 148/94 mmHg during heavy lower-body exercise protocol; normalized within 3 minutes of cooldown.",
      },
    ];
    return seeds.map(function (s, idx) {
      return normalizeWarningLogEntry(s, idx, solNum);
    });
  }

  function loadStoredWarningLogs(astronautId, astronaut) {
    var solNum = (astronaut && astronaut.missionDay) || 142;
    var fallback = buildDefaultWarningLogs(astronaut);
    try {
      var raw = window.localStorage.getItem(WARNING_LOGS_STORAGE_KEY);
      if (!raw) return fallback;
      var parsed = JSON.parse(raw);
      var list = parsed && parsed[astronautId];
      if (!Array.isArray(list) || list.length === 0) return fallback;
      var seenIds = {};
      return list
        .map(function (entry, idx) {
          var norm = normalizeWarningLogEntry(entry, idx, solNum);
          if (!norm) return null;
          if (seenIds[norm.id]) {
            norm.id = norm.id + "-" + idx;
          }
          seenIds[norm.id] = true;
          return norm;
        })
        .filter(Boolean);
    } catch (_e) {
      return fallback;
    }
  }

  function saveStoredWarningLogs(astronautId, logsList) {
    try {
      var raw = window.localStorage.getItem(WARNING_LOGS_STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : {};
      parsed[astronautId] = logsList;
      window.localStorage.setItem(WARNING_LOGS_STORAGE_KEY, JSON.stringify(parsed));
    } catch (_e) {
      // Ignore storage quota errors.
    }
  }

  function MeasurementLineChartSvg(props) {
    var series = Array.isArray(props.series) && props.series.length > 0 ? props.series : [0, 1, 0];
    var seriesSecondary =
      Array.isArray(props.seriesSecondary) && props.seriesSecondary.length > 0 ? props.seriesSecondary : null;
    var labels = Array.isArray(props.labels) ? props.labels : [];
    var unit = props.unit && props.unit !== "N/A" ? props.unit : "";
    var mini = Boolean(props.mini);
    var isOrange = Boolean(props.isOrange);
    var alertLevel = props.alertLevel || "normal";

    var width = mini ? 180 : 580;
    var height = mini ? 46 : 210;
    var padLeft = mini ? 4 : 44;
    var padRight = mini ? 4 : 20;
    var padTop = mini ? 5 : 22;
    var padBottom = mini ? 5 : 34;

    var combined = seriesSecondary ? series.concat(seriesSecondary) : series;
    var minVal = Math.min.apply(null, combined);
    var maxVal = Math.max.apply(null, combined);
    if (unit === "bpm") {
      minVal = Math.min(55, minVal - 4);
      maxVal = Math.max(130, maxVal + 8);
    } else if (unit === "mV") {
      minVal = Math.min(-0.42, minVal - 0.05);
      maxVal = Math.max(1.32, maxVal + 0.05);
    } else if (unit === "mmHg" && seriesSecondary) {
      minVal = Math.min(55, minVal - 6);
      maxVal = Math.max(145, maxVal + 8);
    } else if (unit === "% (SpO2)") {
      minVal = Math.min(95.0, minVal - 0.5);
      maxVal = Math.max(100.0, maxVal + 0.2);
    } else if (maxVal - minVal < 1.2) {
      var mid = (maxVal + minVal) / 2;
      minVal = mid - 0.8;
      maxVal = mid + 0.8;
    } else {
      var padSpan = (maxVal - minVal) * 0.15;
      minVal -= padSpan;
      maxVal += padSpan;
    }
    var range = Math.max(0.001, maxVal - minVal);
    var plotW = width - padLeft - padRight;
    var plotH = height - padTop - padBottom;

    var points = series.map(function (val, idx) {
      var x = padLeft + (series.length > 1 ? (idx / (series.length - 1)) * plotW : plotW / 2);
      var y = padTop + plotH - ((val - minVal) / range) * plotH;
      return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)), val: val, label: labels[idx] || "#" + (idx + 1) };
    });

    var polylineStr = points
      .map(function (p) {
        return p.x + "," + p.y;
      })
      .join(" ");

    var areaStr =
      points[0].x +
      "," +
      (padTop + plotH) +
      " " +
      polylineStr +
      " " +
      points[points.length - 1].x +
      "," +
      (padTop + plotH);

    var secondaryPolylineStr = null;
    if (seriesSecondary && seriesSecondary.length > 0) {
      secondaryPolylineStr = seriesSecondary
        .map(function (val, idx) {
          var x = padLeft + (seriesSecondary.length > 1 ? (idx / (seriesSecondary.length - 1)) * plotW : plotW / 2);
          var y = padTop + plotH - ((val - minVal) / range) * plotH;
          return Number(x.toFixed(1)) + "," + Number(y.toFixed(1));
        })
        .join(" ");
    }

    var strokeColor =
      alertLevel === "red"
        ? "#fecaca"
        : alertLevel === "yellow"
        ? "#ffffff"
        : isOrange
        ? "#fde68a"
        : "#38bdf8";
    var fillColor =
      alertLevel === "red"
        ? "rgba(254, 202, 202, 0.22)"
        : alertLevel === "yellow"
        ? "rgba(255, 255, 255, 0.22)"
        : isOrange
        ? "rgba(253, 230, 138, 0.18)"
        : "rgba(56, 189, 248, 0.18)";

    return h(
      "svg",
      {
        className: mini ? "meas-mini-chart-svg" : "meas-full-chart-svg",
        viewBox: "0 0 " + width + " " + height,
        role: "img",
        "aria-label": "Line graph visualization",
      },
      !mini
        ? [0, 0.5, 1].map(function (ratio, idx) {
            var yPos = Number((padTop + plotH * (1 - ratio)).toFixed(1));
            var tickVal = (minVal + range * ratio).toFixed(range < 8 ? 2 : 0);
            return h(
              "g",
              { key: "grid-" + idx },
              h("line", {
                x1: padLeft,
                y1: yPos,
                x2: width - padRight,
                y2: yPos,
                stroke: "rgba(255,255,255,0.18)",
                strokeDasharray: "3,3",
              }),
              h(
                "text",
                {
                  x: padLeft - 6,
                  y: yPos + 4,
                  textAnchor: "end",
                  fill: "#dbeafe",
                  fontSize: "10",
                },
                tickVal
              )
            );
          })
        : null,
      h("polygon", { points: areaStr, fill: fillColor }),
      secondaryPolylineStr
        ? h("polyline", {
            fill: "none",
            stroke: "rgba(255, 255, 255, 0.72)",
            strokeWidth: mini ? "1.6" : "2.1",
            strokeDasharray: "4,3",
            strokeLinecap: "round",
            strokeLinejoin: "round",
            points: secondaryPolylineStr,
          })
        : null,
      h("polyline", {
        fill: "none",
        stroke: strokeColor,
        strokeWidth: mini ? "2" : "2.6",
        strokeLinecap: "round",
        strokeLinejoin: "round",
        points: polylineStr,
      }),
      !mini
        ? points.map(function (pt, idx) {
            var showLabel = series.length <= 10 || idx % 2 === 0 || idx === series.length - 1;
            return h(
              "g",
              { key: "pt-" + idx },
              h("circle", {
                cx: pt.x,
                cy: pt.y,
                r: "3.2",
                fill: "#ffffff",
                stroke: strokeColor,
                strokeWidth: "1.8",
              }),
              showLabel
                ? h(
                    "text",
                    {
                      x: pt.x,
                      y: height - 10,
                      textAnchor: "middle",
                      fill: "#dbeafe",
                      fontSize: "10",
                    },
                    pt.label
                  )
                : null
            );
          })
        : null,
      !mini && unit
        ? h(
            "text",
            {
              x: width - padRight,
              y: 14,
              textAnchor: "end",
              fill: "#93c5fd",
              fontSize: "11",
              fontWeight: "600",
            },
            seriesSecondary ? "Solid: Systolic | Dashed: Diastolic (" + unit + ")" : "Unit: " + unit
          )
        : null
    );
  }

  function MeasurementColumnChartSvg(props) {
    var series = Array.isArray(props.series) && props.series.length > 0 ? props.series : [1, 2, 3];
    var labels = Array.isArray(props.labels) ? props.labels : [];
    var mini = Boolean(props.mini);
    var isOrange = Boolean(props.isOrange);
    var alertLevel = props.alertLevel || "normal";

    var width = mini ? 180 : 580;
    var height = mini ? 46 : 210;
    var padLeft = mini ? 4 : 40;
    var padRight = mini ? 4 : 18;
    var padTop = mini ? 6 : 26;
    var padBottom = mini ? 4 : 34;

    var maxVal = Math.max.apply(null, series.concat([0.001])) * 1.12;
    var plotW = width - padLeft - padRight;
    var plotH = height - padTop - padBottom;
    var slotW = plotW / series.length;
    var barW = Math.max(mini ? 8 : 22, Math.min(mini ? 18 : 48, slotW * 0.64));
    var barFill =
      alertLevel === "red"
        ? "#fecaca"
        : alertLevel === "yellow"
        ? "#ffffff"
        : isOrange
        ? "#fde68a"
        : "#38bdf8";

    return h(
      "svg",
      {
        className: mini ? "meas-mini-chart-svg" : "meas-full-chart-svg",
        viewBox: "0 0 " + width + " " + height,
        role: "img",
        "aria-label": "Column graph visualization",
      },
      !mini
        ? [0, 0.5, 1].map(function (ratio, idx) {
            var yPos = Number((padTop + plotH * (1 - ratio)).toFixed(1));
            var tickVal = (maxVal * ratio).toFixed(maxVal < 0.2 ? 3 : maxVal < 5 ? 2 : 0);
            return h(
              "g",
              { key: "cgrid-" + idx },
              h("line", {
                x1: padLeft,
                y1: yPos,
                x2: width - padRight,
                y2: yPos,
                stroke: "rgba(255,255,255,0.18)",
                strokeDasharray: "3,3",
              }),
              h(
                "text",
                {
                  x: padLeft - 6,
                  y: yPos + 4,
                  textAnchor: "end",
                  fill: "#dbeafe",
                  fontSize: "10",
                },
                tickVal
              )
            );
          })
        : null,
      series.map(function (val, idx) {
        var barH = Math.max(3, (Math.max(0, val) / maxVal) * plotH);
        var x = padLeft + idx * slotW + (slotW - barW) / 2;
        var y = padTop + plotH - barH;
        return h(
          "g",
          { key: "bar-" + idx },
          h("rect", {
            x: Number(x.toFixed(1)),
            y: Number(y.toFixed(1)),
            width: Number(barW.toFixed(1)),
            height: Number(barH.toFixed(1)),
            rx: mini ? "1.5" : "3",
            fill: barFill,
          }),
          !mini
            ? h(
                "text",
                {
                  x: Number((x + barW / 2).toFixed(1)),
                  y: Number((y - 6).toFixed(1)),
                  textAnchor: "middle",
                  fill: "#ffffff",
                  fontSize: "11",
                  fontWeight: "600",
                },
                String(val)
              )
            : null,
          !mini
            ? h(
                "text",
                {
                  x: Number((x + barW / 2).toFixed(1)),
                  y: height - 10,
                  textAnchor: "middle",
                  fill: "#dbeafe",
                  fontSize: "10",
                },
                labels[idx] || "#" + (idx + 1)
              )
            : null
        );
      })
    );
  }

  function DashboardScreen(props) {
    var astronaut = props.astronaut;
    var slotIndex = props.slotIndex;
    var onOpenSetup = props.onOpenSetup;
    var onExit = props.onExit;

    var _activeTab = useState("dashboard");
    var activeTab = _activeTab[0];
    var setActiveTab = _activeTab[1];

    var _envMode = useState("spaceship");
    var envMode = _envMode[0];
    var setEnvMode = _envMode[1];

    var _selectedPartId = useState("heart");
    var selectedPartId = _selectedPartId[0];
    var setSelectedPartId = _selectedPartId[1];

    var _now = useState(function () {
      return new Date();
    });
    var now = _now[0];
    var setNow = _now[1];

    var _tasks = useState({
      vision: false,
      hydration: false,
      ared: false,
      workoutEcg: false,
      dosimetry: false,
      recEcg: false,
    });
    var tasks = _tasks[0];
    var setTasks = _tasks[1];

    var _gcCategories = useState({
      vitals: true,
      healthPlan: false,
      logs: false,
    });
    var gcCategories = _gcCategories[0];
    var setGcCategories = _gcCategories[1];

    var _gcPeriod = useState("10min");
    var gcPeriod = _gcPeriod[0];
    var setGcPeriod = _gcPeriod[1];

    var _gcCustomRange = useState("14 Nov 2026 08:00 - 14 Nov 2026 15:00");
    var gcCustomRange = _gcCustomRange[0];
    var setGcCustomRange = _gcCustomRange[1];

    var _gcStatusMsg = useState("");
    var gcStatusMsg = _gcStatusMsg[0];
    var setGcStatusMsg = _gcStatusMsg[1];

    var _visibleVitals = useState({
      bloodType: true,
      hr: true,
      bp: true,
      ecg: true,
      vo2: true,
      bodyComp: true,
      bmd: true,
      wbc: true,
    });
    var visibleVitals = _visibleVitals[0];
    var setVisibleVitals = _visibleVitals[1];

    var _vitalsSetupOpen = useState(false);
    var vitalsSetupOpen = _vitalsSetupOpen[0];
    var setVitalsSetupOpen = _vitalsSetupOpen[1];

    var _draftVisibleVitals = useState(null);
    var draftVisibleVitals = _draftVisibleVitals[0];
    var setDraftVisibleVitals = _draftVisibleVitals[1];

    var _alertActive = useState(false);
    var alertActive = _alertActive[0];
    var setAlertActive = _alertActive[1];

    var _alertCountdown = useState(20);
    var alertCountdown = _alertCountdown[0];
    var setAlertCountdown = _alertCountdown[1];

    var _diagnosticActive = useState(false);
    var diagnosticActive = _diagnosticActive[0];
    var setDiagnosticActive = _diagnosticActive[1];

    var _browserOnline = useState(function () {
      return typeof navigator === "undefined" || navigator.onLine;
    });
    var browserOnline = _browserOnline[0];
    var setBrowserOnline = _browserOnline[1];
    var _offlineMode = useState(false);
    var offlineMode = _offlineMode[0];
    var setOfflineMode = _offlineMode[1];
    var _apiProfile = useState(null);
    var apiProfile = _apiProfile[0];
    var setApiProfile = _apiProfile[1];
    var _apiHistory = useState([]);
    var apiHistory = _apiHistory[0];
    var setApiHistory = _apiHistory[1];
    var _apiStatus = useState("");
    var apiStatus = _apiStatus[0];
    var setApiStatus = _apiStatus[1];
    var _queueCount = useState(0);
    var queueCount = _queueCount[0];
    var setQueueCount = _queueCount[1];
    var _isSyncing = useState(false);
    var isSyncing = _isSyncing[0];
    var setIsSyncing = _isSyncing[1];
    var _triageResult = useState(null);
    var triageResult = _triageResult[0];
    var setTriageResult = _triageResult[1];
    var _vitalsForm = useState({
      heart_rate: "72",
      blood_pressure: "120/80",
      sleep_hours: "7.5",
      exercise_min: "30",
      symptoms: "",
    });
    var vitalsForm = _vitalsForm[0];
    var setVitalsForm = _vitalsForm[1];
    var _scanFile = useState(null);
    var scanFile = _scanFile[0];
    var setScanFile = _scanFile[1];
    var _scanNotes = useState("");
    var scanNotes = _scanNotes[0];
    var setScanNotes = _scanNotes[1];
    var _scanResult = useState(null);
    var scanResult = _scanResult[0];
    var setScanResult = _scanResult[1];
    var _isAnalyzingScan = useState(false);
    var isAnalyzingScan = _isAnalyzingScan[0];
    var setIsAnalyzingScan = _isAnalyzingScan[1];

    useEffect(function () {
      var active = true;
      function handleOnline() {
        setBrowserOnline(true);
      }
      function handleOffline() {
        setBrowserOnline(false);
      }
      window.addEventListener("online", handleOnline);
      window.addEventListener("offline", handleOffline);
      try {
        setQueueCount(readOfflineVitalsQueue().length);
      } catch (error) {
        console.error("Could not read the offline vitals queue.", error);
        setApiStatus("Could not read the saved offline queue: " + error.message);
      }
      fetchApiJson("/api/profile/" + getApiAstronautId())
        .then(function (profile) {
          if (active) setApiProfile(profile);
        })
        .catch(function (error) {
          if (!active) return;
          console.error("Could not load the crew profile from the API.", error);
          setApiStatus("Profile unavailable; using the onboard cached baseline.");
        });
      fetchApiJson("/api/history/" + getApiAstronautId() + "?limit=50")
        .then(function (history) {
          if (active) setApiHistory(getVitalsHistoryRecords(history));
        })
        .catch(function (error) {
          if (!active) return;
          console.error("Could not load vitals history from the API.", error);
          setApiStatus("History unavailable; offline triage remains available.");
        });
      return function () {
        active = false;
        window.removeEventListener("online", handleOnline);
        window.removeEventListener("offline", handleOffline);
      };
    }, []);

    useEffect(
      function () {
        if (browserOnline && !offlineMode) {
          handleSyncQueue(true);
        }
      },
      [browserOnline, offlineMode]
    );


    var astroKey = (astronaut && (astronaut.astronaut_id || astronaut.id)) || "crew_" + ((slotIndex || 0) + 1);

    var _measurements = useState(function () {
      return loadStoredMeasurements(astroKey, astronaut, slotIndex);
    });
    var measurements = _measurements[0];
    var setMeasurements = _measurements[1];

    var _measEditMode = useState(false);
    var measEditMode = _measEditMode[0];
    var setMeasEditMode = _measEditMode[1];

    var _measCategory = useState("all");
    var measCategory = _measCategory[0];
    var setMeasCategory = _measCategory[1];

    var _measSearch = useState("");
    var measSearch = _measSearch[0];
    var setMeasSearch = _measSearch[1];

    var _selectedMeasId = useState(null);
    var selectedMeasId = _selectedMeasId[0];
    var setSelectedMeasId = _selectedMeasId[1];

    var _measModalMode = useState(null);
    var measModalMode = _measModalMode[0];
    var setMeasModalMode = _measModalMode[1];

    var _draftMeas = useState(null);
    var draftMeas = _draftMeas[0];
    var setDraftMeas = _draftMeas[1];

    var _dismissedWarnings = useState({});
    var dismissedWarnings = _dismissedWarnings[0];
    var setDismissedWarnings = _dismissedWarnings[1];

    var _testModalOpen = useState(false);
    var testModalOpen = _testModalOpen[0];
    var setTestModalOpen = _testModalOpen[1];

    var _testTargetId = useState("heart_rate");
    var testTargetId = _testTargetId[0];
    var setTestTargetId = _testTargetId[1];

    var _warningLogs = useState(function () {
      return loadStoredWarningLogs(astroKey, astronaut);
    });
    var warningLogs = _warningLogs[0];
    var setWarningLogs = _warningLogs[1];

    var _wlogEditMode = useState(false);
    var wlogEditMode = _wlogEditMode[0];
    var setWlogEditMode = _wlogEditMode[1];

    var _wlogFilter = useState("all");
    var wlogFilter = _wlogFilter[0];
    var setWlogFilter = _wlogFilter[1];

    var _wlogSearch = useState("");
    var wlogSearch = _wlogSearch[0];
    var setWlogSearch = _wlogSearch[1];

    var _editingLog = useState(null);
    var editingLog = _editingLog[0];
    var setEditingLog = _editingLog[1];

    var _selectedWlogId = useState(null);
    var selectedWlogId = _selectedWlogId[0];
    var setSelectedWlogId = _selectedWlogId[1];

    var _confirmDeleteWlogId = useState(null);
    var confirmDeleteWlogId = _confirmDeleteWlogId[0];
    var setConfirmDeleteWlogId = _confirmDeleteWlogId[1];
    var confirmDeleteTimerRef = useRef(null);

    var envModeRef = useRef(envMode);
    envModeRef.current = envMode;

    var simLocksRef = useRef({});
    var acknowledgedRedsRef = useRef({});
    var initialRedSosSpecRef = useRef(null);
    var latchedWarningsRef = useRef({});
    var lastLoggedLevelRef = useRef({});
    var recentHistoryBufferRef = useRef({
      oxygen_left: [88.08, 88.07, 88.06, 88.05, 88.04, 88.03, 88.02, 88.01, 88.0],
      battery_level: [92.48, 92.47, 92.46, 92.45, 92.44, 92.43, 92.42, 92.41, 92.4],
      metabolic_rate: [90.2, 91.0, 91.5, 92.0, 92.2, 92.4, 92.5],
      pressure_inside_veins: [5.1, 5.2, 5.2, 5.1, 5.2, 5.3, 5.2, 5.2],
    });

    function handleSelectEnvMode(newMode) {
      envModeRef.current = newMode;
      setEnvMode(newMode);
      var isSpace = newMode === "outer-space";
      var locks = simLocksRef.current || {};
      setMeasurements(function (prev) {
        if (!prev) return prev;
        var next = Object.assign({}, prev);
        if (next.outside_temperature && !locks.outside_temperature) {
          next.outside_temperature = Object.assign({}, next.outside_temperature, {
            value: isSpace ? "-270.4" : "21.4",
            series: isSpace
              ? [-270.3, -270.4, -270.4, -270.5, -270.4, -270.3, -270.4, -270.5, -270.4, -270.4, -270.3, -270.4]
              : [21.3, 21.4, 21.4, 21.3, 21.4, 21.5, 21.4, 21.4, 21.3, 21.4, 21.4, 21.4],
          });
        }
        if (next.temp_outside_costume && !locks.temp_outside_costume) {
          next.temp_outside_costume = Object.assign({}, next.temp_outside_costume, {
            value: isSpace ? "-270.1" : "21.4",
            series: isSpace
              ? [-270.0, -270.1, -270.2, -270.1, -270.0, -270.1, -270.2, -270.1, -270.1, -270.2, -270.1, -270.0, -270.1, -270.1, -270.2, -270.1]
              : [21.3, 21.4, 21.4, 21.3, 21.4, 21.5, 21.4, 21.4, 21.3, 21.4, 21.5, 21.4, 21.4, 21.3, 21.4, 21.4],
          });
        }
        if (next.temp_inside_costume && !locks.temp_inside_costume) {
          next.temp_inside_costume = Object.assign({}, next.temp_inside_costume, {
            value: isSpace ? "19.8" : "21.6",
            series: isSpace
              ? [19.9, 19.8, 19.8, 19.7, 19.8, 19.9, 19.8, 19.8, 19.7, 19.8, 19.9, 19.8, 19.8, 19.7, 19.8, 19.8]
              : [21.5, 21.6, 21.6, 21.5, 21.6, 21.7, 21.6, 21.6, 21.5, 21.6, 21.7, 21.6, 21.6, 21.5, 21.6, 21.6],
          });
        }
        if (next.radiation_exposure && !locks.radiation_exposure) {
          next.radiation_exposure = Object.assign({}, next.radiation_exposure, {
            value: isSpace ? "0.048" : "0.038",
            series: isSpace
              ? [0.046, 0.047, 0.047, 0.048, 0.049, 0.048, 0.048]
              : [0.036, 0.037, 0.038, 0.039, 0.038, 0.039, 0.038],
          });
        }
        if (next.humidity && !locks.humidity) {
          next.humidity = Object.assign({}, next.humidity, {
            value: isSpace ? "37.5" : "44.0",
            series: isSpace
              ? [37.7, 37.6, 37.5, 37.4, 37.5, 37.6, 37.5, 37.4, 37.5, 37.6, 37.5, 37.5]
              : [43.8, 44.0, 44.1, 43.9, 44.0, 44.2, 44.1, 44.0, 43.9, 44.1, 44.0, 44.0],
          });
        }
        if (next.heart_rate && !locks.heart_rate) {
          next.heart_rate = Object.assign({}, next.heart_rate, {
            value: isSpace ? "92" : "78",
            series: isSpace
              ? [88, 89, 90, 91, 90, 92, 91, 93, 92, 91, 92, 93, 92, 91, 92, 93, 92, 91, 92, 92]
              : [76, 77, 78, 79, 78, 77, 78, 79, 78, 77, 78, 79, 78, 77, 78, 79, 78, 77, 78, 78],
          });
        }
        if (next.respiration_rate && !locks.respiration_rate) {
          next.respiration_rate = Object.assign({}, next.respiration_rate, {
            value: isSpace ? "17" : "14",
            series: isSpace
              ? [16, 16, 17, 17, 16, 17, 18, 17, 17, 16, 17, 17]
              : [14, 14, 15, 14, 13, 14, 15, 14, 14, 13, 14, 14],
          });
        }
        if (next.metabolic_rate && !locks.metabolic_rate) {
          next.metabolic_rate = Object.assign({}, next.metabolic_rate, {
            value: isSpace ? "146.0 kcal/h (170 W)" : "92.5 kcal/h (108 W)",
          });
        }
        if (next.pressure && !locks.pressure) {
          next.pressure = Object.assign({}, next.pressure, {
            value: isSpace ? "124/80" : "118/76",
            series: isSpace
              ? [122, 123, 123, 124, 124, 125, 124, 123, 124, 124, 125, 124, 124, 123, 124, 124]
              : [117, 118, 118, 119, 118, 117, 118, 119, 118, 118, 117, 118, 119, 118, 118, 118],
            seriesSecondary: isSpace
              ? [79, 79, 80, 80, 80, 81, 80, 79, 80, 80, 81, 80, 80, 79, 80, 80]
              : [75, 76, 76, 77, 76, 75, 76, 77, 76, 76, 75, 76, 77, 76, 76, 76],
          });
        }
        if (next.co2_level && !locks.co2_level) {
          next.co2_level = Object.assign({}, next.co2_level, {
            value: isSpace ? "2.95 mmHg (3882 ppm)" : "2.60 mmHg (3421 ppm)",
            series: isSpace
              ? [2.90, 2.92, 2.94, 2.95, 2.94, 2.96, 2.95, 2.94, 2.95, 2.96, 2.95, 2.94, 2.95, 2.95, 2.96, 2.95]
              : [2.58, 2.60, 2.61, 2.59, 2.60, 2.62, 2.61, 2.60, 2.59, 2.61, 2.60, 2.59, 2.60, 2.61, 2.60, 2.60],
          });
        }
        if (next.skin_surface && !locks.skin_surface) {
          next.skin_surface = Object.assign({}, next.skin_surface, {
            value: isSpace ? "36.6" : "36.4",
            series: isSpace
              ? [36.5, 36.5, 36.6, 36.6, 36.5, 36.6, 36.7, 36.6, 36.6, 36.5, 36.6, 36.6]
              : [36.3, 36.4, 36.4, 36.3, 36.4, 36.5, 36.4, 36.4, 36.3, 36.4, 36.4, 36.4],
          });
        }
        return next;
      });
    }

    var hrSimRef = useRef({
      tickCount: 0,
      mode: "normal",
      activeTicksLeft: 0,
      rampTicksLeft: 0,
      targetActiveHr: 120,
      ecgPhase: 0,
      radAnomalyTicks: 0,
      orbitalWarmPassTicks: 0,
    });

    useEffect(
      function () {
        simLocksRef.current = {};
        acknowledgedRedsRef.current = {};
        initialRedSosSpecRef.current = null;
        latchedWarningsRef.current = {};
        lastLoggedLevelRef.current = {};
        setDismissedWarnings({});
        setMeasurements(loadStoredMeasurements(astroKey, astronaut, slotIndex));
        setWarningLogs(loadStoredWarningLogs(astroKey, astronaut));
      },
      [astroKey, astronaut, slotIndex]
    );

    useEffect(
      function () {
        // Compact 5-point continuous P-Q-R-S-T complex with zero flatline pause between spikes
        var ecgWaveformTemplate = [0.16, -0.15, 1.18, -0.29, 0.25];

        function stepBounded(curr, minNormal, baseTarget, maxNormal, maxActive, stepMin, stepMax, isActive, isCooldown) {
          var step = stepMin + Math.random() * (stepMax - stepMin);
          if (isActive) {
            if (curr >= maxActive) return curr - step;
            var activeMid = maxNormal + (maxActive - maxNormal) * 0.55;
            var upProb = curr < activeMid - stepMax ? 0.72 : curr > activeMid + stepMax ? 0.35 : 0.52;
            var d = Math.random() < upProb ? step : -step;
            return Math.min(maxActive, Math.max(minNormal, curr + d));
          }
          if (isCooldown && curr > maxNormal * 0.92) {
            return Math.max(minNormal, curr - step * 0.85);
          }
          if (curr >= maxNormal) {
            return curr - step;
          }
          if (curr <= minNormal) {
            return curr + step;
          }
          var pullUp = curr < baseTarget - stepMax ? 0.62 : curr > baseTarget + stepMax ? 0.38 : 0.5;
          var delta = Math.random() < pullUp ? step : -step;
          var next = curr + delta;
          if (next > maxNormal) next = maxNormal;
          if (next < minNormal) next = minNormal;
          return next;
        }

        function stepTowardTarget(curr, target, stepSize) {
          if (Math.abs(target - curr) <= stepSize) {
            return target;
          }
          return curr < target ? curr + stepSize : curr - stepSize;
        }

        var simInterval = window.setInterval(function () {
          setMeasurements(function (prev) {
            if (!prev || !prev.heart_rate) return prev;
            var sim = hrSimRef.current;
            var locks = simLocksRef.current || {};
            var histBuf = recentHistoryBufferRef.current;
            sim.tickCount += 1;
            var tick = sim.tickCount;
            var nextMap = Object.assign({}, prev);

            var parsedHr = parseFloat(prev.heart_rate.value);
            var currentHr = Number.isFinite(parsedHr) && parsedHr >= 0 ? Math.round(parsedHr) : 78;
            var currRadVal = prev.radiation_exposure ? parseFloat(prev.radiation_exposure.value) : 0.039;
            if (!Number.isFinite(currRadVal)) currRadVal = 0.039;
            var currO2LeftVal = prev.oxygen_left ? parseFloat(prev.oxygen_left.value) : 88.0;
            if (!Number.isFinite(currO2LeftVal)) currO2LeftVal = 88.0;
            var currCo2Val = prev.co2_level ? parseFloat(prev.co2_level.value) : 2.6;
            if (!Number.isFinite(currCo2Val)) currCo2Val = 2.6;
            var currBatVal = prev.battery_level ? parseFloat(prev.battery_level.value) : 92.4;
            if (!Number.isFinite(currBatVal)) currBatVal = 92.4;
            var currSuitInVal = prev.temp_inside_costume ? parseFloat(prev.temp_inside_costume.value) : 21.6;
            if (!Number.isFinite(currSuitInVal)) currSuitInVal = 21.6;
            var currSuitOutVal = prev.temp_outside_costume ? parseFloat(prev.temp_outside_costume.value) : -18.5;
            if (!Number.isFinite(currSuitOutVal)) currSuitOutVal = -18.5;
            var currCabTempVal = prev.outside_temperature ? parseFloat(prev.outside_temperature.value) : 21.4;
            if (!Number.isFinite(currCabTempVal)) currCabTempVal = 21.4;

            // Detect real-world primary anomalies (only active when a test or manual edit has pushed a driver into Yellow/Red)
            var isCardiacArrest = locks.heart_rate && currentHr <= 5;
            var isSevereBradycardia = locks.heart_rate && currentHr > 5 && currentHr < 48;
            var isModerateBradycardia = locks.heart_rate && currentHr >= 48 && currentHr < 56;
            var isRedTachycardia = locks.heart_rate && currentHr > 148;
            var isYellowTachycardia = locks.heart_rate && currentHr >= 125 && currentHr <= 148;

            var isRedRadiation = locks.radiation_exposure && currRadVal > 0.085;
            var isYellowRadiation = locks.radiation_exposure && currRadVal > 0.055 && currRadVal <= 0.085;

            var isRedHypoxiaDriver =
              (locks.oxygen_left && currO2LeftVal < 25) || (locks.co2_level && currCo2Val > 4.25);
            var isYellowHypoxiaDriver =
              !isRedHypoxiaDriver &&
              ((locks.oxygen_left && currO2LeftVal < 40) || (locks.co2_level && currCo2Val > 3.5));

            var isRedThermalDriver =
              (locks.temp_inside_costume && currSuitInVal > 24.5) ||
              (locks.temp_outside_costume && currSuitOutVal > 40.0) ||
              (locks.outside_temperature && currCabTempVal > 25.0);
            var isYellowThermalDriver =
              !isRedThermalDriver &&
              ((locks.temp_inside_costume && currSuitInVal > 23.3) ||
                (locks.temp_outside_costume && currSuitOutVal > 14.0) ||
                (locks.outside_temperature && currCabTempVal > 23.2));

            var isRedBatteryLow = locks.battery_level && currBatVal < 20;
            var isYellowBatteryLow = locks.battery_level && currBatVal >= 20 && currBatVal < 35;

            var isActive = sim.mode === "active";
            var isCooldown = sim.mode === "cooldown";

            // 1. Every 0.1s (100ms): Electrocardiogram (mV, continuous spikes with no pauses — or flatline if heartbeats stop!) & Oxygen level in blood (% SpO2)
            if (prev.electrocardiogram && !locks.electrocardiogram) {
              var ecgItem = prev.electrocardiogram;
              sim.ecgPhase = (sim.ecgPhase + 1) % ecgWaveformTemplate.length;
              var waveIdx = sim.ecgPhase;
              var sampleMv = 0;
              var peakInWindow = 1.18;
              var prevEcgSeries = Array.isArray(ecgItem.series) ? ecgItem.series : [0.16, -0.15, 1.18, -0.29, 0.25];

              if (currentHr <= 5) {
                // Interconnected: Heartbeats stopped (0-5 bpm) -> ECG flatlines (asystole micro-noise 0.00-0.02 mV -> triggers Red ECG SOS)
                sampleMv = Number(((Math.random() - 0.5) * 0.02).toFixed(2));
                var flatSeries = prevEcgSeries.concat([sampleMv]).slice(-25);
                var flatLabels = flatSeries.map(function (_, i) {
                  var sAgo = ((flatSeries.length - 1 - i) * 0.1).toFixed(1);
                  return i === flatSeries.length - 1 ? "Now" : "-" + sAgo + "s";
                });
                var flatPeak = Math.max(0.01, Math.min(0.04, Math.max.apply(null, flatSeries.slice(-5))));
                nextMap.electrocardiogram = Object.assign({}, ecgItem, {
                  value: flatPeak.toFixed(2),
                  series: flatSeries,
                  seriesLabels: flatLabels,
                });
              } else if (currentHr < 48) {
                // Interconnected: Severe bradycardia (<48 bpm) -> depressed low-voltage QRS (<0.50 mV Red ECG)
                var bradyScale = 0.36;
                var bradyBase = ecgWaveformTemplate[waveIdx] * bradyScale;
                var bradyJitter = (Math.random() - 0.5) * 0.015;
                sampleMv = Number((bradyBase + bradyJitter).toFixed(2));
                var bradySeries = prevEcgSeries.concat([sampleMv]).slice(-25);
                var bradyLabels = bradySeries.map(function (_, i) {
                  var sAgo = ((bradySeries.length - 1 - i) * 0.1).toFixed(1);
                  return i === bradySeries.length - 1 ? "Now" : "-" + sAgo + "s";
                });
                peakInWindow = Math.max(0.38, Math.min(0.46, Math.max.apply(null, bradySeries.slice(-5))));
                nextMap.electrocardiogram = Object.assign({}, ecgItem, {
                  value: peakInWindow.toFixed(2),
                  series: bradySeries,
                  seriesLabels: bradyLabels,
                });
              } else if (currentHr < 56) {
                // Interconnected: Moderate bradycardia (48-55 bpm) -> concerning reduced R-wave amplitude (0.62 mV Yellow ECG)
                var modBradyBase = ecgWaveformTemplate[waveIdx] * 0.53;
                sampleMv = Number((modBradyBase + (Math.random() - 0.5) * 0.015).toFixed(2));
                var modBradySeries = prevEcgSeries.concat([sampleMv]).slice(-25);
                var modBradyLabels = modBradySeries.map(function (_, i) {
                  var sAgo = ((modBradySeries.length - 1 - i) * 0.1).toFixed(1);
                  return i === modBradySeries.length - 1 ? "Now" : "-" + sAgo + "s";
                });
                peakInWindow = Math.max(0.58, Math.min(0.68, Math.max.apply(null, modBradySeries.slice(-5))));
                nextMap.electrocardiogram = Object.assign({}, ecgItem, {
                  value: peakInWindow.toFixed(2),
                  series: modBradySeries,
                  seriesLabels: modBradyLabels,
                });
              } else if (currentHr > 148) {
                // Interconnected: Extreme tachycardia (>148 bpm) -> high-amplitude hyperdynamic R-wave (>1.65 mV Red ECG)
                var redTachyBase = waveIdx === 2 ? 1.72 : ecgWaveformTemplate[waveIdx] * 1.28;
                sampleMv = Number((redTachyBase + (Math.random() - 0.5) * 0.03).toFixed(2));
                var redTachySeries = prevEcgSeries.concat([sampleMv]).slice(-25);
                var redTachyLabels = redTachySeries.map(function (_, i) {
                  var sAgo = ((redTachySeries.length - 1 - i) * 0.1).toFixed(1);
                  return i === redTachySeries.length - 1 ? "Now" : "-" + sAgo + "s";
                });
                peakInWindow = Math.max(1.68, Math.min(1.78, Math.max.apply(null, redTachySeries.slice(-5))));
                nextMap.electrocardiogram = Object.assign({}, ecgItem, {
                  value: peakInWindow.toFixed(2),
                  series: redTachySeries,
                  seriesLabels: redTachyLabels,
                });
              } else if (currentHr >= 125) {
                // Interconnected: Tachycardia (125-148 bpm) -> elevated R-wave (1.46-1.54 mV Yellow ECG)
                var yelTachyBase = waveIdx === 2 ? 1.49 : ecgWaveformTemplate[waveIdx] * 1.15;
                sampleMv = Number((yelTachyBase + (Math.random() - 0.5) * 0.025).toFixed(2));
                var yelTachySeries = prevEcgSeries.concat([sampleMv]).slice(-25);
                var yelTachyLabels = yelTachySeries.map(function (_, i) {
                  var sAgo = ((yelTachySeries.length - 1 - i) * 0.1).toFixed(1);
                  return i === yelTachySeries.length - 1 ? "Now" : "-" + sAgo + "s";
                });
                peakInWindow = Math.max(1.45, Math.min(1.56, Math.max.apply(null, yelTachySeries.slice(-5))));
                nextMap.electrocardiogram = Object.assign({}, ecgItem, {
                  value: peakInWindow.toFixed(2),
                  series: yelTachySeries,
                  seriesLabels: yelTachyLabels,
                });
              } else {
                // Normal / Active simulation: strictly bounded inside nominal Blue [1.12..1.28 mV]
                var baseSample = ecgWaveformTemplate[waveIdx];
                var clampedHrForEcg = Math.min(118, Math.max(66, currentHr));
                var hrScale = waveIdx === 2 ? Math.max(0, (clampedHrForEcg - 78) * 0.0018) : 0;
                var jitter = (Math.random() - 0.5) * (waveIdx === 2 ? 0.024 : 0.012);
                sampleMv = Number((baseSample + hrScale + jitter).toFixed(2));
                var nextEcgSeries = prevEcgSeries.concat([sampleMv]).slice(-25);
                var nextEcgLabels = nextEcgSeries.map(function (_, i) {
                  var sAgo = ((nextEcgSeries.length - 1 - i) * 0.1).toFixed(1);
                  return i === nextEcgSeries.length - 1 ? "Now" : "-" + sAgo + "s";
                });
                peakInWindow = Math.min(1.32, Math.max(1.10, Math.max.apply(null, nextEcgSeries.slice(-5))));
                nextMap.electrocardiogram = Object.assign({}, ecgItem, {
                  value: peakInWindow.toFixed(2),
                  series: nextEcgSeries,
                  seriesLabels: nextEcgLabels,
                });
              }
            }

            if (prev.oxygen_level_in_blood && !locks.oxygen_level_in_blood && Math.random() < 0.35) {
              var spo2Item = prev.oxygen_level_in_blood;
              var currSpo2 = parseFloat(spo2Item.value);
              if (!Number.isFinite(currSpo2)) currSpo2 = 98.6;
              var nextSpo2 = currSpo2;

              if (isCardiacArrest || isRedHypoxiaDriver) {
                // Interconnected: Cardiac arrest or critical O2/CO2 failure -> severe blood oxygen desaturation (~89.2% Red)
                nextSpo2 = stepTowardTarget(currSpo2, 89.2 + (Math.random() - 0.5) * 0.4, 0.35);
                nextSpo2 = Math.max(88.0, Math.min(99.6, Number(nextSpo2.toFixed(1))));
              } else if (isSevereBradycardia || isYellowHypoxiaDriver) {
                // Interconnected: Severe bradycardia or low O2/high CO2 -> concerning blood oxygen dip (~94.4% Yellow)
                nextSpo2 = stepTowardTarget(currSpo2, 94.4 + (Math.random() - 0.5) * 0.4, 0.25);
                nextSpo2 = Math.max(93.2, Math.min(99.6, Number(nextSpo2.toFixed(1))));
              } else if (currSpo2 < 97.2) {
                // Smooth recovery back to nominal Blue when primary anomaly clears
                nextSpo2 = Number(Math.min(98.6, currSpo2 + 0.3).toFixed(1));
              } else {
                // Strictly nominal Blue fluctuation (97.4% - 99.6%, never triggers Yellow <95.8% or recentDelta >=3.0%)
                var spo2Target = isActive ? 98.0 : 98.6;
                var spo2Min = isActive ? 97.4 : 97.8;
                var spo2Max = 99.5;
                var spo2Step = 0.1;
                if (currSpo2 >= spo2Max) {
                  nextSpo2 = currSpo2 - spo2Step;
                } else if (currSpo2 <= spo2Min) {
                  nextSpo2 = currSpo2 + spo2Step;
                } else {
                  var pUp = currSpo2 < spo2Target - 0.2 ? 0.65 : currSpo2 > spo2Target + 0.2 ? 0.35 : 0.5;
                  nextSpo2 = currSpo2 + (Math.random() < pUp ? spo2Step : -spo2Step);
                }
                nextSpo2 = Math.min(99.6, Math.max(97.4, Number(nextSpo2.toFixed(1))));
              }

              var prevSpo2Series = Array.isArray(spo2Item.series) ? spo2Item.series : [98.6];
              var nextSpo2Series = prevSpo2Series.concat([nextSpo2]).slice(-20);
              var nextSpo2Labels = nextSpo2Series.map(function (_, idx) {
                var ago = ((nextSpo2Series.length - 1 - idx) * 0.1).toFixed(1);
                return idx === nextSpo2Series.length - 1 ? "Now" : "-" + ago + "s";
              });
              nextMap.oxygen_level_in_blood = Object.assign({}, spo2Item, {
                value: nextSpo2.toFixed(1),
                series: nextSpo2Series,
                seriesLabels: nextSpo2Labels,
              });
            }

            // 2. Every 0.5s (tick % 5 === 0): CO_2 level (ppm or mmHg, Line graph — coupled to battery/scrubber power, otherwise strictly nominal Blue)
            if (tick % 5 === 0 && prev.co2_level && !locks.co2_level) {
              var co2Item = prev.co2_level;
              var currCo2 = parseFloat(co2Item.value);
              if (!Number.isFinite(currCo2)) currCo2 = 2.6;
              var nextCo2 = currCo2;
              if (isRedBatteryLow) {
                // Interconnected: Critical battery loss (<20%) -> scrubber fan failure -> dangerous CO2 buildup (~4.45 mmHg Red)
                nextCo2 = stepTowardTarget(currCo2, 4.45 + (Math.random() - 0.5) * 0.08, 0.12);
              } else if (isYellowBatteryLow) {
                // Interconnected: Low battery (<35%) -> reduced scrubber airflow -> concerning CO2 rise (~3.76 mmHg Yellow)
                nextCo2 = stepTowardTarget(currCo2, 3.76 + (Math.random() - 0.5) * 0.06, 0.09);
              } else if (currCo2 > 3.25) {
                nextCo2 = Math.max(2.6, currCo2 - 0.12);
              } else {
                nextCo2 = stepBounded(currCo2, 2.25, 2.6, 3.0, 3.22, 0.01, 0.02, isActive, isCooldown);
              }
              var cleanCo2 = Number(nextCo2.toFixed(2));
              var ppmVal = Math.round((cleanCo2 / 760) * 1000000);
              var prevCo2Series = Array.isArray(co2Item.series) ? co2Item.series : [2.6];
              var nextCo2Series = prevCo2Series.concat([cleanCo2]).slice(-16);
              var nextCo2Labels = nextCo2Series.map(function (_, idx) {
                var ago = ((nextCo2Series.length - 1 - idx) * 0.5).toFixed(1);
                return idx === nextCo2Series.length - 1 ? "Now" : "-" + ago + "s";
              });
              nextMap.co2_level = Object.assign({}, co2Item, {
                value: cleanCo2.toFixed(2) + " mmHg (" + ppmVal + " ppm)",
                series: nextCo2Series,
                seriesLabels: nextCo2Labels,
              });
            }

            // 3. Every 1.0s (tick % 10 === 0): Heart rate, Unified Pressure, Vein pressure, Suit temps, O2 left, Battery, plus fast interconnected responses
            if (tick % 10 === 0) {
              if (!locks.heart_rate) {
                var hrItem = prev.heart_rate;
                var stepMag = 1 + Math.floor(Math.random() * 3); // 1, 2, or 3 bpm
                var delta = 0;
                var nextHr = currentHr;

                // Interconnected HR response when driven by high radiation, hypoxia/hypercapnia, or thermal stress
                var coupledHrTarget = null;
                if (isRedHypoxiaDriver || isRedThermalDriver || isRedRadiation) {
                  coupledHrTarget = 136 + Math.floor(Math.random() * 5); // 136-140 bpm compensatory tachycardia (Yellow)
                } else if (isYellowHypoxiaDriver || isYellowThermalDriver || isYellowRadiation) {
                  coupledHrTarget = 128 + Math.floor(Math.random() * 4); // 128-131 bpm stress response (Yellow)
                }

                if (coupledHrTarget !== null) {
                  nextHr = Math.round(stepTowardTarget(currentHr, coupledHrTarget, 3));
                } else if (currentHr > 118) {
                  // Recover smoothly from coupled tachycardia back into normal Blue range
                  nextHr = Math.max(82, currentHr - 3);
                } else if (currentHr < 66) {
                  nextHr = Math.min(78, currentHr + 3);
                } else {
                  if (sim.mode === "normal") {
                    if (Math.random() < 0.05) {
                      sim.mode = "active";
                      sim.rampTicksLeft = 15 + Math.floor(Math.random() * 6); // 15-20s ramp-up
                      sim.activeTicksLeft = 42 + Math.floor(Math.random() * 19); // 42-60s (max 1 min)
                      // Strictly below 125 bpm Yellow threshold during random activity mode (108-116 bpm)
                      sim.targetActiveHr = 108 + Math.floor(Math.random() * 9);
                    }
                  }

                  if (sim.mode === "active") {
                    sim.activeTicksLeft -= 1;
                    if (currentHr >= 118) {
                      delta = -stepMag;
                    } else if (sim.rampTicksLeft > 0 || currentHr < sim.targetActiveHr - 4) {
                      if (sim.rampTicksLeft > 0) sim.rampTicksLeft -= 1;
                      var needed = sim.targetActiveHr - currentHr;
                      var secsLeft = Math.max(1, sim.rampTicksLeft + 1);
                      var avgStep = Math.min(3, Math.max(1, Math.round(needed / secsLeft)));
                      if (Math.random() < 0.15 && currentHr > 82) {
                        delta = -1;
                      } else {
                        delta = Math.min(3, Math.max(1, avgStep + (Math.random() < 0.5 ? 1 : 0)));
                      }
                    } else {
                      var upBias = currentHr < 110 ? 0.62 : currentHr > 115 ? 0.32 : 0.5;
                      delta = Math.random() < upBias ? stepMag : -stepMag;
                    }
                    nextHr = Math.min(118, Math.max(66, currentHr + delta));
                    if (sim.activeTicksLeft <= 0) {
                      sim.mode = "cooldown";
                    }
                  } else if (sim.mode === "cooldown") {
                    if (currentHr >= 98) {
                      delta = -stepMag;
                    } else {
                      delta = Math.random() < 0.82 ? -stepMag : 1;
                    }
                    nextHr = Math.max(74, currentHr + delta);
                    if (nextHr <= 84) {
                      sim.mode = "normal";
                    }
                  } else {
                    if (currentHr >= 98) {
                      delta = -stepMag;
                    } else if (currentHr <= 66) {
                      delta = stepMag;
                    } else {
                      var probUp = currentHr > 83 ? 0.38 : currentHr < 74 ? 0.62 : 0.5;
                      delta = Math.random() < probUp ? stepMag : -stepMag;
                    }
                    nextHr = Math.min(98, Math.max(66, currentHr + delta));
                  }
                }

                var prevHrSeries = Array.isArray(hrItem.series) ? hrItem.series : [78];
                var nextHrSeries = prevHrSeries.concat([nextHr]).slice(-20);
                var nextHrLabels = nextHrSeries.map(function (_, idx) {
                  var secsAgo = nextHrSeries.length - 1 - idx;
                  return secsAgo === 0 ? "Now" : "-" + secsAgo + "s";
                });
                nextMap.heart_rate = Object.assign({}, hrItem, {
                  value: String(nextHr),
                  series: nextHrSeries,
                  seriesLabels: nextHrLabels,
                });
                currentHr = nextHr;
              }

              isActive = sim.mode === "active";
              isCooldown = sim.mode === "cooldown";

              // Pressure inside veins (CVP, mmHg, Number: coupled to cardiac arrest / severe bradycardia, otherwise 4.5 - 7.1 normal)
              if (prev.pressure_inside_veins && !locks.pressure_inside_veins) {
                var cvpItem = prev.pressure_inside_veins;
                var currCvp = parseFloat(cvpItem.value);
                if (!Number.isFinite(currCvp)) currCvp = 5.2;
                var nextCvp = currCvp;
                if (isCardiacArrest) {
                  // Interconnected: Cardiac standstill causes central venous pooling (~9.9 mmHg Red)
                  nextCvp = Number(stepTowardTarget(currCvp, 9.9, 0.6).toFixed(1));
                } else if (isSevereBradycardia || isRedTachycardia) {
                  nextCvp = Number(stepTowardTarget(currCvp, 8.3, 0.4).toFixed(1));
                } else if (currCvp > 7.2 || currCvp < 4.4) {
                  nextCvp = Number(stepTowardTarget(currCvp, 5.2, 0.4).toFixed(1));
                } else {
                  nextCvp = Number(stepBounded(currCvp, 4.5, 5.2, 6.2, 7.1, 0.06, 0.14, isActive, isCooldown).toFixed(1));
                }
                histBuf.pressure_inside_veins = (histBuf.pressure_inside_veins || [5.2]).concat([nextCvp]).slice(-10);
                nextMap.pressure_inside_veins = Object.assign({}, cvpItem, {
                  value: nextCvp.toFixed(1),
                });
              }

              // Unified Pressure (Systolic/Diastolic BP, mmHg, Line graph: coupled to HR arrest/tachycardia, otherwise steady ~116/75 normal)
              if (prev.pressure && !locks.pressure) {
                var bpItem = prev.pressure;
                var bpParts = String(bpItem.value || "116/75").split("/");
                var currSys = parseInt(bpParts[0], 10);
                var currDia = bpParts.length > 1 ? parseInt(bpParts[1], 10) : 75;
                if (!Number.isFinite(currSys)) currSys = 116;
                if (!Number.isFinite(currDia)) currDia = 75;
                var nextSysVal = currSys;
                var nextDiaVal = currDia;

                if (isCardiacArrest) {
                  // Interconnected: Stopped heartbeats -> rapid arterial pressure collapse (~58/34 mmHg Red)
                  nextSysVal = Math.round(stepTowardTarget(currSys, 58, 8));
                  nextDiaVal = Math.round(stepTowardTarget(currDia, 34, 5));
                } else if (isSevereBradycardia) {
                  // Interconnected: Severe bradycardia -> hypotension (~82/50 mmHg Red)
                  nextSysVal = Math.round(stepTowardTarget(currSys, 82, 5));
                  nextDiaVal = Math.round(stepTowardTarget(currDia, 50, 3));
                } else if (isModerateBradycardia) {
                  nextSysVal = Math.round(stepTowardTarget(currSys, 90, 4));
                  nextDiaVal = Math.round(stepTowardTarget(currDia, 56, 2));
                } else if (isRedTachycardia) {
                  // Interconnected: Severe tachycardia -> hypertensive surge (~159/98 mmHg Red)
                  nextSysVal = Math.round(stepTowardTarget(currSys, 159, 5));
                  nextDiaVal = Math.round(stepTowardTarget(currDia, 98, 3));
                } else if (isYellowTachycardia) {
                  // Interconnected: Moderate tachycardia -> elevated blood pressure (~142/90 mmHg Yellow)
                  nextSysVal = Math.round(stepTowardTarget(currSys, 142, 4));
                  nextDiaVal = Math.round(stepTowardTarget(currDia, 90, 2));
                } else if (currSys > 128 || currSys < 110 || currDia > 82 || currDia < 70) {
                  // Smooth recovery back to nominal Blue ~116/75
                  nextSysVal = Math.round(stepTowardTarget(currSys, 116, 4));
                  nextDiaVal = Math.round(stepTowardTarget(currDia, 75, 3));
                } else {
                  nextSysVal = Math.round(stepBounded(currSys, 113, 116, 120, 125, 0.4, 1.0, isActive, isCooldown));
                  nextDiaVal = Math.round(stepBounded(currDia, 72, 75, 77, 80, 0.3, 0.8, isActive, isCooldown));
                  if (nextDiaVal > nextSysVal - 32) {
                    nextDiaVal = nextSysVal - 32;
                  }
                }

                var prevSysSeries = Array.isArray(bpItem.series) ? bpItem.series : [116];
                var prevDiaSeries = Array.isArray(bpItem.seriesSecondary) ? bpItem.seriesSecondary : [75];
                var nextSysSeries = prevSysSeries.concat([nextSysVal]).slice(-20);
                var nextDiaSeries = prevDiaSeries.concat([nextDiaVal]).slice(-20);
                var nextBpLabels = nextSysSeries.map(function (_, idx) {
                  var secsAgo = nextSysSeries.length - 1 - idx;
                  return secsAgo === 0 ? "Now" : "-" + secsAgo + "s";
                });
                nextMap.pressure = Object.assign({}, bpItem, {
                  value: nextSysVal + "/" + nextDiaVal,
                  series: nextSysSeries,
                  seriesSecondary: nextDiaSeries,
                  seriesLabels: nextBpLabels,
                });
              }

              var isOuterSpace = envModeRef.current === "outer-space";

              // Temperature inside costume (°C, Line graph: ~21.6 °C in Spaceship, ~19.8 °C in Outer Space EVA; coupled to high radiation, external temp, or low battery)
              if (prev.temp_inside_costume && !locks.temp_inside_costume) {
                var suitInItem = prev.temp_inside_costume;
                var suitInBase = isOuterSpace ? 19.8 : 21.6;
                var currSuitIn = parseFloat(suitInItem.value);
                if (!Number.isFinite(currSuitIn)) currSuitIn = suitInBase;
                var nextSuitIn = currSuitIn;
                if (isRedBatteryLow || (locks.temp_outside_costume && currSuitOutVal > 40.0)) {
                  // Interconnected: Critical battery cooling loss or extreme external heat -> suit internal temp rises (>24.5 °C Red)
                  nextSuitIn = Number(stepTowardTarget(currSuitIn, 24.8, 0.35).toFixed(1));
                } else if (
                  isRedRadiation ||
                  isYellowRadiation ||
                  isYellowBatteryLow ||
                  (locks.temp_outside_costume && currSuitOutVal >= 14.0 && currSuitOutVal < 18.0)
                ) {
                  // Interconnected: High radiation thermal load, low battery, or warm external suit -> suit temp rises (~23.7 °C Yellow)
                  nextSuitIn = Number(stepTowardTarget(currSuitIn, 23.7, 0.25).toFixed(1));
                } else if (isOuterSpace) {
                  if (currSuitIn > 20.5 || currSuitIn < 19.2) {
                    nextSuitIn = Number(stepTowardTarget(currSuitIn, 19.8, 0.25).toFixed(1));
                  } else {
                    nextSuitIn = Number(
                      stepBounded(currSuitIn, 19.3, 19.8, 20.3, 20.6, 0.03, 0.06, isActive, isCooldown).toFixed(1)
                    );
                  }
                } else if (currSuitIn > 22.8 || currSuitIn < 20.9) {
                  nextSuitIn = Number(stepTowardTarget(currSuitIn, 21.6, 0.25).toFixed(1));
                } else {
                  nextSuitIn = Number(
                    stepBounded(currSuitIn, 21.0, 21.6, 22.2, 22.7, 0.03, 0.06, isActive, isCooldown).toFixed(1)
                  );
                }
                var prevSuitInSeries = Array.isArray(suitInItem.series) ? suitInItem.series : [suitInBase];
                var nextSuitInSeries = prevSuitInSeries.concat([nextSuitIn]).slice(-16);
                var nextSuitInLabels = nextSuitInSeries.map(function (_, idx) {
                  var secsAgo = nextSuitInSeries.length - 1 - idx;
                  return secsAgo === 0 ? "Now" : "-" + secsAgo + "s";
                });
                nextMap.temp_inside_costume = Object.assign({}, suitInItem, {
                  value: nextSuitIn.toFixed(1),
                  series: nextSuitInSeries,
                  seriesLabels: nextSuitInLabels,
                });
              }

              // Temperature outside costume (°C, Line graph: ~21.4 °C in Spaceship cabin, ~ -270.1 °C in Outer Space)
              if (prev.temp_outside_costume && !locks.temp_outside_costume) {
                var suitOutItem = prev.temp_outside_costume;
                var suitOutTarget = isOuterSpace ? -270.1 : 21.4;
                var currSuitOut = parseFloat(suitOutItem.value);
                if (!Number.isFinite(currSuitOut)) currSuitOut = suitOutTarget;
                var nextSuitOut = suitOutTarget;
                if (isOuterSpace) {
                  if (currSuitOut > -268.5 || currSuitOut < -271.5) {
                    nextSuitOut = -270.1;
                  } else {
                    nextSuitOut = Number(
                      stepBounded(currSuitOut, -270.5, -270.1, -269.6, -269.4, 0.04, 0.1, false, false).toFixed(1)
                    );
                  }
                } else {
                  if (currSuitOut < 20.5 || currSuitOut > 22.4) {
                    nextSuitOut = 21.4;
                  } else {
                    nextSuitOut = Number(
                      stepBounded(currSuitOut, 21.0, 21.4, 21.9, 22.1, 0.03, 0.06, false, false).toFixed(1)
                    );
                  }
                }
                var prevSuitOutSeries = Array.isArray(suitOutItem.series) ? suitOutItem.series : [suitOutTarget];
                var nextSuitOutSeries = prevSuitOutSeries.concat([nextSuitOut]).slice(-16);
                var nextSuitOutLabels = nextSuitOutSeries.map(function (_, idx) {
                  var secsAgo = nextSuitOutSeries.length - 1 - idx;
                  return secsAgo === 0 ? "Now" : "-" + secsAgo + "s";
                });
                nextMap.temp_outside_costume = Object.assign({}, suitOutItem, {
                  value: nextSuitOut.toFixed(1),
                  series: nextSuitOutSeries,
                  seriesLabels: nextSuitOutLabels,
                });
              }

              // Oxygen left (% or L / kPa, Number: realistic gradual consumption, auto-refills at 46% so it never randomly hits yellow/red)
              if (prev.oxygen_left && !locks.oxygen_left) {
                var o2Item = prev.oxygen_left;
                var currO2Pct = parseFloat(o2Item.value);
                if (!Number.isFinite(currO2Pct)) currO2Pct = 88.0;
                var o2Drain = isOuterSpace ? 0.03 : isActive ? 0.02 : 0.01;
                var nextO2Pct = currO2Pct <= 46.0 ? 94.0 : Number((currO2Pct - o2Drain).toFixed(2));
                histBuf.oxygen_left = (histBuf.oxygen_left || [88.0]).concat([nextO2Pct]).slice(-10);
                var o2Liters = Math.round(nextO2Pct * 6.0);
                var o2Kpa = isOuterSpace
                  ? (29.5 + Math.random() * 0.2).toFixed(1)
                  : (101.2 + Math.random() * 0.2).toFixed(1);
                nextMap.oxygen_left = Object.assign({}, o2Item, {
                  value: nextO2Pct.toFixed(2) + "% (" + o2Liters + " L / " + o2Kpa + " kPa)",
                });
              }

              // Battery level (%, Number: realistic gradual discharge, auto-recharges at 43% so it never randomly hits yellow/red)
              if (prev.battery_level && !locks.battery_level) {
                var batItem = prev.battery_level;
                var currBat = parseFloat(batItem.value);
                if (!Number.isFinite(currBat)) currBat = 92.4;
                var batDrain = isOuterSpace ? 0.03 : isActive ? 0.02 : 0.01;
                var nextBat = currBat <= 43.0 ? 98.0 : Number((currBat - batDrain).toFixed(2));
                histBuf.battery_level = (histBuf.battery_level || [92.4]).concat([nextBat]).slice(-10);
                nextMap.battery_level = Object.assign({}, batItem, {
                  value: nextBat.toFixed(2),
                });
              }

              // Fast 1-second interconnected updates for Skin Surface Temperature & Respiration Rate when driven by radiation / thermal / cardiac / hypoxic anomalies
              var hasSkinCoupling =
                isRedRadiation ||
                isYellowRadiation ||
                isRedThermalDriver ||
                isYellowThermalDriver ||
                isCardiacArrest;
              if (prev.skin_surface && !locks.skin_surface && (hasSkinCoupling || tick % 50 === 0)) {
                var skinItem = prev.skin_surface;
                var skinBase = isOuterSpace ? 36.6 : 36.4;
                var currSkin = parseFloat(skinItem.value);
                if (!Number.isFinite(currSkin)) currSkin = skinBase;
                var nextSkin = currSkin;
                if (isRedRadiation || isRedThermalDriver) {
                  // Interconnected: Super high radiation (>0.085 R) or extreme suit/cabin heat -> skin temp rises into Red (>37.9 °C, ~38.3 °C)
                  nextSkin = Number(stepTowardTarget(currSkin, 38.3, 0.25).toFixed(1));
                } else if (isYellowRadiation || isYellowThermalDriver) {
                  // Interconnected: Elevated radiation (>0.055 R) or high suit/cabin heat -> skin temp rises into Yellow (>37.2 °C, ~37.6 °C)
                  nextSkin = Number(stepTowardTarget(currSkin, 37.6, 0.2).toFixed(1));
                } else if (isCardiacArrest) {
                  // Interconnected: Cardiac standstill -> peripheral skin cooling (~35.4 °C Yellow)
                  nextSkin = Number(stepTowardTarget(currSkin, 35.4, 0.2).toFixed(1));
                } else if (currSkin > 36.9 || currSkin < 36.0) {
                  // Smoothly recover back to nominal when radiation/thermal anomaly clears
                  nextSkin = Number(stepTowardTarget(currSkin, skinBase, 0.2).toFixed(1));
                } else {
                  nextSkin = Number(
                    stepBounded(currSkin, 36.1, skinBase, 36.8, 36.9, 0.02, 0.04, isActive, isCooldown).toFixed(1)
                  );
                }
                var prevSkinSeries = Array.isArray(skinItem.series) ? skinItem.series : [skinBase];
                var nextSkinSeries = prevSkinSeries.concat([nextSkin]).slice(-12);
                var nextSkinLabels = nextSkinSeries.map(function (_, idx) {
                  var ago = (nextSkinSeries.length - 1 - idx) * (hasSkinCoupling ? 1 : 5);
                  return ago === 0 ? "Now" : "-" + ago + "s";
                });
                nextMap.skin_surface = Object.assign({}, skinItem, {
                  value: nextSkin.toFixed(1),
                  series: nextSkinSeries,
                  seriesLabels: nextSkinLabels,
                });
              }

              var hasRespCoupling =
                isCardiacArrest ||
                isRedHypoxiaDriver ||
                isYellowHypoxiaDriver ||
                isRedTachycardia ||
                isYellowTachycardia;
              if (prev.respiration_rate && !locks.respiration_rate && (hasRespCoupling || tick % 100 === 0)) {
                var rrItem = prev.respiration_rate;
                var rrBase = isOuterSpace ? 17 : 14;
                var currRr = parseInt(rrItem.value, 10);
                if (!Number.isFinite(currRr)) currRr = rrBase;
                var nextRr = currRr;
                if (isCardiacArrest) {
                  // Interconnected: Stopped heartbeats -> agonal hypoventilation / apnea (~5 breaths/min Red)
                  nextRr = Math.round(stepTowardTarget(currRr, 5, 2));
                } else if (isRedHypoxiaDriver || isRedTachycardia) {
                  // Interconnected: Severe hypoxia/hypercapnia or extreme tachycardia -> hyperventilation (~29 breaths/min Red)
                  nextRr = Math.round(stepTowardTarget(currRr, 29, 2));
                } else if (isYellowHypoxiaDriver || isYellowTachycardia) {
                  // Interconnected: Low O2 / high CO2 / tachycardia -> elevated respiration (~24 breaths/min Yellow)
                  nextRr = Math.round(stepTowardTarget(currRr, 24, 2));
                } else if (currRr > 19 || currRr < 12) {
                  nextRr = Math.round(stepTowardTarget(currRr, rrBase, 2));
                } else {
                  nextRr = Math.round(
                    stepBounded(
                      currRr,
                      isOuterSpace ? 15 : 12,
                      rrBase,
                      isOuterSpace ? 19 : 17,
                      19,
                      1,
                      1,
                      isActive,
                      isCooldown
                    )
                  );
                }
                var prevRrSeries = Array.isArray(rrItem.series) ? rrItem.series : [rrBase];
                var nextRrSeries = prevRrSeries.concat([nextRr]).slice(-12);
                var nextRrLabels = nextRrSeries.map(function (_, idx) {
                  var ago = (nextRrSeries.length - 1 - idx) * (hasRespCoupling ? 1 : 10);
                  return ago === 0 ? "Now" : "-" + ago + "s";
                });
                nextMap.respiration_rate = Object.assign({}, rrItem, {
                  value: String(nextRr),
                  series: nextRrSeries,
                  seriesLabels: nextRrLabels,
                });
              }
            }

            // 4. Every 5.0s (tick % 50 === 0): Radiation exposure (in Röntgen R), Metabolic rate (Number), Outside temp, Humidity
            if (tick % 50 === 0) {
              var isSpace5s = envModeRef.current === "outer-space";
              if (prev.radiation_exposure && !locks.radiation_exposure) {
                var radItem = prev.radiation_exposure;
                var radBase = isSpace5s ? 0.048 : 0.038;
                var currRad = parseFloat(radItem.value);
                if (!Number.isFinite(currRad) || currRad > 0.053) currRad = radBase;
                if (sim.radAnomalyTicks <= 0 && Math.random() < 0.03) {
                  sim.radAnomalyTicks = 2 + Math.floor(Math.random() * 3);
                }
                var inAnomaly = sim.radAnomalyTicks > 0;
                if (inAnomaly) sim.radAnomalyTicks -= 1;
                // Strictly bounded below 0.055 R and step <= 0.002 R so random radiation never triggers warnings
                var nextRad = isSpace5s
                  ? Number(
                      stepBounded(currRad, 0.045, 0.048, 0.051, 0.052, 0.001, 0.002, inAnomaly, !inAnomaly && currRad > 0.050).toFixed(3)
                    )
                  : Number(
                      stepBounded(currRad, 0.034, 0.038, 0.043, 0.046, 0.001, 0.002, inAnomaly, !inAnomaly && currRad > 0.043).toFixed(3)
                    );
                var prevRadSeries = Array.isArray(radItem.series) ? radItem.series : [radBase];
                var nextRadSeries = prevRadSeries.concat([nextRad]).slice(-7);
                nextMap.radiation_exposure = Object.assign({}, radItem, {
                  value: nextRad.toFixed(3),
                  series: nextRadSeries,
                  seriesLabels: ["-30s", "-25s", "-20s", "-15s", "-10s", "-5s", "Now"].slice(-nextRadSeries.length),
                });
              }

              if (prev.metabolic_rate && !locks.metabolic_rate) {
                var metItem = prev.metabolic_rate;
                var metBase = isSpace5s ? 146.0 : 92.5;
                var currMet = parseFloat(metItem.value);
                if (!Number.isFinite(currMet)) currMet = metBase;
                var nextMet = currMet;
                if (isRedTachycardia) {
                  nextMet = stepTowardTarget(currMet, 262.0, 18.0);
                } else if (isYellowTachycardia || isRedThermalDriver) {
                  nextMet = stepTowardTarget(currMet, 212.0, 14.0);
                } else if (isCardiacArrest) {
                  nextMet = stepTowardTarget(currMet, 48.0, 12.0);
                } else if (currMet > 184.0 || currMet < 75.0) {
                  nextMet = stepTowardTarget(currMet, metBase, 14.0);
                } else {
                  nextMet = isSpace5s
                    ? stepBounded(currMet, 132.0, 146.0, 162.0, 182.0, 1.5, 3.5, isActive, isCooldown)
                    : stepBounded(currMet, 82.0, 92.5, 112.0, 180.0, 1.5, 3.5, isActive, isCooldown);
                }
                var cleanMet = Number(nextMet.toFixed(1));
                histBuf.metabolic_rate = (histBuf.metabolic_rate || [metBase]).concat([cleanMet]).slice(-10);
                var wattsVal = Math.round(cleanMet * 1.163);
                nextMap.metabolic_rate = Object.assign({}, metItem, {
                  value: cleanMet.toFixed(1) + " kcal/h (" + wattsVal + " W)",
                });
              }

              if (prev.outside_temperature && !locks.outside_temperature) {
                var cabTempItem = prev.outside_temperature;
                var outTempTarget = isSpace5s ? -270.4 : 21.4;
                var currCabTemp = parseFloat(cabTempItem.value);
                if (!Number.isFinite(currCabTemp)) currCabTemp = outTempTarget;
                var nextCabTemp = outTempTarget;
                if (isSpace5s) {
                  if (currCabTemp > -268.0 || currCabTemp < -271.5) {
                    nextCabTemp = -270.4;
                  } else {
                    nextCabTemp = Number(
                      stepBounded(currCabTemp, -270.6, -270.4, -269.9, -269.7, 0.03, 0.08, false, false).toFixed(1)
                    );
                  }
                } else {
                  if (currCabTemp < 20.4 || currCabTemp > 22.5) {
                    nextCabTemp = 21.4;
                  } else {
                    nextCabTemp = Number(
                      stepBounded(currCabTemp, 20.9, 21.4, 22.0, 22.3, 0.03, 0.06, false, false).toFixed(1)
                    );
                  }
                }
                var prevCabSeries = Array.isArray(cabTempItem.series) ? cabTempItem.series : [outTempTarget];
                var nextCabSeries = prevCabSeries.concat([nextCabTemp]).slice(-12);
                var nextCabLabels = nextCabSeries.map(function (_, idx) {
                  var ago = (nextCabSeries.length - 1 - idx) * 5;
                  return ago === 0 ? "Now" : "-" + ago + "s";
                });
                nextMap.outside_temperature = Object.assign({}, cabTempItem, {
                  value: nextCabTemp.toFixed(1),
                  series: nextCabSeries,
                  seriesLabels: nextCabLabels,
                });
              }

              if (prev.humidity && !locks.humidity) {
                var humItem = prev.humidity;
                var humBase = isSpace5s ? 37.5 : 44.0;
                var currHum = parseFloat(humItem.value);
                if (!Number.isFinite(currHum)) currHum = humBase;
                var nextHum = currHum;
                if (isRedThermalDriver) {
                  // Interconnected: High suit/cabin heat -> heavy perspiration increases humidity (>60% Red)
                  nextHum = Number(stepTowardTarget(currHum, 61.5, 2.2).toFixed(1));
                } else if (isYellowThermalDriver || isRedRadiation) {
                  // Interconnected: Moderate thermal load -> perspiration increases humidity (>52% Yellow)
                  nextHum = Number(stepTowardTarget(currHum, 54.4, 1.8).toFixed(1));
                } else if (isSpace5s) {
                  if (currHum > 40.5 || currHum < 35.5) {
                    nextHum = Number(stepTowardTarget(currHum, 37.5, 1.5).toFixed(1));
                  } else {
                    nextHum = Number(
                      stepBounded(currHum, 36.0, 37.5, 39.2, 40.0, 0.1, 0.2, isActive, isCooldown).toFixed(1)
                    );
                  }
                } else if (currHum > 49.5 || currHum < 40.0) {
                  nextHum = Number(stepTowardTarget(currHum, 44.0, 1.8).toFixed(1));
                } else {
                  nextHum = Number(
                    stepBounded(currHum, 41.0, 44.0, 47.0, 49.0, 0.1, 0.2, isActive, isCooldown).toFixed(1)
                  );
                }
                var prevHumSeries = Array.isArray(humItem.series) ? humItem.series : [humBase];
                var nextHumSeries = prevHumSeries.concat([nextHum]).slice(-12);
                var nextHumLabels = nextHumSeries.map(function (_, idx) {
                  var ago = (nextHumSeries.length - 1 - idx) * 5;
                  return ago === 0 ? "Now" : "-" + ago + "s";
                });
                nextMap.humidity = Object.assign({}, humItem, {
                  value: nextHum.toFixed(1),
                  series: nextHumSeries,
                  seriesLabels: nextHumLabels,
                });
              }
            }

            // 5. Every 10.0s (tick % 100 === 0): Sleep amount (per sol) & Exercise activity (per sol)
            if (tick % 100 === 0) {
              if (prev.sleep_amount && !locks.sleep_amount) {
                var slpItem = prev.sleep_amount;
                var currSlp = parseFloat(slpItem.value);
                if (!Number.isFinite(currSlp)) currSlp = 7.5;
                var nextSlp = Number(stepBounded(currSlp, 7.0, 7.5, 8.1, 8.2, 0.1, 0.15, false, false).toFixed(1));
                var prevSlpSeries = Array.isArray(slpItem.series) ? slpItem.series.slice() : [7.8, 7.2, 8.0, 6.9, 7.4, 7.6, 7.5];
                prevSlpSeries[prevSlpSeries.length - 1] = nextSlp;
                nextMap.sleep_amount = Object.assign({}, slpItem, {
                  value: nextSlp.toFixed(1),
                  series: prevSlpSeries,
                });
              }

              if (prev.exercise_activity && !locks.exercise_activity) {
                var exItem = prev.exercise_activity;
                var currEx = parseInt(exItem.value, 10);
                if (!Number.isFinite(currEx)) currEx = 90;
                var nextEx = Math.round(stepBounded(currEx, 80, 90, 104, 112, 1, 2, isActive, isCooldown));
                var exKcal = Math.round(nextEx * 7.1);
                var prevExSeries = Array.isArray(exItem.series) ? exItem.series.slice() : [85, 90, 95, 80, 90, 100, 90];
                prevExSeries[prevExSeries.length - 1] = nextEx;
                nextMap.exercise_activity = Object.assign({}, exItem, {
                  value: nextEx + " min/sol (" + exKcal + " kcal/sol)",
                  series: prevExSeries,
                });
              }
            }

            return nextMap;
          });
        }, 100);

        return function () {
          window.clearInterval(simInterval);
        };
      },
      []
    );

    var sample = getAstronautSampleData(astronaut, slotIndex);
    var selectedPart = selectedPartId ? sample.bodyParts[selectedPartId] : null;
    var displayName = getAstronautFullName(astronaut) || "Name Surname";
    var missionDay = (astronaut && astronaut.missionDay) || 142;
    var filteredHealthPlanRows = sample.healthPlanRows.filter(function (row) {
      return Boolean(visibleVitals[row.id]);
    });
    var connectedToApi = browserOnline && !offlineMode;
    var chronologicalHistory = apiHistory.slice().reverse();
    var chartRates = chronologicalHistory
      .map(function (record) {
        var vitals = record && record.vitals ? record.vitals : record || {};
        return Number(vitals.heart_rate);
      })
      .filter(function (value) {
        return Number.isFinite(value);
      });
    var chartMinimum = chartRates.length ? Math.min.apply(Math, chartRates) : 0;
    var chartMaximum = chartRates.length ? Math.max.apply(Math, chartRates) : 1;
    var chartPolyline = chartRates
      .map(function (value, index) {
        var x = chartRates.length > 1 ? (index / (chartRates.length - 1)) * 280 : 140;
        var spread = chartMaximum - chartMinimum || 1;
        var y = 82 - ((value - chartMinimum) / spread) * 64;
        return x.toFixed(1) + "," + y.toFixed(1);
      })
      .join(" ");
    var latestApiRecord = apiHistory.length ? apiHistory[0] : null;
    var latestApiVitals =
      latestApiRecord && latestApiRecord.vitals ? latestApiRecord.vitals : latestApiRecord || {};
    var apiProfileBaseline =
      apiProfile && apiProfile.medical_baseline
        ? apiProfile.medical_baseline
        : astronaut && astronaut.medical_baseline
        ? astronaut.medical_baseline
        : {};

    function createWarningLogObject(item, details, currentMeasurementsMap, isAdditionalCritical) {
      var nowObj = new Date();
      var pad2 = function (n) {
        return String(n).padStart(2, "0");
      };
      var tsStr =
        pad2(nowObj.getDate()) +
        "/" +
        pad2(nowObj.getMonth() + 1) +
        "/" +
        nowObj.getFullYear() +
        " " +
        pad2(nowObj.getHours()) +
        ":" +
        pad2(nowObj.getMinutes()) +
        ":" +
        pad2(nowObj.getSeconds());

      var recSeries = [];
      var recSecondary = null;
      var recLabels = [];
      if (Array.isArray(item.series) && item.series.length > 0) {
        recSeries = item.series.slice(-10).map(function (v) {
          return typeof v === "number" ? v : parseFloat(v);
        });
        if (Array.isArray(item.seriesSecondary) && item.seriesSecondary.length > 0) {
          recSecondary = item.seriesSecondary.slice(-recSeries.length).map(function (v) {
            return typeof v === "number" ? v : parseFloat(v);
          });
        }
        var rawLbls = Array.isArray(item.seriesLabels) ? item.seriesLabels.slice(-recSeries.length) : [];
        recLabels = recSeries.map(function (_, i) {
          if (i === recSeries.length - 1) return "Trigger";
          return rawLbls[i] || "-" + (recSeries.length - 1 - i) + "s";
        });
      } else {
        var buf = (recentHistoryBufferRef.current && recentHistoryBufferRef.current[item.id]) || [];
        var numCurr = parseFloat(item.value);
        recSeries = buf.slice(-9);
        if (Number.isFinite(numCurr)) {
          recSeries.push(numCurr);
        }
        if (recSeries.length === 0) recSeries = [0];
        recLabels = recSeries.map(function (_, i) {
          return i === recSeries.length - 1 ? "Trigger" : "-" + (recSeries.length - 1 - i) + "s";
        });
      }

      var mMap = currentMeasurementsMap || measurements || {};
      var hrV = mMap.heart_rate ? mMap.heart_rate.value : "78";
      var bpV = mMap.pressure ? mMap.pressure.value : "116/75";
      var spo2V = mMap.oxygen_level_in_blood ? mMap.oxygen_level_in_blood.value : "98.6";
      var rrV = mMap.respiration_rate ? mMap.respiration_rate.value : "14";
      var suitTV = mMap.temp_inside_costume ? mMap.temp_inside_costume.value : "21.6";
      var radV = mMap.radiation_exposure ? mMap.radiation_exposure.value : "0.038";
      var snapshotStr =
        "HR: " +
        hrV +
        " bpm | BP: " +
        bpV +
        " mmHg | SpO2: " +
        spo2V +
        "% | RR: " +
        rrV +
        " breaths/min | Suit Temp: " +
        suitTV +
        " °C | Rad: " +
        radV +
        " R";

      var uniqueId = "WLOG-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7);
      var valStr = String(item.value);
      var addlCrit = Boolean(isAdditionalCritical || details.isAdditionalCritical);
      var effectiveSeverity = addlCrit ? "yellow" : details.level;
      var countermeasuresStr = getCountermeasuresForWarning(
        item.id,
        addlCrit ? "red" : details.level,
        details.instruction
      );
      var reasonText = addlCrit
        ? details.reason.indexOf("Additional critical events occurred") === 0
          ? details.reason
          : "Additional critical events occurred: " + details.reason
        : details.reason;

      return {
        id: uniqueId,
        specId: item.id,
        source: "SIMULATED TELEMETRY",
        measurementName: item.name,
        priority: details.priority,
        severity: effectiveSeverity,
        isAdditionalCritical: addlCrit,
        status: addlCrit
          ? "Warning — Additional Critical Event"
          : details.level === "red"
          ? "Critical — Initial SOS Triggered"
          : "Active / Under Review",
        sol: missionDay,
        timestamp: tsStr,
        triggerValue: valStr,
        initialTriggerValue: valStr,
        peakValue: valStr,
        updateCount: 1,
        unit: item.unit,
        thresholdRule: item.threshold,
        reason: reasonText,
        countermeasures: countermeasuresStr,
        chartType: item.chartType || "line",
        recentRecords: recSeries,
        recentSecondary: recSecondary,
        recentLabels: recLabels,
        concurrentSnapshot: snapshotStr,
        analysisNotes: addlCrit
          ? "Additional critical events occurred following the initial Red SOS trigger when " +
            item.name +
            " reached critical level " +
            valStr +
            (item.unit && item.unit !== "N/A" ? " " + item.unit : "") +
            ". Recorded and displayed as a Yellow-style warning per SOS protocol. Possible Countermeasures: " +
            countermeasuresStr
          : "Auto-recorded when " +
            item.name +
            " reached " +
            valStr +
            (item.unit && item.unit !== "N/A" ? " " + item.unit : "") +
            " (" +
            details.level.toUpperCase() +
            "). Recent telemetry window (" +
            recSeries.length +
            " samples) captured around trigger. Possible Countermeasures: " +
            countermeasuresStr,
        manuallyEdited: false,
      };
    }

    function isBigTelemetryChange(specId, prevValStr, newValStr, prevLevel, newLevel) {
      if (prevLevel !== newLevel) return true;
      if (String(prevValStr) === String(newValStr)) return false;

      if (specId === "pressure") {
        var p1 = String(prevValStr).split("/");
        var p2 = String(newValStr).split("/");
        var s1 = parseFloat(p1[0]);
        var d1 = parseFloat(p1[1]);
        var s2 = parseFloat(p2[0]);
        var d2 = parseFloat(p2[1]);
        if (Number.isFinite(s1) && Number.isFinite(s2) && Math.abs(s2 - s1) >= 3) return true;
        if (Number.isFinite(d1) && Number.isFinite(d2) && Math.abs(d2 - d1) >= 2) return true;
        return false;
      }

      var n1 = parseFloat(prevValStr);
      var n2 = parseFloat(newValStr);
      if (!Number.isFinite(n1) || !Number.isFinite(n2)) {
        return String(prevValStr) !== String(newValStr);
      }
      var diff = Math.abs(n2 - n1);
      if (specId === "heart_rate") return diff >= 3;
      if (specId === "oxygen_level_in_blood") return diff >= 0.4;
      if (specId === "radiation_exposure") return diff >= 0.003;
      if (specId === "respiration_rate") return diff >= 1.5;
      if (specId === "co2_level") return diff >= 0.2;
      if (specId === "oxygen_left" || specId === "battery_level") return diff >= 1.0;
      if (
        specId === "temp_inside_costume" ||
        specId === "skin_surface" ||
        specId === "temp_outside_costume" ||
        specId === "outside_temperature"
      ) {
        return diff >= 0.3;
      }
      if (specId === "electrocardiogram") {
        return diff >= 0.1 || String(prevValStr) !== String(newValStr);
      }
      var base = Math.max(Math.abs(n1), 0.001);
      return diff / base >= 0.025;
    }

    // Watch measurements for:
    // 1. Automatic 5-second minimum warning hold (latchedWarningsRef) so any concerning warning stays >= 5s no matter what
    // 2. Automatic Warning Log recording whenever a parameter triggers Yellow or Red, PLUS automatic in-place updates when big changes occur
    // 3. Initial Red trigger opens full-screen SOS once; any subsequent Red triggers after the initial Red warning are recorded as warnings and displayed like Yellow warnings stating "Additional critical events occurred"
    useEffect(
      function () {
        if (!measurements) return;
        var nowMs = Date.now();
        var shouldOpenInitialSos = false;
        var ackMap = acknowledgedRedsRef.current || {};
        var latches = latchedWarningsRef.current || {};
        var lastLogged = lastLoggedLevelRef.current || {};
        var logOps = [];

        // Check if any measurement is currently in raw Red state
        var anyRawRedNow = MEASUREMENT_SPECS.some(function (spec) {
          var it = measurements[spec.id];
          return it && getMeasurementAlertLevel(it) === "red";
        });
        if (!anyRawRedNow) {
          initialRedSosSpecRef.current = null;
          acknowledgedRedsRef.current = {};
        }

        MEASUREMENT_SPECS.forEach(function (spec) {
          var id = spec.id;
          var item = measurements[id];
          if (!item) return;
          var rawDetails = getMeasurementAlertDetails(item);
          var isAdditionalCritical = false;

          if (rawDetails.level === "red") {
            if (!initialRedSosSpecRef.current) {
              initialRedSosSpecRef.current = id;
              isAdditionalCritical = false;
              if (!ackMap.__initialSosAcknowledged) {
                shouldOpenInitialSos = true;
                ackMap.__initialSosAcknowledged = true;
              }
            } else if (initialRedSosSpecRef.current === id) {
              isAdditionalCritical = false;
            } else {
              // Another Red trigger occurred AFTER the initial Red warning -> treat as warning & display like Yellow warning
              isAdditionalCritical = true;
            }
          }

          var effectiveDetails = isAdditionalCritical
            ? {
                level: "yellow",
                isAdditionalCritical: true,
                priority: rawDetails.priority,
                reason: "Additional critical events occurred: " + rawDetails.reason,
                instruction: rawDetails.instruction,
              }
            : rawDetails;

          var rawTrack = lastLogged[id];
          var track =
            rawTrack && typeof rawTrack === "object"
              ? rawTrack
              : { level: "normal", logId: null, lastValueStr: "", lastUpdateMs: 0, isAdditionalCritical: false };

          if (effectiveDetails.level === "yellow" || effectiveDetails.level === "red") {
            if (!latches[id]) {
              latches[id] = {
                id: id,
                triggeredAt: nowMs,
                minHoldUntil: nowMs + 5000,
                itemSnapshot: Object.assign({}, item),
                details: effectiveDetails,
                dismissed: false,
                dismissedVal: null,
                dismissRequested: false,
              };
            } else {
              latches[id].itemSnapshot = Object.assign({}, item);
              latches[id].details = effectiveDetails;
              if (
                (rawDetails.level === "red" && track.level === "normal") ||
                track.isAdditionalCritical !== isAdditionalCritical
              ) {
                latches[id].minHoldUntil = nowMs + 5000;
                latches[id].dismissed = false;
              }
            }

            if (track.level === "normal" || !track.logId) {
              var newLogObj = createWarningLogObject(item, effectiveDetails, measurements, isAdditionalCritical);
              lastLogged[id] = {
                level: effectiveDetails.level,
                isAdditionalCritical: isAdditionalCritical,
                logId: newLogObj.id,
                lastValueStr: String(item.value),
                lastUpdateMs: nowMs,
              };
              logOps.push({
                type: "insert",
                specId: id,
                log: newLogObj,
              });
            } else if (
              isBigTelemetryChange(id, track.lastValueStr, String(item.value), track.level, effectiveDetails.level) ||
              track.isAdditionalCritical !== isAdditionalCritical
            ) {
              var prevValRecorded = track.lastValueStr;
              var prevSeverity = track.level;
              var freshSnap = createWarningLogObject(item, effectiveDetails, measurements, isAdditionalCritical);
              lastLogged[id] = {
                level: effectiveDetails.level,
                isAdditionalCritical: isAdditionalCritical,
                logId: track.logId,
                lastValueStr: String(item.value),
                lastUpdateMs: nowMs,
              };
              logOps.push({
                type: "update",
                specId: id,
                logId: track.logId,
                fresh: freshSnap,
                prevValStr: prevValRecorded,
                prevSeverity: prevSeverity,
              });
            }
          } else {
            if (latches[id]) {
              if (nowMs >= latches[id].minHoldUntil) {
                delete latches[id];
                lastLogged[id] = {
                  level: "normal",
                  isAdditionalCritical: false,
                  logId: null,
                  lastValueStr: String(item.value),
                  lastUpdateMs: nowMs,
                };
              }
            } else {
              lastLogged[id] = {
                level: "normal",
                isAdditionalCritical: false,
                logId: null,
                lastValueStr: String(item.value),
                lastUpdateMs: nowMs,
              };
            }
          }

          // If user requested dismissal, only allow removal after the 5-second minimum hold!
          if (latches[id] && latches[id].dismissRequested && nowMs >= latches[id].minHoldUntil) {
            var latchedVal = String(
              latches[id].dismissRequestedVal ||
                (latches[id].itemSnapshot ? latches[id].itemSnapshot.value : item.value)
            );
            delete latches[id];
            setDismissedWarnings(function (prev) {
              if (prev[id] === latchedVal) return prev;
              var next = Object.assign({}, prev);
              next[id] = latchedVal;
              return next;
            });
          }
        });

        if (logOps.length > 0) {
          setWarningLogs(function (prevLogs) {
            var nextLogs = prevLogs.slice();
            var toPrepend = [];

            logOps.forEach(function (op) {
              if (op.type === "insert") {
                toPrepend.push(op.log);
              } else if (op.type === "update") {
                var foundIndex = nextLogs.findIndex(function (entry) {
                  return entry.id === op.logId;
                });
                if (foundIndex !== -1) {
                  var existing = nextLogs[foundIndex];
                  var newCount = (existing.updateCount || 1) + 1;
                  var initVal = existing.initialTriggerValue || existing.triggerValue;
                  var unitSuffix =
                    op.fresh.unit && op.fresh.unit !== "N/A" ? " " + op.fresh.unit.split(" ")[0] : "";
                  var addlCritFlag = Boolean(existing.isAdditionalCritical || op.fresh.isAdditionalCritical);
                  var autoNote = existing.manuallyEdited
                    ? existing.analysisNotes
                    : (addlCritFlag
                        ? "Additional critical events occurred (auto-tracked #" + newCount + "): "
                        : "Auto-tracked warning (" + newCount + " updates): ") +
                      "Initial trigger at " +
                      initVal +
                      unitSuffix +
                      " → latest big change to " +
                      op.fresh.triggerValue +
                      unitSuffix +
                      (addlCritFlag ? " [ADDITIONAL CRITICAL EVENT WARNING]" : " (" + op.fresh.severity.toUpperCase() + ")") +
                      ". Possible Countermeasures: " +
                      op.fresh.countermeasures;

                  nextLogs[foundIndex] = Object.assign({}, existing, {
                    severity: addlCritFlag
                      ? "yellow"
                      : existing.severity === "red" || op.fresh.severity === "red"
                      ? "red"
                      : op.fresh.severity,
                    isAdditionalCritical: addlCritFlag,
                    status: addlCritFlag
                      ? "Warning — Additional Critical Event (#" + newCount + ")"
                      : op.fresh.severity === "red"
                      ? "Critical — Initial SOS Triggered"
                      : existing.manuallyEdited
                      ? existing.status
                      : "Active — Auto-Updated (#" + newCount + ")",
                    timestamp: op.fresh.timestamp,
                    sol: op.fresh.sol,
                    triggerValue: op.fresh.triggerValue,
                    initialTriggerValue: initVal,
                    peakValue: op.fresh.triggerValue,
                    updateCount: newCount,
                    reason: op.fresh.reason,
                    countermeasures: existing.manuallyEdited
                      ? existing.countermeasures || op.fresh.countermeasures
                      : op.fresh.countermeasures,
                    recentRecords: op.fresh.recentRecords,
                    recentSecondary: op.fresh.recentSecondary,
                    recentLabels: op.fresh.recentLabels,
                    concurrentSnapshot: op.fresh.concurrentSnapshot,
                    analysisNotes: autoNote,
                  });
                } else {
                  // Target log was deleted earlier; insert fresh log and update ref
                  toPrepend.push(op.fresh);
                  if (lastLoggedLevelRef.current[op.specId]) {
                    lastLoggedLevelRef.current[op.specId].logId = op.fresh.id;
                  }
                }
              }
            });

            var finalLogs = toPrepend.concat(nextLogs);
            saveStoredWarningLogs(astroKey, finalLogs);
            return finalLogs;
          });
        }

        if (shouldOpenInitialSos && !alertActive) {
          setDiagnosticActive(false);
          setAlertCountdown(20);
          setAlertActive(true);
        }
      },
      [measurements, alertActive]
    );

    useEffect(function () {
      var timer = window.setInterval(function () {
        setNow(new Date());
      }, 30000);
      return function () {
        window.clearInterval(timer);
      };
    }, []);

    useEffect(
      function () {
        if (!alertActive) return;
        var interval = window.setInterval(function () {
          setAlertCountdown(function (prev) {
            return prev > 0 ? prev - 1 : 0;
          });
        }, 1000);
        return function () {
          window.clearInterval(interval);
        };
      },
      [alertActive]
    );

    function toggleTask(key) {
      setTasks(function (prev) {
        var next = Object.assign({}, prev);
        next[key] = !prev[key];
        return next;
      });
    }

    function openVitalsSetup() {
      setDraftVisibleVitals(Object.assign({}, visibleVitals));
      setVitalsSetupOpen(true);
    }

    function toggleDraftVital(id) {
      setDraftVisibleVitals(function (prev) {
        var next = Object.assign({}, prev);
        next[id] = !next[id];
        return next;
      });
    }

    function setAllDraftVitals(val) {
      var next = {};
      sample.healthPlanRows.forEach(function (row) {
        next[row.id] = val;
      });
      setDraftVisibleVitals(next);
    }

    function saveVitalsSetup() {
      if (draftVisibleVitals) {
        setVisibleVitals(Object.assign({}, draftVisibleVitals));
      }
      setVitalsSetupOpen(false);
    }

    function toggleGcCategory(key) {
      setGcCategories(function (prev) {
        var next = Object.assign({}, prev);
        next[key] = !prev[key];
        return next;
      });
      setGcStatusMsg("");
    }

    function runTxtExport(periodObj) {
      if (!gcCategories.vitals && !gcCategories.healthPlan && !gcCategories.logs) {
        setGcStatusMsg("Please select at least one category (VITALS, HEALTH PLAN, or LOGS) to export.");
        return;
      }
      var exportNow = new Date();
      var pad2 = function (n) {
        return String(n).padStart(2, "0");
      };
      var stamp =
        exportNow.getFullYear() +
        "-" +
        pad2(exportNow.getMonth() + 1) +
        "-" +
        pad2(exportNow.getDate()) +
        "_" +
        pad2(exportNow.getHours()) +
        pad2(exportNow.getMinutes());
      var slug =
        displayName
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") || "crew-member";
      var filename = "crew-log_" + slug + "_" + periodObj.id + "_" + stamp + ".txt";
      var txtContent = buildExportLogText(
        astronaut,
        sample,
        tasks,
        periodObj,
        gcCustomRange,
        gcCategories,
        exportNow
      );
      downloadTxtFile(filename, txtContent);
      setGcStatusMsg("Exported " + filename + " to your Downloads folder.");
    }

    function handleSelectPeriod(periodObj) {
      setGcPeriod(periodObj.id);
      setGcStatusMsg("");
    }

    function handleTriggerExport() {
      var periodObj = GROUND_CONTROL_PERIODS.find(function (p) {
        return p.id === gcPeriod;
      });
      if (!periodObj) {
        setGcStatusMsg("Please select a time period before exporting.");
        return;
      }
      runTxtExport(periodObj);
    }

    function triggerTestAlert() {
      setTestModalOpen(true);
    }

    function closeAlertScreen() {
      acknowledgedRedsRef.current.__initialSosAcknowledged = true;
      if (measurements) {
        Object.keys(measurements).forEach(function (id) {
          var item = measurements[id];
          if (getMeasurementAlertLevel(item) === "red") {
            acknowledgedRedsRef.current[id] = String(item.value);
          }
        });
      }
      setAlertActive(false);
    }

    function getEffectiveMeasurementAlertDetails(item) {
      if (!item) {
        return { level: "normal", reason: "", priority: 99 };
      }
      var raw = getMeasurementAlertDetails(item);
      if (raw.level === "red") {
        if (initialRedSosSpecRef.current && initialRedSosSpecRef.current !== item.id) {
          return {
            level: "yellow",
            isAdditionalCritical: true,
            priority: raw.priority,
            reason: "Additional critical events occurred: " + raw.reason,
            instruction: raw.instruction,
          };
        }
        return raw;
      }
      if (raw.level === "yellow") {
        return raw;
      }
      var latch = latchedWarningsRef.current[item.id];
      if (latch && Date.now() < latch.minHoldUntil) {
        return (
          latch.details || {
            level: "yellow",
            reason: "Concerning reading held for minimum 5-second observation window.",
            priority: MEASUREMENT_PRIORITY_MAP[item.id] || 50,
          }
        );
      }
      return raw;
    }

    function getEffectiveMeasurementAlertLevel(item) {
      return getEffectiveMeasurementAlertDetails(item).level;
    }

    function dismissWarningItem(specId, currentVal) {
      var latch = latchedWarningsRef.current[specId];
      if (latch) {
        latch.dismissed = true;
        latch.dismissedVal = String(currentVal);
        latch.dismissRequested = false;
      }
      setDismissedWarnings(function (prev) {
        var next = Object.assign({}, prev);
        next[specId] = String(currentVal);
        return next;
      });
    }

    function openMeasurementFromWarning(specId) {
      if (!measurements || !measurements[specId]) return;
      closeAlertScreen();
      setDiagnosticActive(false);
      setActiveTab("measurements");
      setMeasEditMode(false);
      setSelectedMeasId(specId);
      setMeasModalMode("view");
    }

    function openWarningLogForMeasurement(specId) {
      closeAlertScreen();
      setDiagnosticActive(false);
      setActiveTab("warning-log");
      setWlogFilter("all");
      setWlogSearch("");
      var match = warningLogs.find(function (l) {
        return l.specId === specId;
      });
      if (match) {
        setSelectedWlogId(match.id);
      }
    }

    function toggleWlogEditMode() {
      setWlogEditMode(function (prev) {
        return !prev;
      });
    }

    function handleQuickUpdateWarningField(logId, fieldPatch) {
      if (!logId) return;
      setWarningLogs(function (prev) {
        var next = prev.map(function (item) {
          if (item.id !== logId) return item;
          return Object.assign({}, item, fieldPatch, { manuallyEdited: true });
        });
        saveStoredWarningLogs(astroKey, next);
        return next;
      });
    }

    function openEditWarningLogModal(logEntry) {
      if (!logEntry || !logEntry.id) return;
      var specKey = logEntry.specId || "heart_rate";
      setEditingLog({
        isNew: false,
        id: String(logEntry.id),
        timestamp: logEntry.timestamp || formatTimestamp(new Date()),
        solText: String(logEntry.sol !== undefined ? logEntry.sol : missionDay),
        specId: specKey,
        measurementName: logEntry.measurementName || "Heart rate",
        priorityText: String(logEntry.priority || 1),
        severity: logEntry.severity || "yellow",
        isAdditionalCritical: Boolean(logEntry.isAdditionalCritical),
        triggerValue: String(logEntry.triggerValue || ""),
        initialTriggerValue: String(logEntry.initialTriggerValue || logEntry.triggerValue || ""),
        updateCount: Number(logEntry.updateCount || 1),
        unit: String(logEntry.unit || ""),
        thresholdRule: String(logEntry.thresholdRule || ""),
        reason: String(logEntry.reason || ""),
        countermeasures: String(
          logEntry.countermeasures || getCountermeasuresForWarning(specKey, logEntry.severity)
        ),
        recentRecordsText: Array.isArray(logEntry.recentRecords) ? logEntry.recentRecords.join(", ") : "",
        recentSecondaryText: Array.isArray(logEntry.recentSecondary) ? logEntry.recentSecondary.join(", ") : "",
        recentLabelsText: Array.isArray(logEntry.recentLabels) ? logEntry.recentLabels.join(", ") : "",
        concurrentSnapshot: String(logEntry.concurrentSnapshot || ""),
        status: logEntry.status || "Under Review",
        analysisNotes: String(logEntry.analysisNotes || ""),
      });
    }

    function openAddWarningLogModal() {
      var defaultSpec = MEASUREMENT_SPECS[1] || MEASUREMENT_SPECS[0];
      var liveItem = (measurements && measurements[defaultSpec.id]) || defaultSpec;
      var recs = Array.isArray(liveItem.series) ? liveItem.series.slice(-10) : [80, 82, 85, 89, 94, 99, 103, 105];
      var lbls = Array.isArray(liveItem.seriesLabels) ? liveItem.seriesLabels.slice(-recs.length) : [];
      var newId = "WLOG-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
      setEditingLog({
        isNew: true,
        id: newId,
        timestamp: formatTimestamp(new Date()),
        solText: String(missionDay),
        specId: defaultSpec.id,
        measurementName: defaultSpec.name,
        priorityText: String(MEASUREMENT_PRIORITY_MAP[defaultSpec.id] || 2),
        severity: "yellow",
        isAdditionalCritical: false,
        triggerValue: String(liveItem.value || "128"),
        initialTriggerValue: String(liveItem.value || "128"),
        updateCount: 1,
        unit: String(defaultSpec.unit || "bpm"),
        thresholdRule: String(defaultSpec.threshold || ""),
        reason: "Manual warning log entry created for telemetry trend analysis.",
        countermeasures: getCountermeasuresForWarning(defaultSpec.id, "yellow"),
        recentRecordsText: recs.join(", "),
        recentSecondaryText: Array.isArray(liveItem.seriesSecondary)
          ? liveItem.seriesSecondary.slice(-10).join(", ")
          : "",
        recentLabelsText: lbls.join(", "),
        concurrentSnapshot:
          "HR: " +
          ((measurements && measurements.heart_rate && measurements.heart_rate.value) || "80") +
          " bpm | SpO2: " +
          ((measurements && measurements.oxygen_level_in_blood && measurements.oxygen_level_in_blood.value) || "98") +
          "% | BP: " +
          ((measurements && measurements.pressure && measurements.pressure.value) || "120/78") +
          " mmHg | Rad: " +
          ((measurements && measurements.radiation_exposure && measurements.radiation_exposure.value) || "0.038") +
          " R",
        status: "Under Review",
        analysisNotes: "Entered manually for flight surgeon review.",
      });
    }

    function handleSaveWarningLogModal(e) {
      if (e && e.preventDefault) e.preventDefault();
      if (!editingLog || !editingLog.id) return;
      var parsedRecords = String(editingLog.recentRecordsText || "")
        .split(",")
        .map(function (s) {
          return parseFloat(s.trim());
        })
        .filter(function (n) {
          return Number.isFinite(n);
        });
      var parsedSecondary = String(editingLog.recentSecondaryText || "")
        .split(",")
        .map(function (s) {
          return parseFloat(s.trim());
        })
        .filter(function (n) {
          return Number.isFinite(n);
        });
      var parsedLabels = String(editingLog.recentLabelsText || "")
        .split(",")
        .map(function (s) {
          return s.trim();
        })
        .filter(Boolean);
      if (parsedLabels.length < parsedRecords.length) {
        parsedLabels = parsedRecords.map(function (_, idx) {
          var offset = parsedRecords.length - 1 - idx;
          return offset === 0 ? "Trigger" : "-" + offset + "s";
        });
      }
      var matchedSpec =
        MEASUREMENT_SPECS.find(function (s) {
          return s.id === editingLog.specId;
        }) || MEASUREMENT_SPECS[0];
      var updatedEntry = {
        id: String(editingLog.id),
        timestamp: editingLog.timestamp || formatTimestamp(new Date()),
        sol: parseInt(editingLog.solText, 10) || missionDay,
        specId: editingLog.specId || matchedSpec.id,
        measurementName: editingLog.measurementName || matchedSpec.name,
        priority: parseInt(editingLog.priorityText, 10) || MEASUREMENT_PRIORITY_MAP[matchedSpec.id] || 1,
        severity: editingLog.severity === "red" ? "red" : "yellow",
        isAdditionalCritical: Boolean(editingLog.isAdditionalCritical),
        triggerValue: String(editingLog.triggerValue || ""),
        initialTriggerValue: String(editingLog.initialTriggerValue || editingLog.triggerValue || ""),
        peakValue: String(editingLog.triggerValue || ""),
        updateCount: Number(editingLog.updateCount || 1),
        unit: editingLog.unit || matchedSpec.unit,
        thresholdRule: editingLog.thresholdRule || matchedSpec.threshold,
        reason: editingLog.reason,
        countermeasures:
          editingLog.countermeasures || getCountermeasuresForWarning(matchedSpec.id, editingLog.severity),
        chartType: matchedSpec.chartType || "line",
        recentRecords: parsedRecords,
        recentSecondary: parsedSecondary.length > 0 ? parsedSecondary : null,
        recentLabels: parsedLabels,
        concurrentSnapshot: editingLog.concurrentSnapshot,
        status: editingLog.status || "Under Review",
        analysisNotes: editingLog.analysisNotes || "",
        manuallyEdited: true,
      };
      setWarningLogs(function (prev) {
        var exists = prev.some(function (item) {
          return item.id === updatedEntry.id;
        });
        var next = exists
          ? prev.map(function (item) {
              return item.id === updatedEntry.id ? updatedEntry : item;
            })
          : [updatedEntry].concat(prev);
        saveStoredWarningLogs(astroKey, next);
        return next;
      });
      setSelectedWlogId(updatedEntry.id);
      setEditingLog(null);
    }

    function handleDeleteWarningLog(logId) {
      if (!logId) return;
      var targetIdStr = String(logId);
      if (confirmDeleteTimerRef.current) {
        window.clearTimeout(confirmDeleteTimerRef.current);
        confirmDeleteTimerRef.current = null;
      }
      setConfirmDeleteWlogId(null);
      // Clear any active tracking reference pointing to this deleted log
      Object.keys(lastLoggedLevelRef.current || {}).forEach(function (specKey) {
        var tr = lastLoggedLevelRef.current[specKey];
        if (tr && tr.logId === targetIdStr) {
          tr.logId = null;
        }
      });
      setWarningLogs(function (prev) {
        var deletedIdx = prev.findIndex(function (item) {
          return String(item.id) === targetIdStr;
        });
        var next = prev.filter(function (item) {
          return String(item.id) !== targetIdStr;
        });
        saveStoredWarningLogs(astroKey, next);
        if (selectedWlogId === targetIdStr) {
          var fallbackItem = next[Math.min(deletedIdx, next.length - 1)] || next[0] || null;
          setSelectedWlogId(fallbackItem ? fallbackItem.id : null);
        }
        return next;
      });
      if (editingLog && String(editingLog.id) === targetIdStr) {
        setEditingLog(null);
      }
    }

    function requestDeleteWarningLog(logId) {
      if (!logId) return;
      var targetIdStr = String(logId);
      if (String(confirmDeleteWlogId) === targetIdStr) {
        handleDeleteWarningLog(targetIdStr);
      } else {
        setConfirmDeleteWlogId(targetIdStr);
        if (confirmDeleteTimerRef.current) {
          window.clearTimeout(confirmDeleteTimerRef.current);
        }
        confirmDeleteTimerRef.current = window.setTimeout(function () {
          setConfirmDeleteWlogId(function (prev) {
            return String(prev) === targetIdStr ? null : prev;
          });
        }, 4500);
      }
    }

    function handleResetWarningLogs() {
      var defaults = buildDefaultWarningLogs(astronaut, slotIndex);
      setWarningLogs(defaults);
      saveStoredWarningLogs(astroKey, defaults);
      if (defaults.length > 0) {
        setSelectedWlogId(defaults[0].id);
      }
    }

    function simulateWarningPreset(specId, severityLevel) {
      var presetGroup = TEST_WARNING_PRESETS[specId];
      if (!presetGroup || !presetGroup[severityLevel] || !measurements[specId]) return;
      var payload = presetGroup[severityLevel];
      var existing = measurements[specId];

      simLocksRef.current[specId] = true;
      delete acknowledgedRedsRef.current[specId];
      setDismissedWarnings(function (prev) {
        var next = Object.assign({}, prev);
        delete next[specId];
        return next;
      });

      var updatedItem = Object.assign({}, existing, {
        value: payload.value,
        series: payload.series ? payload.series.slice() : existing.series,
        seriesSecondary: payload.seriesSecondary ? payload.seriesSecondary.slice() : existing.seriesSecondary,
      });

      var isSubsequentRed = Boolean(
        severityLevel === "red" && initialRedSosSpecRef.current && initialRedSosSpecRef.current !== specId
      );
      if (severityLevel === "red" && !initialRedSosSpecRef.current) {
        initialRedSosSpecRef.current = specId;
        acknowledgedRedsRef.current.__initialSosAcknowledged = true;
      }

      var rawDetails = getMeasurementAlertDetails(updatedItem);
      var effectiveDetails = isSubsequentRed
        ? {
            level: "yellow",
            isAdditionalCritical: true,
            priority: rawDetails.priority,
            reason: "Additional critical events occurred: " + rawDetails.reason,
            instruction: rawDetails.instruction,
          }
        : rawDetails;

      latchedWarningsRef.current[specId] = {
        minHoldUntil: Date.now() + 5000,
        itemSnapshot: Object.assign({}, updatedItem),
        details: effectiveDetails,
        dismissedVal: null,
        dismissRequested: false,
      };

      var nextMap = Object.assign({}, measurements);
      nextMap[specId] = updatedItem;
      setMeasurements(nextMap);

      if (severityLevel === "red") {
        setTestModalOpen(false);
        if (!isSubsequentRed) {
          setDiagnosticActive(false);
          setAlertCountdown(20);
          setAlertActive(true);
        }
      }
    }

    function simulatePriorityWarningStack() {
      var stackIds = ["radiation_exposure", "pressure", "heart_rate"];
      var nextMap = Object.assign({}, measurements);
      var nowMs = Date.now();
      stackIds.forEach(function (id) {
        var presetGroup = TEST_WARNING_PRESETS[id];
        if (presetGroup && presetGroup.yellow && nextMap[id]) {
          simLocksRef.current[id] = true;
          var updatedItem = Object.assign({}, nextMap[id], {
            value: presetGroup.yellow.value,
            series: presetGroup.yellow.series ? presetGroup.yellow.series.slice() : nextMap[id].series,
            seriesSecondary: presetGroup.yellow.seriesSecondary
              ? presetGroup.yellow.seriesSecondary.slice()
              : nextMap[id].seriesSecondary,
          });
          nextMap[id] = updatedItem;
          latchedWarningsRef.current[id] = {
            minHoldUntil: nowMs + 5000,
            itemSnapshot: Object.assign({}, updatedItem),
            details: getMeasurementAlertDetails(updatedItem),
            dismissedVal: null,
            dismissRequested: false,
          };
        }
      });
      setDismissedWarnings({});
      setMeasurements(nextMap);
      setTestModalOpen(false);
    }

    function simulateCardiacArrestCascade() {
      if (!measurements || !measurements.heart_rate) return;
      var nowMs = Date.now();
      simLocksRef.current.heart_rate = true;
      delete simLocksRef.current.electrocardiogram;
      delete simLocksRef.current.pressure;
      delete simLocksRef.current.oxygen_level_in_blood;
      delete simLocksRef.current.respiration_rate;
      delete acknowledgedRedsRef.current.heart_rate;
      delete acknowledgedRedsRef.current.electrocardiogram;

      // Heart rate (0 bpm) is the initial Red SOS trigger; subsequent Red triggers (ECG flatline, BP drop, SpO2 drop) are recorded as warnings & displayed like Yellow warnings!
      if (!initialRedSosSpecRef.current) {
        initialRedSosSpecRef.current = "heart_rate";
      }
      acknowledgedRedsRef.current.__initialSosAcknowledged = true;
      var isHrSubsequentRed = initialRedSosSpecRef.current !== "heart_rate";

      var arrestHrItem = Object.assign({}, measurements.heart_rate, {
        value: "0",
        series: [78, 76, 72, 65, 54, 42, 30, 18, 8, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      });
      var flatEcgItem = measurements.electrocardiogram
        ? Object.assign({}, measurements.electrocardiogram, {
            value: "0.01",
            series: [
              0.16, -0.15, 1.18, -0.29, 0.25,
              0.08, -0.06, 0.42, -0.10, 0.06,
              0.01, 0.00, 0.01, -0.01, 0.00,
              0.00, 0.01, 0.00, -0.01, 0.01,
              0.00, 0.00, 0.01, 0.00, 0.01,
            ],
          })
        : null;

      var nextMap = Object.assign({}, measurements);
      nextMap.heart_rate = arrestHrItem;
      if (flatEcgItem) {
        nextMap.electrocardiogram = flatEcgItem;
      }

      var rawHrDetails = getMeasurementAlertDetails(arrestHrItem);
      latchedWarningsRef.current.heart_rate = {
        minHoldUntil: nowMs + 5000,
        itemSnapshot: Object.assign({}, arrestHrItem),
        details: isHrSubsequentRed
          ? {
              level: "yellow",
              isAdditionalCritical: true,
              priority: rawHrDetails.priority,
              reason: "Additional critical events occurred: " + rawHrDetails.reason,
              instruction: rawHrDetails.instruction,
            }
          : rawHrDetails,
        dismissedVal: null,
        dismissRequested: false,
      };
      if (flatEcgItem) {
        var rawEcgDetails = getMeasurementAlertDetails(flatEcgItem);
        latchedWarningsRef.current.electrocardiogram = {
          minHoldUntil: nowMs + 5000,
          itemSnapshot: Object.assign({}, flatEcgItem),
          details: {
            level: "yellow",
            isAdditionalCritical: true,
            priority: rawEcgDetails.priority,
            reason: "Additional critical events occurred: " + rawEcgDetails.reason,
            instruction: rawEcgDetails.instruction,
          },
          dismissedVal: null,
          dismissRequested: false,
        };
      }

      setDismissedWarnings({});
      setMeasurements(nextMap);
      setTestModalOpen(false);
      if (!isHrSubsequentRed) {
        setDiagnosticActive(false);
        setAlertCountdown(20);
        setAlertActive(true);
      }
    }

    function simulateHighRadiationCascade() {
      if (!measurements || !measurements.radiation_exposure) return;
      delete simLocksRef.current.skin_surface;
      delete simLocksRef.current.temp_inside_costume;
      delete simLocksRef.current.heart_rate;
      simulateWarningPreset("radiation_exposure", "yellow");
      setTestModalOpen(false);
    }

    function clearAllSimulatedWarnings() {
      var nowMs = Date.now();
      simLocksRef.current = {};
      acknowledgedRedsRef.current = {};
      initialRedSosSpecRef.current = null;
      Object.keys(latchedWarningsRef.current).forEach(function (id) {
        var latch = latchedWarningsRef.current[id];
        if (latch && nowMs < latch.minHoldUntil) {
          latch.dismissRequested = true;
          latch.dismissRequestedVal = String(latch.itemSnapshot ? latch.itemSnapshot.value : "");
        } else {
          delete latchedWarningsRef.current[id];
        }
      });
      setDismissedWarnings({});
      var freshDefaults = buildDefaultMeasurementsForAstronaut(astronaut, slotIndex);
      setMeasurements(freshDefaults);
      saveStoredMeasurements(astroKey, freshDefaults);
      setAlertActive(false);
    }

    function openDiagnosticScreen() {
      setAlertActive(false);
      setDiagnosticActive(true);
    }

    function closeDiagnosticScreen() {
      setDiagnosticActive(false);
    }

    function toggleMeasEditMode() {
      setMeasEditMode(function (prev) {
        return !prev;
      });
    }

    function handleClickMeasurementCard(specId) {
      var item = measurements[specId];
      if (!item) return;
      setSelectedMeasId(specId);
      if (measEditMode) {
        setDraftMeas({
          id: item.id,
          name: item.name,
          value: String(item.value !== undefined && item.value !== null ? item.value : ""),
          unit: String(item.unit || ""),
          threshold: String(item.threshold || ""),
          seriesText: Array.isArray(item.series) ? item.series.join(", ") : "",
          seriesLabelsText: Array.isArray(item.seriesLabels) ? item.seriesLabels.join(", ") : "",
        });
        setMeasModalMode("edit");
      } else {
        setMeasModalMode("view");
      }
    }

    function syncMeasurementToAstronaut(itemId, newValue) {
      if (!onUpdateAstronaut || !astronaut) return;
      var updated = Object.assign({}, astronaut);
      var baseline = Object.assign({}, updated.medical_baseline || {});
      var changed = false;

      if (itemId === "full_name") {
        var split = splitFullName(newValue);
        updated.first_name = split.firstName;
        updated.last_name = split.lastName;
        updated.firstName = split.firstName;
        updated.lastName = split.lastName;
        updated.name = newValue;
        changed = true;
      } else if (itemId === "date_of_birth") {
        updated.date_of_birth = newValue;
        var calcAge = calculateAgeFromDob(newValue);
        if (calcAge !== "") updated.age = calcAge;
        changed = true;
      } else if (itemId === "sex") {
        updated.sex = newValue;
        updated.gender = newValue;
        changed = true;
      } else if (itemId === "crew_role") {
        updated.crew_role = newValue;
        changed = true;
      } else if (itemId === "standing_height") {
        var sh = parseFloat(newValue);
        if (Number.isFinite(sh) && sh > 0) {
          updated.standing_height_cm = sh;
          updated.heightCm = sh;
          changed = true;
        }
      } else if (itemId === "sitting_height") {
        var sith = parseFloat(newValue);
        if (Number.isFinite(sith) && sith > 0) {
          updated.sitting_height_cm = sith;
          updated.sittingHeightCm = sith;
          changed = true;
        }
      } else if (itemId === "blood_type") {
        updated.bloodType = newValue;
        baseline.blood_type = newValue;
        updated.medical_baseline = baseline;
        changed = true;
      } else if (itemId === "bone_material_normal_density") {
        var bmd = parseFloat(newValue);
        if (Number.isFinite(bmd) && bmd > 0) {
          baseline.bone_material_normal_density_g_cm2 = bmd;
          updated.medical_baseline = baseline;
          changed = true;
        }
      } else if (itemId === "base_heart_rating" || itemId === "heart_rate") {
        var hrNum = parseInt(newValue, 10);
        if (Number.isFinite(hrNum) && hrNum > 0) {
          baseline.base_heart_rating_bpm = hrNum;
          updated.medical_baseline = baseline;
          changed = true;
        }
      } else if (itemId === "base_blood_pressure" || itemId === "pressure") {
        baseline.base_blood_pressure = newValue;
        updated.medical_baseline = baseline;
        changed = true;
      } else if (itemId === "base_ecg_results") {
        baseline.base_ecg_results = newValue;
        updated.medical_baseline = baseline;
        changed = true;
      } else if (itemId === "max_oxygen_capacity_in_blood") {
        var vo2 = parseFloat(newValue);
        if (Number.isFinite(vo2) && vo2 > 0) {
          baseline.max_oxygen_capacity_ml_kg_min = vo2;
          updated.medical_baseline = baseline;
          changed = true;
        }
      }

      if (changed) {
        onUpdateAstronaut(updated);
      }
    }

    function handleSaveMeasurementModal(e) {
      if (e && e.preventDefault) e.preventDefault();
      if (!draftMeas || !draftMeas.id) return;
      var targetId = draftMeas.id;
      var existing = measurements[targetId];
      if (!existing) return;

      var parsedSeries = existing.series;
      var parsedSecondary = existing.seriesSecondary;
      if (existing.chartType === "line" || existing.chartType === "column") {
        var nums = String(draftMeas.seriesText || "")
          .split(",")
          .map(function (s) {
            return parseFloat(s.trim());
          })
          .filter(function (n) {
            return Number.isFinite(n);
          });
        if (nums.length > 0) {
          var numericMain = parseFloat(draftMeas.value);
          if (
            Number.isFinite(numericMain) &&
            String(draftMeas.seriesText || "").trim() === (Array.isArray(existing.series) ? existing.series.join(", ") : "")
          ) {
            parsedSeries = nums.concat([numericMain]).slice(-20);
          } else {
            parsedSeries = nums;
          }
        }
        if (targetId === "pressure" && String(draftMeas.value || "").indexOf("/") !== -1) {
          var diaEdit = parseFloat(String(draftMeas.value).split("/")[1]);
          if (Number.isFinite(diaEdit) && Array.isArray(existing.seriesSecondary)) {
            parsedSecondary = existing.seriesSecondary.concat([diaEdit]).slice(-20);
          }
        }
      }

      var parsedLabels = existing.seriesLabels;
      if ((existing.chartType === "line" || existing.chartType === "column") && draftMeas.seriesLabelsText) {
        var lbls = String(draftMeas.seriesLabelsText)
          .split(",")
          .map(function (s) {
            return s.trim();
          })
          .filter(Boolean);
        if (lbls.length > 0) {
          parsedLabels = lbls;
        }
      }

      var updatedItem = Object.assign({}, existing, {
        value: draftMeas.value,
        unit: draftMeas.unit || existing.unit,
        threshold: draftMeas.threshold || existing.threshold,
        series: parsedSeries,
        seriesSecondary: parsedSecondary,
        seriesLabels: parsedLabels,
      });

      simLocksRef.current[targetId] = true;
      delete acknowledgedRedsRef.current[targetId];
      setDismissedWarnings(function (prev) {
        var next = Object.assign({}, prev);
        delete next[targetId];
        return next;
      });

      var newDetails = getMeasurementAlertDetails(updatedItem);
      if (newDetails.level === "red" && !initialRedSosSpecRef.current) {
        initialRedSosSpecRef.current = targetId;
      }
      var isSubsequentManualRed = Boolean(
        newDetails.level === "red" && initialRedSosSpecRef.current && initialRedSosSpecRef.current !== targetId
      );
      var effectiveManualDetails = isSubsequentManualRed
        ? {
            level: "yellow",
            isAdditionalCritical: true,
            priority: newDetails.priority,
            reason: "Additional critical events occurred: " + newDetails.reason,
            instruction: newDetails.instruction,
          }
        : newDetails;

      if (effectiveManualDetails.level === "yellow" || effectiveManualDetails.level === "red") {
        latchedWarningsRef.current[targetId] = {
          minHoldUntil: Date.now() + 5000,
          itemSnapshot: Object.assign({}, updatedItem),
          details: effectiveManualDetails,
          dismissedVal: null,
          dismissRequested: false,
        };
      }

      var nextMap = Object.assign({}, measurements);
      nextMap[targetId] = updatedItem;
      setMeasurements(nextMap);
      saveStoredMeasurements(astroKey, nextMap);
      syncMeasurementToAstronaut(targetId, draftMeas.value);
      setMeasModalMode(null);
    }

    function handleResetSingleMeasurement(specId) {
      var defaults = buildDefaultMeasurementsForAstronaut(astronaut, slotIndex);
      var defItem = defaults[specId];
      if (!defItem) return;
      delete simLocksRef.current[specId];
      delete acknowledgedRedsRef.current[specId];
      if (initialRedSosSpecRef.current === specId) {
        initialRedSosSpecRef.current = null;
        delete acknowledgedRedsRef.current.__initialSosAcknowledged;
      }
      var nowMs = Date.now();
      var latch = latchedWarningsRef.current[specId];
      if (latch && nowMs < latch.minHoldUntil) {
        latch.dismissRequested = true;
        latch.dismissRequestedVal = String(defItem.value);
      } else {
        delete latchedWarningsRef.current[specId];
      }
      setDismissedWarnings(function (prev) {
        var next = Object.assign({}, prev);
        delete next[specId];
        return next;
      });
      var nextMap = Object.assign({}, measurements);
      nextMap[specId] = defItem;
      // If no other primary test locks remain active, also restore unlocked interconnected dynamic measurements back to nominal
      if (Object.keys(simLocksRef.current).length === 0) {
        initialRedSosSpecRef.current = null;
        acknowledgedRedsRef.current = {};
        Object.keys(defaults).forEach(function (k) {
          if (defaults[k] && defaults[k].chartType !== "const" && !simLocksRef.current[k]) {
            nextMap[k] = defaults[k];
          }
        });
      }
      setMeasurements(nextMap);
      saveStoredMeasurements(astroKey, nextMap);
      setDraftMeas({
        id: defItem.id,
        name: defItem.name,
        value: String(defItem.value),
        unit: String(defItem.unit || ""),
        threshold: String(defItem.threshold || ""),
        seriesText: Array.isArray(defItem.series) ? defItem.series.join(", ") : "",
        seriesLabelsText: Array.isArray(defItem.seriesLabels) ? defItem.seriesLabels.join(", ") : "",
      });
    }

    var activeYellowWarnings = [];
    var activeRedAlerts = [];
    var renderNowMs = Date.now();
    if (measurements) {
      MEASUREMENT_SPECS.forEach(function (spec) {
        var item = measurements[spec.id];
        if (!item) return;
        var rawDetails = getMeasurementAlertDetails(item);
        var latch = latchedWarningsRef.current[spec.id];
        var isHeld5s = Boolean(latch && renderNowMs < latch.minHoldUntil && !latch.dismissed);
        var holdRemainingSec = isHeld5s ? Math.max(0.1, (latch.minHoldUntil - renderNowMs) / 1000).toFixed(1) : null;

        if (rawDetails.level === "red") {
          var isAdditionalRed = Boolean(
            initialRedSosSpecRef.current && initialRedSosSpecRef.current !== spec.id
          );
          if (!isAdditionalRed) {
            activeRedAlerts.push({ item: item, details: rawDetails });
          } else if (isHeld5s) {
            // Subsequent Red triggers after the initial Red warning are displayed like Yellow warnings stating "Additional critical events occurred" and auto-disappear after 5s
            var addlDetails = {
              level: "yellow",
              isAdditionalCritical: true,
              priority: rawDetails.priority,
              reason: "Additional critical events occurred: " + rawDetails.reason,
              instruction: rawDetails.instruction,
              countermeasures: getCountermeasuresForWarning(spec.id, "red", rawDetails.instruction),
            };
            activeYellowWarnings.push({
              item: item,
              details: addlDetails,
              isHeld5s: true,
              holdRemainingSec: holdRemainingSec,
              dismissPending: false,
            });
          }
        } else if (rawDetails.level === "yellow") {
          if (isHeld5s) {
            activeYellowWarnings.push({
              item: item,
              details: rawDetails,
              isHeld5s: true,
              holdRemainingSec: holdRemainingSec,
              dismissPending: false,
            });
          }
        } else if (isHeld5s && latch && latch.details) {
          // Value returned to normal before 5 seconds elapsed — hold warning active until 5s expires
          var heldItem = latch.itemSnapshot || item;
          activeYellowWarnings.push({
            item: heldItem,
            details: latch.details,
            isHeld5s: true,
            holdRemainingSec: holdRemainingSec,
            dismissPending: false,
          });
        }
      });
      activeYellowWarnings.sort(function (a, b) {
        return a.details.priority - b.details.priority;
      });
      activeRedAlerts.sort(function (a, b) {
        return a.details.priority - b.details.priority;
      });
    }

    function refreshHistory() {
      return fetchApiJson("/api/history/" + getApiAstronautId() + "?limit=50").then(function (
        history
      ) {
        var records = getVitalsHistoryRecords(history);
        setApiHistory(records);
        return records;
      });
    }

    function queueVitals(payload) {
      try {
        var queue = readOfflineVitalsQueue();
        queue.push(payload);
        saveOfflineVitalsQueue(queue);
        setQueueCount(queue.length);
        setApiStatus("Vitals saved onboard. " + queue.length + " record(s) pending sync.");
      } catch (error) {
        console.error("Could not save vitals to the offline queue.", error);
        setApiStatus("Could not save vitals offline: " + error.message);
      }
    }

    function handleSyncQueue() {
      if (!browserOnline || offlineMode || isSyncing) return Promise.resolve();
      var queuedRecords;
      try {
        queuedRecords = readOfflineVitalsQueue();
      } catch (error) {
        console.error("Could not read the offline vitals queue for sync.", error);
        setApiStatus("Could not read the saved offline queue: " + error.message);
        return Promise.resolve();
      }
      if (queuedRecords.length === 0) return Promise.resolve();
      setIsSyncing(true);
      setApiStatus("Syncing " + queuedRecords.length + " queued record(s) to mission control...");
      return fetchApiJson("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records: queuedRecords }),
      })
        .then(function (result) {
          var latestQueue = readOfflineVitalsQueue();
          var remaining = latestQueue.slice(queuedRecords.length);
          saveOfflineVitalsQueue(remaining);
          setQueueCount(remaining.length);
          setApiStatus(
            "Synced " +
              (result && result.synced_count !== undefined ? result.synced_count : queuedRecords.length) +
              " record(s)."
          );
          return refreshHistory().catch(function (error) {
            console.error("Vitals synced, but history could not be refreshed.", error);
            setApiStatus("Vitals synced; history refresh failed: " + error.message);
          });
        })
        .catch(function (error) {
          console.error("Offline vitals sync failed.", error);
          setApiStatus("Sync failed; " + queuedRecords.length + " record(s) remain queued.");
        })
        .then(function () {
          setIsSyncing(false);
        });
    }

    function createVitalsPayload(form) {
      var payload = {
        astronaut_id: getApiAstronautId(),
        mission_day: Number(missionDay),
        environment: "Microgravity / Deep Space Transit",
        heart_rate: Number(form.heart_rate),
        blood_pressure: form.blood_pressure,
        sleep_hours: Number(form.sleep_hours),
        exercise_min: Number(form.exercise_min),
        symptoms: form.symptoms,
      };
      if (
        !Number.isInteger(payload.mission_day) ||
        !Number.isInteger(payload.heart_rate) ||
        !Number.isFinite(payload.sleep_hours) ||
        !Number.isInteger(payload.exercise_min) ||
        !payload.blood_pressure.trim()
      ) {
        throw new Error("Enter valid numeric vitals, mission day, and blood pressure.");
      }
      return payload;
    }

    function handleSubmitVitals(event) {
      event.preventDefault();
      var payload;
      try {
        payload = createVitalsPayload(vitalsForm);
      } catch (error) {
        setApiStatus(error.message);
        return;
      }
      var localAssessment = getLocalTriage(payload, apiProfile || astronaut);
      setTriageResult({ source: "onboard threshold triage", assessment: localAssessment });
      if (!browserOnline || offlineMode) {
        queueVitals(payload);
        return;
      }
      setApiStatus("Submitting vitals for clinical assessment...");
      fetchApiJson("/api/vitals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
        .then(function (assessment) {
          setTriageResult({ source: "Cloud clinical assessment", assessment: assessment });
          setApiStatus("Vitals submitted and saved to mission control.");
          return refreshHistory().catch(function (error) {
            console.error("Vitals submitted, but history could not be refreshed.", error);
            setApiStatus("Vitals submitted; history refresh failed: " + error.message);
          });
        })
        .catch(function (error) {
          if (!error.status || error.status >= 500) {
            queueVitals(payload);
            setApiStatus("Network request failed. Local triage is active and vitals are queued.");
          } else {
            console.error("Vitals API rejected the submitted payload.", error);
            setApiStatus("Vitals were not accepted: " + error.message);
          }
        });
    }

    function handleAnalyzeScan(event) {
      event.preventDefault();
      if (!scanFile) {
        setApiStatus("Select an image before starting scan analysis.");
        return;
      }
      if (!browserOnline || offlineMode) {
        setApiStatus("Scan analysis requires a network connection. Vitals can still be queued offline.");
        return;
      }
      var formData = new FormData();
      formData.append("file", scanFile);
      formData.append("astronaut_id", getApiAstronautId());
      formData.append("notes", scanNotes);
      setIsAnalyzingScan(true);
      setApiStatus("Uploading scan for analysis...");
      fetchApiJson("/api/analyze-scan", { method: "POST", body: formData })
        .then(function (result) {
          setScanResult(result);
          setApiStatus("Scan analysis complete.");
        })
        .catch(function (error) {
          console.error("Scan analysis request failed.", error);
          setApiStatus("Scan analysis failed: " + error.message);
        })
        .then(function () {
          setIsAnalyzingScan(false);
        });
    }

    function populateTelemetryPreset(preset) {
      if (preset === "anomaly") {
        setVitalsForm({
          heart_rate: "108",
          blood_pressure: "138/88",
          sleep_hours: "5.5",
          exercise_min: "45",
          symptoms: "Mild headache and visual blur",
        });
      } else {
        setVitalsForm({
          heart_rate: "72",
          blood_pressure: "120/80",
          sleep_hours: "7.5",
          exercise_min: "30",
          symptoms: "",
        });
      }
      setApiStatus(preset === "anomaly" ? "Anomaly telemetry preset loaded." : "Normal baseline preset loaded.");
    }

    var tabs = [
      { id: "dashboard", label: "Dashboard" },
      { id: "measurements", label: "Measurements" },
      { id: "warning-log", label: "Warning Log (" + warningLogs.length + ")" },
      { id: "health-plan", label: "Health Plan" },
      { id: "ground-control", label: "Ground Control" },
    ];

    var badges = [
      ["Award", "Badge"],
      ["Super", "Badge"],
      ["Workout", "Master"],
    ];

    return h(
      "div",
      { className: "dash-page" },
      h(
        "header",
        { className: "dash-topbar" },
        h(
          "nav",
          { className: "dash-nav", "aria-label": "Dashboard Navigation" },
          h("div", { className: "dash-nav-cap", "aria-hidden": "true" }),
          tabs.map(function (tab) {
            var isActive = activeTab === tab.id;
            return h(
              "button",
              {
                key: tab.id,
                type: "button",
                className: isActive ? "dash-nav-tab dash-nav-tab--active" : "dash-nav-tab",
                onClick: function () {
                  setActiveTab(tab.id);
                  closeAlertScreen();
                  setDiagnosticActive(false);
                },
              },
              tab.label
            );
          })
        ),
        h(
          "div",
          { className: "dash-topbar-right" },
          h(
            "label",
            { className: "dash-mode-wrap" },
            h("span", { className: "dash-mode-label" }, "Mode:"),
            h(
              "select",
              {
                className: "dash-mode-select",
                "aria-label": "Mode",
                value: envMode,
                onChange: function (e) {
                  handleSelectEnvMode(e.target.value);
                },
              },
              h("option", { value: "spaceship" }, "Spaceship"),
              h("option", { value: "outer-space" }, "Outer Space")
            )
          ),
          h(
            "div",
            { className: "dash-clock" },
            formatHeaderTimestamp(now) + " | Mission Day " + missionDay
          )
        )
      ),
      activeYellowWarnings.length > 0
        ? h(
            "aside",
            {
              className: "dash-warning-stack",
              "aria-label": "Priority Warning Notifications",
            },
            activeYellowWarnings.map(function (entry) {
              var wItem = entry.item;
              var wDetails = entry.details;
              var unitSuffix =
                wItem.unit &&
                wItem.unit !== "N/A" &&
                String(wItem.value).indexOf(wItem.unit.split(" ")[0]) === -1
                  ? " " + wItem.unit
                  : "";
              var fullValText = String(wItem.value) + unitSuffix;
              return h(
                "div",
                {
                  key: wItem.id,
                  className: "dash-warning-toast",
                  role: "alert",
                },
                h(
                  "div",
                  { className: "dash-warning-toast-top" },
                  h(
                    "div",
                    { className: "dash-warning-toast-badges" },
                    h(
                      "span",
                      { className: "dash-warning-priority-pill" },
                      "PRIORITY #" + wDetails.priority
                    ),
                    h(
                      "span",
                      { className: "dash-warning-title" },
                      wDetails.isAdditionalCritical
                        ? "⚠ ADDITIONAL CRITICAL EVENT OCCURRED"
                        : "⚠ CONCERNING CHANGE DETECTED"
                    ),
                    entry.isHeld5s
                      ? h(
                          "span",
                          { className: "dash-warning-hold-pill" },
                          entry.dismissPending
                            ? "5s HOLD (" + entry.holdRemainingSec + "s)"
                            : "MIN 5s (" + entry.holdRemainingSec + "s)"
                        )
                      : null
                  ),
                  h(
                    "button",
                    {
                      type: "button",
                      className: "dash-warning-dismiss",
                      "aria-label": "Dismiss warning for " + wItem.name,
                      title: entry.isHeld5s
                        ? "Warning stays active for at least 5 seconds (" + entry.holdRemainingSec + "s left)"
                        : "Dismiss warning",
                      onClick: function () {
                        dismissWarningItem(wItem.id, wItem.value);
                      },
                    },
                    "×"
                  )
                ),
                wDetails.isAdditionalCritical
                  ? h(
                      "div",
                      { className: "dash-warning-toast-msg" },
                      h("strong", null, "Additional critical events occurred: "),
                      "Critical change detected in ",
                      h("strong", null, wItem.name),
                      " (",
                      h("strong", null, fullValText),
                      "). ",
                      String(wDetails.reason || "").replace(
                        /^Additional critical events occurred:\s*/i,
                        ""
                      )
                    )
                  : h(
                      "div",
                      { className: "dash-warning-toast-msg" },
                      "A concerning level of change has been detected in ",
                      h("strong", null, wItem.name),
                      " (",
                      h("strong", null, fullValText),
                      "). ",
                      wDetails.reason
                    ),
                h(
                  "div",
                  { className: "dash-warning-toast-actions" },
                  h(
                    "button",
                    {
                      type: "button",
                      className: "dash-warning-open-btn",
                      onClick: function () {
                        openMeasurementFromWarning(wItem.id);
                      },
                    },
                    "OPEN " + wItem.name.toUpperCase()
                  ),
                  h(
                    "button",
                    {
                      type: "button",
                      className: "dash-warning-log-btn",
                      onClick: function () {
                        openWarningLogForMeasurement(wItem.id);
                      },
                    },
                    "VIEW IN LOG"
                  )
                )
              );
            })
          )
        : null,
      h(
        "div",
        { className: alertActive ? "dash-workspace dash-workspace--alert" : "dash-workspace" },
        alertActive
          ? h(
              "section",
              { className: "dash-alert-screen", "aria-label": "Health Alert" },
              h(
                "div",
                { className: "dash-alert-header" },
                h(
                  "svg",
                  {
                    className: "dash-alert-icon",
                    viewBox: "0 0 100 88",
                    "aria-hidden": "true",
                  },
                  h("polygon", {
                    points: "50,6 95,82 5,82",
                    fill: "none",
                    stroke: "#ffffff",
                    strokeWidth: "6",
                    strokeLinejoin: "miter",
                  }),
                  h("rect", {
                    x: "46.5",
                    y: "30",
                    width: "7",
                    height: "28",
                    fill: "#ffffff",
                  }),
                  h("circle", {
                    cx: "50",
                    cy: "69",
                    r: "4.2",
                    fill: "#ffffff",
                  })
                ),
                h("h1", { className: "dash-alert-title" }, "SOS EMERGENCY ALERT!"),
                h(
                  "p",
                  { className: "dash-alert-source-note" },
                  "SIMULATED SENSOR ALERT — confirm clinical status with the flight surgeon."
                )
              ),
              h(
                "div",
                { className: "dash-alert-middle" },
                h(
                  "div",
                  { className: "dash-alert-body" },
                  h(
                    "div",
                    { className: "dash-alert-section" },
                    h(
                      "h2",
                      { className: "dash-alert-subtitle" },
                      activeRedAlerts.length > 0
                        ? "DANGEROUS / CRITICAL PARAMETER BREACH DETECTED (" + activeRedAlerts.length + ")"
                        : "CRITICAL VITALS DETECTED"
                    ),
                    h(
                      "div",
                      { className: "dash-alert-vitals-list" },
                      activeRedAlerts.length > 0
                        ? activeRedAlerts.map(function (entry) {
                            var rItem = entry.item;
                            var rDetails = entry.details;
                            var rUnitSuffix =
                              rItem.unit &&
                              rItem.unit !== "N/A" &&
                              String(rItem.value).indexOf(rItem.unit.split(" ")[0]) === -1
                                ? " " + rItem.unit
                                : "";
                            return h(
                              "div",
                              { key: rItem.id, className: "dash-alert-vital-line" },
                              h(
                                "div",
                                { style: { fontWeight: "800" } },
                                rItem.name.toUpperCase() +
                                  ": " +
                                  String(rItem.value) +
                                  rUnitSuffix +
                                  " [Priority #" +
                                  rDetails.priority +
                                  "]"
                              ),
                              h(
                                "div",
                                { style: { fontSize: "0.92em", opacity: 0.95, marginTop: "0.18rem" } },
                                "Exact Cause: " +
                                  rDetails.reason +
                                  " | Trigger Rule: " +
                                  rItem.threshold
                              )
                            );
                          })
                        : sample.alertData.badVitals.map(function (item, idx) {
                            return h(
                              "div",
                              { key: idx, className: "dash-alert-vital-line" },
                              item.label + ": " + item.value + " (" + item.detail + ")"
                            );
                          })
                    )
                  ),
                  h(
                    "div",
                    { className: "dash-alert-section" },
                    h("h2", { className: "dash-alert-subtitle" }, "EXACT EMERGENCY INSTRUCTIONS & PROTOCOL"),
                    h(
                      "div",
                      { className: "dash-alert-instructions" },
                      activeRedAlerts.length > 0
                        ? activeRedAlerts.map(function (entry, idx) {
                            return h(
                              "p",
                              { key: entry.item.id, className: "dash-alert-instruction-line" },
                              idx + 1 + ". [" + entry.item.name + "] " + entry.details.instruction
                            );
                          })
                        : sample.alertData.instructions.map(function (line, idx) {
                            return h(
                              "p",
                              { key: idx, className: "dash-alert-instruction-line" },
                              line
                            );
                          })
                    )
                  )
                ),
                h(
                  "div",
                  { className: "dash-alert-sos-wrap" },
                  h(
                    "button",
                    {
                      type: "button",
                      className: "dash-alert-sos-btn",
                    },
                    "SOS"
                  )
                )
              ),
              h(
                "div",
                { className: "dash-alert-footer" },
                h(
                  "div",
                  { className: "dash-alert-timer" },
                  "Automatical SOS in " + alertCountdown + "s"
                ),
                h(
                  "div",
                  { className: "dash-alert-close-row" },
                  h(
                    "button",
                    {
                      type: "button",
                      className: "dash-alert-close-btn",
                      onClick: closeAlertScreen,
                    },
                    "CLOSE"
                  )
                )
              )
            )
          : diagnosticActive
          ? h(
              "section",
              { className: "dash-diagnostic", "aria-label": "Diagnostic Screen" },
              h("h1", { className: "dash-diag-title" }, "Measurement Title"),
              h(
                "div",
                { className: "dash-diag-group" },
                h("div", { className: "dash-diag-label" }, "Data stream"),
                h("div", {
                  className: "dash-box dash-diag-box",
                  "aria-label": "Data stream box",
                })
              ),
              h(
                "div",
                { className: "dash-diag-controls" },
                h("button", { type: "button", className: "dash-diag-btn" }, "START"),
                h("button", { type: "button", className: "dash-diag-btn" }, "END"),
                h("button", { type: "button", className: "dash-diag-btn" }, "TIMER"),
                h(
                  "button",
                  { type: "button", className: "dash-diag-btn dash-diag-btn--wide" },
                  "SAVE AS REFERENCE"
                )
              ),
              h(
                "div",
                { className: "dash-diag-group" },
                h("div", { className: "dash-diag-label" }, "Reference"),
                h("div", {
                  className: "dash-box dash-diag-box",
                  "aria-label": "Reference box",
                })
              )
            )
          : activeTab === "dashboard"
          ? h(
              "main",
              { className: "dash-main" },
              h(
                "section",
                { className: "dash-col-left" },
                h(
                  "div",
                  { className: "dash-left-top" },
                  h(
                    "div",
                    { className: "dash-box dash-vitals-box" },
                    visibleVitals.bloodType
                      ? h("div", { className: "dash-stat-line" }, "Blood Type: " + sample.vitals.bloodType)
                      : null,
                    visibleVitals.hr
                      ? h("div", { className: "dash-stat-line" }, "HR: " + sample.vitals.hr)
                      : null,
                    visibleVitals.bp
                      ? h("div", { className: "dash-stat-line" }, "Blood pressure: " + sample.vitals.bloodPressure)
                      : null,
                    visibleVitals.ecg
                      ? h("div", { className: "dash-stat-line" }, "ECG: " + sample.vitals.ecg)
                      : null,
                    visibleVitals.vo2
                      ? h("div", { className: "dash-stat-line" }, "VO2 Max: " + sample.vitals.vo2Max)
                      : null,
                    visibleVitals.wbc
                      ? h("div", { className: "dash-stat-line" }, "Baseline WBC: " + sample.vitals.wbc)
                      : null,
                    !visibleVitals.bloodType &&
                      !visibleVitals.hr &&
                      !visibleVitals.bp &&
                      !visibleVitals.ecg &&
                      !visibleVitals.vo2 &&
                      !visibleVitals.wbc
                      ? h(
                          "div",
                          { className: "dash-stat-line" },
                          "No vitals selected (configure in Health Plan > SETUP)"
                        )
                      : null
                  ),
                  h(
                    "div",
                    { className: "dash-box dash-space-bar" },
                    h("div", { className: "dash-stat-line" }, "Standing Height: " + sample.bodyMetrics.height),
                    h("div", { className: "dash-stat-line" }, "Sitting Height: " + sample.bodyMetrics.sittingHeight),
                    h("div", { className: "dash-stat-line" }, "Weight: " + sample.bodyMetrics.weight),
                    h("div", { className: "dash-stat-line" }, "BMI: " + sample.bodyMetrics.bmi),
                    visibleVitals.bodyComp
                      ? h("div", { className: "dash-stat-line" }, "Body Comp: " + sample.vitals.bodyComposition)
                      : null,
                    visibleVitals.bmd
                      ? h("div", { className: "dash-stat-line" }, "BMD: " + sample.vitals.boneDensity)
                      : null
                  )
                ),
                h(
                  "div",
                  { className: "dash-box dash-tasks-box" },
                  h(
                    "div",
                    { className: "dash-tasks-top" },
                    h("h2", { className: "dash-box-heading" }, "Daily Tasks"),
                    h(
                      "div",
                      { className: "dash-checklist" },
                      [
                        { key: "vision", label: "Morning Vision & Tonometry Check" },
                        { key: "hydration", label: "Electrolyte & Fluid Intake Log (2.5 L Target)" },
                        { key: "ared", label: "60-Min ARED Resistive Loading Session" },
                        { key: "workoutEcg", label: "Post-Workout 12-Lead ECG & BP Check" },
                        { key: "dosimetry", label: "Evening Personal Radiation Dosimeter Sync" },
                      ].map(function (item) {
                        return h(
                          "label",
                          { key: item.key, className: "dash-check-item" },
                          h("input", {
                            type: "checkbox",
                            checked: Boolean(tasks[item.key]),
                            onChange: function () {
                              toggleTask(item.key);
                            },
                          }),
                          h("span", { className: "dash-checkbox-box", "aria-hidden": "true" }),
                          h("span", null, item.label)
                        );
                      })
                    )
                  ),
                  h(
                    "div",
                    { className: "dash-tasks-bottom" },
                    h(
                      "h2",
                      { className: "dash-box-heading dash-box-heading--underlined dash-rec-heading" },
                      "Recommendations"
                    ),
                    h(
                      "p",
                      { className: "dash-rec-text" },
                      "Cardiovascular telemetry (" +
                        sample.vitals.hr +
                        ", " +
                        sample.vitals.bloodPressure +
                        ") remains stable within baseline limits. Maintain daily ARED resistive loading and Vitamin D3 intake to support bone mineral density (" +
                        sample.vitals.boneDensity +
                        "). Please record a follow-up ECG strip 15 minutes after today's aerobic interval."
                    ),
                    h(
                      "label",
                      { className: "dash-check-item dash-rec-check" },
                      h("input", {
                        type: "checkbox",
                        checked: tasks.recEcg,
                        onChange: function () {
                          toggleTask("recEcg");
                        },
                      }),
                      h("span", { className: "dash-checkbox-box", "aria-hidden": "true" }),
                      h("span", null, "15-Min Post-Exercise ECG & BP Verification")
                    )
                  )
                ),
                h(
                  "div",
                  { className: "dash-box dash-gamification-box" },
                  h(
                    "div",
                    { className: "dash-level-col" },
                    h(
                      "div",
                      { className: "dash-mini-avatar" },
                      astronaut && astronaut.avatarUrl
                        ? h("img", {
                            src: astronaut.avatarUrl,
                            alt: displayName + " avatar",
                            className: "crew-avatar",
                          })
                        : h("span", { className: "crew-initials" }, getInitials(astronaut))
                    ),
                    h("div", { className: "dash-streak-text" }, "🔥 12 Days"),
                    h("div", { className: "dash-lvl-pill" }, "LVL 4")
                  ),
                  h(
                    "div",
                    { className: "dash-badges-row" },
                    badges.map(function (lines, i) {
                      return h(
                        "div",
                        { key: i, className: "dash-badge-item" },
                        h(
                          "div",
                          { className: "dash-badge-label" },
                          h("span", null, lines[0]),
                          h("span", null, lines[1])
                        ),
                        h(BadgeBannerSvg)
                      );
                    })
                  )
                )
              ),
              h(
                "section",
                { className: "dash-col-center" },
                h(
                  "div",
                  { className: "dash-crew-identity" },
                  h("h1", { className: "dash-crew-name" }, displayName),
                  h("p", { className: "dash-crew-role" }, sample.crewRole),
                  formatAstronautBio(astronaut, false)
                    ? h("p", { className: "dash-crew-bio" }, formatAstronautBio(astronaut, false))
                    : null
                ),
                h(
                  "div",
                  { className: "dash-body-wrap" },
                  h(HumanSilhouetteSvg, {
                    selectedPartId: selectedPartId,
                    bodyParts: sample.bodyParts,
                    onSelectPart: function (partId) {
                      setSelectedPartId(function (prev) {
                        return prev === partId ? null : partId;
                      });
                    },
                  })
                )
              ),
              h(
                "section",
                { className: "dash-col-right" },
                h(
                  "div",
                  { className: "dash-box dash-ship-box" },
                  h(
                    "div",
                    { className: "dash-ship-top" },
                    h(
                      "div",
                      { className: "dash-ship-metrics" },
                      h(
                        "h2",
                        { className: "dash-box-heading" },
                        envMode === "outer-space" ? "Outer Space (EVA) Status" : "Spaceship Status"
                      ),
                      h(
                        "div",
                        { className: "dash-stat-line" },
                        "Outside Temp: " +
                          (measurements && measurements.outside_temperature
                            ? measurements.outside_temperature.value + " °C"
                            : envMode === "outer-space"
                            ? "-270.4 °C"
                            : sample.spaceship.temperature)
                      ),
                      h(
                        "div",
                        { className: "dash-stat-line" },
                        "Suit Temp: " +
                          (measurements && measurements.temp_inside_costume
                            ? measurements.temp_inside_costume.value + " °C"
                            : envMode === "outer-space"
                            ? "19.8 °C"
                            : "21.6 °C")
                      ),
                      h(
                        "div",
                        { className: "dash-stat-line" },
                        "CO2 level: " +
                          (measurements && measurements.co2_level
                            ? measurements.co2_level.value
                            : sample.spaceship.co2Level)
                      ),
                      h(
                        "div",
                        { className: "dash-stat-line" },
                        "Radiation Level: " +
                          (measurements && measurements.radiation_exposure
                            ? measurements.radiation_exposure.value + " R/sol"
                            : sample.spaceship.radiationLevel)
                      ),
                      h(
                        "div",
                        { className: "dash-stat-line" },
                        "Inner Pressure: " +
                          (envMode === "outer-space" ? "29.6 kPa (4.3 psi)" : sample.spaceship.innerPressure)
                      ),
                      h(
                        "div",
                        { className: "dash-stat-line" },
                        "Upper Pressure: " +
                          (envMode === "outer-space" ? "30.1 kPa" : sample.spaceship.upperPressure)
                      ),
                      h(
                        "div",
                        { className: "dash-stat-line" },
                        "Lower Pressure: " +
                          (envMode === "outer-space" ? "29.1 kPa" : sample.spaceship.lowerPressure)
                      )
                    ),
                    h(
                      "div",
                      { className: "dash-log-col" },
                      h(
                        "div",
                        { className: "dash-log-rect" },
                        sample.spaceship.exposureLog.map(function (entry, i) {
                          return h("div", { key: i, className: "dash-log-entry" }, entry);
                        })
                      ),
                      h("div", { className: "dash-log-caption" }, "Radiation Exposure Log")
                    )
                  ),
                  h(
                    "div",
                    { className: "dash-ship-sync" },
                    "System Status: synced (12 minutes ago)"
                  )
                ),
                selectedPart
                  ? h(
                      "div",
                      { className: "dash-box dash-part-inspector" },
                      h(
                        "div",
                        { className: "dash-inspector-header" },
                        h("h2", { className: "dash-box-heading" }, "Body Region: " + selectedPart.label),
                        h(
                          "div",
                          { className: "dash-inspector-header-actions" },
                          h(
                            "span",
                            {
                              className: getStatusTagClass(getBodyPartEffectiveStatus(selectedPart)),
                              title: "Prioritized body region status",
                            },
                            getBodyPartEffectiveStatus(selectedPart)
                          ),
                          h(
                            "button",
                            {
                              type: "button",
                              className: "dash-inspector-close",
                              "aria-label": "Close body region inspector",
                              onClick: function () {
                                setSelectedPartId(null);
                              },
                            },
                            "×"
                          )
                        )
                      ),
                      selectedPart.sections
                        ? h(
                            "div",
                            { className: "dash-inspector-sections" },
                            selectedPart.sections.map(function (section) {
                              return h(
                                "div",
                                { key: section.id, className: "dash-inspector-subsection" },
                                h(
                                  "div",
                                  { className: "dash-inspector-subhead" },
                                  h("h3", { className: "dash-inspector-subtitle" }, section.title),
                                  h(
                                    "span",
                                    { className: getStatusTagClass(section.status) },
                                    section.status
                                  )
                                ),
                                section.rows.map(function (rowText, rIdx) {
                                  return h("div", { key: rIdx, className: "dash-stat-line" }, rowText);
                                }),
                                h("p", { className: "dash-part-note" }, section.note)
                              );
                            })
                          )
                        : h(
                            React.Fragment,
                            null,
                            h("div", { className: "dash-stat-line" }, "Status: " + selectedPart.status),
                            h("div", { className: "dash-stat-line" }, "Reading: " + selectedPart.metric),
                            h("div", { className: "dash-stat-line" }, "Baseline: " + selectedPart.baseline),
                            h("p", { className: "dash-part-note" }, selectedPart.note)
                          )
                    )
                  : h(
                      "div",
                      { className: "dash-box dash-part-inspector" },
                      h(
                        "div",
                        { className: "dash-inspector-header" },
                        h("h2", { className: "dash-box-heading" }, "Body Diagram — JSON Baseline Summary")
                      ),
                      h(
                        "div",
                        { className: "dash-inspector-sections" },
                        BODY_PART_SHAPES.map(function (shape) {
                          var partObj = sample.bodyParts[shape.id];
                          var partStatus = getBodyPartEffectiveStatus(partObj);
                          var previewRow =
                            partObj && partObj.metric
                              ? partObj.metric
                              : partObj &&
                                partObj.sections &&
                                partObj.sections[0] &&
                                partObj.sections[0].rows &&
                                partObj.sections[0].rows[0]
                              ? partObj.sections[0].rows[0]
                              : "";
                          return h(
                            "button",
                            {
                              key: shape.id,
                              type: "button",
                              className: "dash-inspector-subsection",
                              style: {
                                textAlign: "left",
                                cursor: "pointer",
                                width: "100%",
                                color: "#ffffff",
                                font: "inherit",
                              },
                              onClick: function () {
                                setSelectedPartId(shape.id);
                              },
                            },
                            h(
                              "div",
                              { className: "dash-inspector-subhead" },
                              h("h3", { className: "dash-inspector-subtitle" }, shape.label),
                              h("span", { className: getStatusTagClass(partStatus) }, partStatus)
                            ),
                            previewRow ? h("div", { className: "dash-stat-line" }, previewRow) : null
                          );
                        })
                      )
                    )
              )
            )
          : activeTab === "health-plan"
          ? h(
              "main",
              { className: "dash-healthplan" },
              h(
                "section",
                { className: "dash-hp-header" },
                h(
                  "div",
                  { className: "dash-hp-avatar" },
                  astronaut && astronaut.avatarUrl
                    ? h("img", {
                        src: astronaut.avatarUrl,
                        alt: displayName + " avatar",
                        className: "crew-avatar",
                      })
                    : h("span", { className: "crew-initials" }, getInitials(astronaut))
                ),
                h(
                  "div",
                  { className: "dash-hp-identity" },
                  h("h1", { className: "dash-hp-name" }, displayName),
                  h(
                    "p",
                    { className: "dash-hp-subtitle" },
                    sample.crewRole + " • Mission Day " + missionDay + " • Health Control Plan"
                  ),
                  h("p", { className: "dash-hp-bio" }, formatAstronautBio(astronaut, true))
                )
              ),
              h(
                "div",
                { className: "dash-hp-top-grid" },
                h(
                  "section",
                  { className: "dash-box dash-hp-rx-box", "aria-label": "Current Prescription" },
                  h(
                    "div",
                    { className: "dash-hp-rx-header" },
                    h("h2", { className: "dash-box-heading" }, "Current Prescription"),
                    h(
                      "div",
                      { className: "dash-hp-rx-meta" },
                      h("span", null, "Doctor: " + sample.prescription.doctorName),
                      h("span", { className: "dash-hp-rx-sep", "aria-hidden": "true" }, "•"),
                      h("span", null, "Dept: " + sample.prescription.department),
                      h("span", { className: "dash-hp-rx-sep", "aria-hidden": "true" }, "•"),
                      h("span", null, "Updated: " + sample.prescription.updatedAt)
                    )
                  ),
                  h("p", { className: "dash-hp-rx-text" }, sample.prescription.text)
                ),
                h(
                  "section",
                  { className: "dash-box dash-hp-conditions-box", "aria-label": "Medical Conditions & Allergies" },
                  h("h2", { className: "dash-box-heading" }, "Medical Conditions & Allergies"),
                  sample.medicalConditions.length > 0
                    ? h(
                        "div",
                        { className: "dash-hp-conditions-list" },
                        sample.medicalConditions.map(function (cond, cIdx) {
                          return h(
                            "div",
                            { key: "cond-" + cIdx, className: "dash-hp-cond-row" },
                            h(
                              "span",
                              { className: "dash-hp-cond-pill dash-hp-cond-pill--warn" },
                              (cond.condition_type || "Condition") + ": " + (cond.condition_name || "")
                            ),
                            cond.notes
                              ? h("span", { className: "dash-hp-cond-note" }, cond.notes)
                              : null
                          );
                        })
                      )
                    : h(
                        "p",
                        { className: "dash-hp-cond-note", style: { margin: 0 } },
                        "No active medical conditions or drug intolerances recorded."
                      )
                )
              ),
              h(
                "section",
                { className: "dash-box dash-hp-table-box" },
                h(
                  "div",
                  { className: "dash-hp-table-header" },
                  h("h2", { className: "dash-box-heading" }, "Vitals, Checkups & Clinical Advice")
                ),
                h(
                  "div",
                  { className: "dash-hp-table-wrap" },
                  h(
                    "table",
                    { className: "dash-hp-table" },
                    h(
                      "thead",
                      null,
                      h(
                        "tr",
                        null,
                        h("th", null, "Vital / System"),
                        h("th", null, "Current Value"),
                        h("th", null, "Baseline"),
                        h("th", null, "Status"),
                        h("th", null, "Last Checkup"),
                        h("th", null, "Advice & Countermeasures")
                      )
                    ),
                    h(
                      "tbody",
                      null,
                      filteredHealthPlanRows.length === 0
                        ? h(
                            "tr",
                            null,
                            h(
                              "td",
                              {
                                colSpan: 6,
                                style: { textAlign: "center", padding: "1.25rem", color: "#cbd5e1" },
                              },
                              "No vitals selected for display. Click SETUP below to choose vitals."
                            )
                          )
                        : filteredHealthPlanRows.map(function (row) {
                            return h(
                              "tr",
                              { key: row.id },
                              h("td", { className: "dash-hp-cell-vital" }, row.vital),
                              h("td", null, row.currentValue),
                              h("td", null, row.baseline),
                              h(
                                "td",
                                null,
                                h("span", { className: getStatusTagClass(row.status) }, row.status)
                              ),
                              h("td", null, row.lastCheckup),
                              h("td", null, row.advice)
                            );
                          })
                    )
                  )
                )
              )
            )
          : activeTab === "measurements"
          ? h(
              "main",
              { className: "dash-measurements" },
              h(
                "section",
                {
                  className: measEditMode
                    ? "meas-toolbar meas-toolbar--orange"
                    : "meas-toolbar",
                },
                h(
                  "div",
                  { className: "meas-toolbar-top" },
                  h(
                    "div",
                    { className: "meas-toolbar-title-group" },
                    h("h1", { className: "meas-title" }, "ASTRONAUT MEASUREMENTS & TELEMETRY DATA POINTS"),
                    h(
                      "span",
                      {
                        className: measEditMode
                          ? "meas-mode-badge meas-mode-badge--orange"
                          : "meas-mode-badge meas-mode-badge--blue",
                      },
                      measEditMode
                        ? "EDIT MODE ACTIVE — Click any data point below to edit its data"
                        : "VIEW MODE — Click any data point below to display its data"
                    )
                  )
                ),
                h(
                  "div",
                  { className: "meas-toolbar-filters" },
                  h(
                    "div",
                    { className: "meas-cat-pills", role: "tablist", "aria-label": "Measurement Categories" },
                    [
                      { id: "all", label: "ALL (" + MEASUREMENT_SPECS.length + ")" },
                      {
                        id: "vitals",
                        label:
                          "VITALS & BIOMETRICS (" +
                          MEASUREMENT_SPECS.filter(function (s) {
                            return s.category === "vitals";
                          }).length +
                          ")",
                      },
                      {
                        id: "suit_cabin",
                        label:
                          "SUIT & CABIN (" +
                          MEASUREMENT_SPECS.filter(function (s) {
                            return s.category === "suit_cabin";
                          }).length +
                          ")",
                      },
                      {
                        id: "daily",
                        label:
                          "PER-SOL LOGS (" +
                          MEASUREMENT_SPECS.filter(function (s) {
                            return s.category === "daily";
                          }).length +
                          ")",
                      },
                      {
                        id: "baseline",
                        label:
                          "CONSTANTS & BASELINES (" +
                          MEASUREMENT_SPECS.filter(function (s) {
                            return s.category === "baseline";
                          }).length +
                          ")",
                      },
                    ].map(function (cat) {
                      var active = measCategory === cat.id;
                      return h(
                        "button",
                        {
                          key: cat.id,
                          type: "button",
                          className: active ? "meas-cat-pill meas-cat-pill--active" : "meas-cat-pill",
                          onClick: function () {
                            setMeasCategory(cat.id);
                          },
                        },
                        cat.label
                      );
                    })
                  ),
                  h("input", {
                    type: "search",
                    className: "meas-search-input",
                    placeholder: "Filter data points by name, unit, or representation...",
                    "aria-label": "Filter measurements",
                    value: measSearch,
                    onChange: function (e) {
                      setMeasSearch(e.target.value);
                    },
                  })
                )
              ),
              h(
                "section",
                { className: "meas-source-panel", "aria-label": "Measurement data sources" },
                h(
                  "div",
                  null,
                  h("strong", null, "SIMULATED TELEMETRY"),
                  " — catalogue trends and warning simulations are illustrative, not clinical readings. Profile constants use crew data when available; missing fields use example placeholders."
                ),
                h(
                  "div",
                  null,
                  "Latest API record: ",
                  latestApiRecord
                    ? "HR " +
                      (latestApiVitals.heart_rate !== undefined ? latestApiVitals.heart_rate : "—") +
                      " bpm · BP " +
                      (latestApiVitals.blood_pressure || "—") +
                      " · " +
                      (latestApiRecord.timestamp || "recorded")
                    : "No recorded vitals returned by the API."
                ),
                h(
                  "div",
                  null,
                  "Crew profile baseline: HR ",
                  apiProfileBaseline.base_heart_rating_bpm !== undefined
                    ? apiProfileBaseline.base_heart_rating_bpm
                    : "—",
                  " bpm · BP ",
                  apiProfileBaseline.base_blood_pressure || "—",
                  " · Blood type ",
                  apiProfileBaseline.blood_type || "—"
                ),
                h(
                  "div",
                  null,
                  "Current vitals form draft (not yet submitted): HR ",
                  vitalsForm.heart_rate,
                  " bpm · BP ",
                  vitalsForm.blood_pressure,
                  " · Sleep ",
                  vitalsForm.sleep_hours,
                  " h"
                )
              ),
              h(
                "section",
                { className: "meas-grid", "aria-label": "Measurements Data Points" },
                MEASUREMENT_SPECS.filter(function (spec) {
                  if (measCategory !== "all" && spec.category !== measCategory) return false;
                  if (!measSearch.trim()) return true;
                  var q = measSearch.trim().toLowerCase();
                  var item = measurements[spec.id] || spec;
                  return (
                    spec.name.toLowerCase().indexOf(q) !== -1 ||
                    spec.dataType.toLowerCase().indexOf(q) !== -1 ||
                    spec.unit.toLowerCase().indexOf(q) !== -1 ||
                    spec.representation.toLowerCase().indexOf(q) !== -1 ||
                    String(item.value || "").toLowerCase().indexOf(q) !== -1
                  );
                }).map(function (spec) {
                  var item = measurements[spec.id] || spec;
                  var isSelected = selectedMeasId === spec.id;
                  var alertLevel = getEffectiveMeasurementAlertLevel(item);
                  var colorClass =
                    alertLevel === "red"
                      ? "meas-card--red"
                      : alertLevel === "yellow"
                      ? "meas-card--yellow"
                      : measEditMode
                      ? "meas-card--orange"
                      : "meas-card--blue";
                  var cardClasses = ["meas-card", colorClass];
                  if (isSelected) cardClasses.push("meas-card--selected");
                  var unitSuffix =
                    item.unit && item.unit !== "N/A" && String(item.value).indexOf(item.unit.split(" ")[0]) === -1
                      ? " " + item.unit
                      : "";

                  return h(
                    "button",
                    {
                      key: spec.id,
                      type: "button",
                      className: cardClasses.join(" "),
                      onClick: function () {
                        handleClickMeasurementCard(spec.id);
                      },
                    },
                    h(
                      "div",
                      { className: "meas-card-top" },
                      h("span", { className: "meas-card-index" }, "#" + (MEASUREMENT_SPECS.indexOf(spec) + 1)),
                      h("span", { className: "meas-card-rep-badge" }, item.representation)
                    ),
                    h("h3", { className: "meas-card-title" }, item.name),
                    h(
                      "span",
                      { className: "meas-card-source" },
                      item.source || "SIMULATED TELEMETRY"
                    ),
                    h(
                      "div",
                      { className: "meas-card-value-wrap" },
                      h("span", { className: "meas-card-value" }, String(item.value) + unitSuffix)
                    ),
                    item.chartType === "line" && Array.isArray(item.series)
                      ? h(
                          "div",
                          { className: "meas-card-mini-chart" },
                          h(MeasurementLineChartSvg, {
                            series: item.series,
                            seriesSecondary: item.seriesSecondary,
                            labels: item.seriesLabels,
                            unit: item.unit,
                            mini: true,
                            isOrange: measEditMode,
                            alertLevel: alertLevel,
                          })
                        )
                      : item.chartType === "column" && Array.isArray(item.series)
                      ? h(
                          "div",
                          { className: "meas-card-mini-chart" },
                          h(MeasurementColumnChartSvg, {
                            series: item.series,
                            labels: item.seriesLabels,
                            unit: item.unit,
                            mini: true,
                            isOrange: measEditMode,
                            alertLevel: alertLevel,
                          })
                        )
                      : null,
                    measEditMode
                      ? h(
                          React.Fragment,
                          null,
                          h(
                            "div",
                            { className: "meas-card-meta" },
                            h("span", null, "Type: " + item.dataType),
                            h("span", null, "Unit: " + item.unit)
                          ),
                          h(
                            "div",
                            { className: "meas-card-threshold" },
                            "Trigger: " + item.threshold
                          )
                        )
                      : null,
                    h(
                      "div",
                      { className: "meas-card-action-hint" },
                      measEditMode ? "✎ Click to Edit Data Point" : "Click to Display Data"
                    )
                  );
                })
              )
            )
          : activeTab === "warning-log"
          ? (function () {
              var filteredLogs = warningLogs.filter(function (entry) {
                if (wlogFilter !== "all" && entry.severity !== wlogFilter) return false;
                if (!wlogSearch.trim()) return true;
                var q = wlogSearch.trim().toLowerCase();
                return (
                  String(entry.measurementName || "").toLowerCase().indexOf(q) !== -1 ||
                  String(entry.reason || "").toLowerCase().indexOf(q) !== -1 ||
                  String(entry.analysisNotes || "").toLowerCase().indexOf(q) !== -1 ||
                  String(entry.status || "").toLowerCase().indexOf(q) !== -1 ||
                  String(entry.triggerValue || "").toLowerCase().indexOf(q) !== -1 ||
                  String(entry.unit || "").toLowerCase().indexOf(q) !== -1
                );
              });
              var yellowCount = warningLogs.filter(function (e) {
                return e.severity === "yellow";
              }).length;
              var redCount = warningLogs.filter(function (e) {
                return e.severity === "red";
              }).length;

              var selectedIdx = filteredLogs.findIndex(function (e) {
                return e.id === selectedWlogId;
              });
              if (selectedIdx === -1 && filteredLogs.length > 0) {
                selectedIdx = 0;
              }
              var activeLog = selectedIdx >= 0 ? filteredLogs[selectedIdx] : null;

              function goPrevLog() {
                if (filteredLogs.length === 0) return;
                var nextIdx = selectedIdx > 0 ? selectedIdx - 1 : filteredLogs.length - 1;
                setSelectedWlogId(filteredLogs[nextIdx].id);
              }

              function goNextLog() {
                if (filteredLogs.length === 0) return;
                var nextIdx = selectedIdx < filteredLogs.length - 1 ? selectedIdx + 1 : 0;
                setSelectedWlogId(filteredLogs[nextIdx].id);
              }

              return h(
                "main",
                { className: "dash-measurements wlog-main" },
                h(
                  "section",
                  {
                    className: wlogEditMode
                      ? "meas-toolbar meas-toolbar--orange"
                      : "meas-toolbar",
                  },
                  h(
                    "div",
                    { className: "meas-toolbar-top" },
                    h(
                      "div",
                      { className: "meas-toolbar-title-group" },
                      h(
                        "h1",
                        { className: "meas-title" },
                        "WARNING & ANOMALY TELEMETRY LOG — SIMULATED SAMPLE DATA & ANALYSIS"
                      ),
                      h(
                        "span",
                        {
                          className: wlogEditMode
                            ? "meas-mode-badge meas-mode-badge--orange"
                            : "meas-mode-badge meas-mode-badge--blue",
                        },
                        wlogEditMode
                          ? "EDIT MODE ACTIVE — Click any warning record on the left or click Edit to modify its telemetry records & notes"
                          : "VIEW MODE — Select any warning record on the left (or use Prev / Next) to inspect surrounding telemetry records"
                      )
                    ),
                    h(
                      "div",
                      { className: "wlog-toolbar-actions" },
                      h(
                        "button",
                        {
                          type: "button",
                          className: "wlog-top-btn",
                          onClick: handleResetWarningLogs,
                        },
                        "↺ Reset Sample Logs"
                      )
                    )
                  ),
                  h(
                    "div",
                    { className: "meas-toolbar-filters" },
                    h(
                      "div",
                      { className: "meas-cat-pills", role: "tablist", "aria-label": "Warning Severity Filter" },
                      [
                        { id: "all", label: "ALL LOGS (" + warningLogs.length + ")" },
                        { id: "yellow", label: "⚠ YELLOW WARNINGS (" + yellowCount + ")" },
                        { id: "red", label: "🚨 RED SOS ALERTS (" + redCount + ")" },
                      ].map(function (flt) {
                        var active = wlogFilter === flt.id;
                        return h(
                          "button",
                          {
                            key: flt.id,
                            type: "button",
                            className: active ? "meas-cat-pill meas-cat-pill--active" : "meas-cat-pill",
                            onClick: function () {
                              setWlogFilter(flt.id);
                            },
                          },
                          flt.label
                        );
                      })
                    ),
                    h("input", {
                      type: "search",
                      className: "meas-search-input",
                      placeholder: "Search warning logs by parameter, reason, status, or analysis notes...",
                      "aria-label": "Search warning logs",
                      value: wlogSearch,
                      onChange: function (e) {
                        setWlogSearch(e.target.value);
                      },
                    })
                  )
                ),
                filteredLogs.length === 0
                  ? h(
                      "div",
                      { className: "dash-box wlog-empty-box" },
                      h("h2", { className: "dash-box-heading" }, "No Warning Log Entries Match Current Filter"),
                      h(
                        "p",
                        { className: "muted-subtext" },
                        "Trigger a warning using TEST WARNINGS to automatically record telemetry events for analysis."
                      )
                    )
                  : h(
                      "section",
                      { className: "wlog-split-layout", "aria-label": "Warning Log Navigator and Inspector" },
                      h(
                        "aside",
                        { className: "wlog-sidebar", "aria-label": "Warning Log List Navigation" },
                        h(
                          "div",
                          { className: "wlog-sidebar-header" },
                          h(
                            "span",
                            { className: "wlog-sidebar-count" },
                            "LOG " + (selectedIdx + 1) + " OF " + filteredLogs.length
                          ),
                          h(
                            "div",
                            { className: "wlog-nav-stepper" },
                            h(
                              "button",
                              {
                                type: "button",
                                className: "wlog-step-btn",
                                onClick: goPrevLog,
                                disabled: filteredLogs.length <= 1,
                                "aria-label": "Previous warning log",
                              },
                              "◀ PREV"
                            ),
                            h(
                              "button",
                              {
                                type: "button",
                                className: "wlog-step-btn",
                                onClick: goNextLog,
                                disabled: filteredLogs.length <= 1,
                                "aria-label": "Next warning log",
                              },
                              "NEXT ▶"
                            )
                          )
                        ),
                        h(
                          "div",
                          { className: "wlog-sidebar-list", role: "listbox", "aria-label": "Recorded Warnings" },
                          filteredLogs.map(function (entry, idx) {
                            var isSelected = Boolean(activeLog && String(activeLog.id) === String(entry.id));
                            var isRed = entry.severity === "red";
                            var unitShort =
                              entry.unit && entry.unit !== "N/A" ? entry.unit.split(" ")[0] : "";
                            var itemClasses = [
                              "wlog-nav-item",
                              isRed ? "wlog-nav-item--red" : "wlog-nav-item--yellow",
                              wlogEditMode ? "wlog-nav-item--orange" : "",
                              isSelected ? "wlog-nav-item--active" : "",
                            ]
                              .filter(Boolean)
                              .join(" ");

                            return h(
                              "div",
                              {
                                key: entry.id,
                                role: "option",
                                tabIndex: 0,
                                "aria-selected": isSelected,
                                className: itemClasses,
                                onClick: function () {
                                  setSelectedWlogId(entry.id);
                                  if (wlogEditMode) {
                                    openEditWarningLogModal(entry);
                                  }
                                },
                                onKeyDown: function (e) {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    setSelectedWlogId(entry.id);
                                    if (wlogEditMode) {
                                      openEditWarningLogModal(entry);
                                    }
                                  }
                                },
                              },
                              h(
                                "div",
                                { className: "wlog-nav-item-top" },
                                h(
                                  "span",
                                  {
                                    className: isRed
                                      ? "wlog-sev-badge wlog-sev-badge--red"
                                      : "wlog-sev-badge wlog-sev-badge--yellow",
                                  },
                                  isRed
                                    ? "🚨 RED SOS"
                                    : entry.isAdditionalCritical
                                    ? "⚠ ADDITIONAL CRITICAL"
                                    : "⚠ YELLOW"
                                ),
                                h(
                                  "span",
                                  { className: "wlog-nav-item-prio" },
                                  "#" +
                                    (idx + 1) +
                                    " • P" +
                                    (entry.priority || 1) +
                                    (entry.updateCount > 1 ? " • ↻" + entry.updateCount : "")
                                )
                              ),
                              h("div", { className: "wlog-nav-item-name" }, entry.measurementName),
                              h(
                                "div",
                                { className: "wlog-nav-item-val" },
                                "Value: " +
                                  entry.triggerValue +
                                  (unitShort && String(entry.triggerValue).indexOf(unitShort) === -1
                                    ? " " + unitShort
                                    : "") +
                                  (entry.initialTriggerValue &&
                                  String(entry.initialTriggerValue) !== String(entry.triggerValue)
                                    ? " (from " + entry.initialTriggerValue + ")"
                                    : "")
                              ),
                              h(
                                "div",
                                { className: "wlog-nav-item-meta" },
                                h("span", null, "Sol " + (entry.sol || missionDay) + " • " + entry.timestamp),
                                h("span", { className: "wlog-nav-item-status" }, entry.status || "Under Review"),
                                h("span", { className: "wlog-source-badge" }, entry.source || "SIMULATED")
                              ),
                              h(
                                "div",
                                { className: "wlog-nav-item-quick-btns" },
                                h(
                                  "button",
                                  {
                                    type: "button",
                                    className: "wlog-mini-btn wlog-mini-btn--edit",
                                    onClick: function (ev) {
                                      ev.stopPropagation();
                                      setSelectedWlogId(entry.id);
                                      openEditWarningLogModal(entry);
                                    },
                                  },
                                  "✎ Edit"
                                ),
                                h(
                                  "button",
                                  {
                                    type: "button",
                                    className:
                                      String(confirmDeleteWlogId) === String(entry.id)
                                        ? "wlog-mini-btn wlog-mini-btn--confirm-del"
                                        : "wlog-mini-btn wlog-mini-btn--del",
                                    onClick: function (ev) {
                                      ev.stopPropagation();
                                      requestDeleteWarningLog(entry.id);
                                    },
                                  },
                                  String(confirmDeleteWlogId) === String(entry.id)
                                    ? "⚠ Press Again to Delete"
                                    : "Delete"
                                )
                              )
                            );
                          })
                        )
                      ),
                      activeLog
                        ? (function () {
                            var logEntry = activeLog;
                            var isRed = logEntry.severity === "red";
                            var stats = computeRecentRecordsStats(logEntry.recentRecords, logEntry.unit);
                            var fmtStat = function (num) {
                              if (!Number.isFinite(num)) return "N/A";
                              return Math.abs(num) < 1 && num !== 0 ? num.toFixed(3) : Math.round(num * 100) / 100;
                            };
                            var unitShort =
                              logEntry.unit && logEntry.unit !== "N/A"
                                ? logEntry.unit.split(" ")[0]
                                : "";
                            var detailCardClass = [
                              "wlog-detail-panel",
                              isRed ? "wlog-card--red" : "wlog-card--yellow",
                              wlogEditMode ? "wlog-card--editable" : "",
                            ]
                              .filter(Boolean)
                              .join(" ");

                            return h(
                              "article",
                              { key: logEntry.id, className: detailCardClass, "aria-label": "Selected Warning Analysis" },
                              h(
                                "div",
                                { className: "wlog-card-header" },
                                h(
                                  "div",
                                  { className: "wlog-card-header-left" },
                                  h(
                                    "span",
                                    {
                                      className: isRed
                                        ? "wlog-sev-badge wlog-sev-badge--red"
                                        : "wlog-sev-badge wlog-sev-badge--yellow",
                                    },
                                    isRed
                                      ? "🚨 RED SOS ALERT"
                                      : logEntry.isAdditionalCritical
                                      ? "⚠ WARNING — ADDITIONAL CRITICAL EVENT OCCURRED"
                                      : "⚠ YELLOW WARNING"
                                  ),
                                  h(
                                    "span",
                                    { className: "wlog-prio-badge" },
                                    "PRIORITY #" + (logEntry.priority || 1)
                                  ),
                                  h("h2", { className: "wlog-card-title" }, logEntry.measurementName),
                                  h(
                                    "span",
                                    { className: "wlog-source-badge" },
                                    logEntry.source || "SIMULATED"
                                  ),
                                  h(
                                    "span",
                                    { className: "wlog-trigger-val" },
                                    "Current/Peak: " +
                                      logEntry.triggerValue +
                                      (unitShort && String(logEntry.triggerValue).indexOf(unitShort) === -1
                                        ? " " + logEntry.unit
                                        : "") +
                                      (logEntry.initialTriggerValue &&
                                      String(logEntry.initialTriggerValue) !== String(logEntry.triggerValue)
                                        ? " (Initial: " + logEntry.initialTriggerValue + ")"
                                        : "")
                                  ),
                                  logEntry.updateCount > 1
                                    ? h(
                                        "span",
                                        { className: "wlog-status-pill" },
                                        "↻ Auto-Updated " + logEntry.updateCount + "×"
                                      )
                                    : null,
                                  h(
                                    "label",
                                    { className: "wlog-inline-status-wrap" },
                                    h("span", { className: "wlog-inline-status-lbl" }, "Status:"),
                                    h(
                                      "select",
                                      {
                                        className: "wlog-inline-status-select",
                                        "aria-label": "Change status for this warning",
                                        value: logEntry.status || "Under Review",
                                        onChange: function (ev) {
                                          handleQuickUpdateWarningField(logEntry.id, { status: ev.target.value });
                                        },
                                      },
                                      h("option", { value: "Active / Under Review" }, "Active / Under Review"),
                                      h("option", { value: "Warning — Additional Critical Event" }, "Warning — Additional Critical Event"),
                                      h("option", { value: "Under Review" }, "Under Review"),
                                      h("option", { value: "Monitoring" }, "Monitoring"),
                                      h("option", { value: "Resolved — Countermeasure Applied" }, "Resolved — Countermeasure Applied"),
                                      h("option", { value: "Escalated to Flight Surgeon" }, "Escalated to Flight Surgeon"),
                                      h("option", { value: "Critical — SOS Triggered" }, "Critical — SOS Triggered"),
                                      h("option", { value: "False Positive / Sensor Drift" }, "False Positive / Sensor Drift")
                                    )
                                  ),
                                  h(
                                    "span",
                                    { className: "wlog-timestamp" },
                                    "Sol " + (logEntry.sol || missionDay) + " • " + logEntry.timestamp
                                  )
                                ),
                                h(
                                  "div",
                                  { className: "wlog-header-actions" },
                                  h(
                                    "button",
                                    {
                                      type: "button",
                                      className: "wlog-action-btn wlog-action-btn--edit",
                                      onClick: function () {
                                        openEditWarningLogModal(logEntry);
                                      },
                                    },
                                    "✎ EDIT THIS WARNING"
                                  ),
                                  logEntry.specId && measurements && measurements[logEntry.specId]
                                    ? h(
                                        "button",
                                        {
                                          type: "button",
                                          className: "wlog-action-btn",
                                          onClick: function () {
                                            openMeasurementFromWarning(logEntry.specId);
                                          },
                                        },
                                        "OPEN PARAMETER"
                                      )
                                    : null,
                                  h(
                                    "button",
                                    {
                                      type: "button",
                                      className:
                                        String(confirmDeleteWlogId) === String(logEntry.id)
                                          ? "wlog-action-btn wlog-action-btn--confirm-delete"
                                          : "wlog-action-btn wlog-action-btn--delete",
                                      onClick: function () {
                                        requestDeleteWarningLog(logEntry.id);
                                      },
                                    },
                                    String(confirmDeleteWlogId) === String(logEntry.id)
                                      ? "⚠ PRESS AGAIN TO CONFIRM DELETE"
                                      : "DELETE THIS WARNING"
                                  )
                                )
                              ),
                              h(
                                "div",
                                { className: "wlog-detail-body" },
                                h(
                                  "div",
                                  { className: "wlog-reason-bar" },
                                  h("strong", null, "Trigger Analysis: "),
                                  logEntry.reason,
                                  logEntry.thresholdRule
                                    ? h(
                                        "span",
                                        { className: "wlog-threshold-inline" },
                                        "  [Rule: " + logEntry.thresholdRule + "]"
                                      )
                                    : null
                                ),
                                h(
                                  "div",
                                  { className: "wlog-countermeasures-box" },
                                  h(
                                    "div",
                                    { className: "wlog-pane-label" },
                                    "POSSIBLE COUNTERMEASURES & RECOMMENDED ACTION PROTOCOL"
                                  ),
                                  h(
                                    "div",
                                    { className: "wlog-countermeasures-text" },
                                    logEntry.countermeasures ||
                                      getCountermeasuresForWarning(
                                        logEntry.specId,
                                        logEntry.isAdditionalCritical ? "red" : logEntry.severity
                                      )
                                  )
                                ),
                                h(
                                  "div",
                                  { className: "wlog-analysis-grid" },
                                  h(
                                    "div",
                                    { className: "wlog-chart-pane" },
                                    h(
                                      "div",
                                      { className: "wlog-pane-label" },
                                      "RECENT TELEMETRY RECORDS AROUND WARNING (" +
                                        (Array.isArray(logEntry.recentRecords) ? logEntry.recentRecords.length : 0) +
                                        " SAMPLES CAPTURED)"
                                    ),
                                    Array.isArray(logEntry.recentRecords) && logEntry.recentRecords.length > 0
                                      ? logEntry.chartType === "column"
                                        ? h(MeasurementColumnChartSvg, {
                                            series: logEntry.recentRecords,
                                            labels: logEntry.recentLabels,
                                            unit: logEntry.unit,
                                            mini: false,
                                            isOrange: wlogEditMode,
                                            alertLevel: logEntry.severity,
                                          })
                                        : h(MeasurementLineChartSvg, {
                                            series: logEntry.recentRecords,
                                            seriesSecondary: logEntry.recentSecondary,
                                            labels: logEntry.recentLabels,
                                            unit: logEntry.unit,
                                            mini: false,
                                            isOrange: wlogEditMode,
                                            alertLevel: logEntry.severity,
                                          })
                                      : h("p", { className: "muted-subtext" }, "No numeric time-series records attached."),
                                    Array.isArray(logEntry.recentRecords) && logEntry.recentRecords.length > 0
                                      ? h(
                                          "div",
                                          { className: "wlog-records-strip" },
                                          logEntry.recentRecords.map(function (val, rIdx) {
                                            var lbl =
                                              Array.isArray(logEntry.recentLabels) && logEntry.recentLabels[rIdx]
                                                ? logEntry.recentLabels[rIdx]
                                                : "T-" + (logEntry.recentRecords.length - 1 - rIdx) + "s";
                                            var secVal =
                                              Array.isArray(logEntry.recentSecondary) &&
                                              logEntry.recentSecondary[rIdx] !== undefined
                                                ? "/" + logEntry.recentSecondary[rIdx]
                                                : "";
                                            var isLast = rIdx === logEntry.recentRecords.length - 1;
                                            return h(
                                              "div",
                                              {
                                                key: rIdx,
                                                className: isLast
                                                  ? "wlog-record-cell wlog-record-cell--trigger"
                                                  : "wlog-record-cell",
                                              },
                                              h("span", { className: "wlog-record-lbl" }, lbl),
                                              h(
                                                "span",
                                                { className: "wlog-record-val" },
                                                String(val) + secVal + (unitShort ? " " + unitShort : "")
                                              )
                                            );
                                          })
                                        )
                                      : null
                                  ),
                                  h(
                                    "div",
                                    { className: "wlog-stats-pane" },
                                    h("div", { className: "wlog-pane-label" }, "WINDOW STATISTICAL ANALYSIS"),
                                    stats
                                      ? h(
                                          "div",
                                          { className: "wlog-stats-boxes" },
                                          h(
                                            "div",
                                            { className: "wlog-stat-cell" },
                                            h("span", { className: "wlog-stat-k" }, "Window Min"),
                                            h("span", { className: "wlog-stat-v" }, fmtStat(stats.min) + " " + unitShort)
                                          ),
                                          h(
                                            "div",
                                            { className: "wlog-stat-cell" },
                                            h("span", { className: "wlog-stat-k" }, "Window Max"),
                                            h("span", { className: "wlog-stat-v" }, fmtStat(stats.max) + " " + unitShort)
                                          ),
                                          h(
                                            "div",
                                            { className: "wlog-stat-cell" },
                                            h("span", { className: "wlog-stat-k" }, "Window Mean"),
                                            h("span", { className: "wlog-stat-v" }, fmtStat(stats.mean) + " " + unitShort)
                                          ),
                                          h(
                                            "div",
                                            { className: "wlog-stat-cell" },
                                            h("span", { className: "wlog-stat-k" }, "Net Change (Δ)"),
                                            h(
                                              "span",
                                              { className: "wlog-stat-v" },
                                              (stats.netDelta >= 0 ? "+" : "") + fmtStat(stats.netDelta) + " " + unitShort
                                            )
                                          ),
                                          h(
                                            "div",
                                            { className: "wlog-stat-cell wlog-stat-cell--wide" },
                                            h("span", { className: "wlog-stat-k" }, "Max Step Rate (Peak Δ/step)"),
                                            h("span", { className: "wlog-stat-v" }, fmtStat(stats.maxStepDelta) + " " + unitShort)
                                          )
                                        )
                                      : null,
                                    h(
                                      "div",
                                      { className: "wlog-snapshot-box" },
                                      h("div", { className: "wlog-pane-label" }, "CONCURRENT VITALS AT TRIGGER"),
                                      h("div", { className: "wlog-snapshot-text" }, logEntry.concurrentSnapshot || "N/A")
                                    ),
                                    h(
                                      "div",
                                      { className: "wlog-notes-box" },
                                      h("div", { className: "wlog-pane-label" }, "CLINICAL & FLIGHT SURGEON ANALYSIS NOTES"),
                                      h(
                                        "p",
                                        { className: "wlog-notes-text" },
                                        logEntry.analysisNotes || "No analysis notes entered yet. Click Edit to add findings."
                                      )
                                    )
                                  )
                                )
                              )
                            );
                          })()
                        : null
                    )
              );
            })()
          : h(
              "main",
              { className: "dash-groundcontrol" },
              h(
                "div",
                { className: "dash-gc-layout" },
                h(
                  "section",
                  { className: "dash-gc-left", "aria-labelledby": "gc-time-period-heading" },
                  h("h1", { id: "gc-time-period-heading", className: "dash-gc-title" }, "TIME PERIOD SETTINGS"),
                  h(
                    "div",
                    { className: "dash-gc-grid" },
                    GROUND_CONTROL_PERIODS.map(function (periodObj) {
                      var classes = ["dash-gc-period-btn"];
                      if (periodObj.fullWidth) classes.push("dash-gc-period-btn--all");
                      if (gcPeriod === periodObj.id) classes.push("dash-gc-period-btn--active");
                      return h(
                        "button",
                        {
                          key: periodObj.id,
                          type: "button",
                          className: classes.join(" "),
                          "aria-pressed": gcPeriod === periodObj.id,
                          onClick: function () {
                            handleSelectPeriod(periodObj);
                          },
                        },
                        periodObj.label
                      );
                    })
                  ),
                  gcPeriod === "custom"
                    ? h(
                        "div",
                        { className: "dash-gc-custom-bar" },
                        h("input", {
                          type: "text",
                          className: "text-input",
                          "aria-label": "Custom time period",
                          placeholder: "e.g., 14 Nov 2026 08:00 - 14 Nov 2026 15:00",
                          value: gcCustomRange,
                          onChange: function (e) {
                            setGcCustomRange(e.target.value);
                          },
                        })
                      )
                    : null,
                  gcStatusMsg
                    ? h("p", { className: "dash-gc-status", role: "status" }, gcStatusMsg)
                    : null
                ),
                h(
                  "section",
                  { className: "dash-gc-right", "aria-label": "Export Categories" },
                  [
                    { key: "vitals", label: "VITALS" },
                    { key: "healthPlan", label: "HEALTH PLAN" },
                    { key: "logs", label: "LOGS" },
                  ].map(function (cat) {
                    return h(
                      "label",
                      { key: cat.key, className: "dash-gc-check-item" },
                      h("input", {
                        type: "checkbox",
                        checked: Boolean(gcCategories[cat.key]),
                        onChange: function () {
                          toggleGcCategory(cat.key);
                        },
                      }),
                      h("span", { className: "dash-gc-checkbox-box", "aria-hidden": "true" }),
                      h("span", null, cat.label)
                    );
                  })
                )
              )
            ),
        !alertActive
          ? h(
              "div",
              { className: "dash-bottom-actions" },
              diagnosticActive
                ? [
                    h(
                      "button",
                      { key: "diag-setup", type: "button", className: "dash-action-btn" },
                      "SETUP"
                    ),
                    h(
                      "button",
                      {
                        key: "diag-back",
                        type: "button",
                        className: "dash-action-btn",
                        onClick: closeDiagnosticScreen,
                      },
                      "BACK"
                    ),
                  ]
                : [
                    activeTab === "measurements"
                      ? [
                          h(
                            "button",
                            {
                              key: "meas-test-warn",
                              type: "button",
                              className: "dash-action-btn",
                              onClick: triggerTestAlert,
                            },
                            "TEST WARNINGS"
                          ),
                          h(
                            "button",
                            {
                              key: "meas-edit",
                              type: "button",
                              className: measEditMode
                                ? "dash-action-btn dash-action-btn--orange"
                                : "dash-action-btn",
                              onClick: toggleMeasEditMode,
                            },
                            measEditMode ? "EDIT MODE: ON" : "EDIT"
                          ),
                        ]
                      : activeTab === "warning-log"
                      ? [
                          h(
                            "button",
                            {
                              key: "wlog-test-warn",
                              type: "button",
                              className: "dash-action-btn",
                              onClick: triggerTestAlert,
                            },
                            "TEST WARNINGS"
                          ),
                          h(
                            "button",
                            {
                              key: "wlog-edit",
                              type: "button",
                              className: wlogEditMode
                                ? "dash-action-btn dash-action-btn--orange"
                                : "dash-action-btn",
                              onClick: toggleWlogEditMode,
                            },
                            wlogEditMode ? "EDIT MODE: ON" : "EDIT"
                          ),
                        ]
                      : activeTab === "ground-control"
                      ? h(
                          "button",
                          {
                            key: "gc-export",
                            type: "button",
                            className: "dash-action-btn",
                            onClick: handleTriggerExport,
                          },
                          "EXPORT"
                        )
                      : activeTab === "health-plan"
                      ? h(
                          "button",
                          {
                            key: "hp-setup",
                            type: "button",
                            className: "dash-action-btn",
                            onClick: openVitalsSetup,
                          },
                          "SETUP"
                        )
                      : activeTab === "dashboard"
                      ? [
                          h(
                            "button",
                            {
                              key: "dash-diag",
                              type: "button",
                              className: "dash-action-btn",
                              onClick: openDiagnosticScreen,
                            },
                            "TEST DIAGNOSTIC"
                          ),
                          h(
                            "button",
                            {
                              key: "dash-alert",
                              type: "button",
                              className: "dash-action-btn",
                              onClick: triggerTestAlert,
                            },
                            "TEST WARNINGS"
                          ),
                        ]
                      : null,
                    h(
                      "button",
                      { key: "dash-exit", type: "button", className: "dash-action-btn", onClick: onExit },
                      "EXIT"
                    ),
                  ]
            )
          : null
      ),
      measModalMode === "view" && selectedMeasId && measurements[selectedMeasId]
        ? (function () {
            var item = measurements[selectedMeasId];
            var modalAlert = getEffectiveMeasurementAlertLevel(item);
            var unitSuffix =
              item.unit && item.unit !== "N/A" && String(item.value).indexOf(item.unit.split(" ")[0]) === -1
                ? " " + item.unit
                : "";
            return h(
              "div",
              {
                className: "modal-backdrop",
                role: "dialog",
                "aria-modal": "true",
                "aria-labelledby": "meas-view-title",
                onClick: function (e) {
                  if (e.target === e.currentTarget) setMeasModalMode(null);
                },
              },
              h(
                "div",
                {
                  className:
                    modalAlert === "red"
                      ? "modal-card meas-modal-card meas-modal-card--red"
                      : modalAlert === "yellow"
                      ? "modal-card meas-modal-card meas-modal-card--yellow"
                      : "modal-card meas-modal-card meas-modal-card--blue",
                },
                h(
                  "div",
                  {
                    className:
                      modalAlert === "red"
                        ? "meas-modal-header meas-modal-header--red"
                        : modalAlert === "yellow"
                        ? "meas-modal-header meas-modal-header--yellow"
                        : "meas-modal-header meas-modal-header--blue",
                  },
                  h(
                    "div",
                    null,
                    h("span", { className: "meas-modal-kicker" }, "MEASUREMENT DATA DISPLAY"),
                    h("h2", { id: "meas-view-title", className: "meas-modal-title" }, item.name)
                  ),
                  h(
                    "button",
                    {
                      type: "button",
                      className: "meas-modal-close",
                      "aria-label": "Close measurement display",
                      onClick: function () {
                        setMeasModalMode(null);
                      },
                    },
                    "×"
                  )
                ),
                h(
                  "div",
                  { className: "meas-modal-body" },
                  h(
                    "div",
                    {
                      className:
                        modalAlert === "red"
                          ? "meas-display-readout meas-display-readout--red"
                          : modalAlert === "yellow"
                          ? "meas-display-readout meas-display-readout--yellow"
                          : "meas-display-readout",
                    },
                    h("div", { className: "meas-display-label" }, "CURRENT RECORDED DATA"),
                    h("div", { className: "meas-display-big-value" }, String(item.value) + unitSuffix),
                    h("div", { className: "meas-display-rep" }, "Representation: " + item.representation)
                  ),
                  item.chartType === "line" && Array.isArray(item.series)
                    ? h(
                        "div",
                        { className: "meas-chart-box" },
                        h(MeasurementLineChartSvg, {
                          series: item.series,
                          seriesSecondary: item.seriesSecondary,
                          labels: item.seriesLabels,
                          unit: item.unit,
                          mini: false,
                          isOrange: false,
                          alertLevel: modalAlert,
                        }),
                        h(
                          "div",
                          { className: "meas-series-caption" },
                          "Time-Series Values: [" + item.series.join(", ") + "]"
                        )
                      )
                    : item.chartType === "column" && Array.isArray(item.series)
                    ? h(
                        "div",
                        { className: "meas-chart-box" },
                        h(MeasurementColumnChartSvg, {
                          series: item.series,
                          labels: item.seriesLabels,
                          unit: item.unit,
                          mini: false,
                          isOrange: false,
                          alertLevel: modalAlert,
                        }),
                        h(
                          "div",
                          { className: "meas-series-caption" },
                          "Column Series Values: [" + item.series.join(", ") + "]"
                        )
                      )
                    : null,
                  h(
                    "div",
                    { className: "meas-spec-grid" },
                    h(
                      "div",
                      { className: "meas-spec-cell" },
                      h("span", { className: "meas-spec-label" }, "Name of data"),
                      h("span", { className: "meas-spec-val" }, item.name)
                    ),
                    h(
                      "div",
                      { className: "meas-spec-cell" },
                      h("span", { className: "meas-spec-label" }, "Unit of Measurement"),
                      h("span", { className: "meas-spec-val" }, item.unit)
                    ),
                    h(
                      "div",
                      { className: "meas-spec-cell meas-spec-cell--full" },
                      h("span", { className: "meas-spec-label" }, "Way of representation"),
                      h("span", { className: "meas-spec-val" }, item.representation)
                    )
                  ),
                  h(
                    "div",
                    { className: "modal-actions" },
                    h(
                      "button",
                      {
                        type: "button",
                        className: "btn-primary",
                        onClick: function () {
                          setMeasModalMode(null);
                        },
                      },
                      "Close"
                    )
                  )
                )
              )
            );
          })()
        : null,
      measModalMode === "edit" && draftMeas && measurements[draftMeas.id]
        ? (function () {
            var item = measurements[draftMeas.id];
            var hasSeries = item.chartType === "line" || item.chartType === "column";
            return h(
              "div",
              {
                className: "modal-backdrop",
                role: "dialog",
                "aria-modal": "true",
                "aria-labelledby": "meas-edit-title",
                onClick: function (e) {
                  if (e.target === e.currentTarget) setMeasModalMode(null);
                },
              },
              h(
                "form",
                {
                  className: "modal-card meas-modal-card meas-modal-card--orange",
                  onSubmit: handleSaveMeasurementModal,
                },
                h(
                  "div",
                  { className: "meas-modal-header meas-modal-header--orange" },
                  h(
                    "div",
                    null,
                    h("span", { className: "meas-modal-kicker" }, "✎ EDIT DATA POINT"),
                    h("h2", { id: "meas-edit-title", className: "meas-modal-title" }, item.name)
                  ),
                  h(
                    "button",
                    {
                      type: "button",
                      className: "meas-modal-close",
                      "aria-label": "Close edit dialog",
                      onClick: function () {
                        setMeasModalMode(null);
                      },
                    },
                    "×"
                  )
                ),
                h(
                  "div",
                  { className: "meas-modal-body" },
                  h(
                    "div",
                    { className: "meas-spec-grid", style: { marginBottom: "1rem" } },
                    h(
                      "div",
                      { className: "meas-spec-cell" },
                      h("span", { className: "meas-spec-label" }, "Data Type"),
                      h("span", { className: "meas-spec-val" }, item.dataType)
                    ),
                    h(
                      "div",
                      { className: "meas-spec-cell" },
                      h("span", { className: "meas-spec-label" }, "Way of Representation"),
                      h("span", { className: "meas-spec-val" }, item.representation)
                    )
                  ),
                  h(
                    "div",
                    { className: "form-group" },
                    h(
                      "label",
                      { className: "field-label", htmlFor: "meas-edit-val" },
                      "Current Value (" + (item.unit !== "N/A" ? item.unit : item.dataType) + ")"
                    ),
                    h("input", {
                      id: "meas-edit-val",
                      type: "text",
                      className: "text-input meas-orange-input",
                      value: draftMeas.value,
                      autoFocus: true,
                      onChange: function (e) {
                        var v = e.target.value;
                        setDraftMeas(function (prev) {
                          return Object.assign({}, prev, { value: v });
                        });
                      },
                    })
                  ),
                  hasSeries
                    ? h(
                        "div",
                        { className: "form-group" },
                        h(
                          "label",
                          { className: "field-label", htmlFor: "meas-edit-series" },
                          (item.chartType === "line" ? "Line Graph" : "Column Graph") +
                            " Series Values (comma-separated numbers)"
                        ),
                        h("input", {
                          id: "meas-edit-series",
                          type: "text",
                          className: "text-input meas-orange-input",
                          value: draftMeas.seriesText,
                          onChange: function (e) {
                            var v = e.target.value;
                            setDraftMeas(function (prev) {
                              return Object.assign({}, prev, { seriesText: v });
                            });
                          },
                        })
                      )
                    : null,
                  h(
                    "div",
                    { className: "form-grid-2" },
                    h(
                      "div",
                      { className: "form-group" },
                      h("label", { className: "field-label", htmlFor: "meas-edit-unit" }, "Unit of Measurement"),
                      h("input", {
                        id: "meas-edit-unit",
                        type: "text",
                        className: "text-input meas-orange-input",
                        value: draftMeas.unit,
                        onChange: function (e) {
                          var v = e.target.value;
                          setDraftMeas(function (prev) {
                            return Object.assign({}, prev, { unit: v });
                          });
                        },
                      })
                    ),
                    h(
                      "div",
                      { className: "form-group" },
                      h("label", { className: "field-label", htmlFor: "meas-edit-thresh" }, "Trigger Threshold (Δ Condition)"),
                      h("input", {
                        id: "meas-edit-thresh",
                        type: "text",
                        className: "text-input meas-orange-input",
                        value: draftMeas.threshold,
                        onChange: function (e) {
                          var v = e.target.value;
                          setDraftMeas(function (prev) {
                            return Object.assign({}, prev, { threshold: v });
                          });
                        },
                      })
                    )
                  ),
                  h(
                    "div",
                    { className: "modal-actions" },
                    h(
                      "button",
                      {
                        type: "button",
                        className: "btn-secondary",
                        onClick: function () {
                          handleResetSingleMeasurement(item.id);
                        },
                      },
                      "Reset Default"
                    ),
                    h(
                      "button",
                      {
                        type: "button",
                        className: "btn-secondary",
                        onClick: function () {
                          setMeasModalMode(null);
                        },
                      },
                      "Cancel"
                    ),
                    h(
                      "button",
                      {
                        type: "submit",
                        className: "btn-primary meas-btn-orange",
                      },
                      "Save Data"
                    )
                  )
                )
              )
            );
          })()
        : null,
      vitalsSetupOpen
        ? h(
            "div",
            {
              className: "modal-backdrop",
              role: "dialog",
              "aria-modal": "true",
              "aria-labelledby": "vitals-setup-title",
              onClick: function (e) {
                if (e.target === e.currentTarget) setVitalsSetupOpen(false);
              },
            },
            h(
              "div",
              { className: "modal-card" },
              h(
                "div",
                { className: "modal-header" },
                h("h2", { id: "vitals-setup-title", className: "modal-title" }, "VITALS DISPLAY SETUP"),
                h(
                  "button",
                  {
                    type: "button",
                    className: "modal-close",
                    "aria-label": "Close dialog",
                    onClick: function () {
                      setVitalsSetupOpen(false);
                    },
                  },
                  "×"
                )
              ),
              h(
                "p",
                { className: "muted-subtext", style: { marginTop: 0, marginBottom: "0.75rem" } },
                "Choose which vitals to display on the Health Control Plan:"
              ),
              h(
                "div",
                { className: "vitals-setup-quick" },
                h(
                  "button",
                  {
                    type: "button",
                    className: "btn-secondary btn-small",
                    onClick: function () {
                      setAllDraftVitals(true);
                    },
                  },
                  "Select All"
                ),
                h(
                  "button",
                  {
                    type: "button",
                    className: "btn-secondary btn-small",
                    onClick: function () {
                      setAllDraftVitals(false);
                    },
                  },
                  "Clear All"
                )
              ),
              h(
                "div",
                { className: "vitals-setup-list" },
                sample.healthPlanRows.map(function (row) {
                  var checked = Boolean(draftVisibleVitals && draftVisibleVitals[row.id]);
                  return h(
                    "label",
                    { key: row.id, className: "vitals-setup-item" },
                    h(
                      "span",
                      { className: "vitals-setup-item-left" },
                      h("input", {
                        type: "checkbox",
                        checked: checked,
                        onChange: function () {
                          toggleDraftVital(row.id);
                        },
                      }),
                      h("span", null, row.vital)
                    ),
                    h("span", { className: "vitals-setup-item-val" }, row.currentValue)
                  );
                })
              ),
              h(
                "div",
                { className: "modal-actions" },
                h(
                  "button",
                  {
                    type: "button",
                    className: "btn-secondary",
                    onClick: function () {
                      setVitalsSetupOpen(false);
                    },
                  },
                  "Cancel"
                ),
                h(
                  "button",
                  {
                    type: "button",
                    className: "btn-primary",
                    onClick: saveVitalsSetup,
                  },
                  "Save"
                )
              )
            )
          )
        : null,
      testModalOpen
        ? (function () {
            var presetSpecs = MEASUREMENT_SPECS.filter(function (s) {
              return Boolean(TEST_WARNING_PRESETS[s.id]);
            }).sort(function (a, b) {
              var pa = MEASUREMENT_PRIORITY_MAP[a.id] || 99;
              var pb = MEASUREMENT_PRIORITY_MAP[b.id] || 99;
              return pa - pb;
            });
            var selectedSpecItem = measurements[testTargetId] || measurements.heart_rate;
            return h(
              "div",
              {
                className: "modal-backdrop",
                role: "dialog",
                "aria-modal": "true",
                "aria-labelledby": "test-warn-modal-title",
                onClick: function (e) {
                  if (e.target === e.currentTarget) setTestModalOpen(false);
                },
              },
              h(
                "div",
                { className: "modal-card meas-modal-card meas-test-modal-card" },
                h(
                  "div",
                  { className: "meas-modal-header meas-modal-header--blue" },
                  h(
                    "div",
                    null,
                    h("span", { className: "meas-modal-kicker" }, "DIAGNOSTIC & ALERT TESTING"),
                    h("h2", { id: "test-warn-modal-title", className: "meas-modal-title" }, "SIMULATE WARNINGS & SOS ALERTS")
                  ),
                  h(
                    "button",
                    {
                      type: "button",
                      className: "meas-modal-close",
                      "aria-label": "Close warning simulator",
                      onClick: function () {
                        setTestModalOpen(false);
                      },
                    },
                    "×"
                  )
                ),
                h(
                  "div",
                  { className: "meas-modal-body" },
                  h(
                    "p",
                    { className: "muted-subtext", style: { marginTop: 0, marginBottom: "0.85rem" } },
                    "Choose any measurement below to simulate a Yellow Warning (held for at least 5 seconds + logged to Warning Log) or a Red SOS Alert (full-screen emergency alert)."
                  ),
                  h(
                    "div",
                    { className: "meas-test-selector-box" },
                    h(
                      "div",
                      { className: "form-group", style: { marginBottom: "0.75rem" } },
                      h(
                        "label",
                        { className: "field-label", htmlFor: "test-warning-select" },
                        "1. Select Data Point to Test (Ordered by Priority)"
                      ),
                      h(
                        "select",
                        {
                          id: "test-warning-select",
                          className: "text-input",
                          value: testTargetId,
                          onChange: function (e) {
                            setTestTargetId(e.target.value);
                          },
                        },
                        presetSpecs.map(function (spec) {
                          var prio = MEASUREMENT_PRIORITY_MAP[spec.id] || 99;
                          var cur = measurements[spec.id];
                          var curLevel = getEffectiveMeasurementAlertLevel(cur);
                          var statusTag =
                            curLevel === "red"
                              ? " [ACTIVE RED SOS]"
                              : curLevel === "yellow"
                              ? " [ACTIVE YELLOW WARNING]"
                              : "";
                          return h(
                            "option",
                            { key: spec.id, value: spec.id },
                            "Priority #" + prio + " — " + spec.name + " (" + spec.unit + ")" + statusTag
                          );
                        })
                      )
                    ),
                    selectedSpecItem
                      ? h(
                          "div",
                          { className: "meas-test-selected-info" },
                          "Current Value: ",
                          h("strong", null, String(selectedSpecItem.value)),
                          " | Trigger Rule: ",
                          h("span", null, selectedSpecItem.threshold)
                        )
                      : null,
                    h(
                      "div",
                      { className: "meas-test-trigger-row" },
                      h(
                        "button",
                        {
                          type: "button",
                          className: "meas-test-btn meas-test-btn--yellow",
                          onClick: function () {
                            simulateWarningPreset(testTargetId, "yellow");
                          },
                        },
                        "⚠ DISPLAY YELLOW WARNING (" + (selectedSpecItem ? selectedSpecItem.name : "") + ")"
                      ),
                      h(
                        "button",
                        {
                          type: "button",
                          className: "meas-test-btn meas-test-btn--red",
                          onClick: function () {
                            simulateWarningPreset(testTargetId, "red");
                          },
                        },
                        "🚨 TRIGGER RED SOS ALERT (" + (selectedSpecItem ? selectedSpecItem.name : "") + ")"
                      )
                    )
                  ),
                  h(
                    "div",
                    { className: "meas-test-quick-presets" },
                    h(
                      "button",
                      {
                        type: "button",
                        className: "btn-secondary btn-small",
                        onClick: simulatePriorityWarningStack,
                      },
                      "⚡ Simulate 3 Priority-Ordered Yellow Warnings"
                    ),
                    h(
                      "button",
                      {
                        type: "button",
                        className: "btn-secondary btn-small",
                        onClick: simulateHighRadiationCascade,
                      },
                      "☢ High Radiation Cascade (Rad ↑ → Skin Temp, Suit Temp & HR ↑)"
                    ),
                    h(
                      "button",
                      {
                        type: "button",
                        className: "btn-secondary btn-small",
                        onClick: simulateCardiacArrestCascade,
                      },
                      "🛑 Cardiac Arrest (HR = 0 → ECG Flatline + BP & SpO₂ Drop)"
                    ),
                    h(
                      "button",
                      {
                        type: "button",
                        className: "btn-secondary btn-small",
                        onClick: clearAllSimulatedWarnings,
                      },
                      "↺ Reset All Vitals to Normal (Blue)"
                    )
                  ),
                  h(
                    "div",
                    { className: "meas-test-list-title" },
                    "Quick-Trigger List (All Testable Data Points by Priority):"
                  ),
                  h(
                    "div",
                    { className: "meas-test-list" },
                    presetSpecs.map(function (spec) {
                      var prio = MEASUREMENT_PRIORITY_MAP[spec.id] || 99;
                      var item = measurements[spec.id];
                      var level = getEffectiveMeasurementAlertLevel(item);
                      return h(
                        "div",
                        {
                          key: spec.id,
                          className:
                            level === "red"
                              ? "meas-test-row meas-test-row--red"
                              : level === "yellow"
                              ? "meas-test-row meas-test-row--yellow"
                              : "meas-test-row",
                        },
                        h(
                          "div",
                          { className: "meas-test-row-info" },
                          h("span", { className: "meas-test-row-prio" }, "#" + prio),
                          h("span", { className: "meas-test-row-name" }, spec.name),
                          h(
                            "span",
                            { className: "meas-test-row-val" },
                            item ? String(item.value) : ""
                          )
                        ),
                        h(
                          "div",
                          { className: "meas-test-row-btns" },
                          h(
                            "button",
                            {
                              type: "button",
                              className: "meas-test-mini-btn meas-test-mini-btn--yellow",
                              onClick: function () {
                                setTestTargetId(spec.id);
                                simulateWarningPreset(spec.id, "yellow");
                              },
                            },
                            "Yellow"
                          ),
                          h(
                            "button",
                            {
                              type: "button",
                              className: "meas-test-mini-btn meas-test-mini-btn--red",
                              onClick: function () {
                                setTestTargetId(spec.id);
                                simulateWarningPreset(spec.id, "red");
                              },
                            },
                            "Red SOS"
                          ),
                          level !== "normal"
                            ? h(
                                "button",
                                {
                                  type: "button",
                                  className: "meas-test-mini-btn meas-test-mini-btn--reset",
                                  onClick: function () {
                                    handleResetSingleMeasurement(spec.id);
                                  },
                                },
                                "Normal"
                              )
                            : null
                        )
                      );
                    })
                  ),
                  h(
                    "div",
                    { className: "modal-actions", style: { marginTop: "0.9rem" } },
                    h(
                      "button",
                      {
                        type: "button",
                        className: "btn-primary",
                        onClick: function () {
                          setTestModalOpen(false);
                        },
                      },
                      "Done"
                    )
                  )
                )
              )
            );
          })()
        : null,
      editingLog
        ? h(
            "div",
            {
              className: "modal-backdrop",
              role: "dialog",
              "aria-modal": "true",
              "aria-labelledby": "wlog-edit-modal-title",
              onClick: function (e) {
                if (e.target === e.currentTarget) setEditingLog(null);
              },
            },
            h(
              "form",
              {
                className: "modal-card meas-modal-card meas-modal-card--orange wlog-edit-modal-card",
                onSubmit: handleSaveWarningLogModal,
              },
              h(
                "div",
                { className: "meas-modal-header meas-modal-header--orange" },
                h(
                  "div",
                  null,
                  h(
                    "span",
                    { className: "meas-modal-kicker" },
                    editingLog.isNew ? "✎ ADD WARNING LOG RECORD" : "✎ EDIT WARNING LOG & RECENT DATA RECORDS"
                  ),
                  h(
                    "h2",
                    { id: "wlog-edit-modal-title", className: "meas-modal-title" },
                    editingLog.measurementName + " (" + editingLog.id + ")"
                  )
                ),
                h(
                  "button",
                  {
                    type: "button",
                    className: "meas-modal-close",
                    "aria-label": "Close warning log editor",
                    onClick: function () {
                      setEditingLog(null);
                    },
                  },
                  "×"
                )
              ),
              h(
                "div",
                { className: "meas-modal-body" },
                h(
                  "div",
                  { className: "form-grid-2" },
                  h(
                    "div",
                    { className: "form-group" },
                    h("label", { className: "field-label", htmlFor: "wlog-spec-select" }, "Parameter / Data Point"),
                    h(
                      "select",
                      {
                        id: "wlog-spec-select",
                        className: "text-input meas-orange-input",
                        value: editingLog.specId,
                        onChange: function (e) {
                          var newId = e.target.value;
                          var foundSpec = MEASUREMENT_SPECS.find(function (s) {
                            return s.id === newId;
                          });
                          setEditingLog(function (prev) {
                            return Object.assign({}, prev, {
                              specId: newId,
                              measurementName: foundSpec ? foundSpec.name : prev.measurementName,
                              unit: foundSpec ? foundSpec.unit : prev.unit,
                              thresholdRule: foundSpec ? foundSpec.threshold : prev.thresholdRule,
                              priorityText: String(MEASUREMENT_PRIORITY_MAP[newId] || prev.priorityText),
                            });
                          });
                        },
                      },
                      MEASUREMENT_SPECS.map(function (s, idx) {
                        return h("option", { key: s.id, value: s.id }, "#" + (idx + 1) + " — " + s.name + " (" + s.unit + ")");
                      })
                    )
                  ),
                  h(
                    "div",
                    { className: "form-group" },
                    h("label", { className: "field-label", htmlFor: "wlog-severity-select" }, "Warning Severity"),
                    h(
                      "select",
                      {
                        id: "wlog-severity-select",
                        className: "text-input meas-orange-input",
                        value: editingLog.severity,
                        onChange: function (e) {
                          var v = e.target.value;
                          setEditingLog(function (prev) {
                            return Object.assign({}, prev, { severity: v });
                          });
                        },
                      },
                      h("option", { value: "yellow" }, "⚠ Yellow Warning (Concerning Change)"),
                      h("option", { value: "red" }, "🚨 Red SOS Alert (Dangerous / Critical)")
                    )
                  )
                ),
                h(
                  "div",
                  { className: "form-grid-2" },
                  h(
                    "div",
                    { className: "form-group" },
                    h("label", { className: "field-label", htmlFor: "wlog-trigger-val" }, "Triggered Value"),
                    h("input", {
                      id: "wlog-trigger-val",
                      type: "text",
                      className: "text-input meas-orange-input",
                      value: editingLog.triggerValue,
                      onChange: function (e) {
                        var v = e.target.value;
                        setEditingLog(function (prev) {
                          return Object.assign({}, prev, { triggerValue: v });
                        });
                      },
                    })
                  ),
                  h(
                    "div",
                    { className: "form-group" },
                    h("label", { className: "field-label", htmlFor: "wlog-status-select" }, "Analysis Review Status"),
                    h(
                      "select",
                      {
                        id: "wlog-status-select",
                        className: "text-input meas-orange-input",
                        value: editingLog.status,
                        onChange: function (e) {
                          var v = e.target.value;
                          setEditingLog(function (prev) {
                            return Object.assign({}, prev, { status: v });
                          });
                        },
                      },
                      h("option", { value: "Active / Under Review" }, "Active / Under Review"),
                      h("option", { value: "Warning — Additional Critical Event" }, "Warning — Additional Critical Event"),
                      h("option", { value: "Under Review" }, "Under Review"),
                      h("option", { value: "Monitoring" }, "Monitoring"),
                      h("option", { value: "Resolved — Countermeasure Applied" }, "Resolved — Countermeasure Applied"),
                      h("option", { value: "Escalated to Flight Surgeon" }, "Escalated to Flight Surgeon"),
                      h("option", { value: "Critical — SOS Triggered" }, "Critical — SOS Triggered"),
                      h("option", { value: "False Positive / Sensor Drift" }, "False Positive / Sensor Drift")
                    )
                  )
                ),
                h(
                  "div",
                  { className: "form-grid-2" },
                  h(
                    "div",
                    { className: "form-group" },
                    h("label", { className: "field-label", htmlFor: "wlog-timestamp" }, "Timestamp"),
                    h("input", {
                      id: "wlog-timestamp",
                      type: "text",
                      className: "text-input meas-orange-input",
                      value: editingLog.timestamp,
                      onChange: function (e) {
                        var v = e.target.value;
                        setEditingLog(function (prev) {
                          return Object.assign({}, prev, { timestamp: v });
                        });
                      },
                    })
                  ),
                  h(
                    "div",
                    { className: "form-group" },
                    h("label", { className: "field-label", htmlFor: "wlog-sol" }, "Mission Sol"),
                    h("input", {
                      id: "wlog-sol",
                      type: "number",
                      className: "text-input meas-orange-input",
                      value: editingLog.solText,
                      onChange: function (e) {
                        var v = e.target.value;
                        setEditingLog(function (prev) {
                          return Object.assign({}, prev, { solText: v });
                        });
                      },
                    })
                  )
                ),
                h(
                  "div",
                  { className: "form-group" },
                  h("label", { className: "field-label", htmlFor: "wlog-reason" }, "Trigger Reason & Description"),
                  h("input", {
                    id: "wlog-reason",
                    type: "text",
                    className: "text-input meas-orange-input",
                    value: editingLog.reason,
                    onChange: function (e) {
                      var v = e.target.value;
                      setEditingLog(function (prev) {
                        return Object.assign({}, prev, { reason: v });
                      });
                    },
                  })
                ),
                h(
                  "div",
                  { className: "form-group" },
                  h(
                    "label",
                    { className: "field-label", htmlFor: "wlog-countermeasures" },
                    "Possible Countermeasures & Recommended Action Protocol"
                  ),
                  h("textarea", {
                    id: "wlog-countermeasures",
                    rows: 2,
                    className: "text-input meas-orange-input",
                    style: { resize: "vertical", minHeight: "3.2rem" },
                    value: editingLog.countermeasures || "",
                    onChange: function (e) {
                      var v = e.target.value;
                      setEditingLog(function (prev) {
                        return Object.assign({}, prev, { countermeasures: v });
                      });
                    },
                  })
                ),
                h(
                  "div",
                  { className: "form-group" },
                  h(
                    "label",
                    { className: "field-label", htmlFor: "wlog-recent-records" },
                    "Recent Data Records Around Warning (comma-separated values leading up to trigger)"
                  ),
                  h("input", {
                    id: "wlog-recent-records",
                    type: "text",
                    className: "text-input meas-orange-input",
                    value: editingLog.recentRecordsText,
                    onChange: function (e) {
                      var v = e.target.value;
                      setEditingLog(function (prev) {
                        return Object.assign({}, prev, { recentRecordsText: v });
                      });
                    },
                  })
                ),
                h(
                  "div",
                  { className: "form-grid-2" },
                  h(
                    "div",
                    { className: "form-group" },
                    h(
                      "label",
                      { className: "field-label", htmlFor: "wlog-recent-labels" },
                      "Time Labels for Recent Records (comma-separated)"
                    ),
                    h("input", {
                      id: "wlog-recent-labels",
                      type: "text",
                      className: "text-input meas-orange-input",
                      value: editingLog.recentLabelsText,
                      onChange: function (e) {
                        var v = e.target.value;
                        setEditingLog(function (prev) {
                          return Object.assign({}, prev, { recentLabelsText: v });
                        });
                      },
                    })
                  ),
                  h(
                    "div",
                    { className: "form-group" },
                    h(
                      "label",
                      { className: "field-label", htmlFor: "wlog-concurrent" },
                      "Concurrent Vitals Snapshot"
                    ),
                    h("input", {
                      id: "wlog-concurrent",
                      type: "text",
                      className: "text-input meas-orange-input",
                      value: editingLog.concurrentSnapshot,
                      onChange: function (e) {
                        var v = e.target.value;
                        setEditingLog(function (prev) {
                          return Object.assign({}, prev, { concurrentSnapshot: v });
                        });
                      },
                    })
                  )
                ),
                h(
                  "div",
                  { className: "form-group" },
                  h(
                    "label",
                    { className: "field-label", htmlFor: "wlog-notes" },
                    "Clinical & Engineering Analysis Notes"
                  ),
                  h("textarea", {
                    id: "wlog-notes",
                    rows: 3,
                    className: "text-input meas-orange-input",
                    style: { resize: "vertical", minHeight: "4.2rem" },
                    value: editingLog.analysisNotes,
                    onChange: function (e) {
                      var v = e.target.value;
                      setEditingLog(function (prev) {
                        return Object.assign({}, prev, { analysisNotes: v });
                      });
                    },
                  })
                ),
                h(
                  "div",
                  { className: "modal-actions" },
                  !editingLog.isNew
                    ? h(
                        "button",
                        {
                          type: "button",
                          className:
                            String(confirmDeleteWlogId) === String(editingLog.id)
                              ? "btn-secondary wlog-modal-btn--confirm-delete"
                              : "btn-secondary",
                          onClick: function () {
                            requestDeleteWarningLog(editingLog.id);
                          },
                        },
                        String(confirmDeleteWlogId) === String(editingLog.id)
                          ? "⚠ Press Again to Confirm Delete"
                          : "Delete Entry"
                      )
                    : null,
                  h(
                    "button",
                    {
                      type: "button",
                      className: "btn-secondary",
                      onClick: function () {
                        setEditingLog(null);
                      },
                    },
                    "Cancel"
                  ),
                  h(
                    "button",
                    {
                      type: "submit",
                      className: "btn-primary meas-btn-orange",
                    },
                    "Save Warning Log"
                  )
                )
              )
            )
          )
        : null
    );
  }

  function App() {
    var _initial = useState(loadInitialState);
    var crewState = _initial[0];
    var setCrewState = _initial[1];

    var _view = useState("login");
    var view = _view[0];
    var setView = _view[1];

    var _setupReturnView = useState("login");
    var setupReturnView = _setupReturnView[0];
    var setSetupReturnView = _setupReturnView[1];

    var _activeSelection = useState(null);
    var activeSelection = _activeSelection[0];
    var setActiveSelection = _activeSelection[1];

    var _addModalTarget = useState({ open: false, slotIndex: null });
    var addModalTarget = _addModalTarget[0];
    var setAddModalTarget = _addModalTarget[1];

    useEffect(
      function () {
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(crewState));
        } catch (_err) {
          // Ignore storage quota errors in restricted browsing modes.
        }
      },
      [crewState]
    );

    useEffect(function () {
      var active = true;
      fetchApiJson("/api/profile/crew_1")
        .then(function (profile) {
          if (!active || !profile) return;
          var normalized = normalizeAstronautProfile(profile, 0);
          setCrewState(function (prev) {
            var demoIndex = prev.slots.findIndex(function (slot) {
              return slot && slot.astronaut_id === "crew_1";
            });
            if (demoIndex !== -1) {
              var updatedSlots = prev.slots.slice();
              updatedSlots[demoIndex] = normalized;
              return { slotCount: prev.slotCount, slots: updatedSlots };
            }
            if (prev.slots.some(Boolean)) return prev;
            return { slotCount: 1, slots: [normalized] };
          });
        })
        .catch(function (error) {
          if (!active) return;
          console.error("Could not load the demo crew profile from the API.", error);
          setCrewState(function (prev) {
            return prev.slots.some(Boolean)
              ? prev
              : { slotCount: 1, slots: [normalizeAstronautProfile(SAMPLE_CLOUD_ASTRONAUT_ELENA, 0)] };
          });
        });
      return function () {
        active = false;
      };
    }, []);

    function handleAddAstronaut(newAstro) {
      var nextSlots = crewState.slots.slice();
      var nextCount = crewState.slotCount;
      var target = addModalTarget.slotIndex;

      if (target !== null && target >= 0 && target < nextSlots.length) {
        nextSlots[target] = newAstro;
      } else {
        var firstEmpty = nextSlots.findIndex(function (item) {
          return !item;
        });
        if (firstEmpty !== -1) {
          nextSlots[firstEmpty] = newAstro;
        } else if (nextCount < MAX_SLOTS) {
          nextSlots.push(newAstro);
          nextCount = nextSlots.length;
        } else {
          nextSlots[nextSlots.length - 1] = newAstro;
        }
      }

      setCrewState({
        slotCount: nextCount,
        slots: nextSlots,
      });
      var cloudCfg = loadCloudConfig();
      if (cloudCfg.autoConnect !== false && nextSlots.some(Boolean)) {
        AHSCloudService.syncAllProfiles(cloudCfg, nextSlots).catch(function () {});
      }
      setAddModalTarget({ open: false, slotIndex: null });
    }

    function openSetupFrom(origin) {
      setSetupReturnView(origin);
      setView("setup");
    }

    function handleSaveSetup(nextCount, nextSlots) {
      setCrewState({
        slotCount: nextCount,
        slots: nextSlots,
      });
      var cloudCfg = loadCloudConfig();
      if (cloudCfg.autoConnect !== false && Array.isArray(nextSlots) && nextSlots.some(Boolean)) {
        AHSCloudService.syncAllProfiles(cloudCfg, nextSlots).catch(function () {});
      }
      if (
        setupReturnView === "dashboard" &&
        activeSelection &&
        activeSelection.slotIndex < nextSlots.length &&
        nextSlots[activeSelection.slotIndex]
      ) {
        setActiveSelection({
          astronaut: nextSlots[activeSelection.slotIndex],
          slotIndex: activeSelection.slotIndex,
        });
        setView("dashboard");
      } else {
        setActiveSelection(null);
        setView("login");
      }
    }

    if (view === "setup") {
      return h(SetupScreen, {
        slotCount: crewState.slotCount,
        slots: crewState.slots,
        onSave: handleSaveSetup,
        onCancel: function () {
          setView(setupReturnView === "dashboard" && activeSelection ? "dashboard" : "login");
        },
      });
    }

    if (view === "dashboard" && activeSelection) {
      return h(DashboardScreen, {
        astronaut: activeSelection.astronaut,
        slotIndex: activeSelection.slotIndex,
        onOpenSetup: function () {
          openSetupFrom("dashboard");
        },
        onExit: function () {
          setActiveSelection(null);
          setView("login");
        },
      });
    }

    return h(
      React.Fragment,
      null,
      h(LoginScreen, {
        slots: crewState.slots,
        onSelectAstronaut: function (astro, idx) {
          setActiveSelection({ astronaut: astro, slotIndex: idx });
          setView("dashboard");
        },
        onOpenAddModal: function (slotIndex) {
          setAddModalTarget({ open: true, slotIndex: slotIndex });
        },
        onOpenSetup: function () {
          openSetupFrom("login");
        },
      }),
      addModalTarget.open
        ? h(AddAstronautModal, {
            targetIndex: addModalTarget.slotIndex,
            onClose: function () {
              setAddModalTarget({ open: false, slotIndex: null });
            },
            onSubmit: handleAddAstronaut,
          })
        : null
    );
  }

  var rootElement = document.getElementById("root");
  if (ReactDOM.createRoot) {
    ReactDOM.createRoot(rootElement).render(h(App));
  } else {
    ReactDOM.render(h(App), rootElement);
  }
})();

