require("dotenv").config();

const express = require("express");
const mqtt = require("mqtt");
const { MongoClient } = require("mongodb");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const app = express();
app.use(express.json());

// Allow the React dev server (port 5173) to call this API
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const PORT = process.env.PORT || 3000;
const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || "mqtt://localhost:1883";
const MQTT_TOPIC = process.env.MQTT_TOPIC || "smartbag/sensors";
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || "smartbag_db";
const COLLECTION_NAME = process.env.COLLECTION_NAME || "sensor_readings";
const USERS_COLLECTION_NAME = process.env.USERS_COLLECTION_NAME || "users";
const RIDERS_COLLECTION_NAME = process.env.RIDERS_COLLECTION_NAME || "riders";
const ROUTES_COLLECTION_NAME = process.env.ROUTES_COLLECTION_NAME || "routes";
const JWT_SECRET = process.env.JWT_SECRET || "change-me-in-production";
const JWT_EXPIRES_IN = "1d";
const XAI_API_KEY = process.env.XAI_API_KEY || "";
const XAI_API_BASE_URL = process.env.XAI_API_BASE_URL || "https://api.x.ai/v1";
const XAI_MODEL = process.env.XAI_MODEL || "grok-3-mini";
const AUTH_BOOTSTRAP_USERNAME = process.env.AUTH_BOOTSTRAP_USERNAME || "admin";
const AUTH_BOOTSTRAP_PASSWORD = process.env.AUTH_BOOTSTRAP_PASSWORD || "admin123";
const AUTH_BOOTSTRAP_ROLE = process.env.AUTH_BOOTSTRAP_ROLE || "admin";
// Analog thresholds: value < threshold → wet/leak detected
const HOT_THRESHOLD  = Number(process.env.HOT_THRESHOLD  || 2500);
const COLD_THRESHOLD = Number(process.env.COLD_THRESHOLD || 2500);
// Keep legacy names so isWetReading() still compiles
const RAIN_DRY_THRESHOLD  = 3500;
const RAIN_DAMP_THRESHOLD = 2500;

if (!MONGODB_URI) {
  console.error("Missing MONGODB_URI in .env");
  process.exit(1);
}

let mongoClient;
let collection;
let usersCollection;
let ridersCollection;
let routesCollection;

const SAMPLE_RIDERS = [
  { id: "R1", name: "Nimal", phone: "0771234567", status: "active" },
  { id: "R2", name: "Kamal", phone: "0777654321", status: "active" },
  { id: "R3", name: "Saman", phone: "0714455667", status: "active" },
  { id: "R4", name: "Chathura", phone: "0753344556", status: "active" },
  { id: "R5", name: "Ravindu", phone: "0769988776", status: "inactive" },
];

const SAMPLE_ROUTES = [
  { id: "RT1", name: "Colombo → Battaramulla", startLocation: "Colombo", endLocation: "Battaramulla" },
  { id: "RT2", name: "Colombo → Malabe", startLocation: "Colombo", endLocation: "Malabe" },
  { id: "RT3", name: "Colombo → Maharagama", startLocation: "Colombo", endLocation: "Maharagama" },
  { id: "RT4", name: "Nugegoda → Dehiwala", startLocation: "Nugegoda", endLocation: "Dehiwala" },
  { id: "RT5", name: "Kottawa → Colombo Fort", startLocation: "Kottawa", endLocation: "Colombo Fort" },
];

// In-memory map of the most-recently-seen bag IDs (used by /api/bags to survive a page refresh)
const lastSeenBagIds = new Set();

// ── Delivery ID generation ────────────────────────────────────────────────────
// Format: DELIVERY_YYYYMMDD_NNN  (counter resets each day; restarts at 001 on server restart)
const _deliveryDayCounter = { date: "", count: 0 };

function generateDeliveryId() {
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, ""); // e.g. "20260419"
  if (_deliveryDayCounter.date !== today) {
    _deliveryDayCounter.date = today;
    _deliveryDayCounter.count = 0;
  }
  _deliveryDayCounter.count += 1;
  return `DELIVERY_${today}_${String(_deliveryDayCounter.count).padStart(3, "0")}`;
}

function toBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "true" || normalized === "1" || normalized === "yes";
  }
  return false;
}

function toNumberOrUndefined(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "number") return Number.isNaN(value) ? undefined : value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}

function isWetReading(value) {
  if (value === undefined || value === null) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["wet", "rain", "raining", "water", "detected", "true", "1", "yes"].includes(normalized)) {
      return true;
    }
    if (["dry", "clear", "false", "0", "no", "not_detected"].includes(normalized)) {
      return false;
    }
  }
  const numericValue = toNumberOrUndefined(value);
  if (numericValue !== undefined) {
    // Typical analog rain sensors: lower value means wetter (e.g., dry ~4095, wet ~0-500)
    return numericValue <= RAIN_WET_THRESHOLD;
  }
  return toBoolean(value);
}

function isAnalogWet(value) {
  const numericValue = toNumberOrUndefined(value);
  if (numericValue === undefined) return false;
  return numericValue <= RAIN_DAMP_THRESHOLD;
}

function classifyRainAnalog(value) {
  const numericValue = toNumberOrUndefined(value);
  if (numericValue === undefined) {
    return { status: "Unknown", wet: false };
  }

  if (numericValue > RAIN_DRY_THRESHOLD) {
    return { status: "Dry", wet: false };
  }

  if (numericValue > RAIN_DAMP_THRESHOLD) {
    return { status: "Light rain / Damp", wet: false };
  }

  return { status: "Heavy rain / Wet", wet: true };
}

function isWetStatusLabel(value) {
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return normalized.includes("heavy rain") || normalized.includes("wet");
}

