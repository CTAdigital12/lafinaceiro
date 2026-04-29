import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Save, Bell, Palette, Globe, Shield, User, Users, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { MembersSection } from "@/components/settings/MembersSection";
import { InstallmentMigration } from "@/components/settings/InstallmentMigration";
import { useAuth } from "@/contexts/AuthContext";

export default function Settings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState({
    email: true,
    push: false,
    budgetAlerts: true,
    billReminders: true,
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-muted-foreground">Personalize sua experiência</p>
      </div>

      {/* Settings Tabs */}
      <Tabs defaultValue="preferences" className="space-y-6">
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <TabsList className="bg-muted/50 p-1 w-max md:w-auto">
            <TabsTrigger value="preferences" className="gap-2">
              <Globe className="h-4 w-4" />
              <span className="hidden sm:inline">Preferências</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-2">
              <Bell className="h-4 w-4" />
              <span className="hidden sm:inline">Alertas</span>
            </TabsTrigger>
            <TabsTrigger value="appearance" className="gap-2">
              <Palette className="h-4 w-4" />
              <span className="hidden sm:inline">Aparência</span>
            </TabsTrigger>
            <TabsTrigger value="members" className="gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Membros</span>
            </TabsTrigger>
            <TabsTrigger value="tools" className="gap-2">
              <Wrench className="h-4 w-4" />
              <span className="hidden sm:inline">Ferramentas</span>
            </TabsTrigger>
            <TabsTrigger value="account" className="gap-2">
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">Conta</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Preferences Tab */}
        <TabsContent value="preferences" className="space-y-6">
          <div className="bg-card rounded-xl border border-border p-6 shadow-card">
            <h3 className="text-lg font-semibold text-foreground mb-4">Preferências Gerais</h3>
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="currency">Moeda</Label>
                  <Select defaultValue="brl">
                    <SelectTrigger id="currency">
                      <SelectValue placeholder="Selecione a moeda" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="brl">R$ - Real Brasileiro</SelectItem>
                      <SelectItem value="usd">$ - Dólar Americano</SelectItem>
                      <SelectItem value="eur">€ - Euro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="language">Idioma</Label>
                  <Select defaultValue="pt-br">
                    <SelectTrigger id="language">
                      <SelectValue placeholder="Selecione o idioma" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pt-br">Português (Brasil)</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="es">Español</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="dateFormat">Formato de Data</Label>
                  <Select defaultValue="dd-mm-yyyy">
                    <SelectTrigger id="dateFormat">
                      <SelectValue placeholder="Selecione o formato" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dd-mm-yyyy">DD/MM/AAAA</SelectItem>
                      <SelectItem value="mm-dd-yyyy">MM/DD/AAAA</SelectItem>
                      <SelectItem value="yyyy-mm-dd">AAAA-MM-DD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="startWeek">Início da Semana</Label>
                  <Select defaultValue="sunday">
                    <SelectTrigger id="startWeek">
                      <SelectValue placeholder="Selecione o dia" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sunday">Domingo</SelectItem>
                      <SelectItem value="monday">Segunda-feira</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Notifications Tab */}
        <TabsContent value="notifications" className="space-y-6">
          <div className="bg-card rounded-xl border border-border p-6 shadow-card">
            <h3 className="text-lg font-semibold text-foreground mb-4">Configurações de Alertas</h3>
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Notificações por E-mail</Label>
                  <p className="text-sm text-muted-foreground">
                    Receba atualizações importantes por e-mail
                  </p>
                </div>
                <Switch
                  checked={notifications.email}
                  onCheckedChange={(checked) =>
                    setNotifications({ ...notifications, email: checked })
                  }
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Notificações Push</Label>
                  <p className="text-sm text-muted-foreground">
                    Receba notificações no navegador
                  </p>
                </div>
                <Switch
                  checked={notifications.push}
                  onCheckedChange={(checked) =>
                    setNotifications({ ...notifications, push: checked })
                  }
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Alertas de Orçamento</Label>
                  <p className="text-sm text-muted-foreground">
                    Seja notificado quando atingir limites de orçamento
                  </p>
                </div>
                <Switch
                  checked={notifications.budgetAlerts}
                  onCheckedChange={(checked) =>
                    setNotifications({ ...notifications, budgetAlerts: checked })
                  }
                />
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Lembretes de Contas</Label>
                  <p className="text-sm text-muted-foreground">
                    Receba lembretes de contas a vencer
                  </p>
                </div>
                <Switch
                  checked={notifications.billReminders}
                  onCheckedChange={(checked) =>
                    setNotifications({ ...notifications, billReminders: checked })
                  }
                />
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Appearance Tab */}
        <TabsContent value="appearance" className="space-y-6">
          <div className="bg-card rounded-xl border border-border p-6 shadow-card">
            <h3 className="text-lg font-semibold text-foreground mb-4">Aparência</h3>
            <div className="space-y-6">
              <div className="space-y-3">
                <Label>Tema</Label>
                <div className="grid grid-cols-3 gap-3">
                  <button className="flex flex-col items-center gap-2 p-4 rounded-lg border-2 border-primary bg-muted/50 transition-all">
                    <div className="w-12 h-8 rounded bg-white border" />
                    <span className="text-sm font-medium">Claro</span>
                  </button>
                  <button className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border hover:border-primary/50 transition-all">
                    <div className="w-12 h-8 rounded bg-slate-900" />
                    <span className="text-sm font-medium">Escuro</span>
                  </button>
                  <button className="flex flex-col items-center gap-2 p-4 rounded-lg border border-border hover:border-primary/50 transition-all">
                    <div className="w-12 h-8 rounded bg-gradient-to-r from-white to-slate-900" />
                    <span className="text-sm font-medium">Sistema</span>
                  </button>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <Label>Cor de Destaque</Label>
                <div className="flex gap-3">
                  {["#3B82F6", "#22C55E", "#8B5CF6", "#F59E0B", "#EF4444", "#EC4899"].map(
                    (color) => (
                      <button
                        key={color}
                        className="w-8 h-8 rounded-full ring-2 ring-offset-2 ring-transparent hover:ring-primary transition-all"
                        style={{ backgroundColor: color }}
                      />
                    )
                  )}
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Members Tab */}
        <TabsContent value="members" className="space-y-6">
          <div className="bg-card rounded-xl border border-border p-6 shadow-card">
            <h3 className="text-lg font-semibold text-foreground mb-4">Gerenciar Acesso</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Convide pessoas para visualizar e gerenciar seus dados financeiros
            </p>
            <MembersSection />
          </div>
        </TabsContent>

        {/* Tools Tab */}
        <TabsContent value="tools" className="space-y-6">
          <div className="bg-card rounded-xl border border-border p-6 shadow-card">
            <h3 className="text-lg font-semibold text-foreground mb-4">Ferramentas de Manutenção</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Utilitários para organizar e corrigir seus dados financeiros
            </p>
            <InstallmentMigration />
          </div>
        </TabsContent>

        {/* Account Tab */}
        <TabsContent value="account" className="space-y-6">
          <div className="bg-card rounded-xl border border-border p-6 shadow-card">
            <h3 className="text-lg font-semibold text-foreground mb-4">Informações da Conta</h3>
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome</Label>
                  <Input
                    id="name"
                    defaultValue={
                      typeof user?.user_metadata?.full_name === "string"
                        ? (user.user_metadata.full_name as string)
                        : "Usuário"
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input id="email" type="email" defaultValue={user?.email || ""} readOnly />
                </div>
              </div>

              <Separator />

              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-lg bg-expense/10 flex items-center justify-center">
                  <Shield className="h-6 w-6 text-expense" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-foreground">Segurança</p>
                  <p className="text-sm text-muted-foreground">
                    Altere sua senha e configure autenticação de dois fatores
                  </p>
                </div>
                <Button variant="outline" onClick={() => navigate("/settings/security")}>
                  Configurar
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button className="gap-2">
          <Save className="h-4 w-4" />
          Salvar Alterações
        </Button>
      </div>
    </div>
  );
}
