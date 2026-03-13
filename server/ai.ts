import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI, createPartFromBase64 } from "@google/genai";
import OpenAI, { toFile } from "openai";

// Configuration is read per request so the server picks up whichever keys the
// deployment provides. See .env.example for the full list.

const OCR_PROMPT =
  "Please transcribe any handwritten text in this image. Return only the transcribed text without any additional commentary.";

const defaultOcrModels = {
  openai: "gpt-4.1-mini",
  anthropic: "claude-haiku-5-5",
  gemini: "gemini-2.5-flash",
} as const;

type OcrProvider = keyof typeof defaultOcrModels;

const ocrProviderKeys: Record<OcrProvider, string> = {
  openai: "OPENAI_API_KEY (or OPENAI_BASE_URL)",
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
};

// Claude only accepts these image types.
const anthropicImageTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;

// Thrown when the requested feature has no provider configured; routes turn it into a 503.
export class NotConfiguredError extends Error {}

// Thrown when the chosen provider can't handle the upload; routes turn it into a 415.
export class UnsupportedMediaError extends Error {}

function env(name: string) {
  return process.env[name]?.trim() || undefined;
}

function isOcrProviderConfigured(provider: OcrProvider) {
  switch (provider) {
    case "openai":
      return Boolean(env("OPENAI_API_KEY") || env("OPENAI_BASE_URL"));
    case "anthropic":
      return Boolean(env("ANTHROPIC_API_KEY"));
    case "gemini":
      return Boolean(env("GEMINI_API_KEY"));
  }
}

export function getOcrConfig(): { provider: OcrProvider; model: string } {
  const chosen = env("OCR_PROVIDER")?.toLowerCase();
  if (chosen && !Object.hasOwn(defaultOcrModels, chosen)) {
    throw new NotConfiguredError(
      `Unknown OCR_PROVIDER "${chosen}". Use one of: ${Object.keys(defaultOcrModels).join(", ")}.`,
    );
  }

  // Without an explicit choice, use the first provider that has a key.
  const provider = (chosen as OcrProvider | undefined) ??
    (Object.keys(defaultOcrModels) as OcrProvider[]).find(isOcrProviderConfigured);
  if (!provider) {
    throw new NotConfiguredError(
      "Image recognition is not configured. Set OPENAI_API_KEY, ANTHROPIC_API_KEY or GEMINI_API_KEY on the web server.",
    );
  }
  if (!isOcrProviderConfigured(provider)) {
    throw new NotConfiguredError(
      `OCR_PROVIDER is "${provider}" but ${ocrProviderKeys[provider]} is not set on the web server.`,
    );
  }
  return { provider, model: env("OCR_MODEL") ?? defaultOcrModels[provider] };
}

export async function recognizeHandwriting(image: Buffer, mimeType: string): Promise<string> {
  const { provider, model } = getOcrConfig();
  const base64 = image.toString("base64");

  switch (provider) {
    case "openai": {
      const client = new OpenAI({
        apiKey: env("OPENAI_API_KEY") ?? "not-needed", // local servers like Ollama take no key
        baseURL: env("OPENAI_BASE_URL"),
      });
      const response = await client.chat.completions.create({
        model,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: OCR_PROMPT },
              { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
            ],
          },
        ],
      });
      return response.choices[0]?.message.content?.trim() ?? "";
    }

    case "anthropic": {
      const mediaType = anthropicImageTypes.find((type) => type === mimeType);
      if (!mediaType) {
        throw new UnsupportedMediaError("Use a JPEG, PNG, GIF or WebP image.");
      }
      const client = new Anthropic({ apiKey: env("ANTHROPIC_API_KEY") });
      const response = await client.messages.create({
        model,
        max_tokens: 2048,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
              { type: "text", text: OCR_PROMPT },
            ],
          },
        ],
      });
      return response.content
        .flatMap((block) => (block.type === "text" ? [block.text] : []))
        .join("")
        .trim();
    }

    case "gemini": {
      const client = new GoogleGenAI({ apiKey: env("GEMINI_API_KEY") });
      const response = await client.models.generateContent({
        model,
        contents: [OCR_PROMPT, createPartFromBase64(base64, mimeType)],
      });
      return response.text?.trim() ?? "";
    }
  }
}

// Transcription uses the OpenAI audio API, which OpenAI, Groq and self-hosted
// Whisper servers all implement. TRANSCRIBE_* settings override the OPENAI_* ones,
// so speech can go to a different service than OCR.
export function getTranscriptionConfig() {
  const apiKey = env("TRANSCRIBE_API_KEY") ?? env("OPENAI_API_KEY");
  const baseURL = env("TRANSCRIBE_BASE_URL") ?? env("OPENAI_BASE_URL");
  if (!apiKey && !baseURL) {
    throw new NotConfiguredError(
      "Transcription is not configured. Set OPENAI_API_KEY, or TRANSCRIBE_API_KEY and TRANSCRIBE_BASE_URL, on the web server.",
    );
  }
  return { apiKey, baseURL, model: env("TRANSCRIBE_MODEL") ?? "whisper-1" };
}

export async function transcribeAudio(audio: Buffer, fileName: string, mimeType: string): Promise<string> {
  const { apiKey, baseURL, model } = getTranscriptionConfig();
  const client = new OpenAI({ apiKey: apiKey ?? "not-needed", baseURL });
  const transcript = await client.audio.transcriptions.create({
    file: await toFile(audio, fileName, { type: mimeType }),
    model,
    response_format: "text",
  });
  return transcript.trim();
}

// One line for the startup log so it's obvious which services are in use.
export function describeAiConfig() {
  const describe = (get: () => { model: string; provider?: string }) => {
    try {
      const { provider, model } = get();
      return provider ? `${provider} (${model})` : model;
    } catch (error) {
      return error instanceof NotConfiguredError ? "not configured" : String(error);
    }
  };
  return `OCR: ${describe(getOcrConfig)} · Transcription: ${describe(getTranscriptionConfig)}`;
}
