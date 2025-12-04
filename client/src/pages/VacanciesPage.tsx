import { useState } from "react";
import { VacancyCard } from "@/components/VacancyCard";
import { AnimatePresence } from "framer-motion";
import { X, Heart, RotateCcw, Briefcase, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { Job, Resume } from "@shared/schema";

async function fetchUnswipedJobs(): Promise<Job[]> {
  const response = await fetch("/api/jobs/unswiped");
  if (!response.ok) {
    throw new Error("Failed to fetch jobs");
  }
  return response.json();
}

async function fetchResume(): Promise<Resume | { content: string }> {
  const response = await fetch("/api/resume");
  if (!response.ok) {
    throw new Error("Failed to fetch resume");
  }
  return response.json();
}

async function recordSwipe(jobId: number, direction: "left" | "right") {
  const response = await fetch("/api/swipes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId, direction }),
  });
  if (!response.ok) {
    throw new Error("Failed to record swipe");
  }
  return response.json();
}

async function generateCoverLetter(resume: string, vacancy: Job): Promise<string> {
  const response = await fetch("/api/cover-letter/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ resume, vacancy }),
  });
  if (!response.ok) {
    throw new Error("Failed to generate cover letter");
  }
  const data = await response.json();
  return data.coverLetter;
}

async function createApplication(data: {
  jobId: number;
  jobTitle: string;
  company: string;
  coverLetter: string;
  status: string;
}) {
  const response = await fetch("/api/applications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  if (!response.ok) {
    throw new Error("Failed to create application");
  }
  return response.json();
}

