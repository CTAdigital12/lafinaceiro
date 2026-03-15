import { ReactNode, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { Header } from "./Header";
import { BottomNav } from "./BottomNav";
import { useAuth } from "@/contexts/AuthContext";
import { useDate } from "@/contexts/DateContext";
import { Loader2 } from "lucide-react";

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const { currentDate, setCurrentDate } = useDate();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // SECURITY: Immediate redirect if not authenticated
    // This runs before any content is rendered
    if (!loading && !user) {
      navigate("/auth", { replace: true });
    }
  }, [user, loading, navigate]);

  // SECURITY: Show nothing during loading or if not authenticated
  // This prevents any flash of protected content
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // SECURITY: Return null immediately if no user
  // This ensures no protected content renders before redirect
  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Sidebar - hidden on mobile */}
      <div className="hidden md:block">
        <AppSidebar />
      </div>
      
      {/* Main content */}
      <div className="md:pl-16 lg:pl-64 transition-all duration-300">
        <Header currentDate={currentDate} onDateChange={setCurrentDate} />
        <main className="p-4 md:p-6 pb-24 md:pb-6">{children}</main>
      </div>
      
      {/* Bottom Navigation - only on mobile */}
      <BottomNav />
    </div>
  );
}
