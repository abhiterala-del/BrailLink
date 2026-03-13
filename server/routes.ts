import type { Express, Response } from "express";
import { createServer } from "http";
import multer from "multer";
import {
  NotConfiguredError,
  UnsupportedMediaError,
  recognizeHandwriting,
  transcribeAudio,
} from "./ai";

const imageUpload = multer({ limits: { fileSize: 10 * 1024 * 1024 } });
const audioUpload = multer({ limits: { fileSize: 25 * 1024 * 1024 } }); // Whisper's limit

// Whisper picks the decoder from the file extension, so map the recorder's mime type to one.
const audioExtensions: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mp4": "mp4",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

function sendProviderError(res: Response, error: unknown, fallbackMessage: string) {
  if (error instanceof NotConfiguredError) {
    return res.status(503).json({ message: error.message });
  }
  if (error instanceof UnsupportedMediaError) {
    return res.status(415).json({ message: error.message });
  }
  console.error(`${fallbackMessage}:`, error);
  res.status(500).json({ message: fallbackMessage });
}

export function registerRoutes(app: Express) {
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });
  // OCR endpoint (OpenAI-compatible, Anthropic or Gemini, see server/ai.ts)
  app.post("/api/ocr", imageUpload.single("image"), async (req, res) => {
    if (!req.file || !req.file.size || !req.file.mimetype.startsWith("image/")) {
      return res.status(400).json({ message: "No image file provided" });
    }
    try {
      const text = await recognizeHandwriting(req.file.buffer, req.file.mimetype);
      res.json({ text });
    } catch (error) {
      sendProviderError(res, error, "Failed to process image");
    }
  });

  // Audio transcription endpoint (any OpenAI-compatible speech-to-text API)
  app.post("/api/transcribe", audioUpload.single("audio"), async (req, res) => {
    if (!req.file || !req.file.size) {
      return res.status(400).json({ message: "No audio file provided" });
    }
    const mimeType = req.file.mimetype.split(";")[0];
    const extension = audioExtensions[mimeType];
    if (!extension) {
      return res.status(415).json({ message: "Unsupported audio format" });
    }
    try {
      const transcript = await transcribeAudio(req.file.buffer, `audio.${extension}`, mimeType);
      res.json({ transcript });
    } catch (error) {
      sendProviderError(res, error, "Failed to transcribe audio");
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
