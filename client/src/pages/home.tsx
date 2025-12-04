import { useState } from "react";
import { VacancyCard, Job } from "@/components/VacancyCard";
import { AnimatePresence, motion } from "framer-motion";
import { X, Heart, RotateCcw, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";

const MOCK_JOBS: Job[] = [
  {
    title: "Product Marketing Manager – Marketplace",
    company: "05.ru",
    salary: "150–200k",
    description: "Оптимизация воронки, аналитика продаж, GA4, CRM. Мы ищем человека, который сможет вывести наш маркетплейс на новый уровень.",
    tags: ["Marketing", "Analytics", "Growth"]
  },
  {
    title: "Data Analyst – Retail & eCommerce",
    company: "X5 Tech",
    salary: "200–260k",
    description: "SQL, Python, ClickHouse, построение витрин. Работа с большими данными и влияние на принятие продуктовых решений.",
    tags: ["Data", "SQL", "Python"]
  },
  {
    title: "Product Manager – Digital Banking",
    company: "T-Bank",
    salary: "230–300k",
    description: "Разработка мобильных фич, A/B тесты, CJM. Лидирование продуктовой команды и развитие мобильного приложения банка.",
    tags: ["Product", "Fintech", "Mobile"]
  },
  {
    title: "Frontend Developer – React Core",
    company: "Yandex",
    salary: "250–350k",
    description: "Разработка сложных интерфейсов, оптимизация производительности, архитектура фронтенда. Стек: React, TypeScript, Effector.",
    tags: ["Frontend", "React", "TypeScript"]
  },
  {
    title: "UX/UI Designer – Design System",
    company: "Avito",
    salary: "180–240k",
    description: "Развитие дизайн-системы, создание компонентов, работа над консистентностью интерфейсов всего продукта.",
    tags: ["Design", "Figma", "UI/UX"]
  }
];

export default function Home() {
  const [jobs, setJobs] = useState<Job[]>(MOCK_JOBS);
  const [history, setHistory] = useState<Job[]>([]);
  const [lastDirection, setLastDirection] = useState<string | null>(null);

  const removeCard = (direction: "left" | "right") => {
    setLastDirection(direction);
    const removedJob = jobs[0];
    setHistory([...history, removedJob]);
    setJobs(jobs.slice(1));
  };

  const handleSwipe = (direction: "left" | "right") => {
    removeCard(direction);
  };

  const handleUndo = () => {
    if (history.length > 0) {
      const previousJob = history[history.length - 1];
      setJobs([previousJob, ...jobs]);
      setHistory(history.slice(0, -1));
      setLastDirection(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center overflow-hidden py-8 relative">
      {/* Decorative background elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-blue-200/20 blur-3xl" />
        <div className="absolute top-[40%] -right-[10%] w-[40%] h-[60%] rounded-full bg-indigo-200/20 blur-3xl" />
      </div>

      <header className="mb-8 text-center z-10">
         <div className="inline-flex items-center justify-center p-3 bg-white rounded-2xl shadow-sm mb-4">
            <Briefcase className="w-6 h-6 text-indigo-600 mr-2" />
            <span className="font-bold text-gray-900 tracking-tight">JobSwipe</span>
         </div>
         <p className="text-gray-500 font-medium">Find your dream job, one swipe at a time</p>
      </header>

      <div className="relative w-full max-w-[400px] h-[550px] flex justify-center z-20 px-4">
        <AnimatePresence>
          {jobs.map((job, index) => {
             // Only render the top 2 cards for performance, but mostly just the top one is interactive
             if (index > 1) return null;
             
             const isTop = index === 0;
             
             return (
               <div
                 key={job.title + job.company}
                 className="absolute w-full h-full flex justify-center"
                 style={{ 
                   zIndex: jobs.length - index,
                   scale: isTop ? 1 : 0.95,
                   top: isTop ? 0 : 20,
                   opacity: isTop ? 1 : 0.5,
                   transition: "all 0.3s ease-in-out"
                 }}
               >
                  <VacancyCard 
                    job={job} 
                    onSwipe={handleSwipe} 
                    active={isTop}
                  />
               </div>
             );
          })}
        </AnimatePresence>
        
        {jobs.length === 0 && (
           <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 bg-white/50 rounded-[24px] border-2 border-dashed border-gray-200">
              <div className="bg-white p-4 rounded-full shadow-lg mb-4">
                <Briefcase className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">No more jobs!</h3>
              <p className="text-gray-500 mb-6">You've swiped through all available positions.</p>
              <Button 
                onClick={() => setJobs(MOCK_JOBS)} 
                className="rounded-full px-8"
                variant="outline"
              >
                Start Over
              </Button>
           </div>
        )}
      </div>

      {/* Controls */}
      <div className="mt-10 flex items-center gap-6 z-20">
        <Button
          size="icon"
          variant="outline"
          className="h-14 w-14 rounded-full border-2 border-red-100 bg-white text-red-500 shadow-lg hover:bg-red-50 hover:border-red-200 transition-all hover:scale-110"
          onClick={() => jobs.length > 0 && handleSwipe("left")}
          disabled={jobs.length === 0}
        >
          <X className="h-6 w-6" strokeWidth={3} />
        </Button>

        <Button
           size="icon"
           variant="secondary"
           className="h-10 w-10 rounded-full bg-gray-200 text-gray-600 hover:bg-gray-300 shadow-md transition-all hover:scale-105"
           onClick={handleUndo}
           disabled={history.length === 0}
        >
           <RotateCcw className="h-4 w-4" />
        </Button>

        <Button
          size="icon"
          variant="outline"
          className="h-14 w-14 rounded-full border-2 border-green-100 bg-white text-green-500 shadow-lg hover:bg-green-50 hover:border-green-200 transition-all hover:scale-110"
          onClick={() => jobs.length > 0 && handleSwipe("right")}
          disabled={jobs.length === 0}
        >
          <Heart className="h-6 w-6 text-green-500/20" strokeWidth={3} fill="currentColor" />
        </Button>
      </div>
    </div>
  );
}
