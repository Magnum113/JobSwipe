import type { Job } from "@shared/schema";

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent";

export async function generateCoverLetter(resume: string, vacancy: Job): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    console.error("GEMINI_API_KEY not found");
    return getFallbackLetter(resume, vacancy);
  }

  const prompt = `Напиши сопроводительное письмо на русском языке для вакансии.

ВАКАНСИЯ:
- Должность: ${vacancy.title}
- Компания: ${vacancy.company}
- Зарплата: ${vacancy.salary}
- Описание: ${vacancy.description}
${vacancy.tags && vacancy.tags.length > 0 ? `- Теги/навыки: ${vacancy.tags.join(", ")}` : ""}

РЕЗЮМЕ КАНДИДАТА:
${resume || "Опытный специалист с релевантным опытом."}

ВАЖНЫЕ ПРАВИЛА:
1. Пиши в живом, естественном тоне — как реальный профессионал.
2. НИКАКОЙ формальности: без "Здравствуйте", "С уважением", "Готов обсудить", "Меня заинтересовала вакансия".
3. Начинай СРАЗУ по делу — с позиции, опыта или ключевого навыка.
4. Стиль — уверенный, профессиональный, человеческий.
5. Покажи конкретную пользу для компании и продукта.
6. Если есть кейсы — добавь 2-3 коротких примера в формате списка с цифрами.
7. Длина: 5-7 предложений.
8. Без финальных прощаний и клише.

ПРИМЕР СТИЛЯ:
"Product marketing manager с опытом в маркетинге более 5 лет. Проводил качественные и количественные исследования, разрабатывал маркетинговые промо-механики, работал с юнит-экономикой. Поделюсь тремя кейсами:
• Запустил механику с заданиями — Retention Day 7 вырос с 24% до 31%
• Провёл A/B тест страницы акции — +17% к конверсии
• Разработал конструктор промо-страниц — сократил время запуска в 4 раза
Все решения основываю на данных и гипотезах."

Напиши письмо в таком же живом стиле. Только текст письма, без пояснений.`;

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
          maxOutputTokens: 800,
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
