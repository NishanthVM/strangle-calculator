import { AlertTriangle } from "lucide-react";

interface ErrorBannerProps {
  message: string;
}

export function ErrorBanner({ message }: ErrorBannerProps) {
  return (
    <div
      className="flex gap-2 items-start rounded-md border
                 border-warn-border dark:border-warn-border-dark
                 bg-warn-bg dark:bg-warn-bg-dark
                 px-2.5 py-2 mt-1 mb-3.5"
    >
      <AlertTriangle
        size={14}
        className="mt-0.5 flex-shrink-0 text-warn-text dark:text-warn-text-dark"
      />
      <span className="text-[12.5px] leading-snug text-warn-text dark:text-warn-text-dark">{message}</span>
    </div>
  );
}
