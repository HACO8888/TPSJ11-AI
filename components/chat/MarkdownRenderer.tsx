"use client";

import { Check, Copy } from "lucide-react";
import { memo, type ReactNode, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkCjkFriendly from "remark-cjk-friendly";
import remarkGfm from "remark-gfm";

function Pre({ children }: { children?: ReactNode }) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);

  async function copy() {
    const text = ref.current?.innerText ?? "";
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="group/code relative">
      <button
        type="button"
        onClick={copy}
        aria-label="複製程式碼"
        className="absolute right-2 top-2 inline-flex h-7 items-center gap-1 rounded-md border border-line bg-surface px-2 font-mono text-[11px] text-muted opacity-0 transition hover:text-ink group-hover/code:opacity-100"
      >
        {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? "已複製" : "複製"}
      </button>
      <pre ref={ref}>{children}</pre>
    </div>
  );
}

export const MarkdownRenderer = memo(function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div className="prose-camp text-[15px]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkCjkFriendly]}
        rehypePlugins={[rehypeSanitize]}
        components={{
          a: ({ node: _node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
          pre: ({ children }) => <Pre>{children}</Pre>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
