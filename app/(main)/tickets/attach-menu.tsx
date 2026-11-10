"use client";

import { Menu } from "@base-ui/react/menu";
import { CameraIcon, FilmIcon, ImagePlusIcon, MonitorIcon, PaperclipIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTouchScreen } from "@/hooks/use-touch-screen";
import { IMAGE_MAX_BYTES, MAX_IMAGES_PER_POST, VIDEO_MAX_MB } from "@/lib/uploads/limits";
import { useCanCapture } from "./_images/capture";
import type { ImageAttachments } from "./_images/use-image-attachments";
import { cameraInputId } from "./image-picker";
import type { VideoUpload } from "./video-picker";

// The reply box's one button for files. It opens the pickers' hidden inputs; what gets attached shows above it.

const item =
  "flex cursor-default items-center gap-2.5 rounded-md px-3 py-2.5 text-[0.9063rem] outline-hidden select-none data-disabled:opacity-50 data-highlighted:bg-acc-t2 data-highlighted:text-acc-ink [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground";

/** `long`: the ticket page's reply box, with a small button and its longer name. */
export function AttachMenu({ images, video, imagesId, videoId, long }: { images: ImageAttachments; video: VideoUpload; imagesId: string; videoId: string; long?: boolean }) {
  const touch = useTouchScreen();
  const canCapture = useCanCapture();
  const full = images.items.length >= MAX_IMAGES_PER_POST;
  const open = (id: string) => document.getElementById(id)?.click();

  return (
    <Menu.Root>
      <Menu.Trigger render={<Button type="button" variant="outline" size={long ? "sm" : "default"} className="data-popup-open:bg-acc-t2" />}>
        <PaperclipIcon /> {long ? "Attach a file" : "Attach"}
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner side="top" align="start" sideOffset={8} className="isolate z-50">
          <Menu.Popup className="w-64 max-w-[calc(100vw-2rem)] origin-(--transform-origin) rounded-xl bg-popover p-1.5 text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-150 ease-(--ease-out) data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95">
            {touch ? (
              <Menu.Item className={item} disabled={full} onClick={() => open(cameraInputId(imagesId))}>
                <CameraIcon /> Take photo
              </Menu.Item>
            ) : null}
            <Menu.Item className={item} disabled={full} onClick={() => open(imagesId)}>
              <ImagePlusIcon /> {touch ? "Choose from gallery" : "Add images"}
            </Menu.Item>
            {canCapture && !touch ? (
              <Menu.Item className={item} disabled={full} onClick={images.capture}>
                <MonitorIcon /> Capture screen
              </Menu.Item>
            ) : null}
            <Menu.Item className={item} disabled={video.upload.status !== "idle"} onClick={() => open(videoId)}>
              <FilmIcon /> Add video
            </Menu.Item>
            <Menu.Separator className="-mx-1.5 my-1 h-px bg-line2" />
            <p className="px-3 py-1.5 text-[0.7813rem] text-muted-foreground">
              Images up to {MAX_IMAGES_PER_POST}, {IMAGE_MAX_BYTES / 1024 / 1024} MB each. Video up to 3 min, {VIDEO_MAX_MB} MB.
            </p>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
