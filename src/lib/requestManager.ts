// 网络请求管理器 - 处理并发控制、请求队列和优先级
import { logger } from './logger';
import { errorHandler, RetryOptions } from './errorHandler';

interface RequestTask {
  id: string;
  url: string;
  options: RequestInit;
  priority: number;
  category: string;
  resolve: (response: Response) => void;
  reject: (error: Error) => void;
  retryOptions?: RetryOptions;
  createdAt: number;
}

interface RequestStats {
  total: number;
  pending: number;
  completed: number;
  failed: number;
  byCategory: Record<string, { total: number; completed: number; failed: number }>;
}

class RequestManager {
  private static instance: RequestManager;
  private queue: RequestTask[] = [];
  private activeRequests = new Map<string, AbortController>();
  private maxConcurrent = 6; // 最大并发请求数
  private stats: RequestStats = {
    total: 0,
    pending: 0,
    completed: 0,
    failed: 0,
    byCategory: {},
  };

  static getInstance(): RequestManager {
    if (!RequestManager.instance) {
      RequestManager.instance = new RequestManager();
    }
    return RequestManager.instance;
  }

  constructor() {
    logger.debug('请求管理器已初始化', { maxConcurrent: this.maxConcurrent });
  }

  // 添加请求到队列
  async request(
    url: string,
    options: RequestInit = {},
    priority: number = 0,
    category: string = 'general',
    retryOptions?: RetryOptions
  ): Promise<Response> {
    return new Promise((resolve, reject) => {
      const task: RequestTask = {
        id: this.generateId(),
        url,
        options,
        priority,
        category,
        resolve,
        reject,
        retryOptions,
        createdAt: Date.now(),
      };

      this.queue.push(task);
      this.stats.total++;
      this.stats.pending++;

      // 更新分类统计
      if (!this.stats.byCategory[category]) {
        this.stats.byCategory[category] = { total: 0, completed: 0, failed: 0 };
      }
      this.stats.byCategory[category].total++;

      // 按优先级排序队列
      this.queue.sort((a, b) => b.priority - a.priority);

      logger.debug('请求已加入队列', {
        id: task.id,
        url: url.substring(0, 50),
        priority,
        category,
        queueLength: this.queue.length,
      });

      // 立即尝试处理队列
      this.processQueue();
    });
  }

  // 处理请求队列
  private async processQueue(): Promise<void> {
    // 检查是否有空闲的并发槽位
    while (this.activeRequests.size < this.maxConcurrent && this.queue.length > 0) {
      const task = this.queue.shift()!;
      this.executeTask(task);
    }
  }

  // 执行单个请求任务
  private async executeTask(task: RequestTask): Promise<void> {
    const controller = new AbortController();
    this.activeRequests.set(task.id, controller);

    try {
      logger.debug('开始执行请求', {
        id: task.id,
        url: task.url.substring(0, 50),
        category: task.category,
        activeCount: this.activeRequests.size,
      });

      // 合并 AbortSignal
      const combinedOptions: RequestInit = {
        ...task.options,
        signal: this.combineSignals(controller.signal, task.options.signal ?? undefined),
      };

      let response: Response;

      if (task.retryOptions) {
        // 使用重试机制
        response = await errorHandler.withRetry(
          () => fetch(task.url, combinedOptions),
          task.retryOptions,
          `${task.category}-${task.id}`
        );
      } else {
        // 直接请求
        response = await fetch(task.url, combinedOptions);
      }

      // 检查响应状态
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // 请求成功
      this.stats.completed++;
      this.stats.pending--;
      this.stats.byCategory[task.category].completed++;

      logger.debug('请求执行成功', {
        id: task.id,
        status: response.status,
        category: task.category,
        duration: Date.now() - task.createdAt,
      });

      task.resolve(response);
    } catch (error) {
      // 请求失败
      this.stats.failed++;
      this.stats.pending--;
      this.stats.byCategory[task.category].failed++;

      const err = error as Error;
      logger.warn('请求执行失败', {
        id: task.id,
        url: task.url.substring(0, 50),
        category: task.category,
        error: err.message,
        duration: Date.now() - task.createdAt,
      });

      task.reject(err);
    } finally {
      // 清理活动请求
      this.activeRequests.delete(task.id);

      // 继续处理队列
      this.processQueue();
    }
  }

  // 合并多个 AbortSignal
  private combineSignals(...signals: (AbortSignal | undefined)[]): AbortSignal {
    const validSignals = signals.filter(Boolean) as AbortSignal[];

    if (validSignals.length === 0) {
      return new AbortController().signal;
    }

    if (validSignals.length === 1) {
      return validSignals[0];
    }

    const controller = new AbortController();

    for (const signal of validSignals) {
      if (signal.aborted) {
        controller.abort();
        break;
      }

      signal.addEventListener('abort', () => {
        controller.abort();
      });
    }

    return controller.signal;
  }

