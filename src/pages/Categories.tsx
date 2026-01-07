import { useState } from "react";
import { useCategories, Category } from "@/hooks/useCategories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, ChevronRight, Pencil, Trash2, CornerDownRight } from "lucide-react";
import { cn } from "@/lib/utils";

const colorOptions = [
  "#EF4444", "#F97316", "#F59E0B", "#EAB308", "#84CC16",
  "#22C55E", "#14B8A6", "#06B6D4", "#3B82F6", "#6366F1",
  "#8B5CF6", "#A855F7", "#EC4899", "#F43F5E", "#6B7280"
];

const emojiOptions = [
  "🍔", "🍽️", "🛒", "🏠", "💡", "🚗", "⛽", "🚌", "✈️", "🏨",
  "🎬", "🎮", "🎯", "🎪", "📚", "💊", "🏥", "💪", "👕", "💇",
  "🐕", "🐈", "🌱", "💰", "💳", "📱", "💻", "📦", "🎁", "☕"
];

export default function Categories() {
  const { categories, expenseCategories, isLoading, createCategory, updateCategory, deleteCategory } = useCategories();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("📦");
  const [newColor, setNewColor] = useState("#3B82F6");
  const [parentId, setParentId] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // Build hierarchical structure
  const parentCategories = expenseCategories.filter(c => !c.parent_id);
  const getSubcategories = (parentId: string) => 
    expenseCategories.filter(c => c.parent_id === parentId);

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedCategories(newExpanded);
  };

  const handleAddCategory = async () => {
    if (!newName.trim()) return;
    
    await createCategory.mutateAsync({
      name: newName.trim(),
      icon: newIcon,
      color: newColor,
      type: "expense",
      parent_id: parentId,
    });
    
    resetForm();
    setIsAddOpen(false);
  };

  const handleUpdateCategory = async () => {
    if (!editingCategory || !newName.trim()) return;
    
    await updateCategory.mutateAsync({
      id: editingCategory.id,
      name: newName.trim(),
      icon: newIcon,
      color: newColor,
    });
    
    resetForm();
    setEditingCategory(null);
  };

  const handleDeleteCategory = async (id: string) => {
    await deleteCategory.mutateAsync(id);
  };

  const resetForm = () => {
    setNewName("");
    setNewIcon("📦");
    setNewColor("#3B82F6");
    setParentId(null);
  };

  const openEditDialog = (category: Category) => {
    setEditingCategory(category);
    setNewName(category.name);
    setNewIcon(category.icon || "📦");
    setNewColor(category.color || "#3B82F6");
  };

  const openAddSubcategory = (parentCategory: Category) => {
    setParentId(parentCategory.id);
    setNewColor(parentCategory.color || "#3B82F6");
    setIsAddOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Categorias de Despesas</h1>
          <p className="text-muted-foreground">Gerencie suas categorias e subcategorias</p>
        </div>
        <Dialog open={isAddOpen} onOpenChange={(open) => { setIsAddOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nova Categoria
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {parentId ? "Nova Subcategoria" : "Nova Categoria"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Nome</label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nome da categoria"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Ícone</label>
                <div className="flex flex-wrap gap-2">
                  {emojiOptions.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setNewIcon(emoji)}
                      className={cn(
                        "w-10 h-10 rounded-lg text-xl flex items-center justify-center transition-all",
                        newIcon === emoji
                          ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2"
                          : "bg-muted hover:bg-muted/80"
                      )}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-2 block">Cor</label>
                <div className="flex flex-wrap gap-2">
                  {colorOptions.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setNewColor(color)}
                      className={cn(
                        "w-8 h-8 rounded-full transition-all",
                        newColor === color && "ring-2 ring-offset-2 ring-primary"
                      )}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>
              <Button 
                onClick={handleAddCategory} 
                className="w-full"
                disabled={!newName.trim() || createCategory.isPending}
              >
                {createCategory.isPending ? "Criando..." : "Criar Categoria"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingCategory} onOpenChange={(open) => { if (!open) { setEditingCategory(null); resetForm(); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Categoria</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Nome</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nome da categoria"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Ícone</label>
              <div className="flex flex-wrap gap-2">
                {emojiOptions.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => setNewIcon(emoji)}
                    className={cn(
                      "w-10 h-10 rounded-lg text-xl flex items-center justify-center transition-all",
                      newIcon === emoji
                        ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2"
                        : "bg-muted hover:bg-muted/80"
                    )}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Cor</label>
              <div className="flex flex-wrap gap-2">
                {colorOptions.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setNewColor(color)}
                    className={cn(
                      "w-8 h-8 rounded-full transition-all",
                      newColor === color && "ring-2 ring-offset-2 ring-primary"
                    )}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
            </div>
            <Button 
              onClick={handleUpdateCategory} 
              className="w-full"
              disabled={!newName.trim() || updateCategory.isPending}
            >
              {updateCategory.isPending ? "Salvando..." : "Salvar Alterações"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Categories List */}
      <div className="bg-card rounded-xl border border-border shadow-card">
        <ScrollArea className="h-[calc(100vh-220px)]">
          <div className="divide-y divide-border">
            {parentCategories.map((category) => {
              const subcategories = getSubcategories(category.id);
              const hasSubcategories = subcategories.length > 0;
              const isExpanded = expandedCategories.has(category.id);

              return (
                <Collapsible
                  key={category.id}
                  open={isExpanded}
                  onOpenChange={() => hasSubcategories && toggleExpand(category.id)}
                >
                  <div className="flex items-center px-4 py-3 hover:bg-muted/50 transition-colors">
                    <CollapsibleTrigger asChild disabled={!hasSubcategories}>
                      <button className="mr-2 p-1 rounded hover:bg-muted disabled:opacity-0">
                        <ChevronRight 
                          className={cn(
                            "h-4 w-4 transition-transform",
                            isExpanded && "rotate-90"
                          )} 
                        />
                      </button>
                    </CollapsibleTrigger>
                    
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <span className="text-xl">{category.icon}</span>
                      <span className="font-medium text-foreground truncate">{category.name}</span>
                    </div>

                    <div
                      className="w-4 h-4 rounded-full flex-shrink-0 mx-4"
                      style={{ backgroundColor: category.color || "#6B7280" }}
                    />

                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEditDialog(category)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openAddSubcategory(category)}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir categoria?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Esta ação não pode ser desfeita. Todas as subcategorias também serão excluídas.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDeleteCategory(category.id)}>
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>

                  <CollapsibleContent>
                    {subcategories.map((sub) => (
                      <div
                        key={sub.id}
                        className="flex items-center px-4 py-3 pl-12 hover:bg-muted/50 transition-colors border-t border-border/50"
                      >
                        <CornerDownRight className="h-4 w-4 text-muted-foreground mr-3" />
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <span className="font-medium text-foreground truncate">{sub.name}</span>
                        </div>

                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0 mx-4"
                          style={{ backgroundColor: sub.color || "#6B7280" }}
                        />

                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openEditDialog(sub)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir subcategoria?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Esta ação não pode ser desfeita.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDeleteCategory(sub.id)}>
                                  Excluir
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    ))}
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
