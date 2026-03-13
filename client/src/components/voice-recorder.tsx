import { useRef, useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Mic, Square } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  onTranscription: (transcribedText: string) => void;
}

// Chrome/Firefox record webm, Safari only records mp4.
const preferredMimeTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];

export default function VoiceRecorder({ onTranscription }: Props) {
  const { toast } = useToast();
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mountedRef = useRef(false);
  const startingRef = useRef(false);
  const requestRef = useRef<AbortController | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    // Stop the timer and release the microphone on unmount
    return () => {
      mountedRef.current = false;
      requestRef.current?.abort();
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      const recorder = mediaRecorderRef.current;
      if (recorder) {
        recorder.onstop = null;
        recorder.ondataavailable = null;
        recorder.onerror = null;
        if (recorder.state !== "inactive") recorder.stop();
        recorder.stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const formatTime = (timeInSeconds: number) => {
    const minutes = Math.floor(timeInSeconds / 60);
    const seconds = timeInSeconds % 60;
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  };

  const showError = (description: string) => {
    toast({ title: "Transcription failed", description, variant: "destructive" });
  };

  const transcribe = async (audioBlob: Blob) => {
    if (!mountedRef.current) return;
    if (!audioBlob.size || audioBlob.size > 25 * 1024 * 1024) {
      setIsTranscribing(false);
      showError("Record non-empty audio up to 25 MB. Try a shorter recording.");
      return;
    }
    const controller = new AbortController();
    requestRef.current = controller;
    const formData = new FormData();
    formData.append("audio", audioBlob, "audio");

    setIsTranscribing(true);
    try {
      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        showError(data.message || "Transcription failed");
        return;
      }
      if (data.transcript) onTranscription(data.transcript);
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error("Transcription request failed:", error);
      showError("Could not connect to transcription service.");
    } finally {
      if (mountedRef.current) setIsTranscribing(false);
    }
  };

  const startRecording = async () => {
    if (startingRef.current || isRecording || isTranscribing) return;
    startingRef.current = true;
    setIsStarting(true);
    let stream: MediaStream | undefined;
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        throw new Error("Recording is unavailable. Use a supported browser on HTTPS or localhost.");
      }
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const mimeType = preferredMimeTypes.find((type) => MediaRecorder.isTypeSupported(type));
      const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = mediaRecorder;

      const chunks: Blob[] = [];
      mediaRecorder.ondataavailable = (event) => {
        chunks.push(event.data);
      };

      mediaRecorder.onstop = () => {
        mediaRecorder.stream.getTracks().forEach((track) => track.stop());
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        if (mountedRef.current) {
          setIsRecording(false);
          void transcribe(new Blob(chunks, { type: mediaRecorder.mimeType }));
        }
      };
      mediaRecorder.onerror = () => {
        mediaRecorder.onstop = null;
        mediaRecorder.stream.getTracks().forEach((track) => track.stop());
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        if (mountedRef.current) {
          setIsRecording(false);
          setIsTranscribing(false);
          showError("Recording was interrupted. Please try again.");
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setElapsedTime(0);
      timerIntervalRef.current = setInterval(() => {
        setElapsedTime((prevTime) => prevTime + 1);
      }, 1000);
    } catch (err) {
      stream?.getTracks().forEach((track) => track.stop());
      if (!mountedRef.current) return;
      console.error("Error starting recording:", err);
      toast({
        title: "Could not start recording",
        description: err instanceof Error ? err.message : "Check that microphone access is allowed.",
        variant: "destructive",
      });
    } finally {
      startingRef.current = false;
      if (mountedRef.current) setIsStarting(false);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      setIsTranscribing(true);
      mediaRecorderRef.current.stop();
    }
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
    }
    setIsRecording(false);
  };

  return (
    <div className="space-y-4 flex flex-col items-center">
      <div className="text-2xl font-mono">{formatTime(elapsedTime)}</div>
      <div className="flex space-x-4">
        <Button onClick={startRecording} disabled={isStarting || isRecording || isTranscribing} variant="outline">
          <Mic className="mr-2 h-4 w-4" />
          {isStarting ? "Opening microphone..." : isTranscribing ? "Transcribing..." : "Start Recording"}
        </Button>
        <Button onClick={stopRecording} disabled={!isRecording} variant="destructive">
          <Square className="mr-2 h-4 w-4" />
          Stop Recording
        </Button>
      </div>
    </div>
  );
}
