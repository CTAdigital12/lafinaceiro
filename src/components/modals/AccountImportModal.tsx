import { useState, useCallback } from "react";
import { Upload, FileText, Loader2, X, Check, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { parseOFX, OFXTransaction } from "@/lib/ofxParser";
import { parseCSV, CSVTransaction } from "@/lib/csvParser";

interface AccountImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  accountName: string;
  onImportComplete: (items: AccountImportedItem[]) => void;
}

export interface AccountImportedItem {
  id?: string; // OFX transaction ID for duplicate detection
  date: string;
  description: string;
  amount: number;
  type: "income" | "expense";
}

export function AccountImportModal({
  open,
  onOpenChange,
  accountId,
  accountName,
  onImportComplete,
}: AccountImportModalProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      validateAndSetFile(droppedFile);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      validateAndSetFile(selectedFile);
    }
  };

  const validateAndSetFile = (file: File) => {
    setError(null);
    
    const fileName = file.name.toLowerCase();
    const validExtensions = [".ofx", ".csv", ".pdf", ".png", ".jpg", ".jpeg"];
    const isValid = validExtensions.some(ext => fileName.endsWith(ext));
    
    if (!isValid) {
      setError("Formato não suportado. Use OFX, CSV, PDF ou imagem (PNG/JPG).");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("Arquivo muito grande. Máximo 10MB.");
      return;
    }

    setFile(file);
  };

  const getFileType = (file: File): "ofx" | "csv" | "pdf" => {
    const fileName = file.name.toLowerCase();
    if (fileName.endsWith(".ofx")) return "ofx";
    if (fileName.endsWith(".csv")) return "csv";
    return "pdf";
  };

  const processFile = async () => {
    if (!file) return;

    setIsProcessing(true);
    setError(null);

    try {
      const fileType = getFileType(file);
      let items: AccountImportedItem[] = [];

      if (fileType === "ofx") {
        const content = await file.text();
        const ofxItems = parseOFX(content);
        items = ofxItems.map((item: OFXTransaction) => ({
          id: item.id,
          date: item.date,
          description: item.description,
          amount: item.amount,
          type: item.type,
        }));
      } else if (fileType === "csv") {
        const content = await file.text();
        const csvItems = parseCSV(content);
        items = csvItems.map((item: CSVTransaction) => ({
          date: item.date,
          description: item.description,
          amount: item.amount,
          type: item.type,
        }));
      } else {
        // PDF or image - use AI
        const formData = new FormData();
        formData.append('file', file);
        formData.append('account_id', accountId);
        formData.append('mode', 'account');

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-invoice`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
            },
            body: formData,
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Erro ao processar extrato");
        }

        items = (data.items || []).map((item: any) => ({
          date: item.date,
          description: item.description,
          amount: Math.abs(item.amount),
          type: item.amount >= 0 ? "income" as const : "expense" as const,
        }));
      }

      if (items.length > 0) {
        onImportComplete(items);
        onOpenChange(false);
        resetState();
      } else {
        setError("Nenhuma transação encontrada no extrato. Verifique se o arquivo está correto.");
      }
    } catch (err) {
      console.error("Error processing statement:", err);
      setError(err instanceof Error ? err.message : "Erro ao processar extrato");
    } finally {
      setIsProcessing(false);
    }
  };

  const resetState = () => {
    setFile(null);
    setError(null);
    setIsProcessing(false);
  };

  const handleClose = (open: boolean) => {
    if (!isProcessing) {
      onOpenChange(open);
      if (!open) resetState();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Importar Extrato</DialogTitle>
          <DialogDescription>
            {accountName} - Envie o extrato em OFX, CSV, PDF ou imagem
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!file ? (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={cn(
                "border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer",
                isDragOver
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 hover:border-primary/50"
              )}
            >
              <input
                type="file"
                accept=".ofx,.csv,.pdf,.png,.jpg,.jpeg"
                onChange={handleFileSelect}
                className="hidden"
                id="statement-file"
              />
              <label htmlFor="statement-file" className="cursor-pointer">
                <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm font-medium">
                  Arraste o arquivo aqui ou clique para selecionar
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  OFX, CSV, PDF ou imagem (máx. 10MB)
                </p>
              </label>
            </div>
          ) : (
            <div className="border rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                {!isProcessing && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setFile(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>

              {isProcessing && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>
                    {getFileType(file) === "pdf" 
                      ? "Lendo extrato com IA..." 
                      : "Processando arquivo..."}
                  </span>
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => handleClose(false)}
              disabled={isProcessing}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1"
              onClick={processFile}
              disabled={!file || isProcessing}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Processar Extrato
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
