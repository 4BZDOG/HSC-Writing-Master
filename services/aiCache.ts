
import { openDB, DBSchema, IDBPDatabase } from 'idb';

// IndexedDB schema for AI cache
interface AICacheDB extends DBSchema {
  cache: {
    key: string;
    value: {
      data: any;
      timestamp: number;
      version: string;
    };
  };
}

const DB_NAME = 'hsc-ai-cache';
const DB_VERSION = 1;
const STORE_NAME = 'cache';
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days

export class AICache {
  private static db: IDBPDatabase<AICacheDB> | null = null;
  private static dataVersion: string = '1.0.0';

  // Simple string hash for creating short, deterministic keys from long content
  private static hash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }

  // Initialize the database
  private static async initDB(): Promise<IDBPDatabase<AICacheDB>> {
    if (this.db) return this.db;
    
    this.db = await openDB<AICacheDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Create cache store if it doesn't exist
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      },
    });
    
    // Clean up expired entries on init
    await this.cleanup();
    
    return this.db;
  }

  // Get an item from cache
  static async get<T>(key: string): Promise<T | null> {
    try {
      const db = await this.initDB();
      const entry = await db.get(STORE_NAME, key);
      
      if (!entry) return null;
      
      // Check if expired
      if (Date.now() - entry.timestamp > CACHE_TTL) {
        await this.delete(key);
        return null;
      }
      
      // Check version compatibility
      if (entry.version !== this.dataVersion) {
        await this.delete(key);
        return null;
      }
      
      return entry.data as T;
    } catch (error) {
      console.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  // Set an item in cache
  static async set(key: string, data: any): Promise<void> {
    try {
      const db = await this.initDB();
      const entry = {
        data,
        timestamp: Date.now(),
        version: this.dataVersion
      };
      await db.put(STORE_NAME, entry, key);
    } catch (error) {
      console.error(`Cache set error for key ${key}:`, error);
    }
  }

  // Delete a specific cache entry
  static async delete(key: string): Promise<void> {
    try {
      const db = await this.initDB();
      await db.delete(STORE_NAME, key);
    } catch (error) {
      console.error(`Cache delete error for key ${key}:`, error);
    }
  }

  // Clear all cache entries
  static async clear(): Promise<void> {
    try {
      const db = await this.initDB();
      await db.clear(STORE_NAME);
      console.log('AI Cache cleared');
    } catch (error) {
      console.error('Cache clear error:', error);
    }
  }

  // Clean up expired entries
  private static async cleanup(): Promise<void> {
    try {
      const db = await this.initDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      
      const keys = await store.getAllKeys();
      const now = Date.now();
      
      let deleted = 0;
      for (const key of keys) {
        const entry = await store.get(key);
        if (entry && (now - entry.timestamp > CACHE_TTL || entry.version !== this.dataVersion)) {
          await store.delete(key);
          deleted++;
        }
      }
      
      await tx.done;
      if (deleted > 0) {
        console.log(`Cache cleanup: removed ${deleted} expired entries`);
      }
    } catch (error) {
      console.error('Cache cleanup error:', error);
    }
  }

  // Get cache statistics
  static async getStats(): Promise<{ total: number; size: number; expired: number }> {
    try {
      const db = await this.initDB();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      
      const entries = await store.getAll();
      const now = Date.now();
      
      const stats = {
        total: entries.length,
        size: 0,
        expired: 0
      };
      
      entries.forEach(entry => {
        stats.size += JSON.stringify(entry).length;
        if (now - entry.timestamp > CACHE_TTL) {
          stats.expired++;
        }
      });
      
      return stats;
    } catch (error) {
      console.error('Cache stats error:', error);
      return { total: 0, size: 0, expired: 0 };
    }
  }

  // --- Key Generators ---

  static generatePromptKey(dotPointId: string, questionPreview: string): string {
    return `prompt:${dotPointId}:${this.hash(questionPreview)}`;
  }

  static generateEnrichKey(promptId: string): string {
    return `enrich:${promptId}`;
  }

  static generateEvaluationKey(promptId: string, answer: string): string {
    return `evaluate:${promptId}:${this.hash(answer)}`;
  }

  static generateScenarioKey(promptId: string): string {
    return `scenario:${promptId}`;
  }

  static generateKeywordsKey(promptId: string): string {
    return `keywords:${promptId}`;
  }

  static generateImproveKey(promptId: string, answer: string, targetBand: number): string {
      return `improve:${promptId}:${this.hash(answer)}:${targetBand}`;
  }

  static generateReviseKey(promptId: string, answer: string, targetMark: number): string {
      return `revise:${promptId}:${this.hash(answer)}:${targetMark}`;
  }

  static generateSampleAnswerKey(promptId: string, mark: number): string {
      return `sample:${promptId}:${mark}`;
  }

  static generateQualityCheckKey(content: string, type: string): string {
      return `quality:${type}:${this.hash(content)}`;
  }

  static generateTopicKey(courseName: string, existingTopics: string[]): string {
      return `topic:${this.hash(courseName)}:${this.hash(existingTopics.join(','))}`;
  }

  static generateDotPointsKey(courseName: string, topicName: string, subTopicName: string): string {
      return `dotpoints:${this.hash(courseName + topicName + subTopicName)}`;
  }

  static generateParsingKey(text: string, type: 'outcomes' | 'structure'): string {
      return `parse:${type}:${this.hash(text)}`;
  }

  static generateExplanationKey(question: string, outcomeCode: string): string {
      return `explain:${outcomeCode}:${this.hash(question)}`;
  }
  
  static generateOutcomeSuggestionKey(question: string): string {
      return `suggest_outcomes:${this.hash(question)}`;
  }
  
  static generateFetchUrlKey(url: string): string {
      return `fetch:${this.hash(url)}`;
  }
}
