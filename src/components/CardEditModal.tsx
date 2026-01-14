import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { z } from 'zod';
import Tilt from 'react-parallax-tilt';
import { uploadFaviconToStorage } from '@/lib/supabaseFaviconUpload';
import { processFaviconUrl } from '@/lib/faviconUtils';

const websiteSchema = z.object({
  name: z.string().min(1, '网站名不能为空'),
  url: z.string().url('请输入有效的网址'),
  favicon: z.string().url('请输入有效的图标URL'),
  note: z.string().optional(),
});

interface CardEditModalProps {
  id: string;
  name: string;
  url: string;
  favicon: string;
  tags: string[];
  note?: string;
  onClose: () => void;
  onSave: (data: {
    id: string;
    name: string;
    url: string;
    favicon: string;
    tags: string[];
    note?: string;
  }) => void;
  onDelete?: (id: string) => void;
}

export default function CardEditModal({
  id,
  name,
  url,
  favicon,
  tags,
  note,
  onClose,
  onSave,
  onDelete,
}: CardEditModalProps) {
  const [formData, setFormData] = useState({
    name,
    url,
    favicon,
    note: note || '',
  });
  const [formTags, setFormTags] = useState<string[]>(tags || []);
  const [newTag, setNewTag] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [autoFetching, setAutoFetching] = useState(false);
  const [uploading, setUploading] = useState(false);

  // ESC键关闭模态框
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // 添加标签
  const handleAddTag = () => {
    if (newTag.trim() && formTags.length < 2 && !formTags.includes(newTag.trim())) {
      setFormTags([...formTags, newTag.trim()]);
      setNewTag('');
    }
  };

  // 删除标签
  const handleRemoveTag = (index: number) => {
    setFormTags(formTags.filter((_, i) => i !== index));
  };

  // 处理回车键添加标签
  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  /**
   * 获取 favicon 的备用 URL 列表（代理优先，支持降级）
   */
  const getFaviconUrls = (domain: string): string[] => {
    // 代理服务前缀
    const proxyPrefix = 'https://api.allorigins.win/raw?url=';

    return [
      // 使用代理访问 favicon.im（支持国内访问，速度快）
      proxyPrefix + encodeURIComponent(`https://favicon.im/${domain}?larger=true`),
      // 代理失败时的直接访问降级
      `https://favicon.im/${domain}?larger=true`,
      // 直接访问Google服务（无CORS限制）
      `https://www.google.com/s2/favicons?domain=${domain}&sz=64`,
      `https://www.google.com/s2/favicons?domain=${domain}&sz=32`,
      // 备用：DuckDuckGo的图标服务
      `https://icons.duckduckgo.com/ip3/${domain}.ico`,
      // 尝试网站自己的 favicon
      `https://${domain}/favicon.ico`,
      `https://${domain}/favicon.png`,
      // 兜底：默认图标
      '/icon/favicon.png',
    ];
  };

  /**
   * 测试图标URL是否可用
   */
  const testFaviconUrl = (url: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(url);
      img.onerror = () => reject(new Error(`无法加载: ${url}`));
      img.src = url;
      // 设置3秒超时
      setTimeout(() => reject(new Error(`超时: ${url}`)), 3000);
    });
  };

  const handleAutoFetch = async () => {
    if (!formData.url || !formData.url.startsWith('http')) {
      setErrors({ url: '请输入有效的网址(以http://或https://开头)' });
      return;
    }

    try {
      setAutoFetching(true);
      const domain = new URL(formData.url).hostname;

      // 清除该域名的 favicon 缓存，确保获取最新图标
      const extractDomain = (url: string) => {
        try {
          return new URL(url).hostname.replace(/^www\./, '');
        } catch {
          return url.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
        }
      };

      const cacheDomain = extractDomain(formData.url);
      console.log('🧹 清除域名缓存:', cacheDomain);

      // 清除旧的缓存
      try {
        const cacheKey = 'favicon-cache-simple';
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const cacheData = JSON.parse(cached);
          delete cacheData[cacheDomain];
          localStorage.setItem(cacheKey, JSON.stringify(cacheData));
        }
      } catch (error) {
        console.warn('清除缓存失败:', error);
      }

      // 尝试多个图标服务，优先使用国内访问稳定的服务
      const faviconUrls = getFaviconUrls(cacheDomain);
      let newFaviconUrl = '/icon/favicon.png'; // 默认图标

      console.log('🔍 开始尝试获取图标，优先使用国内稳定服务...');

      // 逐个尝试图标URL，找到第一个可用的
      for (const url of faviconUrls) {
        try {
          console.log(`⏳ 尝试: ${url}`);
          await testFaviconUrl(url);
          newFaviconUrl = url;
          console.log(`✅ 图标获取成功: ${url}`);
          break;
        } catch (error) {
          console.log(`❌ 图标获取失败: ${url}`);
          continue;
        }
      }

      // 自动获取favicon
      setFormData((prev) => ({
        ...prev,
        favicon: newFaviconUrl,
      }));

      // 自动获取网站名
      setFormData((prev) => ({
        ...prev,
        name: domain.replace('www.', '').split('.')[0],
      }));

      // 清除错误
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors.url;
        return newErrors;
      });

      console.log('✅ 自动获取完成，最终图标:', newFaviconUrl);
    } catch (error) {
      console.error('自动获取信息失败:', error);
      setErrors({ url: '无法解析该网址，请检查格式是否正确' });
    } finally {
      setAutoFetching(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      setUploading(true);

      const result = websiteSchema.safeParse(formData);
      if (!result.success) {
        const newErrors: Record<string, string> = {};
        result.error.errors.forEach((err) => {
          newErrors[err.path[0]] = err.message;
        });
        setErrors(newErrors);
        return;
      }

      // 使用独立的标签，不从备注中提取
      const cleanedNote = formData.note || '';

      // 处理图标变化时的逻辑
      let finalFaviconUrl = formData.favicon;

      if (formData.favicon !== favicon) {
        console.log('🔄 图标已变更，开始上传到数据库...');
        try {
          finalFaviconUrl = await uploadFaviconToStorage(formData.favicon, id);
          console.log('✅ 图标上传完成:', finalFaviconUrl);
        } catch (uploadError) {
          console.warn('⚠️ 图标上传失败，使用原始URL:', uploadError);
          // 上传失败不阻止保存，继续使用原始URL
        }
      } else {
        console.log('📋 图标未变更，跳过上传');
      }

      // 如果 favicon 发生了变化，清除缓存
      if (formData.favicon !== favicon) {
        console.log('🔄 Favicon 已更改，清除缓存');
        const extractDomain = (url: string) => {
          try {
            return new URL(url).hostname.replace(/^www\./, '');
          } catch {
            return url.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
          }
        };

        const cacheDomain = extractDomain(formData.url);
        try {
          const cacheKey = 'favicon-cache-simple';
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            const cacheData = JSON.parse(cached);
            delete cacheData[cacheDomain];
            localStorage.setItem(cacheKey, JSON.stringify(cacheData));
            console.log('🧹 已清除域名缓存:', cacheDomain);
          }
        } catch (error) {
          console.warn('清除缓存失败:', error);
        }
      }

      // 保存逻辑
      onSave({
        id,
        name: formData.name,
        url: formData.url,
        favicon: finalFaviconUrl, // 使用上传后的URL
        tags: formTags, // 使用独立的标签
        note: cleanedNote,
      });

      onClose();
    } catch (error) {
      console.error('保存失败:', error);
      setErrors({ submit: '保存失败，请重试' });
    } finally {
      setUploading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));

    // 清除错误
    if (errors[name]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 select-none">
      <Tilt
        tiltEnable={true}
        tiltReverse={false} // 正常倾斜方向
        tiltMaxAngleX={8} // 较小的倾斜角度
        tiltMaxAngleY={8} // 较小的倾斜角度
        perspective={1200} // 更远的透视距离
        transitionSpeed={800} // 稍慢的过渡速度
        scale={1.02} // 轻微缩放
        glareEnable={true}
        glareMaxOpacity={0.15} // 更轻微的光泽
        glareColor="rgba(255,255,255,0.8)" // 白色光泽
        glarePosition="all"
      >
        <motion.div
          className="w-full max-w-md bg-white dark:bg-gray-900 rounded-xl shadow-xl p-6 select-none"
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 20 }}
          transition={{
            type: 'spring',
            damping: 25,
            stiffness: 400,
          }}
          style={{
            backdropFilter: 'blur(20px)',
          }}
        >
          <div className="flex justify-between items-center mb-4 select-none">
            <h2 className="text-xl font-semibold select-none bg-gradient-to-r from-gray-800 to-gray-600 dark:from-gray-100 dark:to-gray-300 bg-clip-text text-transparent">
              编辑卡片
            </h2>
            <motion.button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 select-none p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              whileHover={{ scale: 1.1, rotate: 90 }}
              whileTap={{ scale: 0.9 }}
            >
              <i className="fa-solid fa-xmark select-none"></i>
            </motion.button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1 select-none">
                网址
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  name="url"
                  value={formData.url}
                  onChange={handleChange}
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="https://example.com"
                />
                <motion.button
                  type="button"
                  onClick={handleAutoFetch}
                  disabled={autoFetching || !formData.url}
                  className="px-3 py-2 text-white rounded-md select-none bg-gradient-to-b from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:from-blue-300 disabled:to-blue-400 disabled:cursor-not-allowed shadow-sm"
                  whileHover={!(autoFetching || !formData.url) ? { scale: 1.05, y: -1 } : {}}
                  whileTap={!(autoFetching || !formData.url) ? { scale: 0.95, y: 0 } : {}}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                >
                  {autoFetching ? (
                    <>
                      <motion.i
                        className="fa-solid fa-spinner mr-1"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      />
                      获取中...
                    </>
                  ) : (
                    '自动获取'
                  )}
                </motion.button>
              </div>
              {errors.url && <p className="mt-1 text-sm text-red-500 select-none">{errors.url}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1 select-none">
                网站名
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="网站名称"
              />
              {errors.name && (
                <p className="mt-1 text-sm text-red-500 select-none">{errors.name}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1 select-none">
                图标
              </label>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <input
                    type="url"
                    name="favicon"
                    value={formData.favicon}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="https://example.com/favicon.ico"
                  />
                </div>
                <span className="text-gray-400 select-none">或</span>
                <label className="cursor-pointer select-none">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (event) => {
                          if (event.target?.result) {
                            setFormData((prev) => ({
                              ...prev,
                              favicon: event.target?.result as string,
                            }));
                          }
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                  <div className="px-3 py-2 bg-gray-100 hover:bg-gray-200 rounded-md text-sm text-gray-700 transition-colors select-none">
                    <i className="fa-solid fa-upload mr-1 select-none"></i>上传
                  </div>
                </label>
              </div>
              {formData.favicon && (
                <div className="mt-2 flex items-center select-none">
                  <img
                    src={formData.favicon.startsWith('data:image') ? formData.favicon : processFaviconUrl(formData.favicon, formData.url || '', formData.favicon)}
                    alt="图标预览"
                    className="w-8 h-8 rounded mr-2 select-none"
                  />
                  <span className="text-xs text-gray-500 truncate max-w-xs select-none">
                    {formData.favicon.startsWith('data:image') ? '上传的图标' : formData.favicon}
                  </span>
                </div>
              )}
              {errors.favicon && (
                <p className="mt-1 text-sm text-red-500 select-none">{errors.favicon}</p>
              )}
            </div>

            {/* 独立的标签编辑区域 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1 select-none">
                标签 (最多2个)
              </label>
              <div className="space-y-2">
                {/* 现有标签显示 */}
                {formTags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {formTags.map((tag, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full"
                      >
                        {tag}
                        <button
                          type="button"
                          onClick={() => handleRemoveTag(index)}
                          className="hover:bg-blue-200 rounded-full p-0.5 transition-colors"
                        >
                          <i className="fa-solid fa-times text-xs"></i>
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                {/* 添加新标签 */}
                {formTags.length < 2 && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newTag}
                      onChange={(e) => setNewTag(e.target.value)}
                      onKeyDown={handleTagKeyDown}
                      className="flex-1 px-3 py-2 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="输入标签名称..."
                      maxLength={10}
                    />
                    <motion.button
                      type="button"
                      onClick={handleAddTag}
                      disabled={!newTag.trim() || formTags.includes(newTag.trim())}
                      className="px-3 py-2 text-white text-sm rounded-md select-none bg-gradient-to-b from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:from-gray-300 disabled:to-gray-400 disabled:cursor-not-allowed shadow-sm"
                      whileHover={
                        !(!newTag.trim() || formTags.includes(newTag.trim()))
                          ? { scale: 1.05, y: -1 }
                          : {}
                      }
                      whileTap={
                        !(!newTag.trim() || formTags.includes(newTag.trim()))
                          ? { scale: 0.95, y: 0 }
                          : {}
                      }
                      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                    >
                      添加
                    </motion.button>
                  </div>
                )}

                <div className="text-xs text-gray-500">
                  {formTags.length === 0 && '为网站添加分类标签，便于管理'}
                  {formTags.length === 1 && '还可以添加1个标签'}
                  {formTags.length === 2 && '已达到标签数量上限'}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1 select-none">
                备注
              </label>
              <textarea
                name="note"
                value={formData.note}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="网站用途说明..."
              />
            </div>

            <div className="flex flex-col gap-4 pt-4 select-none">
              <div className="flex gap-2 select-none">
                <motion.button
                  type="button"
                  onClick={onClose}
                  className="flex-1 px-4 py-2 text-gray-700 border rounded-md select-none bg-gradient-to-b from-gray-50 to-gray-100 hover:from-gray-100 hover:to-gray-200 shadow-sm border-gray-200"
                  whileHover={{ scale: 1.02, y: -1 }}
                  whileTap={{ scale: 0.98, y: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                >
                  取消
                </motion.button>
                <motion.button
                  type="submit"
                  disabled={uploading}
                  className="flex-1 px-4 py-2 text-white rounded-md select-none bg-gradient-to-b from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:from-blue-300 disabled:to-blue-400 disabled:cursor-not-allowed shadow-md"
                  whileHover={!uploading ? { scale: 1.02, y: -1 } : {}}
                  whileTap={!uploading ? { scale: 0.98, y: 0 } : {}}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                >
                  {uploading ? (
                    <>
                      <motion.i
                        className="fa-solid fa-spinner mr-2"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      />
                      上传中...
                    </>
                  ) : (
                    '保存'
                  )}
                </motion.button>
              </div>

              {/* 保存错误提示 */}
              {errors.submit && (
                <p className="text-red-500 text-sm text-center select-none">{errors.submit}</p>
              )}

              {onDelete && (
                <motion.button
                  type="button"
                  onClick={() => {
                    if (confirm('确定要删除这个卡片吗？')) {
                      onDelete(id);
                      onClose();
                    }
                  }}
                  className="w-full px-4 py-2 text-white rounded-md select-none bg-gradient-to-b from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 shadow-md border border-red-400"
                  whileHover={{ scale: 1.02, y: -1 }}
                  whileTap={{ scale: 0.98, y: 0 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                >
                  <motion.i
                    className="fa-solid fa-trash mr-2 select-none"
                    whileHover={{ rotate: [0, -10, 10, 0] }}
                    transition={{ duration: 0.5 }}
                  />
                  删除卡片
                </motion.button>
              )}
            </div>
          </form>
        </motion.div>
      </Tilt>
    </div>
  );
}
