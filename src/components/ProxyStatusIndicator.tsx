import { useEffect, useState } from 'react';
import { CorsProxyService } from '../lib/proxy';

interface ProxyStatusIndicatorProps {
  proxyService: CorsProxyService;
  className?: string;
}

/**
 * Component to display the status of the CORS proxy service
 */
export function ProxyStatusIndicator({ proxyService, className = '' }: ProxyStatusIndicatorProps) {
  const [status, setStatus] = useState<Record<string, 'working' | 'failed'>>({});
  const [currentProxy, setCurrentProxy] = useState<string>('');
  const [isExpanded, setIsExpanded] = useState(false);

  // Update status every 30 seconds
  useEffect(() => {
    const updateStatus = () => {
      if (document.hidden) return; // 页面不可见时跳过，避免后台空转
      const proxyStatus = proxyService.getProxyStatus();
      setStatus(proxyStatus);

      // Find the current working proxy
      const workingProxy =
        Object.entries(proxyStatus).find(([_, status]) => status === 'working')?.[0] || '';
      setCurrentProxy(workingProxy);
    };

    // Initial update
    updateStatus();

    // Set up interval
    const interval = setInterval(updateStatus, 30000);

    return () => clearInterval(interval);
  }, [proxyService]);

  // No proxies available
  if (Object.keys(status).length === 0) {
    return null;
  }

  // Count working proxies
  const workingCount = Object.values(status).filter((s) => s === 'working').length;
  const totalCount = Object.keys(status).length;

  return (
    <div className={`proxy-status ${className}`}>
      <div
        className="proxy-status-summary cursor-pointer flex items-center text-sm"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div
          className={`w-2 h-2 rounded-full mr-2 ${workingCount > 0 ? 'bg-green-500' : 'bg-red-500'}`}
        ></div>
        <span>代理服务: {workingCount > 0 ? `${currentProxy || '可用'}` : '不可用'}</span>
        <span className="text-xs text-gray-500 ml-1">
          ({workingCount}/{totalCount})
        </span>
      </div>

      {isExpanded && (
        <div className="proxy-status-details mt-2 text-xs bg-gray-100 p-2 rounded">
          <h4 className="font-semibold mb-1">代理服务状态</h4>
          <ul>
            {Object.entries(status).map(([name, state]) => (
              <li key={name} className="flex items-center">
                <span
                  className={`w-2 h-2 rounded-full mr-1 ${state === 'working' ? 'bg-green-500' : 'bg-red-500'}`}
                ></span>
                <span>
                  {name}: {state === 'working' ? '可用' : '不可用'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
