import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useProjects } from "@/hooks/useProjects";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { ProjectModal } from "@/components/projects/ProjectModal";
import { ProjectDetailSheet } from "@/components/projects/ProjectDetailSheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useListSearchSort } from "@/hooks/useListSearchSort";
import { ListSearchInput } from "@/components/ui/list-search-input";
import { ListSortButtons } from "@/components/ui/list-sort-buttons";
import type { Project } from "@/hooks/useProjects";

export default function Projects() {
  const { projects, activeProjects, isLoading, createProject, updateProject, deleteProject, linkTransactions, unlinkTransaction } = useProjects();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<"active" | "all">("active");

  const baseProjects = statusFilter === "active" ? activeProjects : projects;

  const { query, setQuery, sort, toggleSort, items: displayedProjects } = useListSearchSort(baseProjects, {
    searchAccessors: [(p) => p.name, (p) => p.description],
    sortAccessors: {
      name: (p) => p.name,
      target: (p) => Number(p.target_amount),
      spent: (p) => Number(p.spent_amount),
      created: (p) => new Date(p.created_at),
    },
  });

  const handleCreate = async (data: { name: string; description: string | null; target_amount: number; icon: string; color: string }) => {
    await createProject.mutateAsync(data);
  };

  const handleEdit = async (data: { name: string; description: string | null; target_amount: number; icon: string; color: string }) => {
    if (editingProject) {
      await updateProject.mutateAsync({ id: editingProject.id, ...data });
      setEditingProject(null);
      // Refresh detail if open
      if (selectedProject?.id === editingProject.id) {
        setSelectedProject({ ...selectedProject, ...data } as Project);
      }
    }
  };

  const handleDelete = async () => {
    if (selectedProject) {
      await deleteProject.mutateAsync(selectedProject.id);
      setDetailOpen(false);
      setSelectedProject(null);
    }
  };

  const handleStatusChange = async (status: "active" | "completed" | "cancelled") => {
    if (selectedProject) {
      await updateProject.mutateAsync({ id: selectedProject.id, status });
      setSelectedProject({ ...selectedProject, status });
    }
  };

  const handleLink = async (transactionIds: string[]) => {
    if (selectedProject) {
      await linkTransactions.mutateAsync({ projectId: selectedProject.id, transactionIds });
    }
  };

  const handleUnlink = async (transactionId: string) => {
    await unlinkTransaction.mutateAsync(transactionId);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Projetos</h1>
          <p className="text-sm text-muted-foreground">Gerencie orçamentos para eventos e metas</p>
        </div>
        <Button onClick={() => { setEditingProject(null); setModalOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Projeto
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
        <ListSearchInput
          value={query}
          onChange={setQuery}
          placeholder="Buscar projeto..."
          className="sm:max-w-xs"
        />
        <div className="flex items-center gap-2 sm:ml-auto">
          <ListSortButtons
            options={[
              { key: "name", label: "Nome" },
              { key: "target", label: "Meta" },
              { key: "spent", label: "Gasto" },
              { key: "created", label: "Criado" },
            ]}
            activeField={sort.field}
            direction={sort.direction}
            onSort={toggleSort}
          />
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "active" | "all")}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Ativos</SelectItem>
              <SelectItem value="all">Todos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : baseProjects.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-4xl mb-2">📦</p>
          <p className="text-muted-foreground">
            {statusFilter === "active" ? "Nenhum projeto ativo" : "Nenhum projeto encontrado"}
          </p>
          <Button variant="outline" className="mt-4" onClick={() => { setEditingProject(null); setModalOpen(true); }}>
            Criar primeiro projeto
          </Button>
        </div>
      ) : displayedProjects.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Nenhum projeto corresponde à busca.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayedProjects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onClick={() => {
                setSelectedProject(project);
                setDetailOpen(true);
              }}
            />
          ))}
        </div>
      )}

      {/* Create/Edit Modal */}
      <ProjectModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        project={editingProject}
        onSave={editingProject ? handleEdit : handleCreate}
        isPending={createProject.isPending || updateProject.isPending}
      />

      {/* Detail Sheet */}
      {selectedProject && (
        <ProjectDetailSheet
          open={detailOpen}
          onOpenChange={setDetailOpen}
          project={selectedProject}
          onEdit={() => {
            setEditingProject(selectedProject);
            setModalOpen(true);
          }}
          onDelete={handleDelete}
          onStatusChange={handleStatusChange}
          onLinkTransactions={handleLink}
          onUnlinkTransaction={handleUnlink}
          isLinking={linkTransactions.isPending}
        />
      )}
    </div>
  );
}
