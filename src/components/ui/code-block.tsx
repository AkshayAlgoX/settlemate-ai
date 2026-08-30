"use client";

import React, { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

interface CodeBlockProps {
  code: string;
  language?: "json" | "bash" | "shell" | "typescript" | "javascript" | "sql" | "yaml" | "http" | "text" | string;
  filename?: string;
  showLineNumbers?: boolean;
  maxHeight?: string;
  className?: string;
}

/**
 * Tokenizes code string into JSX with syntax highlighting spans.
 */
function highlightCode(code: string, language: string): React.ReactNode[] {
  const lines = code.split("\n");

  return lines.map((line, lineIndex) => {
    let tokens: React.ReactNode;

    const lang = language.toLowerCase();

    if (lang === "json") {
      tokens = highlightJsonLine(line);
    } else if (lang === "bash" || lang === "shell" || lang === "curl") {
      tokens = highlightBashLine(line);
    } else if (lang === "typescript" || lang === "javascript" || lang === "ts" || lang === "js" || lang === "tsx" || lang === "jsx") {
      tokens = highlightJsLine(line);
    } else if (lang === "sql") {
      tokens = highlightSqlLine(line);
    } else if (lang === "http") {
      tokens = highlightHttpLine(line);
    } else {
      tokens = <span>{line || " "}</span>;
    }

    return (
      <div key={lineIndex} className="table-row">
        {tokens}
      </div>
    );
  });
}

function highlightJsonLine(line: string): React.ReactNode {
  const regex = /("(?:\\u[\dA-Fa-f]{4}|\\[^u]|[^\\"])*")(\s*:)?|(\btrue\b|\bfalse\b|\bnull\b)|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|([{}[\],:])/g;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(line)) !== null) {
    if (match.index > lastIndex) {
      parts.push(line.slice(lastIndex, match.index));
    }

    const [, stringVal, isKey, boolVal, numVal, punct] = match;

    if (stringVal) {
      if (isKey) {
        parts.push(
          <span key={match.index} className="text-sky-500 dark:text-sky-400">
            {stringVal}
          </span>
        );
        parts.push(
          <span key={`${match.index}-colon`} className="text-muted-foreground">
            {isKey}
          </span>
        );
      } else {
        parts.push(
          <span key={match.index} className="text-emerald-600 dark:text-emerald-400">
            {stringVal}
          </span>
        );
      }
    } else if (boolVal) {
      parts.push(
        <span key={match.index} className="text-purple-600 dark:text-purple-400 font-medium">
          {boolVal}
        </span>
      );
    } else if (numVal) {
      parts.push(
        <span key={match.index} className="text-amber-600 dark:text-amber-400">
          {numVal}
        </span>
      );
    } else if (punct) {
      parts.push(
        <span key={match.index} className="text-muted-foreground">
          {punct}
        </span>
      );
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < line.length) {
    parts.push(line.slice(lastIndex));
  }

  return parts.length > 0 ? parts : <span>{line || " "}</span>;
}

