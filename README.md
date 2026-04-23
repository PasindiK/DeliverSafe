# DeliverSense

IoT food delivery bag monitoring system with a Node.js backend and a React + TypeScript frontend.

## Project Structure

- `server.js`: Express backend API and MQTT ingestion
- `frontend/`: Vite React dashboard and mobile views
- `mosquitto.conf`: Local MQTT broker config

## Run Locally

1. Install backend dependencies:
   `npm install`
2. Install frontend dependencies:
   `cd frontend && npm install`
3. Start backend:
   `npm run start`
4. Start frontend:
   `cd frontend && npm run dev`

## Notes

- Keep `.env` local and do not commit secrets.
- `node_modules`, build artifacts, and virtual environments are git-ignored.