export default function VacanciesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  
  const { data: jobs = [], isLoading: jobsLoading } = useQuery({
    queryKey: ["jobs", "unswiped"],
    queryFn: fetchUnswipedJobs,
  });

  const { data: resume } = useQuery({
    queryKey: ["resume"],
    queryFn: fetchResume,
  });

  const swipeMutation = useMutation({
    mutationFn: ({ jobId, direction }: { jobId: number; direction: "left" | "right" }) =>
      recordSwipe(jobId, direction),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs", "unswiped"] });
    },
  });

  const applicationMutation = useMutation({
    mutationFn: createApplication,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
    },
  });

  const [currentIndex, setCurrentIndex] = useState(0);
  const [history, setHistory] = useState<number[]>([]);

  const currentJobs = jobs.slice(currentIndex);

  const handleSwipe = async (direction: "left" | "right") => {
    if (currentJobs.length === 0 || isGenerating) return;

    const currentJob = currentJobs[0];
    
    // Record the swipe
    swipeMutation.mutate({ jobId: currentJob.id, direction });
    
    // If swiped right, generate cover letter with AI and create application
    if (direction === "right") {
      setIsGenerating(true);
      
      try {
        const resumeContent = resume?.content || "";
        const coverLetter = await generateCoverLetter(resumeContent, currentJob);
        
        await applicationMutation.mutateAsync({
          jobId: currentJob.id,
          jobTitle: currentJob.title,
          company: currentJob.company,
          coverLetter,
          status: "Отклик отправлен",
        });
        
        toast({
          title: "Отклик отправлен!",
          description: `Сопроводительное письмо для ${currentJob.company} сгенерировано`,
        });
      } catch (error) {
        console.error("Error creating application:", error);
        toast({
          title: "Ошибка",
          description: "Не удалось создать отклик",
          variant: "destructive",
        });
      } finally {
        setIsGenerating(false);
      }
    }
    
    setHistory([...history, currentIndex]);
    setCurrentIndex(currentIndex + 1);
  };

  const handleUndo = () => {
    if (history.length === 0) return;
    const previousIndex = history[history.length - 1];
    setHistory(history.slice(0, -1));
    setCurrentIndex(previousIndex);
  };

  const handleReset = () => {
    setCurrentIndex(0);
    setHistory([]);
    queryClient.invalidateQueries({ queryKey: ["jobs", "unswiped"] });
  };

  if (jobsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-500">Загрузка вакансий...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full pb-20 relative">
      {/* Decorative background elements */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-blue-200/20 blur-3xl" />
        <div className="absolute top-[40%] -right-[10%] w-[40%] h-[60%] rounded-full bg-indigo-200/20 blur-3xl" />
      </div>

      <header className="mb-6 text-center z-10 pt-6">
         <div className="inline-flex items-center justify-center p-3 bg-white rounded-2xl shadow-sm mb-3">
            <Briefcase className="w-6 h-6 text-indigo-600 mr-2" />
            <span className="font-bold text-gray-900 tracking-tight">JobSwipe</span>
         </div>
         <p className="text-gray-500 font-medium text-sm">Свайпни вправо, чтобы откликнуться</p>
      </header>

      {/* Generating indicator */}
      {isGenerating && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white/95 backdrop-blur-sm p-6 rounded-2xl shadow-xl flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
          <p className="text-gray-700 font-medium">Генерируем сопроводительное...</p>
        </div>
      )}

      <div className="relative w-full max-w-[400px] h-[500px] flex justify-center z-20 px-4">
        <AnimatePresence>
          {currentJobs.map((job, index) => {
             if (index > 1) return null;
             
             const isTop = index === 0;
             
             return (
               <div
                 key={job.id}
                 className="absolute w-full h-full flex justify-center"
                 style={{ 
                   zIndex: currentJobs.length - index,
                   scale: isTop ? 1 : 0.95,
                   top: isTop ? 0 : 20,
                   opacity: isTop ? 1 : 0.5,
                   transition: "all 0.3s ease-in-out"
                 }}
               >
                  <VacancyCard 
                    job={job} 
                    onSwipe={handleSwipe} 
                    active={isTop && !isGenerating}
                  />
               </div>
             );
          })}
        </AnimatePresence>
        
        {currentJobs.length === 0 && (
           <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 bg-white/50 rounded-[24px] border-2 border-dashed border-gray-200">
              <div className="bg-white p-4 rounded-full shadow-lg mb-4">
                <Briefcase className="w-8 h-8 text-gray-400" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">Вакансии закончились!</h3>
              <p className="text-gray-500 mb-6">Вы просмотрели все доступные позиции.</p>
              <Button 
                onClick={handleReset} 
                className="rounded-full px-8"
                variant="outline"
                data-testid="button-reset"
              >
                Начать заново
              </Button>
           </div>
        )}
      </div>

      {/* Controls */}
      <div className="mt-8 flex items-center gap-6 z-20">
        <Button
          size="icon"
          variant="outline"
          className="h-14 w-14 rounded-full border-2 border-red-100 bg-white text-red-500 shadow-lg hover:bg-red-50 hover:border-red-200 transition-all hover:scale-110"
          onClick={() => currentJobs.length > 0 && handleSwipe("left")}
          disabled={currentJobs.length === 0 || isGenerating}
          data-testid="button-nope"
        >
          <X className="h-6 w-6" strokeWidth={3} />
        </Button>

        <Button
           size="icon"
           variant="secondary"
           className="h-10 w-10 rounded-full bg-gray-200 text-gray-600 hover:bg-gray-300 shadow-md transition-all hover:scale-105"
           onClick={handleUndo}
           disabled={history.length === 0 || isGenerating}
           data-testid="button-undo"
        >
           <RotateCcw className="h-4 w-4" />
        </Button>

        <Button
          size="icon"
          variant="outline"
          className="h-14 w-14 rounded-full border-2 border-green-100 bg-white text-green-500 shadow-lg hover:bg-green-50 hover:border-green-200 transition-all hover:scale-110"
          onClick={() => currentJobs.length > 0 && handleSwipe("right")}
          disabled={currentJobs.length === 0 || isGenerating}
          data-testid="button-like"
        >
          <Heart className="h-6 w-6" strokeWidth={3} fill="currentColor" />
        </Button>
      </div>
    </div>
  );
}
