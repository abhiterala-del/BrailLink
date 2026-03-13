# client

The website people use. Built with React, Vite and Tailwind.

| Path | What's there |
|---|---|
| `src/pages/home.tsx` | The single page: holds the text and lays out the four panels |
| `src/components/ocr-uploader.tsx` | Upload a photo of handwriting and get the text back |
| `src/components/voice-recorder.tsx` | Record speech and get the text back |
| `src/components/text-editor.tsx` | The editable text box |
| `src/components/braille-preview.tsx` | Braille preview, download, and the Print and Stop buttons |
| `src/components/ui/` | Generic UI building blocks (buttons, cards, toasts) |

The braille conversion itself lives in [`../shared`](../shared). Print and Stop call the [print server](../print-server); everything else calls the [web server](../server).
