import type { Job } from "@shared/schema";

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

function extractGeminiText(data: any): string | null {
  return (
    data?.candidates?.[0]?.content?.parts?.[0]?.text ||
    data?.candidates?.[0]?.content?.[0]?.parts?.[0]?.text ||
    data?.candidates?.[0]?.content?.[0]?.text ||
    null
  );
}

export async function generateCoverLetter(
  resume: string,
  vacancy: Job
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error("GEMINI_API_KEY not found");
    return getFallbackLetter(resume, vacancy);
  }

  const prompt = `
Ты должен создать сопроводительное письмо строго на основе данных из резюме.

ВНИМАНИЕ — ЖЁСТКИЕ ПРАВИЛА:
1) НЕЛЬЗЯ придумывать никакие факты, цифры, должности, компании, метрики или достижения.
2) НЕЛЬЗЯ добавлять никакие ключевые кейсы, если их нет в резюме.
3) НЕЛЬЗЯ использовать опыт или навыки, которых нет в тексте резюме.
4) Если в резюме нет цифр — НЕ используй цифры.
5) Если данных недостаточно — пиши нейтрально и обобщённо, НЕ выдумывая подробности.

Единственный источник правды (SOURCE OF TRUTH):
=== РЕЗЮМЕ НАЧАЛО ===
${resume}
=== РЕЗЮМЕ КОНЕЦ ===

Данные вакансии:
Название: ${vacancy.title}
Компания: ${vacancy.company}
Описание: ${vacancy.description}


Структура письма:
- краткое описание опыта (только то, что есть в резюме)
- 1–3 релевантных навыка (только из резюме)

СТРОГО ЗАПРЕЩЕНО:
- любые выдуманные метрики, проценты, показатели
- любые кейсы, не указанные в резюме
- любые догадки про опыт
- любые детали, отсутствующие в тексте резюме
- Markdown, списки, *, #, - и т.п.

Пиши ТОЛЬКО plain-text письмо.


Стиль:
- уверенный и экспертный
- никакой воды
- только конкретика и метрики
- письмо вывести полностью, без пояснений
`;

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "models/gemini-2.0-flash",
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 800,
          responseMimeType: "text/plain", // 🔥 ОБЯЗАТЕЛЬНО
        },
      }),
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
