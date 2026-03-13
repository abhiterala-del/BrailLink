import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface Props {
  text: string;
  onChange: (text: string) => void;
}

export default function TextEditor({ text, onChange }: Props) {
  return (
    <div className="space-y-4">
      <Textarea
        aria-label="Text to convert to Braille"
        value={text}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Upload an image, use voice input, or start typing..."
        className="min-h-[200px]"
      />
      <div className="flex justify-end">
        <Button variant="destructive" onClick={() => onChange("")} disabled={!text}>
          Clear Text
        </Button>
      </div>
    </div>
  );
}
