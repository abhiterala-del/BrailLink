# shared

Code used by both the website and the print server.

| File | What's there |
|---|---|
| `braille.ts` | Converts text to braille cells and wraps it into printer lines (14 cells per line, 10 lines per page). The preview and the printer both use this, so what you see is what prints. |
| `env.ts` | Loads settings from `.env` |