  // 生成唯一ID
  private generateId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // 取消特定请求
  cancelRequest(id: string): boolean {
    const controller = this.activeRequests.get(id);
    if (controller) {
      controller.abort();
      this.activeRequests.delete(id);
      logger.debug('请求已取消', { id });
      return true;
    }

    // 从队列中移除
    const queueIndex = this.queue.findIndex((task) => task.id === id);
    if (queueIndex !== -1) {
      const task = this.queue.splice(queueIndex, 1)[0];
      task.reject(new Error('Request cancelled'));
      this.stats.pending--;
      logger.debug('队列中的请求已取消', { id });
      return true;
    }

    return false;
  }

  // 取消特定类别的所有请求
  cancelCategory(category: string): number {
    let cancelledCount = 0;

    // 取消活动请求
    for (const [id, controller] of this.activeRequests.entries()) {
      const task = this.queue.find((t) => t.id === id);
      if (task && task.category === category) {
        controller.abort();
        this.activeRequests.delete(id);
        cancelledCount++;
      }
    }

    // 取消队列中的请求
    const remainingQueue = [];
    for (const task of this.queue) {
      if (task.category === category) {
        task.reject(new Error('Category cancelled'));
        this.stats.pending--;
        cancelledCount++;
      } else {
        remainingQueue.push(task);
      }
    }
    this.queue = remainingQueue;

    if (cancelledCount > 0) {
      logger.info(`取消类别 ${category} 的请求`, { cancelledCount });
    }

    return cancelledCount;
  }

  // 清空所有请求
  cancelAll(): number {
    let cancelledCount = 0;

    // 取消所有活动请求
    for (const [, controller] of this.activeRequests.entries()) {
      controller.abort();
      cancelledCount++;
    }
    this.activeRequests.clear();

    // 取消队列中的所有请求
    for (const task of this.queue) {
      task.reject(new Error('All requests cancelled'));
      cancelledCount++;
    }
    this.queue = [];
    this.stats.pending = 0;

    if (cancelledCount > 0) {
      logger.info('取消所有请求', { cancelledCount });
    }

    return cancelledCount;
  }

  // 获取统计信息
  getStats(): RequestStats {
    return { ...this.stats };
  }

  // 获取队列状态
  getQueueStatus(): {
    queueLength: number;
    activeCount: number;
    categories: string[];
    oldestWaitTime: number;
  } {
    const now = Date.now();
    const categories = [...new Set(this.queue.map((task) => task.category))];
    const oldestWaitTime =
      this.queue.length > 0 ? Math.max(...this.queue.map((task) => now - task.createdAt)) : 0;

    return {
      queueLength: this.queue.length,
      activeCount: this.activeRequests.size,
      categories,
      oldestWaitTime,
    };
  }

  // 设置最大并发数
  setMaxConcurrent(max: number): void {
    this.maxConcurrent = Math.max(1, Math.min(max, 20)); // 限制在1-20之间
    logger.info('更新最大并发数', { maxConcurrent: this.maxConcurrent });
  }

  // 清空统计信息
  resetStats(): void {
    this.stats = {
      total: 0,
      pending: this.queue.length,
      completed: 0,
      failed: 0,
      byCategory: {},
    };
    logger.info('统计信息已重置');
  }
}

// 导出单例实例
export const requestManager = RequestManager.getInstance();

// 便利函数 - 创建不同优先级和类别的请求
export const createWallpaperRequest = (url: string, options?: RequestInit) => {
  return requestManager.request(
    url,
    options,
    10, // 高优先级
    'wallpaper',
    errorHandler.getWallpaperRetryOptions()
  );
};

export const createFaviconRequest = (url: string, options?: RequestInit) => {
  return requestManager.request(
    url,
    options,
    5, // 中优先级
    'favicon',
    errorHandler.getFaviconRetryOptions()
  );
};

export const createApiRequest = (url: string, options?: RequestInit) => {
  return requestManager.request(
    url,
    options,
    8, // 高优先级
    'api',
    { maxAttempts: 3, baseDelay: 1000 }
  );
};

export const createGeneralRequest = (url: string, options?: RequestInit) => {
  return requestManager.request(url, options, 0, 'general');
};

// 开发环境下暴露到全局对象
if (import.meta.env.DEV) {
  (window as any).requestManager = requestManager;
  logger.debug('开发模式：可使用 window.requestManager 访问请求管理功能');
}
