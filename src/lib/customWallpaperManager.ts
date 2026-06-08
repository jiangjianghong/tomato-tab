// 自定义壁纸管理器 - 处理用户上传的壁纸（支持多个壁纸）
import { indexedDBCache } from './indexedDBCache';
import { memoryManager } from './memoryManager';
import { logger } from './logger';
import { clearCustomWallpaperColorCache, clearAllColorCache } from '@/utils/imageColorAnalyzer';

// 壁纸元数据接口
export interface WallpaperMetadata {
  id: string;
  name: string;
  size: number;
  uploadTime: number;
  width: number;
  height: number;
  sourceUrl?: string; // 原始URL（用于收藏功能判重）
  type?: 'image' | 'video'; // 壁纸类型，默认 'image'（兼容旧数据）
}

// 壁纸数据接口（包含原图和缩略图）
export interface WallpaperData {
  metadata: WallpaperMetadata;
  thumbnail: Blob; // 缩略图
  fullImage: Blob; // 原图
}

class CustomWallpaperManager {
  private static instance: CustomWallpaperManager;
  private readonly WALLPAPER_PREFIX = 'custom-wallpaper-';
  private readonly WALLPAPER_LIST_KEY = 'custom-wallpaper-list';
  private readonly CURRENT_WALLPAPER_KEY = 'current-custom-wallpaper-id';
  private readonly THUMBNAIL_PREFIX = 'custom-wallpaper-thumb-';
  private readonly MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
  private readonly MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB
  private readonly ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'video/mp4'];
  private readonly ALLOWED_VIDEO_TYPES = ['video/mp4'];
  private readonly THUMBNAIL_SIZE = 300; // 缩略图宽度

  static getInstance(): CustomWallpaperManager {
    if (!CustomWallpaperManager.instance) {
      CustomWallpaperManager.instance = new CustomWallpaperManager();
    }
    return CustomWallpaperManager.instance;
  }

  // 通过扩展名推断类型（兜底，Windows 下 file.type 可能为空）
  private inferType(file: File): string {
    if (file.type) return file.type;
    const ext = file.name.split('.').pop()?.toLowerCase();
    const extMap: Record<string, string> = {
      jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
      webp: 'image/webp', mp4: 'video/mp4',
    };
    return extMap[ext || ''] || '';
  }

  // 验证文件
  validateFile(file: File): { valid: boolean; error?: string } {
    const mimeType = this.inferType(file);

    if (!this.ALLOWED_TYPES.includes(mimeType)) {
      return {
        valid: false,
        error: '仅支持 JPG、PNG、WebP 图片和 MP4 视频',
      };
    }

    const isVideo = this.ALLOWED_VIDEO_TYPES.includes(mimeType);
    const maxSize = isVideo ? this.MAX_VIDEO_SIZE : this.MAX_IMAGE_SIZE;

    if (file.size > maxSize) {
      return {
        valid: false,
        error: `文件大小不能超过 ${maxSize / 1024 / 1024}MB`,
      };
    }

    return { valid: true };
  }

  // 生成唯一ID
  private generateId(): string {
    return `wallpaper-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // 生成缩略图
  private async generateThumbnail(blob: Blob): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const img = new Image();
      const blobUrl = URL.createObjectURL(blob);

      img.onload = () => {
        try {
          const maxWidth = this.THUMBNAIL_SIZE;
          const maxHeight = this.THUMBNAIL_SIZE;

          let { width, height } = img;
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.floor(width * ratio);
          height = Math.floor(height * ratio);

          canvas.width = width;
          canvas.height = height;

          ctx?.drawImage(img, 0, 0, width, height);

          canvas.toBlob(
            (thumbnailBlob) => {
              URL.revokeObjectURL(blobUrl); // 释放 Blob URL
              if (thumbnailBlob) {
                resolve(thumbnailBlob);
              } else {
                reject(new Error('缩略图生成失败'));
              }
            },
            'image/jpeg',
            0.7 // 70% 质量
          );
        } catch (error) {
          URL.revokeObjectURL(blobUrl); // 出错时也要释放
          reject(error);
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(blobUrl); // 加载失败时释放
        reject(new Error('图片加载失败'));
      };
      img.src = blobUrl;
    });
  }

  // 获取图片尺寸（不压缩）
  private async getImageDimensions(file: File): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
      const img = new Image();

      img.onload = () => {
        resolve({ width: img.width, height: img.height });
        URL.revokeObjectURL(img.src);
      };

      img.onerror = () => {
        URL.revokeObjectURL(img.src);
        reject(new Error('图片加载失败'));
      };

      img.src = URL.createObjectURL(file);
    });
  }

  // 将 File 转换为 Blob（保持原格式）
  private async fileToBlob(file: File): Promise<Blob> {
    return new Blob([await file.arrayBuffer()], { type: file.type });
  }

  // 判断文件是否为视频
  private isVideoFile(file: File): boolean {
    return this.ALLOWED_VIDEO_TYPES.includes(this.inferType(file));
  }

  // 获取视频尺寸和首帧缩略图
  private async getVideoInfo(file: File): Promise<{ width: number; height: number; thumbnail: Blob }> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const blobUrl = URL.createObjectURL(file);
      video.preload = 'metadata';
      video.muted = true;
      video.playsInline = true;

      const cleanup = () => {
        URL.revokeObjectURL(blobUrl);
        video.remove();
      };

      video.onerror = () => {
        cleanup();
        reject(new Error('视频加载失败'));
      };

      video.onloadedmetadata = () => {
        // 跳到 0.1 秒避免黑帧
        video.currentTime = Math.min(0.1, video.duration * 0.1);
      };

      video.onseeked = () => {
        try {
          const { videoWidth: width, videoHeight: height } = video;
          const canvas = document.createElement('canvas');
          const maxWidth = this.THUMBNAIL_SIZE;
          const maxHeight = this.THUMBNAIL_SIZE;
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          canvas.width = Math.floor(width * ratio);
          canvas.height = Math.floor(height * ratio);

          const ctx = canvas.getContext('2d');
          ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);

          canvas.toBlob(
            (blob) => {
              cleanup();
              if (blob) {
                resolve({ width, height, thumbnail: blob });
              } else {
                reject(new Error('视频缩略图生成失败'));
              }
            },
            'image/jpeg',
            0.7
          );
        } catch (error) {
          cleanup();
          reject(error);
        }
      };

      video.src = blobUrl;
    });
  }

  // 获取壁纸列表（存储在 localStorage 中，因为是小型 JSON 数据）
  private async getWallpaperList(): Promise<WallpaperMetadata[]> {
    try {
      const listData = localStorage.getItem(this.WALLPAPER_LIST_KEY);
      return listData ? JSON.parse(listData) : [];
    } catch (error) {
      logger.wallpaper.warn('获取壁纸列表失败', error);
      return [];
    }
  }

  // 保存壁纸列表（存储在 localStorage 中，因为是小型 JSON 数据）
  private async saveWallpaperList(list: WallpaperMetadata[]): Promise<void> {
    try {
      localStorage.setItem(this.WALLPAPER_LIST_KEY, JSON.stringify(list));
    } catch (error) {
      logger.wallpaper.error('保存壁纸列表失败', error);
      throw error;
    }
  }

  // 上传并保存自定义壁纸（保存原图）
  async uploadWallpaper(file: File): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
      // 验证文件
      const validation = this.validateFile(file);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      const isVideo = this.isVideoFile(file);

      logger.wallpaper.info('开始上传自定义壁纸', {
        name: file.name,
        size: `${(file.size / 1024 / 1024).toFixed(2)}MB`,
        type: file.type,
        isVideo,
      });

      // 生成唯一ID
      const id = this.generateId();

      let width: number;
      let height: number;
      let thumbnail: Blob;

      if (isVideo) {
        // 视频：从首帧提取尺寸和缩略图
        const videoInfo = await this.getVideoInfo(file);
        width = videoInfo.width;
        height = videoInfo.height;
        thumbnail = videoInfo.thumbnail;
      } else {
        // 图片：原有逻辑
        const dimensions = await this.getImageDimensions(file);
        width = dimensions.width;
        height = dimensions.height;
        thumbnail = await this.generateThumbnail(await this.fileToBlob(file));
      }

      // 保存原文件（不压缩）
      const originalBlob = await this.fileToBlob(file);

      // 创建元数据
      const metadata: WallpaperMetadata = {
        id,
        name: file.name,
        size: originalBlob.size,
        uploadTime: Date.now(),
        width,
        height,
        type: isVideo ? 'video' : 'image',
      };

      // 保存原文件到 IndexedDB
      await indexedDBCache.set(
        `${this.WALLPAPER_PREFIX}${id}`,
        originalBlob,
        365 * 24 * 60 * 60 * 1000 // 1年有效期
      );

      // 保存缩略图到 IndexedDB
      await indexedDBCache.set(
        `${this.THUMBNAIL_PREFIX}${id}`,
        thumbnail,
        365 * 24 * 60 * 60 * 1000
      );

      // 更新壁纸列表
      const list = await this.getWallpaperList();
      list.push(metadata);
      await this.saveWallpaperList(list);

      // 设置为当前壁纸
      await this.setCurrentWallpaper(id);

      logger.wallpaper.info('自定义壁纸上传成功', {
        id,
        type: isVideo ? 'video' : 'image',
        originalSize: `${(originalBlob.size / 1024 / 1024).toFixed(2)}MB`,
        thumbnailSize: `${(thumbnail.size / 1024).toFixed(2)}KB`,
        dimensions: `${width}×${height}`,
      });

      return { success: true, id };
    } catch (error) {
      logger.wallpaper.error('上传自定义壁纸失败', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '上传失败',
      };
    }
  }

  // 获取所有壁纸（带缩略图）
  async getAllWallpapers(): Promise<
    Array<{ metadata: WallpaperMetadata; thumbnailUrl: string; isActive: boolean }>
  > {
    try {
      const list = await this.getWallpaperList();
      const currentId = await this.getCurrentWallpaperId();

      const wallpapers = await Promise.all(
        list.map(async (metadata) => {
          const thumbnail = (await indexedDBCache.get(
            `${this.THUMBNAIL_PREFIX}${metadata.id}`
          )) as Blob;
          const thumbnailUrl = thumbnail
            ? await memoryManager.createBlobUrl(thumbnail, 'custom-wallpaper-thumb')
            : '';

          return {
            metadata,
            thumbnailUrl,
            isActive: metadata.id === currentId,
          };
        })
      );

      return wallpapers;
    } catch (error) {
      logger.wallpaper.error('获取所有壁纸失败', error);
      return [];
    }
  }

  // 获取当前壁纸ID
  async getCurrentWallpaperId(): Promise<string | null> {
    try {
      const id = localStorage.getItem(this.CURRENT_WALLPAPER_KEY);
      return id;
    } catch (error) {
      return null;
    }
  }

  // 设置当前壁纸
  async setCurrentWallpaper(id: string): Promise<boolean> {
    try {
      localStorage.setItem(this.CURRENT_WALLPAPER_KEY, id);
      logger.wallpaper.info('设置当前壁纸', { id });
      return true;
    } catch (error) {
      logger.wallpaper.error('设置当前壁纸失败', error);
      return false;
    }
  }

  // 获取当前自定义壁纸（返回新的Blob URL）
  async getCurrentWallpaper(): Promise<string | null> {
    try {
      const currentId = await this.getCurrentWallpaperId();
      if (!currentId) {
        return null;
      }

      const blob = (await indexedDBCache.get(`${this.WALLPAPER_PREFIX}${currentId}`)) as Blob;

      if (blob) {
        logger.wallpaper.info('获取当前自定义壁纸成功（原图）', { id: currentId });
        // 每次都生成新的 Blob URL，确保刷新后可用
        return await memoryManager.createBlobUrl(blob, 'custom-wallpaper');
      }

      return null;
    } catch (error) {
      logger.wallpaper.warn('获取当前自定义壁纸失败', error);
      return null;
    }
  }

  // 获取指定壁纸的原图URL（用于预览）
  async getWallpaperFullImage(id: string): Promise<string | null> {
    try {
      const blob = (await indexedDBCache.get(`${this.WALLPAPER_PREFIX}${id}`)) as Blob;

      if (blob) {
        logger.wallpaper.info('获取壁纸原图成功', { id });
        return await memoryManager.createBlobUrl(blob, 'custom-wallpaper-preview');
      }

      return null;
    } catch (error) {
      logger.wallpaper.error('获取壁纸原图失败', error);
      return null;
    }
  }

  // 删除指定壁纸
  async deleteWallpaper(id: string): Promise<boolean> {
    try {
      // 从 IndexedDB 删除原图和缩略图
      await indexedDBCache.delete(`${this.WALLPAPER_PREFIX}${id}`);
      await indexedDBCache.delete(`${this.THUMBNAIL_PREFIX}${id}`);

      // 从列表中移除
      const list = await this.getWallpaperList();
      const newList = list.filter((item) => item.id !== id);
      await this.saveWallpaperList(newList);

      // 如果删除的是当前壁纸，清除当前壁纸设置
      const currentId = await this.getCurrentWallpaperId();
      if (currentId === id) {
        localStorage.removeItem(this.CURRENT_WALLPAPER_KEY);
      }

      // 清理内存中的 Blob URL
      memoryManager.cleanupCategory('custom-wallpaper');
      memoryManager.cleanupCategory('custom-wallpaper-thumb');

      // 清除对应的颜色缓存
      clearCustomWallpaperColorCache(id);

      logger.wallpaper.info('删除自定义壁纸成功', { id });
      return true;
    } catch (error) {
      logger.wallpaper.error('删除自定义壁纸失败', error);
      return false;
    }
  }

  // 删除所有自定义壁纸
  async deleteAllWallpapers(): Promise<boolean> {
    try {
      const list = await this.getWallpaperList();

      for (const metadata of list) {
        await indexedDBCache.delete(`${this.WALLPAPER_PREFIX}${metadata.id}`);
        await indexedDBCache.delete(`${this.THUMBNAIL_PREFIX}${metadata.id}`);
      }

      await indexedDBCache.delete(this.WALLPAPER_LIST_KEY);
      localStorage.removeItem(this.CURRENT_WALLPAPER_KEY);

      // 清理内存中的 Blob URL
      memoryManager.cleanupCategory('custom-wallpaper');
      memoryManager.cleanupCategory('custom-wallpaper-thumb');

      // 清除所有颜色缓存
      clearAllColorCache();

      logger.wallpaper.info('删除所有自定义壁纸成功');
      return true;
    } catch (error) {
      logger.wallpaper.error('删除所有自定义壁纸失败', error);
      return false;
    }
  }

  // 检查是否有自定义壁纸
  async hasCustomWallpaper(): Promise<boolean> {
    try {
      const list = await this.getWallpaperList();
      return list.length > 0;
    } catch (error) {
      return false;
    }
  }

  // 获取壁纸总数
  async getWallpaperCount(): Promise<number> {
    try {
      const list = await this.getWallpaperList();
      return list.length;
    } catch (error) {
      return 0;
    }
  }

  // 下载壁纸
  async downloadWallpaper(id: string): Promise<boolean> {
    try {
      const blob = (await indexedDBCache.get(`${this.WALLPAPER_PREFIX}${id}`)) as Blob;
      const list = await this.getWallpaperList();
      const metadata = list.find((item) => item.id === id);

      if (!blob || !metadata) {
        return false;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = metadata.name || `wallpaper-${id}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      logger.wallpaper.info('下载壁纸成功', { id, name: metadata.name });
      return true;
    } catch (error) {
      logger.wallpaper.error('下载壁纸失败', error);
      return false;
    }
  }

  // 获取壁纸信息（兼容旧版本API）
  async getWallpaperInfo(): Promise<{
    exists: boolean;
    count?: number;
    totalSize?: number;
    currentWallpaper?: WallpaperMetadata;
  }> {
    try {
      const list = await this.getWallpaperList();
      const currentId = await this.getCurrentWallpaperId();

      if (list.length === 0) {
        return { exists: false };
      }

      const totalSize = list.reduce((sum, item) => sum + item.size, 0);
      const currentWallpaper = currentId ? list.find((item) => item.id === currentId) : undefined;

      return {
        exists: true,
        count: list.length,
        totalSize,
        currentWallpaper,
      };
    } catch (error) {
      return { exists: false };
    }
  }

  // 提取URL的核心标识（用于判重）
  private extractUrlCore(url: string): string {
    try {
      // 0. 特殊处理 Supabase Edge Function URL
      // 格式: .../wallpaper-service?resolution=...&date=...
      if (url.includes('wallpaper-service')) {
        // 对于壁纸服务 URL，必须保留参数，因为日期在参数里
        // 为了避免参数顺序不同导致的问题，提取 date 作为核心标识
        const dateMatch = url.match(/date=([^&]+)/);
        if (dateMatch) {
          const date = dateMatch[1];
          logger.wallpaper.debug('提取 Wallpapaer Service Date:', date);
          return `wallpaper-service-${date}`;
        }
        // 如果没有 date 参数，回退到使用完整 URL
        return url;
      }

      // 多种匹配模式，适配不同的 URL 格式

      // 1. Bing 格式: OHR.ImageName_ZH-CN1234567890
      // 完整 URL 示例: https://www.bing.com/th?id=OHR.LakeAubert_ZH-CN4567890123_UHD.jpg
      // 或者路径格式: https://www.bing.com/th/id/OHR.LakeAubert_ZH-CN4567890123_1920x1080.jpg
      // 注意：OHR ID 可能在 URL 参数中，所以需要在完整 URL 中搜索
      const bingMatch = url.match(/OHR\.([A-Za-z0-9]+)_[A-Z]{2,3}-[A-Z]{2,3}\d+/);
      if (bingMatch) {
        logger.wallpaper.debug('提取 Bing OHR ID:', bingMatch[0]);
        return bingMatch[0];
      }

      // 移除 URL 参数（对于 Unsplash 和其他格式）
      const urlWithoutParams = url.split('?')[0];

      // 2. Unsplash 格式: /photo-xxx 或 photo-xxx
      const unsplashMatch = urlWithoutParams.match(/photo-[a-zA-Z0-9_-]+/);
      if (unsplashMatch) {
        logger.wallpaper.debug('提取 Unsplash photo ID:', unsplashMatch[0]);
        return unsplashMatch[0];
      }

      // 3. 尝试提取路径的最后一段（通常是图片ID）
      const pathSegments = urlWithoutParams.split('/').filter(Boolean);
      if (pathSegments.length > 0) {
        const lastSegment = pathSegments[pathSegments.length - 1];
        logger.wallpaper.debug('提取路径最后一段作为ID:', lastSegment);
        return lastSegment;
      }

      logger.wallpaper.debug('无法提取核心ID，使用完整URL（无参数）:', urlWithoutParams);
      return urlWithoutParams;
    } catch (error) {
      logger.wallpaper.warn('提取URL核心标识失败', error);
      return url;
    }
  }


  // 检查URL是否已经被收藏
  async isUrlAlreadyFavorited(url: string): Promise<boolean> {
    const id = await this.getWallpaperIdByUrl(url);
    return !!id;
  }

  // 根据URL获取壁纸ID
  async getWallpaperIdByUrl(url: string): Promise<string | null> {
    try {
      const list = await this.getWallpaperList();
      const urlCore = this.extractUrlCore(url);

      logger.wallpaper.debug('🔍 检查收藏状态', {
        checkingUrl: url,
        extractedCore: urlCore,
        totalSavedWallpapers: list.length,
      });

      // 检查列表中是否有相同的URL（比较核心部分）
      let foundItem = list.find((item) => {
        if (!item.sourceUrl) return false;
        const itemUrlCore = this.extractUrlCore(item.sourceUrl);
        const isMatch = itemUrlCore === urlCore;

        if (isMatch) {
          logger.wallpaper.info('✅ 找到匹配的收藏壁纸 (Core Match)', {
            savedUrl: item.sourceUrl,
            savedCore: itemUrlCore,
            checkingCore: urlCore,
            id: item.id
          });
        }

        return isMatch;
      });

      // 如果核心匹配失败，尝试完全匹配
      if (!foundItem) {
        foundItem = list.find(item => item.sourceUrl === url);
        if (foundItem) {
          logger.wallpaper.info('✅ 找到匹配的收藏壁纸 (Exact Match)', { id: foundItem.id });
        }
      }

      if (!foundItem) {
        logger.wallpaper.debug('❌ 未找到匹配的收藏壁纸', {
          checkingUrl: url,
          checkingCore: urlCore,
          savedCores: list.map((item) =>
            item.sourceUrl ? this.extractUrlCore(item.sourceUrl) : 'no-url'
          ),
        });
        return null;
      }

      return foundItem.id;
    } catch (error) {
      logger.wallpaper.error('通过URL获取壁纸ID失败', error);
      return null;
    }
  }

  // 从URL下载并保存壁纸（用于收藏功能）
  async downloadAndSaveFromUrl(
    url: string,
    filename?: string
  ): Promise<{ success: boolean; id?: string; error?: string }> {
    try {
      logger.wallpaper.info('开始从URL下载壁纸', { url });

      // 检查是否已经收藏过这个URL
      const alreadyFavorited = await this.isUrlAlreadyFavorited(url);
      if (alreadyFavorited) {
        logger.wallpaper.info('壁纸已收藏，跳过重复保存', { url });
        return {
          success: false,
          error: '这张壁纸已经在你的收藏中啦',
        };
      }

      // 下载图片
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('下载失败');
      }

      const blob = await response.blob();

      // 验证文件类型
      if (!this.ALLOWED_TYPES.includes(blob.type)) {
        return {
          success: false,
          error: '不支持的图片格式',
        };
      }

      // 验证文件大小
      if (blob.size > this.MAX_IMAGE_SIZE) {
        return {
          success: false,
          error: `图片过大（${(blob.size / 1024 / 1024).toFixed(2)}MB），最大支持${this.MAX_IMAGE_SIZE / 1024 / 1024}MB`,
        };
      }

      // 生成唯一ID
      const id = this.generateId();

      // 获取图片尺寸
      const { width, height } = await this.getImageDimensions(
        new File([blob], 'temp.jpg', { type: blob.type })
      );

      // 保存原图（不压缩）
      const originalBlob = blob;

      // 生成缩略图
      const thumbnail = await this.generateThumbnail(originalBlob);

      // 创建元数据（包含 sourceUrl）
      const metadata: WallpaperMetadata = {
        id,
        name: filename || `wallpaper-${Date.now()}.jpg`,
        size: originalBlob.size,
        uploadTime: Date.now(),
        width,
        height,
        sourceUrl: url, // 保存原始URL
      };

      // 保存原图到 IndexedDB
      await indexedDBCache.set(
        `${this.WALLPAPER_PREFIX}${id}`,
        originalBlob,
        365 * 24 * 60 * 60 * 1000
      );

      // 保存缩略图到 IndexedDB
      await indexedDBCache.set(
        `${this.THUMBNAIL_PREFIX}${id}`,
        thumbnail,
        365 * 24 * 60 * 60 * 1000
      );

      // 更新壁纸列表
      const list = await this.getWallpaperList();
      list.push(metadata);
      await this.saveWallpaperList(list);

      logger.wallpaper.info('从URL下载并保存壁纸成功', {
        id,
        size: `${(blob.size / 1024 / 1024).toFixed(2)}MB`,
        sourceUrl: url,
      });

      return { success: true, id };
    } catch (error) {
      logger.wallpaper.error('从URL下载壁纸失败', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : '下载失败',
      };
    }
  }
}

// 导出单例
export const customWallpaperManager = CustomWallpaperManager.getInstance();
