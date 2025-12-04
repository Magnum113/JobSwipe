import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { User, Save, FileText, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Resume } from "@shared/schema";

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

export default function Profile() {
  const queryClient = useQueryClient();
  const [resumeText, setResumeText] = useState("");
  const [saved, setSaved] = useState(false);

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

  useEffect(() => {
    if (resume?.content) {
      setResumeText(resume.content);
    }
  }, [resume]);

  const handleSave = () => {
    saveMutation.mutate(resumeText);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

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

      <Card className="rounded-2xl border-0 shadow-lg">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="w-5 h-5 text-indigo-600" />
            Моё резюме
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            placeholder="Введите информацию о себе, опыте работы, навыках...

Например:
• Опыт работы: 5 лет в IT
• Навыки: React, TypeScript, Node.js
• Образование: МГТУ им. Баумана
• Достижения: Увеличил конверсию на 40%"
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            className="min-h-[300px] resize-none rounded-xl border-gray-200 focus:border-indigo-300 focus:ring-indigo-200"
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
          <strong>Подсказка:</strong> Ваше резюме будет использоваться для автоматической генерации сопроводительных писем при отклике на вакансии.
        </p>
      </div>
    </div>
  );
}
