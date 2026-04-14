interface ToolbarProps {
  onAddTerminal: () => void;
  onAddNote: () => void;
  onAddVSCode: () => void;
  onAddObsidian: () => void;
  onAddGroup: () => void;
  nodeCount: number;
}

export default function Toolbar({
  onAddTerminal,
  onAddNote,
  onAddVSCode,
  onAddObsidian,
  onAddGroup,
  nodeCount,
}: ToolbarProps) {
  return (
    <div
      className="flex items-center gap-3 px-4 py-2 border rounded-xl shadow-lg"
      style={{
        background: "rgba(26,26,46,0.9)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderColor: "rgba(42,42,74,0.5)",
        boxShadow: "0 0 15px rgba(124,58,237,0.08), 0 8px 32px rgba(0,0,0,0.3)",
      }}
    >
      <button
        onClick={onAddTerminal}
        className="flex items-center gap-2 px-3 py-1.5 bg-mx-accent hover:bg-mx-accent/80 text-white text-sm font-medium rounded-lg transition-colors"
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

      <button
        onClick={onAddNote}
        className="flex items-center gap-2 px-3 py-1.5 bg-amber-600 hover:bg-amber-600/80 text-white text-sm font-medium rounded-lg transition-colors"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          className="shrink-0"
        >
          <path
            d="M2 2h10v10H2zM5 5h4M5 7h4M5 9h2"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Note
      </button>

      <button
        onClick={onAddVSCode}
        className="flex items-center gap-2 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-600/80 text-white text-sm font-medium rounded-lg transition-colors"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          className="shrink-0"
        >
          <path
            d="M2 3l4 4-4 4M7 11h5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        VS Code
      </button>

      <button
        onClick={onAddObsidian}
        className="flex items-center gap-2 px-3 py-1.5 bg-purple-600 hover:bg-purple-600/80 text-white text-sm font-medium rounded-lg transition-colors"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          className="shrink-0"
        >
          <path
            d="M4 1l6 2v8l-6 2V1zM4 5l3 2-3 2"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Vault
      </button>

      <button
        onClick={onAddGroup}
        className="flex items-center gap-2 px-3 py-1.5 bg-slate-600 hover:bg-slate-600/80 text-white text-sm font-medium rounded-lg transition-colors"
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 14 14"
          fill="none"
          className="shrink-0"
        >
          <rect
            x="1.5"
            y="1.5"
            width="11"
            height="11"
            rx="2"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="3 2"
          />
        </svg>
        Group
      </button>

      <div className="w-px h-5 bg-mx-border/50" />

      <div className="flex items-center gap-1.5">
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-mx-muted text-sm tabular-nums">{nodeCount}</span>
      </div>
    </div>
  );
}
