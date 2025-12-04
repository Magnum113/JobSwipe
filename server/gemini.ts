import type { Job } from "@shared/schema";

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent";

export async function generateCoverLetter(resume: string, vacancy: Job): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    console.error("GEMINI_API_KEY not found");
    return getFallbackLetter(resume, vacancy);
  }

  const prompt = `Создай профессиональное сопроводительное письмо для отклика на вакансию.

Данные пользователя (резюме):
${resume || "Опытный специалист с релевантным опытом в данной сфере."}

Данные вакансии:
Название: ${vacancy.title}
Компания: ${vacancy.company}
Описание: ${vacancy.description}

Структура письма:
1) Заголовок: роль + опыт (например: «Product marketing manager с опытом более 5 лет»)
2) Короткое summary 2–3 предложения:
   - навыки
   - зоны экспертизы
   - индустрии
3) Блок «3 ключевых кейса»:
   - каждый кейс 1–2 предложения
   - обязательно цифры: рост %, улучшение конверсии, экономия времени, влияние на продукт
4) Финальный абзац:
   - почему кандидат подходит
   - чем он усилит компанию

Стиль:
- уверенный, экспертный
- минимум воды
- конкретика + метрики
- письмо вывести полностью, без комментариев`;

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 1000,
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini API error:", response.status, errorText);
      return getFallbackLetter(resume, vacancy);
    }

    const data = await response.json();
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!content) {
      console.error("No content in Gemini response");
      return getFallbackLetter(resume, vacancy);
    }

    return content.trim();
  } catch (error) {
    console.error("Error calling Gemini API:", error);
    return getFallbackLetter(resume, vacancy);
  }
}

function getFallbackLetter(resume: string, vacancy: Job): string {
  const resumeSnippet = resume.trim() 
    ? resume.substring(0, 300)
    : "";

  if (resumeSnippet) {
    return `${resumeSnippet}

Вижу, что в ${vacancy.company} открыта позиция ${vacancy.title}. Мой опыт напрямую связан с задачами, которые вы описали. Готов показать результаты на практике.`;
  }

  return `Специалист с опытом в ${vacancy.tags?.[0] || 'данной области'}. Интересна позиция ${vacancy.title} в ${vacancy.company}.

Умею работать с ${vacancy.tags?.slice(0, 2).join(', ') || 'ключевыми инструментами'}, понимаю специфику ${vacancy.description?.substring(0, 50) || 'подобных задач'}. Готов обсудить детали и показать релевантные кейсы.`;
}
