interface ToolbarProps {
  onAddTerminal: () => void;
  nodeCount: number;
}

export default function Toolbar({ onAddTerminal, nodeCount }: ToolbarProps) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-shark-surface/90 backdrop-blur-sm border border-shark-border rounded-xl shadow-lg">
      <button
        onClick={onAddTerminal}
        className="flex items-center gap-2 px-3 py-1.5 bg-shark-accent hover:bg-shark-accent/80 text-white text-sm font-medium rounded-lg transition-colors"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          className="shrink-0"
        >
          <path
            d="M7 1v12M1 7h12"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
        Terminal
      </button>

      <div className="w-px h-5 bg-shark-border" />

      <div className="flex items-center gap-1.5">
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-shark-muted text-sm tabular-nums">
          {nodeCount}
        </span>
      </div>
    </div>
  );
}
