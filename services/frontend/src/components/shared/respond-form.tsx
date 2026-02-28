import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { FileUpload } from "@/components/shared/file-upload";

interface RespondFormProps {
  onSubmit: (message: string, newStatus: string, files: File[]) => Promise<void>;
}

export function RespondForm({ onSubmit }: RespondFormProps) {
  const [message, setMessage] = useState("");
  const [newStatus, setNewStatus] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    setSending(true);
    try {
      await onSubmit(message, newStatus, files);
      setMessage("");
      setNewStatus("");
      setFiles([]);
    } catch {
      // error is handled by the parent via toast
    } finally {
      setSending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Отправить ответ</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="respond-message">Сообщение</Label>
            <Textarea
              id="respond-message"
              placeholder="Введите ответ студенту..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="respond-status">Изменить статус</Label>
            <Select value={newStatus || undefined} onValueChange={setNewStatus}>
              <SelectTrigger id="respond-status">
                <SelectValue placeholder="Без изменений" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="in_progress">В обработке</SelectItem>
                <SelectItem value="completed">Выполнено</SelectItem>
                <SelectItem value="rejected">Отклонено</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Прикрепить файлы</Label>
            <FileUpload files={files} onChange={setFiles} />
          </div>

          <Button
            type="submit"
            className="w-full gap-2"
            disabled={sending || !message.trim()}
          >
            <Send className="h-4 w-4" />
            {sending ? "Отправка..." : "Отправить ответ"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
