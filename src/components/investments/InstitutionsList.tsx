import { useState } from "react";
import { Plus, Pencil, Trash2, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { InvestmentInstitution } from "@/hooks/useInstitutions";
import { InstitutionModal } from "./InstitutionModal";
import type { InstitutionFormData } from "./InstitutionModal";

interface InstitutionsListProps {
  institutions: InvestmentInstitution[];
  onCreateInstitution: (data: InstitutionFormData) => void;
  onUpdateInstitution: (data: InstitutionFormData & { id: string }) => void;
  onDeleteInstitution: (id: string) => void;
}

export function InstitutionsList({
  institutions,
  onCreateInstitution,
  onUpdateInstitution,
  onDeleteInstitution,
}: InstitutionsListProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingInstitution, setEditingInstitution] = useState<InvestmentInstitution | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const handleEdit = (institution: InvestmentInstitution) => {
    setEditingInstitution(institution);
    setModalOpen(true);
  };

  const handleSubmit = (data: InstitutionFormData) => {
    if (editingInstitution) {
      onUpdateInstitution({ id: editingInstitution.id, ...data });
    } else {
      onCreateInstitution(data);
    }
    setEditingInstitution(null);
  };

  const handleCloseModal = (open: boolean) => {
    setModalOpen(open);
    if (!open) setEditingInstitution(null);
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Instituições
          </CardTitle>
          <Button size="sm" onClick={() => setModalOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Nova
          </Button>
        </CardHeader>
        <CardContent>
          {institutions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhuma instituição cadastrada
            </p>
          ) : (
            <div className="space-y-2">
              {institutions.map((institution) => (
                <div
                  key={institution.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className="text-2xl w-10 h-10 flex items-center justify-center rounded-lg"
                      style={{ backgroundColor: `${institution.color}20` }}
                    >
                      {institution.icon}
                    </span>
                    <span className="font-medium">{institution.name}</span>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleEdit(institution)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeleteId(institution.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <InstitutionModal
        open={modalOpen}
        onOpenChange={handleCloseModal}
        institution={editingInstitution}
        onSubmit={handleSubmit}
      />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir instituição?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Os ativos vinculados a esta instituição ficarão sem instituição.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteId) onDeleteInstitution(deleteId);
                setDeleteId(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
