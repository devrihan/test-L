"use client";

import * as React from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Undo2,
} from "lucide-react";

import { Button } from "./button";
import { Separator } from "./separator";
import { cn } from "../../lib/utils";

type RichTextEditorProps = {
  value?: string;
  onChange?: (html: string) => void;
  editable?: boolean;
  className?: string;
  contentClassName?: string;
};

type ToolbarButtonProps = {
  editor: Editor;
  command: () => void;
  active?: boolean;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

function ToolbarButton({
  editor,
  command,
  active,
  label,
  icon: Icon,
}: ToolbarButtonProps) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "ghost"}
      size="icon"
      onClick={command}
      disabled={!editor.isEditable}
      aria-label={label}
      aria-pressed={active}
    >
      <Icon className="h-4 w-4" />
    </Button>
  );
}

export function RichTextEditor({
  value = "",
  onChange,
  editable = true,
  className,
  contentClassName,
}: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: value,
    editable,
    immediatelyRender: false,
    onUpdate: ({ editor: e }) => {
      onChange?.(e.getHTML());
    },
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm dark:prose-invert max-w-none min-h-[120px] px-3 py-2 focus:outline-none",
          contentClassName,
        ),
      },
    },
  });

  if (!editor) return null;

  return (
    <div
      className={cn(
        "rounded-md border bg-background shadow-xs",
        "focus-within:ring-[3px] focus-within:ring-ring/50 focus-within:border-ring",
        className,
      )}
    >
      <div
        role="toolbar"
        aria-label="Text formatting"
        className="flex flex-wrap items-center gap-1 border-b p-1"
      >
        <ToolbarButton
          editor={editor}
          command={() => editor.chain().focus().toggleBold().run()}
          active={editor.isActive("bold")}
          label="Bold"
          icon={Bold}
        />
        <ToolbarButton
          editor={editor}
          command={() => editor.chain().focus().toggleItalic().run()}
          active={editor.isActive("italic")}
          label="Italic"
          icon={Italic}
        />
        <ToolbarButton
          editor={editor}
          command={() => editor.chain().focus().toggleStrike().run()}
          active={editor.isActive("strike")}
          label="Strikethrough"
          icon={Strikethrough}
        />
        <Separator orientation="vertical" className="mx-1 h-6" />
        <ToolbarButton
          editor={editor}
          command={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
          active={editor.isActive("heading", { level: 2 })}
          label="Heading 2"
          icon={Heading2}
        />
        <ToolbarButton
          editor={editor}
          command={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
          active={editor.isActive("heading", { level: 3 })}
          label="Heading 3"
          icon={Heading3}
        />
        <Separator orientation="vertical" className="mx-1 h-6" />
        <ToolbarButton
          editor={editor}
          command={() => editor.chain().focus().toggleBulletList().run()}
          active={editor.isActive("bulletList")}
          label="Bullet list"
          icon={List}
        />
        <ToolbarButton
          editor={editor}
          command={() => editor.chain().focus().toggleOrderedList().run()}
          active={editor.isActive("orderedList")}
          label="Ordered list"
          icon={ListOrdered}
        />
        <ToolbarButton
          editor={editor}
          command={() => editor.chain().focus().toggleBlockquote().run()}
          active={editor.isActive("blockquote")}
          label="Quote"
          icon={Quote}
        />
        <Separator orientation="vertical" className="mx-1 h-6" />
        <ToolbarButton
          editor={editor}
          command={() => editor.chain().focus().undo().run()}
          label="Undo"
          icon={Undo2}
        />
        <ToolbarButton
          editor={editor}
          command={() => editor.chain().focus().redo().run()}
          label="Redo"
          icon={Redo2}
        />
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
