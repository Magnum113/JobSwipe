import { useState, useEffect, useCallback, useRef } from "react";
import { VacancyCard, VacancyCardRef } from "@/components/VacancyCard";
import { VacancyFullView } from "@/components/VacancyFullView";
import { AnimatePresence } from "framer-motion";
import { X, Heart, RotateCcw, Briefcase, Filter, Search, ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { HHJob, HHJobsResponse, Resume } from "@shared/schema";

interface HHFilters {
  text: string;
  area: string;
  employment: string;
  schedule: string;
  experience: string;
}

async function fetchHHJobs(filters: HHFilters, batch: number): Promise<HHJobsResponse> {
  const params = new URLSearchParams();
  if (filters.text) params.append("text", filters.text);
  if (filters.area) params.append("area", filters.area);
  if (filters.employment && filters.employment !== "all") params.append("employment", filters.employment);
  if (filters.schedule && filters.schedule !== "all") params.append("schedule", filters.schedule);
  if (filters.experience && filters.experience !== "all") params.append("experience", filters.experience);
  params.append("batch", String(batch));
  
  const response = await fetch(`/api/hh/jobs?${params.toString()}`);
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

async function createApplication(data: {
  jobId: number;
  jobTitle: string;
  company: string;
  coverLetter: string | null;
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

async function generateCoverLetter(resume: string, vacancy: HHJob): Promise<string> {
  const response = await fetch("/api/cover-letter/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      resume, 
      vacancy: {
        id: parseInt(vacancy.id) || 0,
        title: vacancy.title,
        company: vacancy.company,
        salary: vacancy.salary,
        description: vacancy.description,
        tags: vacancy.tags,
      }
    }),
  });
  if (!response.ok) {
    throw new Error("Failed to generate cover letter");
  }
  const data = await response.json();
  return data.coverLetter;
}

async function updateApplicationCoverLetter(applicationId: number, coverLetter: string) {
  const response = await fetch(`/api/applications/${applicationId}/cover-letter`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ coverLetter }),
  });
  if (!response.ok) {
    throw new Error("Failed to update cover letter");
  }
  return response.json();
}

const AREAS = [
  { value: "1", label: "Москва" },
  { value: "2", label: "Санкт-Петербург" },
  { value: "113", label: "Вся Россия" },
  { value: "1001", label: "Екатеринбург" },
  { value: "4", label: "Новосибирск" },
  { value: "3", label: "Казань" },
];

const EMPLOYMENT_TYPES = [
  { value: "all", label: "Любой тип" },
  { value: "full", label: "Полная занятость" },
  { value: "part", label: "Частичная занятость" },
  { value: "project", label: "Проектная работа" },
];

const SCHEDULES = [
  { value: "all", label: "Любой график" },
  { value: "fullDay", label: "Полный день" },
  { value: "remote", label: "Удалённая работа" },
  { value: "flexible", label: "Гибкий график" },
  { value: "shift", label: "Сменный график" },
];

const EXPERIENCE = [
  { value: "all", label: "Любой опыт" },
  { value: "noExperience", label: "Без опыта" },
  { value: "between1And3", label: "1-3 года" },
  { value: "between3And6", label: "3-6 лет" },
  { value: "moreThan6", label: "Более 6 лет" },
];

