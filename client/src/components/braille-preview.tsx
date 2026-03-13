import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Printer } from "lucide-react";
import { CHARS_PER_LINE, getUnsupportedCharacters, layoutBraille, MAX_LINES, toUnicodeBraille } from "@shared/braille";
import { useToast } from "@/hooks/use-toast";

// The print server runs next to the Raspberry Pi, not on the web host.
const PRINT_SERVER_URL = (import.meta.env.VITE_PRINT_SERVER_URL || "http://localhost:3000").replace(/\/$/, "");

interface Props {
  text: string;
}

export default function BraillePreview({ text }: Props) {
  const { toast } = useToast();
  const [isPrinting, setIsPrinting] = useState(false);
  const [isTerminating, setIsTerminating] = useState(false);

  const lines = useMemo(() => layoutBraille(text), [text]);
  const formattedText = toUnicodeBraille(lines);
  const unsupportedCharacters = useMemo(() => getUnsupportedCharacters(text), [text]);
  const isTextTooLong = lines.length > MAX_LINES;
  const hasUnsupportedCharacters = unsupportedCharacters.length > 0;

  const handleDownload = () => {
    const url = URL.createObjectURL(new Blob([formattedText], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "brailink-braille.txt";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const postToPrintServer = async (path: string, body?: object) => {
    const response = await fetch(`${PRINT_SERVER_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const result = await response.text();
    if (!response.ok) throw new Error(result || `HTTP error ${response.status}`);
    return result;
  };

  const handlePrint = async () => {
    if (!text.trim() || isTextTooLong || hasUnsupportedCharacters || isPrinting || isTerminating) return;
    setIsPrinting(true);
    try {
      await postToPrintServer("/print", { text });
      toast({ title: "Sent to printer" });
    } catch (error) {
      toast({
        title: "Print failed",
        description: error instanceof Error ? error.message : "Could not reach the print server",
        variant: "destructive",
      });
    } finally {
      setIsPrinting(false);
    }
  };

  const handleTerminate = async () => {
    setIsTerminating(true);
    try {
      toast({ title: await postToPrintServer("/api/terminate-print") });
    } catch (error) {
      toast({
        title: "Could not stop printing",
        description: error instanceof Error ? error.message : "Could not reach the print server",
        variant: "destructive",
      });
    } finally {
      setIsTerminating(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground" role="status">
        {lines.length} / {MAX_LINES} lines · {CHARS_PER_LINE} cells per line
      </p>
      <Card aria-label="Braille preview" className="p-6 min-h-[100px] max-h-[300px] font-mono text-xl leading-relaxed tracking-widest overflow-auto whitespace-pre">
        {formattedText || "Braille preview will appear here"}
      </Card>
      {isTextTooLong && (
        <p role="alert" className="text-sm text-destructive">
          Remove {lines.length - MAX_LINES} line(s) before printing. You can still download the full preview.
        </p>
      )}
      {hasUnsupportedCharacters && (
        <p role="alert" className="text-sm text-destructive">
          Unsupported characters: {unsupportedCharacters.map((character) => JSON.stringify(character)).join(", ")}. Replace these before printing or downloading; they appear as blank cells in the preview.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Uses the printer’s basic character mapping. Capitalization is not preserved; review the output before use.
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" disabled={!text.trim() || hasUnsupportedCharacters} onClick={handleDownload}>
          <Download className="mr-2 h-4 w-4" />
          Download Braille
        </Button>
        <Button disabled={!text.trim() || isTextTooLong || hasUnsupportedCharacters || isPrinting || isTerminating} onClick={handlePrint}>
          <Printer className="mr-2 h-4 w-4" />
          {isPrinting ? "Sending..." : "Send to Printer"}
        </Button>
        <Button
          variant="destructive"
          disabled={isTerminating}
          onClick={handleTerminate}
        >
          {isTerminating ? "Stopping..." : "Stop Printing"}
        </Button>
      </div>
    </div>
  );
}
