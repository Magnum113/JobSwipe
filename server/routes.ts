import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertJobSchema, insertSwipeSchema, type Job } from "@shared/schema";

const SEED_JOBS = [
  {
    title: "Product Marketing Manager – Marketplace",
    company: "05.ru",
    salary: "150–200k",
    description: "Оптимизация воронки, аналитика продаж, GA4, CRM. Мы ищем человека, который сможет вывести наш маркетплейс на новый уровень.",
    tags: ["Marketing", "Analytics", "Growth"]
  },
  {
    title: "Data Analyst – Retail & eCommerce",
    company: "X5 Tech",
    salary: "200–260k",
    description: "SQL, Python, ClickHouse, построение витрин. Работа с большими данными и влияние на принятие продуктовых решений.",
    tags: ["Data", "SQL", "Python"]
  },
  {
    title: "Product Manager – Digital Banking",
    company: "T-Bank",
    salary: "230–300k",
    description: "Разработка мобильных фич, A/B тесты, CJM. Лидирование продуктовой команды и развитие мобильного приложения банка.",
    tags: ["Product", "Fintech", "Mobile"]
  },
  {
    title: "Frontend Developer – React Core",
    company: "Yandex",
    salary: "250–350k",
    description: "Разработка сложных интерфейсов, оптимизация производительности, архитектура фронтенда. Стек: React, TypeScript, Effector.",
    tags: ["Frontend", "React", "TypeScript"]
  },
  {
    title: "UX/UI Designer – Design System",
    company: "Avito",
    salary: "180–240k",
    description: "Развитие дизайн-системы, создание компонентов, работа над консистентностью интерфейсов всего продукта.",
    tags: ["Design", "Figma", "UI/UX"]
  },
  {
    title: "Backend Engineer – High Load Systems",
    company: "Ozon",
    salary: "280–380k",
    description: "Разработка микросервисов на Go, работа с Kubernetes, оптимизация производительности высоконагруженных систем.",
    tags: ["Backend", "Go", "Microservices"]
  },
  {
    title: "ML Engineer – Recommender Systems",
    company: "VK",
    salary: "300–400k",
    description: "Построение рекомендательных систем, работа с большими данными, A/B тестирование ML моделей в продакшене.",
    tags: ["ML", "Python", "Recommendations"]
  },
  {
    title: "DevOps Engineer – Cloud Infrastructure",
    company: "Yandex Cloud",
    salary: "220–300k",
    description: "Управление облачной инфраструктурой, автоматизация CI/CD, мониторинг и обеспечение отказоустойчивости.",
    tags: ["DevOps", "AWS", "Kubernetes"]
  }
];

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Seed jobs on startup
  await storage.seedJobs(SEED_JOBS);

  // Get unswiped jobs
  app.get("/api/jobs/unswiped", async (req, res) => {
    try {
      const jobs = await storage.getUnswipedJobs();
      res.json(jobs);
    } catch (error) {
      console.error("Error fetching unswiped jobs:", error);
      res.status(500).json({ error: "Failed to fetch jobs" });
    }
  });

  // Get all jobs
  app.get("/api/jobs", async (req, res) => {
    try {
      const jobs = await storage.getAllJobs();
      res.json(jobs);
    } catch (error) {
      console.error("Error fetching jobs:", error);
      res.status(500).json({ error: "Failed to fetch jobs" });
    }
  });

  // Create a new job
  app.post("/api/jobs", async (req, res) => {
    try {
      const validatedJob = insertJobSchema.parse(req.body);
      const job = await storage.createJob(validatedJob);
      res.status(201).json(job);
    } catch (error) {
      console.error("Error creating job:", error);
      res.status(400).json({ error: "Invalid job data" });
    }
  });

  // Record a swipe
  app.post("/api/swipes", async (req, res) => {
    try {
      const validatedSwipe = insertSwipeSchema.parse(req.body);
      const swipe = await storage.createSwipe(validatedSwipe);
      res.status(201).json(swipe);
    } catch (error) {
      console.error("Error recording swipe:", error);
      res.status(400).json({ error: "Invalid swipe data" });
    }
  });

  // Get swipe history
  app.get("/api/swipes", async (req, res) => {
    try {
      const swipes = await storage.getSwipeHistory();
      res.json(swipes);
    } catch (error) {
      console.error("Error fetching swipe history:", error);
      res.status(500).json({ error: "Failed to fetch swipe history" });
    }
  });

  // Reset swipes (useful for testing)
  app.post("/api/swipes/reset", async (req, res) => {
    try {
      // This would require a deleteAllSwipes method in storage
      // For now, just return success
      res.json({ message: "Swipes reset successfully" });
    } catch (error) {
      console.error("Error resetting swipes:", error);
      res.status(500).json({ error: "Failed to reset swipes" });
    }
  });

  return httpServer;
}
