import { type User, type InsertUser, type Job, type InsertJob, type Swipe, type InsertSwipe, jobs, swipes, users } from "@shared/schema";
import { db } from "./db";
import { eq, notInArray, desc } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  getAllJobs(): Promise<Job[]>;
  getUnswipedJobs(): Promise<Job[]>;
  createJob(job: InsertJob): Promise<Job>;
  seedJobs(jobList: InsertJob[]): Promise<void>;
  
  createSwipe(swipe: InsertSwipe): Promise<Swipe>;
  getSwipeHistory(): Promise<Swipe[]>;
}

export class DbStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }

  async getAllJobs(): Promise<Job[]> {
    return await db.select().from(jobs).orderBy(desc(jobs.createdAt));
  }

  async getUnswipedJobs(): Promise<Job[]> {
    const swipedJobIds = await db.select({ jobId: swipes.jobId }).from(swipes);
    const swipedIds = swipedJobIds.map((s: { jobId: number }) => s.jobId);
    
    if (swipedIds.length === 0) {
      return await db.select().from(jobs).orderBy(desc(jobs.createdAt));
    }
    
    return await db.select()
      .from(jobs)
      .where(notInArray(jobs.id, swipedIds))
      .orderBy(desc(jobs.createdAt));
  }

  async createJob(job: InsertJob): Promise<Job> {
    const [created] = await db.insert(jobs).values(job).returning();
    return created;
  }

  async seedJobs(jobList: InsertJob[]): Promise<void> {
    const existingJobs = await this.getAllJobs();
    if (existingJobs.length === 0) {
      await db.insert(jobs).values(jobList);
    }
  }

  async createSwipe(swipe: InsertSwipe): Promise<Swipe> {
    const [created] = await db.insert(swipes).values(swipe).returning();
    return created;
  }

  async getSwipeHistory(): Promise<Swipe[]> {
    return await db.select().from(swipes).orderBy(desc(swipes.createdAt));
  }
}

export const storage = new DbStorage();
