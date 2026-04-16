import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  nodeId: string;
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class NodeErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(
      `[Orchestrated-Space] Node ${this.props.nodeId} crashed:`,
      error,
      info.componentStack,
    );
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            width: "100%",
            height: "100%",
            minWidth: 300,
            minHeight: 200,
            background: "rgba(127, 29, 29, 0.35)",
            border: "1px solid rgba(239, 68, 68, 0.4)",
            borderRadius: 12,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            padding: 24,
            backdropFilter: "blur(12px)",
          }}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#ef4444"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <p
            style={{
              color: "#fca5a5",
              fontSize: 13,
              fontWeight: 600,
              textAlign: "center",
              margin: 0,
            }}
          >
            Node crashed
          </p>
          <p
            style={{
              color: "#fca5a5",
              fontSize: 11,
              opacity: 0.7,
              textAlign: "center",
              maxWidth: 240,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              margin: 0,
            }}
          >
            {this.state.error?.message || "Unknown error"}
          </p>
          <button
            onClick={this.handleRetry}
            style={{
              padding: "6px 16px",
              background: "rgba(239, 68, 68, 0.2)",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              borderRadius: 6,
              color: "#fca5a5",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              transition: "background 0.15s",
            }}
            onMouseOver={(e) => {
              (e.target as HTMLElement).style.background = "rgba(239, 68, 68, 0.35)";
            }}
            onMouseOut={(e) => {
              (e.target as HTMLElement).style.background = "rgba(239, 68, 68, 0.2)";
            }}
          >
            Tentar Novamente
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