function highlightBashLine(line: string): React.ReactNode {
  if (line.trim().startsWith("#")) {
    return <span className="text-muted-foreground/80 italic">{line}</span>;
  }

  const tokens = line.split(/(\s+|"[^"]*"|'[^']*'|-[a-zA-Z0-9_-]+|--[a-zA-Z0-9_-]+)/g);

  return (
    <>
      {tokens.map((token, i) => {
        if (!token) return null;
        if (token.startsWith("-")) {
          return <span key={i} className="text-cyan-600 dark:text-cyan-400">{token}</span>;
        }
        if (token.startsWith('"') || token.startsWith("'")) {
          return <span key={i} className="text-emerald-600 dark:text-emerald-400">{token}</span>;
        }
        if (["curl", "npm", "npx", "git", "export", "echo", "cat", "node", "pnpm", "yarn", "cd", "mkdir", "sh"].includes(token)) {
          return <span key={i} className="text-purple-600 dark:text-purple-400 font-medium">{token}</span>;
        }
        if (["POST", "GET", "PUT", "DELETE", "PATCH"].includes(token)) {
          return <span key={i} className="text-amber-600 dark:text-amber-400 font-medium">{token}</span>;
        }
        if (token.startsWith("http://") || token.startsWith("https://")) {
          return <span key={i} className="text-blue-600 dark:text-blue-400 underline underline-offset-2">{token}</span>;
        }
        if (token.startsWith("$")) {
          return <span key={i} className="text-amber-500">{token}</span>;
        }
        return <span key={i} className="text-foreground">{token}</span>;
      })}
    </>
  );
}

function highlightJsLine(line: string): React.ReactNode {
  if (line.trim().startsWith("//") || line.trim().startsWith("/*")) {
    return <span className="text-muted-foreground/80 italic">{line}</span>;
  }

  const keywords = new Set([
    "import", "export", "from", "default", "const", "let", "var", "function",
    "return", "if", "else", "for", "while", "async", "await", "try", "catch",
    "throw", "new", "class", "extends", "type", "interface", "as", "switch", "case"
  ]);

  const types = new Set(["string", "number", "boolean", "void", "null", "undefined", "any", "unknown", "Promise", "Array", "Record"]);

  const tokens = line.split(/(\s+|"[^"]*"|'[^']*'|`[^`]*`|\b\w+\b|[{}()[\].,;:?!=+\-*/<>])/g);

  return (
    <>
      {tokens.map((token, i) => {
        if (!token) return null;
        if (token.startsWith('"') || token.startsWith("'") || token.startsWith("`")) {
          return <span key={i} className="text-emerald-600 dark:text-emerald-400">{token}</span>;
        }
        if (keywords.has(token)) {
          return <span key={i} className="text-purple-600 dark:text-purple-400 font-medium">{token}</span>;
        }
        if (types.has(token)) {
          return <span key={i} className="text-cyan-600 dark:text-cyan-400 font-medium">{token}</span>;
        }
        if (/^\d+$/.test(token)) {
          return <span key={i} className="text-amber-600 dark:text-amber-400">{token}</span>;
        }
        if (token === "true" || token === "false" || token === "null" || token === "undefined") {
          return <span key={i} className="text-purple-600 dark:text-purple-400">{token}</span>;
        }
        if (/[{}()[\].,;:?!=+\-*/<>]/.test(token)) {
          return <span key={i} className="text-muted-foreground">{token}</span>;
        }
        return <span key={i} className="text-foreground">{token}</span>;
      })}
    </>
  );
}

function highlightSqlLine(line: string): React.ReactNode {
  const sqlKeywords = new Set([
    "SELECT", "FROM", "WHERE", "JOIN", "LEFT", "RIGHT", "INNER", "OUTER",
    "ON", "GROUP", "BY", "ORDER", "ASC", "DESC", "LIMIT", "OFFSET",
    "INSERT", "INTO", "VALUES", "UPDATE", "SET", "DELETE", "AND", "OR", "NOT",
    "IN", "AS", "HAVING", "COUNT", "SUM", "AVG", "MIN", "MAX", "DISTINCT", "CREATE", "TABLE"
  ]);

  const tokens = line.split(/(\s+|'[^']*'|\b[a-zA-Z_]+\b|\d+|[=<>(),;*])/g);

  return (
    <>
      {tokens.map((token, i) => {
        if (!token) return null;
        if (token.startsWith("'")) {
          return <span key={i} className="text-emerald-600 dark:text-emerald-400">{token}</span>;
        }
        if (sqlKeywords.has(token.toUpperCase())) {
          return <span key={i} className="text-blue-600 dark:text-blue-400 font-semibold">{token.toUpperCase()}</span>;
        }
        if (/^\d+$/.test(token)) {
          return <span key={i} className="text-amber-600 dark:text-amber-400">{token}</span>;
        }
        return <span key={i} className="text-foreground">{token}</span>;
      })}
    </>
  );
}

function highlightHttpLine(line: string): React.ReactNode {
  if (line.startsWith("HTTP/")) {
    const parts = line.split(" ");
    const status = parts[1];
    const isSuccess = status?.startsWith("2");
    const isError = status?.startsWith("4") || status?.startsWith("5");

    return (
      <span>
        <span className="text-muted-foreground">{parts[0]} </span>
        <span className={cn("font-semibold", isSuccess ? "text-emerald-500" : isError ? "text-rose-500" : "text-amber-500")}>
          {status}{" "}
        </span>
        <span className="text-foreground">{parts.slice(2).join(" ")}</span>
      </span>
    );
  }

  if (line.includes(":")) {
    const [header, ...rest] = line.split(":");
    return (
      <span>
        <span className="text-blue-600 dark:text-blue-400 font-medium">{header}:</span>
        <span className="text-emerald-600 dark:text-emerald-400">{rest.join(":")}</span>
      </span>
    );
  }

  return <span className="text-foreground">{line}</span>;
}

export function CodeBlock({
  code,
  language = "text",
  filename,
  showLineNumbers = true,
  maxHeight = "500px",
  className,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const cleanCode = typeof code === "string" ? code.trim() : JSON.stringify(code, null, 2);
  const lines = cleanCode.split("\n");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(cleanCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-xl border border-border bg-card overflow-hidden text-xs sm:text-[13px] font-mono shadow-xs",
        className
      )}
    >
      {/* Top Header Bar */}
      {(filename || language) && (
        <div className="flex h-9 items-center justify-between border-b border-border bg-muted/40 px-3.5">
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
            {filename ? (
              <span className="font-medium text-foreground">{filename}</span>
            ) : (
              <span className="uppercase text-[11px] text-muted-foreground tracking-wider">{language}</span>
            )}
          </div>

          <button
            type="button"
            onClick={handleCopy}
            title="Copy code"
            className="flex h-6 items-center gap-1.5 rounded-md border border-border bg-background px-2 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 text-emerald-500" />
                <span className="text-emerald-500">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Code Container */}
      <div
        className="overflow-x-auto p-3.5 leading-relaxed bg-card"
        style={{ maxHeight }}
      >
        <div className="flex font-mono">
          {showLineNumbers && lines.length > 1 && (
            <div className="select-none pr-3.5 text-right text-[11px] text-muted-foreground/60 border-r border-border mr-3.5 font-mono">
              {lines.map((_, i) => (
                <div key={i} className="leading-relaxed">
                  {String(i + 1).padStart(lines.length > 99 ? 3 : 2, "0")}
                </div>
              ))}
            </div>
          )}

          <div className="flex-1 overflow-x-auto">
            {highlightCode(cleanCode, language)}
          </div>
        </div>
      </div>
    </div>
  );
}