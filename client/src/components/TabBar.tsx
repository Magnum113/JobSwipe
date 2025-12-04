import { Briefcase, Search, History, User } from "lucide-react";
import { cn } from "@/lib/utils";

export type TabType = "vacancies" | "search" | "history" | "profile";

interface TabBarProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
  { id: "vacancies", label: "Вакансии", icon: <Briefcase className="w-5 h-5" /> },
  { id: "search", label: "Поиск", icon: <Search className="w-5 h-5" /> },
  { id: "history", label: "История", icon: <History className="w-5 h-5" /> },
  { id: "profile", label: "Профиль", icon: <User className="w-5 h-5" /> },
];

export function TabBar({ activeTab, onTabChange }: TabBarProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 shadow-lg z-50">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "flex flex-col items-center justify-center flex-1 h-full gap-1 transition-colors",
              activeTab === tab.id
                ? "text-indigo-600"
                : "text-gray-400 hover:text-gray-600"
            )}
            data-testid={`tab-${tab.id}`}
          >
            {tab.icon}
            <span className="text-xs font-medium">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
