import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Filter, Building2, Wallet, X, Briefcase } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Job } from "@shared/schema";

interface SearchFilters {
  keyword: string;
  company: string;
  title: string;
}

async function searchJobs(filters: SearchFilters): Promise<Job[]> {
  const params = new URLSearchParams();
  if (filters.keyword) params.append("keyword", filters.keyword);
  if (filters.company) params.append("company", filters.company);
  if (filters.title) params.append("title", filters.title);
  
  const response = await fetch(`/api/jobs/search?${params.toString()}`);
  if (!response.ok) {
    throw new Error("Failed to search jobs");
  }
  return response.json();
}

function JobCard({ job }: { job: Job }) {
  return (
    <Card className="rounded-2xl border-0 shadow-md hover:shadow-lg transition-shadow">
      <CardContent className="p-5">
        <h3 className="font-bold text-gray-900 text-lg leading-tight mb-2" data-testid={`text-search-title-${job.id}`}>
          {job.title}
        </h3>
        <div className="flex items-center gap-2 text-indigo-600 mb-3">
          <Building2 className="w-4 h-4" />
          <span className="font-medium">{job.company}</span>
        </div>
        <div className="flex items-center gap-2 text-gray-600 bg-gray-50 p-2 rounded-lg w-fit mb-3">
          <Wallet className="w-4 h-4" />
          <span className="font-semibold text-sm">{job.salary}</span>
        </div>
        <p className="text-gray-600 text-sm line-clamp-2 mb-3">
          {job.description}
        </p>
        <div className="flex gap-2 flex-wrap">
          {job.tags?.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="bg-gray-100 text-gray-600 text-xs py-0.5 px-2 rounded-full"
            >
              {tag}
            </Badge>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function SearchPage() {
  const [filters, setFilters] = useState<SearchFilters>({
    keyword: "",
    company: "",
    title: "",
  });
  const [activeFilters, setActiveFilters] = useState<SearchFilters>({
    keyword: "",
    company: "",
    title: "",
  });
  const [showFilters, setShowFilters] = useState(false);

  const { data: jobs = [], isLoading, refetch } = useQuery({
    queryKey: ["jobs", "search", activeFilters],
    queryFn: () => searchJobs(activeFilters),
  });

  const handleSearch = () => {
    setActiveFilters({ ...filters });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const clearFilters = () => {
    const empty = { keyword: "", company: "", title: "" };
    setFilters(empty);
    setActiveFilters(empty);
  };

  const hasActiveFilters = activeFilters.keyword || activeFilters.company || activeFilters.title;

  return (
    <div className="p-6 pb-24 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-indigo-100 rounded-2xl">
          <Search className="w-6 h-6 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Поиск</h1>
          <p className="text-gray-500 text-sm">Найдите идеальную вакансию</p>
        </div>
      </div>

      {/* Search bar */}
      <div className="flex gap-2 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <Input
            placeholder="Поиск по ключевым словам..."
            value={filters.keyword}
            onChange={(e) => setFilters({ ...filters, keyword: e.target.value })}
            onKeyPress={handleKeyPress}
            className="pl-10 rounded-xl border-gray-200 focus:border-indigo-300"
            data-testid="input-search-keyword"
          />
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => setShowFilters(!showFilters)}
          className={`rounded-xl ${showFilters ? "bg-indigo-50 border-indigo-200" : ""}`}
          data-testid="button-toggle-filters"
        >
          <Filter className="w-5 h-5" />
        </Button>
      </div>

      {/* Expandable filters */}
      {showFilters && (
        <div className="bg-gray-50 rounded-2xl p-4 mb-4 space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Компания</label>
            <Input
              placeholder="Например: Yandex, Ozon, VK..."
              value={filters.company}
              onChange={(e) => setFilters({ ...filters, company: e.target.value })}
              onKeyPress={handleKeyPress}
              className="rounded-xl border-gray-200"
              data-testid="input-filter-company"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">Должность</label>
            <Input
              placeholder="Например: Frontend, Product Manager..."
              value={filters.title}
              onChange={(e) => setFilters({ ...filters, title: e.target.value })}
              onKeyPress={handleKeyPress}
              className="rounded-xl border-gray-200"
              data-testid="input-filter-title"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleSearch}
              className="flex-1 rounded-xl bg-indigo-600 hover:bg-indigo-700"
              data-testid="button-apply-filters"
            >
              Применить
            </Button>
            <Button
              variant="outline"
              onClick={clearFilters}
              className="rounded-xl"
              data-testid="button-clear-filters"
            >
              Сбросить
            </Button>
          </div>
        </div>
      )}

      {/* Active filters display */}
      {hasActiveFilters && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-sm text-gray-500">Фильтры:</span>
          {activeFilters.keyword && (
            <Badge variant="secondary" className="rounded-full bg-indigo-100 text-indigo-700">
              {activeFilters.keyword}
              <X className="w-3 h-3 ml-1 cursor-pointer" onClick={() => {
                setFilters({ ...filters, keyword: "" });
                setActiveFilters({ ...activeFilters, keyword: "" });
              }} />
            </Badge>
          )}
          {activeFilters.company && (
            <Badge variant="secondary" className="rounded-full bg-indigo-100 text-indigo-700">
              {activeFilters.company}
              <X className="w-3 h-3 ml-1 cursor-pointer" onClick={() => {
                setFilters({ ...filters, company: "" });
                setActiveFilters({ ...activeFilters, company: "" });
              }} />
            </Badge>
          )}
          {activeFilters.title && (
            <Badge variant="secondary" className="rounded-full bg-indigo-100 text-indigo-700">
              {activeFilters.title}
              <X className="w-3 h-3 ml-1 cursor-pointer" onClick={() => {
                setFilters({ ...filters, title: "" });
                setActiveFilters({ ...activeFilters, title: "" });
              }} />
            </Badge>
          )}
        </div>
      )}

      {/* Results */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      ) : jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="p-4 bg-gray-100 rounded-full mb-4">
            <Briefcase className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-bold text-gray-900 mb-2">Ничего не найдено</h3>
          <p className="text-gray-500 max-w-xs">
            Попробуйте изменить параметры поиска
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-sm text-gray-500">
            Найдено: {jobs.length} вакансий
          </div>
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  );
}
