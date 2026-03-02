import { Building2, Download, MessageSquare } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { downloadAttachment } from "@/lib/attachments";
import type { ApplicationResponseInfo } from "@/types";

interface ResponsesListProps {
  responses: ApplicationResponseInfo[];
  title?: string;
}

export function ResponsesList({ responses, title = "История ответов" }: ResponsesListProps) {
  if (responses.length === 0) return null;

  const handleDownload = async (attachmentId: string, filename: string) => {
    try {
      await downloadAttachment(attachmentId, filename);
    } catch {
      // noop
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <MessageSquare className="h-5 w-5" />
        {title} ({responses.length})
      </h2>
      {responses.map((resp) => (
        <Card key={resp.id}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{resp.department_name}</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {new Date(resp.created_at).toLocaleString("ru-RU")}
              </span>
            </div>
            <p className="text-sm whitespace-pre-wrap">{resp.message}</p>
            {resp.attachments.length > 0 && (
              <div className="space-y-1">
                {resp.attachments.map((att) => (
                  <button
                    key={att.id}
                    type="button"
                    onClick={() => handleDownload(att.id, att.filename)}
                    className="flex items-center gap-2 p-2 bg-secondary rounded-md text-sm hover:bg-secondary/80 transition-colors"
                  >
                    <Download className="h-4 w-4 text-muted-foreground" />
                    {att.filename}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
