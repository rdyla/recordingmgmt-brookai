export type QueueItemStatus = "queued" | "downloading" | "done" | "failed";

export type CCQueueItem = {
  key: string;              // unique: `${recording_id}|recording` or `...|transcript`
  recordingId: string;
  kind: "recording" | "transcript";
  url: string;              // Zoom URL (download_url or transcript_url)
  filename: string;         // final filename
  status: QueueItemStatus;
  error?: string;
};