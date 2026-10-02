'use client';

import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
  type LucideIcon,
} from 'lucide-react';
import { cx } from '../ui';

/** Empty documents come out as "" rather than "<p></p>". */
const htmlOf = (editor: Editor) => (editor.isEmpty ? '' : editor.getHTML());

/**
 * Tiptap editor limited to what the API keeps (p, strong, em, u, s, h2, h3, lists, quote, links).
 * `onReady` reports the editor's normalised HTML for the initial content, so callers can
 * compare later edits against it without a false "unsaved" flag.
 */
export function RichTextEditor({
  id,
  initialHtml,
  onChange,
  onReady,
  disabled,
}: {
  id?: string;
  initialHtml: string;
  onChange: (html: string) => void;
  onReady?: (html: string) => void;
  disabled?: boolean;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        code: false,
        codeBlock: false,
        horizontalRule: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
      }),
    ],
    content: initialHtml,
    editorProps: {
      attributes: {
        ...(id ? { id } : {}),
        role: 'textbox',
        'aria-multiline': 'true',
        class: 'min-h-40 px-3 py-2 outline-none',
      },
    },
    onCreate: ({ editor }) => onReady?.(htmlOf(editor)),
    onUpdate: ({ editor }) => onChange(htmlOf(editor)),
  });

  const active = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            bold: e.isActive('bold'),
            italic: e.isActive('italic'),
            h2: e.isActive('heading', { level: 2 }),
            h3: e.isActive('heading', { level: 3 }),
            bullet: e.isActive('bulletList'),
            ordered: e.isActive('orderedList'),
            quote: e.isActive('blockquote'),
            link: e.isActive('link'),
          }
        : null,
  });

  function setLink() {
    if (!editor) return;
    const previous = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Link URL (leave empty to remove)', previous ?? 'https://');
    if (url === null) return;
    const chain = editor.chain().focus().extendMarkRange('link');
    if (!url.trim() || url.trim() === 'https://') chain.unsetLink().run();
    else chain.setLink({ href: url.trim() }).run();
  }

  const tools: { label: string; icon: LucideIcon; on?: boolean; run: () => void }[] = editor
    ? [
        {
          label: 'Bold',
          icon: Bold,
          on: active?.bold,
          run: () => editor.chain().focus().toggleBold().run(),
        },
        {
          label: 'Italic',
          icon: Italic,
          on: active?.italic,
          run: () => editor.chain().focus().toggleItalic().run(),
        },
        {
          label: 'Heading',
          icon: Heading2,
          on: active?.h2,
          run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
        },
        {
          label: 'Subheading',
          icon: Heading3,
          on: active?.h3,
          run: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
        },
        {
          label: 'Bulleted list',
          icon: List,
          on: active?.bullet,
          run: () => editor.chain().focus().toggleBulletList().run(),
        },
        {
          label: 'Numbered list',
          icon: ListOrdered,
          on: active?.ordered,
          run: () => editor.chain().focus().toggleOrderedList().run(),
        },
        {
          label: 'Quote',
          icon: Quote,
          on: active?.quote,
          run: () => editor.chain().focus().toggleBlockquote().run(),
        },
        { label: 'Link', icon: LinkIcon, on: active?.link, run: setLink },
      ]
    : [];

  return (
    <div
      className={cx(
        'overflow-hidden rounded-md border border-line bg-background transition focus-within:border-foreground',
        disabled && 'opacity-60',
      )}
    >
      {!disabled && (
        <div
          className="flex flex-wrap gap-0.5 border-b border-line bg-surface/60 p-1"
          role="toolbar"
          aria-label="Formatting"
        >
          {tools.map(({ label, icon: Icon, on, run }) => (
            <button
              key={label}
              type="button"
              title={label}
              aria-label={label}
              aria-pressed={Boolean(on)}
              // Keep focus and the selection in the editor.
              onMouseDown={(e) => e.preventDefault()}
              onClick={run}
              className={cx(
                'rounded p-1.5 text-muted transition hover:bg-background hover:text-foreground',
                on && 'bg-background text-foreground shadow-sm',
              )}
            >
              <Icon className="size-4" aria-hidden />
            </button>
          ))}
        </div>
      )}
      <EditorContent
        editor={editor}
        className={cx(
          'text-sm leading-relaxed',
          '[&_.tiptap>*+*]:mt-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:text-base [&_h3]:font-semibold',
          '[&_ul]:list-disc [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:pl-5',
          '[&_blockquote]:border-l-2 [&_blockquote]:border-line [&_blockquote]:pl-3 [&_blockquote]:text-muted',
          '[&_a]:underline',
        )}
      />
    </div>
  );
}
