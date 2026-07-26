export enum ErrorCategory {
  RENDER = "render",
  NETWORK = "network",
  STORAGE = "storage",
  WALLET = "wallet",
  SYNC = "sync",
  UNKNOWN = "unknown",
}

export enum ErrorSeverity {
  LOW = "low",
  MEDIUM = "medium",
  HIGH = "high",
  CRITICAL = "critical",
}

export interface DiagnosticInfo {
  category: ErrorCategory;
  severity: ErrorSeverity;
  message: string;
  stack?: string;
  componentStack?: string;
  timestamp: number;
  recoverable: boolean;
  context?: string;
}

const diagnosticBuffer: DiagnosticInfo[] = [];
const MAX_BUFFER_SIZE = 50;

export function classifyError(
  error: Error,
  context?: string,
): {
  category: ErrorCategory;
  severity: ErrorSeverity;
  recoverable: boolean;
} {
  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  if (
    message.includes("network") ||
    message.includes("fetch") ||
    message.includes("timeout") ||
    message.includes("econnrefused")
  ) {
    return { category: ErrorCategory.NETWORK, severity: ErrorSeverity.MEDIUM, recoverable: true };
  }

  if (
    message.includes("storage") ||
    message.includes("database") ||
    message.includes("sqlite") ||
    message.includes("asyncstorage")
  ) {
    return { category: ErrorCategory.STORAGE, severity: ErrorSeverity.HIGH, recoverable: true };
  }

  if (
    message.includes("wallet") ||
    message.includes("privy") ||
    message.includes("walletconnect")
  ) {
    return { category: ErrorCategory.WALLET, severity: ErrorSeverity.HIGH, recoverable: true };
  }

  if (message.includes("sync") || message.includes("mutation")) {
    return { category: ErrorCategory.SYNC, severity: ErrorSeverity.MEDIUM, recoverable: true };
  }

  if (
    context === "render" ||
    name === "typeerror" ||
    name === "referenceerror" ||
    name === "syntaxerror"
  ) {
    return { category: ErrorCategory.RENDER, severity: ErrorSeverity.HIGH, recoverable: true };
  }

  if (name === "error" && message.includes("unrecoverable")) {
    return {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.CRITICAL,
      recoverable: false,
    };
  }

  return { category: ErrorCategory.UNKNOWN, severity: ErrorSeverity.MEDIUM, recoverable: true };
}

export function logError(
  error: Error,
  errorInfo?: { componentStack?: string },
  context?: string,
): DiagnosticInfo {
  const { category, severity, recoverable } = classifyError(error, context);

  const diagnostic: DiagnosticInfo = {
    category,
    severity,
    message: error.message,
    stack: error.stack,
    componentStack: errorInfo?.componentStack ?? undefined,
    timestamp: Date.now(),
    recoverable,
    context,
  };

  if (__DEV__) {
    const prefix = `[ErrorLogger:${category}:${severity}]`;
    console.error(`${prefix} ${error.message}`);
    if (errorInfo?.componentStack) {
      console.error(`${prefix} Component stack:`, errorInfo.componentStack);
    }
    if (!recoverable) {
      console.error(`${prefix} UNRECOVERABLE error detected`);
    }
  }

  diagnosticBuffer.push(diagnostic);
  if (diagnosticBuffer.length > MAX_BUFFER_SIZE) {
    diagnosticBuffer.shift();
  }

  return diagnostic;
}

export function getDiagnostics(): ReadonlyArray<DiagnosticInfo> {
  return diagnosticBuffer;
}

export function clearDiagnostics(): void {
  diagnosticBuffer.length = 0;
}
