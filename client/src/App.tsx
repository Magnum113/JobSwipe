import { useState, useEffect } from "react";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TabBar, type TabType } from "@/components/TabBar";
import VacanciesPage from "@/pages/VacanciesPage";
import HistoryPage from "@/pages/HistoryPage";
import Profile from "@/pages/Profile";

function AppContent() {
  const [activeTab, setActiveTab] = useState<TabType>("vacancies");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const userId = params.get("userId");
    const hhAuth = params.get("hhAuth");
    
    if (userId) {
      localStorage.setItem("userId", userId);
    }
    
    if (hhAuth === "success") {
      setActiveTab("profile");
      window.history.replaceState({}, "", window.location.pathname);
    } else if (hhAuth === "error") {
      console.error("HH.ru OAuth failed");
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <main className="flex-1 overflow-auto">
        {activeTab === "vacancies" && <VacanciesPage />}
        {activeTab === "history" && <HistoryPage />}
        {activeTab === "profile" && <Profile />}
      </main>
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AppContent />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
