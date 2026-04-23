# SmartDelivery (Backend + Frontend)

IoT-enabled food delivery bag monitoring dashboard with:
- React + TypeScript frontend (Vite)
- Node.js + Express backend
- MQTT integration (Mosquitto broker)
- MongoDB storage

## Prerequisites
- Node.js 18+
- npm
- MongoDB (local or cloud)
- Mosquitto MQTT broker

## 1) Install Dependencies

From the repository root:

```bash
npm install
cd frontend
npm install
```

## 2) Configure Backend Environment

Create a `.env` file in the repository root with at least:

```env
MONGODB_URI=mongodb://localhost:27017
DB_NAME=smartbag_db
COLLECTION_NAME=sensor_readings
USERS_COLLECTION_NAME=users
RIDERS_COLLECTION_NAME=riders
ROUTES_COLLECTION_NAME=routes
PORT=3000
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_TOPIC=smartbag/sensors
JWT_SECRET=change-me-in-production
AUTH_BOOTSTRAP_USERNAME=admin
AUTH_BOOTSTRAP_PASSWORD=admin123
AUTH_BOOTSTRAP_ROLE=admin
```

`MONGODB_URI` is required or the backend will not start.

## 3) Install and Run Mosquitto (Windows)

Option A: Download installer
1. Download Mosquitto from the official page: https://mosquitto.org/download/
2. Install it (default path is usually `C:\Program Files\mosquitto`).

Option B: Install via Chocolatey

```powershell
choco install mosquitto -y
```

Start Mosquitto broker:

```powershell
"C:\Program Files\mosquitto\mosquitto.exe" -v
```

Or use this repo's config file:

```powershell
"C:\Program Files\mosquitto\mosquitto.exe" -c mosquitto.conf -v
```

Keep this terminal running while using the app.

## 4) Run Backend

From repository root:

```bash
npm start
```

Backend runs on `http://localhost:3000` by default.

## 5) Run Frontend

In a new terminal:

```bash
cd frontend
npm run dev
```

Frontend runs on `http://localhost:5173` by default.

## Build Frontend

```bash
cd frontend
npm run build
npm run preview
```

## Project Structure

```text
docs/                   Assignment evidence templates (Steps 0-7 + AI disclosure)
frontend/               React + TypeScript app
server.js               Express + MQTT + MongoDB backend
mosquitto.conf          Mosquitto broker configuration
```

## Assignment Notes
- Replace mock data in `frontend/src/services/mockData.ts` with your validated datasets.
- Keep all user research and usability results real and evidence-based.
- Use files in `docs/` as report-writing templates mapped to rubric criteria.
- Add your Figma link and screenshots in `docs/04-prototype`.

## Academic Integrity

Do not fabricate personas, interviews, or usability findings. AI can be used only as a supportive aid and must be disclosed in `docs/08-ai-disclosure/ai-tools-usage-disclosure.md`.