export default function VacanciesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isSwiping, setIsSwiping] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [history, setHistory] = useState<number[]>([]);
  const [expandedVacancy, setExpandedVacancy] = useState<HHJob | null>(null);
  const [swipedIds, setSwipedIds] = useState<Set<string>>(new Set());
  
  const [jobs, setJobs] = useState<HHJob[]>([]);
  const [batch, setBatch] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  
  const cardRef = useRef<VacancyCardRef>(null);
  
  const [filters, setFilters] = useState<HHFilters>({
    text: "маркетинг",
    area: "1",
    employment: "all",
    schedule: "all",
    experience: "all",
  });
  
  const { data: hhResponse, isLoading: jobsLoading, refetch } = useQuery({
    queryKey: ["hh-jobs", filters, 1],
    queryFn: () => fetchHHJobs(filters, 1),
    staleTime: 5 * 60 * 1000,
  });

  const { data: resume } = useQuery({
    queryKey: ["resume"],
    queryFn: fetchResume,
  });

  useEffect(() => {
    if (hhResponse) {
      setJobs(hhResponse.jobs);
      setHasMore(hhResponse.hasMore);
      setBatch(1);
      setCurrentIndex(0);
      setHistory([]);
      setSwipedIds(new Set());
    }
  }, [hhResponse]);

  useEffect(() => {
    setCurrentIndex(0);
    setHistory([]);
    setSwipedIds(new Set());
    setBatch(1);
    refetch();
  }, [filters]);

  const applicationMutation = useMutation({
    mutationFn: createApplication,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["applications"] });
    },
  });

  const currentJobs = jobs.slice(currentIndex).filter(job => !swipedIds.has(job.id));

  const lastSwipeRef = useRef<{ jobId: string; time: number } | null>(null);

  const handleSwipe = useCallback((direction: "left" | "right") => {
    if (isSwiping) {
      console.log("SWIPE BLOCKED in parent - isSwiping=true");
      return;
    }
    if (currentJobs.length === 0) {
      console.log("SWIPE BLOCKED in parent - no jobs");
      return;
    }
    
    const currentJob = currentJobs[0];
    const now = Date.now();
    
    if (lastSwipeRef.current && 
        lastSwipeRef.current.jobId === currentJob.id && 
        now - lastSwipeRef.current.time < 500) {
      console.log("SWIPE BLOCKED in parent - duplicate for same job", currentJob.id);
      return;
    }
    
    lastSwipeRef.current = { jobId: currentJob.id, time: now };
    setIsSwiping(true);
    
    console.log("SWIPE HANDLED", direction, currentJob.id);

    if (direction === "right") {
      const fakeJobId = Math.abs(parseInt(currentJob.id) || Math.floor(Math.random() * 1000000));
      
      applicationMutation.mutate({
        jobId: fakeJobId,
        jobTitle: currentJob.title,
        company: currentJob.company,
        coverLetter: null,
        status: "Отклик отправлен",
      }, {
        onSuccess: (application) => {
          toast({
            title: "Отклик отправлен!",
            description: `Сопроводительное письмо генерируется...`,
          });
          
          const resumeContent = resume?.content || "";
          generateCoverLetter(resumeContent, currentJob)
            .then(async (letter) => {
              await updateApplicationCoverLetter(application.id, letter);
              queryClient.invalidateQueries({ queryKey: ["applications"] });
            })
            .catch(async () => {
              await updateApplicationCoverLetter(application.id, "Ошибка генерации письма. Попробуйте обновить страницу.");
              queryClient.invalidateQueries({ queryKey: ["applications"] });
            });
        },
        onError: () => {
          toast({
            title: "Ошибка",
            description: "Не удалось создать отклик",
            variant: "destructive",
          });
        }
      });
    }

    setSwipedIds(prev => {
      const next = new Set(Array.from(prev));
      next.add(currentJob.id);
      return next;
    });
    setHistory(prev => [...prev, currentIndex]);
    setCurrentIndex(prev => prev + 1);
    setExpandedVacancy(null);

    setTimeout(() => setIsSwiping(false), 300);
  }, [isSwiping, currentJobs, currentIndex, resume, applicationMutation, toast, queryClient]);

  const loadMoreJobs = useCallback(async () => {
    if (!hasMore || isLoadingMore) return;
    
    setIsLoadingMore(true);
    try {
      const nextBatch = batch + 1;
      const response = await fetchHHJobs(filters, nextBatch);
      
      setJobs(prev => [...prev, ...response.jobs]);
      setBatch(nextBatch);
      setHasMore(response.hasMore);
    } catch (error) {
      console.error("Failed to load more jobs:", error);
      toast({
        title: "Ошибка",
        description: "Не удалось загрузить ещё вакансии",
        variant: "destructive",
      });
    } finally {
      setIsLoadingMore(false);
    }
  }, [batch, filters, hasMore, isLoadingMore, toast]);

  const triggerSwipe = useCallback(async (direction: "left" | "right") => {
    if (isSwiping || currentJobs.length === 0 || expandedVacancy) return;
    
    if (cardRef.current) {
      await cardRef.current.swipe(direction);
    }
  }, [isSwiping, currentJobs.length, expandedVacancy]);

  const handleUndo = useCallback(() => {
    if (history.length === 0 || expandedVacancy || isSwiping) return;
    
    const previousIndex = history[history.length - 1];
    const previousJob = jobs[previousIndex];
    
    if (previousJob) {
      setSwipedIds(prev => {
        const next = new Set(prev);
        next.delete(previousJob.id);
        return next;
      });
    }
    
    setHistory(prev => prev.slice(0, -1));
    setCurrentIndex(previousIndex);
  }, [history, expandedVacancy, isSwiping, jobs]);

  const handleReset = useCallback(() => {
    setCurrentIndex(0);
    setHistory([]);
    setSwipedIds(new Set());
    setBatch(1);
    refetch();
  }, [refetch]);

  const updateFilter = useCallback((key: keyof HHFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({
      text: "",
      area: "1",
      employment: "all",
      schedule: "all",
      experience: "all",
    });
  }, []);

  const handleApplyFromFullView = useCallback(async () => {
    if (!expandedVacancy || isSwiping) return;
    setExpandedVacancy(null);
    
    setTimeout(() => {
      triggerSwipe("right");
    }, 100);
  }, [expandedVacancy, isSwiping, triggerSwipe]);

  const hasActiveFilters = filters.text !== "" || 
    filters.employment !== "all" || 
    filters.schedule !== "all" || 
    filters.experience !== "all";

  const showLoadMore = currentJobs.length === 0 && hasMore && jobs.length > 0;
  const showNoMoreJobs = currentJobs.length === 0 && !hasMore && jobs.length > 0;

  if (jobsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-500">Загрузка вакансий с HH.ru...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[30%] -left-[20%] w-[60%] h-[60%] rounded-full bg-gradient-to-br from-blue-100/40 to-indigo-100/40 blur-3xl" />
        <div className="absolute top-[30%] -right-[20%] w-[50%] h-[70%] rounded-full bg-gradient-to-br from-purple-100/30 to-pink-100/30 blur-3xl" />
        <div className="absolute -bottom-[20%] left-[20%] w-[40%] h-[40%] rounded-full bg-gradient-to-br from-indigo-100/20 to-blue-100/20 blur-3xl" />
      </div>

      <header className="relative z-20 px-4 pt-4 pb-2 shrink-0">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg shadow-indigo-500/20">
              <Briefcase className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-gray-900">HH.ru Вакансии</h1>
              <p className="text-xs text-gray-500">{jobs.length} вакансий загружено</p>
            </div>
          </div>
          <Button
            variant={isFilterOpen ? "default" : "outline"}
            size="sm"
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className={`rounded-full gap-2 transition-all ${isFilterOpen ? "bg-indigo-600 shadow-lg shadow-indigo-500/30" : "bg-white shadow-md"} ${hasActiveFilters && !isFilterOpen ? "border-indigo-300 bg-indigo-50" : ""}`}
            data-testid="button-toggle-filter"
          >
            <Filter className="w-4 h-4" />
            Фильтр
            {hasActiveFilters && !isFilterOpen && (
              <span className="w-2 h-2 bg-indigo-600 rounded-full"></span>
            )}
          </Button>
        </div>
      </header>

      {isFilterOpen && (
        <div className="relative z-20 px-4 pb-3 shrink-0">
          <div className="max-w-lg mx-auto bg-white/90 backdrop-blur-xl rounded-2xl shadow-xl shadow-gray-900/5 p-4 space-y-3 border border-white/50">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Поиск вакансий (например: маркетинг, разработчик)..."
                value={filters.text}
                onChange={(e) => updateFilter("text", e.target.value)}
                className="pl-9 rounded-xl border-gray-200/80 bg-white/80 shadow-sm focus:bg-white h-11"
                data-testid="input-filter-text"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Регион</label>
                <Select value={filters.area} onValueChange={(v) => updateFilter("area", v)}>
                  <SelectTrigger 
                    className="rounded-xl border-gray-200/80 h-11 text-sm bg-white shadow-sm hover:shadow-md transition-shadow" 
                    data-testid="select-area"
                  >
                    <SelectValue placeholder="Выберите регион" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border border-gray-100 shadow-xl rounded-xl">
                    {AREAS.map((area) => (
                      <SelectItem key={area.value} value={area.value}>{area.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Занятость</label>
                <Select value={filters.employment} onValueChange={(v) => updateFilter("employment", v)}>
                  <SelectTrigger 
                    className="rounded-xl border-gray-200/80 h-11 text-sm bg-white shadow-sm hover:shadow-md transition-shadow" 
                    data-testid="select-employment"
                  >
                    <SelectValue placeholder="Любой тип" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border border-gray-100 shadow-xl rounded-xl">
                    {EMPLOYMENT_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">График</label>
                <Select value={filters.schedule} onValueChange={(v) => updateFilter("schedule", v)}>
                  <SelectTrigger 
                    className="rounded-xl border-gray-200/80 h-11 text-sm bg-white shadow-sm hover:shadow-md transition-shadow" 
                    data-testid="select-schedule"
                  >
                    <SelectValue placeholder="Любой график" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border border-gray-100 shadow-xl rounded-xl">
                    {SCHEDULES.map((schedule) => (
                      <SelectItem key={schedule.value} value={schedule.value}>{schedule.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Опыт</label>
                <Select value={filters.experience} onValueChange={(v) => updateFilter("experience", v)}>
                  <SelectTrigger 
                    className="rounded-xl border-gray-200/80 h-11 text-sm bg-white shadow-sm hover:shadow-md transition-shadow" 
                    data-testid="select-experience"
                  >
                    <SelectValue placeholder="Любой опыт" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border border-gray-100 shadow-xl rounded-xl">
                    {EXPERIENCE.map((exp) => (
                      <SelectItem key={exp.value} value={exp.value}>{exp.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="w-full text-gray-500 hover:text-gray-700 hover:bg-gray-100/50"
                data-testid="button-clear-filters"
              >
                Сбросить фильтры
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 flex items-center justify-center relative z-10 px-4 pb-36">
        <div className="relative w-full max-w-[400px] h-[480px] flex justify-center">
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
                      ref={isTop ? cardRef : null}
                      job={job} 
                      onSwipe={handleSwipe} 
                      onExpand={() => setExpandedVacancy(job)}
                      active={isTop && !isSwiping && !expandedVacancy}
                    />
                 </div>
               );
            })}
          </AnimatePresence>
          
          {showLoadMore && (
             <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 bg-white/60 backdrop-blur-sm rounded-[28px] border-2 border-dashed border-gray-200">
                <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-4 rounded-2xl shadow-lg mb-4">
                  <ChevronDown className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  Показать ещё вакансии?
                </h3>
                <p className="text-gray-500 mb-6">
                  Вы просмотрели все {jobs.length} загруженных вакансий
                </p>
                <Button 
                  onClick={loadMoreJobs}
                  disabled={isLoadingMore}
                  className="rounded-full px-8 bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700"
                  data-testid="button-load-more"
                >
                  {isLoadingMore ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Загрузка...
                    </>
                  ) : (
                    "Показать ещё вакансии"
                  )}
                </Button>
             </div>
          )}
          
          {showNoMoreJobs && (
             <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 bg-white/60 backdrop-blur-sm rounded-[28px] border-2 border-dashed border-gray-200">
                <div className="bg-gradient-to-br from-gray-400 to-gray-500 p-4 rounded-2xl shadow-lg mb-4">
                  <Briefcase className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  Больше вакансий нет
                </h3>
                <p className="text-gray-500 mb-6">
                  Вы просмотрели все вакансии по этому запросу
                </p>
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
          
          {currentJobs.length === 0 && jobs.length === 0 && (
             <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 bg-white/60 backdrop-blur-sm rounded-[28px] border-2 border-dashed border-gray-200">
                <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-4 rounded-2xl shadow-lg mb-4">
                  <Briefcase className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  Ничего не найдено
                </h3>
                <p className="text-gray-500 mb-6">
                  Попробуйте изменить параметры поиска
                </p>
                <Button 
                  onClick={clearFilters} 
                  className="rounded-full px-8"
                  variant="outline"
                  data-testid="button-clear-filters-empty"
                >
                  Сбросить фильтры
                </Button>
             </div>
          )}
        </div>
      </div>

      <div className="fixed bottom-[72px] left-0 right-0 z-40 flex justify-center items-center gap-6 py-3 bg-gradient-to-t from-white via-white/90 to-transparent">
        <Button
          size="icon"
          variant="outline"
          className="h-16 w-16 rounded-full border-2 border-red-100 bg-white text-red-500 shadow-xl shadow-red-500/10 hover:bg-red-50 hover:border-red-200 hover:shadow-2xl hover:shadow-red-500/20 transition-all hover:scale-110 active:scale-95"
          onClick={() => triggerSwipe("left")}
          disabled={currentJobs.length === 0 || isSwiping || !!expandedVacancy}
          data-testid="button-nope"
        >
          <X className="h-7 w-7" strokeWidth={3} />
        </Button>

        <Button
           size="icon"
           variant="secondary"
           className="h-12 w-12 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 shadow-lg transition-all hover:scale-105 active:scale-95"
           onClick={handleUndo}
           disabled={history.length === 0 || isSwiping || !!expandedVacancy}
           data-testid="button-undo"
        >
           <RotateCcw className="h-5 w-5" />
        </Button>

        <Button
          size="icon"
          variant="outline"
          className="h-16 w-16 rounded-full border-2 border-green-100 bg-white text-green-500 shadow-xl shadow-green-500/10 hover:bg-green-50 hover:border-green-200 hover:shadow-2xl hover:shadow-green-500/20 transition-all hover:scale-110 active:scale-95"
          onClick={() => triggerSwipe("right")}
          disabled={currentJobs.length === 0 || isSwiping || !!expandedVacancy}
          data-testid="button-like"
        >
          <Heart className="h-7 w-7" strokeWidth={3} fill="currentColor" />
        </Button>
      </div>

      <VacancyFullView 
        vacancy={expandedVacancy}
        onClose={() => setExpandedVacancy(null)}
        onApply={handleApplyFromFullView}
        isApplying={isSwiping}
      />
    </div>
  );
}
