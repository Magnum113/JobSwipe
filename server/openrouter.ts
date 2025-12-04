import type { Job } from "@shared/schema";

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

export async function generateCoverLetter(resume: string, vacancy: Job): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  
  if (!apiKey) {
    console.error("OPENROUTER_API_KEY not found");
    return getFallbackLetter(resume, vacancy);
  }

  const prompt = `Напиши профессиональное сопроводительное письмо на русском языке для следующей вакансии.

ВАКАНСИЯ:
- Должность: ${vacancy.title}
- Компания: ${vacancy.company}
- Зарплата: ${vacancy.salary}
- Описание: ${vacancy.description}
${vacancy.tags && vacancy.tags.length > 0 ? `- Теги: ${vacancy.tags.join(", ")}` : ""}

РЕЗЮМЕ КАНДИДАТА:
${resume || "Опытный специалист, готовый к новым вызовам."}

ТРЕБОВАНИЯ К ПИСЬМУ:
1. Письмо должно быть формальным, но дружелюбным
2. Обращение "Здравствуйте!" в начале
3. Объясни, почему кандидат подходит на эту позицию
4. Упомяни релевантный опыт из резюме (если есть)
5. Покажи заинтересованность в компании и позиции
6. Длина: 150-250 слов
7. Закончи вежливой фразой с предложением обсудить детали

Напиши только текст письма, без заголовков и пояснений.`;

  try {
    const response = await fetch(OPENROUTER_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.REPLIT_DEV_DOMAIN || "https://replit.com",
        "X-Title": "JobSwipe"
      },
      body: JSON.stringify({
        model: "openai/gpt-4.1-mini",
        messages: [
          {
            role: "system",
            content: "Ты — эксперт по составлению сопроводительных писем для соискателей работы. Ты пишешь убедительные, профессиональные письма на русском языке, которые помогают кандидатам получить работу мечты."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenRouter API error:", response.status, errorText);
      return getFallbackLetter(resume, vacancy);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;

    if (!content) {
      console.error("No content in OpenRouter response");
      return getFallbackLetter(resume, vacancy);
    }

    return content.trim();
  } catch (error) {
    console.error("Error calling OpenRouter API:", error);
    return getFallbackLetter(resume, vacancy);
  }
}

function getFallbackLetter(resume: string, vacancy: Job): string {
  const resumeSnippet = resume.trim() 
    ? resume.substring(0, 200) + (resume.length > 200 ? "..." : "")
    : "";

  return `Здравствуйте!

Меня заинтересовала вакансия "${vacancy.title}" в компании ${vacancy.company}.

${resumeSnippet ? `Мой профессиональный опыт:
${resumeSnippet}

` : ""}Считаю, что мои навыки и опыт отлично соответствуют требованиям данной позиции. ${vacancy.description ? `Особенно меня привлекает работа над: ${vacancy.description.substring(0, 100)}...` : ""}

Готов обсудить детали сотрудничества в удобное для вас время. Буду рад возможности присоединиться к вашей команде и внести свой вклад в развитие компании.

С уважением,
Кандидат`;
}
