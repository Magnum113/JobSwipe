import { useState, useEffect, useCallback, useRef } from "react";
import { VacancyCard, VacancyCardRef } from "@/components/VacancyCard";
import { VacancyFullView } from "@/components/VacancyFullView";
import { AnimatePresence } from "framer-motion";
import { X, Heart, RotateCcw, Briefcase, Filter, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import type { Job, Resume } from "@shared/schema";

interface FilterOptions {
  companies: string[];
  locations: string[];
}

interface Filters {
  company: string;
  salaryRange: string;
  employmentType: string;
  location: string;
  keyword: string;
}

async function fetchUnswipedJobs(filters: Filters): Promise<Job[]> {
  const params = new URLSearchParams();
  if (filters.company && filters.company !== 'all') params.append("company", filters.company);
  if (filters.salaryRange && filters.salaryRange !== 'all') params.append("salaryRange", filters.salaryRange);
  if (filters.employmentType && filters.employmentType !== 'all') params.append("employmentType", filters.employmentType);
  if (filters.location && filters.location !== 'all') params.append("location", filters.location);
  if (filters.keyword) params.append("keyword", filters.keyword);
  
  const response = await fetch(`/api/jobs/unswiped?${params.toString()}`);
  if (!response.ok) {
    throw new Error("Failed to fetch jobs");
  }
  return response.json();
}

async function fetchFilterOptions(): Promise<FilterOptions> {
  const response = await fetch("/api/jobs/filter-options");
  if (!response.ok) {
    throw new Error("Failed to fetch filter options");
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

const EMPLOYMENT_TYPES = [
  { value: "all", label: "Любой тип" },
  { value: "full-time", label: "Офис / full-time" },
  { value: "remote", label: "Удалённая" },
  { value: "hybrid", label: "Гибридная" },
];

const SALARY_RANGES = [
  { value: "all", label: "Любая зарплата" },
  { value: "under150", label: "до 150k" },
  { value: "150-200", label: "150k–200k" },
  { value: "200plus", label: "200k+" },
];

export default function VacanciesPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isSwiping, setIsSwiping] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [history, setHistory] = useState<number[]>([]);
  const [expandedVacancy, setExpandedVacancy] = useState<Job | null>(null);
  
  const cardRef = useRef<VacancyCardRef>(null);
  
  const [filters, setFilters] = useState<Filters>({
    company: "all",
    salaryRange: "all",
    employmentType: "all",
    location: "all",
    keyword: "",
  });
  
  const { data: filterOptions } = useQuery({
    queryKey: ["filterOptions"],
    queryFn: fetchFilterOptions,
  });
  
  const { data: jobs = [], isLoading: jobsLoading } = useQuery({
    queryKey: ["jobs", "unswiped", filters],
    queryFn: () => fetchUnswipedJobs(filters),
  });

  const { data: resume } = useQuery({
    queryKey: ["resume"],
    queryFn: fetchResume,
  });

  useEffect(() => {
    setCurrentIndex(0);
    setHistory([]);
  }, [filters]);

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

  const currentJobs = jobs.slice(currentIndex);

  const handleSwipe = useCallback((direction: "left" | "right") => {
    if (isSwiping) return;
    if (currentJobs.length === 0) return;
    
    setIsSwiping(true);
    const currentJob = currentJobs[0];

    if (direction === "right") {
      applicationMutation.mutate({
        jobId: currentJob.id,
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

    swipeMutation.mutate({ jobId: currentJob.id, direction });
    setHistory(prev => [...prev, currentIndex]);
    setCurrentIndex(prev => prev + 1);
    setExpandedVacancy(null);

    setTimeout(() => setIsSwiping(false), 150);
  }, [isSwiping, currentJobs, currentIndex, resume, applicationMutation, swipeMutation, toast, queryClient]);

  const triggerSwipe = useCallback(async (direction: "left" | "right") => {
    if (isSwiping || currentJobs.length === 0 || expandedVacancy) return;
    
    if (cardRef.current) {
      await cardRef.current.swipe(direction);
    }
  }, [isSwiping, currentJobs.length, expandedVacancy]);

  const handleUndo = useCallback(() => {
    if (history.length === 0 || expandedVacancy || isSwiping) return;
    const previousIndex = history[history.length - 1];
    setHistory(prev => prev.slice(0, -1));
    setCurrentIndex(previousIndex);
  }, [history, expandedVacancy, isSwiping]);

  const handleReset = useCallback(() => {
    setCurrentIndex(0);
    setHistory([]);
    queryClient.invalidateQueries({ queryKey: ["jobs", "unswiped"] });
  }, [queryClient]);

  const updateFilter = useCallback((key: keyof Filters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({
      company: "all",
      salaryRange: "all",
      employmentType: "all",
      location: "all",
      keyword: "",
    });
  }, []);

  const handleApplyFromFullView = useCallback(async () => {
    if (!expandedVacancy || isSwiping) return;
    setExpandedVacancy(null);
    
    setTimeout(() => {
      triggerSwipe("right");
    }, 100);
  }, [expandedVacancy, isSwiping, triggerSwipe]);

  const hasActiveFilters = filters.company !== "all" || 
    filters.salaryRange !== "all" || 
    filters.employmentType !== "all" || 
    filters.location !== "all" || 
    filters.keyword !== "";

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
    <div className="flex flex-col h-full relative overflow-hidden">
      {/* Decorative background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-[30%] -left-[20%] w-[60%] h-[60%] rounded-full bg-gradient-to-br from-blue-100/40 to-indigo-100/40 blur-3xl" />
        <div className="absolute top-[30%] -right-[20%] w-[50%] h-[70%] rounded-full bg-gradient-to-br from-purple-100/30 to-pink-100/30 blur-3xl" />
        <div className="absolute -bottom-[20%] left-[20%] w-[40%] h-[40%] rounded-full bg-gradient-to-br from-indigo-100/20 to-blue-100/20 blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-20 px-4 pt-4 pb-2 shrink-0">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg shadow-indigo-500/20">
              <Briefcase className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-gray-900">Подбор вакансий</h1>
              <p className="text-xs text-gray-500">{jobs.length} вакансий</p>
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

      {/* Filter panel */}
      {isFilterOpen && (
        <div className="relative z-20 px-4 pb-3 shrink-0">
          <div className="max-w-lg mx-auto bg-white/90 backdrop-blur-xl rounded-2xl shadow-xl shadow-gray-900/5 p-4 space-y-3 border border-white/50">
            {/* Keyword search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Поиск по ключевым словам..."
                value={filters.keyword}
                onChange={(e) => updateFilter("keyword", e.target.value)}
                className="pl-9 rounded-xl border-gray-200/80 bg-white/80 shadow-sm focus:bg-white h-11"
                data-testid="input-filter-keyword"
              />
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              {/* Company filter */}
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Компания</label>
                <Select value={filters.company} onValueChange={(v) => updateFilter("company", v)}>
                  <SelectTrigger 
                    className="rounded-xl border-gray-200/80 h-11 text-sm bg-white shadow-sm hover:shadow-md transition-shadow" 
                    data-testid="select-company"
                  >
                    <SelectValue placeholder="Все компании" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border border-gray-100 shadow-xl rounded-xl">
                    <SelectItem value="all">Все компании</SelectItem>
                    {filterOptions?.companies.map((company) => (
                      <SelectItem key={company} value={company}>{company}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Location filter */}
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Локация</label>
                <Select value={filters.location} onValueChange={(v) => updateFilter("location", v)}>
                  <SelectTrigger 
                    className="rounded-xl border-gray-200/80 h-11 text-sm bg-white shadow-sm hover:shadow-md transition-shadow" 
                    data-testid="select-location"
                  >
                    <SelectValue placeholder="Любая локация" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border border-gray-100 shadow-xl rounded-xl">
                    <SelectItem value="all">Любая локация</SelectItem>
                    {filterOptions?.locations.map((location) => (
                      <SelectItem key={location} value={location}>{location}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Salary filter */}
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Зарплата</label>
                <Select value={filters.salaryRange} onValueChange={(v) => updateFilter("salaryRange", v)}>
                  <SelectTrigger 
                    className="rounded-xl border-gray-200/80 h-11 text-sm bg-white shadow-sm hover:shadow-md transition-shadow" 
                    data-testid="select-salary"
                  >
                    <SelectValue placeholder="Любая зарплата" />
                  </SelectTrigger>
                  <SelectContent className="bg-white border border-gray-100 shadow-xl rounded-xl">
                    {SALARY_RANGES.map((range) => (
                      <SelectItem key={range.value} value={range.value}>{range.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* Employment type filter */}
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1.5 block uppercase tracking-wide">Тип занятости</label>
                <Select value={filters.employmentType} onValueChange={(v) => updateFilter("employmentType", v)}>
                  <SelectTrigger 
                    className="rounded-xl border-gray-200/80 h-11 text-sm bg-white shadow-sm hover:shadow-md transition-shadow" 
                    data-testid="select-employment-type"
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

      {/* Cards container */}
      <div className="flex-1 flex items-center justify-center relative z-10 px-4 pb-36">
        <div className="relative w-full max-w-[380px] h-[540px] flex justify-center">
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
          
          {currentJobs.length === 0 && (
             <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 bg-white/60 backdrop-blur-sm rounded-[28px] border-2 border-dashed border-gray-200">
                <div className="bg-gradient-to-br from-indigo-500 to-purple-600 p-4 rounded-2xl shadow-lg mb-4">
                  <Briefcase className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  {hasActiveFilters ? "Ничего не найдено" : "Вакансии закончились!"}
                </h3>
                <p className="text-gray-500 mb-6">
                  {hasActiveFilters 
                    ? "Попробуйте изменить параметры фильтра" 
                    : "Вы просмотрели все доступные позиции."
                  }
                </p>
                {hasActiveFilters ? (
                  <Button 
                    onClick={clearFilters} 
                    className="rounded-full px-8"
                    variant="outline"
                    data-testid="button-clear-filters-empty"
                  >
                    Сбросить фильтры
                  </Button>
                ) : (
                  <Button 
                    onClick={handleReset} 
                    className="rounded-full px-8"
                    variant="outline"
                    data-testid="button-reset"
                  >
                    Начать заново
                  </Button>
                )}
             </div>
          )}
        </div>
      </div>

      {/* Fixed swipe action buttons */}
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

      {/* Full view modal */}
      <VacancyFullView 
        vacancy={expandedVacancy}
        onClose={() => setExpandedVacancy(null)}
        onApply={handleApplyFromFullView}
        isApplying={isSwiping}
      />
    </div>
  );
}
