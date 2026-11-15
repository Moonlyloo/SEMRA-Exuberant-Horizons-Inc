(function () {
  const h = React.createElement;
  const { useState, useEffect } = React;

  const STORAGE_KEY = "ahs_crew_state_v2";
  const GCLOUD_CONFIG_STORAGE_KEY = "ahs_gcloud_config_v1";
  const MIN_SLOTS = 0;
  const MAX_SLOTS = 24;
  const DEFAULT_SLOT_COUNT = 0;
  const GENDER_OPTIONS = ["", "Female", "Male", "Non-binary", "Other"];
  const BLOOD_TYPE_OPTIONS = ["", "O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"];

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
      slotCount: DEFAULT_SLOT_COUNT,
      slots: createDefaultSlots(DEFAULT_SLOT_COUNT),
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

    var sample = getAstronautSampleData(astronaut, slotIndex);
    var selectedPart = selectedPartId ? sample.bodyParts[selectedPartId] : null;
    var displayName = getAstronautFullName(astronaut) || "Name Surname";
    var missionDay = (astronaut && astronaut.missionDay) || 142;
    var filteredHealthPlanRows = sample.healthPlanRows.filter(function (row) {
      return Boolean(visibleVitals[row.id]);
    });

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
      setAlertCountdown(20);
      setAlertActive(true);
    }

    function closeAlertScreen() {
      setAlertActive(false);
    }

    function openDiagnosticScreen() {
      setAlertActive(false);
      setDiagnosticActive(true);
    }

    function closeDiagnosticScreen() {
      setDiagnosticActive(false);
    }

    var tabs = [
      { id: "dashboard", label: "Dashboard" },
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
                  setAlertActive(false);
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
                  setEnvMode(e.target.value);
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
                h("h1", { className: "dash-alert-title" }, "HEALTH ALERT!")
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
                    h("h2", { className: "dash-alert-subtitle" }, "CRITICAL VITALS DETECTED"),
                    h(
                      "div",
                      { className: "dash-alert-vitals-list" },
                      sample.alertData.badVitals.map(function (item, idx) {
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
                    h("h2", { className: "dash-alert-subtitle" }, "EMERGENCY INSTRUCTIONS"),
                    h(
                      "div",
                      { className: "dash-alert-instructions" },
                      sample.alertData.instructions.map(function (line, idx) {
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
                      h("h2", { className: "dash-box-heading" }, "Spaceship Status"),
                      h("div", { className: "dash-stat-line" }, "Temperature: " + sample.spaceship.temperature),
                      h("div", { className: "dash-stat-line" }, "CO2 level: " + sample.spaceship.co2Level),
                      h("div", { className: "dash-stat-line" }, "Radiation Level: " + sample.spaceship.radiationLevel),
                      h("div", { className: "dash-stat-line" }, "Inner Pressure: " + sample.spaceship.innerPressure),
                      h("div", { className: "dash-stat-line" }, "Upper Pressure: " + sample.spaceship.upperPressure),
                      h("div", { className: "dash-stat-line" }, "Lower Pressure: " + sample.spaceship.lowerPressure)
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
                    activeTab === "ground-control"
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
                            "TEST ALERT"
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
      var cfg = loadCloudConfig();
      if (cfg.autoConnect === false) {
        return function () {
          active = false;
        };
      }
      AHSCloudService.autoConnect(cfg, crewState.slots)
        .then(function (result) {
          if (!active || !result || !Array.isArray(result.profiles) || result.profiles.length === 0) {
            return;
          }
          setCrewState(function (prev) {
            var hasLocalSlots = prev.slots.some(Boolean);
            if (result.source !== "firestore" && hasLocalSlots) {
              return prev;
            }
            var clamped = Math.min(MAX_SLOTS, Math.max(result.profiles.length, prev.slotCount));
            var nextSlots = Array.from({ length: clamped }, function (_, idx) {
              return result.profiles[idx] || prev.slots[idx] || null;
            });
            return {
              slotCount: clamped,
              slots: nextSlots,
            };
          });
        })
        .catch(function () {});
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

