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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DeleteCategoryModal } from "@/components/modals/DeleteCategoryModal";
import { Plus, ChevronRight, Pencil, Trash2, CornerDownRight, GripVertical, MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  closestCenter,
} from "@dnd-kit/core";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";

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

interface DraggableSubcategoryProps {
  category: Category;
  onEdit: (category: Category) => void;
  onDelete: (category: Category) => void;
}

function DraggableSubcategory({ category, onEdit, onDelete }: DraggableSubcategoryProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: category.id,
    data: { category },
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center px-4 py-3 pl-12 hover:bg-muted/50 transition-colors border-t border-border/50",
        isDragging && "bg-muted"
      )}
    >
      <button
        {...listeners}
        {...attributes}
        className="mr-2 p-1 rounded cursor-grab hover:bg-muted active:cursor-grabbing"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </button>
      <CornerDownRight className="h-4 w-4 text-muted-foreground mr-3" />
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <span className="font-medium text-foreground truncate">{category.name}</span>
      </div>

      <div
        className="w-3 h-3 rounded-full flex-shrink-0 mx-2 md:mx-4"
        style={{ backgroundColor: category.color || "#6B7280" }}
      />

      {/* Desktop Actions */}
      <div className="hidden md:flex items-center gap-1">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => onEdit(category)}
        >
          <Pencil className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive"
          onClick={() => onDelete(category)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Mobile Actions */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild className="md:hidden">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => onEdit(category)}>
            <Pencil className="h-4 w-4 mr-2" />
            Editar
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={() => onDelete(category)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

interface DroppableParentCategoryProps {
  category: Category;
  subcategories: Category[];
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEdit: (category: Category) => void;
  onDelete: (category: Category) => void;
  onAddSubcategory: (category: Category) => void;
}

function DroppableParentCategory({
  category,
  subcategories,
  isExpanded,
  onToggleExpand,
  onEdit,
  onDelete,
  onAddSubcategory,
}: DroppableParentCategoryProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: `drop-${category.id}`,
    data: { parentId: category.id },
  });

  const hasSubcategories = subcategories.length > 0;

  return (
    <Collapsible open={isExpanded} onOpenChange={hasSubcategories ? onToggleExpand : undefined}>
      <div
        ref={setNodeRef}
        className={cn(
          "flex items-center px-4 py-3 hover:bg-muted/50 transition-colors",
          isOver && "bg-primary/10 ring-2 ring-primary ring-inset"
        )}
      >
        <CollapsibleTrigger asChild disabled={!hasSubcategories}>
          <button 
            className="mr-2 p-1 rounded hover:bg-muted disabled:opacity-0"
            onClick={(e) => {
              e.stopPropagation();
              if (hasSubcategories) onToggleExpand();
            }}
          >
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
          {isOver && (
            <span className="text-xs text-primary font-medium">Soltar aqui</span>
          )}
        </div>

        <div
          className="w-4 h-4 rounded-full flex-shrink-0 mx-2 md:mx-4"
          style={{ backgroundColor: category.color || "#6B7280" }}
        />

        {/* Desktop Actions */}
        <div className="hidden md:flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onEdit(category)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => onAddSubcategory(category)}
          >
            <Plus className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={() => onDelete(category)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        {/* Mobile Actions */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild className="md:hidden">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => onEdit(category)}>
              <Pencil className="h-4 w-4 mr-2" />
              Editar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onAddSubcategory(category)}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Subcategoria
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => onDelete(category)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CollapsibleContent>
        {subcategories.map((sub) => (
          <DraggableSubcategory
            key={sub.id}
            category={sub}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function Categories() {
  const { categories, expenseCategories, isLoading, createCategory, updateCategory } = useCategories();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState("📦");
  const [newColor, setNewColor] = useState("#3B82F6");
  const [parentId, setParentId] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Build hierarchical structure
  const parentCategories = expenseCategories.filter(c => !c.parent_id);
  const getSubcategories = (parentId: string) => 
    expenseCategories.filter(c => c.parent_id === parentId);

  const activeCategory = activeId 
    ? expenseCategories.find(c => c.id === activeId) 
    : null;

  const toggleExpand = (id: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedCategories(newExpanded);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over) return;

    const draggedCategoryId = active.id as string;
    const droppedOnId = over.id as string;

    // Extract the parent ID from the droppable ID (format: "drop-{parentId}")
    const newParentId = droppedOnId.startsWith("drop-") 
      ? droppedOnId.replace("drop-", "") 
      : null;

    if (!newParentId) return;

    const draggedCategory = expenseCategories.find(c => c.id === draggedCategoryId);
    
    // Don't allow dropping on the same parent
    if (draggedCategory?.parent_id === newParentId) return;

    // Don't allow dropping a parent category
    if (!draggedCategory?.parent_id) return;

    // Update the category's parent
    await updateCategory.mutateAsync({
      id: draggedCategoryId,
      parent_id: newParentId,
    });

    // Expand the target category
    setExpandedCategories(prev => new Set([...prev, newParentId]));
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

  const handleDeleteCategory = (category: Category) => {
    setCategoryToDelete(category);
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
          <p className="text-muted-foreground">Gerencie suas categorias e subcategorias. Arraste subcategorias para movê-las.</p>
        </div>
        <Dialog open={isAddOpen} onOpenChange={(open) => { setIsAddOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nova Categoria
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[85vh] overflow-y-auto">
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
        <DialogContent className="max-h-[85vh] overflow-y-auto">
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

      {/* Categories List with DnD */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="bg-card rounded-xl border border-border shadow-card">
          <ScrollArea className="h-[calc(100dvh-220px)]">
            <div className="divide-y divide-border">
              {parentCategories.map((category) => {
                const subcategories = getSubcategories(category.id);
                const isExpanded = expandedCategories.has(category.id);

                return (
                  <DroppableParentCategory
                    key={category.id}
                    category={category}
                    subcategories={subcategories}
                    isExpanded={isExpanded}
                    onToggleExpand={() => toggleExpand(category.id)}
                    onEdit={openEditDialog}
                    onDelete={handleDeleteCategory}
                    onAddSubcategory={openAddSubcategory}
                  />
                );
              })}
            </div>
          </ScrollArea>
        </div>

        <DragOverlay>
          {activeCategory && (
            <div className="flex items-center px-4 py-3 bg-card border border-border rounded-lg shadow-lg">
              <GripVertical className="h-4 w-4 text-muted-foreground mr-2" />
              <CornerDownRight className="h-4 w-4 text-muted-foreground mr-3" />
              <span className="font-medium text-foreground">{activeCategory.name}</span>
              <div
                className="w-3 h-3 rounded-full ml-4"
                style={{ backgroundColor: activeCategory.color || "#6B7280" }}
              />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Delete Category Modal */}
      <DeleteCategoryModal
        category={categoryToDelete}
        isOpen={!!categoryToDelete}
        onClose={() => setCategoryToDelete(null)}
        onConfirm={() => setCategoryToDelete(null)}
      />
    </div>
  );
}
