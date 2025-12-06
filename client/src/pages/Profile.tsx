import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { User, Save, FileText, CheckCircle, RefreshCw, LogIn, LogOut, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Resume } from "@shared/schema";

interface UserInfo {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  hhUserId: string | null;
}

interface AuthStatus {
  authenticated: boolean;
  user?: UserInfo;
}

interface HHResume {
  id: number;
  userId: string;
  hhResumeId: string;
  title: string | null;
  content: string;
  selected: boolean;
}

async function fetchResume(): Promise<Resume | { content: string }> {
  const response = await fetch("/api/resume");
  if (!response.ok) {
    throw new Error("Failed to fetch resume");
  }
  return response.json();
}

async function saveResume(content: string): Promise<Resume> {
  const response = await fetch("/api/resume", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!response.ok) {
    throw new Error("Failed to save resume");
  }
  return response.json();
}

async function fetchAuthStatus(userId: string | null): Promise<AuthStatus> {
  if (!userId) return { authenticated: false };
  const response = await fetch(`/api/auth/status?userId=${userId}`);
  if (!response.ok) return { authenticated: false };
  return response.json();
}

async function fetchHHResumes(userId: string): Promise<HHResume[]> {
  const response = await fetch(`/api/hh/resumes?userId=${userId}`);
  if (!response.ok) throw new Error("Failed to fetch resumes");
  return response.json();
}

async function syncResumes(userId: string): Promise<{ resumes: HHResume[], count: number }> {
  const response = await fetch("/api/hh/resumes/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  if (!response.ok) throw new Error("Failed to sync resumes");
  return response.json();
}

async function selectResume(userId: string, resumeId: number): Promise<HHResume> {
  const response = await fetch("/api/hh/resumes/select", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, resumeId }),
  });
  if (!response.ok) throw new Error("Failed to select resume");
  return response.json();
}

