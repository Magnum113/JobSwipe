import type { Job } from "@shared/schema";

export function generateCoverLetter(resume: string, vacancy: Job): string {
  const resumeSnippet = resume.trim() 
    ? resume.substring(0, 200) + (resume.length > 200 ? "..." : "")
    : "Опытный специалист с навыками работы в команде";

  return `Здравствуйте!

Меня заинтересовала вакансия "${vacancy.title}" в компании ${vacancy.company}.

${resume.trim() ? `Мой опыт:
${resumeSnippet}

` : ""}Считаю, что мои навыки и опыт отлично подходят для данной позиции. ${vacancy.description ? `Особенно меня привлекает: ${vacancy.description.substring(0, 100)}...` : ""}

Готов обсудить детали сотрудничества в удобное для вас время.

С уважением,
Кандидат`;
}
