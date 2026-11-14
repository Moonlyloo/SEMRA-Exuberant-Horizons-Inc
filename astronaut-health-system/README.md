# Astronaut Health System (Prototype)

A simple HTML + React prototype for the **Astronaut Health Monitoring System**, starting with the Crew Login screen, Crew & System Setup screen, and a basic placeholder telemetry Dashboard.

## Structure

- `index.html` — Entry page loading React 18 and the application.
- `styles.css` — Layout, alignment, and basic UI styling.
- `app.js` — React components for the Login grid, `+` Add Astronaut modal, `SETUP` crew management screen (custom slot count + avatar photo import), and placeholder Dashboard.

## Running Locally

You can open `index.html` directly in a browser, or run a local static server using Python:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000` in your browser.

