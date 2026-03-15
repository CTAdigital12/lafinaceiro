import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { CashFlowTab } from "@/components/reports/CashFlowTab";
import { ExpenseXRayTab } from "@/components/reports/ExpenseXRayTab";
import { NetWorthTab } from "@/components/reports/NetWorthTab";
import { ProjectsPlanningTab } from "@/components/reports/ProjectsPlanningTab";

export default function Reports() {
  return (
    <div className="space-y-4 overflow-x-hidden">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Relatórios</h1>
        <p className="text-sm text-muted-foreground">Inteligência financeira completa</p>
      </div>

      <Tabs defaultValue="fluxo" className="space-y-4">
        <ScrollArea className="w-full" type="scroll">
          <TabsList className="w-max">
            <TabsTrigger value="fluxo">Fluxo de Caixa</TabsTrigger>
            <TabsTrigger value="raio-x">Raio-X</TabsTrigger>
            <TabsTrigger value="patrimonio">Patrimônio</TabsTrigger>
            <TabsTrigger value="projetos">Projetos</TabsTrigger>
          </TabsList>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        <TabsContent value="fluxo">
          <CashFlowTab />
        </TabsContent>
        <TabsContent value="raio-x">
          <ExpenseXRayTab />
        </TabsContent>
        <TabsContent value="patrimonio">
          <NetWorthTab />
        </TabsContent>
        <TabsContent value="projetos">
          <ProjectsPlanningTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
