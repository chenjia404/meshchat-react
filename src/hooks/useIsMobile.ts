import { useEffect, useState } from "react";

const QUERY = "(max-width: 768px)";

/**
 * 依視窗寬度判斷是否為行動版面（與原 App matchMedia 邏輯一致）。
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const apply = () => {
      setIsMobile(mq.matches);
    };
    if (!mq) {
      setIsMobile(false);
      return;
    }
    apply();
    try {
      mq.addEventListener("change", apply);
      return () => mq.removeEventListener("change", apply);
    } catch {
      window.onresize = () => apply();
      return () => {
        window.onresize = null;
      };
    }
  }, []);

  return isMobile;
}
