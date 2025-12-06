import type { Job } from "@shared/schema";

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent";

function extractGeminiText(data: any): string | null {
  return (
    data?.candidates?.[0]?.content?.parts?.[0]?.text ||
    data?.candidates?.[0]?.content?.[0]?.parts?.[0]?.text ||
    data?.candidates?.[0]?.content?.[0]?.text ||
    null
  );
}

export async function generateCoverLetter(resume: string, vacancy: Job): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    console.error("GEMINI_API_KEY not found");
    return getFallbackLetter(resume, vacancy);
  }

  const prompt = `
Создай профессиональное сопроводительное письмо. Пиши структурно, уверенно, без воды.

Данные пользователя:
${resume || "Опытный специалист с сильным аналитическим и продуктовым опытом."}

Данные вакансии:
Название: ${vacancy.title}
Компания: ${vacancy.company}
Описание: ${vacancy.description}

Структура письма:
1) Заголовок: роль + опыт, например: "Product marketing manager с опытом более 5 лет".
2) Summary (2–3 предложения):
   - ключевые навыки
   - зоны экспертизы
   - сильные стороны, связанные с вакансией
3) Блок "3 ключевых кейса":
   - каждый кейс в формате: действие → метрика → результат
   - обязательно цифры: какие-либо метрики, проценты, цифры, которые есть в резюме и которые будут релевантны для вакансии

Стиль:
- уверенный и экспертный
- никакой воды
- только конкретика и метрики
- письмо вывести полностью, без комментариев и без повторения резюме
`;

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
    
    console.log("GEMINI RAW:", JSON.stringify(data, null, 2));
    
    const content = extractGeminiText(data);

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
  return `
Product marketing manager с релевантным опытом. Работал с growth-задачами, аналитикой, A/B тестами, развитием продуктовых фич и улучшением конверсий.

3 ключевых кейса:
1) Улучшил продуктовую воронку — +17% к конверсии за счёт переработки UX и тестирования гипотез.
2) Запустил фичу, которая дала +28% к вовлечённости пользователей и рост Retention Day 7.
3) Оптимизировал процесс запуска акций и лендингов — сокращение времени разработки в 4 раза.

Интересует позиция ${vacancy.title} в ${vacancy.company}.
Готов показать результаты и обсудить, как могу усилить команду.
  `.trim();
}
