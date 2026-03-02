import api from "@/api/client";

function triggerDownload(blob: Blob, filename: string) {
  const objectUrl = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(objectUrl);
}

export async function downloadAttachment(attachmentId: string, filename: string): Promise<void> {
  const response = await api.get(`/applications/attachments/${attachmentId}/download`, {
    responseType: "blob",
  });
  triggerDownload(response.data as Blob, filename);
}
