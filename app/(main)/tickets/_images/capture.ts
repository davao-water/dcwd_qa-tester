"use client";

import { useSyncExternalStore } from "react";

/** One frame of a tab, window or screen the person picks, or null when they cancel the browser's prompt. */
export async function captureFrame(): Promise<File | null> {
  let stream: MediaStream;
  try {
    // Chrome/Edge-only hints: offer other tabs and windows, not QA Hub's own tab.
    stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false, preferCurrentTab: false, selfBrowserSurface: "exclude" } as DisplayMediaStreamOptions);
  } catch {
    return null;
  }
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.srcObject = stream;
    await video.play();
    // Wait for a painted frame; the first one can still be blank.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
    if (!blob) return null;
    const stamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-");
    return new File([blob], `capture-${stamp}.png`, { type: "image/png" });
  } finally {
    // Stop sharing at once; only the one frame is kept.
    stream.getTracks().forEach((t) => t.stop());
  }
}

export const canCaptureScreen = () => typeof navigator !== "undefined" && !!navigator.mediaDevices?.getDisplayMedia;

/** Whether this browser can capture a tab or window. False while hydrating, like the server render, then the real answer. */
export const useCanCapture = () => useSyncExternalStore(() => () => {}, canCaptureScreen, () => false);
