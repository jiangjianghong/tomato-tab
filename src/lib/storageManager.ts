// 存储管理工具 - 根据用户Cookie同意状态管理数据存储
export class StorageManager {
  private static instance: StorageManager;
  private consentCache: 'accepted' | 'declined' | 'pending' | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_DURATION = 1000; // 1秒缓存

  static getInstance(): StorageManager {
    if (!StorageManager.instance) {
      StorageManager.instance = new StorageManager();
    }
    return StorageManager.instance;
  }

  // 刷新同意状态缓存
  private refreshConsentCache(): 'accepted' | 'declined' | 'pending' {
    try {
      const consent = localStorage.getItem('cookie-consent');
      if (consent === 'accepted') {
        this.consentCache = 'accepted';
      } else if (consent === 'declined') {
        this.consentCache = 'declined';
      } else {
        this.consentCache = 'pending';
      }
      this.cacheTimestamp = Date.now();
      return this.consentCache;
    } catch {
      this.consentCache = 'pending';
      this.cacheTimestamp = Date.now();
      return 'pending';
    }
  }

  // 检查用户是否同意Cookie使用（带缓存）
  hasConsent(): boolean {
    const now = Date.now();
    if (!this.consentCache || now - this.cacheTimestamp > this.CACHE_DURATION) {
      this.refreshConsentCache();
    }
    return this.consentCache === 'accepted';
  }

  // 更新同意状态并刷新缓存
  updateConsentStatus(status: 'accepted' | 'declined'): void {
    try {
      localStorage.setItem('cookie-consent', status);
      this.consentCache = status;
      this.cacheTimestamp = Date.now();
    } catch (error) {
      // 保持console.error，避免循环依赖
    }
  }

  // 检查Cookie同意状态（带缓存）
  getConsentStatus(): 'accepted' | 'declined' | 'pending' {
    const now = Date.now();
    if (!this.consentCache || now - this.cacheTimestamp > this.CACHE_DURATION) {
      return this.refreshConsentCache();
    }
    return this.consentCache;
  }

  // 安全的localStorage设置
  setItem(key: string, value: string, isEssential: boolean = false): boolean {
    try {
      // 必要的功能性存储（如Cookie同意状态）总是允许
      if (isEssential || this.hasConsent()) {
        localStorage.setItem(key, value);
        return true;
      } else {
        // 保持console.warn，避免循环依赖
        return false;
      }
    } catch (error) {
      // 存储管理器的错误保持console.error，因为logger可能依赖存储
      return false;
    }
  }

  // 安全的localStorage获取
  getItem(key: string, isEssential: boolean = false): string | null {
    try {
      // 必要的功能性存储总是允许读取
      if (isEssential || this.hasConsent()) {
        return localStorage.getItem(key);
      } else {
        // 保持console.warn，避免循环依赖
        return null;
      }
    } catch (error) {
      // 保持console.error，避免循环依赖
      return null;
    }
  }

  // 安全的localStorage删除
  removeItem(key: string, isEssential: boolean = false): boolean {
    try {
      if (isEssential || this.hasConsent()) {
        localStorage.removeItem(key);
        return true;
      } else {
        // 保持console.warn，避免循环依赖
        return false;
      }
    } catch (error) {
      // 保持console.error，避免循环依赖
      return false;
    }
  }

  // 获取所有存储的键名（仅在有同意时）
  getAllKeys(includeEssential: boolean = true): string[] {
    try {
      if (!this.hasConsent() && !includeEssential) {
        return [];
      }

      const keys: string[] = [];
      const essentialKeys = ['cookie-consent', 'cookie-consent-date'];

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          if (includeEssential || !essentialKeys.includes(key)) {
            keys.push(key);
          }
        }
      }
      return keys;
    } catch {
      return [];
    }
  }

  // 清除所有非必要数据
  clearNonEssentialData(): void {
    const essentialKeys = ['cookie-consent', 'cookie-consent-date'];
    const allKeys = this.getAllKeys(true);

    allKeys.forEach((key) => {
      if (!essentialKeys.includes(key)) {
        try {
          localStorage.removeItem(key);
        } catch (error) {
          // 保持console.error，避免循环依赖
        }
      }
    });

    // 保持console.log，避免循环依赖
  }

  // 获取存储使用统计
  getStorageStats(): {
    totalKeys: number;
    essentialKeys: number;
    nonEssentialKeys: number;
    consentRequired: boolean;
    storageUsed: string;
  } {
    const allKeys = this.getAllKeys(true);
    const essentialKeys = ['cookie-consent', 'cookie-consent-date'];
    const nonEssentialCount = allKeys.filter((key) => !essentialKeys.includes(key)).length;

    // 估算存储使用量
    let totalSize = 0;
    allKeys.forEach((key) => {
      try {
        const value = localStorage.getItem(key) || '';
        totalSize += key.length + value.length;
      } catch {
        // 忽略错误
      }
    });

    return {
      totalKeys: allKeys.length,
      essentialKeys: essentialKeys.filter((key) => allKeys.includes(key)).length,
      nonEssentialKeys: nonEssentialCount,
      consentRequired: !this.hasConsent() && nonEssentialCount > 0,
      storageUsed: `${Math.round((totalSize / 1024) * 100) / 100} KB`,
    };
  }

  // 导出数据（仅在有同意时）
  exportData(): object | null {
    if (!this.hasConsent()) {
      // 保持console.warn，避免循环依赖
      return null;
    }

    const data: { [key: string]: any } = {};
    const keys = this.getAllKeys(false); // 排除必要键

    keys.forEach((key) => {
      try {
        const value = localStorage.getItem(key);
        if (value) {
          data[key] = JSON.parse(value);
        }
      } catch {
        data[key] = localStorage.getItem(key);
      }
    });

    return {
      exportTime: new Date().toISOString(),
      consentStatus: this.getConsentStatus(),
      data,
    };
  }
}

// 导出单例实例
export const storageManager = StorageManager.getInstance();

// 创建便捷的钩子函数
// 模块级单例：返回值引用稳定，可安全放进 useEffect/useCallback 依赖数组，
// 避免每次渲染生成新对象导致依赖它的 effect 反复执行（如全量书签序列化写 localStorage）
const storageApi = {
  setItem: (key: string, value: any, isEssential: boolean = false) => {
    const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
    return storageManager.setItem(key, stringValue, isEssential);
  },
  getItem: <T>(key: string, isEssential: boolean = false): T | null => {
    const value = storageManager.getItem(key, isEssential);
    if (!value) return null;

    try {
      return JSON.parse(value) as T;
    } catch {
      return value as T;
    }
  },
  removeItem: (key: string, isEssential: boolean = false) => {
    return storageManager.removeItem(key, isEssential);
  },
  hasConsent: () => storageManager.hasConsent(),
  getConsentStatus: () => storageManager.getConsentStatus(),
  getStats: () => storageManager.getStorageStats(),
  clearNonEssential: () => storageManager.clearNonEssentialData(),
  exportData: () => storageManager.exportData(),
};

export function useStorage() {
  return storageApi;
}
