import { findVideoExecutable } from "../../src/lib/local-executable";

const detected = findVideoExecutable("ffmpeg");
export const hayFfmpeg = detected !== null;
export const rutaFfmpeg = detected ?? "ffmpeg";
