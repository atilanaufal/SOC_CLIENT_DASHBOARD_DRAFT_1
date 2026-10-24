'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

/**
 * Preprocesses raw markdown to handle inline Base64 images, link-formatted images,
 * and custom Iris report image patterns.
 */
function preprocessMarkdown(raw: string): string {
  if (!raw) return '';

  let text = raw;

  // 1. Convert link syntax with data:image to image syntax: [Caption](data:image/...) -> ![Caption](data:image/...)
  text = text.replace(/(^|[^!])\[([^\]]*)\]\((data:image\/[^)]+)\)/g, '$1![$2]($3)');

  // 2. Convert [Caption]\n[data:image/... or [Caption] [data:image/... to ![Caption](data:image/...)
  text = text.replace(
    /\[([^\]\n]+)\]\s*\n?\s*\[(data:image\/[^;]+;base64,[^\]]+)\]/g,
    '![$1]($2)'
  );

  // 3. Convert standalone [data:image/...] to ![Image](data:image/...)
  text = text.replace(
    /(?:^|\n)\s*\[(data:image\/[^;]+;base64,[^\]]+)\]/g,
    '\n![Image]($1)'
  );

  // 4. Convert standalone raw data:image/png;base64,... into ![Image](data:image/...)
  text = text.replace(
    /(?:^|\n)\s*(data:image\/[a-zA-Z0-9\+\-\.]+;base64,[A-Za-z0-9+/=]+)\s*(?:\n|$)/g,
    '\n![Image]($1)\n'
  );

  return text;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className = '' }) => {
  const processed = preprocessMarkdown(content);

  return (
    <div className={`markdown-content text-gray-800 leading-relaxed ${className}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        urlTransform={(url) => url}
        components={{
          h1: ({ children }) => (
            <h1 className="text-lg sm:text-xl font-bold text-[#002B9A] mt-5 mb-2 pb-1 border-b border-[#002B9A]/20">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-base sm:text-lg font-bold text-gray-900 mt-4 mb-2 pb-1 border-b border-gray-200">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm sm:text-base font-bold text-gray-900 mt-3.5 mb-1.5">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-xs sm:text-sm font-bold text-gray-800 mt-3 mb-1">
              {children}
            </h4>
          ),
          p: ({ children }) => (
            <p className="text-xs sm:text-sm text-gray-700 leading-relaxed my-1.5 font-normal">
              {children}
            </p>
          ),
          ul: ({ children }) => (
            <ul className="list-disc pl-5 my-2 space-y-1 text-xs sm:text-sm text-gray-700">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal pl-5 my-2 space-y-1 text-xs sm:text-sm text-gray-700">
              {children}
            </ol>
          ),
          li: ({ children, ...props }: any) => {
            if (typeof props.checked === 'boolean') {
              return (
                <li className="list-none flex items-start gap-2 my-1 text-xs sm:text-sm text-gray-800 font-medium">
                  <input
                    type="checkbox"
                    checked={props.checked}
                    readOnly
                    className="mt-0.5 rounded border-gray-300 text-[#002B9A] focus:ring-[#002B9A] h-3.5 w-3.5"
                  />
                  <span>{children}</span>
                </li>
              );
            }
            return <li className="my-0.5 leading-relaxed">{children}</li>;
          },
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-[#002B9A] bg-blue-50/60 pl-3 py-1.5 my-2 rounded-r-md text-xs sm:text-sm italic text-gray-700">
              {children}
            </blockquote>
          ),
          code: ({ className, children, ...props }: any) => {
            const isBlock = className || (typeof children === 'string' && children.includes('\n'));
            if (isBlock) {
              return (
                <pre className="bg-slate-900 text-emerald-400 p-3 rounded-lg font-mono text-xs overflow-x-auto my-2 border border-slate-800 leading-normal">
                  <code>{children}</code>
                </pre>
              );
            }
            return (
              <code className="bg-slate-100 text-[#002B9A] font-mono text-xs px-1.5 py-0.5 rounded border border-slate-200 font-semibold">
                {children}
              </code>
            );
          },
          table: ({ children }) => (
            <div className="overflow-x-auto my-3 rounded-lg border border-gray-200 bg-white/80">
              <table className="min-w-full text-xs divide-y divide-gray-200">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-slate-100 text-gray-800 font-bold uppercase text-[11px] tracking-wider">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-gray-100 bg-white/60">
              {children}
            </tbody>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-blue-50/40 transition">
              {children}
            </tr>
          ),
          th: ({ children }) => (
            <th className="px-3 py-2 text-left font-bold text-gray-800 border-r border-gray-200 last:border-r-0">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 text-gray-700 border-r border-gray-100 last:border-r-0 align-middle">
              {children}
            </td>
          ),
          img: ({ src, alt, ...props }: any) => {
            if (!src) return null;
            return (
              <span className="my-3 block rounded-lg overflow-hidden border border-gray-200 bg-white p-1 max-w-full">
                <img
                  src={src}
                  alt={alt || 'Report Image'}
                  className="max-h-[500px] w-auto max-w-full object-contain rounded mx-auto block"
                  loading="lazy"
                  {...props}
                />
                {alt && alt !== 'Image' && alt !== 'Report Image' && (
                  <span className="block text-[11px] text-gray-500 italic mt-1.5 text-center font-medium">
                    {alt}
                  </span>
                )}
              </span>
            );
          },
          hr: () => <hr className="my-4 border-gray-200" />,
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#002B9A] hover:underline font-semibold"
            >
              {children}
            </a>
          ),
          strong: ({ children }) => (
            <strong className="font-bold text-gray-900">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
};
