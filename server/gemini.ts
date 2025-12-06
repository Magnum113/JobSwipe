import type { Job } from "@shared/schema";

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent";

// -------------------------------
// 1. Нормальный парсер ответа Gemini
// -------------------------------
function extractGeminiText(data: any): string | null {
  return (
    data?.candidates?.[0]?.content?.parts?.[0]?.text ||
    data?.candidates?.[0]?.content?.[0]?.parts?.[0]?.text ||
    data?.candidates?.[0]?.content?.[0]?.text ||
    null
  );
}

// -------------------------------
// 2. Сжатие резюме, чтобы Gemini не терял важное
// -------------------------------
function compressResume(raw: string): string {
  if (!raw) return "";

  // Сжимаем до 3000 символов, чтобы не резались ключевые цифры и достижения
  if (raw.length <= 3000) return raw;

  // Умное сжатие: оставляем первые 2000 + последние 800 символов
  return (
    raw.slice(0, 2000) +
    "\n...\n" +
    raw.slice(-800)
  );
}

// -------------------------------
// 3. Генерация сопроводительного письма
// -------------------------------
export async function generateCoverLetter(
  resume: string,
  vacancy: Job
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error("GEMINI_API_KEY missing");
    return getFallbackLetter(vacancy);
  }

  const compressedResume = compressResume(resume);

  // ---------- PROMPT ----------
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
${compressedResume}
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
`.trim();

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },

      body: JSON.stringify({
        model: "models/gemini-2.5-pro",
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }]
          }
        ],
        generationConfig: {
          temperature: 0.4,          // низкая галлюцинация
          maxOutputTokens: 800,
          responseMimeType: "text/plain"
        }
      })
    });

    const data = await response.json();

    console.log("GEMINI RAW:", JSON.stringify(data, null, 2));

    const content = extractGeminiText(data);

    if (!content || typeof content !== "string") {
      console.error("Gemini returned empty content");
      return getFallbackLetter(vacancy);
    }

    return sanitizeText(content.trim());
  } catch (err) {
    console.error("Gemini generation error:", err);
    return getFallbackLetter(vacancy);
  }
}

// -------------------------------
// 4. Plain-text sanitizer (убирает звёздочки, маркеры и markdown)
// -------------------------------
function sanitizeText(text: string): string {
  return text
    .replace(/[*#_\-]/g, " ") // убираем markdown символы
    .replace(/\s+/g, " ")     // нормализуем пробелы
    .trim();
}

// -------------------------------
// 5. Fallback (без фантазий)
// -------------------------------
function getFallbackLetter(vacancy: Job): string {
  return `
Имею релевантный опыт работы и развивал продуктовые и маркетинговые направления. Работал с аналитикой, гипотезами, улучшением процессов и ростом метрик.

Готов обсудить, как мой опыт может быть полезен для вас.
  `.trim();
  }