function normalizeSensorRole(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function extractAllSensorIds(getValue) {
  let hotTempSensorId = getValue("hotTempSensorId", "hot_temp_sensor_id");
  let coldTempSensorId = getValue("coldTempSensorId", "cold_temp_sensor_id");
  let hotLeakSensorId = getValue("hotLeakSensorId", "hot_leak_sensor_id", "hotSensorId", "hot_sensor_id");
  let coldLeakSensorId = getValue("coldLeakSensorId", "cold_leak_sensor_id", "coldSensorId", "cold_sensor_id");
  let reedSensorId = getValue("reedSensorId", "reed_sensor_id", "lidSensorId", "lid_sensor_id");
  let tiltSensorId = getValue("tiltSensorId", "tilt_sensor_id");

  const sensorContainer = getValue(
    "sensorReadings",
    "sensor_readings",
    "leakSensors",
    "leak_sensors",
    "sensors",
    "sensors_data"
  );

  const applyEntry = (entry, fallbackRole) => {
    if (!entry || typeof entry !== "object") return;

    const role = normalizeSensorRole(
      entry.sensorRole ?? entry.sensor_role ?? entry.role ?? entry.type ?? fallbackRole
    );
    const sensorId =
      entry.sensorId ?? entry.sensor_id ?? entry.id ?? entry.name ?? entry.channelId ?? entry.channel_id;
    if (sensorId === undefined || sensorId === null) return;

    if (["hot_temp", "temp_hot", "temperature_hot"].includes(role)) {
      hotTempSensorId = sensorId;
      return;
    }
    if (["cold_temp", "temp_cold", "temperature_cold"].includes(role)) {
      coldTempSensorId = sensorId;
      return;
    }
    if (["hot_leak", "hot", "hot_compartment", "rain_hot", "leak_hot"].includes(role)) {
      hotLeakSensorId = sensorId;
      return;
    }
    if (["cold_leak", "cold", "cold_compartment", "rain_cold", "leak_cold"].includes(role)) {
      coldLeakSensorId = sensorId;
      return;
    }
    if (["lid", "reed", "reed_switch", "magnet", "lid_switch"].includes(role)) {
      reedSensorId = sensorId;
      return;
    }
    if (["tilt", "imu_tilt", "tilt_angle"].includes(role)) {
      tiltSensorId = sensorId;
    }
  };

  if (Array.isArray(sensorContainer)) {
    for (const entry of sensorContainer) applyEntry(entry, undefined);
  } else if (sensorContainer && typeof sensorContainer === "object") {
    if (Array.isArray(sensorContainer.items)) {
      for (const entry of sensorContainer.items) applyEntry(entry, undefined);
    }
    for (const [key, value] of Object.entries(sensorContainer)) {
      applyEntry(value, key);
    }
  }

  return {
    hotTempSensorId: hotTempSensorId !== undefined && hotTempSensorId !== null ? String(hotTempSensorId) : undefined,
    coldTempSensorId: coldTempSensorId !== undefined && coldTempSensorId !== null ? String(coldTempSensorId) : undefined,
    hotLeakSensorId: hotLeakSensorId !== undefined && hotLeakSensorId !== null ? String(hotLeakSensorId) : undefined,
    coldLeakSensorId: coldLeakSensorId !== undefined && coldLeakSensorId !== null ? String(coldLeakSensorId) : undefined,
    reedSensorId: reedSensorId !== undefined && reedSensorId !== null ? String(reedSensorId) : undefined,
    tiltSensorId: tiltSensorId !== undefined && tiltSensorId !== null ? String(tiltSensorId) : undefined,
  };
}

function extractCompartmentLeakInputs(getValue) {
  let hotSensorId = getValue("hotLeakSensorId", "hot_leak_sensor_id", "hotSensorId", "hot_sensor_id");
  let coldSensorId = getValue("coldLeakSensorId", "cold_leak_sensor_id", "coldSensorId", "cold_sensor_id");

  let hotAnalogValue = toNumberOrUndefined(
    getValue("rainValue1", "rain_value1", "rainValue", "rain_value", "rainvalue")
  );
  let coldAnalogValue = toNumberOrUndefined(
    getValue("rainValue2", "rain_value2", "rainvalue2")
  );

  const sensorContainer = getValue(
    "sensorReadings",
    "sensor_readings",
    "leakSensors",
    "leak_sensors",
    "sensors",
    "sensors_data"
  );

  const applyEntry = (entry, fallbackRole) => {
    if (!entry || typeof entry !== "object") return;

    const role = normalizeSensorRole(
      entry.sensorRole ?? entry.sensor_role ?? entry.role ?? entry.type ?? fallbackRole
    );
    const sensorId =
      entry.sensorId ?? entry.sensor_id ?? entry.id ?? entry.name ?? entry.channelId ?? entry.channel_id;
    const analogValue = toNumberOrUndefined(
      entry.analogValue ?? entry.analog_value ?? entry.value ?? entry.reading ?? entry.raw ?? entry.rainValue
    );

    if (["hot_leak", "hot", "hot_compartment", "rain_hot", "leak_hot"].includes(role)) {
      if (analogValue !== undefined) hotAnalogValue = analogValue;
      if (sensorId !== undefined && sensorId !== null) hotSensorId = sensorId;
      return;
    }

    if (["cold_leak", "cold", "cold_compartment", "rain_cold", "leak_cold"].includes(role)) {
      if (analogValue !== undefined) coldAnalogValue = analogValue;
      if (sensorId !== undefined && sensorId !== null) coldSensorId = sensorId;
    }
  };

  if (Array.isArray(sensorContainer)) {
    for (const entry of sensorContainer) applyEntry(entry, undefined);
  } else if (sensorContainer && typeof sensorContainer === "object") {
    if (Array.isArray(sensorContainer.items)) {
      for (const entry of sensorContainer.items) applyEntry(entry, undefined);
    }
    for (const [key, value] of Object.entries(sensorContainer)) {
      applyEntry(value, key);
    }
  }

  return {
    hotSensorId: hotSensorId !== undefined && hotSensorId !== null ? String(hotSensorId) : undefined,
    coldSensorId: coldSensorId !== undefined && coldSensorId !== null ? String(coldSensorId) : undefined,
    hotAnalogValue,
    coldAnalogValue,
  };
}

async function ensureUserCollection() {
  await usersCollection.createIndex({ username: 1 }, { unique: true });
}

async function ensureRiderCollection() {
  await ridersCollection.createIndex({ id: 1 }, { unique: true });
}

async function ensureRouteCollection() {
  await routesCollection.createIndex({ id: 1 }, { unique: true });
}

async function ensureSensorCollectionIndexes() {
  await collection.createIndex({ receivedAt: -1 });
  await collection.createIndex({ bagId: 1, receivedAt: -1 });
  await collection.createIndex({ deliveryStartTime: 1 });
  await collection.createIndex({ deliveryId: 1 });          // fast lookup by session
  await collection.createIndex({ riderId: 1, receivedAt: -1 });
  await collection.createIndex({ routeId: 1, receivedAt: -1 });
}

async function ensureBootstrapRiders() {
  const existingCount = await ridersCollection.estimatedDocumentCount();
  if (existingCount > 0) return;

  const now = new Date();
  await ridersCollection.insertMany(
    SAMPLE_RIDERS.map((rider) => ({ ...rider, createdAt: now, updatedAt: now }))
  );
}

async function ensureBootstrapRoutes() {
  const existingCount = await routesCollection.estimatedDocumentCount();
  if (existingCount > 0) return;

  const now = new Date();
  await routesCollection.insertMany(
    SAMPLE_ROUTES.map((route) => ({ ...route, createdAt: now, updatedAt: now }))
  );
}

async function ensureBootstrapUser() {
  const existingCount = await usersCollection.estimatedDocumentCount();
  if (existingCount > 0) {
    return;
  }

  const hashedPassword = await bcrypt.hash(AUTH_BOOTSTRAP_PASSWORD, 10);
  await usersCollection.insertOne({
    username: AUTH_BOOTSTRAP_USERNAME,
    password: hashedPassword,
    role: AUTH_BOOTSTRAP_ROLE,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  console.warn(
    `Bootstrap user created: ${AUTH_BOOTSTRAP_USERNAME} (please rotate password via DB/environment)`
  );
}

// Connect MongoDB Atlas
async function connectMongo() {
  try {
    mongoClient = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000
    });

    await mongoClient.connect();
    console.log("Connected to MongoDB Atlas");

    const db = mongoClient.db(DB_NAME);
    collection = db.collection(COLLECTION_NAME);
    usersCollection = db.collection(USERS_COLLECTION_NAME);
    ridersCollection = db.collection(RIDERS_COLLECTION_NAME);
    routesCollection = db.collection(ROUTES_COLLECTION_NAME);

    // Optional test
    await db.command({ ping: 1 });
    console.log("MongoDB ping successful");

    await ensureSensorCollectionIndexes();
    await ensureUserCollection();
    await ensureRiderCollection();
    await ensureRouteCollection();
    await ensureBootstrapUser();
    await ensureBootstrapRiders();
    await ensureBootstrapRoutes();
  } catch (error) {
    console.error("MongoDB connection error:");
    console.error(error);
    process.exit(1);
  }
}

// Connect MQTT
function connectMQTT() {
  const mqttClient = mqtt.connect(MQTT_BROKER_URL);

  mqttClient.on("connect", () => {
    console.log("Connected to MQTT broker");

    mqttClient.subscribe(MQTT_TOPIC, (err) => {
      if (err) {
        console.error("MQTT subscribe error:", err);
      } else {
        console.log(`Subscribed to topic: ${MQTT_TOPIC}`);
      }
    });
  });

  mqttClient.on("message", async (topic, message) => {
    try {
      if (!collection) {
        console.error("MongoDB collection not ready yet");
        return;
      }

      const payloadString = message.toString();
      console.log("Received MQTT message:", payloadString);

      const data = JSON.parse(payloadString);

      // Resolve the bagId from the payload so we can look up delivery state
      const incomingBagId = (
        data.bagId || data.bag_id || data.deviceId || data.device_id || ""
      ).toString().trim();
      const deviceId = incomingBagId || "UNKNOWN";

      // Track bag IDs seen this session so /api/bags remains accurate after refresh
      lastSeenBagIds.add(deviceId);

      // Resolve current delivery session for this device
      const session = deliveryState.get(incomingBagId) || {
        deliveryId: null,
        status: "IDLE",
        startTime: null,
        endTime: null,
        riderId: null,
        riderName: null,
        routeId: null,
        routeName: null,
        routeStartLocation: null,
        routeEndLocation: null,
      };

      const sessionStartTime =
        session.startTime instanceof Date
          ? session.startTime
          : session.startTime
            ? new Date(session.startTime)
            : null;

      const sessionEndTime =
        session.endTime instanceof Date
          ? session.endTime
          : session.endTime
            ? new Date(session.endTime)
            : null;

      // Normalise bag-open state: magnet detected = bag closed, so lidOpen = !magnetDetected
      const magnetDetected = data.magnetDetected !== undefined ? toBoolean(data.magnetDetected) : null;
      const lidOpen =
        magnetDetected !== null
          ? !magnetDetected
          : data.lidOpen !== undefined
            ? toBoolean(data.lidOpen)
            : false;

      const payloadValue = (...keys) => {
        for (const key of keys) {
          if (data[key] !== undefined && data[key] !== null) return data[key];
        }
        return undefined;
      };

      // Leak detection by compartment (strict analog-only).
      // HOT  -> rainValue, COLD -> rainValue2
      let {
        hotSensorId,
        coldSensorId,
        hotAnalogValue,
        coldAnalogValue,
      } = extractCompartmentLeakInputs(payloadValue);
      const allSensorIds = extractAllSensorIds(payloadValue);

      const payloadSensorReadings = payloadValue("sensorReadings", "sensor_readings");
      const payloadSensors = Array.isArray(payloadSensorReadings) ? payloadSensorReadings : [];
      const hotLeakEntry = payloadSensors.find(
        (entry) => normalizeSensorRole(entry?.sensorRole ?? entry?.sensor_role ?? entry?.role ?? entry?.type) === "hot_leak"
      );
      const coldLeakEntry = payloadSensors.find(
        (entry) => normalizeSensorRole(entry?.sensorRole ?? entry?.sensor_role ?? entry?.role ?? entry?.type) === "cold_leak"
      );

      if (!hotSensorId && hotLeakEntry?.sensorId) hotSensorId = String(hotLeakEntry.sensorId);
      if (!coldSensorId && coldLeakEntry?.sensorId) coldSensorId = String(coldLeakEntry.sensorId);
      if (hotAnalogValue === undefined) {
        hotAnalogValue = toNumberOrUndefined(
          hotLeakEntry?.analogValue ?? hotLeakEntry?.analog_value ?? hotLeakEntry?.value ?? hotLeakEntry?.reading
        );
      }
      if (coldAnalogValue === undefined) {
        coldAnalogValue = toNumberOrUndefined(
          coldLeakEntry?.analogValue ?? coldLeakEntry?.analog_value ?? coldLeakEntry?.value ?? coldLeakEntry?.reading
        );
      }
      const hotRawValue = hotAnalogValue ?? 4095;
      const coldRawValue = coldAnalogValue ?? 4095;
      const hotLeakDetected = hotRawValue < HOT_THRESHOLD;
      const coldLeakDetected = coldRawValue < COLD_THRESHOLD;
      const hotRainClass  = classifyRainAnalog(hotRawValue);
      const coldRainClass = classifyRainAnalog(coldRawValue);

      const document = {
        ...data,
        bagId: deviceId,
        mqttTopic: topic,
        receivedAt: new Date(),
        eventType: "SENSOR",
        // Normalised derived fields
        lidOpen,
        rainValue: hotRawValue,
        rainValue2: coldRawValue,
        hotTempSensorId: allSensorIds.hotTempSensorId,
        coldTempSensorId: allSensorIds.coldTempSensorId,
        hotLeakSensorId: allSensorIds.hotLeakSensorId ?? hotSensorId,
        coldLeakSensorId: allSensorIds.coldLeakSensorId ?? coldSensorId,
        reedSensorId: allSensorIds.reedSensorId,
        tiltSensorId: allSensorIds.tiltSensorId,
        hotLeakDetected,
        coldLeakDetected,
        leakDetected: hotLeakDetected || coldLeakDetected,
        rainStatus: data.rainStatus ?? data.rain_status ?? hotRainClass.status,
        rainStatus2: data.rainStatus2 ?? data.rain_status2 ?? data.coldRainStatus ?? data.cold_rain_status ?? coldRainClass.status,
        // Delivery session fields (stamped at ingest time, never mutated after insert)
        deliveryId: session.deliveryId || null,
        deliveryStatus: session.status,
        deliveryStartTime: sessionStartTime,
        deliveryEndTime: sessionEndTime,
        riderId: session.status === "IN_TRANSIT" ? session.riderId || null : null,
        riderName: session.status === "IN_TRANSIT" ? session.riderName || null : null,
        routeId: session.status === "IN_TRANSIT" ? session.routeId || null : null,
        routeName: session.status === "IN_TRANSIT" ? session.routeName || null : null,
        routeStartLocation: session.status === "IN_TRANSIT" ? session.routeStartLocation || null : null,
        routeEndLocation: session.status === "IN_TRANSIT" ? session.routeEndLocation || null : null,
        route: session.status === "IN_TRANSIT" ? session.routeName || data.route || data.routeName || data.route_name || "Unknown Route" : data.route || data.routeName || data.route_name || "Unknown Route",
      };

      const result = await collection.insertOne(document);
      console.log(`Inserted into MongoDB: ${result.insertedId} [deliveryStatus=${session.status}]`);
    } catch (error) {
      console.error("Error processing MQTT message:", error.message);
    }
  });

  mqttClient.on("error", (error) => {
    console.error("MQTT error:", error.message);
  });

  mqttClient.on("reconnect", () => {
    console.log("Reconnecting to MQTT...");
  });
}

// ── Field mapper ──────────────────────────────────────────────────────────────
// Maps a raw MongoDB document (MQTT payload) → SensorRecord shape expected by
// the React dashboard. Extend the fallback chains here if your MQTT device uses
// different field names (e.g. "temp" instead of "temperatureC").
function toSensorRecord(doc) {
  const pick = (...keys) => {
    for (const k of keys) {
      if (doc[k] !== undefined && doc[k] !== null) return doc[k];
    }
    return undefined;
  };

  const normalizeTimestamp = (value) => {
    if (typeof value === "string") {
      const parsed = Date.parse(value);
      if (!Number.isNaN(parsed)) {
        return new Date(parsed).toISOString();
      }
    }

    // Device timestamps are often counters/epoch-seconds and may not be directly usable.
    // Fall back to receivedAt (Mongo insertion time), then now.
    if (doc.receivedAt) {
      return new Date(doc.receivedAt).toISOString();
    }

    return new Date().toISOString();
  };

  const timestamp = normalizeTimestamp(pick("timestamp"));

  const bagId = pick("bagId", "bag_id", "deviceId", "device_id") || "UNKNOWN";

  const routeName = pick("routeName", "route_name") ?? null;
  const routeId = pick("routeId", "route_id") ?? null;
  const routeStartLocation = pick("routeStartLocation", "route_start_location", "startLocation", "start_location") ?? null;
  const routeEndLocation = pick("routeEndLocation", "route_end_location", "endLocation", "end_location") ?? null;
  const route = routeName || pick("route", "routeLabel", "route_label") || "Unknown Route";
  const riderId = pick("riderId", "rider_id") ?? null;
  const riderName = pick("riderName", "rider_name") ?? null;

  const temperatureC = Number(
    pick("temperatureC", "temperature_c", "temperature", "temp") ?? 0
  );
  const coldTemperatureRaw = pick(
    "coldTemperatureC",
    "cold_temperature_c",
    "coldTemperature",
    "cold_temp",
    "coldTemp",
    "tempCold",
    "temp_cold"
  );
  const coldTemperatureC =
    coldTemperatureRaw !== undefined && coldTemperatureRaw !== null
      ? Number(coldTemperatureRaw)
      : undefined;
  const humidityPct = Number(
    pick("humidityPct", "humidity_pct", "humidity") ?? 0
  );
  const tiltDeg = Number(
    pick("tiltDeg", "tilt_deg", "tilt", "tiltAngle", "tilt_angle") ?? 0
  );
  // Use the ESP32's own tilt-detection flag as a secondary signal.
  // It is spread into the document via ...data, so look for both naming styles.
  const tiltDetected = toBoolean(
    pick("tiltDetected", "tilt_detected") ?? false
  );

  let {
    hotSensorId,
    coldSensorId,
    hotAnalogValue,
    coldAnalogValue,
  } = extractCompartmentLeakInputs(pick);
  const allSensorIds = extractAllSensorIds(pick);

  const sensorReadings = pick("sensorReadings", "sensor_readings");
  const sensorEntries = Array.isArray(sensorReadings) ? sensorReadings : [];
  const hotLeakEntry = sensorEntries.find(
    (entry) => normalizeSensorRole(entry?.sensorRole ?? entry?.sensor_role ?? entry?.role ?? entry?.type) === "hot_leak"
  );
  const coldLeakEntry = sensorEntries.find(
    (entry) => normalizeSensorRole(entry?.sensorRole ?? entry?.sensor_role ?? entry?.role ?? entry?.type) === "cold_leak"
  );

  if (!hotSensorId && hotLeakEntry?.sensorId) hotSensorId = String(hotLeakEntry.sensorId);
  if (!coldSensorId && coldLeakEntry?.sensorId) coldSensorId = String(coldLeakEntry.sensorId);
  if (hotAnalogValue === undefined) {
    hotAnalogValue = toNumberOrUndefined(
      hotLeakEntry?.analogValue ?? hotLeakEntry?.analog_value ?? hotLeakEntry?.value ?? hotLeakEntry?.reading
    );
  }
  if (coldAnalogValue === undefined) {
    coldAnalogValue = toNumberOrUndefined(
      coldLeakEntry?.analogValue ?? coldLeakEntry?.analog_value ?? coldLeakEntry?.value ?? coldLeakEntry?.reading
    );
  }

  // Leak detection by compartment (strict analog-only).
  const hotRawValue = hotAnalogValue ?? 4095;
  const coldRawValue = coldAnalogValue ?? 4095;
  const hotLeakDetected = hotRawValue < HOT_THRESHOLD;
  const coldLeakDetected = coldRawValue < COLD_THRESHOLD;
  const leakDetected = hotLeakDetected || coldLeakDetected;
  const hotRainClass  = classifyRainAnalog(hotRawValue);
  const coldRainClass = classifyRainAnalog(coldRawValue);
  const explicitLidState = pick("lidOpen", "lid_open", "lid", "bagOpen", "bag_open");
  const magnetDetected = pick("magnetDetected", "magnet_detected");

  // Device-specific convention: magnet detected => bag closed.
  // Therefore lidOpen should be the inverse of magnetDetected when no explicit lid field is present.
  const lidOpen =
    explicitLidState !== undefined
      ? toBoolean(explicitLidState)
      : magnetDetected !== undefined
        ? !toBoolean(magnetDetected)
        : false;
  const deliveryPhase =
    pick("deliveryPhase", "delivery_phase", "phase") || inferPhase(timestamp);

  const weatherTemperatureC = Number(
    pick("weatherTemperatureC", "weather_temperature_c", "weatherTemp", "weather_temp") ?? 27
  );
  const rainfallMm = Number(
    pick("rainfallMm", "rainfall_mm", "rainfall") ?? 0
  );
  const signalQuality =
    pick("signalQuality", "signal_quality", "signal") || "Good";

  // Delivery session fields stored at ingest time
  const eventType         = pick("eventType",         "event_type")          || "SENSOR";
  const deliveryId        = pick("deliveryId",        "delivery_id")         ?? null;
  const deliveryStatus    = pick("deliveryStatus",    "delivery_status")     || "IDLE";
  const deliveryStartTime = pick("deliveryStartTime", "delivery_start_time") ?? null;
  const deliveryEndTime   = pick("deliveryEndTime",   "delivery_end_time")   ?? null;

  return {
    id: doc._id ? doc._id.toString() : `${bagId}-${timestamp}`,
    timestamp,
    bagId,
    route,
    routeId,
    routeName,
    routeStartLocation,
    routeEndLocation,
    riderId,
    riderName,
    temperatureC,
    coldTemperatureC,
    humidityPct,
    tiltDeg,
    tiltDetected,
    hotTempSensorId: allSensorIds.hotTempSensorId,
    coldTempSensorId: allSensorIds.coldTempSensorId,
    hotLeakSensorId: allSensorIds.hotLeakSensorId ?? hotSensorId,
    coldLeakSensorId: allSensorIds.coldLeakSensorId ?? coldSensorId,
    reedSensorId: allSensorIds.reedSensorId,
    tiltSensorId: allSensorIds.tiltSensorId,
    hotLeakDetected,
    coldLeakDetected,
    leakDetected,
    lidOpen,
    deliveryPhase,
    weatherTemperatureC,
    rainfallMm,
    signalQuality,
    eventType,
    deliveryId,
    deliveryStatus,
    deliveryStartTime,
    deliveryEndTime,
  };
}

// Derive Pickup / Transit / Dropoff from hour-of-day when not in the document
function inferPhase(isoTimestamp) {
  const hour = new Date(isoTimestamp).getHours();
  if (hour >= 8 && hour < 11) return "Pickup";
  if (hour >= 11 && hour < 20) return "Transit";
  return "Dropoff";
}

function issueAuthToken(user) {
  return jwt.sign(
    {
      username: user.username,
      role: user.role || "user",
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = {
      username: payload.username,
      role: payload.role || "user",
    };
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

// ── API routes ─────────────────────────────────────────────────────────────────

app.get("/", (req, res) => {
  res.send("MQTT to MongoDB backend is running");
});

app.post("/api/auth/login", async (req, res) => {
  try {
    if (!usersCollection) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const { username, password } = req.body || {};

    if (typeof username !== "string" || typeof password !== "string") {
      return res.status(400).json({ error: "username and password are required" });
    }

    const normalizedUsername = username.trim();
    if (!normalizedUsername || !password) {
      return res.status(400).json({ error: "username and password are required" });
    }

    const user = await usersCollection.findOne({ username: normalizedUsername });
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = issueAuthToken(user);
    res.json({
      token,
      user: {
        username: user.username,
        role: user.role || "user",
      },
      expiresIn: JWT_EXPIRES_IN,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/auth/verify", requireAuth, (req, res) => {
  res.json({ valid: true, user: req.user });
});

app.post("/api/chat", requireAuth, async (req, res) => {
  try {
    if (!collection) {
      return res.status(503).json({ error: "Database not connected" });
    }
    if (!XAI_API_KEY) {
      return res.status(503).json({ error: "Missing XAI_API_KEY in server environment" });
    }

    const { message, dashboardState } = req.body || {};
    if (typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "message is required" });
    }

    const normalizedMessage = message.trim();
    const normalizedLower = normalizedMessage.toLowerCase();
    const isGreetingOnly = /^(hi|hello|hey|hiya|good morning|good afternoon|good evening)\b[!. ]*$/i.test(
      normalizedLower
    );

    if (isGreetingOnly) {
      return res.json({
        answer:
          "Hi! I am DeliverSafe Agent. I can help with trends, anomalies, comparisons, and decision guidance from your dashboard data.",
        context: {
          bagId: "ALL",
          hours: 24,
          recordsConsidered: 0,
        },
      });
    }

    const requestedBagId =
      typeof dashboardState?.bagId === "string" && dashboardState.bagId.trim()
        ? dashboardState.bagId.trim()
        : null;
    const requestedHoursRaw = Number(dashboardState?.hours);
    const requestedHours =
      Number.isFinite(requestedHoursRaw) && requestedHoursRaw > 0 ? Math.min(requestedHoursRaw, 168) : 24;
    const since = new Date(Date.now() - requestedHours * 60 * 60 * 1000);

    const filter = { receivedAt: { $gte: since } };
    if (requestedBagId && requestedBagId !== "ALL") {
      filter.$or = [
        { bagId: requestedBagId },
        { bag_id: requestedBagId },
        { deviceId: requestedBagId },
        { device_id: requestedBagId },
      ];
    }

    const docs = await collection.find(filter).sort({ receivedAt: -1 }).limit(150).toArray();
    const records = docs.map(toSensorRecord);

    const sensorRecords = records.filter((record) => (record.eventType || "SENSOR") === "SENSOR");
    const leakEvents = sensorRecords.filter((record) => record.leakDetected).length;
    const hotLeakEvents = sensorRecords.filter((record) => record.hotLeakDetected).length;
    const coldLeakEvents = sensorRecords.filter((record) => record.coldLeakDetected).length;
    const openEvents = sensorRecords.filter((record) => record.lidOpen).length;
    const tiltEvents = sensorRecords.filter((record) => record.tiltDetected || Number(record.tiltDeg) > 25).length;

    const avg = (values) => {
      if (!values.length) return null;
      return Number((values.reduce((sum, current) => sum + current, 0) / values.length).toFixed(2));
    };

    const avgHotTemperature = avg(sensorRecords.map((record) => Number(record.temperatureC)).filter(Number.isFinite));
    const avgColdTemperature = avg(
      sensorRecords.map((record) => Number(record.coldTemperatureC)).filter(Number.isFinite)
    );
    const avgHumidity = avg(sensorRecords.map((record) => Number(record.humidityPct)).filter(Number.isFinite));
    const latestRecord = sensorRecords[0] || null;

    const analyticsContext = {
      path: typeof dashboardState?.path === "string" ? dashboardState.path : "/overview",
      bagId: requestedBagId || "ALL",
      hours: requestedHours,
      totalRecords: records.length,
      totalSensorRecords: sensorRecords.length,
      leakEvents,
      hotLeakEvents,
      coldLeakEvents,
      openEvents,
      tiltEvents,
      avgHotTemperature,
      avgColdTemperature,
      avgHumidity,
      latestRecord: latestRecord
        ? {
            timestamp: latestRecord.timestamp,
            bagId: latestRecord.bagId,
            hotTempC: latestRecord.temperatureC,
            coldTempC: latestRecord.coldTemperatureC,
            humidityPct: latestRecord.humidityPct,
            tiltDeg: latestRecord.tiltDeg,
            hotLeakDetected: latestRecord.hotLeakDetected,
            coldLeakDetected: latestRecord.coldLeakDetected,
            lidOpen: latestRecord.lidOpen,
            deliveryStatus: latestRecord.deliveryStatus,
          }
        : null,
    };

    const systemPrompt =
      "You are the DeliverSafe Virtual Assistant for an IoT food-delivery dashboard. " +
      "Answer using ONLY the provided analytics context. Keep responses practical and concise. " +
      "When data is missing, say so clearly. Help with trends, anomalies, comparisons, and decision guidance.";

    const upstreamResponse = await fetch(`${XAI_API_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: XAI_MODEL,
        temperature: 0.2,
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content:
              `Dashboard analytics context:\n${JSON.stringify(analyticsContext, null, 2)}\n\n` +
              `User question:\n${normalizedMessage}`,
          },
        ],
      }),
    });

    if (!upstreamResponse.ok) {
      const upstreamBody = await upstreamResponse.text().catch(() => "");
      return res.status(502).json({
        error: `xAI request failed (${upstreamResponse.status})`,
        details: upstreamBody.slice(0, 300),
      });
    }

    const payload = await upstreamResponse.json();
    const answer =
      payload?.choices?.[0]?.message?.content?.trim() ||
      "I could not generate an answer right now. Please try again.";

    res.json({
      answer,
      context: {
        bagId: analyticsContext.bagId,
        hours: analyticsContext.hours,
        recordsConsidered: analyticsContext.totalSensorRecords,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Legacy raw endpoint (kept for debugging)
app.get("/readings", async (req, res) => {
  try {
    if (!collection) {
      return res.status(500).json({ error: "Database not connected" });
    }

    const readings = await collection
      .find({})
      .sort({ receivedAt: -1 })
      .limit(20)
      .toArray();

    res.json(readings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/bags
 *
 * Returns known bag IDs from MongoDB (supports multiple field naming styles).
 */
app.get("/api/bags", async (req, res) => {
  try {
    if (!collection) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const [bagIdValues, bagIdSnakeValues, deviceIdValues, deviceIdSnakeValues] = await Promise.all([
      collection.distinct("bagId"),
      collection.distinct("bag_id"),
      collection.distinct("deviceId"),
      collection.distinct("device_id"),
    ]);

    const bags = Array.from(
      new Set([
        ...bagIdValues,
        ...bagIdSnakeValues,
        ...deviceIdValues,
        ...deviceIdSnakeValues,
        ...deliveryState.keys(),
        ...lastSeenBagIds,
      ])
    ).filter((value) => typeof value === "string" && value.trim().length > 0);

    res.json(bags.sort((a, b) => a.localeCompare(b)));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ── Delivery state store (in-memory, keyed by bagId) ─────────────────────────
// Structure: { bagId, deliveryId, status: "IDLE"|"IN_TRANSIT"|"COMPLETED", startTime, endTime, riderId, riderName, routeId, routeName }
const deliveryState = new Map();

// History keeps every completed delivery session so it survives End→Start cycles.
const deliveryHistory = [];

function getDeliveryState(bagId) {
  return deliveryState.get(bagId) || {
    bagId,
    deliveryId: null,
    status: "IDLE",
    startTime: null,
    endTime: null,
    riderId: null,
    riderName: null,
    routeId: null,
    routeName: null,
    routeStartLocation: null,
    routeEndLocation: null,
  };
}

app.get("/api/riders", async (req, res) => {
  try {
    if (!ridersCollection) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const statusFilter = typeof req.query.status === "string" ? req.query.status.trim().toLowerCase() : "";
    const filter = statusFilter ? { status: statusFilter } : {};
    const riders = await ridersCollection.find(filter).sort({ name: 1 }).toArray();
    res.json(
      riders.map((rider) => ({
        id: rider.id,
        name: rider.name,
        phone: rider.phone,
        status: rider.status,
      }))
    );
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/routes", async (req, res) => {
  try {
    if (!routesCollection) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const routes = await routesCollection.find({}).sort({ name: 1 }).toArray();
    res.json(
      routes.map((route) => ({
        id: route.id,
        name: route.name,
        startLocation: route.startLocation,
        endLocation: route.endLocation,
      }))
    );
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /api/delivery/status?bagId=...
// No auth required – mobile view polls this to sync state on load / reconnect.
app.get("/api/delivery/status", (req, res) => {
  const bagId = (req.query.bagId || "").trim();
  if (!bagId) {
    return res.status(400).json({ error: "bagId query param is required" });
  }
  res.json(getDeliveryState(bagId));
});

// POST /api/delivery/start  { bagId, riderId, routeId }
app.post("/api/delivery/start", async (req, res) => {
  const { bagId, riderId, routeId } = req.body || {};
  if (typeof bagId !== "string" || !bagId.trim()) {
    return res.status(400).json({ error: "bagId is required" });
  }
  if (typeof riderId !== "string" || !riderId.trim()) {
    return res.status(400).json({ error: "riderId is required" });
  }
  if (typeof routeId !== "string" || !routeId.trim()) {
    return res.status(400).json({ error: "routeId is required" });
  }
  if (!ridersCollection || !routesCollection) {
    return res.status(503).json({ error: "Database not connected" });
  }

  const normalizedId = bagId.trim();
  const normalizedRiderId = riderId.trim();
  const normalizedRouteId = routeId.trim();
  const [rider, route] = await Promise.all([
    ridersCollection.findOne({ id: normalizedRiderId }),
    routesCollection.findOne({ id: normalizedRouteId }),
  ]);

  if (!rider) {
    return res.status(404).json({ error: "Selected rider not found" });
  }
  if ((rider.status || "").toLowerCase() !== "active") {
    return res.status(400).json({ error: "Selected rider is inactive" });
  }
  if (!route) {
    return res.status(404).json({ error: "Selected route not found" });
  }

  const deliveryId = generateDeliveryId();
  const startTime = new Date();

  // Set session state to IN_TRANSIT immediately
  const state = {
    bagId: normalizedId,
    deliveryId,
    status: "IN_TRANSIT",
    startTime,
    endTime: null,
    riderId: rider.id,
    riderName: rider.name,
    routeId: route.id,
    routeName: route.name,
    routeStartLocation: route.startLocation,
    routeEndLocation: route.endLocation,
  };
  deliveryState.set(normalizedId, state);

  // Insert one STARTED marker record into sensor_readings
  if (collection) {
    try {
      await collection.insertOne({
        bagId: normalizedId,
        deviceId: normalizedId,
        timestamp: startTime.toISOString(),
        receivedAt: startTime,
        eventType: "DELIVERY_START",
        deliveryId,
        deliveryStatus: "STARTED",
        deliveryStartTime: startTime,
        deliveryEndTime: null,
        riderId: rider.id,
        riderName: rider.name,
        routeId: route.id,
        routeName: route.name,
        routeStartLocation: route.startLocation,
        routeEndLocation: route.endLocation,
        route: route.name,
        _markerRecord: true,
      });
    } catch (e) {
      console.error("[Delivery] Failed to insert STARTED marker:", e.message);
    }
  }

  console.log(`[Delivery] Started for ${normalizedId} → ${deliveryId}`);
  res.json(state);
});

// POST /api/delivery/end  { bagId }
app.post("/api/delivery/end", async (req, res) => {
  const { bagId } = req.body || {};
  if (typeof bagId !== "string" || !bagId.trim()) {
    return res.status(400).json({ error: "bagId is required" });
  }
  const normalizedId = bagId.trim();
  const existing = deliveryState.get(normalizedId) || {
    bagId: normalizedId,
    deliveryId: null,
    startTime: null,
    riderId: null,
    riderName: null,
    routeId: null,
    routeName: null,
    routeStartLocation: null,
    routeEndLocation: null,
  };
  const endTime = new Date();

  const completedSession = {
    ...existing,
    bagId: normalizedId,
    status: "COMPLETED",
    endTime,
  };

  // Archive completed session to history before reset
  deliveryHistory.push({ ...completedSession });

  // Insert one COMPLETED marker record into sensor_readings
  if (collection && completedSession.deliveryId) {
    try {
      await collection.insertOne({
        bagId: normalizedId,
        deviceId: normalizedId,
        timestamp: endTime.toISOString(),
        receivedAt: endTime,
        eventType: "DELIVERY_END",
        deliveryId: completedSession.deliveryId,
        deliveryStatus: "COMPLETED",
        deliveryStartTime: existing.startTime instanceof Date ? existing.startTime : existing.startTime ? new Date(existing.startTime) : null,
        deliveryEndTime: endTime,
        riderId: completedSession.riderId || null,
        riderName: completedSession.riderName || null,
        routeId: completedSession.routeId || null,
        routeName: completedSession.routeName || null,
        routeStartLocation: completedSession.routeStartLocation || null,
        routeEndLocation: completedSession.routeEndLocation || null,
        route: completedSession.routeName || null,
        _markerRecord: true,
      });
    } catch (e) {
      console.error("[Delivery] Failed to insert COMPLETED marker:", e.message);
    }
  }

  // ── CRITICAL: Reset session to IDLE so MQTT records are no longer tagged ──
  deliveryState.set(normalizedId, {
    bagId: normalizedId,
    deliveryId: null,
    status: "IDLE",
    startTime: null,
    endTime: null,
    riderId: null,
    riderName: null,
    routeId: null,
    routeName: null,
    routeStartLocation: null,
    routeEndLocation: null,
  });

  console.log(`[Delivery] Ended for ${normalizedId} → ${completedSession.deliveryId} (session reset to IDLE)`);
  res.json(completedSession);
});

/**
 * GET /api/delivery/active
 * Returns all bags currently IN_TRANSIT with their deliveryId.
 */
app.get("/api/delivery/active", (req, res) => {
  const active = [];
  for (const session of deliveryState.values()) {
    if (session.status === "IN_TRANSIT") active.push(session);
  }
  res.json(active);
});

/**
 * GET /api/delivery/history
 * Returns all completed delivery sessions recorded since last server start.
 * Query params (optional): bagId — filter to a specific bag
 */
app.get("/api/delivery/history", (req, res) => {
  const bagId = (req.query.bagId || "").trim();
  const results = bagId
    ? deliveryHistory.filter((s) => s.bagId === bagId)
    : [...deliveryHistory];
  // Newest first
  res.json(results.slice().reverse());
});

/**
 * GET /api/delivery/records?deliveryId=DELIVERY_20260419_001[&limit=5000]
 * Returns sensor records that belong to a specific delivery session.
 */
app.get("/api/delivery/records", async (req, res) => {
  try {
    if (!collection) {
      return res.status(503).json({ error: "Database not connected" });
    }
    const deliveryId = (req.query.deliveryId || "").trim();
    if (!deliveryId) {
      return res.status(400).json({ error: "deliveryId query param is required" });
    }
    const limit = Math.min(Number(req.query.limit) || 5000, 20000);
    const docs = await collection
      .find({ deliveryId })
      .sort({ receivedAt: 1 })
      .limit(limit)
      .toArray();
    res.json(docs.map(toSensorRecord));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sensor-records?hours=72&bagId=BAG-101&limit=5000
 *
 * Returns SensorRecord[] consumed by the React dashboard.
 * Query params (all optional):
 *   hours  – how many hours back to look (default 72)
 *   bagId  – filter to a single bag (default: all)
 *   limit  – max documents to return (default 5000)
 */
app.get("/api/sensor-records", async (req, res) => {
  try {
    if (!collection) {
      return res.status(503).json({ error: "Database not connected" });
    }

    const hours = Math.min(Number(req.query.hours) || 72, 720); // cap at 30 days
    const limit = Math.min(Number(req.query.limit) || 5000, 20000);
    const bagId = req.query.bagId;

    const since = new Date(Date.now() - hours * 60 * 60 * 1000);

    const filter = { receivedAt: { $gte: since } };
    if (bagId && bagId !== "ALL") {
      // match against both camelCase and snake_case field names
      filter.$or = [{ bagId }, { bag_id: bagId }, { deviceId: bagId }];
    }

    const docs = await collection
      .find(filter)
      .sort({ receivedAt: -1 }) // get newest events first so latest sensor data is never truncated
      .limit(limit)
      .toArray();

    const records = docs.reverse().map(toSensorRecord); // convert back to oldest → newest for chart rendering
    res.json(records);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

async function startServer() {
  await connectMongo();
  connectMQTT();

  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
