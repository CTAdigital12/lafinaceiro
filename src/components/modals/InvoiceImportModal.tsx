import { useState, useCallback } from "react";
import { Upload, FileText, Loader2, X, Check, AlertCircle, Calendar, Settings } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useDate } from "@/contexts/DateContext";

interface InvoiceImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creditCardId: string;
  creditCardName: string;
  closingDate: number;
  onImportComplete: (data: ImportCompleteData) => void;
}

export interface ImportedItem {
  date: string;
  description: string;
  amount: number;
  installment_current?: number;
  installment_total?: number;
  is_post_closing?: boolean;
}

export interface ImportCompleteData {
  items: ImportedItem[];
  future_installments: ImportedItem[];
  post_closing_count: number;
  invoice_month: number;
  invoice_year: number;
  closing_day: number;
}

const MONTHS = [
  { value: "1", label: "Janeiro" },
  { value: "2", label: "Fevereiro" },
  { value: "3", label: "Março" },
  { value: "4", label: "Abril" },
  { value: "5", label: "Maio" },
  { value: "6", label: "Junho" },
  { value: "7", label: "Julho" },
  { value: "8", label: "Agosto" },
  { value: "9", label: "Setembro" },
  { value: "10", label: "Outubro" },
  { value: "11", label: "Novembro" },
  { value: "12", label: "Dezembro" },
];

const CLOSING_DAYS = Array.from({ length: 28 }, (_, i) => i + 1);

export function InvoiceImportModal({
  open,
  onOpenChange,
  creditCardId,
  creditCardName,
  closingDate: defaultClosingDate,
  onImportComplete,
}: InvoiceImportModalProps) {
  const { currentDate } = useDate();
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [invoiceMonth, setInvoiceMonth] = useState<string>(() => String(currentDate.getMonth() + 1));
  const [invoiceYear, setInvoiceYear] = useState<string>(() => String(currentDate.getFullYear()));
  const [closingDay, setClosingDay] = useState<number>(defaultClosingDate);
  const [showAdvanced, setShowAdvanced] = useState(false);

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
    
    const validTypes = [
      'application/pdf',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/png',
      'image/jpeg'
    ];
    
    if (!validTypes.includes(file.type)) {
      setError("Formato não suportado. Use PDF, Excel ou imagem (PNG/JPG).");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("Arquivo muito grande. Máximo 10MB.");
      return;
    }

    setFile(file);
  };

  const processFile = async () => {
    if (!file) return;

    setIsProcessing(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('credit_card_id', creditCardId);
      formData.append('invoice_month', invoiceMonth);
      formData.append('invoice_year', invoiceYear);
      formData.append('closing_date', String(closingDay));

      // Extended timeout for AI processing (3 minutes)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 180000);

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-invoice`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: formData,
          signal: controller.signal,
        }
      );

      clearTimeout(timeoutId);

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erro ao processar fatura");
      }

      if (data.items && data.items.length > 0) {
        onImportComplete({
          items: data.items,
          future_installments: data.future_installments || [],
          post_closing_count: data.post_closing_count || 0,
          invoice_month: parseInt(invoiceMonth),
          invoice_year: parseInt(invoiceYear),
          closing_day: closingDay,
        });
        onOpenChange(false);
        resetState();
      } else {
        setError("Nenhuma transação encontrada na fatura. Verifique se o arquivo está correto.");
      }
    } catch (err) {
      console.error("Error processing invoice:", err);
      setError(err instanceof Error ? err.message : "Erro ao processar fatura");
    } finally {
      setIsProcessing(false);
    }
  };

  const resetState = () => {
    setFile(null);
    setError(null);
    setIsProcessing(false);
    setShowAdvanced(false);
  };

  const handleClose = (open: boolean) => {
    if (!isProcessing) {
      onOpenChange(open);
      if (!open) resetState();
    }
  };

  // Generate year options (current year and 2 years before/after)
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  // Calculate billing cycle info
  const month = parseInt(invoiceMonth);
  const year = parseInt(invoiceYear);
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const startDay = closingDay + 1;
  const endDay = closingDay;
  const prevMonthName = MONTHS.find(m => m.value === String(prevMonth))?.label || "";
  const currentMonthName = MONTHS.find(m => m.value === String(month))?.label || "";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Importar Fatura</DialogTitle>
          <DialogDescription>
            {creditCardName} - Envie a fatura em PDF, Excel ou imagem
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Month/Year selector - MANDATORY */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-sm font-medium">
              <Calendar className="h-4 w-4" />
              Período da Fatura *
            </Label>
            <div className="flex gap-2">
              <Select value={invoiceMonth} onValueChange={setInvoiceMonth}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Mês" />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={invoiceYear} onValueChange={setInvoiceYear}>
                <SelectTrigger className="w-24">
                  <SelectValue placeholder="Ano" />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Advanced settings (closing day) */}
          <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-muted-foreground hover:text-foreground">
                <Settings className="h-4 w-4" />
                Configurações avançadas
                <span className="ml-auto text-xs">
                  {showAdvanced ? "▲" : "▼"}
                </span>
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-2">
              <div className="space-y-2">
                <Label className="text-sm">Dia de Fechamento</Label>
                <Select value={String(closingDay)} onValueChange={(v) => setClosingDay(parseInt(v))}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Dia" />
                  </SelectTrigger>
                  <SelectContent>
                    {CLOSING_DAYS.map((d) => (
                      <SelectItem key={d} value={String(d)}>
                        Dia {d}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Compras após o dia {closingDay} entram na próxima fatura
                </p>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Billing cycle info */}
          <div className="p-3 rounded-lg bg-muted/50 border text-sm">
            <p className="font-medium text-foreground mb-1">Ciclo desta fatura:</p>
            <p className="text-muted-foreground">
              {startDay.toString().padStart(2, '0')}/{prevMonthName.slice(0, 3)}/{prevYear} até {endDay.toString().padStart(2, '0')}/{currentMonthName.slice(0, 3)}/{year}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Cartão fecha dia {closingDay}
            </p>
          </div>

          {/* File upload area */}
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
                accept=".pdf,.xls,.xlsx,.png,.jpg,.jpeg"
                onChange={handleFileSelect}
                className="hidden"
                id="invoice-file"
              />
              <label htmlFor="invoice-file" className="cursor-pointer">
                <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                <p className="text-sm font-medium">
                  Arraste o arquivo aqui ou clique para selecionar
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  PDF, Excel ou imagem (máx. 10MB)
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
                  <span>Lendo fatura com IA...</span>
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
                  Processar Fatura
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
