import { useEffect } from 'react';

interface UsePageTitleOptions {
  displayName?: string;
}

export const usePageTitle = (options: UsePageTitleOptions = {}) => {
  void options;

  useEffect(() => {
    document.title = '新标签页';
  }, []);
};
