
# mAIcros API

mAIcros is the backend API for a macronutrient analysis service. It exposes endpoints to analyze meals, return macro breakdowns, and provide suggested substitutions or adjustments to help meals meet user macro targets.

## Key Features

- Analyze a meal's macronutrient breakdown (protein, carbs, fats) and calorie estimate.
- Provide actionable suggestions: swap, add, or remove items to match macro targets.
- Explain tradeoffs and show how each suggestion affects totals.
- Clean JSON API suitable for consumption by web UIs, mobile apps, or other services.

## How It Works

1. A client submits a meal description (list of items and portions, or structured recipe data) to the analysis endpoint.
2. The API parses each item and estimates macros.
3. The AI engine evaluates totals against user targets and returns ranked suggestions with estimated macro impacts.

## Quick Start (API)

Prerequisites: Node.js (LTS) and npm installed.

Install dependencies and run the dev server (the API defaults to using port 3001 to avoid colliding with a Next.js UI on port 3000):

```bash
npm install

# macOS / Linux
PORT=3001 npm run start:dev

# Windows PowerShell
$env:PORT=3001; npm run start:dev
```

The API base URL will be `http://localhost:3001` unless you set a different `PORT`.

## Example Endpoints

- `GET /` — health check / root (returns a brief message).
- `POST /analyze` — submit meal data and receive macro breakdown + suggestions.

Example curl health-check:

```bash
curl http://localhost:3001/
```

Example analyze request (JSON body):

```bash
curl -X POST http://localhost:3001/analyze \
	-H "Content-Type: application/json" \
	-d '{ "items": [{"name":"chicken breast","grams":150},{"name":"brown rice","grams":100}] , "targets": {"protein":150, "carbs":250, "fat":70} }'
```

## Development

- Source for API routes and business logic live under `src/`.
- The development server uses `ts-node-dev` for fast reloads (`npm run start:dev`).
- Configure runtime options via environment variables (e.g., `PORT`, model/API keys, DB URLs).

## Contributing

- Contributions and issues are welcome. Please open a ticket and follow the repo's code style and testing approach.

## License

Specify your license here (e.g., MIT). Replace this line with the actual license text or link.

---

If you'd like, I can also:

- Add OpenAPI (Swagger) docs and an automatic `/docs` route.
- Add example API routes and request/response schemas under `src/`.
- Provide Postman / HTTPie collections for manual testing.

Which of these would you like next?
