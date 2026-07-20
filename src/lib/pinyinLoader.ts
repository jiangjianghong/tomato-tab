// pinyin-pro 携带约 870KB 拼音字典，动态加载以避免打进首屏主 chunk。
// 页面空闲时预取，用户开始输入前通常已就绪；未就绪时搜索退化为普通字符串匹配。
type PinyinModule = typeof import('pinyin-pro');

let loadedModule: PinyinModule | null = null;
let loadingPromise: Promise<PinyinModule> | null = null;

export function loadPinyin(): Promise<PinyinModule> {
  if (!loadingPromise) {
    loadingPromise = import('pinyin-pro').then((m) => {
      loadedModule = m;
      return m;
    });
  }
  return loadingPromise;
}

// 同步获取：未加载完成时返回 null，调用方需自行兜底
export function getPinyinModule(): PinyinModule | null {
  return loadedModule;
}
