import { useState, useEffect } from "react";
import { ResponsiveDialog } from "@/components/ui/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";
import type { Project } from "@/hooks/useProjects";

const EMOJI_OPTIONS = ["📦", "✈️", "🏠", "🎉", "🎓", "🚗", "💍", "🏖️", "🎁", "🔧"];
const COLOR_OPTIONS = ["#3B82F6", "#22C55E", "#F59E0B", "#EC4899", "#8B5CF6", "#F97316", "#06B6D4", "#EF4444"];

interface ProjectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project?: Project | null;
  onSave: (data: { name: string; description: string | null; target_amount: number; icon: string; color: string }) => Promise<void>;
  isPending: boolean;
}

export function ProjectModal({ open, onOpenChange, project, onSave, isPending }: ProjectModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [targetAmount, setTargetAmount] = useState<number | undefined>(undefined);
  const [icon, setIcon] = useState("📦");
  const [color, setColor] = useState("#3B82F6");

  useEffect(() => {
    if (project) {
      setName(project.name);
      setDescription(project.description || "");
      setTargetAmount(Number(project.target_amount));
      setIcon(project.icon || "📦");
      setColor(project.color || "#3B82F6");
    } else {
      setName("");
      setDescription("");
      setTargetAmount(undefined);
      setIcon("📦");
      setColor("#3B82F6");
    }
  }, [project, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSave({
      name,
      description: description || null,
      target_amount: targetAmount ?? 0,
      icon,
      color,
    });
    onOpenChange(false);
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={project ? "Editar Projeto" : "Novo Projeto"}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="project-name">Nome</Label>
          <Input
            id="project-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Viagem Rio de Janeiro"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="project-amount">Orçamento (R$)</Label>
          <CurrencyInput
            id="project-amount"
            value={targetAmount}
            onValueChange={setTargetAmount}
            placeholder="R$ 5.000,00"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="project-description">Descrição (opcional)</Label>
          <Textarea
            id="project-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Detalhes do projeto..."
            rows={2}
          />
        </div>

        <div className="space-y-2">
          <Label>Ícone</Label>
          <div className="flex flex-wrap gap-2">
            {EMOJI_OPTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => setIcon(emoji)}
                className={`text-2xl p-1.5 rounded-lg border transition-all ${
                  icon === emoji ? "border-primary bg-primary/10 scale-110" : "border-transparent hover:bg-muted"
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Cor</Label>
          <div className="flex flex-wrap gap-2">
            {COLOR_OPTIONS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-8 h-8 rounded-full border-2 transition-all ${
                  color === c ? "border-foreground scale-110" : "border-transparent"
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>

        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Salvando...
            </>
          ) : project ? (
            "Salvar Alterações"
          ) : (
            "Criar Projeto"
          )}
        </Button>
      </form>
    </ResponsiveDialog>
  );
}
