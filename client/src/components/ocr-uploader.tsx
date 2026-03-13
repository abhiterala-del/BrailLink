import { useCallback, useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Upload, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";

interface Props {
  onSuccess: (text: string) => void;
}

export default function OcrUploader({ onSuccess }: Props) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const { toast } = useToast();

  // Free the previous preview image when it's replaced or the component unmounts
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const { mutate, isPending } = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("image", file);

      const res = await fetch("/api/ocr", {
        method: "POST",
        body: formData,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || "Failed to process image");
      }
      return data.text as string;
    },
    onSuccess: (text) => {
      onSuccess(text);
      toast({
        title: "Success",
        description: "Image processed successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleFileSelect = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/") || file.size > 10 * 1024 * 1024 || file.size === 0) {
        toast({ title: "Invalid image", description: "Choose a non-empty image up to 10 MB.", variant: "destructive" });
        return;
      }
      setPreviewUrl(URL.createObjectURL(file));
      mutate(file);
    },
    [mutate, toast],
  );

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && !isPending) handleFileSelect(file);
  };

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      className="border-2 border-dashed rounded-lg p-6 text-center"
    >
      {previewUrl ? (
        <div className="mb-4">
          <img
            src={previewUrl}
            alt="Preview"
            className="max-h-48 mx-auto object-contain rounded-lg"
          />
        </div>
      ) : (
        <div className="mb-4">
          <Upload className="mx-auto h-12 w-12 text-muted-foreground" />
        </div>
      )}

      <p className="text-sm text-muted-foreground mb-4">
        Drag and drop an image with handwritten text, or click to select (up to 10 MB)
      </p>

      <input
        type="file"
        id="file-upload"
        className="hidden"
        accept="image/*"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileSelect(file);
          e.target.value = ""; // allow picking the same file again
        }}
      />

      <Button
        disabled={isPending}
        onClick={() => document.getElementById("file-upload")?.click()}
      >
        <ImageIcon className="mr-2 h-4 w-4" />
        {isPending ? "Processing..." : "Select Image"}
      </Button>

      {isPending && (
        <Progress value={undefined} className="mt-4" />
      )}
    </div>
  );
}
