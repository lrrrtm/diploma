import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Download, MessageSquare, Send, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { PageHeader } from "@/components/shared/page-header";
import { StatusBadge } from "@/components/shared/status-badge";
import { FileUpload } from "@/components/shared/file-upload";
import api from "@/api/client";
import type { ApplicationDetail, ApplicationStatus } from "@/types";

export default function StaffApplicationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [application, setApplication] = useState<ApplicationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [newStatus, setNewStatus] = useState<string>("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);

  const fetchApplication = () => {
    api.get<ApplicationDetail>(`/applications/${id}`).then((res) => {
      setApplication(res.data);
      setLoading(false);
    });
  };

  useEffect(() => {
    fetchApplication();
  }, [id]);

  const handleRespond = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setSending(true);
    try {
      const formData = new FormData();
      formData.append("message", message);
      if (newStatus) {
        formData.append("new_status", newStatus);
      }
      files.forEach((file) => formData.append("files", file));

      await api.post(`/applications/${id}/respond`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      setMessage("");
      setNewStatus("");
      setFiles([]);
      fetchApplication();
    } catch (err) {
      console.error("Error responding:", err);
    } finally {
      setSending(false);
    }
  };

  if (loading || !application) {
    return (
      <div className="flex justify-center py-12">
        <p className="text-muted-foreground">Загрузка...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader
        title={`Заявка #${application.id}`}
        backTo="/staff"
        actions={<StatusBadge status={application.status} />}
      />

      <div className="space-y-6">
        {/* Application info */}
        <Card>
          <CardHeader>
            <CardTitle>{application.service_name}</CardTitle>
            <CardDescription>
              <span className="flex items-center gap-1">
                <User className="h-4 w-4" />
                {application.student_name} | Подана:{" "}
                {new Date(application.created_at).toLocaleString("ru-RU")}
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Form data */}
            {Object.keys(application.form_data).length > 0 && (
              <div className="space-y-2">
                <h3 className="font-medium text-sm">Данные заявки</h3>
                <div className="grid gap-2">
                  {Object.entries(application.form_data).map(([key, value]) => (
                    <div
                      key={key}
                      className="flex justify-between p-2 bg-secondary rounded-md text-sm"
                    >
                      <span className="text-muted-foreground">{key}</span>
                      <span className="font-medium">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Attachments */}
            {application.attachments.length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <h3 className="font-medium text-sm">Документы от студента</h3>
                  <div className="space-y-1">
                    {application.attachments.map((att) => (
                      <a
                        key={att.id}
                        href={`/uploads/${att.file_path}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 p-2 bg-secondary rounded-md text-sm hover:bg-secondary/80 transition-colors"
                      >
                        <Download className="h-4 w-4 text-muted-foreground" />
                        {att.filename}
                      </a>
                    ))}
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Previous responses */}
        {application.responses.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              История ответов ({application.responses.length})
            </h2>
            {application.responses.map((resp) => (
              <Card key={resp.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{resp.staff_name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(resp.created_at).toLocaleString("ru-RU")}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{resp.message}</p>
                  {resp.attachments.length > 0 && (
                    <div className="space-y-1">
                      {resp.attachments.map((att) => (
                        <a
                          key={att.id}
                          href={`/uploads/${att.file_path}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 p-2 bg-secondary rounded-md text-sm hover:bg-secondary/80 transition-colors"
                        >
                          <Download className="h-4 w-4 text-muted-foreground" />
                          {att.filename}
                        </a>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Respond form */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Отправить ответ</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleRespond} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="message">Сообщение</Label>
                <Textarea
                  id="message"
                  placeholder="Введите ответ студенту..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="status">Изменить статус</Label>
                <Select
                  id="status"
                  value={newStatus}
                  onChange={(e) => setNewStatus(e.target.value)}
                >
                  <option value="">Без изменений</option>
                  <option value="in_progress">В обработке</option>
                  <option value="completed">Выполнено</option>
                  <option value="rejected">Отклонено</option>
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
      </div>
    </div>
  );
}
