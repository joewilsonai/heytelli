import React, { useState, useCallback, useEffect, useRef } from "react";
import { useGenerateBumbleReply } from "@workspace/api-client-react";
import { UploadCloud, Copy, Check, Sparkles, RefreshCcw, AlertCircle, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

function ReplyCard({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="p-5 flex flex-col gap-4 shadow-sm hover:shadow-md transition-shadow duration-300 group border-border">
      <p className="text-foreground text-lg leading-relaxed">{text}</p>
      <div className="flex justify-end mt-auto">
        <Button 
          variant={copied ? "default" : "secondary"} 
          onClick={handleCopy}
          className="transition-all duration-300 w-[110px] gap-2 rounded-full font-semibold"
          data-testid={`button-copy-${text.substring(0,10)}`}
        >
          {copied ? (
            <>
              <Check className="w-4 h-4" /> Copied!
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" /> Copy
            </>
          )}
        </Button>
      </div>
    </Card>
  );
}

export default function Home() {
  const [screenshotDataUrl, setScreenshotDataUrl] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  
  const generateReplyMutation = useGenerateBumbleReply();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      if (!dataUrl) return;
      
      setScreenshotDataUrl(dataUrl);
      generateReplyMutation.mutate({
        data: { image: dataUrl }
      });
    };
    reader.readAsDataURL(file);
  }, [generateReplyMutation]);

  // Drag and Drop handlers
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  }, [processFile]);

  // Paste handler
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (generateReplyMutation.isPending) return;
      
      const items = e.clipboardData?.items;
      if (!items) return;
      
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            processFile(file);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [processFile, generateReplyMutation.isPending]);

  const handleReset = () => {
    setScreenshotDataUrl(null);
    generateReplyMutation.reset();
  };

  return (
    <div className="min-h-[100dvh] w-full flex flex-col items-center justify-center p-6 md:p-12 relative overflow-hidden bg-background">
      {/* Decorative background blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-accent/30 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-4xl w-full z-10 flex flex-col items-center">
        
        <div className="text-center mb-10 space-y-3">
          <div className="inline-flex items-center justify-center p-3 bg-primary/20 text-primary-foreground rounded-2xl mb-2">
            <Sparkles className="w-8 h-8 text-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-foreground">
            Bumble Reply Generator
          </h1>
          <p className="text-muted-foreground text-lg max-w-lg mx-auto">
            Drop your screenshot below and let your witty wingman craft the perfect response.
          </p>
        </div>

        {!screenshotDataUrl && (
          <Card 
            className={`w-full max-w-xl aspect-video md:aspect-[2/1] border-3 border-dashed rounded-3xl flex flex-col items-center justify-center p-8 transition-all duration-300 cursor-pointer overflow-hidden relative group
              ${dragActive ? 'border-primary bg-primary/5 scale-[1.02]' : 'border-border/60 hover:border-primary/50 hover:bg-muted/50'}
            `}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            data-testid="dropzone"
          >
            <input 
              type="file" 
              ref={fileInputRef}
              className="hidden" 
              accept="image/*"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  processFile(e.target.files[0]);
                }
              }}
            />
            
            <div className="bg-background shadow-sm p-4 rounded-full mb-6 group-hover:scale-110 transition-transform duration-300">
              <UploadCloud className="w-10 h-10 text-primary" />
            </div>
            
            <h3 className="text-2xl font-bold mb-2">Drop screenshot here</h3>
            <p className="text-muted-foreground text-center">
              Click to browse or <span className="font-semibold text-foreground">Ctrl+V</span> to paste from clipboard
            </p>
          </Card>
        )}

        {screenshotDataUrl && (
          <div className="w-full flex flex-col lg:flex-row gap-8 items-start">
            
            {/* Left side: Thumbnail */}
            <div className="w-full lg:w-1/3 flex flex-col gap-4">
              <div className="rounded-3xl overflow-hidden shadow-lg border-4 border-white/50 bg-white relative">
                <img 
                  src={screenshotDataUrl} 
                  alt="Conversation screenshot" 
                  className="w-full object-cover max-h-[60vh] lg:max-h-[70vh]"
                />
              </div>
              <Button 
                variant="outline" 
                onClick={handleReset}
                className="w-full rounded-full gap-2 font-semibold h-12"
                data-testid="button-try-another"
              >
                <RefreshCcw className="w-4 h-4" /> Try another screenshot
              </Button>
            </div>

            {/* Right side: Results / Loading / Error */}
            <div className="w-full lg:w-2/3 flex flex-col gap-6">
              
              {generateReplyMutation.isPending && (
                <Card className="p-12 flex flex-col items-center justify-center min-h-[400px] border-none shadow-none bg-transparent">
                  <div className="relative mb-8">
                    <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
                    <div className="bg-primary text-primary-foreground p-5 rounded-full relative z-10 animate-bounce">
                      <Sparkles className="w-8 h-8" />
                    </div>
                  </div>
                  <h3 className="text-2xl font-bold mb-2">Cooking up brilliance...</h3>
                  <p className="text-muted-foreground">Analyzing the vibes and crafting the perfect words.</p>
                </Card>
              )}

              {generateReplyMutation.isError && (
                <Card className="p-8 border-destructive/20 bg-destructive/5 flex flex-col items-center justify-center text-center">
                  <div className="bg-destructive/10 p-4 rounded-full mb-4">
                    <AlertCircle className="w-8 h-8 text-destructive" />
                  </div>
                  <h3 className="text-xl font-bold text-destructive mb-2">Oops, something went wrong</h3>
                  <p className="text-muted-foreground mb-6">
                    Your wingman got a little distracted. Please try again.
                  </p>
                  <Button 
                    onClick={() => generateReplyMutation.mutate({ data: { image: screenshotDataUrl } })}
                    variant="default"
                    className="rounded-full gap-2"
                  >
                    <RefreshCcw className="w-4 h-4" /> Retry Analysis
                  </Button>
                </Card>
              )}

              {generateReplyMutation.isSuccess && generateReplyMutation.data && (
                <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="h-px bg-border flex-1" />
                    <span className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Top Suggestions</span>
                    <div className="h-px bg-border flex-1" />
                  </div>
                  
                  {generateReplyMutation.data.replies.map((reply, index) => (
                    <div 
                      key={index}
                      className="animate-in fade-in slide-in-from-bottom-4"
                      style={{ animationDelay: `${index * 150}ms`, animationFillMode: 'both' }}
                    >
                      <ReplyCard text={reply} />
                    </div>
                  ))}
                </div>
              )}

            </div>
          </div>
        )}

      </div>
    </div>
  );
}
