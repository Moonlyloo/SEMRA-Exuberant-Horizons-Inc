# Astronaut Health System (Web App)

A standalone HTML + React 18 web application for the **Astronaut Health Monitoring System**, including the Crew Login screen, Crew & System Setup screen, Medical Baseline & Firestore cloud integration, and Telemetry Dashboard.

## How to Run the Web App (Windows — Zero Dependencies)

You don't need Python or Node.js installed to run this web app on Windows:

1. **Standard Browser Mode**: Double-click `start-webapp.bat` (or run `.\server.ps1` in PowerShell). This starts a local web server on `http://localhost:8080` and opens it in your browser.
2. **Standalone App Window Mode (PWA-like)**: Double-click `start-app-window.bat`. This starts the local server and opens the Astronaut Health System in its own dedicated app window (`msedge --app=http://localhost:8080`).
3. **Direct File Launch**: You can also open `index.html` directly in any modern browser.

## Structure

- `index.html` — Entry page loading React 18, Web App Manifest (`manifest.json`), and Service Worker (`sw.js`).
- `styles.css` — Layout, alignment, and UI styling.
- `app.js` — React components for the Login grid, `+` Add Astronaut modal, `SETUP` crew management screen, Firestore sync, and Telemetry Dashboard.
- `server.ps1` — Built-in Windows PowerShell HTTP server (`http://localhost:8080`).
- `start-webapp.bat` / `start-app-window.bat` — One-click Windows launchers.
- `manifest.json`, `sw.js`, `icon.svg` — Progressive Web App (PWA) configuration so you can also click **Install App** in Chrome/Edge's address bar.
