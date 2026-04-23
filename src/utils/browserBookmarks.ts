import type { WebsiteData } from '@/lib/supabaseSync';

interface ImportedBookmark {
  title: string;
  url: string;
  folder: string;
}

const ROOT_FOLDER_NAMES = new Set([
  'bookmarks',
  'bookmarks bar',
  'favorites',
  'other bookmarks',
  'mobile bookmarks',
  '书签',
  '书签栏',
  '收藏夹',
  '其他书签',
  '移动设备书签',
]);

const getDirectChild = (element: Element, tagName: string): Element | null => {
  const upperTag = tagName.toUpperCase();
  return Array.from(element.children).find((child) => child.tagName === upperTag) ?? null;
};

const getFolderDl = (dt: Element): Element | null => {
  const childDl = getDirectChild(dt, 'DL');
  if (childDl) return childDl;

  let sibling = dt.nextElementSibling;
  while (sibling) {
    if (sibling.tagName === 'DL') return sibling;
    if (sibling.tagName === 'DT') return null;
    sibling = sibling.nextElementSibling;
  }

  return null;
};

const cleanFolderPath = (folders: string[]) => {
  const cleaned = folders
    .map((folder) => folder.trim())
    .filter(Boolean)
    .filter((folder, index) => index > 0 || !ROOT_FOLDER_NAMES.has(folder.toLowerCase()));

  return cleaned.join(' / ') || '导入书签';
};

const normalizeUrl = (url: string) => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }

    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
};

const fallbackTitle = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

const faviconForUrl = (url: string) => {
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  } catch {
    return '/icon/favicon.png';
  }
};

const traverseBookmarkList = (
  dl: Element,
  folders: string[],
  imported: ImportedBookmark[],
  seenUrls: Set<string>
) => {
  Array.from(dl.children).forEach((child) => {
    if (child.tagName !== 'DT') return;

    const link = getDirectChild(child, 'A') as HTMLAnchorElement | null;
    if (link) {
      const normalizedUrl = normalizeUrl(link.getAttribute('href') || '');
      if (!normalizedUrl || seenUrls.has(normalizedUrl)) return;

      seenUrls.add(normalizedUrl);
      imported.push({
        title: link.textContent?.trim() || fallbackTitle(normalizedUrl),
        url: normalizedUrl,
        folder: cleanFolderPath(folders),
      });
      return;
    }

    const heading = getDirectChild(child, 'H3');
    if (!heading) return;

    const folderName = heading.textContent?.trim();
    const nestedList = getFolderDl(child);
    if (folderName && nestedList) {
      traverseBookmarkList(nestedList, [...folders, folderName], imported, seenUrls);
    }
  });
};

export function parseBrowserBookmarkHtml(html: string): ImportedBookmark[] {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const root = doc.querySelector('dl');
  if (!root) return [];

  const imported: ImportedBookmark[] = [];
  traverseBookmarkList(root, [], imported, new Set());
  return imported;
}

export function convertBookmarksToWebsites(
  bookmarks: ImportedBookmark[],
  existingWebsites: WebsiteData[]
) {
  const existingUrls = new Set(
    existingWebsites
      .map((site) => normalizeUrl(site.url))
      .filter((url): url is string => Boolean(url))
  );
  const now = Date.now();
  let skippedDuplicates = 0;

  const websites = bookmarks.reduce<WebsiteData[]>((result, bookmark, index) => {
    const normalizedUrl = normalizeUrl(bookmark.url);
    if (!normalizedUrl || existingUrls.has(normalizedUrl)) {
      skippedDuplicates += 1;
      return result;
    }

    existingUrls.add(normalizedUrl);
    result.push({
      id: `bookmark-${now}-${index}`,
      name: bookmark.title,
      url: normalizedUrl,
      favicon: faviconForUrl(normalizedUrl),
      tags: [bookmark.folder],
      note: `来自浏览器书签：${bookmark.folder}`,
      visitCount: 0,
      lastVisit: new Date(now).toISOString().split('T')[0],
      updatedAt: now + index,
    });

    return result;
  }, []);

  return {
    websites,
    skippedDuplicates,
  };
}
