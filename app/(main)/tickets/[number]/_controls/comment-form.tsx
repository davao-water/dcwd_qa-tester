"use client";

import { useCloseGuard } from "@/components/close-guard";
import { FormMessage } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useTouchScreen } from "@/hooks/use-touch-screen";
import { initialFormState, type FormState } from "@/lib/form";
import { SendIcon } from "lucide-react";
import { useActionState, useCallback, useState } from "react";
import { addComment } from "../../actions";
import { AttachMenu } from "../../attach-menu";
import { ImagePicker, useImageAttachments } from "../../image-picker";
import { submitKeepingInput } from "../../ticket-form";
import { useVideoUpload, VideoPicker } from "../../video-picker";
import type { Ref } from "./ticket-ref";

/** `replyTo`: on the ticket page, the other person's name (or "" if there is none yet), for a visible label and the fuller buttons. */
export function CommentForm({
  ticket,
  replyTo,
}: {
  ticket: Ref;
  replyTo?: string;
}) {
  const full = replyTo !== undefined;
  const asking = replyTo ? `Write a reply to ${replyTo}` : "Write a reply";
  const images = useImageAttachments();
  const video = useVideoUpload();
  const touch = useTouchScreen();
  const [body, setBody] = useState("");
  const [state, action, pending] = useActionState(
    async (prev: FormState, fd: FormData) => {
      const r = await addComment(prev, fd);
      if (r.ok) {
        setBody("");
        images.clear();
        video.clear();
      }
      return r;
    },
    initialFormState,
  );
  const busy = pending || video.busy || images.busy;
  const canSend =
    !busy &&
    !images.failed &&
    !video.blocked &&
    (!!body.trim() ||
      images.items.length > 0 ||
      video.upload.status === "done");
  // In the ticket panel over the board, Esc or a click outside would throw an unsent reply away: ask first. (The ticket
  // page has no guard to register with, so there this does nothing.)
  const unsent =
    !!body.trim() || images.items.length > 0 || video.upload.status !== "idle";
  const closeCheck = useCallback(
    () => !unsent || window.confirm("Discard the reply you haven't sent?"),
    [unsent],
  );
  useCloseGuard(closeCheck);

  return (
    <form
      onSubmit={submitKeepingInput(action)}
      className="grid gap-3"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDrop={(e) => {
        const files = [...e.dataTransfer.files];
        if (!files.length) return;
        e.preventDefault();
        // The markup dialog is this form's child in React, so what's dropped on it arrives here too.
        if (!e.currentTarget.contains(e.target as Node)) return;
        const clip = files.find((f) => f.type.startsWith("video/"));
        if (clip) void video.start(clip);
        const rest = files.filter((f) => f !== clip);
        if (rest.length) images.add(rest);
      }}
    >
      <input type="hidden" name="id" value={ticket.id} />
      <input type="hidden" name="number" value={ticket.number} />
      <label
        htmlFor="body"
        className={full ? "text-[0.9063rem] font-medium" : "sr-only"}
      >
        {full ? "Reply" : "Your message"}
      </label>
      <Textarea
        id="body"
        name="body"
        rows={3}
        maxLength={20000}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onPaste={images.onPaste}
        onKeyDown={(e) => {
          // Enter sends, like a chat; Shift+Enter starts a new line. Not while an IME is composing a word, and not
          // while files are still uploading (the message would go without them). A phone keyboard has no Shift+Enter, so
          // there Enter starts a new line and the Send button sends.
          if (
            touch ||
            e.key !== "Enter" ||
            e.shiftKey ||
            e.nativeEvent.isComposing
          )
            return;
          e.preventDefault();
          if (canSend) e.currentTarget.form?.requestSubmit();
        }}
        placeholder={
          touch
            ? `${asking}…`
            : `${asking}… (Enter to send, Shift+Enter for a new line, Ctrl+V to paste a screenshot)`
        }
      />
      <ImagePicker state={images} id="comment-images" compact />
      <VideoPicker state={video} id="comment-video" compact />
      <FormMessage state={state} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <AttachMenu
          images={images}
          video={video}
          imagesId="comment-images"
          videoId="comment-video"
          long={full}
        />
        <Button
          type="submit"
          disabled={!canSend}
          variant={full ? "soft" : "default"}
          size={full ? "sm" : "default"}
        >
          <SendIcon />{" "}
          {video.busy
            ? "Uploading video…"
            : images.busy
              ? "Uploading…"
              : images.failed || video.blocked
                ? "Finish the files above"
                : pending
                  ? "Sending…"
                  : full
                    ? "Send reply"
                    : "Send"}
        </Button>
      </div>
    </form>
  );
}
