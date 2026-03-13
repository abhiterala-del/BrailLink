# server

The web server. It serves the website from [`../client`](../client) and provides two APIs:

- `POST /api/ocr` reads handwriting from an image
- `POST /api/transcribe` turns a voice recording into text

| File | What's there |
|---|---|
| `index.ts` | Starts the server |
| `routes.ts` | The API endpoints and upload checks |
| `ai.ts` | Talks to the AI providers (OpenAI, Anthropic or Gemini); picks one from the settings in `.env` |
| `static.ts` | Serves the built website in production |
| `vite.ts` | Serves the website with live reload in development |

This server never talks to the printer. That's the [print server](../print-server)'s job.
