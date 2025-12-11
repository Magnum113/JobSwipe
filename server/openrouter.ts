import type { Job } from "@shared/schema";

// ================================
// GLOBAL DEBUG PROMPT STORAGE
// ================================
let LAST_DEBUG_PROMPT = "";
export function getLastOpenRouterPrompt(): string {
  return LAST_DEBUG_PROMPT;
}

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

// ================================
// MAIN GENERATOR
// ================================
export async function generateCoverLetter(resume: string, vacancy: Job): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    console.error("OPENROUTER_API_KEY not found");
    return fallbackLetter(vacancy);
  }

  // ================================
  // BUILD VACANCY BLOCK (полный, как в GigaChat)
  // ================================
  const vacancyBlock = `
=== ВАКАНСИЯ НАЧАЛО ===
Название вакансии: ${vacancy.title}
Компания: ${vacancy.company}
Зарплата: ${vacancy.salary || "—"}
Краткое описание / обязанности:
${vacancy.description || "—"}
Ключевые теги/направления:
${(vacancy.tags && vacancy.tags.length) ? vacancy.tags.join(", ") : "—"}
=== ВАКАНСИЯ КОНЕЦ ===
`.trim();

  // ================================
  // MAIN PROMPT — 100% КОПИЯ GIGACHAT
  // ================================
  const prompt = `
Ты пишешь короткое, содержательное сопроводительное письмо под КОНКРЕТНУЮ вакансию, строго опираясь на резюме кандидата.

Тебе даны два блока:
1) ВАКАНСИЯ — требования, задачи, контекст роли.
2) РЕЗЮМЕ — опыт кандидата.

Твоя задача:
1) Внимательно прочитай ВАКАНСИЮ и вытащи 3–7 ключевых требований и задач (желаемый опыт, тип проектов, инструменты, уровень ответственности).
2) Затем прочитай РЕЗЮМЕ и найди ТОЛЬКО те факты, кейсы, навыки и результаты, которые максимально соответствуют этим требованиям.
3) На основе этого напиши сопроводительное письмо так, чтобы было видно:
   — кандидат реально делал похожие вещи;
   — его опыт и результаты бьются с задачами вакансии;
   — он понимает, какой вклад может внести.

Жёсткие правила:
1) НЕЛЬЗЯ придумывать факты, достижения, цифры, компании, навыки, опыт. Только то, что есть в резюме.
2) Нельзя использовать информацию, отсутствующую в РЕЗЮМЕ.
3) Если в резюме нет цифр — не используй цифры.
4) Только plain-text. Без markdown, *, #, -, _, списков и заголовков.
5) Не использовать обращения ("уважаемый", "меня зовут", "добрый день" и т.п.).
6) Не упоминать название компании и название вакансии в тексте письма.
7) Пиши коротко, профессионально и по делу, максимум в 3–5 предложений.
8) Фокусируйся на самом свежем и релевантном опыте (последние 2–3 года). Старый опыт используй только если он напрямую попадает в требования вакансии.
9) Не используй в письме точное название должности/профессии из резюме.
10) Не пиши фразы вроде "готов обсудить", "буду рад стать частью команды", "буду рад обсудить детали".
11) Пиши письмо от моего лица ("Имею опыт...", "Занимался..."), не от третьего лица.

Структура письма:
1) Одно короткое предложение, которое описывает профиль кандидата и его релевантный фокус.
2) 1–3 предложения с конкретными примерами опыта.
3) Одно короткое завершающее предложение, почему кандидат полезен.

Единственные источники информации:

${vacancyBlock}

=== РЕЗЮМЕ НАЧАЛО ===
${resume}
=== РЕЗЮМЕ КОНЕЦ ===

Выведи только текст сопроводительного письма, без пояснений.
`.trim();

  // Save debug prompt
  LAST_DEBUG_PROMPT = prompt;

  // ================================
  // CALL OPENROUTER
  // ================================
  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://jobswiper.ru",
        "X-Title": "JobSwipe"
      },
      body: JSON.stringify({
        model: "openai/gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content: "Ты — эксперт по созданию сопроводительных писем. Строго следуй правилам пользователя."
          },
          { role: "user", content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 700
      })
    });

    if (!response.ok) {
      console.error("OpenRouter API error:", response.status, await response.text());
      return fallbackLetter(vacancy);
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content;

    if (!text) return fallbackLetter(vacancy);

    return sanitize(text.trim());
  } catch (err) {
    console.error("OpenRouter CALL ERROR:", err);
    return fallbackLetter(vacancy);
  }
}

// ================================
// REMOVE markdown symbols (как у GigaChat)
// ================================
function sanitize(text: string): string {
  return text.replace(/[*#_\-]/g, " ").replace(/\s+/g, " ").trim();
}

// ================================
// FALLBACK
// ================================
function fallbackLetter(_vacancy: Job): string {
  return `
Имею релевантный опыт работы и занимался развитием маркетинговых и продуктовых направлений. Работал с аналитикой, гипотезами, процессами и улучшением метрик.

Мой опыт и навыки позволяют закрывать задачи по развитию продукта и маркетинговых направлений.
`.trim();
}
