import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import OcrUploader from "@/components/ocr-uploader";
import TextEditor from "@/components/text-editor";
import BraillePreview from "@/components/braille-preview";
import VoiceRecorder from "@/components/voice-recorder";
import { useState } from "react";

export default function Home() {
  const [text, setText] = useState("");

  const handleTranscription = (transcribedText: string) => {
    setText((prev) => (prev ? prev + " " : "") + transcribedText);
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold bg-linear-to-r from-primary to-primary/80 bg-clip-text text-transparent">
            The Braille Printer
          </h1>
          <p className="text-muted-foreground mt-2">
            Convert handwritten text and audio input to Braille with ease
          </p>
        </header>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Upload Image</CardTitle>
            </CardHeader>
            <CardContent>
              <OcrUploader onSuccess={setText} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Edit Text</CardTitle>
            </CardHeader>
            <CardContent>
              <TextEditor text={text} onChange={setText} />
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Voice Recorder</CardTitle>
          </CardHeader>
          <CardContent>
            <VoiceRecorder onTranscription={handleTranscription} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Braille Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <BraillePreview text={text} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