export default function Profile() {
  const queryClient = useQueryClient();
  const [resumeText, setResumeText] = useState("");
  const [saved, setSaved] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlUserId = params.get("userId");
    const storedUserId = localStorage.getItem("userId");
    
    if (urlUserId) {
      localStorage.setItem("userId", urlUserId);
      setUserId(urlUserId);
      window.history.replaceState({}, "", window.location.pathname);
    } else if (storedUserId) {
      setUserId(storedUserId);
    }
  }, []);

  const { data: authStatus, isLoading: authLoading } = useQuery({
    queryKey: ["authStatus", userId],
    queryFn: () => fetchAuthStatus(userId),
    enabled: !!userId,
  });

  const { data: hhResumes, isLoading: resumesLoading, refetch: refetchResumes } = useQuery({
    queryKey: ["hhResumes", userId],
    queryFn: () => fetchHHResumes(userId!),
    enabled: !!userId && !!authStatus?.authenticated,
  });

  const { data: resume, isLoading } = useQuery({
    queryKey: ["resume"],
    queryFn: fetchResume,
  });

  const saveMutation = useMutation({
    mutationFn: saveResume,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resume"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const syncMutation = useMutation({
    mutationFn: () => syncResumes(userId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hhResumes", userId] });
    },
  });

  const selectMutation = useMutation({
    mutationFn: (resumeId: number) => selectResume(userId!, resumeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["hhResumes", userId] });
    },
  });

  useEffect(() => {
    if (resume?.content) {
      setResumeText(resume.content);
    }
  }, [resume]);

  const handleSave = () => {
    saveMutation.mutate(resumeText);
  };

  const handleLogin = () => {
    window.location.href = "/auth/hh/start";
  };

  const handleLogout = () => {
    localStorage.removeItem("userId");
    setUserId(null);
    queryClient.invalidateQueries({ queryKey: ["authStatus"] });
    queryClient.invalidateQueries({ queryKey: ["hhResumes"] });
  };

  const handleSync = () => {
    syncMutation.mutate();
  };

  const handleSelectResume = (resumeId: number) => {
    selectMutation.mutate(resumeId);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  const isAuthenticated = authStatus?.authenticated;
  const user = authStatus?.user;

  return (
    <div className="p-6 pb-24 max-w-lg mx-auto">
      <div className="flex items-center gap-3 mb-8">
        <div className="p-3 bg-indigo-100 rounded-2xl">
          <User className="w-6 h-6 text-indigo-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Профиль</h1>
          <p className="text-gray-500 text-sm">Управление вашим резюме</p>
        </div>
      </div>

      <Card className="rounded-2xl border-0 shadow-lg mb-6">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <img 
              src="https://hh.ru/favicon.ico" 
              alt="HH.ru" 
              className="w-5 h-5" 
            />
            Подключение к hh.ru
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isAuthenticated && user ? (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-green-50 rounded-xl">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <div className="flex-1">
                  <p className="font-medium text-gray-900">
                    {user.firstName} {user.lastName}
                  </p>
                  <p className="text-sm text-gray-500">{user.email}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleLogout}
                  className="text-gray-500 hover:text-red-600"
                  data-testid="button-logout"
                >
                  <LogOut className="w-4 h-4" />
                </Button>
              </div>

              <div className="flex gap-2">
                <Button
                  onClick={handleSync}
                  disabled={syncMutation.isPending}
                  className="flex-1 rounded-full bg-indigo-600 hover:bg-indigo-700"
                  data-testid="button-sync-resumes"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
                  {syncMutation.isPending ? "Синхронизация..." : "Синхронизировать резюме"}
                </Button>
              </div>

              {resumesLoading ? (
                <div className="flex justify-center py-4">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600"></div>
                </div>
              ) : hhResumes && hhResumes.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-gray-700">Ваши резюме:</p>
                  {hhResumes.map((r) => (
                    <div
                      key={r.id}
                      onClick={() => handleSelectResume(r.id)}
                      className={`p-3 rounded-xl border-2 cursor-pointer transition-all ${
                        r.selected
                          ? "border-indigo-500 bg-indigo-50"
                          : "border-gray-200 hover:border-indigo-300"
                      }`}
                      data-testid={`resume-item-${r.id}`}
                    >
                      <div className="flex items-center gap-2">
                        {r.selected && <Check className="w-4 h-4 text-indigo-600" />}
                        <span className={r.selected ? "font-medium text-indigo-900" : "text-gray-700"}>
                          {r.title || "Без названия"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 text-center py-4">
                  Нажмите "Синхронизировать резюме" для загрузки ваших резюме с hh.ru
                </p>
              )}
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-gray-600 mb-4">
                Подключите аккаунт hh.ru для отправки реальных откликов на вакансии
              </p>
              <Button
                onClick={handleLogin}
                className="rounded-full px-8 bg-red-600 hover:bg-red-700"
                data-testid="button-login-hh"
              >
                <LogIn className="w-4 h-4 mr-2" />
                Войти через hh.ru
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-0 shadow-lg">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="w-5 h-5 text-indigo-600" />
            Ручное резюме
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-500">
            Используется для генерации сопроводительных писем, если не подключен hh.ru
          </p>
          <Textarea
            placeholder="Введите информацию о себе, опыте работы, навыках..."
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            className="min-h-[200px] resize-none rounded-xl border-gray-200 focus:border-indigo-300 focus:ring-indigo-200"
            data-testid="input-resume"
          />
          
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {resumeText.length} символов
            </p>
            <Button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="rounded-full px-6 bg-indigo-600 hover:bg-indigo-700"
              data-testid="button-save-resume"
            >
              {saved ? (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Сохранено
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  {saveMutation.isPending ? "Сохранение..." : "Сохранить"}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="mt-6 p-4 bg-indigo-50 rounded-2xl">
        <p className="text-sm text-indigo-700">
          <strong>Подсказка:</strong> Подключите hh.ru для отправки реальных откликов. Ваше резюме с hh.ru будет использоваться для генерации сопроводительных писем.
        </p>
      </div>
    </div>
  );
}
